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
  shouldFetchMatches,
  upsertSuggestedIntros,
} from '@/lib/scout/match';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 256;

export interface GenerateScoutResult {
  message: string | null;
  skipped?: boolean;
  reason?: string;
  matchCount?: number;
}

/**
 * Shared Scout message generation for agent API, send, and Linq webhook.
 * Injects platform chapter matches on replies when looking_for or career_interest is set.
 */
export async function generateScoutMessage(
  profileId: string,
  type: 'open' | 'reply'
): Promise<GenerateScoutResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { message: null, skipped: true, reason: 'missing_api_key' };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { message: null, skipped: true, reason: 'db_not_configured' };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('scout_profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (profileErr || !profile) {
    return { message: null, skipped: true, reason: 'profile_not_found' };
  }

  if (profile.opt_in_status === 'opted_out') {
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

  // Max 2 unanswered outbound follow-ups (for reply path)
  if (type === 'reply') {
    let unansweredCount = 0;
    // If last message is inbound (just received), count outbound streak before it
    const startIdx = history.length > 0 && history[history.length - 1].direction === 'inbound'
      ? history.length - 2
      : history.length - 1;
    for (let i = startIdx; i >= 0; i--) {
      if (history[i].direction === 'outbound') {
        unansweredCount++;
      } else {
        break;
      }
    }
    if (unansweredCount >= 2) {
      return { message: null, skipped: true, reason: 'max_unanswered_followups' };
    }
  }

  let alumniMatches: string | undefined;
  let matchCount = 0;

  if (shouldFetchMatches(type, profile)) {
    const candidates = await findChapterCandidates({
      id: profile.id,
      platform_chapter_id: profile.platform_chapter_id,
      source_type: profile.source_type,
      source_id: profile.source_id,
      looking_for: profile.looking_for,
      career_interest: profile.career_interest,
      goals: profile.goals,
      opt_in_status: profile.opt_in_status,
    });
    matchCount = candidates.length;
    alumniMatches = formatAlumniMatches(candidates);

    if (candidates.length > 0) {
      await upsertSuggestedIntros(profile.id, candidates);
    }
  }

  const profileContext: ScoutProfileContext = {
    name: profile.name,
    chapter: profile.chapter,
    university: profile.university,
    graduation_year: profile.graduation_year,
    current_title: profile.current_title,
    career_interest: profile.career_interest,
    looking_for: profile.looking_for,
    goals: Array.isArray(profile.goals) ? profile.goals : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
  };

  const userContent = buildScoutContext(profileContext, history, alumniMatches);

  const instruction =
    type === 'open'
      ? 'Generate your opening message to this person. This is your first text to them — make it warm, low-stakes, and brief. 1-2 sentences max.'
      : alumniMatches === EMPTY_MATCHES_INSTRUCTION
        ? 'Generate your next reply. No chapter matches are available — do not invent or name specific people. Stay in character. 1-2 sentences max.'
        : alumniMatches
          ? 'Generate your next reply. You may only name people from the Relevant alumni matches list. Stay in character. 1-2 sentences max.'
          : 'Generate your next reply in this conversation. Stay in character. 1-2 sentences max.';

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

  return { message: generatedText, matchCount };
}
