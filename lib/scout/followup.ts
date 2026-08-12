import { getSupabaseAdmin } from '@/lib/supabase-admin';

/** Initial open/reply → first proactive nudge */
export const FOLLOWUP_FIRST_HOURS = 48;
/** After first nudge → second (final) nudge */
export const FOLLOWUP_SECOND_HOURS = 72;
/** Max consecutive outbound without inbound (open + 2 nudges) */
export const MAX_UNANSWERED_OUTBOUND = 3;

const DEFAULT_SCOUT_LINE = '+16462101111';

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
  // unanswered === 2 → schedule final nudge
  return new Date(from.getTime() + FOLLOWUP_SECOND_HOURS * 60 * 60 * 1000).toISOString();
}

/**
 * After an outbound Scout message: set last_contact + next_followup based on unanswered streak.
 */
export async function scheduleAfterOutbound(profileId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const unanswered = await countUnansweredOutbound(profileId);
  const nextFollowup = computeNextFollowupIso(unanswered);
  const now = new Date().toISOString();

  await supabase
    .from('scout_profiles')
    .update({
      last_contact: now,
      next_followup: nextFollowup,
      updated_at: now,
    })
    .eq('id', profileId);

  return nextFollowup;
}

/** Clear proactive schedule when the contact texts back (before auto-reply). */
export async function clearFollowupSchedule(profileId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

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
