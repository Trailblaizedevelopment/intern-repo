-- TRA-921: Scheduled Slack follow-ups (wake/ready/remind-at-time).
CREATE TABLE IF NOT EXISTS brain_scheduled_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'sent', 'cancelled', 'failed')
  ),
  slack_channel TEXT NOT NULL,
  slack_thread_ts TEXT,
  slack_user_id TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  message TEXT NOT NULL,
  source_message TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_scheduled_replies_due
  ON brain_scheduled_replies (status, due_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_brain_scheduled_replies_thread
  ON brain_scheduled_replies (slack_channel, slack_thread_ts, status);

ALTER TABLE brain_scheduled_replies ENABLE ROW LEVEL SECURITY;

INSERT INTO brain_automations (name, kind, schedule, config)
VALUES (
  'scheduled_slack_replies',
  'cron',
  '* * * * *',
  '{"description":"Every minute: fire due Dynamo Slack follow-ups (wake/ready/remind)"}'
)
ON CONFLICT (name) DO NOTHING;
