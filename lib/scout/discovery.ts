import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';

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
      'If they seem unsure: normalize it and offer a light fork (internship / people to know / just curious). If they have direction: ask what would actually help right now — conversationally, not like a form.',
    location: 'Only if it fits: where they are or want to be (city/region). Soft ask.',
    industry: 'Only if it fits: what kind of work or space they\'re curious about.',
    what_they_bring:
      'When natural: what they\'re into / working on — not a resume dump request.',
    confirm_title: 'If unclear, casually confirm what they do now.',
  },
  alumni: {
    looking_for:
      'If unsure: help them name who would actually help (peers in city, customers, mentors, hiring). Soft forks OK. No formal goal grilling.',
    location: 'Only if it fits: where they are based now.',
    industry: 'Only if it fits: what they work on / care about.',
    what_they_bring: 'When natural: what they do now so intros cut both ways.',
    confirm_title: 'Casually confirm title/company if you only have membership status.',
  },
  unknown: {
    looking_for:
      'If unsure: explore with them. Ask what they\'re into or offer a light fork — never demand a crisp goal.',
    location: 'Soft ask where they are if it helps.',
    industry: 'Soft ask what kind of work interests them.',
    what_they_bring: 'Soft ask what they\'re working on.',
    confirm_title: 'Soft ask what they do now.',
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

export async function applyProfileUpdates(
  profile: ScoutDiscoveryProfile,
  updates: ProfileFieldUpdates
): Promise<ScoutDiscoveryProfile> {
  if (Object.keys(updates).length === 0) return profile;

  const supabase = getSupabaseAdmin();
  if (!supabase) return profile;

  const next: ScoutDiscoveryProfile = { ...profile };
  const dbUpdates: Record<string, unknown> = {};

  // Prefer latest intent: replace looking_for when the new ask clearly pivots (new city / new ask)
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
    } else {
      const prev = (profile.looking_for || '').toLowerCase();
      const nextL = incoming.toLowerCase();
      const geoWords =
        /\b(texas|tx|dallas|houston|austin|atlanta|georgia|ga|california|ca|nyc|new york|chicago|miami|denver|seattle|nashville|charlotte)\b/gi;
      const prevGeos = new Set((prev.match(geoWords) || []).map(s => s.toLowerCase()));
      const nextGeos = new Set((nextL.match(geoWords) || []).map(s => s.toLowerCase()));
      let geoConflict = false;
      for (const g of nextGeos) {
        if (prevGeos.size > 0 && !prevGeos.has(g)) {
          // new geo not in previous → treat as pivot
          geoConflict = true;
          break;
        }
      }
      if (geoConflict || nextL.includes('instead') || nextL.includes('rather')) {
        next.looking_for = incoming;
        dbUpdates.looking_for = incoming;
      } else if (!prev.includes(nextL) && !nextL.includes(prev)) {
        const merged = `${profile.looking_for}; ${incoming}`.slice(0, 400);
        next.looking_for = merged;
        dbUpdates.looking_for = merged;
      }
    }
  }
  if (updates.location) {
    // Allow location overwrite on explicit networking-city pivot
    const incomingLoc = updates.location.trim();
    if (isBlank(profile.location) || incomingLoc.length >= 2) {
      next.location = incomingLoc;
      dbUpdates.location = incomingLoc;
    }
  }
  if (updates.career_interest && (isBlank(profile.career_interest) || (profile.career_interest || '').toLowerCase() === 'to be updated')) {
    next.career_interest = updates.career_interest;
    dbUpdates.career_interest = updates.career_interest;
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
