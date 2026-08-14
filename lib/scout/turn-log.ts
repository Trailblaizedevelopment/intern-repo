import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface ScoutTurnLogInput {
  profile_id: string;
  inbound_text: string | null;
  tool_calls: unknown;
  tool_results: unknown;
  rejection_set: unknown;
  raw_model_output: unknown;
  validation: unknown;
  sent_text: string | null;
  latency_ms: number;
  dry_run: boolean;
}

export async function persistTurnLog(input: ScoutTurnLogInput): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('scout_turn_logs')
    .insert({
      profile_id: input.profile_id,
      inbound_text: input.inbound_text,
      tool_calls: input.tool_calls,
      tool_results: input.tool_results,
      rejection_set: input.rejection_set,
      raw_model_output: input.raw_model_output,
      validation: input.validation,
      sent_text: input.sent_text,
      latency_ms: input.latency_ms,
      dry_run: input.dry_run,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[scout/turn-log] insert failed:', error.message);
    return null;
  }
  return (data?.id as string) || null;
}

export async function flagValidationFailure(
  profileId: string,
  reason: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { data: latest } = await supabase
    .from('scout_conversations')
    .select('id')
    .eq('profile_id', profileId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest?.id) {
    await supabase
      .from('scout_conversations')
      .update({ flagged: true, flag_reason: reason })
      .eq('id', latest.id);
  }
}
