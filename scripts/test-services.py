"""Isolated Linux integration, HTTP smoke, restart and SQL restore rehearsal."""
import os
import pathlib
import secrets
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENV = ROOT / 'deploy/.env.test'
ARTIFACTS = ROOT / '.artifacts'
PROJECT = 'orchestrai-r2-test'

def run(*args, **kwargs):
    return subprocess.run(args, cwd=ROOT, check=True, **kwargs)

def compose(*args, **kwargs):
    return run('docker', 'compose', '--env-file', str(ENV), '-f', 'deploy/compose.yml', '-p', PROJECT, *args, **kwargs)

def main():
    ARTIFACTS.mkdir(exist_ok=True)
    if not ENV.exists():
        ENV.write_text(''.join(f'{key}={secrets.token_hex(32)}\n' for key in
            ['POSTGRES_PASSWORD', 'WORKFLOW_DB_PASSWORD', 'REDIS_PASSWORD', 'DELEGATION_SECRET']), encoding='utf-8')
        os.chmod(ENV, 0o600)
    revision = os.environ.get('BUILD_REVISION', 'local')
    for service in ('postgres', 'redis'):
        run('docker', 'build', '-f', 'deploy/infrastructure.Dockerfile', '--target', service, '-t', f'orchestrai/{service}:local', 'deploy')
    run('docker', 'build', '--build-arg', f'BUILD_REVISION={revision}', '--target', 'test', '-t', 'orchestrai/workflow-test:local', 'services/workflow')
    run('docker', 'build', '--build-arg', f'BUILD_REVISION={revision}', '--target', 'runtime', '-t', 'orchestrai/workflow:local', 'services/workflow')
    try:
        compose('up', '-d', '--wait', 'postgres', 'redis')
        compose('run', '--rm', 'tests')
        compose('run', '--rm', 'migrate')
        compose('up', '-d', '--wait', 'workflow-api', 'workflow-worker')
        compose('run', '--rm', 'smoke')
        compose('restart', 'workflow-api', 'workflow-worker')
        compose('up', '-d', '--wait', 'workflow-api', 'workflow-worker')
        compose('run', '--rm', 'smoke')
        compose('stop', 'workflow-api', 'workflow-worker')
        dump = ARTIFACTS / 'workflow-test.dump'
        with dump.open('wb') as output:
            compose('exec', '-T', 'postgres', 'pg_dump', '-U', 'postgres', '-d', 'workflow', '-Fc', stdout=output)
        target = 'restore_' + secrets.token_hex(6)
        compose('exec', '-T', 'postgres', 'createdb', '-U', 'postgres', target)
        try:
            with dump.open('rb') as source:
                compose('exec', '-T', 'postgres', 'pg_restore', '-U', 'postgres', '-d', target, '--exit-on-error', stdin=source)
            query = "SELECT count(*) || ':' || md5(coalesce(string_agg(row_to_json(r)::text, '' ORDER BY id), '')) FROM team_projects r"
            def fingerprint(db):
                return compose('exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', db, '-Atc', query, capture_output=True).stdout
            assert fingerprint('workflow') == fingerprint(target), 'restored rows differ'
            for table, order in [('team_runs','id'), ('team_events','seq'), ('team_files','id'), ('team_checkpoints','key')]:
                query = f"SELECT count(*) || ':' || md5(coalesce(string_agg(row_to_json(r)::text, '' ORDER BY {order}), '')) FROM {table} r"
                assert fingerprint('workflow') == fingerprint(target), f'restored {table} differ'
            print('Restore verified: projects, runs, events, files and checkpoints match exactly.')
        finally:
            compose('exec', '-T', 'postgres', 'dropdb', '-U', 'postgres', target)
    finally:
        compose('down')  # This project only; retain volumes for diagnosis.

if __name__ == '__main__':
    main()
