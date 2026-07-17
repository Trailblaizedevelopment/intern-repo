import { SupabaseClient } from '@supabase/supabase-js';
import { postSlackMessage } from '../slack/client';
import {
  listDueScheduledReplies,
  markScheduledReplyFailed,
  markScheduledReplySent,
} from './store';

export interface ScheduledRepliesRunResult {
  due: number;
  sent: number;
  failed: number;
  results: Array<{ id: string; ok: boolean; error?: string }>;
}

/** Fire all pending scheduled Slack replies that are due. */
export async function runScheduledSlackReplies(
  supabase: SupabaseClient
): Promise<ScheduledRepliesRunResult> {
  const due = await listDueScheduledReplies(supabase);
  const results: ScheduledRepliesRunResult['results'] = [];
  let sent = 0;
  let failed = 0;

  for (const row of due) {
    const post = await postSlackMessage(
      row.slack_channel,
      row.message,
      row.slack_thread_ts || undefined
    );

    if (post.ok) {
      await markScheduledReplySent(supabase, row.id);
      sent += 1;
      results.push({ id: row.id, ok: true });
    } else {
      const err = post.error || 'chat.postMessage failed';
      await markScheduledReplyFailed(supabase, row.id, err);
      failed += 1;
      results.push({ id: row.id, ok: false, error: err });
    }
  }

  return { due: due.length, sent, failed, results };
}
