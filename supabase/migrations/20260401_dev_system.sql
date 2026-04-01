-- Migration: Dev System Extensions
-- Adds engineering dev fields to tickets table and creates supporting structures
-- Created: 2026-04-01

-- ─── Extend tickets table ────────────────────────────────────────────────────

-- ticket_type: ios or web (default web)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'web'
    CHECK (ticket_type IN ('ios', 'web'));

-- spec: Claude-generated feature spec (JSON stored as text)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS spec TEXT;

-- linear_id: optional link to a Linear issue
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS linear_id TEXT;

-- assigned_tester: who QAs this ticket (employee name or id)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS assigned_tester TEXT;

-- test_result: outcome of QA
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS test_result TEXT
    CHECK (test_result IN ('pass', 'revisions') OR test_result IS NULL);

-- test_feedback: QA notes
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS test_feedback TEXT;

-- Timeline dates
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS estimated_start DATE;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS estimated_end DATE;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS actual_start DATE;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS actual_end DATE;

-- ─── Index for common lookups ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type ON tickets(ticket_type);
CREATE INDEX IF NOT EXISTS idx_tickets_linear_id ON tickets(linear_id) WHERE linear_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_test_result ON tickets(test_result) WHERE test_result IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_estimated_start ON tickets(estimated_start) WHERE estimated_start IS NOT NULL;

-- ─── Projects table: ensure estimated_start/end columns exist ────────────────
-- (Projects already have start_date/target_date from the existing schema)
-- Adding dev-system specific date columns if not present

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS estimated_start DATE;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS estimated_end DATE;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS actual_start DATE;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS actual_end DATE;

-- ─── linear_issues: ensure the status field is queryable by name ─────────────
-- The existing schema uses state_name. We'll create a view alias for convenience.

CREATE INDEX IF NOT EXISTS idx_linear_issues_state_name ON linear_issues(state_name);
CREATE INDEX IF NOT EXISTS idx_linear_issues_team_id ON linear_issues(team_id);
