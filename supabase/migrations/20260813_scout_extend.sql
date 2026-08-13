-- Scout extend: conversation stages, message idempotency, intro approval, follow-up queue
-- Date: 20260813
-- Additive only — does not recreate base scout tables

-- ─── conversation_stage on scout_profiles ────────────────────────────────────

ALTER TABLE scout_profiles
  ADD COLUMN IF NOT EXISTS conversation_stage TEXT NOT NULL DEFAULT 'intro_sent';

ALTER TABLE scout_profiles
  DROP CONSTRAINT IF EXISTS scout_profiles_conversation_stage_check;

ALTER TABLE scout_profiles
  ADD CONSTRAINT scout_profiles_conversation_stage_check
  CHECK (conversation_stage IN (
    'intro_sent',
    'needs_goals',
    'needs_background',
    'needs_context',
    'ready_for_match',
    'active',
    'opted_out'
  ));

CREATE INDEX IF NOT EXISTS idx_scout_profiles_conversation_stage
  ON scout_profiles(conversation_stage);

COMMENT ON COLUMN scout_profiles.conversation_stage IS 'Discovery arc stage (separate from agent_state offer/intro control)';

-- ─── linq_message_id on scout_conversations ──────────────────────────────────

ALTER TABLE scout_conversations
  ADD COLUMN IF NOT EXISTS linq_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scout_conversations_linq_message_id
  ON scout_conversations(linq_message_id)
  WHERE linq_message_id IS NOT NULL;

COMMENT ON COLUMN scout_conversations.linq_message_id IS 'Linq message id for inbound idempotency';

-- ─── intro approval metadata ─────────────────────────────────────────────────

ALTER TABLE scout_introductions
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

ALTER TABLE scout_introductions
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ─── scout_followup_queue ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scout_followup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES scout_profiles(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'day_3_checkin',
    'day_7_value',
    'day_30_reengagement',
    'custom',
    'intro_suggested'
  )),
  message_template TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'sent',
    'cancelled',
    'skipped'
  )),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scout_followup_queue_due
  ON scout_followup_queue (scheduled_for, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scout_followup_queue_profile
  ON scout_followup_queue(profile_id);

ALTER TABLE scout_followup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access to scout_followup_queue"
  ON scout_followup_queue FOR ALL TO authenticated USING (true) WITH CHECK (true);
