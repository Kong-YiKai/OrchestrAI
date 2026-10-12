#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ $# -eq 0 || ( $# -eq 1 && $1 == --dry-run ) ]] || { echo 'Optional --dry-run only.' >&2; exit 2; }
# Respect the existing cross-site ACME lock without changing other timers/scripts.
exec 9>/run/lock/shared-certificate-renew.lock
flock -w 600 9
cert=/etc/letsencrypt/live/orchestrai.elysiumgrid.space/fullchain.pem
before=$(sha256sum "$cert" | cut -d ' ' -f 1)
docker run --rm -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/lib/letsencrypt:/var/lib/letsencrypt -v /var/log/letsencrypt:/var/log/letsencrypt \
  -v /opt/multi-agent-tarot/acme-webroot:/var/www/certbot \
  certbot/certbot@sha256:f70ad0adbb7e117f0fe42a63c553f28ea451edabc0148757b6efcd9735acaa20 \
  renew --cert-name orchestrai.elysiumgrid.space --quiet "$@"
after=$(sha256sum "$cert" | cut -d ' ' -f 1)
if [[ "$before" != "$after" || ${1:-} == --dry-run ]]; then
  docker exec shared-ingress-nginx-1 nginx -t
  docker exec shared-ingress-nginx-1 nginx -s reload
fi
