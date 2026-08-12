import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';

export const EMPTY_MATCHES_INSTRUCTION =
  'None found in this chapter. Do not invent or name specific people.';

const PEER_FETCH_LIMIT = 200;
const TOP_N = 8;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'with',
  'into', 'my', 'me', 'i', 'im', "i'm", 'looking', 'want', 'need', 'get', 'a',
  'some', 'any', 'help', 'about', 'from', 'be', 'is', 'are', 'was', 'were',
  'out', 'more', 'see', 'who', 'build', 'broadly', 'base', 'network',
]);

const MEMBERSHIP_ROLE_VALUES = new Set([
  'alumni', 'alum', 'active', 'active_member', 'graduated', 'member', 'pledge', 'new_member',
]);

/** State / city tokens that should match common abbreviations and siblings. */
const GEO_EXPAND: Record<string, string[]> = {
  texas: ['texas', 'tx', 'dallas', 'houston', 'austin', 'fort', 'worth'],
  tx: ['texas', 'tx', 'dallas', 'houston', 'austin'],
  dallas: ['dallas', 'texas', 'tx'],
  houston: ['houston', 'texas', 'tx'],
  austin: ['austin', 'texas', 'tx'],
};

const GEO_INTENT_TOKENS = new Set([
  'texas', 'tx', 'dallas', 'houston', 'austin', 'california', 'ca', 'new', 'york', 'ny',
  'florida', 'fl', 'georgia', 'ga', 'mississippi', 'ms',
]);

export interface ScoutCandidate {
  platform_id: string;
  name: string;
  role: string | null;
  major: string | null;
  location: string | null;
  hometown?: string | null;
  member_status: string | null;
  bio: string | null;
  linkedin_url: string | null;
  grad_year: number | null;
  score: number;
  reason: string;
  geoHit?: boolean;
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
  hometown: string | null;
  current_place: unknown;
  member_status: string | null;
  bio: string | null;
  linkedin_url: string | null;
  grad_year: number | null;
  job_title: string | null;
  industry: string | null;
  company: string | null;
  chapter_id: string | null;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function expandTokens(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) {
    const extras = GEO_EXPAND[t];
    if (extras) extras.forEach(x => out.add(x));
  }
  return [...out];
}

function isMembershipLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  return MEMBERSHIP_ROLE_VALUES.has(value.toLowerCase().trim().replace(/\s+/g, '_'));
}

function placeToText(place: unknown): string | null {
  if (!place) return null;
  if (typeof place === 'string') return place;
  if (typeof place === 'object') {
    const p = place as Record<string, unknown>;
    const parts = [p.formatted_display, p.place_name, p.region_code, p.locality_name]
      .filter(x => typeof x === 'string' && x.trim())
      .map(x => String(x));
    return parts.length > 0 ? parts.join(' ') : null;
  }
  return null;
}

function peerName(p: PlatformPeer): string {
  return (
    p.full_name ||
    [p.first_name, p.last_name].filter(Boolean).join(' ') ||
    'Unknown'
  );
}

function peerGeoText(peer: PlatformPeer): string {
  return [peer.location, peer.hometown, placeToText(peer.current_place)]
    .filter(Boolean)
    .join(' ');
}

function buildQueryTokens(profile: ScoutProfileForMatch): string[] {
  const goals = Array.isArray(profile.goals)
    ? profile.goals.filter((g): g is string => typeof g === 'string').join(' ')
    : '';
  const raw = [profile.looking_for, profile.career_interest, goals]
    .filter(Boolean)
    .join(' ');
  return expandTokens([...new Set(tokenize(raw))]);
}

function hasGeoIntent(tokens: string[]): boolean {
  return tokens.some(t => GEO_INTENT_TOKENS.has(t) || Boolean(GEO_EXPAND[t]));
}

/** Strong career/help intent — not the fluff word "alumni" from "alumni base/network". */
function wantsAlumniBoost(tokens: string[]): boolean {
  const strong = ['mentor', 'mentorship', 'hire', 'hiring', 'internship', 'job', 'jobs'];
  return tokens.some(t => strong.includes(t));
}

function tokenHits(haystack: string, tokens: string[]): string[] {
  const lower = haystack.toLowerCase();
  const fieldTokens = new Set(tokenize(haystack));
  return tokens.filter(t => fieldTokens.has(t) || lower.includes(t));
}

function scorePeer(
  peer: PlatformPeer,
  tokens: string[],
  boostAlumni: boolean,
  geoIntent: boolean
): { score: number; reason: string; geoHit: boolean } {
  if (tokens.length === 0) {
    let score = 0;
    const bits: string[] = [];
    if (peer.job_title && !isMembershipLabel(peer.job_title)) {
      score += 2;
      bits.push(`title: ${peer.job_title}`);
    }
    if (peer.linkedin_url) score += 1;
    if (peer.bio) score += 1;
    return { score, reason: bits.length > 0 ? bits.join('; ') : 'chapter peer', geoHit: false };
  }

  let score = 0;
  const matched: string[] = [];

  const geoText = peerGeoText(peer);
  const geoHits = geoText ? tokenHits(geoText, tokens) : [];
  const geoHit = geoHits.length > 0;
  if (geoHit) {
    // Geography is the primary signal when user named a place
    score += geoHits.length * (geoIntent ? 6 : 2);
    matched.push(`geo (~${geoHits.slice(0, 4).join(', ')})`);
  }

  const careerFields: Array<{ label: string; value: string | null; weight: number }> = [
    { label: 'title', value: peer.job_title && !isMembershipLabel(peer.job_title) ? peer.job_title : null, weight: 3 },
    { label: 'company', value: peer.company, weight: 3 },
    { label: 'industry', value: peer.industry, weight: 3 },
    { label: 'major', value: peer.major, weight: 2 },
    { label: 'bio', value: peer.bio, weight: 1 },
  ];

  // Only score role when it's a real job label — never membership "alumni"/"active_member"
  if (peer.role && !isMembershipLabel(peer.role)) {
    careerFields.unshift({ label: 'role', value: peer.role, weight: 3 });
  }

  for (const field of careerFields) {
    if (!field.value) continue;
    const hits = tokenHits(field.value, tokens);
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
      score += 1;
      matched.push(`status: ${peer.member_status}`);
    }
  }

  // Soft preference for alums when user asked about alumni network without drowning geo
  if (geoIntent && geoHit && peer.member_status) {
    const status = peer.member_status.toLowerCase();
    if (status.includes('alumni') || status.includes('alum') || status.includes('graduat')) {
      score += 1;
    }
  }

  return {
    score,
    reason: matched.length > 0 ? matched.join('; ') : 'chapter peer',
    geoHit,
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
      'id, first_name, last_name, full_name, role, major, location, hometown, current_place, member_status, bio, linkedin_url, grad_year, job_title, industry, company, chapter_id'
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
  const geoIntent = hasGeoIntent(tokens);

  const scored: ScoutCandidate[] = [];
  for (const peer of list) {
    if (profile.source_id && peer.id === profile.source_id) continue;

    const { score, reason, geoHit } = scorePeer(peer, tokens, boostAlumni, geoIntent);
    scored.push({
      platform_id: peer.id,
      name: peerName(peer),
      role: peer.job_title && !isMembershipLabel(peer.job_title) ? peer.job_title : peer.role,
      major: peer.major,
      location: peer.location || placeToText(peer.current_place),
      hometown: peer.hometown,
      member_status: peer.member_status,
      bio: peer.bio,
      linkedin_url: peer.linkedin_url,
      grad_year: peer.grad_year,
      score,
      reason,
      geoHit,
    });
  }

  // When user named a place, prefer geo hits — don't let unrelated alums crowd them out
  scored.sort((a, b) => {
    if (geoIntent) {
      const ag = a.geoHit ? 1 : 0;
      const bg = b.geoHit ? 1 : 0;
      if (ag !== bg) return bg - ag;
    }
    return b.score - a.score;
  });

  const geoPool = geoIntent ? scored.filter(c => c.geoHit) : [];
  const top = (geoIntent && geoPool.length > 0 ? geoPool : scored).slice(0, TOP_N);

  // #region agent log
  const texasToken = tokens.includes('texas') || tokens.includes('tx');
  const locHasTexasSpelled = list.filter(p => (p.location || '').toLowerCase().includes('texas')).length;
  const locHasTxAbbrev = list.filter(p => /\btx\b/i.test(p.location || '')).length;
  const topWithTexasLoc = top.filter(c => /texas|\btx\b/i.test([c.location, c.hometown].filter(Boolean).join(' '))).length;
  const debugPayload = {looking_for:profile.looking_for,career_interest:profile.career_interest,tokens,boostAlumni,geoIntent,peerCount:list.length,geoPoolCount:geoPool.length,locHasTexasSpelled,locHasTxAbbrev,texasTokenInQuery:texasToken,topN:top.map(c=>({name:c.name,score:c.score,location:c.location,hometown:c.hometown,geoHit:c.geoHit,reason:c.reason})),topWithTexasLoc,scoredAbove0:scored.filter(c=>c.score>0).length};
  console.log('[DEBUG 1cf407] match ranking snapshot', JSON.stringify(debugPayload));
  fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'1cf407'},body:JSON.stringify({sessionId:'1cf407',runId:'post-fix',hypothesisId:'A,B,C,E',location:'lib/scout/match.ts:findChapterCandidates',message:'match ranking snapshot',data:debugPayload,timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  return top;
}

export function formatAlumniMatches(candidates: ScoutCandidate[], opts?: { mode?: 'list' | 'focus' }): string {
  if (candidates.length === 0) return EMPTY_MATCHES_INSTRUCTION;

  const mode = opts?.mode || 'list';
  const header =
    mode === 'focus'
      ? 'Focus person (answer the user about THIS person only — do not re-list the whole Texas roster):'
      : candidates.length >= 2
        ? `Match pool (${candidates.length} people). Only list names if the user asked who/who else is available. Otherwise answer their latest question.`
        : null;

  const lines = candidates.map((c, i) => {
    const parts = [
      `${i + 1}. ${c.name}`,
      c.role ? `role: ${c.role}` : null,
      c.major ? `major: ${c.major}` : null,
      c.location ? `location: ${c.location}` : null,
      c.hometown ? `hometown: ${c.hometown}` : null,
      c.member_status ? `status: ${c.member_status}` : null,
      c.grad_year ? `grad_year: ${c.grad_year}` : null,
      c.linkedin_url ? 'has LinkedIn' : null,
      c.bio ? `bio: ${c.bio.slice(0, 160)}` : null,
      `why: ${c.reason}`,
    ].filter(Boolean);
    return parts.join(' | ');
  });

  return [header, ...lines].filter(Boolean).join('\n');
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

/** @deprecated Prefer isMatchReady from discovery — kept for debug routes. */
export function shouldFetchMatches(
  type: 'open' | 'reply',
  profile: { looking_for: string | null; career_interest: string | null; location?: string | null; industry?: string | null; hometown?: string | null; goals?: unknown }
): boolean {
  if (type !== 'reply') return false;
  const looking = (profile.looking_for || '').trim();
  const goalsOk = Array.isArray(profile.goals) && profile.goals.length > 0;
  const hasIntent = looking.length >= 8 || goalsOk;
  const hasGeo = !!(profile.location || '').trim() || !!(profile.hometown || '').trim();
  const interest = (profile.career_interest || profile.industry || '').trim();
  const hasIndustry = interest.length >= 3 && interest.toLowerCase() !== 'to be updated';
  return hasIntent && (hasGeo || hasIndustry);
}
