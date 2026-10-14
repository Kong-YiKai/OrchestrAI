"""Build product images; never starts production.

Each image is keyed by a hash of its build inputs. With --reuse REGISTRY, an image
already built and released from main for the same inputs is pulled instead of rebuilt
(tag `inputs-<hash>`), so a change to one service only rebuilds that service.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SERVICES = ['chat', 'ingestion', 'gateway', 'web', 'mongo', 'research']
# Tracked inputs per image. web embeds the chat client build, so it inherits chat's key.
INPUTS = {
    'chat': ['deploy/upstreams.json', 'scripts/prepare-upstreams.py', 'services/chat'],
    'ingestion': ['deploy/upstreams.json', 'scripts/prepare-upstreams.py', 'services/ingestion'],
    'gateway': ['services/gateway'],
    'web': ['services/web'],
    'mongo': ['services/mongo'],
    'research': ['services/research'],
}


def run(*arguments, check=True, quiet=False):
    return subprocess.run(list(arguments), cwd=ROOT, check=check,
                          **({'capture_output': True} if quiet else {})).returncode


def input_hashes():
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    hashes = {}
    for service in SERVICES:
        digest = hashlib.sha256()
        for name in sorted(n for n in tracked if any(n == p or n.startswith(p + '/') for p in INPUTS[service])):
            digest.update(name.encode() + b'\0' + (ROOT / name).read_bytes() + b'\0')
        if service == 'web':
            digest.update(hashes['chat'].encode())
        hashes[service] = digest.hexdigest()[:32]
    return hashes


def build(service):
    if service in {'chat', 'ingestion'}:
        run(sys.executable, 'scripts/prepare-upstreams.py', '--only', 'librechat' if service == 'chat' else 'rag')
    context = str(ROOT / '.build' / ('librechat' if service == 'chat' else 'rag')) if service in {'chat', 'ingestion'} else f'services/{service}'
    extra = ['--build-context', 'orchestrai=services/ingestion'] if service == 'ingestion' else (
        ['--build-context', 'client=docker-image://orchestrai/chat:local'] if service == 'web' else [])
    run('docker', 'build', *extra, '--build-arg', 'BUILD_REVISION=' + os.getenv('BUILD_REVISION', 'local'),
        '-f', f'services/{service}/Dockerfile', '-t', f'orchestrai/{service}:local', context)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--service', choices=SERVICES + ['all'], default='all')
    parser.add_argument('--reuse', metavar='REGISTRY', help='e.g. ghcr.io/owner/repo; pull unchanged images')
    parser.add_argument('--hashes', action='store_true', help='print input hashes as JSON and exit')
    args = parser.parse_args()
    hashes = input_hashes()
    if args.hashes:
        print(json.dumps(hashes))
        return
    report = {}
    for service in SERVICES:
        if args.service not in {'all', service}:
            continue
        if args.reuse:
            image = f'{args.reuse}/{service}:inputs-{hashes[service]}'
            if run('docker', 'pull', '-q', image, check=False, quiet=True) == 0:
                run('docker', 'tag', image, f'orchestrai/{service}:local')
                report[service] = 'reused ' + hashes[service]
                continue
        build(service)
        report[service] = 'built ' + hashes[service]
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
