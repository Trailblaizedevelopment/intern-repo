import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysISO = sevenDaysAgo.toISOString();

    // Messages today per line
    const { data: todayMessages } = await supabase
      .from('scout_conversations')
      .select('linq_line')
      .gte('created_at', todayISO);

    const lineCounts: Record<string, number> = {};
    for (const msg of todayMessages || []) {
      lineCounts[msg.linq_line] = (lineCounts[msg.linq_line] || 0) + 1;
    }

    // Active conversations (threads with messages in last 7 days)
    const { data: recentMessages } = await supabase
      .from('scout_conversations')
      .select('phone_number')
      .gte('created_at', sevenDaysISO);

    const activeConvos = new Set((recentMessages || []).map(m => m.phone_number)).size;

    // Response rate: threads with at least 1 outbound that also have an inbound
    const { data: outboundPhones } = await supabase
      .from('scout_conversations')
      .select('phone_number')
      .eq('direction', 'outbound');

    const outboundSet = new Set((outboundPhones || []).map(m => m.phone_number));

    const { data: inboundPhones } = await supabase
      .from('scout_conversations')
      .select('phone_number')
      .eq('direction', 'inbound');

    const inboundSet = new Set((inboundPhones || []).map(m => m.phone_number));

    const totalOutboundThreads = outboundSet.size;
    const respondedThreads = [...outboundSet].filter(p => inboundSet.has(p)).length;
    const responseRate = totalOutboundThreads > 0
      ? Math.round((respondedThreads / totalOutboundThreads) * 100)
      : 0;

    // Opt-out count
    const { count: optOutCount } = await supabase
      .from('scout_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('opt_in_status', 'opted_out');

    // Total profiles
    const { count: totalProfiles } = await supabase
      .from('scout_profiles')
      .select('*', { count: 'exact', head: true });

    // Flagged count
    const { count: flaggedCount } = await supabase
      .from('scout_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('flagged', true);

    // Pending intros
    const { count: pendingIntros } = await supabase
      .from('scout_introductions')
      .select('*', { count: 'exact', head: true })
      .in('status', ['suggested', 'pending_approval']);

    const { count: pendingInvites } = await supabase
      .from('scout_invite_suggestions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Unread count
    const { count: unreadCount } = await supabase
      .from('scout_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('read', false)
      .eq('direction', 'inbound');

    const stats = {
      messages_today: lineCounts,
      messages_today_total: (todayMessages || []).length,
      active_convos: activeConvos,
      response_rate: responseRate,
      opt_out_count: optOutCount ?? 0,
      total_profiles: totalProfiles ?? 0,
      flagged_count: flaggedCount ?? 0,
      pending_intros: pendingIntros ?? 0,
      pending_invites: pendingInvites ?? 0,
      unread_count: unreadCount ?? 0,
    };

    return NextResponse.json({ data: stats, error: null });
  } catch (err) {
    console.error('[GET /api/scout/stats] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
