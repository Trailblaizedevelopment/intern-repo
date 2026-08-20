-- Alumni AI Enrichment (Perplexity Sonar)
-- Adds career enrichment fields populated by the /api/alumni/enrich endpoint

ALTER TABLE alumni_contacts
  ADD COLUMN IF NOT EXISTS pplx_title       text,
  ADD COLUMN IF NOT EXISTS pplx_company     text,
  ADD COLUMN IF NOT EXISTS pplx_location    text,
  ADD COLUMN IF NOT EXISTS pplx_confidence  text,
  ADD COLUMN IF NOT EXISTS pplx_notes       text,
  ADD COLUMN IF NOT EXISTS pplx_enriched_at timestamptz;

-- Index to efficiently find unenriched contacts per chapter
CREATE INDEX IF NOT EXISTS alumni_contacts_pplx_unenriched_idx
  ON alumni_contacts (chapter_id, pplx_enriched_at)
  WHERE pplx_enriched_at IS NULL;

COMMENT ON COLUMN alumni_contacts.pplx_title       IS 'Current job title from Perplexity Sonar enrichment';
COMMENT ON COLUMN alumni_contacts.pplx_company     IS 'Current employer from Perplexity Sonar enrichment';
COMMENT ON COLUMN alumni_contacts.pplx_location    IS 'Current city/state from Perplexity Sonar enrichment';
COMMENT ON COLUMN alumni_contacts.pplx_confidence  IS 'Confidence level: high | medium | low | not_found | error';
COMMENT ON COLUMN alumni_contacts.pplx_notes       IS 'Source notes from Perplexity enrichment';
COMMENT ON COLUMN alumni_contacts.pplx_enriched_at IS 'Timestamp of last enrichment attempt';
