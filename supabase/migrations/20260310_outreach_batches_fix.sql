-- Fix: outreach_batches table schema + 'sending' status in CHECK constraint
-- This migration is idempotent: safe to run even if the table already exists.
-- The table was created with a minimal schema; this adds missing columns + fixes the constraint.

-- ── Create table if it doesn't exist yet (full schema with 'sending' included) ─
CREATE TABLE IF NOT EXISTS outreach_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  scheduled_date    DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending_approval',
  created_by        TEXT,
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  executed_at       TIMESTAMPTZ,
  total_contacts    INT,
  chapters          JSONB,
  lines             JSONB,
  touch_breakdown   JSONB,
  sample_messages   JSONB,
  results           JSONB,
  notes             TEXT
);

-- ── Add missing columns if the table already existed with the minimal schema ───
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS created_by       TEXT;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS approved_by      TEXT;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS sent_at          TIMESTAMPTZ;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMPTZ;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS executed_at      TIMESTAMPTZ;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS total_contacts   INT;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS chapters         JSONB;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS lines            JSONB;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS touch_breakdown  JSONB;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS sample_messages  JSONB;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS results          JSONB;
ALTER TABLE outreach_batches ADD COLUMN IF NOT EXISTS notes            TEXT;

-- ── Fix the status CHECK constraint to include 'sending' ─────────────────────
ALTER TABLE outreach_batches
  DROP CONSTRAINT IF EXISTS outreach_batches_status_check;

ALTER TABLE outreach_batches
  ADD CONSTRAINT outreach_batches_status_check
  CHECK (status IN ('pending_approval', 'approved', 'sending', 'rejected', 'completed', 'cancelled'));

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_outreach_batches_date
  ON outreach_batches(scheduled_date DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_batches_status
  ON outreach_batches(status, scheduled_date DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE outreach_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_batches_all" ON outreach_batches;
CREATE POLICY "outreach_batches_all"
  ON outreach_batches FOR ALL
  USING (true) WITH CHECK (true);
