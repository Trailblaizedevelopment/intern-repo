import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/chapters/[id]/analytics
 * Returns three datasets for the chapter analytics dashboard:
 * 1. weekly_signups      — new sign-ups per week for the last 12 weeks
 * 2. outreach_funnel     — total → phone → contacted → responded → signed_up
 * 3. weekly_response_rate — responses vs contacts-sent per week (last 12 weeks)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    // Pull every alumni_contact for this chapter (just the fields we need)
    const { data: contacts, error } = await supabase
      .from('alumni_contacts')
      .select(
        'id, phone_primary, outreach_status, touch1_sent_at, touch2_sent_at, touch3_sent_at, last_response_at, signed_up_at'
      )
      .eq('chapter_id', chapterId);

    if (error) throw new Error(error.message);

    const rows = contacts ?? [];

    // ─── Helpers ─────────────────────────────────────────────────────────────
    // Monday-anchored ISO week label: "Mar 24"
    function weekLabel(date: Date): string {
      const d = new Date(date);
      const day = d.getDay(); // 0=Sun
      d.setDate(d.getDate() - ((day + 6) % 7)); // rewind to Monday
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Get Monday of week for a date (for sorting)
    function weekStart(date: Date): string {
      const d = new Date(date);
      const day = d.getDay();
      d.setDate(d.getDate() - ((day + 6) % 7));
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }

    const now = new Date();
    // 12 calendar weeks back from today (Mon-anchored)
    const twelveWeeksAgo = new Date(now);
    twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);

    // Build an ordered list of 12 week labels (oldest → newest)
    const weekKeys: string[] = [];
    const weekKeySet = new Set<string>();
    for (let w = 0; w < 12; w++) {
      const d = new Date(now);
      d.setDate(d.getDate() - w * 7);
      const label = weekLabel(d);
      if (!weekKeySet.has(label)) {
        weekKeys.unshift(label); // push to front so we end up oldest→newest
        weekKeySet.add(label);
      }
    }

    // ─── 1. Weekly Signups ────────────────────────────────────────────────────
    const signupByWeek: Record<string, number> = {};
    weekKeys.forEach((k) => (signupByWeek[k] = 0));

    for (const c of rows) {
      if (!c.signed_up_at) continue;
      const d = new Date(c.signed_up_at);
      if (d < twelveWeeksAgo) continue;
      const label = weekLabel(d);
      if (label in signupByWeek) signupByWeek[label] = (signupByWeek[label] ?? 0) + 1;
    }

    const weekly_signups = weekKeys.map((week) => ({ week, signups: signupByWeek[week] ?? 0 }));

    // ─── 2. Outreach Funnel ───────────────────────────────────────────────────
    const total = rows.length;
    const withPhone = rows.filter((c) => c.phone_primary).length;
    const contacted = rows.filter((c) => c.outreach_status !== 'not_contacted').length;
    const responded = rows.filter((c) => c.last_response_at).length;
    const signedUp = rows.filter((c) => c.outreach_status === 'signed_up').length;

    const outreach_funnel = [
      { stage: 'Total Alumni', value: total, fill: '#60a5fa' },
      { stage: 'Have Phone', value: withPhone, fill: '#818cf8' },
      { stage: 'Contacted', value: contacted, fill: '#a78bfa' },
      { stage: 'Responded', value: responded, fill: '#34d399' },
      { stage: 'Signed Up', value: signedUp, fill: '#10b981' },
    ];

    // ─── 3. Weekly Response Rate ──────────────────────────────────────────────
    // contacts_sent = earliest touch sent that week; responses = last_response_at that week
    const sentByWeek: Record<string, number> = {};
    const responsesByWeek: Record<string, number> = {};
    weekKeys.forEach((k) => { sentByWeek[k] = 0; responsesByWeek[k] = 0; });

    for (const c of rows) {
      // Earliest touch sent this week
      const touches = [c.touch1_sent_at, c.touch2_sent_at, c.touch3_sent_at]
        .filter(Boolean)
        .map((t) => new Date(t as string));

      for (const t of touches) {
        if (t < twelveWeeksAgo) continue;
        const label = weekLabel(t);
        if (label in sentByWeek) sentByWeek[label] = (sentByWeek[label] ?? 0) + 1;
      }

      if (c.last_response_at) {
        const d = new Date(c.last_response_at);
        if (d >= twelveWeeksAgo) {
          const label = weekLabel(d);
          if (label in responsesByWeek) responsesByWeek[label] = (responsesByWeek[label] ?? 0) + 1;
        }
      }
    }

    const weekly_response_rate = weekKeys.map((week) => {
      const sent = sentByWeek[week] ?? 0;
      const responses = responsesByWeek[week] ?? 0;
      const rate = sent > 0 ? Math.round((responses / sent) * 100) : 0;
      return { week, sent, responses, rate };
    });

    return NextResponse.json({
      data: { weekly_signups, outreach_funnel, weekly_response_rate },
      error: null,
    });
  } catch (err) {
    console.error('[GET /api/chapters/[id]/analytics]', err);
    return NextResponse.json(
      { data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
