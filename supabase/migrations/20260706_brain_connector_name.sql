-- Add connector_name to brain_action_log for MCP router audit trail.
ALTER TABLE brain_action_log
  ADD COLUMN IF NOT EXISTS connector_name TEXT;

CREATE INDEX IF NOT EXISTS idx_brain_action_log_connector
  ON brain_action_log(connector_name, created_at DESC);
