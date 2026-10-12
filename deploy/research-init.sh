#!/usr/bin/env bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  --set=migration_password="$RESEARCH_MIGRATION_PASSWORD" \
  --set=app_password="$RESEARCH_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE research_migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'migration_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='research_migrator') \gexec
SELECT format('CREATE ROLE research LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='research') \gexec
SELECT 'CREATE DATABASE research OWNER research_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='research') \gexec
REVOKE CONNECT ON DATABASE research FROM PUBLIC;
GRANT CONNECT ON DATABASE research TO research;
\connect research
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO research_migrator;
GRANT USAGE ON SCHEMA public TO research;
SQL
