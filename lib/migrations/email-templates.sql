-- ============================================================
-- EMAIL TEMPLATES
-- Workspace DB (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
-- Run this in the Supabase SQL editor for the workspace project.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  category     TEXT        NOT NULL DEFAULT 'onboarding'
                           CHECK (category IN ('onboarding', 'follow-up', 'nurture', 'announcement')),
  subject_line TEXT,
  html_content TEXT        NOT NULL,
  tags         TEXT[],
  created_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_templates_updated_at ON email_templates;
CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Index for category lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_category
  ON email_templates (category);

-- RLS: only authenticated users can read/write
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_email_templates"  ON email_templates;
DROP POLICY IF EXISTS "authenticated_write_email_templates" ON email_templates;

CREATE POLICY "authenticated_read_email_templates"
  ON email_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_write_email_templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
