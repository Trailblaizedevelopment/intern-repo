/**
 * TRA-921: Slack fast-path for scheduling / cancelling follow-up pings.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { BrainMessage } from '../agent';
import {
  buildScheduledReplyBody,
  formatScheduledDueLabel,
  getScheduleTimezone,
  isCancelScheduleIntent,
  parseScheduleFollowUpIntent,
} from '../scheduled-replies/parse';
import {
  cancelPendingScheduledReplies,
  upsertScheduledReply,
} from '../scheduled-replies/store';

export async function tryScheduledFollowUpSlack(input: {
  message: string;
  history: BrainMessage[];
  supabase: SupabaseClient;
  channel: string;
  threadTs: string;
  userId: string;
}): Promise<{ reply: string; messages: BrainMessage[] } | null> {
  const text = input.message.trim();
  if (!text) return null;

  if (isCancelScheduleIntent(text)) {
    const n = await cancelPendingScheduledReplies(
      input.supabase,
      input.channel,
      input.threadTs
    );
    const reply =
      n > 0
        ? `Cancelled ${n} pending reminder${n === 1 ? '' : 's'} in this thread.`
        : 'No pending reminder in this thread to cancel.';
    return {
      reply,
      messages: [
        ...input.history,
        { role: 'user', content: text },
        { role: 'assistant', content: reply },
      ],
    };
  }

  const parsed = parseScheduleFollowUpIntent(text);
  if (!parsed) return null;

  const timezone = getScheduleTimezone();
  const body = buildScheduledReplyBody(parsed.kind);
  const row = await upsertScheduledReply(input.supabase, {
    slackChannel: input.channel,
    slackThreadTs: input.threadTs,
    slackUserId: input.userId,
    dueAt: parsed.dueAt,
    message: body,
    sourceMessage: text.slice(0, 500),
    timezone,
  });

  const when = formatScheduledDueLabel(parsed.dueAt, timezone);
  const reply = row
    ? [
        '*Scheduled*',
        '',
        `I'll ping this thread at *${when}*.`,
        'Reply *cancel reminder* to skip.',
      ].join('\n')
    : `I understood *${when}*, but could not save the reminder (DB error). Try again in a minute.`;

  return {
    reply,
    messages: [
      ...input.history,
      { role: 'user', content: text },
      { role: 'assistant', content: reply },
    ],
  };
}
