-- Scout discovery enrichment fields from platform profiles
-- Date: 2026-08-12

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS member_status TEXT,
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS hometown TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT;

COMMENT ON COLUMN scout_profiles.member_status IS 'Platform member_status (active, alumni, graduated, etc.)';
COMMENT ON COLUMN scout_profiles.industry IS 'Platform industry or inferred career focus';
COMMENT ON COLUMN scout_profiles.company IS 'Platform company';
COMMENT ON COLUMN scout_profiles.job_title IS 'Platform job_title (prefer over membership role for display)';
COMMENT ON COLUMN scout_profiles.hometown IS 'Platform hometown';
COMMENT ON COLUMN scout_profiles.linkedin_url IS 'Platform linkedin_url — enrichment signal, not scraped';
COMMENT ON COLUMN scout_profiles.bio IS 'Platform bio snippet';
