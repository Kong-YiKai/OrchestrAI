CREATE TABLE queries (
 id uuid PRIMARY KEY, tenant_id text NOT NULL, user_id text NOT NULL,
 operation_key text NOT NULL, input_hash text NOT NULL, query text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','partial','failed','cancelled')),
 phase text NOT NULL DEFAULT 'queued', result jsonb, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,user_id,operation_key)
);
CREATE INDEX queries_owner ON queries(tenant_id,user_id,created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON queries TO research;
GRANT SELECT ON schema_migrations TO research;
