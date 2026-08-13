import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** Initial open/reply → first proactive nudge (legacy next_followup) */
export const FOLLOWUP_FIRST_HOURS = 48;
/** After first nudge → second (final) nudge */
export const FOLLOWUP_SECOND_HOURS = 72;
/** Max consecutive outbound without inbound (open + 2 nudges) */
export const MAX_UNANSWERED_OUTBOUND = 3;

const DEFAULT_SCOUT_LINE = '+16462101111';

export type FollowupTrigger =
  | 'day_3_checkin'
  | 'day_7_value'
  | 'day_30_reengagement'
  | 'custom'
  | 'intro_suggested';

export async function countUnansweredOutbound(profileId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data: messages } = await supabase
    .from('scout_conversations')
    .select('direction')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(20);

  let count = 0;
  for (const m of messages || []) {
    if (m.direction === 'outbound') count++;
    else break;
  }
  return count;
}

export function computeNextFollowupIso(unansweredOutboundAfterSend: number, from = new Date()): string | null {
  if (unansweredOutboundAfterSend <= 0) return null;
  if (unansweredOutboundAfterSend >= MAX_UNANSWERED_OUTBOUND) return null;
  if (unansweredOutboundAfterSend === 1) {
    return new Date(from.getTime() + FOLLOWUP_FIRST_HOURS * 60 * 60 * 1000).toISOString();
  }
  return new Date(from.getTime() + FOLLOWUP_SECOND_HOURS * 60 * 60 * 1000).toISOString();
}

async function refreshNextFollowupFromQueue(profileId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: next } = await supabase
    .from('scout_followup_queue')
    .select('scheduled_for')
    .eq('profile_id', profileId)
    .eq('status', 'pending')
    .order('scheduled_for', { ascending: true })
    .limit(1)
    .maybeSingle();

  const nextFollowup = (next?.scheduled_for as string) || null;
  await supabase
    .from('scout_profiles')
    .update({
      next_followup: nextFollowup,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);

  return nextFollowup;
}

/**
 * Enqueue a pending follow-up. Skips if an identical pending trigger already exists.
 */
export async function enqueueFollowup(
  profileId: string,
  trigger: FollowupTrigger,
  scheduledFor: Date | string,
  messageTemplate?: string | null
): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const scheduledIso = typeof scheduledFor === 'string' ? scheduledFor : scheduledFor.toISOString();

  const { data: existing } = await supabase
    .from('scout_followup_queue')
    .select('id')
    .eq('profile_id', profileId)
    .eq('trigger_type', trigger)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('scout_followup_queue')
      .update({ scheduled_for: scheduledIso, message_template: messageTemplate ?? null })
      .eq('id', existing.id);
    await refreshNextFollowupFromQueue(profileId);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from('scout_followup_queue')
    .insert({
      profile_id: profileId,
      scheduled_for: scheduledIso,
      trigger_type: trigger,
      message_template: messageTemplate ?? null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[scout/followup] enqueue failed:', error.message);
    return null;
  }

  await refreshNextFollowupFromQueue(profileId);
  return (data?.id as string) || null;
}

/** Day-3 (+72h) and day-7 (+168h) defaults for new Scout profiles. */
export async function enqueueDefaultFollowups(profileId: string, from = new Date()): Promise<void> {
  const day3 = new Date(from.getTime() + 72 * 60 * 60 * 1000);
  const day7 = new Date(from.getTime() + 168 * 60 * 60 * 1000);
  await enqueueFollowup(profileId, 'day_3_checkin', day3);
  await enqueueFollowup(profileId, 'day_7_value', day7);
}

export async function cancelPendingFollowups(
  profileId: string,
  triggers?: FollowupTrigger[]
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  let query = supabase
    .from('scout_followup_queue')
    .update({ status: 'cancelled' })
    .eq('profile_id', profileId)
    .eq('status', 'pending');

  if (triggers && triggers.length > 0) {
    query = query.in('trigger_type', triggers);
  }

  await query;
  await refreshNextFollowupFromQueue(profileId);
}

/**
 * After an outbound Scout message: set last_contact + sync next_followup from queue
 * (also upsert a short custom nudge based on unanswered streak for cron compatibility).
 */
export async function scheduleAfterOutbound(profileId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const unanswered = await countUnansweredOutbound(profileId);
  const nextCustom = computeNextFollowupIso(unanswered);
  const now = new Date().toISOString();

  await supabase
    .from('scout_profiles')
    .update({
      last_contact: now,
      updated_at: now,
    })
    .eq('id', profileId);

  if (nextCustom) {
    await enqueueFollowup(profileId, 'custom', nextCustom);
  } else {
    // Cancel custom nudges when streak maxed or inbound cleared unanswered
    await cancelPendingFollowups(profileId, ['custom']);
  }

  return refreshNextFollowupFromQueue(profileId);
}

/** Clear proactive schedule when the contact texts back (before auto-reply). */
export async function clearFollowupSchedule(profileId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  // Cancel day_3 / day_7 / custom when user replies
  await cancelPendingFollowups(profileId, ['day_3_checkin', 'day_7_value', 'custom']);

  await supabase
    .from('scout_profiles')
    .update({
      next_followup: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);
}

export interface ScoutSendContext {
  phone_number: string;
  linq_line: string;
  linq_chat_id: string | null;
}

/** Resolve Linq chat + line from recent Scout conversation history. */
export async function resolveScoutSendContext(profileId: string): Promise<ScoutSendContext | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: profile } = await supabase
    .from('scout_profiles')
    .select('phone_number')
    .eq('id', profileId)
    .single();

  if (!profile?.phone_number) return null;

  const { data: recent } = await supabase
    .from('scout_conversations')
    .select('linq_line, linq_chat_id, phone_number')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(10);

  const withChat = (recent || []).find(r => r.linq_chat_id);
  const withLine = (recent || []).find(r => r.linq_line);

  return {
    phone_number: profile.phone_number,
    linq_line: withLine?.linq_line || DEFAULT_SCOUT_LINE,
    linq_chat_id: withChat?.linq_chat_id || null,
  };
}

export interface DueFollowupRow {
  id: string;
  profile_id: string;
  scheduled_for: string;
  trigger_type: FollowupTrigger;
  message_template: string | null;
}

/** Select due pending queue rows for cron drain. */
export async function fetchDueFollowups(limit = 20): Promise<DueFollowupRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('scout_followup_queue')
    .select('id, profile_id, scheduled_for, trigger_type, message_template')
    .eq('status', 'pending')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[scout/followup] fetchDueFollowups:', error.message);
    return [];
  }

  return (data || []) as DueFollowupRow[];
}

export async function markFollowupStatus(
  queueId: string,
  status: 'sent' | 'cancelled' | 'skipped'
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const updates: Record<string, unknown> = { status };
  if (status === 'sent') updates.sent_at = new Date().toISOString();

  const { data } = await supabase
    .from('scout_followup_queue')
    .update(updates)
    .eq('id', queueId)
    .select('profile_id')
    .single();

  if (data?.profile_id) {
    await refreshNextFollowupFromQueue(data.profile_id as string);
  }
}
