import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';

/**
 * GET /api/email-outreach/campaigns?chapter_id=X
 * Returns all campaigns for a chapter, newest first, with touch-cadence status.
 *
 * POST /api/email-outreach/campaigns
 * Creates a campaign (draft). Does NOT send yet.
 * Body: { chapter_id, touch_number, subject_line, template_html, scheduled_at? }
 */

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: null, error: 'DB not configured' }, { status: 500 });

  const chapterId = request.nextUrl.searchParams.get('chapter_id');

  let query = supabase
    .from('email_campaigns')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (chapterId) query = query.eq('chapter_id', chapterId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  // Annotate with cadence info: when is next touch eligible?
  const now = new Date();
  const annotated = (data || []).map(c => ({
    ...c,
    open_rate:    c.sent_count   > 0 ? Math.round((c.opened_count  / c.sent_count) * 100) : 0,
    click_rate:   c.sent_count   > 0 ? Math.round((c.clicked_count / c.sent_count) * 100) : 0,
    bounce_rate:  c.sent_count   > 0 ? Math.round((c.bounced_count / c.sent_count) * 100) : 0,
    next_touch_due: c.next_touch_eligible_at ? new Date(c.next_touch_eligible_at) <= now : false,
  }));

  return NextResponse.json({ data: annotated, error: null });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const platform = getPlatformAdmin();
  if (!supabase) return NextResponse.json({ data: null, error: 'DB not configured' }, { status: 500 });

  try {
    const body = await request.json();
    const { chapter_id, touch_number, subject_line, template_html, scheduled_at, created_by } = body;

    if (!chapter_id || !touch_number || !subject_line || !template_html) {
      return NextResponse.json({ data: null, error: 'chapter_id, touch_number, subject_line, template_html required' }, { status: 400 });
    }

    // Get chapter name
    const { data: chapter } = await supabase
      .from('chapters')
      .select('chapter_name')
      .eq('id', chapter_id)
      .single();

    // Count eligible contacts (have email, not unsubscribed)
    let totalContacts = 0;
    if (platform) {
      // Get unsubscribed emails from internal DB
      const { data: unsubs } = await supabase
        .from('email_unsubscribes')
        .select('email');
      const unsubEmails = new Set((unsubs || []).map(u => u.email.toLowerCase()));

      const { count } = await platform
        .from('alumni_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', chapter_id)
        .not('email', 'is', null)
        .neq('email', '');

      totalContacts = (count || 0) - unsubEmails.size;
    }

    // Calculate next touch eligibility based on touch number
    // T1 → T2: 5 days | T2 → T3: 8 days
    let nextTouchEligibleAt: string | null = null;
    if (touch_number < 3) {
      const daysUntilNext = touch_number === 1 ? 5 : 8;
      const sendTime = scheduled_at ? new Date(scheduled_at) : new Date();
      sendTime.setDate(sendTime.getDate() + daysUntilNext);
      nextTouchEligibleAt = sendTime.toISOString();
    }

    const { data, error } = await supabase
      .from('email_campaigns')
      .insert({
        chapter_id,
        chapter_name: chapter?.chapter_name || '',
        touch_number,
        subject_line,
        template_html,
        status: scheduled_at ? 'scheduled' : 'draft',
        scheduled_at: scheduled_at || null,
        total_contacts: totalContacts,
        next_touch_eligible_at: nextTouchEligibleAt,
        created_by: created_by || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null }, { status: 201 });

  } catch (err) {
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
