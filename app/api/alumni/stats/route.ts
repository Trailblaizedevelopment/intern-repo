import { NextRequest, NextResponse } from 'next/server';
import { SENDING_LINES } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Platform database not configured', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');

    // ─── No chapter_id: return summary for all chapters via COUNT queries ───
    if (!chapterId) {
      const { data: chapters, error: chapError } = await supabase
        .from('chapters')
        .select('id, chapter_name');

      if (chapError) throw new Error(chapError.message);

      const summaries = await Promise.all((chapters || []).map(async (ch) => {
        const [
          { count: total },
          { count: have_phone },
          { count: contacted },
          { count: responded },
          { count: signed_up },
          { count: imessage },
          { count: sms },
          { count: contacted_with_phone },
        ] = await Promise.all([
          supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id),
          supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).not('phone_primary', 'is', null),
          supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).neq('outreach_status', 'not_contacted'),
          supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).not('last_response_at', 'is', null),
          supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).eq('outreach_status', 'signed_up'),
          supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).eq('is_imessage', true),
          supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).eq('is_imessage', false),
          // Outreach coverage: contacts with phone who have been contacted (status != not_contacted)
          supabase.from('alumni_contacts').select('*', { count: 'exact', head: true })
            .eq('chapter_id', ch.id)
            .not('phone_primary', 'is', null)
            .neq('outreach_status', 'not_contacted'),
        ]);

        // Skip chapters with no alumni
        if (!total || total === 0) return null;

        const havePhoneNum = have_phone ?? 0;
        const contactedWithPhoneNum = contacted_with_phone ?? 0;
        const outreachCoveragePct = havePhoneNum > 0
          ? Math.round((contactedWithPhoneNum / havePhoneNum) * 100)
          : 0;

        return {
          chapter_id: ch.id,
          chapter_name: ch.chapter_name,
          total: total ?? 0,
          have_phone: havePhoneNum,
          contacted: contacted ?? 0,
          responded: responded ?? 0,
          signed_up: signed_up ?? 0,
          imessage: imessage ?? 0,
          sms: sms ?? 0,
          outreach_coverage_pct: outreachCoveragePct,
          outreach_contacted_with_phone: contactedWithPhoneNum,
          // touch_ready fields omitted from all-chapters summary (expensive, unused by stats cards)
          touch1_ready: 0,
          touch2_due: 0,
          touch3_due: 0,
        };
      }));

      const filtered = summaries.filter(Boolean) as NonNullable<typeof summaries[0]>[];
      filtered.sort((a, b) => b.contacted - a.contacted);

      return NextResponse.json({ data: filtered, error: null });
    }

    // ─── Per-chapter detail ───

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

    // Phone type breakdown (for Data Quality Card)
    const [
      { count: mobileCount },
      { count: voipCount },
      { count: landlineCount },
      { count: unknownPhoneCount },
      { count: enrichedCount },
      { count: signedUpDqCount },
    ] = await Promise.all([
      supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', chapterId).eq('phone_type', 'mobile'),
      supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', chapterId).eq('phone_type', 'voip'),
      supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', chapterId).eq('phone_type', 'landline'),
      supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', chapterId).or('phone_type.is.null,phone_type.eq.unknown'),
      supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', chapterId).not('phone_type', 'is', null).not('phone_type', 'eq', 'unknown'),
      supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', chapterId).or('platform_user_id.not.is.null,signed_up_at.not.is.null,outreach_status.eq.signed_up'),
    ]);

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

    // Touch 2 due: touch1 sent, touch2 not sent, not terminal status, and either confirmed or 2+ days since touch1
    const { data: touch2Candidates } = await supabase
      .from('alumni_contacts')
      .select('id, response_classification, touch1_sent_at', { count: 'exact' })
      .eq('chapter_id', chapterId)
      .eq('is_imessage', true)
      .not('touch1_sent_at', 'is', null)
      .is('touch2_sent_at', null)
      .not('outreach_status', 'in', '("signed_up","wrong_number","opted_out")');

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

    const havePhoneNum = havePhone ?? 0;
    const contactedNum = contacted ?? 0;
    const outreachCoveragePct = havePhoneNum > 0
      ? Math.round((contactedNum / havePhoneNum) * 100)
      : 0;

    return NextResponse.json({
      data: {
        total: total ?? 0,
        have_phone: havePhoneNum,
        have_email: haveEmail ?? 0,
        contacted: contactedNum,
        outreach_coverage_pct: outreachCoveragePct,
        imessage: imessageCount ?? 0,
        sms: smsCount ?? 0,
        unverified: unverifiedCount ?? 0,
        responded: respondedCount ?? 0,
        signed_up: signedUpCount ?? 0,
        imessage_eligible: imessageCount ?? 0,
        sms_only: smsCount ?? 0,
        // Phone type breakdown (Data Quality Card)
        mobile: mobileCount ?? 0,
        voip: voipCount ?? 0,
        landline: landlineCount ?? 0,
        unknown: unknownPhoneCount ?? 0,
        enriched: enrichedCount ?? 0,
        signed_up_dq: signedUpDqCount ?? 0,
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
