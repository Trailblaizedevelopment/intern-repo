/**
 * POST /api/alumni/backfill-signups
 *
 * One-time (and re-runnable) sync: queries the external Trailblaize platform's
 * Supabase `profiles` table for all alumni accounts, then matches each profile
 * against the internal `alumni_contacts` table and enriches the records.
 *
 * Requires the external project credentials in the request body (kept server-side only).
 *
 * Body:
 *   {
 *     external_url:  string,   // external Supabase project URL
 *     external_key:  string,   // external service role key
 *     secret:        string,   // ALUMNI_WEBHOOK_SECRET
 *     dry_run?:      boolean   // if true, returns matches without writing
 *   }
 *
 * Returns:
 *   { total_profiles, matched, updated, unmatched: [...], errors: [...] }
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_SECRET     = process.env.ALUMNI_WEBHOOK_SECRET    || '';
const internalUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL  || '';
const internalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getInternal() {
  if (!internalUrl || !internalServiceKey) return null;
  return createClient(internalUrl, internalServiceKey);
}

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
  id: string;
  role: string;
  phone?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  chapter_id?: string | null;
  grad_year?: number | string | null;
  major?: string | null;
  pledge_class?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  created_at?: string | null;
}

export async function POST(request: NextRequest) {
  // Auth
  const body = await request.json() as {
    external_url: string;
    external_key: string;
    secret?: string;
    dry_run?: boolean;
  };

  if (WEBHOOK_SECRET && body.secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!body.external_url || !body.external_key) {
    return NextResponse.json({ error: 'external_url and external_key required' }, { status: 400 });
  }

  const ext = createClient(body.external_url, body.external_key);
  const db  = getInternal();
  if (!db) return NextResponse.json({ error: 'Internal DB not configured' }, { status: 500 });

  // Fetch all alumni profiles from external platform
  const { data: profiles, error: extErr } = await ext
    .from('profiles')
    .select('id, role, phone, email, first_name, last_name, chapter_id, grad_year, major, pledge_class, linkedin_url, location, created_at')
    .eq('role', 'alumni');

  if (extErr) return NextResponse.json({ error: `External fetch failed: ${extErr.message}` }, { status: 500 });
  if (!profiles?.length) return NextResponse.json({ ok: true, total_profiles: 0, matched: 0 });

  // Fetch all internal contacts once (bulk match is faster than N queries)
  const { data: allContacts, error: intErr } = await db
    .from('alumni_contacts')
    .select('id, phone_primary, phone_secondary, email, outreach_status');

  if (intErr) return NextResponse.json({ error: `Internal fetch failed: ${intErr.message}` }, { status: 500 });

  // Build lookup maps for fast matching
  const byPhone = new Map<string, string[]>(); // normalized phone → contact ids
  const byEmail = new Map<string, string>();   // email → contact id

  for (const contact of (allContacts || [])) {
    for (const phone of [contact.phone_primary, contact.phone_secondary]) {
      const variants = phoneVariants(phone);
      for (const v of variants) {
        if (!byPhone.has(v)) byPhone.set(v, []);
        byPhone.get(v)!.push(contact.id);
      }
    }
    if (contact.email) byEmail.set(contact.email.toLowerCase(), contact.id);
  }

  const results = {
    total_profiles: profiles.length,
    matched: 0,
    updated: 0,
    already_signed_up: 0,
    unmatched: [] as { id: string; name: string; phone: string | null; email: string | null }[],
    errors: [] as { profile_id: string; error: string }[],
  };

  const updates: Array<{ ids: string[]; payload: Record<string, unknown> }> = [];

  for (const profile of profiles as ExternalProfile[]) {
    // Find matching contact IDs
    let matchedIds: string[] = [];

    const variants = phoneVariants(profile.phone);
    for (const v of variants) {
      const ids = byPhone.get(v);
      if (ids?.length) { matchedIds = ids; break; }
    }

    if (matchedIds.length === 0 && profile.email) {
      const id = byEmail.get(profile.email.toLowerCase());
      if (id) matchedIds = [id];
    }

    if (matchedIds.length === 0) {
      results.unmatched.push({
        id: profile.id,
        name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '—',
        phone: profile.phone ?? null,
        email: profile.email ?? null,
      });
      continue;
    }

    results.matched++;

    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      outreach_status: 'signed_up',
      signed_up_at: profile.created_at || now,
      platform_user_id: profile.id,
      updated_at: now,
    };
    if (profile.chapter_id)   update.platform_chapter_id = profile.chapter_id;
    if (profile.first_name)   update.first_name           = profile.first_name;
    if (profile.last_name)    update.last_name            = profile.last_name;
    if (profile.email)        update.email                = profile.email;
    if (profile.major)        update.major                = profile.major;
    if (profile.grad_year)    update.grad_year            = typeof profile.grad_year === 'string' ? parseInt(profile.grad_year) : profile.grad_year;
    if (profile.pledge_class) update.pledge_class         = profile.pledge_class;
    if (profile.linkedin_url) update.linkedin_url         = profile.linkedin_url;
    if (profile.location)     update.location_city        = profile.location;

    updates.push({ ids: matchedIds, payload: update });
  }

  if (!body.dry_run && updates.length > 0) {
    // Apply all updates in batches
    for (const { ids, payload } of updates) {
      const { error } = await db
        .from('alumni_contacts')
        .update(payload)
        .in('id', ids);

      if (error) {
        results.errors.push({ profile_id: String(payload.platform_user_id), error: error.message });
      } else {
        results.updated += ids.length;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: body.dry_run ?? false,
    ...results,
  });
}
