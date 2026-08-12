import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

const MEMBERSHIP_ROLE_VALUES = new Set([
  'alumni',
  'alum',
  'active',
  'active_member',
  'graduated',
  'member',
  'pledge',
  'new_member',
]);

export type ScoutPersona = 'active' | 'alumni' | 'unknown';

export interface ScoutDiscoveryProfile {
  id: string;
  name: string;
  chapter: string | null;
  university: string | null;
  graduation_year: number | null;
  location: string | null;
  current_title: string | null;
  career_interest: string | null;
  looking_for: string | null;
  goals: unknown;
  skills: unknown;
  member_status: string | null;
  industry: string | null;
  company: string | null;
  job_title: string | null;
  hometown: string | null;
  linkedin_url: string | null;
  bio: string | null;
  source_type: string | null;
  source_id: string | null;
  platform_chapter_id: string | null;
  profile_complete: number | null;
}

export type DiscoveryGap =
  | 'looking_for'
  | 'location'
  | 'industry'
  | 'what_they_bring'
  | 'confirm_title';

export interface DiscoveryState {
  persona: ScoutPersona;
  gaps: DiscoveryGap[];
  nextGap: DiscoveryGap | null;
  nextQuestionHint: string | null;
  matchReady: boolean;
  knownSummary: string[];
}

export interface ProfileFieldUpdates {
  looking_for?: string;
  career_interest?: string;
  location?: string;
  industry?: string;
  company?: string;
  job_title?: string;
  current_title?: string;
  hometown?: string;
  goals?: string[];
  skills?: string[];
  notes?: string;
}

function isBlank(v: string | null | undefined): boolean {
  return !v || !String(v).trim();
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

function isMembershipLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  return MEMBERSHIP_ROLE_VALUES.has(value.toLowerCase().trim().replace(/\s+/g, '_'));
}

export function resolvePersona(profile: ScoutDiscoveryProfile): ScoutPersona {
  const status = (profile.member_status || '').toLowerCase();
  if (status.includes('alumni') || status.includes('alum') || status.includes('graduat')) {
    return 'alumni';
  }
  if (status.includes('active') || status.includes('pledge') || status.includes('member')) {
    return 'active';
  }
  const year = profile.graduation_year;
  if (year && year <= new Date().getFullYear()) return 'alumni';
  if (year && year > new Date().getFullYear()) return 'active';
  return 'unknown';
}

function hasIntent(profile: ScoutDiscoveryProfile): boolean {
  const looking = (profile.looking_for || '').trim();
  if (looking.length >= 8) return true;
  const goals = asStringArray(profile.goals);
  return goals.length > 0;
}

function hasGeo(profile: ScoutDiscoveryProfile): boolean {
  return !isBlank(profile.location) || !isBlank(profile.hometown);
}

function hasIndustrySignal(profile: ScoutDiscoveryProfile): boolean {
  if (!isBlank(profile.industry)) return true;
  const interest = (profile.career_interest || '').trim().toLowerCase();
  if (!interest) return false;
  // Platform sometimes dumps major/"To be updated" into career_interest
  if (interest === 'to be updated' || interest === 'n/a' || interest === 'none') return false;
  return interest.length >= 3;
}

function hasBringSignal(profile: ScoutDiscoveryProfile): boolean {
  if (!isBlank(profile.bio) && (profile.bio || '').trim().length >= 20) return true;
  if (asStringArray(profile.skills).length > 0) return true;
  if (!isBlank(profile.job_title) && !isMembershipLabel(profile.job_title)) return true;
  if (!isBlank(profile.company)) return true;
  if (!isBlank(profile.current_title) && !isMembershipLabel(profile.current_title)) return true;
  return false;
}

const QUESTION_HINTS: Record<ScoutPersona, Record<DiscoveryGap, string>> = {
  active: {
    looking_for:
      'Ask what they want help with right now — internship, full-time, mentor, or peer intro. One question.',
    location: 'Ask where they want to be for work or networking (city/region). One question.',
    industry: 'Ask what industry or function they are aiming for. One question.',
    what_they_bring:
      'Ask what they bring — major, internship, project, or skill worth leading with. One question.',
    confirm_title: 'Confirm their current role or internship if unclear. One question.',
  },
  alumni: {
    looking_for:
      'Ask what kind of people would actually help them — peers in their city, customers, mentors, investors, or hiring. One question.',
    location: 'Ask where they are based now (city). One question.',
    industry: 'Ask what industry or kind of work they are in / focused on. One question.',
    what_they_bring:
      'Ask briefly what they do now (company/role) so intros are relevant both ways. One question.',
    confirm_title: 'Confirm their current title/company if you only have membership status. One question.',
  },
  unknown: {
    looking_for: 'Ask what they are hoping to get from the network. One question.',
    location: 'Ask where they are based. One question.',
    industry: 'Ask what kind of work or industry they care about. One question.',
    what_they_bring: 'Ask what they are working on or known for. One question.',
    confirm_title: 'Ask what they do now. One question.',
  },
};

/**
 * Gap analysis + next question hint. Match unlocks only when intent + (geo or industry).
 */
export function analyzeDiscovery(profile: ScoutDiscoveryProfile): DiscoveryState {
  const persona = resolvePersona(profile);
  const gaps: DiscoveryGap[] = [];

  if (!hasIntent(profile)) gaps.push('looking_for');
  if (!hasGeo(profile)) gaps.push('location');
  if (!hasIndustrySignal(profile)) gaps.push('industry');
  if (!hasBringSignal(profile)) {
    if (
      isMembershipLabel(profile.current_title) ||
      isMembershipLabel(profile.job_title) ||
      (isBlank(profile.job_title) && isBlank(profile.company) && isBlank(profile.current_title))
    ) {
      gaps.push('confirm_title');
    } else {
      gaps.push('what_they_bring');
    }
  }

  // Prefer order: intent → geo → industry → bring
  const priority: DiscoveryGap[] = ['looking_for', 'location', 'industry', 'confirm_title', 'what_they_bring'];
  const ordered = priority.filter(g => gaps.includes(g));
  const nextGap = ordered[0] || null;

  const matchReady = hasIntent(profile) && (hasGeo(profile) || hasIndustrySignal(profile));

  const knownSummary: string[] = [];
  if (profile.member_status) knownSummary.push(`status: ${profile.member_status}`);
  if (profile.graduation_year) knownSummary.push(`grad_year: ${profile.graduation_year}`);
  if (profile.chapter) knownSummary.push(`chapter: ${profile.chapter}`);
  if (profile.location) knownSummary.push(`location: ${profile.location}`);
  if (profile.hometown) knownSummary.push(`hometown: ${profile.hometown}`);
  if (profile.industry) knownSummary.push(`industry: ${profile.industry}`);
  if (profile.company) knownSummary.push(`company: ${profile.company}`);
  if (profile.job_title && !isMembershipLabel(profile.job_title)) {
    knownSummary.push(`job_title: ${profile.job_title}`);
  } else if (profile.current_title && !isMembershipLabel(profile.current_title)) {
    knownSummary.push(`title: ${profile.current_title}`);
  }
  if (profile.career_interest) knownSummary.push(`career_interest: ${profile.career_interest}`);
  if (profile.looking_for) knownSummary.push(`looking_for: ${profile.looking_for}`);
  if (profile.linkedin_url) knownSummary.push('has LinkedIn on platform profile');
  if (profile.bio) knownSummary.push('has bio on platform profile');

  return {
    persona,
    gaps,
    nextGap,
    nextQuestionHint: nextGap ? QUESTION_HINTS[persona][nextGap] : null,
    matchReady,
    knownSummary,
  };
}

export function computeProfileComplete(profile: ScoutDiscoveryProfile): number {
  let score = 10;
  if (profile.platform_chapter_id || profile.chapter) score += 10;
  if (profile.graduation_year) score += 10;
  if (profile.member_status) score += 5;
  if (hasIntent(profile)) score += 25;
  if (hasGeo(profile)) score += 15;
  if (hasIndustrySignal(profile)) score += 15;
  if (hasBringSignal(profile)) score += 10;
  return Math.min(100, score);
}

/** Match gate: reply + discovery readiness (intent + geo or industry). */
export function isMatchReady(
  type: 'open' | 'reply',
  profile: ScoutDiscoveryProfile
): boolean {
  if (type !== 'reply') return false;
  return analyzeDiscovery(profile).matchReady;
}

/**
 * Pull missing enrichment fields from platform profiles (no LinkedIn scrape).
 */
export async function enrichProfileFromPlatform(
  profile: ScoutDiscoveryProfile
): Promise<ScoutDiscoveryProfile> {
  if (profile.source_type !== 'platform_profile' || !profile.source_id) {
    return profile;
  }

  const platform = getPlatformAdmin();
  const supabase = getSupabaseAdmin();
  if (!platform || !supabase) return profile;

  const { data: p, error } = await platform
    .from('profiles')
    .select(
      'chapter_id, grad_year, major, location, role, member_status, linkedin_url, bio, hometown, industry, company, job_title, current_place'
    )
    .eq('id', profile.source_id)
    .maybeSingle();

  if (error || !p) {
    if (error) console.error('[scout/discovery] platform enrich failed:', error.message);
    return profile;
  }

  const updates: Record<string, unknown> = {};
  const next = { ...profile };

  if (!next.platform_chapter_id && p.chapter_id) {
    next.platform_chapter_id = p.chapter_id;
    updates.platform_chapter_id = p.chapter_id;
  }
  if (!next.graduation_year && p.grad_year) {
    next.graduation_year = p.grad_year;
    updates.graduation_year = p.grad_year;
  }
  if (isBlank(next.location)) {
    const loc = p.location || p.current_place || null;
    if (loc) {
      next.location = loc;
      updates.location = loc;
    }
  }
  if (isBlank(next.member_status) && p.member_status) {
    next.member_status = p.member_status;
    updates.member_status = p.member_status;
  }
  if (isBlank(next.linkedin_url) && p.linkedin_url) {
    next.linkedin_url = p.linkedin_url;
    updates.linkedin_url = p.linkedin_url;
  }
  if (isBlank(next.bio) && p.bio) {
    next.bio = p.bio;
    updates.bio = p.bio;
  }
  if (isBlank(next.hometown) && p.hometown) {
    next.hometown = p.hometown;
    updates.hometown = p.hometown;
  }
  if (isBlank(next.industry) && p.industry) {
    next.industry = p.industry;
    updates.industry = p.industry;
  }
  if (isBlank(next.company) && p.company) {
    next.company = p.company;
    updates.company = p.company;
  }
  if (isBlank(next.job_title) && p.job_title) {
    next.job_title = p.job_title;
    updates.job_title = p.job_title;
  }

  // Prefer real job_title over membership label in current_title
  if (p.job_title && (isBlank(next.current_title) || isMembershipLabel(next.current_title))) {
    next.current_title = p.job_title;
    updates.current_title = p.job_title;
  } else if (
    isBlank(next.current_title) &&
    p.role &&
    !isMembershipLabel(p.role)
  ) {
    next.current_title = p.role;
    updates.current_title = p.role;
  }

  // career_interest: prefer industry, else major (if not junk)
  if (isBlank(next.career_interest) || (next.career_interest || '').toLowerCase() === 'to be updated') {
    if (p.industry) {
      next.career_interest = p.industry;
      updates.career_interest = p.industry;
    } else if (p.major && String(p.major).toLowerCase() !== 'to be updated') {
      next.career_interest = p.major;
      updates.career_interest = p.major;
    }
  }

  if (Object.keys(updates).length === 0) return profile;

  updates.updated_at = new Date().toISOString();
  updates.profile_complete = computeProfileComplete(next);
  next.profile_complete = updates.profile_complete as number;

  const { error: updateErr } = await supabase
    .from('scout_profiles')
    .update(updates)
    .eq('id', profile.id);

  if (updateErr) {
    console.error('[scout/discovery] enrich persist failed:', updateErr.message);
  }

  return next;
}

/**
 * Extract structured profile updates from conversation (especially inbound answers).
 * Uses a small Anthropic JSON call — no LinkedIn scraping.
 */
export async function extractProfileUpdatesFromConversation(
  profile: ScoutDiscoveryProfile,
  history: Array<{ direction: 'inbound' | 'outbound'; message_body: string }>
): Promise<ProfileFieldUpdates> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return {};

  const inbound = history.filter(m => m.direction === 'inbound');
  if (inbound.length === 0) return {};

  const transcript = history
    .slice(-20)
    .map(m => `${m.direction === 'outbound' ? 'Scout' : profile.name}: ${m.message_body}`)
    .join('\n');

  const known = {
    looking_for: profile.looking_for,
    career_interest: profile.career_interest,
    location: profile.location,
    industry: profile.industry,
    company: profile.company,
    job_title: profile.job_title,
    hometown: profile.hometown,
    goals: asStringArray(profile.goals),
    skills: asStringArray(profile.skills),
  };

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: `You extract networking profile facts from a text conversation with Scout.
Return ONLY valid JSON (no markdown) with any of these optional keys if clearly supported by the USER's messages:
looking_for (string — what they want from the network),
career_interest (string),
location (string — current city/region for networking),
industry (string),
company (string),
job_title (string),
hometown (string),
goals (string array),
skills (string array).
Rules:
- Prefer the user's words; summarize tightly.
- Do not invent. If unclear, omit the key.
- If they mentioned a city/state for networking (e.g. Texas), put it in location when it's where they want connections, and also in looking_for / goals as an intent facet.
- Prefer adding new intents to goals[] rather than collapsing everything into one looking_for sentence.
- Do not erase prior intents; capture NEW facets from the latest user messages.
- Do not copy Scout's questions as facts.`,
        messages: [
          {
            role: 'user',
            content: `Known profile so far:\n${JSON.stringify(known)}\n\nTranscript:\n${transcript}\n\nJSON updates:`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error('[scout/discovery] extract API error:', res.status, await res.text());
      return {};
    }

    const aiResponse = await res.json();
    const text = aiResponse.content
      ?.filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();

    if (!text) return {};

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};

    const parsed = JSON.parse(jsonMatch[0]) as ProfileFieldUpdates;
    const cleaned: ProfileFieldUpdates = {};

    if (typeof parsed.looking_for === 'string' && parsed.looking_for.trim()) {
      cleaned.looking_for = parsed.looking_for.trim();
    }
    if (typeof parsed.career_interest === 'string' && parsed.career_interest.trim()) {
      cleaned.career_interest = parsed.career_interest.trim();
    }
    if (typeof parsed.location === 'string' && parsed.location.trim()) {
      cleaned.location = parsed.location.trim();
    }
    if (typeof parsed.industry === 'string' && parsed.industry.trim()) {
      cleaned.industry = parsed.industry.trim();
    }
    if (typeof parsed.company === 'string' && parsed.company.trim()) {
      cleaned.company = parsed.company.trim();
    }
    if (typeof parsed.job_title === 'string' && parsed.job_title.trim()) {
      cleaned.job_title = parsed.job_title.trim();
    }
    if (typeof parsed.hometown === 'string' && parsed.hometown.trim()) {
      cleaned.hometown = parsed.hometown.trim();
    }
    if (Array.isArray(parsed.goals)) {
      cleaned.goals = parsed.goals.filter((g): g is string => typeof g === 'string' && g.trim().length > 0);
    }
    if (Array.isArray(parsed.skills)) {
      cleaned.skills = parsed.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    }

    return cleaned;
  } catch (err) {
    console.error('[scout/discovery] extract failed:', err);
    return {};
  }
}

export async function applyProfileUpdates(
  profile: ScoutDiscoveryProfile,
  updates: ProfileFieldUpdates
): Promise<ScoutDiscoveryProfile> {
  if (Object.keys(updates).length === 0) return profile;

  const supabase = getSupabaseAdmin();
  if (!supabase) return profile;

  const next: ScoutDiscoveryProfile = { ...profile };
  const dbUpdates: Record<string, unknown> = {};

  // Only overwrite blanks OR merge looking_for as multi-intent (never replace with a single sticky phrase)
  if (updates.looking_for) {
    const incoming = updates.looking_for.trim();
    const existingGoals = asStringArray(profile.goals);
    if (!existingGoals.some(g => g.toLowerCase() === incoming.toLowerCase())) {
      const mergedGoals = [...existingGoals, incoming];
      next.goals = mergedGoals;
      dbUpdates.goals = mergedGoals;
    }
    if (isBlank(profile.looking_for)) {
      next.looking_for = incoming;
      dbUpdates.looking_for = incoming;
    } else if (
      !(profile.looking_for || '').toLowerCase().includes(incoming.toLowerCase()) &&
      !incoming.toLowerCase().includes((profile.looking_for || '').toLowerCase())
    ) {
      const merged = `${profile.looking_for}; ${incoming}`.slice(0, 400);
      next.looking_for = merged;
      dbUpdates.looking_for = merged;
    }
  }
  if (updates.career_interest && (isBlank(profile.career_interest) || (profile.career_interest || '').toLowerCase() === 'to be updated')) {
    next.career_interest = updates.career_interest;
    dbUpdates.career_interest = updates.career_interest;
  }
  if (updates.location && isBlank(profile.location)) {
    next.location = updates.location;
    dbUpdates.location = updates.location;
  }
  if (updates.industry && isBlank(profile.industry)) {
    next.industry = updates.industry;
    dbUpdates.industry = updates.industry;
  }
  if (updates.company && isBlank(profile.company)) {
    next.company = updates.company;
    dbUpdates.company = updates.company;
  }
  if (updates.job_title && isBlank(profile.job_title)) {
    next.job_title = updates.job_title;
    dbUpdates.job_title = updates.job_title;
    if (isBlank(profile.current_title) || isMembershipLabel(profile.current_title)) {
      next.current_title = updates.job_title;
      dbUpdates.current_title = updates.job_title;
    }
  }
  if (updates.hometown && isBlank(profile.hometown)) {
    next.hometown = updates.hometown;
    dbUpdates.hometown = updates.hometown;
  }
  if (updates.goals && updates.goals.length > 0) {
    const merged = [...new Set([...asStringArray(profile.goals), ...updates.goals])];
    next.goals = merged;
    dbUpdates.goals = merged;
  }
  if (updates.skills && updates.skills.length > 0) {
    const merged = [...new Set([...asStringArray(profile.skills), ...updates.skills])];
    next.skills = merged;
    dbUpdates.skills = merged;
  }

  if (Object.keys(dbUpdates).length === 0) return profile;

  const complete = computeProfileComplete(next);
  next.profile_complete = complete;
  dbUpdates.profile_complete = complete;
  dbUpdates.updated_at = new Date().toISOString();

  const { error } = await supabase.from('scout_profiles').update(dbUpdates).eq('id', profile.id);
  if (error) {
    console.error('[scout/discovery] apply updates failed:', error.message);
  }

  return next;
}

export function formatDiscoveryGuidance(state: DiscoveryState): string {
  const lines: string[] = [
    `Discovery mode: ${state.matchReady ? 'READY_TO_MATCH' : 'GATHERING'}`,
    `Persona: ${state.persona}`,
  ];
  if (state.knownSummary.length > 0) {
    lines.push(`Already known (do NOT re-ask): ${state.knownSummary.join('; ')}`);
  }
  if (state.gaps.length > 0) {
    lines.push(`Open gaps: ${state.gaps.join(', ')}`);
  }
  if (state.nextQuestionHint) {
    lines.push(`Next focus: ${state.nextQuestionHint}`);
  }
  if (!state.matchReady) {
    lines.push(
      'Matching is locked until you know what they want AND (where they are OR their industry/focus). Keep discovering. Never claim the alumni network is missing, unsynced, or unavailable.'
    );
  } else {
    lines.push(
      'Matching is unlocked. You may surface people only from Relevant alumni matches if provided.'
    );
    lines.push(
      'looking_for is ONE clue, not the whole story — after naming matches, ask one investigative question about what else would help (industry, what they can offer, who they want to meet). Do not tunnel on a single phrase forever.'
    );
    if (!state.nextQuestionHint && state.gaps.length === 0) {
      lines.push(
        `Next focus: ${QUESTION_HINTS[state.persona].what_they_bring}`
      );
    }
  }
  return lines.join('\n');
}

export function toDiscoveryProfile(row: Record<string, unknown>): ScoutDiscoveryProfile {
  return {
    id: String(row.id),
    name: String(row.name || 'Unknown'),
    chapter: (row.chapter as string | null) ?? null,
    university: (row.university as string | null) ?? null,
    graduation_year: (row.graduation_year as number | null) ?? null,
    location: (row.location as string | null) ?? null,
    current_title: (row.current_title as string | null) ?? null,
    career_interest: (row.career_interest as string | null) ?? null,
    looking_for: (row.looking_for as string | null) ?? null,
    goals: row.goals,
    skills: row.skills,
    member_status: (row.member_status as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    job_title: (row.job_title as string | null) ?? null,
    hometown: (row.hometown as string | null) ?? null,
    linkedin_url: (row.linkedin_url as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    source_type: (row.source_type as string | null) ?? null,
    source_id: (row.source_id as string | null) ?? null,
    platform_chapter_id: (row.platform_chapter_id as string | null) ?? null,
    profile_complete: (row.profile_complete as number | null) ?? null,
  };
}
