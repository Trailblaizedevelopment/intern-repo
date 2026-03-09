import { NextRequest, NextResponse } from 'next/server';
import { SENDING_LINES } from '@/lib/supabase';
import { getPlatformAdmin } from '@/lib/supabase-platform';

export async function GET(request: NextRequest) {
  const supabase = getPlatformAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Platform database not configured', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');

    // ─── No chapter_id: return summary for all chapters ───
    if (!chapterId) {
      const { data: contacts, error } = await supabase
        .from('alumni_contacts')
        .select('chapter_id, phone_primary, is_imessage, outreach_status, last_response_at, touch1_sent_at, touch2_sent_at, touch3_sent_at, response_classification');

      if (error) throw new Error(error.message);

      const { data: chapters } = await supabase
        .from('chapters')
        .select('id, chapter_name');

      const chapterMap = new Map<string, string>();
      for (const ch of chapters || []) chapterMap.set(ch.id, ch.chapter_name);

      // Group by chapter
      const byChapter = new Map<string, typeof contacts>();
      for (const c of contacts || []) {
        if (!byChapter.has(c.chapter_id)) byChapter.set(c.chapter_id, []);
        byChapter.get(c.chapter_id)!.push(c);
      }

      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const summaries = [];

      for (const [cid, rows] of byChapter.entries()) {
        const total = rows.length;
        const have_phone = rows.filter(r => r.phone_primary).length;
        const imessage = rows.filter(r => r.is_imessage === true).length;
        const contacted = rows.filter(r => r.outreach_status && r.outreach_status !== 'not_contacted').length;
        const responded = rows.filter(r => r.last_response_at).length;
        const signed_up = rows.filter(r => r.outreach_status === 'signed_up').length;
        const touch1_ready = rows.filter(r => r.is_imessage && r.outreach_status === 'not_contacted' && !r.touch1_sent_at).length;
        const touch2_due = rows.filter(r =>
          r.is_imessage && r.touch1_sent_at && !r.touch2_sent_at &&
          (r.response_classification === 'confirmed' || r.touch1_sent_at < twoDaysAgo)
        ).length;
        const touch3_due = rows.filter(r =>
          r.is_imessage && r.touch2_sent_at && !r.touch3_sent_at &&
          r.touch2_sent_at < twoDaysAgo &&
          !['signed_up', 'wrong_number', 'opted_out'].includes(r.outreach_status || '')
        ).length;

        summaries.push({
          chapter_id: cid,
          chapter_name: chapterMap.get(cid) || cid,
          total, have_phone, imessage, contacted, responded, signed_up,
          touch1_ready, touch2_due, touch3_due,
        });
      }

      summaries.sort((a, b) => b.contacted - a.contacted);

      return NextResponse.json({ data: summaries, error: null });
    }

    const { count: total } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId);

    const { count: havePhone } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .not('phone_primary', 'is', null);

    const { count: haveEmail } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .not('email', 'is', null);

    const { count: contacted } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .neq('outreach_status', 'not_contacted');

    const { count: imessageCount } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .eq('is_imessage', true);

    const { count: smsCount } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .eq('is_imessage', false);

    const { count: unverifiedCount } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .not('phone_primary', 'is', null)
      .is('is_imessage', null);

    const { count: respondedCount } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .not('last_response_at', 'is', null);

    const { count: signedUpCount } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .eq('outreach_status', 'signed_up');

    const { count: touch1SentCount } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .not('touch1_sent_at', 'is', null);

    const { count: touch2SentCount } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .not('touch2_sent_at', 'is', null);

    const { count: touch3SentCount } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .not('touch3_sent_at', 'is', null);

    // Touch-ready counts for Control Panel
    const { count: touch1Ready } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .eq('is_imessage', true)
      .eq('outreach_status', 'not_contacted')
      .is('touch1_sent_at', null);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    // Touch 2 due: touch1 sent, touch2 not sent, and either confirmed or 2+ days since touch1
    const { data: touch2Candidates } = await supabase
      .from('alumni_contacts')
      .select('id, response_classification, touch1_sent_at', { count: 'exact' })
      .eq('chapter_id', chapterId)
      .eq('is_imessage', true)
      .not('touch1_sent_at', 'is', null)
      .is('touch2_sent_at', null);

    const touch2Due = (touch2Candidates || []).filter(c =>
      c.response_classification === 'confirmed' || (c.touch1_sent_at && c.touch1_sent_at < twoDaysAgo)
    ).length;

    // Touch 3 due: touch2 sent, touch3 not sent, 2+ days since touch2, not terminal status
    const { data: touch3Candidates } = await supabase
      .from('alumni_contacts')
      .select('id, touch2_sent_at')
      .eq('chapter_id', chapterId)
      .eq('is_imessage', true)
      .not('touch2_sent_at', 'is', null)
      .is('touch3_sent_at', null)
      .not('outreach_status', 'in', '("signed_up","wrong_number","opted_out")');

    const touch3Due = (touch3Candidates || []).filter(c =>
      c.touch2_sent_at && c.touch2_sent_at < twoDaysAgo
    ).length;

    // Responses to check: contacts with chat ID, not terminal, eligible for polling
    const { count: responsesToCheck } = await supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId)
      .not('linq_chat_id', 'is', null)
      .not('outreach_status', 'in', '("signed_up","wrong_number","opted_out")');

    // Per-line today counts
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const lineToday: { number: number; label: string; daily_limit: number; sent_today: number }[] = [];
    for (const line of SENDING_LINES) {
      // Count any touch sent today on this line
      const { count: t1 } = await supabase
        .from('alumni_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', chapterId)
        .eq('assigned_line', line.number)
        .gte('touch1_sent_at', todayStr);

      const { count: t2 } = await supabase
        .from('alumni_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', chapterId)
        .eq('assigned_line', line.number)
        .gte('touch2_sent_at', todayStr);

      const { count: t3 } = await supabase
        .from('alumni_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', chapterId)
        .eq('assigned_line', line.number)
        .gte('touch3_sent_at', todayStr);

      lineToday.push({
        number: line.number,
        label: line.label,
        daily_limit: line.daily_limit,
        sent_today: (t1 ?? 0) + (t2 ?? 0) + (t3 ?? 0),
      });
    }

    return NextResponse.json({
      data: {
        total: total ?? 0,
        have_phone: havePhone ?? 0,
        have_email: haveEmail ?? 0,
        contacted: contacted ?? 0,
        imessage: imessageCount ?? 0,
        sms: smsCount ?? 0,
        unverified: unverifiedCount ?? 0,
        responded: respondedCount ?? 0,
        signed_up: signedUpCount ?? 0,
        imessage_eligible: imessageCount ?? 0,
        sms_only: smsCount ?? 0,
        touch1_sent: touch1SentCount ?? 0,
        touch2_sent: touch2SentCount ?? 0,
        touch3_sent: touch3SentCount ?? 0,
        touch1_ready: touch1Ready ?? 0,
        touch2_due: touch2Due,
        touch3_due: touch3Due,
        responses_to_check: responsesToCheck ?? 0,
        line_today: lineToday,
      },
      error: null,
    });
  } catch (err) {
    console.error('Error fetching alumni stats:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to fetch alumni stats', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
