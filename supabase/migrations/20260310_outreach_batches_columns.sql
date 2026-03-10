-- Add missing columns to outreach_batches
-- Run this against the internal workspace DB (uoemlefauspgmmpeoilq)

ALTER TABLE outreach_batches
  ADD COLUMN IF NOT EXISTS total_contacts   INT,
  ADD COLUMN IF NOT EXISTS executed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chapters         JSONB,   -- [{chapter_id, chapter_name, count}]
  ADD COLUMN IF NOT EXISTS lines            JSONB,   -- [{line_label, line_phone, count}]
  ADD COLUMN IF NOT EXISTS touch_breakdown  JSONB,   -- {touch1: N, touch2: N, touch3: N}
  ADD COLUMN IF NOT EXISTS sample_messages  JSONB,   -- [{contact_name, chapter_name, touch_number, message_preview}]
  ADD COLUMN IF NOT EXISTS results          JSONB;   -- populated after execution

-- Fix status CHECK constraint to include 'sending'
ALTER TABLE outreach_batches DROP CONSTRAINT IF EXISTS outreach_batches_status_check;
ALTER TABLE outreach_batches ADD CONSTRAINT outreach_batches_status_check
  CHECK (status IN ('pending_approval', 'approved', 'sending', 'rejected', 'completed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_outreach_batches_date   ON outreach_batches(scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_batches_status ON outreach_batches(status, scheduled_date DESC);
