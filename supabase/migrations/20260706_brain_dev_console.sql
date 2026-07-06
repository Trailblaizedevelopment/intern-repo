-- Trailblaize Brain (Dev Console) — Phase 1
-- Conversations + action audit log for the Devin-only Brain agent.
-- Both tables are accessed ONLY via service-role API routes; RLS is enabled
-- with no policies so anon/authenticated clients cannot touch them directly.

CREATE TABLE IF NOT EXISTS brain_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT,
  -- Full Anthropic-format message history (role + content blocks)
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_conversations_employee
  ON brain_conversations(employee_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS brain_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'automation', 'manual')),
  conversation_id UUID REFERENCES brain_conversations(id) ON DELETE SET NULL,
  skill_name TEXT NOT NULL,
  input JSONB,
  output JSONB,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_action_log_created
  ON brain_action_log(created_at DESC);

ALTER TABLE brain_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_action_log ENABLE ROW LEVEL SECURITY;
