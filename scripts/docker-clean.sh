#!/usr/bin/env bash
# Local prototype images only. Production release/rollback images are retained.
set -euo pipefail

if [[ $# -eq 0 ]]; then
  docker image ls 'orchestrai/*'
  echo 'To remove an unused local image, pass its exact orchestrai/name:tag. Never run global prune on the shared server.'
  exit 0
fi
for image in "$@"; do
  if [[ ! "$image" =~ ^orchestrai/[a-z0-9-]+:[a-zA-Z0-9._-]+$ ]]; then
    echo 'Only exact local orchestrai/name:tag references are accepted.' >&2
    exit 2
  fi
done
# No force: Docker rejects images referenced by existing containers.
docker image rm -- "$@"
