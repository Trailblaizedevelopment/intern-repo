-- Atomic send lock for alumni_contacts
-- Prevents duplicate sends when the outreach agent restarts mid-batch
-- Usage: SET outreach_lock = NOW() before sending; filter WHERE outreach_lock IS NULL OR outreach_lock < NOW() - INTERVAL '1 hour'

ALTER TABLE alumni_contacts
  ADD COLUMN IF NOT EXISTS outreach_lock TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alumni_outreach_lock
  ON alumni_contacts(outreach_lock)
  WHERE outreach_lock IS NOT NULL;
