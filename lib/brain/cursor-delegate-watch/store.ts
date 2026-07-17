import { SupabaseClient } from '@supabase/supabase-js';

export type CursorWatchStatus =
  | 'watching'
  | 'notified'
  | 'failed_notified'
  | 'expired'
  | 'cancelled';

export type CursorWatchNotifyKind = 'finished' | 'failed';

export interface BrainCursorWatchRow {
  id: string;
  linear_issue_id: string;
  issue_title: string | null;
  issue_url: string | null;
  status: CursorWatchStatus;
  cursor_agent_id: string | null;
  cursor_agent_url: string | null;
  cursor_run_id: string | null;
  cursor_run_status: string | null;
  cursor_pr_url: string | null;
  cursor_branch: string | null;
  slack_channel: string | null;
  slack_thread_ts: string | null;
  notified_at: string | null;
  notified_kind: CursorWatchNotifyKind | null;
  last_polled_at: string | null;
  last_error: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/** Default watch window — long enough for Cursor + human lag, short enough to expire orphans. */
export const CURSOR_WATCH_TTL_MS = 72 * 60 * 60 * 1000;

export interface UpsertCursorWatchInput {
  linearIssueId: string;
  issueTitle?: string | null;
  issueUrl?: string | null;
  slackChannel?: string | null;
  slackThreadTs?: string | null;
  ttlMs?: number;
}

/** Start or refresh a Path A watch after successful Linear Cursor delegate. */
export async function upsertCursorWatch(
  supabase: SupabaseClient,
  input: UpsertCursorWatchInput
): Promise<BrainCursorWatchRow | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (input.ttlMs ?? CURSOR_WATCH_TTL_MS)).toISOString();
  const linearId = input.linearIssueId.trim().toUpperCase();

  const { data: existing } = await supabase
    .from('brain_cursor_watches')
    .select('id')
    .eq('linear_issue_id', linearId)
    .eq('status', 'watching')
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from('brain_cursor_watches')
      .update({
        issue_title: input.issueTitle ?? null,
        issue_url: input.issueUrl ?? null,
        slack_channel: input.slackChannel ?? null,
        slack_thread_ts: input.slackThreadTs ?? null,
        expires_at: expiresAt,
        last_error: null,
        updated_at: now.toISOString(),
      })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) {
      console.error('[brain/cursor-watch] upsert update failed:', error.message);
      return null;
    }
    return data as BrainCursorWatchRow;
  }

  const { data, error } = await supabase
    .from('brain_cursor_watches')
    .insert([
      {
        linear_issue_id: linearId,
        issue_title: input.issueTitle ?? null,
        issue_url: input.issueUrl ?? null,
        status: 'watching',
        slack_channel: input.slackChannel ?? null,
        slack_thread_ts: input.slackThreadTs ?? null,
        expires_at: expiresAt,
      },
    ])
    .select('*')
    .single();

  if (error) {
    console.error('[brain/cursor-watch] upsert insert failed:', error.message);
    return null;
  }
  return data as BrainCursorWatchRow;
}

export async function listActiveCursorWatches(
  supabase: SupabaseClient,
  limit = 40
): Promise<BrainCursorWatchRow[]> {
  const { data, error } = await supabase
    .from('brain_cursor_watches')
    .select('*')
    .eq('status', 'watching')
    .order('last_polled_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    console.error('[brain/cursor-watch] list failed:', error.message);
    return [];
  }
  return (data || []) as BrainCursorWatchRow[];
}

export async function updateCursorWatch(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<{
    status: CursorWatchStatus;
    issue_title: string | null;
    issue_url: string | null;
    cursor_agent_id: string | null;
    cursor_agent_url: string | null;
    cursor_run_id: string | null;
    cursor_run_status: string | null;
    cursor_pr_url: string | null;
    cursor_branch: string | null;
    notified_at: string | null;
    notified_kind: CursorWatchNotifyKind | null;
    last_polled_at: string | null;
    last_error: string | null;
    expires_at: string;
  }>
): Promise<void> {
  const { error } = await supabase
    .from('brain_cursor_watches')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[brain/cursor-watch] update failed:', error.message);
  }
}
