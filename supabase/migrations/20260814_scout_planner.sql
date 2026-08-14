-- Scout planner rebuild: relationships, intents, rejections, visibility, turn logs
-- Additive only — does not drop conversation_stage / agent_state / offered_ids

-- ─── working session on scout_profiles ───────────────────────────────────────

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS session_offer_suppressed BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS session_consecutive_declines INT NOT NULL DEFAULT 0;

-- ─── scout_people (resolved + unresolved named people) ───────────────────────

CREATE TABLE IF NOT EXISTS scout_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  platform_profile_id UUID,
  display_name TEXT NOT NULL,
  unresolved BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_people_member ON scout_people(member_id);
CREATE INDEX IF NOT EXISTS idx_scout_people_platform ON scout_people(platform_profile_id)
  WHERE platform_profile_id IS NOT NULL;

-- ─── scout_relationships ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES scout_people(id) ON DELETE CASCADE,
  how_they_know_each_other TEXT,
  tie_sources TEXT[] NOT NULL DEFAULT '{}',
  tie_features JSONB NOT NULL DEFAULT '{}',
  tie_strength NUMERIC,
  last_contact_at TIMESTAMPTZ,
  last_context TEXT,
  open_thread TEXT,
  created_from TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (member_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_scout_relationships_member ON scout_relationships(member_id);

-- ─── scout_standing_intents ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_standing_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  location TEXT,
  industry TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'fulfilled', 'expired', 'unconfirmed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_confirmed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE INDEX IF NOT EXISTS idx_scout_standing_intents_member ON scout_standing_intents(member_id);
CREATE INDEX IF NOT EXISTS idx_scout_standing_intents_status ON scout_standing_intents(status);

-- ─── scout_rejections ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_rejections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('person', 'criterion', 'action')),
  value TEXT NOT NULL,
  person_id UUID REFERENCES scout_people(id) ON DELETE SET NULL,
  platform_profile_id UUID,
  lifted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_rejections_member_active
  ON scout_rejections(member_id)
  WHERE lifted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_rejections_unique_active_person
  ON scout_rejections(member_id, COALESCE(platform_profile_id::text, lower(value)))
  WHERE lifted_at IS NULL AND type = 'person';

CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_rejections_unique_active_criterion
  ON scout_rejections(member_id, lower(value))
  WHERE lifted_at IS NULL AND type = 'criterion';

-- ─── scout_visibility_requests ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_visibility_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  platform_profile_ids UUID[] NOT NULL DEFAULT '{}',
  context TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'asked', 'opted_in', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_visibility_member ON scout_visibility_requests(member_id);

-- ─── scout_turn_logs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_turn_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  inbound_text TEXT,
  tool_calls JSONB NOT NULL DEFAULT '[]',
  tool_results JSONB NOT NULL DEFAULT '[]',
  rejection_set JSONB NOT NULL DEFAULT '[]',
  raw_model_output JSONB,
  validation JSONB,
  sent_text TEXT,
  latency_ms INT,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_turn_logs_profile
  ON scout_turn_logs(profile_id, created_at DESC);

-- ─── scout_settings singleton ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_settings (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001',
  tier1_introducible BOOLEAN NOT NULL DEFAULT true,
  tier2_introducible BOOLEAN NOT NULL DEFAULT true,
  tier3_introducible BOOLEAN NOT NULL DEFAULT false,
  tier4_introducible BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO scout_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE scout_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_standing_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_rejections ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_visibility_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_turn_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scout_people' AND policyname = 'Authenticated full access scout_people') THEN
    CREATE POLICY "Authenticated full access scout_people" ON scout_people FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scout_relationships' AND policyname = 'Authenticated full access scout_relationships') THEN
    CREATE POLICY "Authenticated full access scout_relationships" ON scout_relationships FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scout_standing_intents' AND policyname = 'Authenticated full access scout_standing_intents') THEN
    CREATE POLICY "Authenticated full access scout_standing_intents" ON scout_standing_intents FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scout_rejections' AND policyname = 'Authenticated full access scout_rejections') THEN
    CREATE POLICY "Authenticated full access scout_rejections" ON scout_rejections FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scout_visibility_requests' AND policyname = 'Authenticated full access scout_visibility_requests') THEN
    CREATE POLICY "Authenticated full access scout_visibility_requests" ON scout_visibility_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scout_turn_logs' AND policyname = 'Authenticated full access scout_turn_logs') THEN
    CREATE POLICY "Authenticated full access scout_turn_logs" ON scout_turn_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scout_settings' AND policyname = 'Authenticated full access scout_settings') THEN
    CREATE POLICY "Authenticated full access scout_settings" ON scout_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
