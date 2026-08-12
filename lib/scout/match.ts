import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';

export const EMPTY_MATCHES_INSTRUCTION =
  'None found in this chapter. Do not invent or name specific people.';

const PEER_FETCH_LIMIT = 200;
const TOP_N = 5;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'with',
  'into', 'my', 'me', 'i', 'im', "i'm", 'looking', 'want', 'need', 'get', 'a',
  'some', 'any', 'help', 'about', 'from', 'be', 'is', 'are', 'was', 'were',
]);

export interface ScoutCandidate {
  platform_id: string;
  name: string;
  role: string | null;
  major: string | null;
  location: string | null;
  member_status: string | null;
  bio: string | null;
  linkedin_url: string | null;
  grad_year: number | null;
  score: number;
  reason: string;
}

export interface ScoutProfileForMatch {
  id: string;
  platform_chapter_id: string | null;
  source_type: string | null;
  source_id: string | null;
  looking_for: string | null;
  career_interest: string | null;
  goals: unknown;
  opt_in_status?: string | null;
}

interface PlatformPeer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  role: string | null;
  major: string | null;
  location: string | null;
  member_status: string | null;
  bio: string | null;
  linkedin_url: string | null;
  grad_year: number | null;
  chapter_id: string | null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function peerName(p: PlatformPeer): string {
  return (
    p.full_name ||
    [p.first_name, p.last_name].filter(Boolean).join(' ') ||
    'Unknown'
  );
}

function buildQueryTokens(profile: ScoutProfileForMatch): string[] {
  const goals = Array.isArray(profile.goals)
    ? profile.goals.filter((g): g is string => typeof g === 'string').join(' ')
    : '';
  const raw = [profile.looking_for, profile.career_interest, goals]
    .filter(Boolean)
    .join(' ');
  return [...new Set(tokenize(raw))];
}

function wantsAlumniBoost(tokens: string[]): boolean {
  const alumniHints = ['mentor', 'alumni', 'alum', 'job', 'internship', 'career', 'hire', 'hiring'];
  return tokens.some(t => alumniHints.includes(t));
}

function scorePeer(
  peer: PlatformPeer,
  tokens: string[],
  boostAlumni: boolean
): { score: number; reason: string } {
  if (tokens.length === 0) {
    let score = 0;
    const bits: string[] = [];
    if (peer.role) {
      score += 2;
      bits.push(`role: ${peer.role}`);
    }
    if (peer.linkedin_url) score += 1;
    if (peer.bio) score += 1;
    return {
      score,
      reason: bits.length > 0 ? bits.join('; ') : 'chapter peer',
    };
  }

  let score = 0;
  const matched: string[] = [];
  const fields: Array<{ label: string; value: string | null; weight: number }> = [
    { label: 'role', value: peer.role, weight: 3 },
    { label: 'major', value: peer.major, weight: 2 },
    { label: 'location', value: peer.location, weight: 2 },
    { label: 'bio', value: peer.bio, weight: 1 },
  ];

  for (const field of fields) {
    if (!field.value) continue;
    const fieldTokens = new Set(tokenize(field.value));
    const hits = tokens.filter(t => fieldTokens.has(t) || field.value!.toLowerCase().includes(t));
    if (hits.length > 0) {
      score += hits.length * field.weight;
      matched.push(`${field.label} (~${hits.slice(0, 3).join(', ')})`);
    }
  }

  if (peer.linkedin_url) score += 1;
  if (peer.bio && peer.bio.trim().length > 0) score += 1;

  if (boostAlumni && peer.member_status) {
    const status = peer.member_status.toLowerCase();
    if (status.includes('alumni') || status.includes('alum') || status.includes('graduat')) {
      score += 3;
      matched.push(`status: ${peer.member_status}`);
    }
  }

  return {
    score,
    reason: matched.length > 0 ? matched.join('; ') : 'chapter peer',
  };
}

/**
 * Resolve platform_chapter_id, backfilling from platform via source_id when missing.
 */
export async function resolvePlatformChapterId(
  profile: ScoutProfileForMatch
): Promise<string | null> {
  if (profile.platform_chapter_id) return profile.platform_chapter_id;

  if (profile.source_type !== 'platform_profile' || !profile.source_id) {
    return null;
  }

  const platform = getPlatformAdmin();
  const supabase = getSupabaseAdmin();
  if (!platform || !supabase) return null;

  const { data: platformProfile, error } = await platform
    .from('profiles')
    .select('chapter_id')
    .eq('id', profile.source_id)
    .single();

  if (error || !platformProfile?.chapter_id) {
    console.error('[scout/match] Failed to backfill chapter_id:', error?.message);
    return null;
  }

  const chapterId = platformProfile.chapter_id as string;

  const { error: updateErr } = await supabase
    .from('scout_profiles')
    .update({
      platform_chapter_id: chapterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id);

  if (updateErr) {
    console.error('[scout/match] Failed to persist platform_chapter_id:', updateErr.message);
  }

  return chapterId;
}

export async function findChapterCandidates(
  profile: ScoutProfileForMatch
): Promise<ScoutCandidate[]> {
  if (profile.opt_in_status === 'opted_out') return [];

  const chapterId = await resolvePlatformChapterId(profile);
  if (!chapterId) return [];

  const platform = getPlatformAdmin();
  if (!platform) return [];

  const { data: peers, error } = await platform
    .from('profiles')
    .select(
      'id, first_name, last_name, full_name, role, major, location, member_status, bio, linkedin_url, grad_year, chapter_id'
    )
    .eq('chapter_id', chapterId)
    .limit(PEER_FETCH_LIMIT);

  if (error) {
    console.error('[scout/match] Platform peer query failed:', error.message);
    return [];
  }

  const list = (peers || []) as PlatformPeer[];
  const tokens = buildQueryTokens(profile);
  const boostAlumni = wantsAlumniBoost(tokens);

  const scored: ScoutCandidate[] = [];
  for (const peer of list) {
    if (profile.source_id && peer.id === profile.source_id) continue;

    const { score, reason } = scorePeer(peer, tokens, boostAlumni);
    scored.push({
      platform_id: peer.id,
      name: peerName(peer),
      role: peer.role,
      major: peer.major,
      location: peer.location,
      member_status: peer.member_status,
      bio: peer.bio,
      linkedin_url: peer.linkedin_url,
      grad_year: peer.grad_year,
      score,
      reason,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, TOP_N);
}

export function formatAlumniMatches(candidates: ScoutCandidate[]): string {
  if (candidates.length === 0) return EMPTY_MATCHES_INSTRUCTION;

  return candidates
    .map((c, i) => {
      const parts = [
        `${i + 1}. ${c.name}`,
        c.role ? `role: ${c.role}` : null,
        c.major ? `major: ${c.major}` : null,
        c.location ? `location: ${c.location}` : null,
        c.member_status ? `status: ${c.member_status}` : null,
        c.grad_year ? `grad_year: ${c.grad_year}` : null,
        c.linkedin_url ? 'has LinkedIn' : null,
        `why: ${c.reason}`,
      ].filter(Boolean);
      return parts.join(' | ');
    })
    .join('\n');
}

export async function upsertSuggestedIntros(
  requesterId: string,
  candidates: ScoutCandidate[]
): Promise<void> {
  if (candidates.length === 0) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  for (const c of candidates) {
    const snapshot = {
      name: c.name,
      role: c.role,
      major: c.major,
      location: c.location,
      member_status: c.member_status,
      grad_year: c.grad_year,
      linkedin_url: c.linkedin_url,
    };

    const { data: existing } = await supabase
      .from('scout_introductions')
      .select('id')
      .eq('requester_id', requesterId)
      .eq('platform_target_id', c.platform_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('scout_introductions')
        .update({
          reason: c.reason,
          platform_target_snapshot: snapshot,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      continue;
    }

    const { error } = await supabase.from('scout_introductions').insert({
      requester_id: requesterId,
      target_id: null,
      platform_target_id: c.platform_id,
      platform_target_snapshot: snapshot,
      reason: c.reason,
      status: 'suggested',
    });

    if (error) {
      console.error('[scout/match] Intro upsert failed:', error.message);
    }
  }
}

/** Whether generation should fetch chapter matches for this profile + message type. */
export function shouldFetchMatches(
  type: 'open' | 'reply',
  profile: { looking_for: string | null; career_interest: string | null }
): boolean {
  if (type !== 'reply') return false;
  const looking = (profile.looking_for || '').trim();
  const interest = (profile.career_interest || '').trim();
  return looking.length > 0 || interest.length > 0;
}
