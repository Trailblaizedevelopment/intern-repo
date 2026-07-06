-- One row per Brain agent invocation (Slack, workspace, task orchestration).
-- Accessed only via service-role API routes; RLS enabled with no policies.

CREATE TABLE IF NOT EXISTS brain_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  surface TEXT NOT NULL CHECK (surface IN ('slack', 'workspace', 'task')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  conversation_id UUID REFERENCES brain_conversations(id) ON DELETE SET NULL,
  task_id UUID REFERENCES brain_tasks(id) ON DELETE SET NULL,
  slack_channel TEXT,
  slack_thread_ts TEXT,
  slack_user_id TEXT,
  model TEXT,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  latency_ms INT,
  tool_call_count INT NOT NULL DEFAULT 0,
  iteration_count INT NOT NULL DEFAULT 0,
  error TEXT,
  user_message_preview TEXT,
  reply_preview TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brain_agent_runs_created
  ON brain_agent_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brain_agent_runs_surface_created
  ON brain_agent_runs(surface, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brain_agent_runs_status_running
  ON brain_agent_runs(status, started_at DESC)
  WHERE status = 'running';

ALTER TABLE brain_agent_runs ENABLE ROW LEVEL SECURITY;
