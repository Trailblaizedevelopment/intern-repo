import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  SCOUT_SYSTEM_PROMPT,
  buildScoutContext,
  ScoutProfileContext,
  ScoutConversationMessage,
} from '@/lib/scout/prompt';
import {
  EMPTY_MATCHES_INSTRUCTION,
  findChapterCandidates,
  formatAlumniMatches,
  upsertSuggestedIntros,
  ScoutCandidate,
} from '@/lib/scout/match';
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
import { classifyReplyIntent, findCandidateByNameQuery } from '@/lib/scout/intent';

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
}

function latestInboundText(history: ScoutConversationMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].direction === 'inbound') return history[i].message_body;
  }
  return null;
}

/**
 * Shared Scout message generation for agent API, send, webhook, and proactive follow-ups.
 * Discovery-first: enrich from platform, extract chat facts, gate matching on readiness.
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

  // Max unanswered outbound without inbound (open + up to 2 proactive nudges)
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

  // 1) Silent platform enrichment
  let profile = await enrichProfileFromPlatform(toDiscoveryProfile(profileRow));

  // 2) Persist facts from conversation (when we have inbound answers)
  if ((type === 'reply' || type === 'followup') && history.some(m => m.direction === 'inbound')) {
    const extracted = await extractProfileUpdatesFromConversation(profile, history);
    profile = await applyProfileUpdates(profile, extracted);
  }

  const discovery = analyzeDiscovery(profile);
  const discoveryGuidance = formatDiscoveryGuidance(discovery);

  const latestInbound = latestInboundText(history);
  const replyIntent =
    type === 'reply' || type === 'followup'
      ? classifyReplyIntent(latestInbound)
      : { intent: 'other' as const, personQuery: null };

  // 3) Match when ready — inject based on reply intent (don't re-dump roster every turn)
  let alumniMatches: string | undefined;
  let matchCount = 0;
  const matchType = type === 'open' ? 'open' : 'reply';
  const matchReady = isMatchReady(matchType, profile);
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
    matchCount = candidates.length;

    if (replyIntent.intent === 'ask_about_person' && replyIntent.personQuery) {
      const focused = findCandidateByNameQuery(candidates, replyIntent.personQuery);
      alumniMatches = focused
        ? formatAlumniMatches([focused], { mode: 'focus' })
        : `No exact match in the current pool for "${replyIntent.personQuery}". Say you don't have a clear card on them yet — ask one clarifying question. Do NOT re-list the Texas roster.`;
    } else if (replyIntent.intent === 'ask_matches' || type === 'followup') {
      alumniMatches = formatAlumniMatches(candidates, { mode: 'list' });
    } else if (replyIntent.intent === 'meta_repeat') {
      alumniMatches = undefined;
    } else {
      alumniMatches =
        candidates.length > 0
          ? `Background match pool available (${candidates.length}) but DO NOT list them unless the user asks who is available. Answer their latest message first.`
          : undefined;
    }

    // #region agent log
    const debugInject = {
      type,
      matchReady,
      replyIntent,
      latestInbound: (latestInbound || '').slice(0, 120),
      looking_for: profile.looking_for,
      matchCount,
      injectMode: replyIntent.intent,
      formattedPreview: (alumniMatches || '').slice(0, 400),
    };
    console.log('[DEBUG 1cf407] generate match inject', JSON.stringify(debugInject));
    fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1cf407' },
      body: JSON.stringify({
        sessionId: '1cf407',
        runId: 'post-fix',
        hypothesisId: 'F,G',
        location: 'lib/scout/generate.ts:afterMatch',
        message: 'generate match inject',
        data: debugInject,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (candidates.length > 0 && (replyIntent.intent === 'ask_matches' || type === 'followup')) {
      await upsertSuggestedIntros(profile.id, candidates);
    }
  } else if (!matchReady) {
    // #region agent log
    console.log(
      '[DEBUG 1cf407] matching locked',
      JSON.stringify({ type, replyIntent, looking_for: profile.looking_for })
    );
    fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1cf407' },
      body: JSON.stringify({
        sessionId: '1cf407',
        runId: 'post-fix',
        hypothesisId: 'F',
        location: 'lib/scout/generate.ts:matchLocked',
        message: 'matching locked',
        data: { type, replyIntent, looking_for: profile.looking_for, gaps: discovery.gaps, matchReady },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }

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

  const userContent = buildScoutContext(
    profileContext,
    history,
    alumniMatches,
    discoveryGuidance
  );

  let instruction: string;
  if (type === 'open') {
    instruction =
      'Generate your opening message to this person. This is your first text to them — make it warm, low-stakes, and brief. 1-2 sentences max. Do not claim you lack network access.';
  } else if (replyIntent.intent === 'meta_repeat') {
    instruction =
      'The user is calling out that you keep repeating yourself. Apologize briefly in one short clause, then answer what they actually need next — do NOT re-list the Texas roster or say "8 guys" again. 1-2 sentences max.';
  } else if (replyIntent.intent === 'ask_about_person') {
    instruction =
      'The user asked about a SPECIFIC person. Answer ONLY about that person using the Focus person details if present. Do NOT restart with "I\'ve got 8 guys in Texas". 1-2 sentences max.';
  } else if (type === 'followup') {
    instruction =
      matchReady && alumniMatches && alumniMatches !== EMPTY_MATCHES_INSTRUCTION
        ? 'This is a proactive follow-up — they have not replied. Briefly nudge with one concrete match or one sharp question from Discovery guidance. Do not apologize for messaging. Never say the network is unsynced. 1-2 sentences max.'
        : 'This is a proactive follow-up — they have not replied. Nudge once using Discovery guidance (Next focus). One question max. Do not apologize, do not guilt them, never say the network is unsynced. 1-2 sentences max.';
  } else if (!matchReady) {
    instruction =
      'Generate your next reply in discovery mode. Follow Discovery guidance (Next focus). Ask exactly one gap question or briefly acknowledge then ask. Never say the network is unsynced or unavailable. Stay in character. 1-2 sentences max.';
  } else if (
    replyIntent.intent === 'ask_matches' &&
    alumniMatches &&
    alumniMatches !== EMPTY_MATCHES_INSTRUCTION
  ) {
    instruction =
      'User asked who is available. Highlight 2-3 people from Relevant alumni matches (or say there are several). Do not claim there is only one. 1-2 sentences max.';
  } else if (alumniMatches === EMPTY_MATCHES_INSTRUCTION) {
    instruction =
      'Generate your next reply. Matching is unlocked but no strong peers scored — do not invent people or blame sync. Narrow what would help. Stay in character. 1-2 sentences max.';
  } else {
    instruction =
      "Answer the user's LATEST message directly. Do NOT re-list the Texas roster unless they asked who is available. Stay in character. 1-2 sentences max.";
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
    matchCount,
    matchReady,
    replyIntent,
    replyPreview: generatedText.slice(0, 240),
  };
  console.log('[DEBUG 1cf407] generated scout reply', JSON.stringify(outDebug));
  fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1cf407' },
    body: JSON.stringify({
      sessionId: '1cf407',
      runId: 'post-fix',
      hypothesisId: 'F,G',
      location: 'lib/scout/generate.ts:output',
      message: 'generated scout reply',
      data: outDebug,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return { message: generatedText, matchCount, matchReady };
}
