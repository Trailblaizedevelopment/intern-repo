import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';
import {
  DEFAULT_PRIVACY,
  isIntroducible,
  type ScoutPrivacySettings,
} from '@/lib/scout/privacy';

const PEER_FETCH_LIMIT = 200;
const TOP_N = 40;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'with',
  'into', 'my', 'me', 'i', 'im', "i'm", 'looking', 'want', 'need', 'get',
  'some', 'any', 'help', 'about', 'from', 'be', 'is', 'are', 'was', 'were',
  'out', 'more', 'see', 'who', 'build', 'broadly', 'base', 'network',
]);

const MEMBERSHIP_ROLE_VALUES = new Set([
  'alumni', 'alum', 'active', 'active_member', 'graduated', 'member', 'pledge', 'new_member',
]);

const GEO_EXPAND: Record<string, string[]> = {
  texas: ['texas', 'tx', 'dallas', 'houston', 'austin', 'fort', 'worth'],
  tx: ['texas', 'tx', 'dallas', 'houston', 'austin'],
  dallas: ['dallas', 'texas', 'tx'],
  houston: ['houston', 'texas', 'tx'],
  austin: ['austin', 'texas', 'tx'],
  atlanta: ['atlanta', 'georgia', 'ga'],
  georgia: ['georgia', 'ga', 'atlanta'],
  ga: ['georgia', 'ga', 'atlanta'],
};

const GEO_INTENT_TOKENS = new Set([
  'texas', 'tx', 'dallas', 'houston', 'austin', 'california', 'ca', 'new', 'york', 'ny',
  'florida', 'fl', 'georgia', 'ga', 'atlanta', 'mississippi', 'ms',
]);

export interface ScoutRejection {
  type: 'person' | 'criterion' | 'action';
  value: string;
  person_id?: string | null;
  platform_profile_id?: string | null;
}

export interface SearchNetworkInput {
  query?: string;
  location?: string;
  industry?: string;
  tier_scope?: number[];
  limit?: number;
  min_grad_year?: number;
  max_grad_year?: number;
  /** Platform profile ids already offered / in-flight intros */
  exclude_ids?: string[];
  /** Active standing-intent descriptions and locations */
  intent_snippets?: string[];
}

export interface SearchHitIntroducible {
  id: string;
  tier: 1;
  introducible: true;
  name: string;
  role: string | null;
  location: string | null;
  hometown: string | null;
  member_status: string | null;
  company: string | null;
  industry: string | null;
  bio: string | null;
  grad_year: number | null;
  linkedin_url: string | null;
  reason: string;
  score: number;
}

export interface SearchHitOpaque {
  id: string;
  tier: 1 | 2 | 3 | 4;
  introducible: false;
  aggregate_eligible: true;
}

export type SearchHit = SearchHitIntroducible | SearchHitOpaque;

export interface SearchNetworkResult {
  hits: SearchHit[];
  tier1_count: number;
  opaque_count: number;
  skipped_tiers: number[];
  note: string;
  query_tokens: string[];
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

export interface ScoutProfileForSearch {
  id: string;
  platform_chapter_id: string | null;
  source_type: string | null;
  source_id: string | null;
  looking_for: string | null;
  career_interest: string | null;
  location: string | null;
  industry: string | null;
  goals: unknown;
  opt_in_status?: string | null;
}

const INTENT_SNIPPET_MAX = 9;
const INTENT_SNIPPET_CHAR_CAP = 80;
const INTENT_SNIPPET_TOKEN_CAP = 12;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

/** Standing-intent text is user-influenced; cap tokens so it cannot dominate the query. */
function intentSnippetTokens(snippets: string[] | undefined): string[] {
  if (!snippets || snippets.length === 0) return [];
  const tokens: string[] = [];
  for (const snippet of snippets.slice(0, INTENT_SNIPPET_MAX)) {
    const trimmed = snippet.trim().slice(0, INTENT_SNIPPET_CHAR_CAP);
    for (const token of tokenize(trimmed)) {
      if (!tokens.includes(token)) tokens.push(token);
      if (tokens.length >= INTENT_SNIPPET_TOKEN_CAP) return tokens;
    }
  }
  return tokens;
}

export function expandGeoTokens(tokens: string[]): string[] {
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

function hasGeoIntent(tokens: string[]): boolean {
  return tokens.some(t => GEO_INTENT_TOKENS.has(t) || Boolean(GEO_EXPAND[t]));
}

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

export function criterionMatchesGeo(criterion: string, geoText: string): boolean {
  const tokens = expandGeoTokens(tokenize(criterion));
  if (tokens.length === 0 || !geoText) return false;
  return tokenHits(geoText, tokens).length > 0;
}

function personRejected(peer: PlatformPeer, rejections: ScoutRejection[]): boolean {
  const name = peerName(peer).toLowerCase();
  for (const r of rejections) {
    if (r.type !== 'person') continue;
    if (r.platform_profile_id && r.platform_profile_id === peer.id) return true;
    const val = (r.value || '').toLowerCase().trim();
    if (val && (name === val || name.includes(val) || val.includes(name))) return true;
    const first = val.split(/\s+/)[0];
    if (first && first.length >= 3 && name.split(/\s+/).includes(first)) return true;
  }
  return false;
}

function criterionRejected(peer: PlatformPeer, rejections: ScoutRejection[]): boolean {
  const geo = peerGeoText(peer);
  const career = [peer.industry, peer.company, peer.job_title, peer.major, peer.bio]
    .filter(Boolean)
    .join(' ');
  for (const r of rejections) {
    if (r.type !== 'criterion') continue;
    if (criterionMatchesGeo(r.value, geo)) return true;
    const tokens = tokenize(r.value);
    if (tokens.length > 0 && tokenHits(career, tokens).length > 0 && !hasGeoIntent(tokens)) {
      return true;
    }
  }
  return false;
}

export async function loadPrivacySettings(): Promise<ScoutPrivacySettings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ...DEFAULT_PRIVACY };
  const { data } = await supabase
    .from('scout_settings')
    .select('tier1_introducible, tier2_introducible, tier3_introducible, tier4_introducible')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();
  if (!data) return { ...DEFAULT_PRIVACY };
  return {
    tier1_introducible: data.tier1_introducible ?? true,
    tier2_introducible: data.tier2_introducible ?? true,
    tier3_introducible: data.tier3_introducible ?? false,
    tier4_introducible: data.tier4_introducible ?? false,
  };
}

export async function resolvePlatformChapterId(
  profile: ScoutProfileForSearch
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
    console.error('[scout/search] Failed to backfill chapter_id:', error?.message);
    return null;
  }

  const chapterId = platformProfile.chapter_id as string;
  await supabase
    .from('scout_profiles')
    .update({
      platform_chapter_id: chapterId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id);

  return chapterId;
}

export async function searchNetwork(
  profile: ScoutProfileForSearch,
  input: SearchNetworkInput,
  rejections: ScoutRejection[],
  privacy?: ScoutPrivacySettings
): Promise<SearchNetworkResult> {
  const settings = privacy || (await loadPrivacySettings());
  const skippedTiers: number[] = [];
  const requested = (input.tier_scope || [1]).filter(t => t >= 1 && t <= 4);

  // Tiers 2–4 are unverified in this repo (no connections / university / national-org joins).
  for (const t of requested) {
    if (t !== 1) skippedTiers.push(t);
  }

  const empty: SearchNetworkResult = {
    hits: [],
    tier1_count: 0,
    opaque_count: 0,
    skipped_tiers: skippedTiers,
    query_tokens: [],
    note:
      skippedTiers.length > 0
        ? 'Only chapter (tier 1) search is available. Broader network tiers are not wired.'
        : 'No chapter matches for this query.',
  };

  if (profile.opt_in_status === 'opted_out') return empty;
  if (!requested.includes(1)) {
    return { ...empty, note: 'tier_scope did not include tier 1; other tiers are not available.' };
  }

  const chapterId = await resolvePlatformChapterId(profile);
  if (!chapterId) return empty;

  const platform = getPlatformAdmin();
  if (!platform) return empty;

  const { data: peers, error } = await platform
    .from('profiles')
    .select(
      'id, first_name, last_name, full_name, role, major, location, hometown, current_place, member_status, bio, linkedin_url, grad_year, job_title, industry, company, chapter_id'
    )
    .eq('chapter_id', chapterId)
    .limit(PEER_FETCH_LIMIT);

  if (error) {
    console.error('[scout/search] Platform peer query failed:', error.message);
    return empty;
  }

  const list = (peers || []) as PlatformPeer[];
  const queryParts = [
    input.query,
    input.location,
    input.industry,
    profile.looking_for,
    profile.career_interest,
    profile.industry,
  ]
    .filter(Boolean)
    .join(' ');
  const tokens = expandGeoTokens([
    ...new Set([...tokenize(queryParts), ...intentSnippetTokens(input.intent_snippets)]),
  ]);
  const boostAlumni = wantsAlumniBoost(tokens);
  const geoIntent = hasGeoIntent(tokens) || Boolean(input.location);
  const exclude = new Set(input.exclude_ids || []);

  type Scored = {
    peer: PlatformPeer;
    score: number;
    reason: string;
    geoHit: boolean;
  };
  const scored: Scored[] = [];
  for (const peer of list) {
    if (profile.source_id && peer.id === profile.source_id) continue;
    if (exclude.has(peer.id)) continue;
    if (personRejected(peer, rejections)) continue;
    if (criterionRejected(peer, rejections)) continue;
    if (
      input.min_grad_year != null &&
      peer.grad_year != null &&
      peer.grad_year < input.min_grad_year
    ) {
      continue;
    }
    if (
      input.max_grad_year != null &&
      peer.grad_year != null &&
      peer.grad_year > input.max_grad_year
    ) {
      continue;
    }

    const { score, reason, geoHit } = scorePeer(peer, tokens, boostAlumni, geoIntent);
    scored.push({ peer, score, reason, geoHit });
  }

  scored.sort((a, b) => {
    if (geoIntent) {
      const ag = a.geoHit ? 1 : 0;
      const bg = b.geoHit ? 1 : 0;
      if (ag !== bg) return bg - ag;
    }
    return b.score - a.score;
  });

  const geoPool = geoIntent ? scored.filter(c => c.geoHit) : [];
  const limit = Math.min(input.limit ?? TOP_N, TOP_N);
  const top = (geoIntent && geoPool.length > 0 ? geoPool : scored).slice(0, limit);

  const hits: SearchHit[] = [];
  for (const row of top) {
    if (isIntroducible(1, settings)) {
      hits.push({
        id: row.peer.id,
        tier: 1,
        introducible: true,
        name: peerName(row.peer),
        role:
          row.peer.job_title && !isMembershipLabel(row.peer.job_title)
            ? row.peer.job_title
            : row.peer.role,
        location: row.peer.location || placeToText(row.peer.current_place),
        hometown: row.peer.hometown,
        member_status: row.peer.member_status,
        company: row.peer.company,
        industry: row.peer.industry,
        bio: row.peer.bio ? row.peer.bio.slice(0, 200) : null,
        grad_year: row.peer.grad_year,
        linkedin_url: row.peer.linkedin_url,
        reason: row.reason,
        score: row.score,
      });
    } else {
      hits.push({
        id: row.peer.id,
        tier: 1,
        introducible: false,
        aggregate_eligible: true,
      });
    }
  }

  const introducibleHits = hits.filter((h): h is SearchHitIntroducible => h.introducible === true);
  const opaqueHits = hits.filter((h): h is SearchHitOpaque => h.introducible === false);

  return {
    hits,
    tier1_count: introducibleHits.length,
    opaque_count: opaqueHits.length,
    skipped_tiers: skippedTiers,
    query_tokens: tokens,
    note:
      hits.length === 0
        ? empty.note
        : opaqueHits.length > 0 && introducibleHits.length === 0
          ? `${opaqueHits.length} people match but are not introducible. Speak in aggregates only; offer request_visibility.`
          : `${introducibleHits.length} introducible chapter match(es).`,
  };
}

export function sanitizeToolSearchResult(result: SearchNetworkResult): unknown {
  return {
    hits: result.hits.map(h => {
      if (!h.introducible) {
        return { id: h.id, tier: h.tier, introducible: false, aggregate_eligible: true };
      }
      return {
        id: h.id,
        tier: h.tier,
        introducible: true,
        name: h.name,
        role: h.role,
        location: h.location,
        hometown: h.hometown,
        member_status: h.member_status,
        company: h.company,
        industry: h.industry,
        bio: h.bio,
        grad_year: h.grad_year,
        reason: h.reason,
      };
    }),
    tier1_count: result.tier1_count,
    opaque_count: result.opaque_count,
    skipped_tiers: result.skipped_tiers,
    note: result.note,
  };
}
