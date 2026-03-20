-- Migration: linq_conversations table
-- Run in Supabase SQL Editor if not applied automatically.

CREATE TABLE IF NOT EXISTS linq_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  linq_chat_id TEXT NOT NULL UNIQUE,
  contact_id UUID REFERENCES alumni_contacts(id) ON DELETE SET NULL,
  line_phone TEXT NOT NULL,
  line_label TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  chapter_id UUID,
  chapter_name TEXT,
  outreach_status TEXT,
  touch_stage TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'handled', 'flagged', 'archived')),
  flagged_reason TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_text TEXT,
  last_message_direction TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
  has_unread_reply BOOLEAN DEFAULT false,
  is_urgent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_linq_conversations_contact_id ON linq_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_linq_conversations_status ON linq_conversations(status);
CREATE INDEX IF NOT EXISTS idx_linq_conversations_last_message ON linq_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_linq_conversations_line ON linq_conversations(line_phone);
