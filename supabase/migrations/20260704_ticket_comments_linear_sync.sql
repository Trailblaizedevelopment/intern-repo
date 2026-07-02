-- Link CRM comments to Linear for bidirectional sync
ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'crm';
ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS author_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_comments_external_id
  ON ticket_comments(external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_comments_source ON ticket_comments(source);
