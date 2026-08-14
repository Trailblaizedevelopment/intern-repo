import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage, createChat } from '@/lib/linq';
import { generateScoutMessage } from '@/lib/scout/generate';
import {
  MAX_UNANSWERED_OUTBOUND,
  FOLLOWUP_RECENCY_HOURS,
  countUnansweredOutbound,
  fetchDueFollowups,
  markFollowupStatus,
  resolveScoutSendContext,
  scheduleAfterOutbound,
  hoursSinceLastInbound,
} from '@/lib/scout/followup';

export interface ScoutFollowupRunResult {
  due: number;
  sent: number;
  skipped: number;
  errors: string[];
  details: Array<{ profile_id: string; name: string; status: string; reason?: string; queue_id?: string }>;
}

/**
 * Drain scout_followup_queue: due pending rows → Claude followup → Linq send.
 */
export async function runScoutFollowups(limit = 20): Promise<ScoutFollowupRunResult> {
  const supabase = getSupabaseAdmin();
  const result: ScoutFollowupRunResult = {
    due: 0,
    sent: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  if (!supabase) {
    result.errors.push('Database not configured');
    return result;
  }

  const dueRows = await fetchDueFollowups(limit);
  result.due = dueRows.length;

  for (const row of dueRows) {
    try {
      const { data: profile } = await supabase
        .from('scout_profiles')
        .select('id, name, phone_number, opt_in_status')
        .eq('id', row.profile_id)
        .single();

      const name = profile?.name || 'unknown';

      if (!profile) {
        await markFollowupStatus(row.id, 'skipped');
        result.skipped++;
        result.details.push({
          profile_id: row.profile_id,
          name,
          status: 'skipped',
          reason: 'profile_missing',
          queue_id: row.id,
        });
        continue;
      }

      if (profile.opt_in_status === 'opted_out') {
        await markFollowupStatus(row.id, 'cancelled');
        result.skipped++;
        result.details.push({
          profile_id: profile.id,
          name,
          status: 'skipped',
          reason: 'opted_out_or_paused',
          queue_id: row.id,
        });
        continue;
      }

      const hours = await hoursSinceLastInbound(profile.id);
      if (hours != null && hours < FOLLOWUP_RECENCY_HOURS) {
        result.skipped++;
        result.details.push({
          profile_id: profile.id,
          name,
          status: 'skipped',
          reason: 'inbound_recency',
          queue_id: row.id,
        });
        continue;
      }

      const unanswered = await countUnansweredOutbound(profile.id);
      if (unanswered <= 0 && (row.trigger_type === 'custom' || row.trigger_type === 'day_3_checkin' || row.trigger_type === 'day_7_value')) {
        // Last message was inbound — cancel this proactive nudge
        await markFollowupStatus(row.id, 'cancelled');
        result.skipped++;
        result.details.push({
          profile_id: profile.id,
          name,
          status: 'skipped',
          reason: 'awaiting_reply_or_empty',
          queue_id: row.id,
        });
        continue;
      }

      if (unanswered >= MAX_UNANSWERED_OUTBOUND) {
        await markFollowupStatus(row.id, 'skipped');
        result.skipped++;
        result.details.push({
          profile_id: profile.id,
          name,
          status: 'skipped',
          reason: 'max_unanswered',
          queue_id: row.id,
        });
        continue;
      }

      const ctx = await resolveScoutSendContext(profile.id);
      if (!ctx) {
        await markFollowupStatus(row.id, 'skipped');
        result.skipped++;
        result.details.push({
          profile_id: profile.id,
          name,
          status: 'skipped',
          reason: 'no_send_context',
          queue_id: row.id,
        });
        continue;
      }

      const generated = await generateScoutMessage(profile.id, 'followup');
      if (!generated.message) {
        await markFollowupStatus(row.id, 'skipped');
        result.skipped++;
        result.details.push({
          profile_id: profile.id,
          name,
          status: 'skipped',
          reason: generated.reason || 'generate_failed',
          queue_id: row.id,
        });
        continue;
      }

      let linqChatId = ctx.linq_chat_id;
      if (linqChatId) {
        await sendMessage(linqChatId, generated.message, ctx.linq_line);
      } else {
        const chat = await createChat(ctx.linq_line, ctx.phone_number, generated.message);
        linqChatId = chat.id;
      }

      await supabase.from('scout_conversations').insert({
        profile_id: profile.id,
        phone_number: ctx.phone_number,
        linq_line: ctx.linq_line,
        linq_chat_id: linqChatId,
        direction: 'outbound',
        message_body: generated.message,
        read: true,
      });

      await markFollowupStatus(row.id, 'sent');
      await scheduleAfterOutbound(profile.id);
      result.sent++;
      result.details.push({
        profile_id: profile.id,
        name,
        status: 'sent',
        queue_id: row.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      result.errors.push(`${row.profile_id}: ${msg}`);
      result.details.push({
        profile_id: row.profile_id,
        name: 'unknown',
        status: 'error',
        reason: msg,
        queue_id: row.id,
      });
    }
  }

  return result;
}
