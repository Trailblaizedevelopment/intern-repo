import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  SCOUT_SYSTEM_PROMPT,
  buildScoutContext,
  ScoutProfileContext,
  ScoutConversationMessage,
} from '@/lib/scout/prompt';
import { findChapterCandidates, ScoutCandidate } from '@/lib/scout/match';
import {
  analyzeDiscovery,
  applyProfileUpdates,
  enrichProfileFromPlatform,
  extractProfileUpdatesFromConversation,
  formatDiscoveryGuidance,
  isMatchReady,
  toDiscoveryProfile,
} from '@/lib/scout/discovery';
import { MAX_UNANSWERED_OUTBOUND } from '@/lib/scout/followup';
import {
  applyIntroSideEffects,
  formatAgentInject,
  instructionForTransition,
  parseAgentEvent,
  persistAgentSession,
  sessionFromProfileRow,
  transitionAgent,
} from '@/lib/scout/agent';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 256;

export type ScoutGenerateType = 'open' | 'reply' | 'followup';

export interface GenerateScoutResult {
  message: string | null;
  skipped?: boolean;
  reason?: string;
  matchCount?: number;
  matchReady?: boolean;
  agentState?: string;
}

function latestInboundText(history: ScoutConversationMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].direction === 'inbound') return history[i].message_body;
  }
  return null;
}

/**
 * Shared Scout message generation: event → state transition → tools → reply writer.
 */
export async function generateScoutMessage(
  profileId: string,
  type: ScoutGenerateType
): Promise<GenerateScoutResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { message: null, skipped: true, reason: 'missing_api_key' };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { message: null, skipped: true, reason: 'db_not_configured' };
  }

  const { data: profileRow, error: profileErr } = await supabase
    .from('scout_profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (profileErr || !profileRow) {
    return { message: null, skipped: true, reason: 'profile_not_found' };
  }

  if (profileRow.opt_in_status === 'opted_out') {
    return { message: null, skipped: true, reason: 'opted_out' };
  }

  const { data: messages } = await supabase
    .from('scout_conversations')
    .select('direction, message_body, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true })
    .limit(30);

  const history: ScoutConversationMessage[] = (messages || []).map(m => ({
    direction: m.direction as 'inbound' | 'outbound',
    message_body: m.message_body,
    created_at: m.created_at,
  }));

  if (type === 'reply' || type === 'followup') {
    let unansweredCount = 0;
    const startIdx =
      history.length > 0 && history[history.length - 1].direction === 'inbound'
        ? history.length - 2
        : history.length - 1;
    for (let i = startIdx; i >= 0; i--) {
      if (history[i].direction === 'outbound') {
        unansweredCount++;
      } else {
        break;
      }
    }
    if (unansweredCount >= MAX_UNANSWERED_OUTBOUND) {
      return { message: null, skipped: true, reason: 'max_unanswered_followups' };
    }
  }

  let profile = await enrichProfileFromPlatform(toDiscoveryProfile(profileRow));

  if ((type === 'reply' || type === 'followup') && history.some(m => m.direction === 'inbound')) {
    const extracted = await extractProfileUpdatesFromConversation(profile, history);
    profile = await applyProfileUpdates(profile, extracted);
  }

  const discovery = analyzeDiscovery(profile);
  const discoveryGuidance = formatDiscoveryGuidance(discovery);

  const latestInbound = latestInboundText(history);
  const matchType = type === 'open' ? 'open' : 'reply';
  const matchReady = isMatchReady(matchType, profile);

  let session = sessionFromProfileRow(profileRow as Record<string, unknown>);

  let candidates: ScoutCandidate[] = [];
  if (matchReady && type !== 'open') {
    candidates = await findChapterCandidates({
      id: profile.id,
      platform_chapter_id: profile.platform_chapter_id,
      source_type: profile.source_type,
      source_id: profile.source_id,
      looking_for: profile.looking_for,
      career_interest: profile.career_interest || profile.industry,
      goals: profile.goals,
      opt_in_status: profileRow.opt_in_status,
    });
  }

  const knownNames = [
    ...candidates.map(c => c.name),
    session.focus_person_snapshot?.name,
  ].filter((n): n is string => typeof n === 'string' && n.length > 0);

  const event = parseAgentEvent(latestInbound, type, { knownNames });

  let transition = transitionAgent(session, event, {
    matchReady,
    candidates,
    generateType: type,
  });

  session = await applyIntroSideEffects(profileId, transition);
  transition = { ...transition, session };
  await persistAgentSession(profileId, session);

  const alumniMatches = formatAgentInject(transition);
  const offeredNames =
    session.offered_ids.length > 0
      ? candidates
          .filter(c => session.offered_ids.includes(c.platform_id))
          .map(c => c.name)
          .slice(0, 12)
      : session.focus_person_snapshot?.name
        ? [session.focus_person_snapshot.name]
        : [];

  // #region agent log
  const debugAgent = {
    type,
    matchReady,
    event: transition.event,
    fromState: transition.fromState,
    toState: transition.toState,
    injectMode: transition.injectMode,
    instructionKey: transition.instructionKey,
    focusId: session.focus_person_id,
    focusName: session.focus_person_snapshot?.name || null,
    offeredCount: session.offered_ids.length,
    rejectedCount: session.rejected_ids.length,
    remainingPool: transition.remainingPool,
    matchCount: candidates.length,
    latestInbound: (latestInbound || '').slice(0, 120),
    injectPreview: (alumniMatches || '').slice(0, 300),
  };
  console.log('[DEBUG 1cf407] agent transition', JSON.stringify(debugAgent));
  fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1cf407' },
    body: JSON.stringify({
      sessionId: '1cf407',
      runId: 'agent-machine',
      hypothesisId: 'agent',
      location: 'lib/scout/generate.ts:transition',
      message: 'agent transition',
      data: debugAgent,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const profileContext: ScoutProfileContext = {
    name: profile.name,
    chapter: profile.chapter,
    university: profile.university,
    graduation_year: profile.graduation_year,
    current_title: profile.current_title,
    career_interest: profile.career_interest,
    looking_for: profile.looking_for,
    goals: Array.isArray(profile.goals)
      ? profile.goals.filter((g): g is string => typeof g === 'string')
      : [],
    skills: Array.isArray(profile.skills)
      ? profile.skills.filter((s): s is string => typeof s === 'string')
      : [],
    location: profile.location,
    member_status: profile.member_status,
    industry: profile.industry,
    company: profile.company,
    job_title: profile.job_title,
    hometown: profile.hometown,
    linkedin_url: profile.linkedin_url,
    bio: profile.bio,
  };

  const userContent = buildScoutContext(profileContext, history, alumniMatches, discoveryGuidance, {
    agentState: session.agent_state,
    focusName: session.focus_person_snapshot?.name || null,
    offeredNames,
    activeIntro: !!session.active_intro_id,
  });

  const instruction = instructionForTransition(transition, type);

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SCOUT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${userContent}\n\n---\n\n${instruction}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[scout/generate] Anthropic error:', res.status, errText);
    return { message: null, skipped: true, reason: 'ai_error' };
  }

  const aiResponse = await res.json();
  const generatedText = aiResponse.content
    ?.filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim();

  if (!generatedText) {
    return { message: null, skipped: true, reason: 'ai_empty' };
  }

  // #region agent log
  const outDebug = {
    type,
    toState: transition.toState,
    instructionKey: transition.instructionKey,
    replyPreview: generatedText.slice(0, 240),
  };
  console.log('[DEBUG 1cf407] generated scout reply', JSON.stringify(outDebug));
  fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1cf407' },
    body: JSON.stringify({
      sessionId: '1cf407',
      runId: 'agent-machine',
      hypothesisId: 'agent',
      location: 'lib/scout/generate.ts:output',
      message: 'generated scout reply',
      data: outDebug,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return {
    message: generatedText,
    matchCount: candidates.length,
    matchReady,
    agentState: session.agent_state,
  };
}
