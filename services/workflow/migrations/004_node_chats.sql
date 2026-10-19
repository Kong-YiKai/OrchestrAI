-- Per-node conversations: the user discusses a node's task with its agent before it runs.
-- The transcript is handed to the agent as the user's additional requirements.
CREATE TABLE team_chats (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES team_projects(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (length(content) <= 8000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_chats_task ON team_chats (project_id, task_id, seq);
