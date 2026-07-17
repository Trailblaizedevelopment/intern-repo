import { SupabaseClient } from '@supabase/supabase-js';

export type ScheduledReplyStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

export interface BrainScheduledReplyRow {
  id: string;
  status: ScheduledReplyStatus;
  slack_channel: string;
  slack_thread_ts: string | null;
  slack_user_id: string | null;
  due_at: string;
  message: string;
  source_message: string | null;
  timezone: string;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface InsertScheduledReplyInput {
  slackChannel: string;
  slackThreadTs?: string | null;
  slackUserId?: string | null;
  dueAt: Date;
  message: string;
  sourceMessage?: string | null;
  timezone: string;
}

/** Cancel pending replies for a Slack thread (or channel if no thread). */
export async function cancelPendingScheduledReplies(
  supabase: SupabaseClient,
  channel: string,
  threadTs?: string | null
): Promise<number> {
  let query = supabase
    .from('brain_scheduled_replies')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('slack_channel', channel)
    .eq('status', 'pending');

  if (threadTs) {
    query = query.eq('slack_thread_ts', threadTs);
  } else {
    query = query.is('slack_thread_ts', null);
  }

  const { data, error } = await query.select('id');
  if (error) {
    console.error('[brain/scheduled-replies] cancel failed:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Insert a pending reply. Replaces any prior pending reply in the same thread
 * so "wake me at 7 instead" updates cleanly.
 */
export async function upsertScheduledReply(
  supabase: SupabaseClient,
  input: InsertScheduledReplyInput
): Promise<BrainScheduledReplyRow | null> {
  await cancelPendingScheduledReplies(
    supabase,
    input.slackChannel,
    input.slackThreadTs ?? null
  );

  const { data, error } = await supabase
    .from('brain_scheduled_replies')
    .insert([
      {
        status: 'pending',
        slack_channel: input.slackChannel,
        slack_thread_ts: input.slackThreadTs ?? null,
        slack_user_id: input.slackUserId ?? null,
        due_at: input.dueAt.toISOString(),
        message: input.message,
        source_message: input.sourceMessage ?? null,
        timezone: input.timezone,
      },
    ])
    .select('*')
    .single();

  if (error) {
    console.error('[brain/scheduled-replies] insert failed:', error.message);
    return null;
  }
  return data as BrainScheduledReplyRow;
}

export async function listDueScheduledReplies(
  supabase: SupabaseClient,
  limit = 20
): Promise<BrainScheduledReplyRow[]> {
  const { data, error } = await supabase
    .from('brain_scheduled_replies')
    .select('*')
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[brain/scheduled-replies] list due failed:', error.message);
    return [];
  }
  return (data || []) as BrainScheduledReplyRow[];
}

export async function markScheduledReplySent(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  await supabase
    .from('brain_scheduled_replies')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}

export async function markScheduledReplyFailed(
  supabase: SupabaseClient,
  id: string,
  errorMessage: string
): Promise<void> {
  await supabase
    .from('brain_scheduled_replies')
    .update({
      status: 'failed',
      last_error: errorMessage.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
}
