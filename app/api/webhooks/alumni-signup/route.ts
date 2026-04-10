/**
 * POST /api/webhooks/alumni-signup
 *
 * Triggered by a Supabase Database Webhook on the external (trailblaize.net)
 * platform when a row is inserted into the `profiles` table.
 *
 * Supabase webhook payload:  { type: "INSERT", table: "profiles", record: { ...row } }
 * Also accepts a flat profile object for manual/test calls.
 *
 * What it does:
 *   1. Verifies x-webhook-secret header
 *   2. Skips non-alumni roles and bulk-imported Sigma Chi chapter
 *   3. Upserts into platform_members (always — this is the source of truth for signups)
 *   4. Resolves internal chapter_id via chapter_external_mappings
 *   5. If matched to an alumni_contact (by phone or email), updates outreach_status → signed_up
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const WEBHOOK_SECRET     = process.env.ALUMNI_WEBHOOK_SECRET    || '';

// Bulk-imported chapter — skip entirely
const BULK_IMPORT_CHAPTER_ID = '404e65ab-1123-44a0-81c7-e8e75118e741';
const DEMO_NAMES = ['Sales Demo Chapter', 'Trailblaize Demo Chapter'];

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function phoneVariants(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const norm = normalizePhone(raw);
  const digits = raw.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  return [...new Set([norm, digits, last10].filter(Boolean))] as string[];
}

interface ExternalProfile {
  id?: string;
  role?: string;
  phone?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  chapter_id?: string | null;
  chapter?: string | null;
  grad_year?: number | string | null;
  major?: string | null;
  minor?: string | null;
  pledge_class?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  member_status?: string | null;
  onboarding_completed?: boolean | null;
  created_at?: string | null;
}

/**
 * Normalize a name for fuzzy matching — lowercase, trim, collapse whitespace.
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Conservative name matching:
 * - Exact first + last match (case-insensitive)
 * - OR first name matches AND last name matches (handles minor nickname/suffix differences)
 *
 * We do NOT match if only first name OR only last name matches — too ambiguous.
 */
function namesMatch(firstName: string, lastName: string, storedName: string): boolean {
  const normFirst = normalizeName(firstName);
  const normLast  = normalizeName(lastName);
  const normStored = normalizeName(storedName);

  // Stored name is typically "First Last" (single string in chapter_members.name)
  // Try exact full-name match
  if (normStored === `${normFirst} ${normLast}`) return true;

  // Try splitting stored name and matching parts
  const parts = normStored.split(' ');
  if (parts.length >= 2) {
    const storedFirst = parts[0];
    const storedLast  = parts[parts.length - 1];
    // Both first and last must match
    if (storedFirst === normFirst && storedLast === normLast) return true;
  }

  return false;
}

interface LinkChapterMemberArgs {
  platformMemberId: string;
  firstName: string;
  lastName: string;
  internalChapterId: string;
  joinedAt: string;
}

/**
 * Attempts to find a matching chapter_members row and set platform_member_id / platform_joined_at.
 * Returns true if a match was found and updated.
 */
async function tryLinkChapterMember(
  db: ReturnType<typeof getSupabaseAdmin>,
  { platformMemberId, firstName, lastName, internalChapterId, joinedAt }: LinkChapterMemberArgs
): Promise<boolean> {
  if (!db) return false;

  // Only look at members not yet linked
  const { data: candidates, error } = await db
    .from('chapter_members')
    .select('id, name')
    .eq('chapter_id', internalChapterId)
    .is('platform_member_id', null);

  if (error || !candidates?.length) return false;

  const match = candidates.find(c => namesMatch(firstName, lastName, c.name));
  if (!match) return false;

  const { error: updateError } = await db
    .from('chapter_members')
    .update({
      platform_member_id: platformMemberId,
      platform_joined_at: joinedAt,
    })
    .eq('id', match.id);

  if (updateError) {
    console.error('[alumni-signup] Failed to link chapter_member:', updateError.message);
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  // --- Auth ---
  const secret = request.headers.get('x-webhook-secret') || '';
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Unwrap Supabase webhook envelope or accept flat profile
  let profile: ExternalProfile;
  const body = rawBody as Record<string, unknown>;
  if (body.record && typeof body.record === 'object') {
    profile = body.record as ExternalProfile;
  } else {
    profile = body as ExternalProfile;
  }

  // Skip non-alumni
  if (profile.role && profile.role !== 'alumni') {
    return NextResponse.json({ ok: true, skipped: 'non-alumni role' });
  }

  // Skip bulk-imported Sigma Chi and demo chapters
  if (profile.chapter_id === BULK_IMPORT_CHAPTER_ID) {
    return NextResponse.json({ ok: true, skipped: 'bulk-import chapter' });
  }
  if (profile.chapter && DEMO_NAMES.includes(profile.chapter)) {
    return NextResponse.json({ ok: true, skipped: 'demo chapter' });
  }

  if (!profile.id) {
    return NextResponse.json({ error: 'profile.id required' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const now = new Date().toISOString();

  // --- Resolve internal chapter_id via mappings table ---
  let internalChapterId: string | null = null;
  if (profile.chapter_id) {
    const { data: mapping } = await db
      .from('chapter_external_mappings')
      .select('internal_chapter_id')
      .eq('external_chapter_id', profile.chapter_id)
      .single();
    if (mapping) internalChapterId = mapping.internal_chapter_id;
  }

  // --- Upsert into platform_members ---
  const pmRow: Record<string, unknown> = {
    external_user_id:     profile.id,
    external_chapter_id:  profile.chapter_id || null,
    chapter_id:           internalChapterId,
    first_name:           profile.first_name || null,
    last_name:            profile.last_name  || null,
    email:                profile.email      || null,
    phone:                profile.phone      || null,
    grad_year:            profile.grad_year  ? (typeof profile.grad_year === 'string' ? parseInt(profile.grad_year) : profile.grad_year) : null,
    major:                profile.major      || null,
    minor:                profile.minor      || null,
    pledge_class:         profile.pledge_class  || null,
    linkedin_url:         profile.linkedin_url  || null,
    location:             profile.location      || null,
    avatar_url:           profile.avatar_url    || null,
    member_status:        profile.member_status || null,
    onboarding_completed: profile.onboarding_completed ?? false,
    signed_up_at:         profile.created_at || now,
    last_synced_at:       now,
    updated_at:           now,
  };

  const { error: pmError } = await db
    .from('platform_members')
    .upsert(pmRow, { onConflict: 'external_user_id' });

  if (pmError) {
    return NextResponse.json({ error: `platform_members upsert failed: ${pmError.message}` }, { status: 500 });
  }

  // --- Try to match & update alumni_contacts ---
  let matchedContactIds: string[] = [];

  if (profile.phone) {
    const variants = phoneVariants(profile.phone);
    const orClauses = variants.flatMap(v => [
      `phone_primary.eq.${v}`,
      `phone_secondary.eq.${v}`,
    ]).join(',');
    const { data } = await db.from('alumni_contacts').select('id').or(orClauses);
    if (data?.length) matchedContactIds = data.map((c: { id: string }) => c.id);
  }

  if (matchedContactIds.length === 0 && profile.email) {
    const { data } = await db.from('alumni_contacts').select('id').eq('email', profile.email);
    if (data?.length) matchedContactIds = data.map((c: { id: string }) => c.id);
  }

  if (matchedContactIds.length > 0) {
    const contactUpdate: Record<string, unknown> = {
      outreach_status:     'signed_up',
      signed_up_at:        profile.created_at || now,
      platform_user_id:    profile.id,
      platform_chapter_id: profile.chapter_id || null,
      updated_at:          now,
    };
    if (profile.first_name)   contactUpdate.first_name   = profile.first_name;
    if (profile.last_name)    contactUpdate.last_name    = profile.last_name;
    if (profile.email)        contactUpdate.email        = profile.email;
    if (profile.major)        contactUpdate.major        = profile.major;
    if (profile.grad_year)    contactUpdate.grad_year    = typeof profile.grad_year === 'string' ? parseInt(profile.grad_year) : profile.grad_year;
    if (profile.pledge_class) contactUpdate.pledge_class = profile.pledge_class;
    if (profile.linkedin_url) contactUpdate.linkedin_url = profile.linkedin_url;
    if (profile.location)     contactUpdate.location_city = profile.location;

    await db.from('alumni_contacts').update(contactUpdate).in('id', matchedContactIds);

    // Also store the alumni_contact_id on the platform_member row
    await db
      .from('platform_members')
      .update({ alumni_contact_id: matchedContactIds[0] })
      .eq('external_user_id', profile.id);
  }

  // --- Try to match & link chapter_members (headhunting) row ---
  let chapterMemberLinked = false;
  if (profile.first_name && profile.last_name && internalChapterId) {
    chapterMemberLinked = await tryLinkChapterMember(db, {
      platformMemberId: profile.id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      internalChapterId,
      joinedAt: profile.created_at || now,
    });
  }

  return NextResponse.json({
    ok: true,
    platform_member_upserted: true,
    chapter_mapped: !!internalChapterId,
    alumni_contacts_matched: matchedContactIds.length,
    chapter_member_linked: chapterMemberLinked,
  });
}
