-- Migration: Set default project value for tickets
-- Existing null tickets → 'Web App'
-- Add CHECK constraint to allow only 'Web App' or 'Mobile App'

UPDATE tickets
SET project = 'Web App'
WHERE project IS NULL OR project = '';

ALTER TABLE tickets
  ALTER COLUMN project SET DEFAULT 'Web App';

ALTER TABLE tickets
  ADD CONSTRAINT tickets_project_check
  CHECK (project IN ('Web App', 'Mobile App'));
