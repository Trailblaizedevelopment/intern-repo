-- Cursor dispatch approval gate + conversation pending actions.
ALTER TABLE brain_tasks ADD COLUMN IF NOT EXISTS pending_cursor_dispatch JSONB;

ALTER TABLE brain_conversations ADD COLUMN IF NOT EXISTS pending_action JSONB;

ALTER TABLE brain_tasks DROP CONSTRAINT IF EXISTS brain_tasks_status_check;
ALTER TABLE brain_tasks ADD CONSTRAINT brain_tasks_status_check CHECK (
  status IN (
    'queued', 'planning', 'running', 'blocked', 'completed',
    'failed', 'cancelled', 'awaiting_approval'
  )
);

DROP INDEX IF EXISTS idx_brain_tasks_status_next;
CREATE INDEX idx_brain_tasks_status_next
  ON brain_tasks(status, next_run_at)
  WHERE status IN ('queued', 'planning', 'running', 'blocked');
