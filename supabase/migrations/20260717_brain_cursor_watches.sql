-- TRA-919: Lightweight Path A Cursor finish watches (no brain_tasks / Slice).
CREATE TABLE IF NOT EXISTS brain_cursor_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linear_issue_id TEXT NOT NULL,
  issue_title TEXT,
  issue_url TEXT,
  status TEXT NOT NULL DEFAULT 'watching' CHECK (
    status IN ('watching', 'notified', 'failed_notified', 'expired', 'cancelled')
  ),
  cursor_agent_id TEXT,
  cursor_agent_url TEXT,
  cursor_run_id TEXT,
  cursor_run_status TEXT,
  cursor_pr_url TEXT,
  cursor_branch TEXT,
  slack_channel TEXT,
  slack_thread_ts TEXT,
  notified_at TIMESTAMPTZ,
  notified_kind TEXT CHECK (
    notified_kind IS NULL OR notified_kind IN ('finished', 'failed')
  ),
  last_polled_at TIMESTAMPTZ,
  last_error TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active watch per Linear ticket (re-dispatch upserts the same row).
CREATE UNIQUE INDEX IF NOT EXISTS idx_brain_cursor_watches_active_issue
  ON brain_cursor_watches (linear_issue_id)
  WHERE status = 'watching';

CREATE INDEX IF NOT EXISTS idx_brain_cursor_watches_poll
  ON brain_cursor_watches (status, expires_at, last_polled_at);

ALTER TABLE brain_cursor_watches ENABLE ROW LEVEL SECURITY;

INSERT INTO brain_automations (name, kind, schedule, config)
VALUES (
  'cursor_delegate_watch',
  'cron',
  '*/5 * * * *',
  '{"description":"Every 5 min: poll Path A Cursor watches; Slack when FINISHED while ticket In Progress"}'
)
ON CONFLICT (name) DO NOTHING;
