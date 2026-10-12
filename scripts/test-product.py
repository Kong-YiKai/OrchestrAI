"""Candidate startup and deterministic auth/upload/workflow smoke; no paid models."""
import argparse
import json
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', type=Path, default=ROOT / 'deploy/private/product.env')
    parser.add_argument('--project', default='orchestrai-r3')
    parser.add_argument('--start', action='store_true')
    parser.add_argument('--research', action='store_true', help='Schema 3 research health/auth only, no provider calls')
    parser.add_argument('--url', default='http://localhost:3088')
    args = parser.parse_args()
    if (not args.project.startswith('orchestrai-r3') and args.project != 'orchestrai-production') or not args.env_file.exists():
        raise ValueError('explicit R3 project and existing private env required')
    command = ['docker', 'compose', '--env-file', str(args.env_file), '-f', 'deploy/compose.yml',
               '-f', 'deploy/compose.product.yml']
    if args.research:
        command += ['-f', 'deploy/compose.research.yml']
    command += ['-p', args.project]

    def compose(*arguments, **kwargs):
        return subprocess.run(command + list(arguments), cwd=ROOT, check=True, **kwargs)

    if args.start:
        compose('up', '-d', '--wait', 'postgres', 'redis', 'mongo')
        compose('exec', '-T', 'postgres', 'bash', '/opt/ingestion-init.sh')
        for migration in ['migrate', 'ingestion-migrate', 'gateway-migrate']:
            compose('run', '--rm', migration)
        if args.research:
            compose('exec', '-T', 'postgres', 'bash', '/opt/research-init.sh')
            compose('run', '--rm', 'research-migrate')
        compose('up', '-d', '--wait', 'gateway', 'ingestion', 'workflow-api', 'workflow-worker', 'chat', 'web')
        if args.research:
            compose('up', '-d', '--wait', 'research')

    account_path = ROOT / 'deploy/private/candidate-account.json'
    if account_path.exists():
        account = json.loads(account_path.read_text(encoding='utf-8'))
    else:
        account = {'email': 'r3-smoke@example.test', 'password': secrets.token_urlsafe(24)}
        result = compose('exec', '-T', 'chat', 'node', 'config/create-user.js', account['email'],
                         'OrchestrAI', 'r3-smoke', '--email-verified=true',
                         input=(account['password'] + '\n').encode(), capture_output=True)
        if b'User created successfully' not in result.stdout:
            raise RuntimeError('account bootstrap failed; output withheld')
        account_path.parent.mkdir(parents=True, exist_ok=True)
        account_path.write_text(json.dumps(account, indent=2) + '\n', encoding='utf-8')
        if __import__('os').name != 'nt':
            account_path.chmod(0o600)

    token = None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path, method='GET', data=None, authenticated=True, content_type='application/json', headers=None):
        headers = dict(headers or {}, **{'Content-Type': content_type,
            'User-Agent': 'Mozilla/5.0 OrchestrAI-Candidate-Smoke Chrome/140.0.0.0',
            'Accept': 'application/json'})
        if authenticated and token:
            headers['Authorization'] = 'Bearer ' + token
        if data is not None and not isinstance(data, bytes):
            data = json.dumps(data).encode()
        req = urllib.request.Request(args.url.rstrip('/') + path, data=data, method=method, headers=headers)
        try:
            with opener.open(req, timeout=30) as response:
                body = response.read()
                if body and 'application/json' not in response.headers.get('Content-Type', ''):
                    raise RuntimeError(f'Unexpected smoke response: {response.status}, '
                                       f'{response.headers.get("Content-Type")}, {response.url}')
                return response.status, json.loads(body) if body else None
        except urllib.error.HTTPError as error:
            return error.code, None

    status, _ = request('/api/convos', authenticated=False)
    assert status == 401, 'anonymous conversation access'
    status, login = request('/api/auth/login', 'POST', account, authenticated=False)
    assert status == 200 and login.get('token'), 'login failed'
    token = login['token']
    status, _ = request('/api/convos')
    assert status == 200, 'authenticated conversation list'
    if args.research:
        status, _ = request('/api/research/queries', authenticated=False)
        assert status == 401, 'anonymous research access'
        status, research_list = request('/api/research/queries')
        assert status == 200 and isinstance(research_list.get('queries'), list), 'research identity delegation'
        status, _ = request('/api/research/queries/' + str(uuid.uuid4()))
        assert status == 404, 'research absent/foreign resource hiding'
        status, _ = request('/api/research/queries', 'POST', {'query': ''}, headers={'Idempotency-Key': uuid.uuid4().hex})
        assert status == 400, 'research invalid request rejected before any provider call'

    boundary = 'orchestrai-' + uuid.uuid4().hex
    body = b''
    for key, value in {'file_id': str(uuid.uuid4()), 'endpoint': 'DeepSeek', 'endpointType': 'custom',
                       'tool_resource': 'context', 'message_file': 'true'}.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="smoke.txt"\r\n'
             f'Content-Type: text/plain\r\n\r\nORCH-R3-FILE-7142\r\n--{boundary}--\r\n').encode()
    status, uploaded = request('/api/files', 'POST', body,
                               content_type='multipart/form-data; boundary=' + boundary)
    assert status == 200 and uploaded, 'TXT upload failed'

    status, run = request('/api/workflow/runs', 'POST', {'text': 'R3 authenticated chat delegation smoke'},
                          headers={'Idempotency-Key': 'r3-smoke-' + uuid.uuid4().hex})
    assert status == 202 and run.get('id'), 'chat delegation admission'
    path = '/api/workflow/runs/' + run['id']
    for _ in range(30):
        status, run = request(path)
        if run.get('status') == 'waiting':
            break
        time.sleep(0.2)
    assert status == 200 and run['status'] == 'waiting', 'workflow approval interrupt'
    status, _ = request(path + '/approval', 'POST', {'version': run['approval_version'], 'approve': True})
    assert status == 200, 'approval delegation'
    for _ in range(30):
        status, run = request(path)
        if run.get('status') == 'completed':
            break
        time.sleep(0.2)
    status, artifact = request(path + '/artifact')
    assert status == 200 and artifact.get('sha256'), 'real workflow artifact'
    print('Candidate smoke passed: auth, TXT upload, verified chat identity -> approval -> real artifact.')
    print('No model calls. Candidate account is in ignored deploy/private/candidate-account.json.')


if __name__ == '__main__':
    main()
