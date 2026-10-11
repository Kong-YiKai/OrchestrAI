CREATE TABLE runs (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  input jsonb NOT NULL,
  graph_version text NOT NULL DEFAULT 'r2-proof-v1' CHECK (graph_version = 'r2-proof-v1'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','waiting','completed','cancelled','failed')),
  decision boolean,
  approval_version integer NOT NULL DEFAULT 1,
  dispatch_version integer NOT NULL DEFAULT 1,
  published_version integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, idempotency_key)
);
CREATE INDEX runs_outbox ON runs (updated_at) WHERE dispatch_version > published_version;
CREATE TABLE events (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id),
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_run_seq ON events (run_id, seq);
CREATE TABLE artifacts (
  run_id uuid PRIMARY KEY REFERENCES runs(id),
  content text NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
