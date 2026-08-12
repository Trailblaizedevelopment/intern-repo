/**
 * Scout agent control plane: session memory, transitions, intro tools.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  AgentEvent,
  AgentEventType,
  findCandidateByNameQuery,
  parseAgentEvent,
} from '@/lib/scout/intent';
import {
  ScoutCandidate,
  candidateToSnapshot,
  formatAlumniMatches,
  pickNextCandidate,
  upsertSuggestedIntro,
} from '@/lib/scout/match';

export type AgentState =
  | 'warmup'
  | 'clarify_intent'
  | 'offer'
  | 'deep_dive'
  | 'await_requester_yes'
  | 'paused';

export interface FocusSnapshot {
  name: string;
  role?: string | null;
  major?: string | null;
  location?: string | null;
  hometown?: string | null;
  member_status?: string | null;
  grad_year?: number | null;
  linkedin_url?: string | null;
  bio?: string | null;
  reason?: string;
}

export interface AgentSession {
  agent_state: AgentState;
  focus_person_id: string | null;
  focus_person_snapshot: FocusSnapshot | null;
  offered_ids: string[];
  rejected_ids: string[];
  active_intro_id: string | null;
}

export interface AgentTransitionResult {
  session: AgentSession;
  fromState: AgentState;
  toState: AgentState;
  event: AgentEvent;
  /** Single card (or empty) for Claude context */
  injectCard: ScoutCandidate | null;
  injectMode: 'focus' | 'offer' | 'none' | 'missing_focus' | 'pool_empty';
  remainingPool: number;
  /** Platform id declined on USER_SAID_NO (before next offer) */
  rejectedPlatformId: string | null;
  instructionKey:
    | 'open'
    | 'clarify'
    | 'offer'
    | 'deep_dive'
    | 'await_yes'
    | 'intro_confirmed'
    | 'meta_repair'
    | 'pool_empty'
    | 'missing_focus'
    | 'followup_nudge'
    | 'generic';
}

function baseResult(
  partial: Omit<AgentTransitionResult, 'rejectedPlatformId'> & { rejectedPlatformId?: string | null }
): AgentTransitionResult {
  return { rejectedPlatformId: null, ...partial };
}

function asUuidArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function asAgentState(v: unknown): AgentState {
  const s = String(v || 'warmup');
  const allowed: AgentState[] = [
    'warmup',
    'clarify_intent',
    'offer',
    'deep_dive',
    'await_requester_yes',
    'paused',
  ];
  return (allowed.includes(s as AgentState) ? s : 'warmup') as AgentState;
}

export function sessionFromProfileRow(row: Record<string, unknown>): AgentSession {
  const snap = row.focus_person_snapshot;
  return {
    agent_state: asAgentState(row.agent_state),
    focus_person_id: (row.focus_person_id as string | null) ?? null,
    focus_person_snapshot:
      snap && typeof snap === 'object' ? (snap as FocusSnapshot) : null,
    offered_ids: asUuidArray(row.offered_ids),
    rejected_ids: asUuidArray(row.rejected_ids),
    active_intro_id: (row.active_intro_id as string | null) ?? null,
  };
}

function snapshotFromCandidate(c: ScoutCandidate): FocusSnapshot {
  const snap = candidateToSnapshot(c);
  return {
    name: String(snap.name || c.name),
    role: (snap.role as string | null) ?? null,
    major: (snap.major as string | null) ?? null,
    location: (snap.location as string | null) ?? null,
    hometown: (snap.hometown as string | null) ?? null,
    member_status: (snap.member_status as string | null) ?? null,
    grad_year: (snap.grad_year as number | null) ?? null,
    linkedin_url: (snap.linkedin_url as string | null) ?? null,
    bio: (snap.bio as string | null) ?? null,
    reason: (snap.reason as string) || c.reason,
  };
}

function candidateFromFocus(
  session: AgentSession,
  candidates: ScoutCandidate[]
): ScoutCandidate | null {
  if (!session.focus_person_id) return null;
  const fromPool = candidates.find(c => c.platform_id === session.focus_person_id);
  if (fromPool) return fromPool;
  const snap = session.focus_person_snapshot;
  if (!snap?.name) return null;
  return {
    platform_id: session.focus_person_id,
    name: snap.name,
    role: snap.role ?? null,
    major: snap.major ?? null,
    location: snap.location ?? null,
    hometown: snap.hometown ?? null,
    member_status: snap.member_status ?? null,
    bio: snap.bio ?? null,
    linkedin_url: snap.linkedin_url ?? null,
    grad_year: snap.grad_year ?? null,
    score: 0,
    reason: snap.reason || 'focused',
    geoHit: false,
  };
}

function markOffered(session: AgentSession, id: string): AgentSession {
  if (session.offered_ids.includes(id)) return session;
  return { ...session, offered_ids: [...session.offered_ids, id] };
}

function applyOffer(
  session: AgentSession,
  candidates: ScoutCandidate[]
): { session: AgentSession; card: ScoutCandidate | null; remaining: number } {
  const card = pickNextCandidate(candidates, session.offered_ids, session.rejected_ids);
  if (!card) {
    return {
      session: {
        ...session,
        agent_state: 'offer',
        focus_person_id: null,
        focus_person_snapshot: null,
      },
      card: null,
      remaining: 0,
    };
  }
  let next = markOffered(session, card.platform_id);
  next = {
    ...next,
    agent_state: 'offer',
    focus_person_id: card.platform_id,
    focus_person_snapshot: snapshotFromCandidate(card),
  };
  const remaining = candidates.filter(
    c =>
      c.platform_id &&
      !next.offered_ids.includes(c.platform_id) &&
      !next.rejected_ids.includes(c.platform_id)
  ).length;
  return { session: next, card, remaining };
}

function applyFocus(
  session: AgentSession,
  candidates: ScoutCandidate[],
  personQuery: string | null
): { session: AgentSession; card: ScoutCandidate | null; found: boolean } {
  const found = findCandidateByNameQuery(candidates, personQuery);
  if (!found) {
    return { session: { ...session, agent_state: 'deep_dive' }, card: null, found: false };
  }
  let next = markOffered(session, found.platform_id);
  next = {
    ...next,
    agent_state: 'deep_dive',
    focus_person_id: found.platform_id,
    focus_person_snapshot: snapshotFromCandidate(found),
  };
  return { session: next, card: found, found: true };
}

/**
 * Transition session based on event. Intro DB side effects run in applyIntroSideEffects.
 */
export function transitionAgent(
  session: AgentSession,
  event: AgentEvent,
  opts: {
    matchReady: boolean;
    candidates: ScoutCandidate[];
    generateType: 'open' | 'reply' | 'followup';
  }
): AgentTransitionResult {
  const fromState = session.agent_state;
  let next = { ...session };
  let injectCard: ScoutCandidate | null = null;
  let injectMode: AgentTransitionResult['injectMode'] = 'none';
  let remainingPool = 0;
  let instructionKey: AgentTransitionResult['instructionKey'] = 'generic';

  const { matchReady, candidates, generateType } = opts;

  if (event.type === 'OPEN' || generateType === 'open') {
    next = { ...next, agent_state: 'warmup' };
    return baseResult({
      session: next,
      fromState,
      toState: next.agent_state,
      event,
      injectCard: null,
      injectMode: 'none',
      remainingPool: 0,
      instructionKey: 'open',
    });
  }

  if (event.type === 'USER_STOP') {
    next = { ...next, agent_state: 'paused' };
    return baseResult({
      session: next,
      fromState,
      toState: 'paused',
      event,
      injectCard: null,
      injectMode: 'none',
      remainingPool: 0,
      instructionKey: 'generic',
    });
  }

  if (event.type === 'USER_META_REPAIR') {
    injectCard = candidateFromFocus(next, candidates);
    injectMode = injectCard ? 'focus' : 'none';
    instructionKey = 'meta_repair';
    return baseResult({
      session: next,
      fromState,
      toState: next.agent_state,
      event,
      injectCard,
      injectMode,
      remainingPool: 0,
      instructionKey,
    });
  }

  if (!matchReady) {
    next = { ...next, agent_state: 'clarify_intent' };
    return baseResult({
      session: next,
      fromState,
      toState: 'clarify_intent',
      event,
      injectCard: null,
      injectMode: 'none',
      remainingPool: 0,
      instructionKey: generateType === 'followup' ? 'followup_nudge' : 'clarify',
    });
  }

  if (event.type === 'USER_ASKED_ABOUT') {
    const focused = applyFocus(next, candidates, event.personQuery);
    next = focused.session;
    if (!focused.found) {
      return baseResult({
        session: next,
        fromState,
        toState: next.agent_state,
        event,
        injectCard: null,
        injectMode: 'missing_focus',
        remainingPool: 0,
        instructionKey: 'missing_focus',
      });
    }
    return baseResult({
      session: next,
      fromState,
      toState: 'deep_dive',
      event,
      injectCard: focused.card,
      injectMode: 'focus',
      remainingPool: 0,
      instructionKey: 'deep_dive',
    });
  }

  if (event.type === 'USER_ASKED_WHO') {
    const offered = applyOffer(next, candidates);
    next = offered.session;
    if (!offered.card) {
      return baseResult({
        session: next,
        fromState,
        toState: 'offer',
        event,
        injectCard: null,
        injectMode: 'pool_empty',
        remainingPool: 0,
        instructionKey: 'pool_empty',
      });
    }
    return baseResult({
      session: next,
      fromState,
      toState: 'offer',
      event,
      injectCard: offered.card,
      injectMode: 'offer',
      remainingPool: offered.remaining,
      instructionKey: 'offer',
    });
  }

  if (event.type === 'USER_SAID_YES') {
    if (fromState === 'deep_dive' || fromState === 'await_requester_yes' || fromState === 'offer') {
      const card = candidateFromFocus(next, candidates);
      next = { ...next, agent_state: 'await_requester_yes' };
      return baseResult({
        session: next,
        fromState,
        toState: 'await_requester_yes',
        event,
        injectCard: card,
        injectMode: card ? 'focus' : 'none',
        remainingPool: 0,
        instructionKey: fromState === 'await_requester_yes' ? 'intro_confirmed' : 'await_yes',
      });
    }
  }

  if (event.type === 'USER_SAID_NO') {
    if (fromState === 'deep_dive' || fromState === 'await_requester_yes' || fromState === 'offer') {
      const rejectedPlatformId = next.focus_person_id;
      if (rejectedPlatformId && !next.rejected_ids.includes(rejectedPlatformId)) {
        next = {
          ...next,
          rejected_ids: [...next.rejected_ids, rejectedPlatformId],
          active_intro_id: null,
        };
      }
      const offered = applyOffer(next, candidates);
      next = offered.session;
      if (!offered.card) {
        return baseResult({
          session: next,
          fromState,
          toState: 'offer',
          event,
          injectCard: null,
          injectMode: 'pool_empty',
          remainingPool: 0,
          instructionKey: 'pool_empty',
          rejectedPlatformId,
        });
      }
      return baseResult({
        session: next,
        fromState,
        toState: 'offer',
        event,
        injectCard: offered.card,
        injectMode: 'offer',
        remainingPool: offered.remaining,
        instructionKey: 'offer',
        rejectedPlatformId,
      });
    }
  }

  if (event.type === 'FOLLOWUP_TICK') {
    if (fromState === 'deep_dive' || fromState === 'await_requester_yes') {
      const card = candidateFromFocus(next, candidates);
      return baseResult({
        session: next,
        fromState,
        toState: fromState,
        event,
        injectCard: card,
        injectMode: card ? 'focus' : 'none',
        remainingPool: 0,
        instructionKey: fromState === 'await_requester_yes' ? 'intro_confirmed' : 'followup_nudge',
      });
    }
    if (fromState === 'offer' || fromState === 'clarify_intent' || fromState === 'warmup') {
      if (matchReady) {
        const offered = applyOffer(next, candidates);
        next = offered.session;
        if (offered.card) {
          return baseResult({
            session: next,
            fromState,
            toState: 'offer',
            event,
            injectCard: offered.card,
            injectMode: 'offer',
            remainingPool: offered.remaining,
            instructionKey: 'followup_nudge',
          });
        }
      }
      return baseResult({
        session: { ...next, agent_state: matchReady ? 'offer' : 'clarify_intent' },
        fromState,
        toState: matchReady ? 'offer' : 'clarify_intent',
        event,
        injectCard: null,
        injectMode: matchReady ? 'pool_empty' : 'none',
        remainingPool: 0,
        instructionKey: 'followup_nudge',
      });
    }
  }

  if (fromState === 'warmup' || fromState === 'clarify_intent') {
    if (event.type === 'USER_SUBSTANCE' || event.type === 'USER_CLARIFY') {
      const offered = applyOffer(next, candidates);
      next = offered.session;
      if (offered.card) {
        return baseResult({
          session: next,
          fromState,
          toState: 'offer',
          event,
          injectCard: offered.card,
          injectMode: 'offer',
          remainingPool: offered.remaining,
          instructionKey: 'offer',
        });
      }
    }
    next = { ...next, agent_state: 'clarify_intent' };
    instructionKey = 'clarify';
  } else if (fromState === 'deep_dive' || fromState === 'await_requester_yes') {
    injectCard = candidateFromFocus(next, candidates);
    injectMode = injectCard ? 'focus' : 'none';
    instructionKey = fromState === 'await_requester_yes' ? 'await_yes' : 'deep_dive';
  } else if (fromState === 'offer') {
    injectCard = candidateFromFocus(next, candidates);
    injectMode = injectCard ? 'offer' : 'none';
    instructionKey = 'offer';
  }

  return baseResult({
    session: next,
    fromState,
    toState: next.agent_state,
    event,
    injectCard,
    injectMode,
    remainingPool,
    instructionKey,
  });
}

export async function persistAgentSession(
  profileId: string,
  session: AgentSession
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from('scout_profiles')
    .update({
      agent_state: session.agent_state,
      focus_person_id: session.focus_person_id,
      focus_person_snapshot: session.focus_person_snapshot,
      offered_ids: session.offered_ids,
      rejected_ids: session.rejected_ids,
      active_intro_id: session.active_intro_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId);

  if (error) {
    console.error('[scout/agent] persist failed:', error.message);
  }
}

/**
 * Side effects after transition: suggest / approve / decline intro rows.
 */
export async function applyIntroSideEffects(
  profileId: string,
  transition: AgentTransitionResult
): Promise<AgentSession> {
  let session = transition.session;
  const card = transition.injectCard;
  const eventType: AgentEventType = transition.event.type;

  if (
    card &&
    (transition.injectMode === 'offer' || transition.injectMode === 'focus') &&
    eventType !== 'USER_SAID_YES' &&
    eventType !== 'USER_SAID_NO'
  ) {
    const introId = await upsertSuggestedIntro(profileId, card, 'suggested');
    if (introId && (transition.toState === 'deep_dive' || transition.toState === 'offer')) {
      session = { ...session, active_intro_id: introId };
    }
  }

  if (eventType === 'USER_SAID_YES' && card && transition.toState === 'await_requester_yes') {
    const introId = await upsertSuggestedIntro(profileId, card, 'pending_approval');
    if (introId) {
      session = { ...session, active_intro_id: introId };
    }
  }

  if (eventType === 'USER_SAID_NO') {
    const supabase = getSupabaseAdmin();
    if (supabase && transition.rejectedPlatformId) {
      await supabase
        .from('scout_introductions')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('requester_id', profileId)
        .eq('platform_target_id', transition.rejectedPlatformId)
        .in('status', ['suggested', 'pending_approval']);
    }
    if (card) {
      const introId = await upsertSuggestedIntro(profileId, card, 'suggested');
      if (introId) session = { ...session, active_intro_id: introId };
    } else {
      session = { ...session, active_intro_id: null };
    }
  }

  return session;
}

export function formatAgentInject(transition: AgentTransitionResult): string | undefined {
  if (transition.injectMode === 'missing_focus') {
    const q = transition.event.personQuery || 'them';
    return `No exact match in the current pool for "${q}". Say you don't have a clear card yet — ask one clarifying question. Do NOT re-list a roster.`;
  }
  if (transition.injectMode === 'pool_empty') {
    return 'No unused matches left in the current pool. Be honest — ask how to narrow (city, industry) without inventing names.';
  }
  if (!transition.injectCard) return undefined;

  const mode = transition.injectMode === 'offer' ? 'list' : 'focus';
  let text = formatAlumniMatches([transition.injectCard], { mode });
  if (transition.remainingPool > 0 && transition.injectMode === 'offer') {
    text += `\n(${transition.remainingPool} more unused in pool — do not name them unless asked who else.)`;
  }
  return text;
}

export function instructionForTransition(
  transition: AgentTransitionResult,
  type: 'open' | 'reply' | 'followup'
): string {
  switch (transition.instructionKey) {
    case 'open':
      return 'Generate your opening message to this person. This is your first text to them — make it warm, low-stakes, and brief. 1-2 sentences max. Do not claim you lack network access.';
    case 'clarify':
      return 'Generate your next reply in discovery mode. Follow Discovery guidance (Next focus). Ask exactly one gap question or briefly acknowledge then ask. Never say the network is unsynced. 1-2 sentences max.';
    case 'offer':
      return 'Offer EXACTLY the one person under Relevant alumni matches with a sharp why. Ask if they want an intro or someone else. Do NOT list a roster or say "8 guys". 1-2 sentences max.';
    case 'deep_dive':
      return 'Answer ONLY about the focus person. End with one clear move (intro yes/no or what they care about). Do NOT restart with a network list. 1-2 sentences max.';
    case 'await_yes':
      return 'They said yes to an intro. Confirm you will have a teammate reach out to that person — do NOT claim you already texted them. 1-2 sentences max.';
    case 'intro_confirmed':
      return type === 'followup'
        ? 'Proactive nudge: remind them you are lining up the intro with the focus person / teammate. No roster. 1-2 sentences max.'
        : 'Confirm the intro request is with the team for the focus person. No roster dump. 1-2 sentences max.';
    case 'meta_repair':
      return 'They called out repetition. Apologize once briefly, then continue from current Agent mode / focus — do NOT paste a roster or "8 guys" opener. 1-2 sentences max.';
    case 'pool_empty':
      return 'No unused matches left. Be honest and ask one narrowing question. Do not invent people. 1-2 sentences max.';
    case 'missing_focus':
      return 'You could not find that person in the pool. Say so briefly and ask one clarifying question. No roster. 1-2 sentences max.';
    case 'followup_nudge':
      return transition.injectCard
        ? 'Proactive follow-up: nudge with the ONE person in context or ask if they want the intro. No roster. 1-2 sentences max.'
        : 'Proactive follow-up: one sharp discovery or check-in question. No roster. 1-2 sentences max.';
    default:
      return "Answer the user's LATEST message directly using Agent mode. Do NOT re-list a roster unless offering the single Next offer card. 1-2 sentences max.";
  }
}

export { parseAgentEvent };
