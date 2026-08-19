import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { ActivationEventType } from '@/lib/scout/product';

export interface ActivationEventInput {
  memberId: string;
  type: ActivationEventType;
  communityId?: string | null;
  industry?: string | null;
  geo?: string | null;
  persona?: string | null;
  pathwayId?: string | null;
  introId?: string | null;
  outcome?: string | null;
  metadata?: Record<string, unknown>;
}

function stripPrivate(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const blocked = new Set([
    'message_body',
    'draft_text',
    'phone',
    'phone_e164',
    'email',
    'linkedin_url',
    'contacts',
    'address_book',
    'transcript',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (blocked.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Append-only activation event. Never stores message bodies, drafts, phones, or LinkedIn payloads. */
export async function emitActivationEvent(input: ActivationEventInput): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.from('scout_activation_events').insert({
    member_id: input.memberId,
    event_type: input.type,
    community_id: input.communityId || null,
    industry: input.industry || null,
    geo: input.geo || null,
    persona: input.persona || null,
    pathway_id: input.pathwayId || null,
    intro_id: input.introId || null,
    outcome: input.outcome || null,
    metadata: stripPrivate(input.metadata),
  });
  if (error) {
    console.error('[scout/events] insert failed:', error.message);
  }
}

export function personaFromStatus(memberStatus: string | null | undefined): string | null {
  if (!memberStatus) return null;
  const s = memberStatus.toLowerCase();
  if (s.includes('alumni') || s.includes('alum') || s.includes('graduat')) return 'alumni';
  if (s.includes('active') || s.includes('pledge') || s.includes('member')) return 'active';
  return null;
}
