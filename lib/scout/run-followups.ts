import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage, createChat } from '@/lib/linq';
import { generateScoutMessage } from '@/lib/scout/generate';
import {
  FOLLOWUP_FIRST_HOURS,
  FOLLOWUP_SECOND_HOURS,
  MAX_UNANSWERED_OUTBOUND,
  countUnansweredOutbound,
  resolveScoutSendContext,
  scheduleAfterOutbound,
} from '@/lib/scout/followup';

export interface ScoutFollowupRunResult {
  due: number;
  sent: number;
  skipped: number;
  errors: string[];
  details: Array<{ profile_id: string; name: string; status: string; reason?: string }>;
}

/**
 * Process Scout profiles whose next_followup is due (or overdue cold threads).
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

  const now = new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - FOLLOWUP_FIRST_HOURS * 60 * 60 * 1000).toISOString();

  // Backfill schedules for threads that never got next_followup set
  const { data: unscheduled } = await supabase
    .from('scout_profiles')
    .select('id, last_contact')
    .neq('opt_in_status', 'opted_out')
    .is('next_followup', null)
    .not('last_contact', 'is', null)
    .limit(50);

  for (const row of unscheduled || []) {
    const unanswered = await countUnansweredOutbound(row.id);
    if (unanswered <= 0 || unanswered >= MAX_UNANSWERED_OUTBOUND) continue;
    const base = row.last_contact ? new Date(row.last_contact) : now;
    const hours = unanswered === 1 ? FOLLOWUP_FIRST_HOURS : FOLLOWUP_SECOND_HOURS;
    const next = new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
    await supabase
      .from('scout_profiles')
      .update({ next_followup: next, updated_at: nowIso })
      .eq('id', row.id);
  }

  // Explicitly scheduled
  const { data: scheduled, error: schedErr } = await supabase
    .from('scout_profiles')
    .select('id, name, phone_number, opt_in_status, next_followup, last_contact')
    .neq('opt_in_status', 'opted_out')
    .not('next_followup', 'is', null)
    .lte('next_followup', nowIso)
    .order('next_followup', { ascending: true })
    .limit(limit);

  if (schedErr) {
    result.errors.push(schedErr.message);
    return result;
  }

  // Cold threads: unanswered outbound, no next_followup, last_contact old enough
  const { data: cold } = await supabase
    .from('scout_profiles')
    .select('id, name, phone_number, opt_in_status, next_followup, last_contact')
    .neq('opt_in_status', 'opted_out')
    .is('next_followup', null)
    .not('last_contact', 'is', null)
    .lte('last_contact', staleBefore)
    .order('last_contact', { ascending: true })
    .limit(limit);

  const seen = new Set<string>();
  const candidates = [...(scheduled || []), ...(cold || [])].filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  }).slice(0, limit);

  result.due = candidates.length;

  for (const profile of candidates) {
    try {
      const unanswered = await countUnansweredOutbound(profile.id);
      if (unanswered <= 0) {
        // Last message was inbound or empty — don't proactive-nudge; clear stale schedule
        await supabase
          .from('scout_profiles')
          .update({ next_followup: null, updated_at: nowIso })
          .eq('id', profile.id);
        result.skipped++;
        result.details.push({ profile_id: profile.id, name: profile.name, status: 'skipped', reason: 'awaiting_reply_or_empty' });
        continue;
      }

      if (unanswered >= MAX_UNANSWERED_OUTBOUND) {
        await supabase
          .from('scout_profiles')
          .update({ next_followup: null, updated_at: nowIso })
          .eq('id', profile.id);
        result.skipped++;
        result.details.push({ profile_id: profile.id, name: profile.name, status: 'skipped', reason: 'max_unanswered' });
        continue;
      }

      const ctx = await resolveScoutSendContext(profile.id);
      if (!ctx) {
        result.skipped++;
        result.details.push({ profile_id: profile.id, name: profile.name, status: 'skipped', reason: 'no_send_context' });
        continue;
      }

      const generated = await generateScoutMessage(profile.id, 'followup');
      if (!generated.message) {
        result.skipped++;
        result.details.push({
          profile_id: profile.id,
          name: profile.name,
          status: 'skipped',
          reason: generated.reason || 'generate_failed',
        });
        // Avoid hammering: push schedule out if generation failed transiently
        if (generated.reason !== 'max_unanswered_followups' && generated.reason !== 'opted_out') {
          const retryAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
          await supabase
            .from('scout_profiles')
            .update({ next_followup: retryAt, updated_at: nowIso })
            .eq('id', profile.id);
        } else {
          await supabase
            .from('scout_profiles')
            .update({ next_followup: null, updated_at: nowIso })
            .eq('id', profile.id);
        }
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

      await scheduleAfterOutbound(profile.id);
      result.sent++;
      result.details.push({ profile_id: profile.id, name: profile.name, status: 'sent' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      result.errors.push(`${profile.name}: ${msg}`);
      result.details.push({ profile_id: profile.id, name: profile.name, status: 'error', reason: msg });
    }
  }

  return result;
}
