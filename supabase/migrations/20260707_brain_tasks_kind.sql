-- Distinguish focused Slice tasks (one PR) from multi-step Goal tasks.
ALTER TABLE brain_tasks
  ADD COLUMN IF NOT EXISTS task_kind TEXT NOT NULL DEFAULT 'goal'
  CHECK (task_kind IN ('slice', 'goal'));

CREATE INDEX IF NOT EXISTS idx_brain_tasks_kind ON brain_tasks(task_kind);
