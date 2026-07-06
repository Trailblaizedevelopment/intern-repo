-- Integration feature branch: Cursor PRs target this; humans merge feature → develop.
ALTER TABLE brain_tasks ADD COLUMN IF NOT EXISTS integration_branch TEXT;
