import { SupabaseClient } from '@supabase/supabase-js';
import { appendTaskLog, updateTaskStatus } from '../tasks/store';
import { BrainTaskRow } from '../tasks/types';
import { postSlackMessage } from './client';

const ACTIVE_STATUSES = ['queued', 'planning', 'running', 'blocked', 'awaiting_approval'] as const;

export function isTaskStopMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(stop|abort|halt|kill task|stop task|cancel task|stop slice|stop goal)\b/.test(t);
}

export async function findActiveTasksForSlackThread(
  supabase: SupabaseClient,
  channel: string,
  threadTs: string
): Promise<BrainTaskRow[]> {
  const { data } = await supabase
    .from('brain_tasks')
    .select('*')
    .eq('slack_channel', channel)
    .eq('slack_thread_ts', threadTs)
    .in('status', [...ACTIVE_STATUSES])
    .order('created_at', { ascending: false });

  return (data as BrainTaskRow[]) || [];
}

export async function cancelActiveTasksForSlackThread(
  supabase: SupabaseClient,
  channel: string,
  threadTs: string,
  reason = 'Cancelled by user via Slack'
): Promise<BrainTaskRow[]> {
  const active = await findActiveTasksForSlackThread(supabase, channel, threadTs);
  for (const task of active) {
    await updateTaskStatus(supabase, task.id, 'cancelled', {
      error: reason,
      pending_cursor_dispatch: null,
      next_run_at: null,
      result_summary: reason,
    });
    await appendTaskLog(supabase, task.id, { kind: 'info', message: reason });
  }
  return active;
}

export async function handleTaskStopMessage(
  supabase: SupabaseClient,
  channel: string,
  threadTs: string
): Promise<string> {
  const cancelled = await cancelActiveTasksForSlackThread(supabase, channel, threadTs);
  if (cancelled.length === 0) {
    return 'No active brain tasks in this thread.';
  }

  const lines = [
    `*Stopped ${cancelled.length} task(s)*`,
    ...cancelled.map(t => {
      const label = t.task_kind === 'slice' ? 'Slice' : 'Goal';
      return `• ${label} \`${t.id.slice(0, 8)}…\`${t.linear_issue_id ? ` · ${t.linear_issue_id}` : ''}`;
    }),
  ];
  const msg = lines.join('\n');
  await postSlackMessage(channel, msg, threadTs);
  return msg;
}
