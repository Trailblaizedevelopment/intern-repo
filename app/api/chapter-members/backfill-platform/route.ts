/**
 * GET /api/chapter-members/backfill-platform
 *
 * One-time backfill: reads all alumni profiles from the external platform DB,
 * matches them against chapter_members (headhunting) by name + chapter,
 * and sets platform_member_id / platform_joined_at on matched rows.
 *
 * Protected by INTERNAL_API_KEY header.
 *
 * Returns: { matched: N, skipped: N, errors: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// ─── Name normalization & matching ────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Conservative name match: both first and last name must match against
 * the stored `chapter_members.name` (which is a single "First Last" string).
 */
function namesMatch(firstName: string, lastName: string, storedName: string): boolean {
  const normFirst  = normalizeName(firstName);
  const normLast   = normalizeName(lastName);
  const normStored = normalizeName(storedName);

  if (normStored === `${normFirst} ${normLast}`) return true;

  const parts = normStored.split(' ');
  if (parts.length >= 2) {
    const storedFirst = parts[0];
    const storedLast  = parts[parts.length - 1];
    if (storedFirst === normFirst && storedLast === normLast) return true;
  }

  return false;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth check
  const apiKey = request.headers.get('x-api-key') || '';
  if (INTERNAL_API_KEY && apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const internalDb = getSupabaseAdmin();
  const platformDb = getPlatformAdmin();

  if (!internalDb) return NextResponse.json({ error: 'Internal DB not configured' }, { status: 500 });
  if (!platformDb) return NextResponse.json({ error: 'Platform DB not configured' }, { status: 500 });

  const errors: string[] = [];
  let matched = 0;
  let skipped = 0;

  // 1. Fetch all platform profiles (alumni role, onboarding completed)
  const { data: platformProfiles, error: platformErr } = await platformDb
    .from('profiles')
    .select('id, first_name, last_name, chapter_id, created_at, role')
    .eq('role', 'alumni')
    .not('first_name', 'is', null)
    .not('last_name', 'is', null);

  if (platformErr) {
    return NextResponse.json({ error: `Failed to fetch platform profiles: ${platformErr.message}` }, { status: 500 });
  }

  if (!platformProfiles?.length) {
    return NextResponse.json({ matched: 0, skipped: 0, errors: [], message: 'No platform alumni profiles found' });
  }

  // 2. Fetch the chapter external mappings (platform chapter_id → internal chapter_id)
  const { data: mappings, error: mappingErr } = await internalDb
    .from('chapter_external_mappings')
    .select('internal_chapter_id, external_chapter_id');

  if (mappingErr) {
    return NextResponse.json({ error: `Failed to fetch chapter mappings: ${mappingErr.message}` }, { status: 500 });
  }

  const chapterMap = new Map<string, string>();
  for (const m of mappings || []) {
    chapterMap.set(m.external_chapter_id, m.internal_chapter_id);
  }

  // 3. Fetch all chapter_members that don't have a platform_member_id yet
  const { data: chapterMembers, error: membersErr } = await internalDb
    .from('chapter_members')
    .select('id, name, chapter_id')
    .is('platform_member_id', null);

  if (membersErr) {
    return NextResponse.json({ error: `Failed to fetch chapter_members: ${membersErr.message}` }, { status: 500 });
  }

  // Group chapter_members by chapter_id for fast lookup
  const membersByChapter = new Map<string, Array<{ id: string; name: string }>>();
  for (const m of chapterMembers || []) {
    if (!membersByChapter.has(m.chapter_id)) membersByChapter.set(m.chapter_id, []);
    membersByChapter.get(m.chapter_id)!.push({ id: m.id, name: m.name });
  }

  // Track which chapter_member IDs we've already matched this run (avoid double-match)
  const alreadyMatched = new Set<string>();

  // 4. For each platform profile, try to find a chapter_members match
  for (const profile of platformProfiles) {
    if (!profile.first_name || !profile.last_name || !profile.chapter_id) {
      skipped++;
      continue;
    }

    const internalChapterId = chapterMap.get(profile.chapter_id);
    if (!internalChapterId) {
      skipped++;
      continue;
    }

    const candidates = membersByChapter.get(internalChapterId) || [];
    const match = candidates.find(
      c => !alreadyMatched.has(c.id) && namesMatch(profile.first_name!, profile.last_name!, c.name)
    );

    if (!match) {
      skipped++;
      continue;
    }

    // Update the chapter_members row
    const { error: updateErr } = await internalDb
      .from('chapter_members')
      .update({
        platform_member_id: profile.id,
        platform_joined_at: profile.created_at || new Date().toISOString(),
      })
      .eq('id', match.id);

    if (updateErr) {
      errors.push(`chapter_member ${match.id} (${match.name}): ${updateErr.message}`);
      skipped++;
    } else {
      alreadyMatched.add(match.id);
      matched++;
    }
  }

  return NextResponse.json({ matched, skipped, errors });
}
