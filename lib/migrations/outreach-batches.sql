-- ============================================================
-- OUTREACH BATCHES + OUTREACH BATCH CONTACTS
-- Alumni Outreach DB — project uoemlefauspgmmpeoilq
-- This is the SAME DB as NEXT_PUBLIC_SUPABASE_URL (alumni_contacts lives here).
-- Run this in the Supabase SQL editor for project uoemlefauspgmmpeoilq.
-- ============================================================

-- ── outreach_batches ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_batches (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date DATE        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending_approval'
                             CHECK (status IN (
                               'pending_approval', 'approved', 'sending',
                               'sent', 'cancelled', 'failed'
                             )),
  created_by     TEXT,
  approved_by    TEXT,
  approved_at    TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  cancelled_at   TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_batches_date   ON outreach_batches (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_outreach_batches_status ON outreach_batches (status);

-- ── outreach_batch_contacts ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_batch_contacts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        UUID        NOT NULL REFERENCES outreach_batches(id) ON DELETE CASCADE,
  contact_id      UUID,       -- FK to alumni_contacts.id (soft — not enforced so cross-DB works)
  name            TEXT,
  phone           TEXT,
  chapter         TEXT,
  touch_number    INTEGER     CHECK (touch_number IN (1, 2, 3)),
  linq_line       INTEGER     CHECK (linq_line IN (1, 2, 3)),
  message_preview TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected', 'sent', 'failed')),
  send_result     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batch_contacts_batch_id ON outreach_batch_contacts (batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_contacts_status   ON outreach_batch_contacts (status);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE outreach_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach_batch_contacts  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default; only need policies for anon/authed
DROP POLICY IF EXISTS "authenticated_all_outreach_batches"         ON outreach_batches;
DROP POLICY IF EXISTS "authenticated_all_outreach_batch_contacts"  ON outreach_batch_contacts;

CREATE POLICY "authenticated_all_outreach_batches"
  ON outreach_batches FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_all_outreach_batch_contacts"
  ON outreach_batch_contacts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
