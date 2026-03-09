import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

  const now = new Date();
  const annotated = (data || []).map(c => ({
    ...c,
    open_rate: c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0,
    click_rate: c.sent_count > 0 ? Math.round((c.clicked_count / c.sent_count) * 100) : 0,
    bounce_rate: c.sent_count > 0 ? Math.round((c.bounced_count / c.sent_count) * 100) : 0,
    next_touch_due: c.next_touch_eligible_at ? new Date(c.next_touch_eligible_at) <= now : false,
  }));

  return NextResponse.json({ data: annotated, error: null });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: null, error: 'DB not configured' }, { status: 500 });

  try {
    const body = await request.json();
    const { chapter_id, touch_number, subject_line, template_html, scheduled_at, created_by } = body;

    if (!chapter_id || !touch_number || !subject_line || !template_html) {
      return NextResponse.json({ data: null, error: 'chapter_id, touch_number, subject_line, template_html required' }, { status: 400 });
    }

    const { data: chapter } = await supabase.from('chapters').select('chapter_name').eq('id', chapter_id).single();

    // Count eligible contacts
    const { data: unsubs } = await supabase.from('email_unsubscribes').select('email');
    const unsubCount = (unsubs || []).length;
    const { count } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapter_id)
      .not('email', 'is', null)
      .neq('email', '');
    const totalContacts = Math.max(0, (count || 0) - unsubCount);

    let nextTouchEligibleAt: string | null = null;
    if (touch_number < 3) {
      const base = scheduled_at ? new Date(scheduled_at) : new Date();
      base.setDate(base.getDate() + (touch_number === 1 ? 5 : 8));
      nextTouchEligibleAt = base.toISOString();
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
      .select();

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
    return NextResponse.json({ data, error: null }, { status: 201 });

  } catch (err) {
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}
