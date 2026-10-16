-- R5 agent teams. The R2 tables (runs/events/artifacts and the LangGraph checkpoint
-- tables) are left untouched so an application rollback to the previous image still
-- works; they are dropped in a later contract release.
CREATE TABLE team_projects (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  idempotency_key text NOT NULL,
  input_hash text NOT NULL,
  goal text NOT NULL,
  workspace_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('planning','ready','failed')),
  plan jsonb,
  plan_version integer NOT NULL DEFAULT 0,
  error_code text,
  dispatch_version integer NOT NULL DEFAULT 1,
  published_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, idempotency_key)
);
CREATE INDEX team_projects_owner ON team_projects (tenant_id, user_id, updated_at DESC);
CREATE INDEX team_projects_outbox ON team_projects (updated_at) WHERE status = 'planning';

CREATE TABLE team_runs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES team_projects(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  idempotency_key text NOT NULL,
  plan jsonb NOT NULL,
  plan_version integer NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','partial','cancelled','failed')),
  error_code text,
  task_states jsonb NOT NULL DEFAULT '{}',
  dispatch_version integer NOT NULL DEFAULT 1,
  published_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, idempotency_key)
);
CREATE INDEX team_runs_project ON team_runs (project_id, created_at DESC);
CREATE INDEX team_runs_active ON team_runs (updated_at) WHERE status IN ('queued','running');

CREATE TABLE team_events (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES team_runs(id) ON DELETE CASCADE,
  type text NOT NULL,
  task_id text,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_events_run_seq ON team_events (run_id, seq);

-- Files the agents wrote in the run workspace. Content lives here (bounded) so the
-- existing workflow database backup also covers deliverables.
CREATE TABLE team_files (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES team_runs(id) ON DELETE CASCADE,
  path text NOT NULL,
  task_id text,
  media_type text NOT NULL,
  size integer NOT NULL CHECK (size >= 0 AND size <= 2097152),
  sha256 text NOT NULL,
  content bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, path)
);

-- OMA checkpoint records (MemoryStore). One row per key; compare-and-set is atomic.
CREATE TABLE team_checkpoints (
  key text PRIMARY KEY,
  value text NOT NULL,
  metadata jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Worker liveness for the deployment smoke, without a model call.
CREATE TABLE team_workers (
  id text PRIMARY KEY,
  seen_at timestamptz NOT NULL DEFAULT now()
);
