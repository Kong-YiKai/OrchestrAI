"""Verified upstream source + tracked UI patch; generated sources stay outside Git."""
import argparse
import hashlib
import json
import pathlib
import subprocess
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cache', type=pathlib.Path, help='Directory with librechat-source.zip and rag-source.zip')
    args = parser.parse_args()
    lock = json.loads((ROOT / 'deploy/upstreams.json').read_text())
    build = ROOT / '.build'
    build.mkdir(exist_ok=True)
    for name, spec in lock.items():
        stamp = hashlib.sha256(json.dumps(spec, sort_keys=True).encode() +
            ((ROOT / spec['patch']).read_bytes() if 'patch' in spec else b'')).hexdigest()
        destination = build / name
        marker = destination / '.orchestrai-source'
        if destination.exists():
            if marker.is_file() and marker.read_text() == stamp:
                print(f'{name}: verified preparation already exists')
                continue
            raise RuntimeError(f'{destination}: existing contents require review; refusing overwrite')
        archive = (args.cache / f'{name}-source.zip') if args.cache else build / f'{name}-source.zip'
        if not archive.exists():
            if args.cache:
                raise FileNotFoundError(archive)
            url = f"https://codeload.github.com/{spec['repository']}/zip/{spec['commit']}"
            urllib.request.urlretrieve(url, archive)
        if hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest() != spec['sha256']:
            raise ValueError(f'{name}: source checksum mismatch')
        with zipfile.ZipFile(archive) as source:
            for item in source.infolist():
                path = pathlib.PurePosixPath(item.filename)
                relative = pathlib.Path(*path.parts[1:])
                target = (destination / relative).resolve()
                if not target.is_relative_to(destination.resolve()) or (item.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError('unsafe archive path or symlink')
                if item.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(source.read(item))
        if 'patch' in spec:
            # Separate Git context avoids silently ignoring paths relative to the parent repo.
            subprocess.run(['git', 'init', '--quiet', str(destination)], check=True)
            subprocess.run(['git', 'apply', '--check', str(ROOT / spec['patch'])], cwd=destination, check=True)
            subprocess.run(['git', 'apply', str(ROOT / spec['patch'])], cwd=destination, check=True)
        marker.write_text(stamp)
        print(f'{name}: {spec["commit"]} prepared with source license retained')

if __name__ == '__main__':
    main()
