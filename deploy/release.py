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
import time

ROOT = Path('/opt/orchestrai')

def config_digest(directory):
    digest = hashlib.sha256()
    for name in ('compose.yml', 'postgres-init.sh', 'infrastructure.Dockerfile', 'release.py'):
        digest.update(name.encode() + b'\0' + (directory / name).read_bytes())
    return digest.hexdigest()

def validate(manifest, policy, current, expected_config):
    if set(manifest) != {'revision', 'image', 'postgres_image', 'redis_image', 'sequence', 'schema', 'config_digest'}:
        raise ValueError('unexpected release fields')
    if not re.fullmatch(r'[a-f0-9]{40}', manifest['revision']):
        raise ValueError('invalid revision')
    if not re.fullmatch(re.escape(policy['image_repository']) + r'@sha256:[a-f0-9]{64}', manifest['image']):
        raise ValueError('only the configured immutable image is allowed')
    for service in ('postgres','redis'):
        repository = policy['image_repository'].rsplit('/',1)[0] + '/' + service
        if not re.fullmatch(re.escape(repository) + r'@sha256:[a-f0-9]{64}', manifest[service+'_image']):
            raise ValueError('invalid infrastructure image')
    if type(manifest['sequence']) is not int or manifest['sequence'] <= 0:
        raise ValueError('invalid sequence')
    if current and manifest['sequence'] <= current['sequence']:
        raise ValueError('stale release refused')
    if manifest['schema'] != 1 or manifest['config_digest'] != expected_config:
        raise ValueError('controller/config/schema update requires reviewed installation')

class Deployment:
    def __init__(self, root=ROOT):
        self.root = root
        self.env = {'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOME':'/root'}

    def compose(self, manifest, *args, **kwargs):
        env = dict(self.env, WORKFLOW_IMAGE=manifest['image'], POSTGRES_IMAGE=manifest['postgres_image'], REDIS_IMAGE=manifest['redis_image'])
        return subprocess.run(['docker','compose','--env-file',str(self.root / 'secrets/production.env'),
            '-f',str(self.root / 'deploy/compose.yml'),'-p','orchestrai-production',*args],
            check=True, env=env, timeout=600, **kwargs)

    def backup(self, manifest, policy):
        backup = self.root / 'backups' / f"{manifest['sequence']}-{manifest['revision']}.dump.age"
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
            remote_hash = hashlib.file_digest(reader.stdout,'sha256').hexdigest()
            if reader.wait(timeout=300) != 0:
                raise RuntimeError('backup readback failed')
        finally:
            reader.stdout.close()
            if reader.poll() is None:
                reader.kill(); reader.wait()
        with backup.open('rb') as source:
            if remote_hash != hashlib.file_digest(source,'sha256').hexdigest():
                raise RuntimeError('backup readback mismatch')
        return {'object':target, 'sha256':remote_hash}

    def activate(self, manifest):
        self.compose(manifest,'up','-d','--no-deps','--wait','--wait-timeout','90','workflow-api','workflow-worker')
        self.compose(manifest,'run','--rm','smoke')

    def release(self, manifest, policy, current):
        record = dict(manifest, started_at=int(time.time()), previous=current, outcome='failed')
        stopped = False
        try:
            self.compose(manifest,'pull','workflow-api','postgres','redis')
            label = subprocess.check_output(['docker','image','inspect',manifest['image'],'--format',
                '{{index .Config.Labels "org.opencontainers.image.revision"}}'],env=self.env,text=True).strip()
            if label != manifest['revision']:
                raise ValueError('image revision differs from tested revision')
            if current:
                self.compose(current,'stop','-t','45','workflow-api','workflow-worker')
                stopped = True
                record['backup'] = self.backup(manifest,policy)
            else:
                self.compose(manifest,'up','-d','--wait','postgres','redis')
                self.compose(manifest,'stop','-t','45','workflow-api','workflow-worker')
                stopped = True
                record['backup'] = self.backup(manifest,policy)
            self.compose(manifest,'up','-d','--wait','postgres','redis')
            self.compose(manifest,'run','--rm','migrate')
            self.activate(manifest)
            record['outcome'] = 'deployed'
            temporary = self.root / 'state/current.tmp'
            temporary.write_text(json.dumps(manifest))
            temporary.replace(self.root / 'state/current.json')
        except Exception:
            if stopped:
                if current:
                    # Only schema 1 accepted: never downgrade a database automatically.
                    try:
                        self.activate(current)
                        record['outcome'] = 'rolled_back'
                    except Exception:
                        record['outcome'] = 'rollback_failed'
                else:
                    self.compose(manifest,'stop','workflow-api','workflow-worker')
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
    data = sys.stdin.buffer.read(4097)
    if len(data) > 4096:
        raise ValueError('manifest too large')
    manifest = json.loads(data)
    policy = json.loads((ROOT / 'secrets/deployment.json').read_text())
    if not policy.get('restore_drill_verified'):
        raise ValueError('verify encrypted offsite restore before enabling deployment')
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
        validate(manifest,policy,current,config_digest(ROOT / 'deploy'))
        Deployment().release(manifest,policy,current)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # No command arguments, environment, or backup credentials in CI logs.
        print(f'Deployment failed ({type(error).__name__}); inspect restricted host logs.',file=sys.stderr)
        sys.exit(1)
