-- PR merge tracking for post-Cursor orchestration.
ALTER TABLE brain_tasks ADD COLUMN IF NOT EXISTS cursor_pr_merged BOOLEAN NOT NULL DEFAULT FALSE;
