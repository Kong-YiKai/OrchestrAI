-- R5 run control: a project keeps one live run whose nodes are started, paused and
-- resumed individually; the user sets the team's budget and the run records spending.
ALTER TABLE team_projects ADD COLUMN budget_cny numeric(10,2) NOT NULL DEFAULT 5
  CHECK (budget_cny > 0 AND budget_cny <= 10000);

ALTER TABLE team_runs DROP CONSTRAINT team_runs_status_check;
ALTER TABLE team_runs ADD CONSTRAINT team_runs_status_check
  CHECK (status IN ('queued','running','paused','idle','completed','partial','cancelled','failed'));
ALTER TABLE team_runs ADD COLUMN spent_cny numeric(14,6) NOT NULL DEFAULT 0;
ALTER TABLE team_runs ADD COLUMN tokens jsonb NOT NULL DEFAULT '{"input":0,"output":0}';

-- Work records are read per node.
CREATE INDEX team_events_run_task ON team_events (run_id, task_id, seq);

-- What the user asked the commander to change when regenerating the workflow.
ALTER TABLE team_projects ADD COLUMN design_note text;
