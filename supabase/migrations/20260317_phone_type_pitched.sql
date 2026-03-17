-- Add phone_type column for carrier lookup results (Telnyx)
ALTER TABLE alumni_contacts
  ADD COLUMN IF NOT EXISTS phone_type TEXT; -- 'mobile' | 'landline' | 'voip' | 'unknown'

-- Index for compile queries that filter on phone_type
CREATE INDEX IF NOT EXISTS idx_alumni_contacts_phone_type
  ON alumni_contacts (phone_type);

-- Index for pitched status lookups
CREATE INDEX IF NOT EXISTS idx_alumni_contacts_outreach_pitched
  ON alumni_contacts (outreach_status)
  WHERE outreach_status = 'pitched';

COMMENT ON COLUMN alumni_contacts.phone_type IS
  'Carrier type from Telnyx lookup at import time. mobile=iMessage eligible, landline/voip=excluded from outreach.';
