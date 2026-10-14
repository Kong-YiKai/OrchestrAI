"""Reviewable repository hygiene gate; never removes files automatically."""
import argparse
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base')
    args = parser.parse_args()
    files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    errors = []
    total = 0
    for name in filter(None, files):
        path = ROOT / name
        if not path.is_file():
            continue
        total += path.stat().st_size
        parts = pathlib.PurePosixPath(name).parts
        if set(parts) & {'node_modules', 'venv', '.venv', '.next', '__pycache__', '.build', '.artifacts'}:
            errors.append(f'generated/dependency file tracked: {name}')
        if (path.name.startswith('.env') and path.name != '.env.example') or path.suffix in {'.pem', '.key'}:
            errors.append(f'private configuration tracked: {name}')
        if path.stat().st_size > 2 * 1024 * 1024 and not path.name.endswith('lock.json'):
            errors.append(f'oversized source asset requires review: {name}')
        if path.stat().st_size < 2 * 1024 * 1024 and path.suffix in {'.py', '.mjs', '.ts', '.tsx', '.yml', '.yaml', '.json', '.sh', '.md'}:
            source = path.read_text(encoding='utf-8', errors='replace')
            if re.search(r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----', source):
                errors.append(f'private key material: {name}')
    documents = sorted(p.name for p in (ROOT / 'Documents').iterdir() if p.is_file())
    if documents != ['phase-history-and-handoff.md', 'project-overview.md']:
        errors.append('Documents must contain only project-overview.md and phase-history-and-handoff.md')
    overview = ROOT / 'Documents/project-overview.md'
    if overview.stat().st_size > 40 * 1024:
        errors.append('project-overview.md exceeds 40 KiB: move history to phase-history-and-handoff.md')
    if args.base:
        changed = subprocess.check_output(['git', 'diff', '--name-only', f'{args.base}...HEAD'], cwd=ROOT).decode().splitlines()
        if any(n.startswith(('services/', 'deploy/')) for n in changed) and not any(n.startswith('Documents/') for n in changed):
            print('note: service/deploy change without a Documents update; update docs if status or architecture changed')
    print(f'Non-ignored source bytes (tracked + pending): {total}; hygiene findings: {len(errors)}')
    for error in errors:
        print(error, file=sys.stderr)
    return bool(errors)

if __name__ == '__main__':
    sys.exit(main())
