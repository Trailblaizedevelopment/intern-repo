/**
 * POST /api/outreach/conversations/repair-stages
 *
 * One-off repair: for linq_conversations records missing outreach_status or
 * touch_stage, look up the corresponding alumni_contacts record and backfill
 * those fields.
 *
 * Optional body: { chapter_id: string } to scope to one chapter.
 * Without chapter_id, repairs ALL null records (capped at 1000).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const AUTH_TOKEN = process.env.INTERNAL_API_KEY || process.env.NEXT_PUBLIC_INTERNAL_API_KEY || '';

function statusToTouchStage(outreachStatus: string): string | null {
  if (outreachStatus === 'touch1_sent' || outreachStatus === 'touch1_confirmed') return 'T1';
  if (outreachStatus === 'touch2_sent') return 'T2';
  if (outreachStatus === 'touch3_sent') return 'T3';
  if (outreachStatus === 'signed_up') return 'T1'; // signed up from T1 confirm
  return null;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!AUTH_TOKEN || authHeader !== `Bearer ${AUTH_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  let chapterId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    chapterId = body?.chapter_id ?? null;
  } catch { /* no body */ }

  // 1. Find linq_conversations with null outreach_status
  let convQuery = supabase
    .from('linq_conversations')
    .select('id, linq_chat_id, contact_phone, chapter_id')
    .is('outreach_status', null)
    .limit(1000);

  if (chapterId) convQuery = convQuery.eq('chapter_id', chapterId);

  const { data: convs, error: convErr } = await convQuery;
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });
  if (!convs?.length) return NextResponse.json({ repaired: 0, scanned: 0 });

  // 2. Collect unique chat_ids and phones for batch lookup
  const chatIds = convs.map(c => c.linq_chat_id).filter(Boolean) as string[];
  const phones  = convs.map(c => c.contact_phone).filter(Boolean) as string[];

  // Look up alumni_contacts by linq_chat_id (most reliable)
  const chatIdToStatus = new Map<string, string>();
  const BATCH = 50;
  for (let i = 0; i < chatIds.length; i += BATCH) {
    const { data: contacts } = await supabase
      .from('alumni_contacts')
      .select('linq_chat_id, outreach_status')
      .in('linq_chat_id', chatIds.slice(i, i + BATCH));
    for (const c of contacts ?? []) {
      if (c.linq_chat_id && c.outreach_status) {
        chatIdToStatus.set(c.linq_chat_id, c.outreach_status);
      }
    }
  }

  // Fallback: look up by phone_primary for any still unmatched
  const unmatched = convs.filter(c => c.linq_chat_id && !chatIdToStatus.has(c.linq_chat_id));
  const unmatchedPhones = [...new Set(unmatched.map(c => c.contact_phone).filter(Boolean) as string[])];
  const phoneToStatus = new Map<string, string>();
  for (let i = 0; i < unmatchedPhones.length; i += BATCH) {
    const { data: contacts } = await supabase
      .from('alumni_contacts')
      .select('phone_primary, outreach_status')
      .in('phone_primary', unmatchedPhones.slice(i, i + BATCH));
    for (const c of contacts ?? []) {
      if (c.phone_primary && c.outreach_status) {
        phoneToStatus.set(c.phone_primary, c.outreach_status);
      }
    }
  }

  // 3. Build updates
  let repaired = 0;
  const errors: string[] = [];

  for (const conv of convs) {
    const outreachStatus =
      (conv.linq_chat_id ? chatIdToStatus.get(conv.linq_chat_id) : undefined) ??
      (conv.contact_phone ? phoneToStatus.get(conv.contact_phone) : undefined);

    if (!outreachStatus) continue;

    const touchStage = statusToTouchStage(outreachStatus);

    const { error: updateErr } = await supabase
      .from('linq_conversations')
      .update({
        outreach_status: outreachStatus,
        touch_stage: touchStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.id);

    if (updateErr) {
      errors.push(`${conv.id}: ${updateErr.message}`);
    } else {
      repaired++;
    }
  }

  return NextResponse.json({ repaired, scanned: convs.length, errors });
}
