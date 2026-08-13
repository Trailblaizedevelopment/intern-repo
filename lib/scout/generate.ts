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
import {
  advanceStageAfterInbound,
  asConversationStage,
  ConversationStage,
  looksUncertainAboutGoals,
  persistConversationStage,
  stageInstructionHint,
} from '@/lib/scout/stages';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 320;

/** Minimum top score to treat chapter pool as usable for matching */
const MATCH_SCORE_THRESHOLD = 2;

export type ScoutGenerateType = 'open' | 'reply' | 'followup';

export interface GenerateScoutResult {
  message: string | null;
  skipped?: boolean;
  reason?: string;
  matchCount?: number;
  matchReady?: boolean;
  agentState?: string;
  conversationStage?: ConversationStage;
  profileUpdates?: boolean;
  introSuggested?: boolean;
  shouldStop?: boolean;
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

  if (profileRow.opt_in_status === 'opted_out' || profileRow.conversation_stage === 'opted_out') {
    return {
      message: null,
      skipped: true,
      reason: 'opted_out',
      conversationStage: 'opted_out',
      shouldStop: true,
    };
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
  let didProfileUpdates = false;

  if ((type === 'reply' || type === 'followup') && history.some(m => m.direction === 'inbound')) {
    const extracted = await extractProfileUpdatesFromConversation(profile, history);
    const before = JSON.stringify({
      looking_for: profile.looking_for,
      goals: profile.goals,
      location: profile.location,
    });
    profile = await applyProfileUpdates(profile, extracted);
    didProfileUpdates =
      before !==
      JSON.stringify({
        looking_for: profile.looking_for,
        goals: profile.goals,
        location: profile.location,
      });
  }

  const discovery = analyzeDiscovery(profile);
  const discoveryGuidance = formatDiscoveryGuidance(discovery);

  let conversationStage = asConversationStage(profileRow.conversation_stage);
  if (type === 'open') {
    conversationStage = conversationStage === 'opted_out' ? 'opted_out' : 'intro_sent';
  } else if (type === 'reply' || (type === 'followup' && history.some(m => m.direction === 'inbound'))) {
    conversationStage = advanceStageAfterInbound(profile, conversationStage);
  }

  const latestInbound = latestInboundText(history);
  const matchType = type === 'open' ? 'open' : 'reply';
  let matchReady = isMatchReady(matchType, profile) && conversationStage === 'ready_for_match';

  // Discovery stages: do not unlock matching until ready_for_match
  if (
    conversationStage !== 'ready_for_match' &&
    conversationStage !== 'active' &&
    type !== 'open'
  ) {
    matchReady = false;
  }

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

    const topScore = candidates[0]?.score ?? 0;
    if (candidates.length === 0 || topScore < MATCH_SCORE_THRESHOLD) {
      conversationStage = 'active';
      matchReady = false;
      candidates = [];
    }
    // Do NOT upsert top candidate every turn — that re-seeds the same person into Nucleus
  }

  await persistConversationStage(profileId, conversationStage);

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

  session = await applyIntroSideEffects(profileId, transition, {
    preferPendingApproval: conversationStage === 'ready_for_match',
  });
  transition = { ...transition, session };
  await persistAgentSession(profileId, session);

  let alumniMatches = formatAgentInject(transition);
  if (conversationStage === 'active' && !alumniMatches) {
    alumniMatches =
      'No strong chapter matches yet. Be honest that the network is still being built for their ask — do NOT invent people. Offer to refine city/industry or check back.';
  }

  const offeredNames =
    session.offered_ids.length > 0
      ? candidates
          .filter(c => session.offered_ids.includes(c.platform_id))
          .map(c => c.name)
          .slice(0, 12)
      : session.focus_person_snapshot?.name
        ? [session.focus_person_snapshot.name]
        : [];

  const stageHint = stageInstructionHint(conversationStage);
  const exploreMode =
    looksUncertainAboutGoals(latestInbound) ||
    (!matchReady &&
      conversationStage !== 'ready_for_match' &&
      conversationStage !== 'active' &&
      !(profile.looking_for || '').trim());

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
    conversation_stage: conversationStage,
  };

  const userContent = buildScoutContext(profileContext, history, alumniMatches, discoveryGuidance, {
    agentState: session.agent_state,
    focusName: session.focus_person_snapshot?.name || null,
    offeredNames,
    activeIntro: !!session.active_intro_id,
    conversationStage,
    stageHint,
    exploreMode,
  });

  const lastOutbound = [...history].reverse().find(m => m.direction === 'outbound')?.message_body || null;
  let instruction = instructionForTransition(transition, type, lastOutbound);

  // Soft stage north-star only — never replace conversational instructions with an interview script
  if (
    conversationStage !== 'ready_for_match' &&
    conversationStage !== 'active' &&
    transition.instructionKey !== 'offer' &&
    transition.instructionKey !== 'deep_dive' &&
    transition.instructionKey !== 'await_yes' &&
    transition.instructionKey !== 'intro_confirmed' &&
    transition.instructionKey !== 'meta_repair'
  ) {
    if (exploreMode || transition.instructionKey === 'explore' || transition.instructionKey === 'chat') {
      instruction = `${instruction}\nBackground (soft): ${stageHint}`;
      if (exploreMode) {
        instruction +=
          '\nThey may not know what they want — normalize that and explore with them. Do not demand a crisp goal.';
      }
    } else {
      instruction = `${instruction}\nBackground (soft): ${stageHint}\nReact to their latest message first; only then a natural follow-up if it fits.`;
    }
  }

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
    return {
      message: null,
      skipped: true,
      reason: 'ai_error',
      conversationStage,
      agentState: session.agent_state,
      matchReady,
      matchCount: candidates.length,
    };
  }

  const aiResponse = await res.json();
  const generatedText = aiResponse.content
    ?.filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim();

  if (!generatedText) {
    return {
      message: null,
      skipped: true,
      reason: 'ai_empty',
      conversationStage,
      agentState: session.agent_state,
    };
  }

  return {
    message: generatedText,
    matchCount: candidates.length,
    matchReady,
    agentState: session.agent_state,
    conversationStage,
    profileUpdates: didProfileUpdates,
    introSuggested: transition.injectMode === 'offer' || conversationStage === 'ready_for_match',
  };
}
