-- TICKETS SCHEMA MIGRATION — Linear Import Support
-- Adds fields needed for Linear ticket import and expanded status/priority values
-- Safe to re-run (all statements are idempotent)

-- ============================================
-- 1. ADD NEW COLUMNS (IF NOT EXISTS)
-- ============================================

-- Linear issue UUID (canonical link for sync upsert)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Linear human-readable identifier (e.g., TRA-123)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS linear_identifier TEXT;

-- Labels/tags array
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}';

-- Project grouping
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS project TEXT;

-- Story points / estimates
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS story_points INTEGER;

-- Due date
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;

-- ============================================
-- 2. EXPAND STATUS CONSTRAINT
-- ============================================
-- Current: open, in_progress, in_review, testing, done
-- Adding: backlog, todo, canceled

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
  CHECK (status IN ('backlog', 'todo', 'open', 'in_progress', 'in_review', 'testing', 'done', 'canceled'));

-- ============================================
-- 3. EXPAND PRIORITY CONSTRAINT
-- ============================================
-- Current: low, medium, high, critical
-- Adding: none (for "No priority" from Linear)

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_priority_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_priority_check 
  CHECK (priority IN ('none', 'low', 'medium', 'high', 'critical'));

-- ============================================
-- 4. EXPAND TYPE CONSTRAINT
-- ============================================
-- Current: bug, feature_request, issue
-- Adding: improvement, task, epic for broader categorization

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_type_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_type_check 
  CHECK (type IN ('bug', 'feature_request', 'issue', 'improvement', 'task', 'epic'));

-- ============================================
-- 5. INDEXES FOR NEW COLUMNS
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_external_id ON tickets(external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_linear_identifier ON tickets(linear_identifier) WHERE linear_identifier IS NOT NULL;

-- PostgREST upsert requires a non-partial UNIQUE constraint on external_id
DO $$ BEGIN
  ALTER TABLE tickets ADD CONSTRAINT tickets_external_id_key UNIQUE (external_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project) WHERE project IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_labels ON tickets USING GIN(labels) WHERE labels != '{}';
CREATE INDEX IF NOT EXISTS idx_tickets_due_date ON tickets(due_date) WHERE due_date IS NOT NULL;
