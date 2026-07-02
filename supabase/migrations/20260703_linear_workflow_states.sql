-- Cached Linear workflow states for CRM status → stateId mapping on drag/update

CREATE TABLE IF NOT EXISTS linear_workflow_states (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  color TEXT,
  position DOUBLE PRECISION,
  synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_linear_workflow_states_team
  ON linear_workflow_states(team_id);

CREATE INDEX IF NOT EXISTS idx_linear_workflow_states_team_name
  ON linear_workflow_states(team_id, name);
