"""Root-owned deployment controller. SSH accepts a bounded JSON manifest on stdin.

Install only from reviewed source, outside the deploy user's writable directories.
No caller-selected commands, Compose files, environment files, or backup targets.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback

ROOT = Path('/opt/orchestrai')

def digest_stream(source):
    digest = hashlib.sha256()
    for chunk in iter(lambda: source.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()

def config_digest(directory, schema=1):
    digest = hashlib.sha256()
    names = ['compose.yml', 'postgres-init.sh', 'infrastructure.Dockerfile', 'release.py']
    if schema >= 2:
        names += ['compose.product.yml', 'ingestion-init.sh', 'mongo-init.js', 'librechat.yaml']
    if schema == 3:
        names += ['compose.research.yml', 'research-init.sh']
    for name in names:
        digest.update(name.encode() + b'\0' + (directory / name).read_bytes())
    if schema >= 2:
        digest.update((directory.parent / 'scripts/test-product.py').read_bytes())
    return digest.hexdigest()

def validate(manifest, policy, current, expected_config):
    fields = {'revision', 'image', 'postgres_image', 'redis_image', 'sequence', 'schema', 'config_digest'}
    if manifest.get('schema', 0) >= 2:
        fields |= {service+'_image' for service in ('chat','ingestion','gateway','web','mongo')}
    if manifest.get('schema') == 3:
        fields.add('research_image')
    if set(manifest) != fields:
        raise ValueError('unexpected release fields')
    if not re.fullmatch(r'[a-f0-9]{40}', manifest['revision']):
        raise ValueError('invalid revision')
    if not re.fullmatch(re.escape(policy['image_repository']) + r'@sha256:[a-f0-9]{64}', manifest['image']):
        raise ValueError('only the configured immutable image is allowed')
    for service in ('postgres','redis') + (('chat','ingestion','gateway','web','mongo') if manifest['schema'] >= 2 else ()) + (('research',) if manifest['schema'] == 3 else ()):
        repository = policy['image_repository'].rsplit('/',1)[0] + '/' + service
        if not re.fullmatch(re.escape(repository) + r'@sha256:[a-f0-9]{64}', manifest[service+'_image']):
            raise ValueError('invalid infrastructure image')
    if type(manifest['sequence']) is not int or manifest['sequence'] <= 0:
        raise ValueError('invalid sequence')
    if current and manifest['sequence'] <= current['sequence']:
        raise ValueError('stale release refused')
    if type(manifest['schema']) is not int or manifest['schema'] not in (1, 2, 3) or manifest['config_digest'] != expected_config:
        raise ValueError('controller/config/schema update requires reviewed installation')

class Deployment:
    def __init__(self, root=ROOT):
        self.root = root
        self.env = {'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOME':'/root'}

    def command(self, manifest, *args):
        command = ['docker','compose','--env-file',str(self.root / 'secrets/production.env'),
            '-f',str(self.root / 'deploy/compose.yml')]
        if manifest['schema'] >= 2:
            command += ['-f',str(self.root / 'deploy/compose.product.yml')]
        if manifest['schema'] == 3:
            command += ['-f',str(self.root / 'deploy/compose.research.yml')]
        return command + ['-p','orchestrai-production',*args]

    def compose_env(self, manifest):
        env = dict(self.env, WORKFLOW_IMAGE=manifest['image'], POSTGRES_IMAGE=manifest['postgres_image'], REDIS_IMAGE=manifest['redis_image'])
        if manifest['schema'] >= 2:
            env.update({service.upper()+'_IMAGE':manifest[service+'_image'] for service in ('chat','ingestion','gateway','web','mongo')})
        if manifest['schema'] == 3:
            env['RESEARCH_IMAGE'] = manifest['research_image']
        return env

    def compose(self, manifest, *args, **kwargs):
        return subprocess.run(self.command(manifest,*args), check=True,
            env=self.compose_env(manifest), timeout=600, **kwargs)

    @staticmethod
    def writers(manifest):
        return (['web','chat','ingestion','gateway'] if manifest['schema'] >= 2 else []) + (['research'] if manifest['schema'] == 3 else []) + ['workflow-api','workflow-worker']

    def backup(self, manifest, policy, name=None):
        if manifest['schema'] >= 2:
            return self.product_backup(manifest,policy,name)
        backup = self.root / 'backups' / (name or f"{manifest['sequence']}-{manifest['revision']}.dump.age")
        backup.parent.mkdir(mode=0o700, exist_ok=True)
        # Pipe pg_dump to age; no plaintext backup is written on the host.
        dump = subprocess.Popen(['docker','compose','--env-file',str(self.root / 'secrets/production.env'),
            '-f',str(self.root / 'deploy/compose.yml'),'-p','orchestrai-production',
            'exec','-T','postgres','pg_dump','-U','postgres','-d','workflow','-Fc'],
            stdout=subprocess.PIPE, env=dict(self.env,WORKFLOW_IMAGE=manifest['image'],POSTGRES_IMAGE=manifest['postgres_image'],REDIS_IMAGE=manifest['redis_image']))
        try:
            with backup.open('wb') as output:
                subprocess.run(['age','-r',policy['age_recipient']],stdin=dump.stdout,stdout=output,check=True,timeout=300,env=self.env)
            dump.stdout.close()
            if dump.wait(timeout=60) != 0 or backup.stat().st_size < 128:
                raise RuntimeError('database backup failed')
        finally:
            if dump.poll() is None:
                dump.kill(); dump.wait()
        target = policy['backup_remote'].rstrip('/') + '/' + backup.name
        subprocess.run(['rclone','--config',str(self.root / 'secrets/rclone.conf'),'copyto',str(backup),target],check=True,timeout=300,env=self.env)
        # Read back and compare the encrypted bytes without needing the recovery key.
        reader = subprocess.Popen(['rclone','--config',str(self.root / 'secrets/rclone.conf'),'cat',target],stdout=subprocess.PIPE,env=self.env)
        try:
            remote_hash = digest_stream(reader.stdout)
            if reader.wait(timeout=300) != 0:
                raise RuntimeError('backup readback failed')
        finally:
            reader.stdout.close()
            if reader.poll() is None:
                reader.kill(); reader.wait()
        with backup.open('rb') as source:
            if remote_hash != digest_stream(source):
                raise RuntimeError('backup readback mismatch')
        return {'object':target, 'sha256':remote_hash}

    def product_backup(self, manifest, policy, name=None):
        """Caller must quiesce all writers. Each part streams directly into age.

        Upload the completion manifest last; missing parts are never a snapshot.
        Redis is disposable queue/cache rebuilt from SQL, not a second source.
        """
        prefix = name or f"{manifest['sequence']}-{manifest['revision']}.dump.age"
        parts = {
            'workflow.dump': ['exec','-T','postgres','pg_dump','-U','postgres','-d','workflow','-Fc'],
            'ingestion.dump': ['exec','-T','postgres','pg_dump','-U','postgres','-d','ingestion','-Fc'],
            'chat.archive': ['exec','-T','mongo','bash','-ec',
                'printf \'password: "%s"\\n\' "$MONGO_INITDB_ROOT_PASSWORD" | mongodump --config=/dev/stdin --username=admin --authenticationDatabase=admin --db=orchestrai --archive'],
            'attachments.tar.gz': ['run','--rm','--no-deps','--entrypoint','tar','chat','-C','/app/uploads','-czf','-','.'],
            'images.tar.gz': ['run','--rm','--no-deps','--entrypoint','tar','chat','-C','/app/client/public/images','-czf','-','.'],
            'budget.sqlite': ['run','--rm','--no-deps','--entrypoint','python','gateway','-c',
                'import sqlite3,sys; db=sqlite3.connect("file:/data/budget.sqlite?mode=ro",uri=True); sys.stdout.buffer.write(db.serialize()); db.close()'],
        }
        if manifest['schema'] == 3:
            parts['research.dump'] = ['exec','-T','postgres','pg_dump','-U','postgres','-d','research','-Fc']
        results = {}
        directory = self.root / 'backups'
        directory.mkdir(mode=0o700,exist_ok=True)
        for part, arguments in parts.items():
            path = directory / (prefix+'.'+part+'.age')
            producer = subprocess.Popen(self.command(manifest,*arguments),stdout=subprocess.PIPE,
                env=self.compose_env(manifest),stderr=subprocess.DEVNULL)
            try:
                with path.open('wb') as output:
                    subprocess.run(['age','-r',policy['age_recipient']],stdin=producer.stdout,
                        stdout=output,check=True,timeout=600,env=self.env)
                producer.stdout.close()
                if producer.wait(timeout=60) != 0 or path.stat().st_size < 128:
                    raise RuntimeError('snapshot part failed')
            finally:
                if producer.poll() is None:
                    producer.kill(); producer.wait()
            results[part] = self.upload_verified(path,policy)
        receipt = dict(format=2, revision=manifest['revision'],parts=results,
            consistency='all-writers-stopped',created_at=int(time.time()))
        path = directory / (prefix+'.snapshot.json')
        path.write_text(json.dumps(receipt,indent=2))
        return dict(self.upload_verified(path,policy),format=2,parts=len(results))

    def upload_verified(self, path, policy):
        target = policy['backup_remote'].rstrip('/')+'/'+path.name
        command = ['rclone','--config',str(self.root / 'secrets/rclone.conf')]
        subprocess.run(command+['copyto',str(path),target],check=True,timeout=600,env=self.env)
        reader = subprocess.Popen(command+['cat',target],stdout=subprocess.PIPE,env=self.env)
        try:
            remote_hash = digest_stream(reader.stdout)
            if reader.wait(timeout=300) != 0:
                raise RuntimeError('backup readback failed')
        finally:
            reader.stdout.close()
            if reader.poll() is None:
                reader.kill(); reader.wait()
        with path.open('rb') as source:
            if remote_hash != digest_stream(source):
                raise RuntimeError('backup readback mismatch')
        return dict(object=target,sha256=remote_hash)

    def daily_backup(self, manifest, policy):
        name = time.strftime('daily-%Y%m%dT%H%M%SZ.dump.age', time.gmtime())
        self.compose(manifest,'stop','-t','45',*self.writers(manifest))
        try:
            result = self.backup(manifest, policy, name)
        finally:
            self.compose(manifest,'up','-d','--no-deps','--wait',*reversed(self.writers(manifest)))
        (self.root / 'state/last-backup.json').write_text(json.dumps(dict(result, finished_at=int(time.time()))))
        # Expire only our daily objects in this service's prefix after 35 days.
        # Release and rollback snapshots are not affected.
        remote = policy['backup_remote'].rstrip('/')
        names = subprocess.check_output(['rclone','--config',str(self.root / 'secrets/rclone.conf'),
            'lsf',remote,'--files-only','--max-depth','1'],text=True,timeout=300,env=self.env).splitlines()
        for candidate in names:
            if not re.fullmatch(r'daily-[0-9]{8}T[0-9]{6}Z\.dump\.age(?:\.(?:workflow\.dump|ingestion\.dump|research\.dump|chat\.archive|attachments\.tar\.gz|images\.tar\.gz|budget\.sqlite)\.age|\.snapshot\.json)?', candidate):
                continue
            from datetime import datetime, timezone
            created = datetime.strptime(candidate[:22], 'daily-%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc).timestamp()
            if created < time.time() - 35 * 86400:
                subprocess.run(['rclone','--config',str(self.root / 'secrets/rclone.conf'),
                    'deletefile',remote+'/'+candidate],check=True,timeout=300,env=self.env)
                (self.root / 'backups' / candidate).unlink(missing_ok=True)
        print(json.dumps({'backup':'verified','retention_days':35}))

    def activate(self, manifest):
        self.compose(manifest,'up','-d','--no-deps','--wait','--wait-timeout','120',*reversed(self.writers(manifest)))
        self.compose(manifest,'run','--rm','smoke')
        if manifest['schema'] >= 2:
            subprocess.run([sys.executable,str(self.root/'scripts/test-product.py'),
                '--env-file',str(self.root/'secrets/production.env'),'--project','orchestrai-production',
                '--url','http://127.0.0.1:3088'] + (['--research'] if manifest['schema']==3 else []),
                cwd=self.root,check=True,timeout=120,env=self.compose_env(manifest))
        if manifest['schema'] == 3:
            status = subprocess.check_output(['curl','--silent','--show-error','--fail',
                '--connect-timeout','5','--max-time','20','--output','/dev/null','--write-out','%{http_code}',
                'https://orchestrai.elysiumgrid.space/login'],text=True,timeout=25,env=self.env).strip()
            if status != '200':
                raise RuntimeError('public_https_smoke_failed')

    def release(self, manifest, policy, current):
        record = dict(manifest, started_at=int(time.time()), previous=current, outcome='failed')
        stopped = False
        try:
            services = ['workflow-api','postgres','redis'] + (['mongo','chat','ingestion','gateway','web'] if manifest['schema']>=2 else []) + (['research'] if manifest['schema']==3 else [])
            self.compose(manifest,'pull',*services)
            label = subprocess.check_output(['docker','image','inspect',manifest['image'],'--format',
                '{{index .Config.Labels "org.opencontainers.image.revision"}}'],env=self.env,text=True).strip()
            if label != manifest['revision']:
                raise ValueError('image revision differs from tested revision')
            for service in (('chat','ingestion','gateway','web','mongo') if manifest['schema']>=2 else ()) + (('research',) if manifest['schema']==3 else ()):
                label = subprocess.check_output(['docker','image','inspect',manifest[service+'_image'],'--format',
                    '{{index .Config.Labels "org.opencontainers.image.revision"}}'],env=self.env,text=True).strip()
                if label != manifest['revision']:
                    raise ValueError('product image revision differs from tested revision')
            if current:
                self.compose(current,'stop','-t','45',*self.writers(current))
                stopped = True
                record['backup'] = self.backup(current,policy)
            else:
                self.compose(manifest,'up','-d','--wait','postgres','redis')
                self.compose(manifest,'stop','-t','45','workflow-api','workflow-worker')
                stopped = True
                # First install has no chat/index/file/budget stores yet. Back up
                # the initialized workflow database before its first migration.
                record['backup'] = self.backup(dict(manifest,schema=1),policy)
            self.compose(manifest,'up','-d','--wait','postgres','redis')
            self.compose(manifest,'run','--rm','migrate')
            if manifest['schema'] >= 2:
                self.compose(manifest,'up','-d','--wait','mongo')
                self.compose(manifest,'exec','-T','postgres','bash','/opt/ingestion-init.sh')
                for migration in ('ingestion-migrate','gateway-migrate'):
                    self.compose(manifest,'run','--rm',migration)
            if manifest['schema'] == 3:
                self.compose(manifest,'exec','-T','postgres','bash','/opt/research-init.sh')
                self.compose(manifest,'run','--rm','research-migrate')
            self.activate(manifest)
            record['outcome'] = 'deployed'
            temporary = self.root / 'state/current.tmp'
            temporary.write_text(json.dumps(manifest))
            temporary.replace(self.root / 'state/current.json')
        except Exception:
            if stopped:
                if current:
                    # Roll back applications only; storage images/schema remain upgraded.
                    try:
                        if manifest['schema']==3 and current['schema']<3:
                            self.compose(manifest,'stop','research')
                        if manifest['schema']>=2 and current['schema']==1:
                            self.compose(manifest,'stop','web','chat','ingestion','gateway')
                        self.activate(current)
                        record['outcome'] = 'rolled_back'
                    except Exception:
                        record['outcome'] = 'rollback_failed'
                else:
                    self.compose(manifest,'stop',*self.writers(manifest))
            raise
        finally:
            record['finished_at'] = int(time.time())
            (self.root / f"state/release-{manifest['sequence']}.json").write_text(json.dumps(record,indent=2))
            print(json.dumps({'release':manifest['sequence'], 'outcome':record['outcome']}))

def main():
    import fcntl  # Production controller runs on Linux only.
    if os.geteuid() != 0:
        raise RuntimeError('use the installed root-owned forced command')
    os.umask(0o077)
    daily = sys.argv[1:] == ['--backup']
    if sys.argv[1:] and not daily:
        raise ValueError('invalid controller arguments')
    if not daily:
        data = sys.stdin.buffer.read(16385)
        if len(data) > 16384:
            raise ValueError('manifest too large')
        request = json.loads(data)
        if set(request) != {'manifest', 'registry_username', 'registry_token'}:
            raise ValueError('invalid deployment request')
        manifest = request['manifest']
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', request['registry_username']):
            raise ValueError('invalid registry identity')
    policy = json.loads((ROOT / 'secrets/deployment.json').read_text())
    if policy.get('backup_storage_verified') is not True:
        raise ValueError('verify encrypted offsite storage before enabling deployment')
    for binary in ('docker','age','rclone'):
        if not shutil.which(binary):
            raise RuntimeError(f'missing {binary}')
    if shutil.disk_usage(ROOT).free < 3 * 1024**3:
        raise RuntimeError('at least 3 GiB free disk required')
    state = ROOT / 'state'
    state.mkdir(mode=0o700,exist_ok=True)
    with (state / 'release.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        current_path = state / 'current.json'
        current = json.loads(current_path.read_text()) if current_path.exists() else None
        if daily:
            if current:
                Deployment().daily_backup(current,policy)
            return
        validate(manifest,policy,current,config_digest(ROOT / 'deploy',manifest.get('schema',1)))
        # The repo-scoped Actions token expires after this job. Never install a
        # developer's persistent token or leave registry credentials on the host.
        with tempfile.TemporaryDirectory(prefix='registry-',dir=state) as auth:
            deployment = Deployment()
            deployment.env['DOCKER_CONFIG'] = auth
            subprocess.run(['docker','login','ghcr.io','--username',request['registry_username'],'--password-stdin'],
                input=request['registry_token'],text=True,capture_output=True,check=True,timeout=30,env=deployment.env)
            deployment.release(manifest,policy,current)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No command arguments, environment, or backup credentials in CI logs.
        if ROOT.exists() and os.geteuid() == 0:
            (ROOT / 'state/controller-error.log').write_text(traceback.format_exc())
        print(f'Deployment failed ({type(error).__name__}); inspect restricted host logs.',file=sys.stderr)
        sys.exit(1)
