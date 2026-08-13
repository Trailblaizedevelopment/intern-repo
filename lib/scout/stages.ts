/**
 * Discovery conversation stages (orthogonal to agent_state offer/intro control).
 */

import type { ScoutDiscoveryProfile } from '@/lib/scout/discovery';
import { analyzeDiscovery, isMatchReady } from '@/lib/scout/discovery';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type ConversationStage =
  | 'intro_sent'
  | 'needs_goals'
  | 'needs_background'
  | 'needs_context'
  | 'ready_for_match'
  | 'active'
  | 'opted_out';

const STAGE_ORDER: ConversationStage[] = [
  'intro_sent',
  'needs_goals',
  'needs_background',
  'needs_context',
  'ready_for_match',
  'active',
];

export function asConversationStage(v: unknown): ConversationStage {
  const s = String(v || 'intro_sent');
  const allowed: ConversationStage[] = [
    'intro_sent',
    'needs_goals',
    'needs_background',
    'needs_context',
    'ready_for_match',
    'active',
    'opted_out',
  ];
  return (allowed.includes(s as ConversationStage) ? s : 'intro_sent') as ConversationStage;
}

function hasLookingFor(profile: ScoutDiscoveryProfile): boolean {
  const looking = (profile.looking_for || '').trim();
  if (looking.length >= 8) return true;
  return Array.isArray(profile.goals) && profile.goals.length > 0;
}

function hasBackground(profile: ScoutDiscoveryProfile): boolean {
  if ((profile.bio || '').trim().length >= 20) return true;
  if ((profile.job_title || profile.current_title || '').trim().length >= 2) return true;
  if ((profile.company || '').trim().length >= 2) return true;
  if (Array.isArray(profile.skills) && profile.skills.length > 0) return true;
  return false;
}

function hasContext(profile: ScoutDiscoveryProfile): boolean {
  const loc = (profile.location || profile.hometown || '').trim();
  const industry = (profile.industry || profile.career_interest || '').trim();
  if (loc.length >= 2) return true;
  if (industry.length >= 3 && industry.toLowerCase() !== 'to be updated') return true;
  return false;
}

/**
 * Derive the correct discovery stage from profile fields (never regresses past ready/active/opted_out).
 */
export function deriveConversationStage(
  profile: ScoutDiscoveryProfile,
  current?: ConversationStage | null
): ConversationStage {
  if (current === 'opted_out') return 'opted_out';
  if (current === 'active') return 'active';

  if (!hasLookingFor(profile)) return 'needs_goals';
  if (!hasBackground(profile)) return 'needs_background';
  if (!hasContext(profile)) return 'needs_context';

  if (isMatchReady('reply', profile) || analyzeDiscovery(profile).matchReady) {
    return 'ready_for_match';
  }

  return 'needs_context';
}

/**
 * After inbound + optional extraction: advance stage forward only (except opted_out).
 */
export function advanceStageAfterInbound(
  profile: ScoutDiscoveryProfile,
  currentStage: ConversationStage
): ConversationStage {
  if (currentStage === 'opted_out') return 'opted_out';

  const derived = deriveConversationStage(profile, currentStage);

  // First reply after open: leave intro_sent
  if (currentStage === 'intro_sent') {
    return derived === 'intro_sent' ? 'needs_goals' : derived;
  }

  const curIdx = STAGE_ORDER.indexOf(currentStage);
  const derIdx = STAGE_ORDER.indexOf(derived);
  if (curIdx < 0) return derived;
  if (derIdx < 0) return currentStage;
  return derIdx >= curIdx ? derived : currentStage;
}

export function stageInstructionHint(stage: ConversationStage): string {
  switch (stage) {
    case 'intro_sent':
      return 'Soft goal: make them feel known (use name/chapter). Chat first — curiosity about what they\'re up to is enough.';
    case 'needs_goals':
      return 'Soft goal: learn what would make this useful — but if they\'re unsure, help them explore (forks, what they\'re into). Do NOT grill for a formal career goal.';
    case 'needs_background':
      return 'Soft goal: eventually learn what they bring — only when it fits the chat. Prefer reacting to what they shared over a resume question.';
    case 'needs_context':
      return 'Soft goal: city or industry if it comes up naturally. Never force a form field.';
    case 'ready_for_match':
      return 'Soft goal: you can offer ONE real match when it fits. Still chat like a friend.';
    case 'active':
      return 'Soft goal: stay useful and human. No fake people.';
    case 'opted_out':
      return 'Do not continue the conversation.';
    default:
      return '';
  }
}

/** True when the member signals uncertainty / no clear ask yet. */
export function looksUncertainAboutGoals(text: string | null | undefined): boolean {
  if (!text) return false;
  return /\b(idk|i\s*don'?t\s*know|not\s*sure|no\s*idea|dunno|figuring\s+(it|things)\s*out|just\s*(browsing|chatting|looking)|open\s*to\s*anything|don'?t\s*(really\s*)?know\s*what\s*i\s*want|whatever|nothing\s*specific|no\s*clue|kinda\s*lost|still\s*deciding)\b/i.test(
    text
  );
}

export async function persistConversationStage(
  profileId: string,
  stage: ConversationStage
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from('scout_profiles')
    .update({
      conversation_stage: stage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);
}
