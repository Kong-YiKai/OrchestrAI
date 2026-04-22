#!/usr/bin/env bash
# Remove dangling images and any stale orchestrai-* images not matching the
# canonical names defined in docker-compose.yml (orchestrai/backend, orchestrai/frontend).
set -euo pipefail

echo "=== Removing dangling images ==="
docker image prune -f

echo ""
echo "=== Removing stale orchestrai-* images (old naming convention) ==="
STALE=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "^(orchestrai-|docker-frontend|docker-backend)" || true)
if [ -n "$STALE" ]; then
  echo "$STALE" | xargs docker rmi -f
else
  echo "None found."
fi

echo ""
echo "=== Current images ==="
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}"
