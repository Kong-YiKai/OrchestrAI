#!/usr/bin/env bash
set -euo pipefail
# Password enters psql through stdin variables; never echo expanded SQL/config.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=workflow_password="$WORKFLOW_DB_PASSWORD" <<'SQL'
CREATE ROLE workflow LOGIN PASSWORD :'workflow_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE workflow OWNER workflow;
SQL
