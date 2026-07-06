export type BrainTaskStatus =
  | 'queued'
  | 'planning'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BrainTaskLogEntry {
  at: string;
  kind: 'info' | 'tool' | 'cursor' | 'error' | 'grill';
  message: string;
}

export interface BrainTaskRow {
  id: string;
  employee_id: string | null;
  source: string;
  conversation_id: string | null;
  linear_issue_id: string | null;
  goal: string;
  plan: string | null;
  status: BrainTaskStatus;
  cursor_agent_id: string | null;
  cursor_agent_url: string | null;
  cursor_run_id: string | null;
  cursor_run_status: string | null;
  cursor_pr_url: string | null;
  cursor_branch: string | null;
  cursor_pr_merged: boolean;
  integration_branch: string | null;
  github_repo: string;
  max_minutes: number;
  iteration_count: number;
  max_iterations: number;
  result_summary: string | null;
  error: string | null;
  log: BrainTaskLogEntry[];
  next_run_at: string | null;
  deadline_at: string | null;
  slack_channel: string | null;
  slack_thread_ts: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBrainTaskInput {
  goal: string;
  linearIssueId?: string | null;
  maxMinutes?: number;
  source?: 'chat' | 'slack' | 'automation';
  conversationId?: string | null;
  employeeId?: string | null;
  slackChannel?: string | null;
  slackThreadTs?: string | null;
}
