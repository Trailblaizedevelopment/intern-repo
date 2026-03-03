-- Phase 1: Add outreach tracking fields to alumni_contacts
ALTER TABLE alumni_contacts
  ADD COLUMN IF NOT EXISTS provider_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_line INTEGER,
  ADD COLUMN IF NOT EXISTS touch1_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS touch2_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS touch3_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_text TEXT,
  ADD COLUMN IF NOT EXISTS response_classification TEXT CHECK (
    response_classification IN ('confirmed', 'wrong_number', 'question', 'declined', 'no_response', 'signed_up')
  );

-- Daily send/response tracking per line
CREATE TABLE IF NOT EXISTS outreach_daily_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  line_phone TEXT NOT NULL,
  line_label TEXT NOT NULL,
  sends_count INTEGER NOT NULL DEFAULT 0,
  responses_count INTEGER NOT NULL DEFAULT 0,
  signups_count INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, line_phone)
);

-- Per-chapter outreach message templates
CREATE TABLE IF NOT EXISTS outreach_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chapter_id UUID NOT NULL REFERENCES chapters(id),
  touch_number INTEGER NOT NULL CHECK (touch_number IN (1, 2, 3)),
  template_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store alumni join link on the chapter itself
ALTER TABLE chapters
  ADD COLUMN IF NOT EXISTS alumni_join_link TEXT;

-- Indexes for efficient outreach queries
CREATE INDEX IF NOT EXISTS idx_alumni_outreach_status ON alumni_contacts(chapter_id, outreach_status, is_imessage);
CREATE INDEX IF NOT EXISTS idx_alumni_provider_convo ON alumni_contacts(provider_conversation_id) WHERE provider_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alumni_touch_cadence ON alumni_contacts(chapter_id, is_imessage, touch1_sent_at, touch2_sent_at, touch3_sent_at);
