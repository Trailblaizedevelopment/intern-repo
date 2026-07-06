-- Cursor poll state on brain_tasks (watch loop).
ALTER TABLE brain_tasks ADD COLUMN IF NOT EXISTS cursor_run_id TEXT;
ALTER TABLE brain_tasks ADD COLUMN IF NOT EXISTS cursor_run_status TEXT;
ALTER TABLE brain_tasks ADD COLUMN IF NOT EXISTS cursor_pr_url TEXT;
ALTER TABLE brain_tasks ADD COLUMN IF NOT EXISTS cursor_branch TEXT;
