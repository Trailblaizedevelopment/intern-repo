import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/outreach/cleanup-stale
 *
 * Marks contacts as 'no_response' when they've been sitting at touch3_sent
 * for 7+ days with no reply. Keeps the pipeline view clean and prevents
 * stale contacts from clogging stats.
 *
 * Also handles touch2_sent contacts older than 14 days with no reply —
 * marks them no_response so T3 logic can decide whether to proceed.
 *
 * Safe to run daily. Returns counts of what was cleaned up.
 */

const AUTH_TOKEN = process.env.INTERNAL_API_KEY || '';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const cutoff7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff14days = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. touch3_sent for 7+ days, no reply → no_response (end of line)
    const { data: staleT3, error: e1 } = await supabase
      .from('alumni_contacts')
      .update({ outreach_status: 'no_response' })
      .eq('outreach_status', 'touch3_sent')
      .lte('touch3_sent_at', cutoff7days)
      .is('last_response_at', null)
      .not('flagged', 'is', true)
      .select('id');

    if (e1) throw new Error(e1.message);

    // 2. pitched for 7+ days, no reply and no signup → no_response
    const { data: stalePitched, error: e2 } = await supabase
      .from('alumni_contacts')
      .update({ outreach_status: 'no_response' })
      .eq('outreach_status', 'pitched')
      .lte('touch2_sent_at', cutoff7days)
      .is('last_response_at', null)
      .not('flagged', 'is', true)
      .select('id');

    if (e2) throw new Error(e2.message);

    // 3. touch2_sent for 14+ days, no reply → no_response
    // (T3 was never sent — these fell through. Clean them up.)
    const { data: staleT2, error: e3 } = await supabase
      .from('alumni_contacts')
      .update({ outreach_status: 'no_response' })
      .eq('outreach_status', 'touch2_sent')
      .lte('touch2_sent_at', cutoff14days)
      .is('last_response_at', null)
      .is('touch3_sent_at', null)
      .not('flagged', 'is', true)
      .select('id');

    if (e3) throw new Error(e3.message);

    const t3Count = staleT3?.length ?? 0;
    const pitchedCount = stalePitched?.length ?? 0;
    const t2Count = staleT2?.length ?? 0;
    const total = t3Count + pitchedCount + t2Count;

    return NextResponse.json({
      ok: true,
      cleaned: total,
      breakdown: {
        touch3_to_no_response: t3Count,
        pitched_to_no_response: pitchedCount,
        touch2_to_no_response: t2Count,
      },
    });
  } catch (err) {
    console.error('[cleanup-stale]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
