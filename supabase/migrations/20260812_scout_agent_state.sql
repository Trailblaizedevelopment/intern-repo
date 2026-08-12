-- Scout agent state machine: persisted conversation control plane
-- Date: 2026-08-12

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS agent_state TEXT NOT NULL DEFAULT 'warmup';

ALTER TABLE scout_profiles
  DROP CONSTRAINT IF EXISTS scout_profiles_agent_state_check;

ALTER TABLE scout_profiles
  ADD CONSTRAINT scout_profiles_agent_state_check
  CHECK (agent_state IN (
    'warmup',
    'clarify_intent',
    'offer',
    'deep_dive',
    'await_requester_yes',
    'paused'
  ));

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS focus_person_id UUID;

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS focus_person_snapshot JSONB;

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS offered_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS rejected_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS active_intro_id UUID REFERENCES scout_introductions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scout_profiles_agent_state
  ON scout_profiles(agent_state);

COMMENT ON COLUMN scout_profiles.agent_state IS 'Scout conversation control plane state';
COMMENT ON COLUMN scout_profiles.focus_person_id IS 'Platform profiles.id currently in deep_dive';
COMMENT ON COLUMN scout_profiles.focus_person_snapshot IS 'Denormalized focus card for reply context';
COMMENT ON COLUMN scout_profiles.offered_ids IS 'Platform profile ids already named in chat';
COMMENT ON COLUMN scout_profiles.rejected_ids IS 'Platform profile ids user passed on';
COMMENT ON COLUMN scout_profiles.active_intro_id IS 'Intro case awaiting requester/target progress';
