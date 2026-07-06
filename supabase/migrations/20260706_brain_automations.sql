-- Phase 2: Brain automations registry (cron-driven agent jobs).
CREATE TABLE IF NOT EXISTS brain_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'cron' CHECK (kind IN ('cron', 'manual')),
  schedule TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  last_status TEXT CHECK (last_status IS NULL OR last_status IN ('success', 'failed', 'skipped')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_automations_enabled
  ON brain_automations(enabled, name);

ALTER TABLE brain_automations ENABLE ROW LEVEL SECURITY;

INSERT INTO brain_automations (name, kind, schedule, config)
VALUES (
  'morning_briefing',
  'cron',
  '30 12 * * 1-5',
  '{"timezone":"America/New_York","hour":8,"minute":30,"description":"Weekday 8:30 AM ET Slack briefing"}'
)
ON CONFLICT (name) DO NOTHING;
