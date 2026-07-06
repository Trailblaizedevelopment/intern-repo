import { SupabaseClient } from '@supabase/supabase-js';

export type AgentRunSurface = 'slack' | 'workspace' | 'task';
export type AgentRunStatus = 'running' | 'success' | 'failed';

export interface BrainAgentRunRow {
  id: string;
  employee_id: string | null;
  surface: AgentRunSurface;
  status: AgentRunStatus;
  conversation_id: string | null;
  task_id: string | null;
  slack_channel: string | null;
  slack_thread_ts: string | null;
  slack_user_id: string | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number | null;
  tool_call_count: number;
  iteration_count: number;
  error: string | null;
  user_message_preview: string | null;
  reply_preview: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
}

export interface StartAgentRunInput {
  employeeId: string | null;
  surface: AgentRunSurface;
  conversationId?: string | null;
  taskId?: string | null;
  slackChannel?: string | null;
  slackThreadTs?: string | null;
  slackUserId?: string | null;
  model: string;
  userMessagePreview?: string | null;
}

export interface FinalizeAgentRunInput {
  status: 'success' | 'failed';
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  toolCallCount: number;
  iterationCount: number;
  replyPreview?: string | null;
  error?: string | null;
}

function preview(text: string | null | undefined, max = 200): string | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export async function startAgentRun(
  supabase: SupabaseClient,
  input: StartAgentRunInput
): Promise<string | null> {
  const { data, error } = await supabase
    .from('brain_agent_runs')
    .insert([
      {
        employee_id: input.employeeId,
        surface: input.surface,
        status: 'running',
        conversation_id: input.conversationId ?? null,
        task_id: input.taskId ?? null,
        slack_channel: input.slackChannel ?? null,
        slack_thread_ts: input.slackThreadTs ?? null,
        slack_user_id: input.slackUserId ?? null,
        model: input.model,
        user_message_preview: preview(input.userMessagePreview),
      },
    ])
    .select('id')
    .single();

  if (error) {
    console.error('[brain/agent-runs] start failed:', error.message);
    return null;
  }
  return data.id;
}

export async function finalizeAgentRun(
  supabase: SupabaseClient,
  runId: string | null,
  input: FinalizeAgentRunInput
): Promise<void> {
  if (!runId) return;

  const { error } = await supabase
    .from('brain_agent_runs')
    .update({
      status: input.status,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      latency_ms: input.latencyMs,
      tool_call_count: input.toolCallCount,
      iteration_count: input.iterationCount,
      reply_preview: preview(input.replyPreview, 500),
      error: input.error ? preview(input.error, 500) : null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) {
    console.error('[brain/agent-runs] finalize failed:', error.message);
  }
}

export function extractUserMessagePreview(history: Array<{ role: string; content: unknown }>): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== 'user') continue;
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((b): b is { type: 'text'; text: string } => typeof b === 'object' && b !== null && 'type' in b && b.type === 'text')
        .map(b => b.text)
        .join('\n');
      if (text.trim()) return text;
    }
  }
  return null;
}

export function resolveAgentRunSurface(
  opts: { surface?: 'workspace' | 'slack'; taskId?: string | null }
): AgentRunSurface {
  if (opts.taskId) return 'task';
  return opts.surface === 'slack' ? 'slack' : 'workspace';
}
