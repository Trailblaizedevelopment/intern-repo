-- Phase 1: Link CRM tickets to Linear issues
-- external_id     = Linear issue UUID (upsert key)
-- linear_identifier = Human-readable id e.g. TRA-123

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS linear_identifier TEXT;

COMMENT ON COLUMN tickets.external_id IS 'Linear issue UUID; canonical link for sync upsert';
COMMENT ON COLUMN tickets.linear_identifier IS 'Linear issue identifier e.g. TRA-123';

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_linear_identifier
  ON tickets(linear_identifier)
  WHERE linear_identifier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_external_id_lookup
  ON tickets(external_id)
  WHERE external_id IS NOT NULL;

-- PostgREST/Supabase upsert requires a non-partial UNIQUE constraint
DO $$ BEGIN
  ALTER TABLE tickets ADD CONSTRAINT tickets_external_id_key UNIQUE (external_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
