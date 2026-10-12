"""Build the fixed upstream product and owned services; never starts production."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(*arguments):
    subprocess.run(list(arguments), cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--service', choices=['chat', 'ingestion', 'gateway', 'web', 'all'], default='all')
    args = parser.parse_args()
    if args.service in {'chat', 'ingestion', 'all'}:
        run(sys.executable, 'scripts/prepare-upstreams.py')
    for service in ['chat', 'ingestion', 'gateway', 'web']:
        if args.service not in {'all', service}:
            continue
        upstream = 'librechat' if service == 'chat' else 'rag'
        context = str(ROOT / '.build' / upstream) if service in {'chat', 'ingestion'} else f'services/{service}'
        extra = ['--build-context', 'orchestrai=services/ingestion'] if service == 'ingestion' else (
            ['--build-context', 'client=docker-image://orchestrai/chat:local'] if service == 'web' else [])
        run('docker', 'build', *extra, '--build-arg', 'BUILD_REVISION=' + os.getenv('BUILD_REVISION', 'local'),
            '-f', f'services/{service}/Dockerfile', '-t', f'orchestrai/{service}:local', context)


if __name__ == '__main__':
    main()
