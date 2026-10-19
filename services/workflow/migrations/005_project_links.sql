-- A team created from a chat clarification remembers its conversation, so the chat can
-- show the team's progress and the canvas can link back to the requirements.
ALTER TABLE team_projects ADD COLUMN conversation_id text
  CHECK (conversation_id ~ '^[A-Za-z0-9_-]{1,64}$');
CREATE INDEX team_projects_conversation ON team_projects (tenant_id, user_id, conversation_id)
  WHERE conversation_id IS NOT NULL;
