-- Alumni Outreach Approval: outreach_batches table
-- Tracks daily outreach batches that require human approval before execution

CREATE TABLE IF NOT EXISTS outreach_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  scheduled_date    DATE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending_approval'
                    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'completed', 'cancelled')),
  approved_by       TEXT,
  approved_at       TIMESTAMPTZ,
  executed_at       TIMESTAMPTZ,
  total_contacts    INT,
  chapters          JSONB,          -- breakdown by chapter: [{chapter_id, chapter_name, count}]
  lines             JSONB,          -- breakdown by line: [{line_label, line_phone, count}]
  touch_breakdown   JSONB,          -- {touch1: N, touch2: N, touch3: N}
  sample_messages   JSONB,          -- [{contact_name, chapter_name, touch_number, message_preview}]
  results           JSONB,          -- populated after execution: {sent, failed, errors}
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS idx_outreach_batches_date
  ON outreach_batches(scheduled_date DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_batches_status
  ON outreach_batches(status, scheduled_date DESC);

-- RLS: allow all authenticated employees to read/write
ALTER TABLE outreach_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "outreach_batches_all" ON outreach_batches;
CREATE POLICY "outreach_batches_all"
  ON outreach_batches FOR ALL
  USING (true) WITH CHECK (true);
