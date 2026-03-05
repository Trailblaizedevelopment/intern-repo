-- Migration: platform_members + chapter_external_mappings
-- Run against: internal Supabase project (uoemlefauspgmmpeoilq)
-- Date: 2026-03-05

-- Maps external platform chapter IDs → internal chapter IDs
CREATE TABLE IF NOT EXISTS chapter_external_mappings (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  internal_chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  external_chapter_id UUID NOT NULL UNIQUE,
  external_name       TEXT,
  confidence          TEXT CHECK (confidence IN ('auto','manual','flagged')) DEFAULT 'auto',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cem_external_id ON chapter_external_mappings(external_chapter_id);
CREATE INDEX IF NOT EXISTS idx_cem_internal_id ON chapter_external_mappings(internal_chapter_id);

-- Stores alumni who signed up on the external client platform
CREATE TABLE IF NOT EXISTS platform_members (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id          UUID REFERENCES chapters(id) ON DELETE SET NULL,
  external_user_id    UUID NOT NULL UNIQUE,        -- profiles.id on external platform
  external_chapter_id UUID,                         -- profiles.chapter_id on external platform
  first_name          TEXT,
  last_name           TEXT,
  email               TEXT,
  phone               TEXT,
  grad_year           INTEGER,
  major               TEXT,
  minor               TEXT,
  pledge_class        TEXT,
  linkedin_url        TEXT,
  location            TEXT,
  member_status       TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  signed_up_at        TIMESTAMPTZ,
  last_synced_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Link to outreach contact if matched
  alumni_contact_id   UUID REFERENCES alumni_contacts(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_chapter_id         ON platform_members(chapter_id);
CREATE INDEX IF NOT EXISTS idx_pm_external_user_id   ON platform_members(external_user_id);
CREATE INDEX IF NOT EXISTS idx_pm_alumni_contact_id  ON platform_members(alumni_contact_id);
CREATE INDEX IF NOT EXISTS idx_pm_email              ON platform_members(email);
