#!/usr/bin/env bash
set -euo pipefail
# Reusable for an existing R2 instance; creates only missing product roles/database.
psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  --set=migration_password="$INGESTION_MIGRATION_PASSWORD" \
  --set=app_password="$INGESTION_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE ingestion_migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'migration_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='ingestion_migrator') \gexec
SELECT format('CREATE ROLE ingestion LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname='ingestion') \gexec
SELECT 'CREATE DATABASE ingestion OWNER ingestion_migrator'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='ingestion') \gexec
REVOKE CONNECT ON DATABASE workflow FROM PUBLIC;
REVOKE CONNECT ON DATABASE ingestion FROM PUBLIC;
GRANT CONNECT ON DATABASE ingestion TO ingestion;
\connect ingestion
CREATE EXTENSION IF NOT EXISTS vector;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO ingestion_migrator;
GRANT USAGE ON SCHEMA public TO ingestion;
SQL
