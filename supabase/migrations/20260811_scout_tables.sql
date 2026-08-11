-- Migration: Scout networking assistant tables
-- Date: 2026-08-11
-- Purpose: Sandboxed pilot for AI networking conversations via Linq

-- ─── scout_profiles ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  chapter TEXT,
  university TEXT,
  graduation_year INT,
  location TEXT,
  current_title TEXT,
  career_interest TEXT,
  goals JSONB DEFAULT '[]',
  skills JSONB DEFAULT '[]',
  looking_for TEXT,
  opt_in_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (opt_in_status IN ('opted_in', 'opted_out', 'pending')),
  last_contact TIMESTAMPTZ,
  next_followup TIMESTAMPTZ,
  profile_complete INT DEFAULT 0,
  notes TEXT DEFAULT '',
  source_type TEXT CHECK (source_type IN ('platform_profile', 'manual')),
  source_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_profiles_opt_in
  ON scout_profiles(opt_in_status);

CREATE INDEX IF NOT EXISTS idx_scout_profiles_source
  ON scout_profiles(source_type, source_id);

-- ─── scout_conversations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES scout_profiles(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  linq_line TEXT NOT NULL,
  linq_chat_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_body TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  flagged BOOLEAN DEFAULT FALSE,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_conversations_phone_time
  ON scout_conversations(phone_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_conversations_line_time
  ON scout_conversations(linq_line, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_conversations_flagged
  ON scout_conversations(flagged)
  WHERE flagged = true;

CREATE INDEX IF NOT EXISTS idx_scout_conversations_profile
  ON scout_conversations(profile_id, created_at DESC);

-- ─── scout_introductions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_introductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES scout_profiles(id) ON DELETE CASCADE,
  target_id UUID REFERENCES scout_profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'pending_approval', 'sent', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_introductions_pending
  ON scout_introductions(status)
  WHERE status IN ('suggested', 'pending_approval');

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE scout_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_introductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access to scout_profiles"
  ON scout_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access to scout_conversations"
  ON scout_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users full access to scout_introductions"
  ON scout_introductions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Realtime ────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE scout_conversations;

COMMENT ON TABLE scout_profiles IS 'Scout networking assistant - hand-picked pilot profiles from external Trailblaize platform profiles table';
COMMENT ON TABLE scout_conversations IS 'Scout message log - synced with Linq iMessage/SMS conversations';
COMMENT ON TABLE scout_introductions IS 'Scout introduction requests between profiles';
