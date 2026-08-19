-- Scout product framework: pathways, activation events, capability flags, contacts
-- Additive only

-- ─── scout_settings capability flags ─────────────────────────────────────────

ALTER TABLE scout_settings
  ADD COLUMN IF NOT EXISTS linkedin_graph_available BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE scout_settings
  ADD COLUMN IF NOT EXISTS linkedin_send_available BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE scout_settings
  ADD COLUMN IF NOT EXISTS trailblaize_dm_available BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE scout_settings
  ADD COLUMN IF NOT EXISTS phone_contacts_ingest_available BOOLEAN NOT NULL DEFAULT true;

-- ─── scout_people source + platform match ────────────────────────────────────

ALTER TABLE scout_people
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'member_mentioned';

ALTER TABLE scout_people
  DROP CONSTRAINT IF EXISTS scout_people_source_check;

ALTER TABLE scout_people
  ADD CONSTRAINT scout_people_source_check
  CHECK (source IN ('community', 'phone_contact', 'linkedin', 'member_mentioned'));

ALTER TABLE scout_people
  ADD COLUMN IF NOT EXISTS matched_platform_profile_id UUID;

CREATE INDEX IF NOT EXISTS idx_scout_people_matched_platform
  ON scout_people(matched_platform_profile_id)
  WHERE matched_platform_profile_id IS NOT NULL;

-- ─── scout_pathways ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_pathways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  person_id UUID REFERENCES scout_people(id) ON DELETE SET NULL,
  platform_profile_id UUID,
  sources TEXT[] NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '[]',
  suggested_channel TEXT NOT NULL DEFAULT 'trailblaize_ops_intro'
    CHECK (suggested_channel IN (
      'trailblaize_ops_intro',
      'sms',
      'phone',
      'linkedin_linkout',
      'native_share',
      'trailblaize_message',
      'trailblaize_connection'
    )),
  chosen_channel TEXT
    CHECK (chosen_channel IS NULL OR chosen_channel IN (
      'trailblaize_ops_intro',
      'sms',
      'phone',
      'linkedin_linkout',
      'native_share',
      'trailblaize_message',
      'trailblaize_connection'
    )),
  draft_text TEXT,
  status TEXT NOT NULL DEFAULT 'drafted'
    CHECK (status IN ('drafted', 'member_approved', 'member_edited', 'executed', 'declined', 'expired')),
  member_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_pathways_member
  ON scout_pathways(member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_pathways_status
  ON scout_pathways(member_id, status);

-- ─── scout_activation_events (no private payloads) ───────────────────────────

CREATE TABLE IF NOT EXISTS scout_activation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'scout_opened',
      'repeat_turn',
      'pathway_drafted',
      'intro_requested',
      'intro_accepted',
      'invite_suggested',
      'outcome_reported'
    )),
  community_id UUID,
  industry TEXT,
  geo TEXT,
  persona TEXT,
  pathway_id UUID REFERENCES scout_pathways(id) ON DELETE SET NULL,
  intro_id UUID,
  outcome TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_activation_member_time
  ON scout_activation_events(member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_activation_type
  ON scout_activation_events(event_type, created_at DESC);

-- ─── scout_introductions pathway link ────────────────────────────────────────

ALTER TABLE scout_introductions
  ADD COLUMN IF NOT EXISTS pathway_id UUID REFERENCES scout_pathways(id) ON DELETE SET NULL;

ALTER TABLE scout_introductions
  ADD COLUMN IF NOT EXISTS action_channel TEXT NOT NULL DEFAULT 'trailblaize_ops_intro';

ALTER TABLE scout_introductions
  ADD COLUMN IF NOT EXISTS member_reviewed_at TIMESTAMPTZ;

-- ─── phone contact grants + matches ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_contact_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope TEXT NOT NULL DEFAULT 'selective'
    CHECK (scope IN ('selective', 'full')),
  contact_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_contact_grants_member
  ON scout_contact_grants(member_id, granted_at DESC);

CREATE TABLE IF NOT EXISTS scout_contact_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  grant_id UUID REFERENCES scout_contact_grants(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  phone_hash TEXT,
  email_hash TEXT,
  phone_e164 TEXT,
  matched_platform_profile_id UUID,
  reachable_sms BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_contact_matches_member
  ON scout_contact_matches(member_id);

CREATE INDEX IF NOT EXISTS idx_scout_contact_matches_platform
  ON scout_contact_matches(matched_platform_profile_id)
  WHERE matched_platform_profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_contact_matches_phone
  ON scout_contact_matches(member_id, phone_hash)
  WHERE phone_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_contact_matches_email
  ON scout_contact_matches(member_id, email_hash)
  WHERE email_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS scout_invite_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  contact_match_id UUID REFERENCES scout_contact_matches(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'invited', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_invite_suggestions_member
  ON scout_invite_suggestions(member_id, status);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE scout_pathways ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_activation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_contact_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_contact_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_invite_suggestions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scout_pathways' AND policyname = 'Authenticated full access scout_pathways'
  ) THEN
    CREATE POLICY "Authenticated full access scout_pathways"
      ON scout_pathways FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scout_activation_events' AND policyname = 'Authenticated full access scout_activation_events'
  ) THEN
    CREATE POLICY "Authenticated full access scout_activation_events"
      ON scout_activation_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scout_contact_grants' AND policyname = 'Authenticated full access scout_contact_grants'
  ) THEN
    CREATE POLICY "Authenticated full access scout_contact_grants"
      ON scout_contact_grants FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scout_contact_matches' AND policyname = 'Authenticated full access scout_contact_matches'
  ) THEN
    CREATE POLICY "Authenticated full access scout_contact_matches"
      ON scout_contact_matches FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scout_invite_suggestions' AND policyname = 'Authenticated full access scout_invite_suggestions'
  ) THEN
    CREATE POLICY "Authenticated full access scout_invite_suggestions"
      ON scout_invite_suggestions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE scout_pathways IS 'Member-reviewed outreach pathways. Drafts live here; activation events never copy draft_text.';
COMMENT ON TABLE scout_activation_events IS 'Aggregate network-activation facts. No message bodies, address books, or LinkedIn payloads.';
COMMENT ON TABLE scout_contact_matches IS 'Permissioned contact matches. Never dump this table into Scout conversation.';
