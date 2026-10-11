#!/bin/sh
# One-time administrator installation from a reviewed checkout; never run by CI.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run as administrator'; exit 1; }
[ "$#" = 1 ] || { echo 'Usage: install-host.sh /path/to/ci-ed25519.pub'; exit 2; }
command -v docker >/dev/null
command -v age >/dev/null
command -v rclone >/dev/null
command -v python3 >/dev/null
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
public_key=$(cat -- "$1")
printf '%s\n' "$public_key" | grep -Eq '^ssh-ed25519 [A-Za-z0-9+/=]+( [A-Za-z0-9_.@-]+)?$' || { echo 'Expected one ed25519 public key'; exit 2; }
if id orchestrai-deploy >/dev/null 2>&1 || [ -e /opt/orchestrai ]; then
  echo 'Existing installation requires explicit review; refusing overwrite.'; exit 2
fi
install -d -m 755 /opt/orchestrai /opt/orchestrai/deploy
install -d -m 700 /opt/orchestrai/secrets /opt/orchestrai/state /opt/orchestrai/backups
for file in compose.yml postgres-init.sh infrastructure.Dockerfile release.py; do
  install -m 644 "$source_dir/$file" "/opt/orchestrai/deploy/$file"
done
install -m 600 "$source_dir/deployment.example.json" /opt/orchestrai/secrets/deployment.json
python3 -I - <<'PY'
import os,secrets
os.umask(0o077)
with open('/opt/orchestrai/secrets/production.env','x') as output:
    for name in ('POSTGRES_PASSWORD','WORKFLOW_DB_PASSWORD','REDIS_PASSWORD','DELEGATION_SECRET'):
        output.write(name+'='+secrets.token_hex(32)+'\n')
    output.write('MODEL_DAILY_LIMIT_CNY=5\nMODEL_MONTHLY_LIMIT_CNY=100\n')
PY
useradd --system --create-home --shell /bin/sh orchestrai-deploy
deploy_home=$(getent passwd orchestrai-deploy | cut -d: -f6)
chown root:root "$deploy_home"
chmod 755 "$deploy_home"
install -d -m 700 "$deploy_home/.ssh"
printf 'restrict,command="sudo -n /usr/bin/python3 -I /opt/orchestrai/deploy/release.py" %s\n' "$public_key" > "$deploy_home/.ssh/authorized_keys"
chmod 600 "$deploy_home/.ssh/authorized_keys"
printf '%s\n' 'orchestrai-deploy ALL=(root) NOPASSWD: /usr/bin/python3 -I /opt/orchestrai/deploy/release.py' > /etc/sudoers.d/orchestrai-deploy
chmod 440 /etc/sudoers.d/orchestrai-deploy
visudo -cf /etc/sudoers.d/orchestrai-deploy
echo 'Restricted identity installed. Configure private registry login, offsite backup and verify restore before enabling CD.'
