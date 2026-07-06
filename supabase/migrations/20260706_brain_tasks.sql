-- Phase 3: Durable multi-step work goals (orchestration / Cursor dispatch).
CREATE TABLE IF NOT EXISTS brain_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'slack', 'automation')),
  conversation_id UUID REFERENCES brain_conversations(id) ON DELETE SET NULL,
  linear_issue_id TEXT,
  goal TEXT NOT NULL,
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'planning', 'running', 'blocked', 'completed', 'failed', 'cancelled')
  ),
  cursor_agent_id TEXT,
  cursor_agent_url TEXT,
  github_repo TEXT NOT NULL DEFAULT 'Trailblaizedevelopment/Trailblaize-Web',
  max_minutes INT NOT NULL DEFAULT 60,
  iteration_count INT NOT NULL DEFAULT 0,
  max_iterations INT NOT NULL DEFAULT 12,
  result_summary TEXT,
  error TEXT,
  log JSONB NOT NULL DEFAULT '[]',
  next_run_at TIMESTAMPTZ DEFAULT NOW(),
  deadline_at TIMESTAMPTZ,
  slack_channel TEXT,
  slack_thread_ts TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_tasks_status_next
  ON brain_tasks(status, next_run_at)
  WHERE status IN ('queued', 'planning', 'running', 'blocked');

CREATE INDEX IF NOT EXISTS idx_brain_tasks_employee
  ON brain_tasks(employee_id, created_at DESC);

ALTER TABLE brain_tasks ENABLE ROW LEVEL SECURITY;
