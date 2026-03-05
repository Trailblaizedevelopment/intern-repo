/**
 * POST /api/webhooks/alumni-signup
 *
 * Called by a Supabase Database Webhook (or the Trailblaize client app directly)
 * when an alumni creates an account on the platform.
 *
 * Expected payload:
 *   {
 *     phone:      string,          // primary phone number
 *     email?:     string,
 *     first_name?: string,
 *     last_name?:  string,
 *     user_id:    string,          // uid in the client-facing Supabase project
 *     secret:     string           // WEBHOOK_SECRET env var for auth
 *   }
 *
 * What it does:
 *   1. Verifies the secret header
 *   2. Finds the matching AlumniContact by phone number
 *   3. Updates outreach_status → 'signed_up'
 *   4. Stores the user_id for cross-platform linking
 */

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_SECRET    = process.env.ALUMNI_WEBHOOK_SECRET  || '';
const supabaseUrl       = process.env.NEXT_PUBLIC_SUPABASE_URL       || '';
const supabaseServiceKey= process.env.SUPABASE_SERVICE_ROLE_KEY      || '';

function getAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: NextRequest) {
  // --- Auth ---
  const secret = request.headers.get('x-webhook-secret') || '';
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    phone?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    user_id?: string;
    secret?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { phone, email, first_name, last_name, user_id } = body;
  if (!phone && !email) {
    return NextResponse.json({ error: 'phone or email required' }, { status: 400 });
  }

  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // --- Find matching contact(s) ---
  let query = db
    .from('alumni_contacts')
    .select('id, outreach_status')
    .neq('outreach_status', 'opted_out');

  if (phone) {
    // normalize: strip non-digits for comparison
    query = query.or(`phone_primary.eq.${phone},phone_secondary.eq.${phone}`);
  } else if (email) {
    query = query.eq('email', email);
  }

  const { data: contacts, error: fetchErr } = await query;
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

  if (!contacts || contacts.length === 0) {
    // No match — still return 200 so webhook doesn't retry
    return NextResponse.json({ ok: true, matched: 0 });
  }

  const ids = contacts.map(c => c.id);
  const updatePayload: Record<string, unknown> = {
    outreach_status: 'signed_up',
    updated_at: new Date().toISOString(),
  };
  if (user_id)    updatePayload.platform_user_id = user_id;
  if (first_name) updatePayload.first_name = first_name;
  if (last_name)  updatePayload.last_name  = last_name;
  if (email)      updatePayload.email      = email;

  const { error: updateErr } = await db
    .from('alumni_contacts')
    .update(updatePayload)
    .in('id', ids);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, matched: ids.length, updated: ids });
}
