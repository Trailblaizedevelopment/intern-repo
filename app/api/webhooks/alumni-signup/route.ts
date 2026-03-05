/**
 * POST /api/webhooks/alumni-signup
 *
 * Triggered by a Supabase Database Webhook on the external (trailblaize.net)
 * platform when a row is inserted into the `profiles` table with role = 'alumni'.
 *
 * Supabase webhook payload wraps the row as:
 *   { type: "INSERT", table: "profiles", record: { ...profileRow } }
 *
 * Also accepts a flat profile object directly for manual/test calls.
 *
 * What it does:
 *   1. Verifies x-webhook-secret header
 *   2. Extracts the profile, skips non-alumni roles
 *   3. Normalizes phone to digits-only for matching
 *   4. Matches against alumni_contacts by phone (primary/secondary) or email
 *   5. Updates: outreach_status → signed_up, stores enrichment data
 *      (platform_user_id, platform_chapter_id, grad_year, major, pledge_class,
 *       linkedin_url, location_city, signed_up_at)
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_SECRET     = process.env.ALUMNI_WEBHOOK_SECRET    || '';
const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL  || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/** Strip all non-digit characters, then normalise US numbers to E.164 */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // 10-digit US → add +1
  if (digits.length === 10) return `+1${digits}`;
  // 11-digit starting with 1 → add +
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

/** Build all candidate phone strings for matching (normalized + raw digits) */
function phoneVariants(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const norm = normalizePhone(raw);
  const digits10 = raw.replace(/\D/g, '').slice(-10); // last 10 digits
  const variants = new Set<string>();
  if (norm)     variants.add(norm);
  if (digits10) variants.add(digits10);
  variants.add(raw.replace(/\D/g, '')); // raw digits
  return Array.from(variants).filter(Boolean);
}

interface ExternalProfile {
  id?: string;
  role?: string;
  phone?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  chapter_id?: string | null;
  grad_year?: number | string | null;
  major?: string | null;
  pledge_class?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  created_at?: string | null;
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

  // Handle Supabase webhook envelope: { type, table, record } or flat profile
  let profile: ExternalProfile;
  const body = rawBody as Record<string, unknown>;
  if (body.record && typeof body.record === 'object') {
    profile = body.record as ExternalProfile;
  } else {
    profile = body as ExternalProfile;
  }

  // Only process alumni
  if (profile.role && profile.role !== 'alumni') {
    return NextResponse.json({ ok: true, skipped: 'non-alumni role' });
  }

  if (!profile.phone && !profile.email) {
    return NextResponse.json({ error: 'phone or email required in profile' }, { status: 400 });
  }

  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // --- Match against alumni_contacts ---
  let matchedIds: string[] = [];

  // Try phone match first (most reliable)
  if (profile.phone) {
    const variants = phoneVariants(profile.phone);
    // Build OR clause for all phone variants against both phone columns
    const orClauses = variants.flatMap(v => [
      `phone_primary.eq.${v}`,
      `phone_secondary.eq.${v}`,
    ]).join(',');

    const { data } = await db
      .from('alumni_contacts')
      .select('id')
      .or(orClauses);

    if (data?.length) matchedIds = data.map((c: { id: string }) => c.id);
  }

  // Fallback: email match
  if (matchedIds.length === 0 && profile.email) {
    const { data } = await db
      .from('alumni_contacts')
      .select('id')
      .eq('email', profile.email);
    if (data?.length) matchedIds = data.map((c: { id: string }) => c.id);
  }

  if (matchedIds.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, note: 'No matching contact found' });
  }

  // --- Build enrichment payload ---
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    outreach_status: 'signed_up',
    signed_up_at: profile.created_at || now,
    updated_at: now,
  };

  if (profile.id)           update.platform_user_id    = profile.id;
  if (profile.chapter_id)   update.platform_chapter_id = profile.chapter_id;
  if (profile.first_name)   update.first_name           = profile.first_name;
  if (profile.last_name)    update.last_name            = profile.last_name;
  if (profile.email)        update.email                = profile.email;
  if (profile.grad_year)    update.major                = profile.major ?? undefined; // keep existing if not provided
  if (profile.grad_year)    update.grad_year            = typeof profile.grad_year === 'string' ? parseInt(profile.grad_year) : profile.grad_year;
  if (profile.pledge_class) update.pledge_class         = profile.pledge_class;
  if (profile.linkedin_url) update.linkedin_url         = profile.linkedin_url;
  if (profile.location)     update.location_city        = profile.location;

  const { error: updateErr } = await db
    .from('alumni_contacts')
    .update(update)
    .in('id', matchedIds);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, matched: matchedIds.length, updated: matchedIds });
}
