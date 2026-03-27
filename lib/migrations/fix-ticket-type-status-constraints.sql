-- Fix ticket type and status constraints
-- The original schema only allowed 3 types and 5 statuses,
-- but the application uses 6 types and 8 statuses.
-- This migration aligns the DB constraints with the actual codebase.
--
-- Run against your Supabase DB:
--   Types: bug, feature_request, issue, improvement, task, epic
--   Statuses: backlog, todo, open, in_progress, in_review, testing, done, canceled

-- Drop old constraints
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_type_check;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;

-- Add updated constraints matching the application code
ALTER TABLE tickets ADD CONSTRAINT tickets_type_check 
  CHECK (type IN ('bug', 'feature_request', 'issue', 'improvement', 'task', 'epic'));

ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
  CHECK (status IN ('backlog', 'todo', 'open', 'in_progress', 'in_review', 'testing', 'done', 'canceled'));

-- Update default status from 'open' to 'open' (no change, just documenting)
-- ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'open';
