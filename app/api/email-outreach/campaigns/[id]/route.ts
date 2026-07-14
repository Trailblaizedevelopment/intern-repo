import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/email-outreach/campaigns/[id]
 * Returns campaign + paginated send records.
 *
 * DELETE /api/email-outreach/campaigns/[id]
 * Cancels a draft/scheduled campaign.
 */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: null, error: 'DB not configured' }, { status: 500 });

  const page = parseInt(request.nextUrl.searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;
  const statusFilter = request.nextUrl.searchParams.get('status'); // filter sends by status

  // Campaign
  const { data: campaign, error: campErr } = await supabase
    .from('email_campaigns').select('*').eq('id', id).single();
  if (campErr) return NextResponse.json({ data: null, error: campErr.message }, { status: 404 });

  // Sends
  let sendsQuery = supabase
    .from('email_sends')
    .select('*', { count: 'exact' })
    .eq('campaign_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter) sendsQuery = sendsQuery.eq('status', statusFilter);

  const { data: sends, count: totalSends } = await sendsQuery;

  // Live counts from email_sends — campaign denormalized counters can lag mid-send
  const { data: statusRows } = await supabase
    .from('email_sends')
    .select('status, opened_at, first_clicked_at, bounced_at, unsubscribed_at')
    .eq('campaign_id', id);

  let liveSent = 0;
  let liveOpened = 0;
  let liveClicked = 0;
  let liveBounced = 0;
  let liveUnsub = 0;
  for (const row of statusRows || []) {
    const status = row.status as string;
    if (status === 'pending' || status === 'failed') continue;
    if (status === 'bounced' || row.bounced_at) {
      liveBounced += 1;
      continue;
    }
    liveSent += 1;
    if (row.opened_at || status === 'opened' || status === 'clicked') liveOpened += 1;
    if (row.first_clicked_at || status === 'clicked') liveClicked += 1;
    if (row.unsubscribed_at || status === 'unsubscribed') liveUnsub += 1;
  }

  // Prefer higher of denormalized counters vs live rows (covers mid-send lag / wipe bugs)
  const sentCount = Math.max(campaign.sent_count ?? 0, liveSent);
  const deliveredCount = Math.max(campaign.delivered_count ?? 0, liveSent - liveBounced);
  const openedCount = Math.max(campaign.opened_count ?? 0, liveOpened);
  const clickedCount = Math.max(campaign.clicked_count ?? 0, liveClicked);
  const bouncedCount = Math.max(campaign.bounced_count ?? 0, liveBounced);
  const unsubCount = Math.max(campaign.unsubscribed_count ?? 0, liveUnsub);

  return NextResponse.json({
    data: {
      campaign: {
        ...campaign,
        sent_count: sentCount,
        delivered_count: deliveredCount,
        opened_count: openedCount,
        clicked_count: clickedCount,
        bounced_count: bouncedCount,
        unsubscribed_count: unsubCount,
        open_rate:   sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0,
        click_rate:  sentCount > 0 ? Math.round((clickedCount / sentCount) * 100) : 0,
        bounce_rate: sentCount > 0 ? Math.round((bouncedCount / sentCount) * 100) : 0,
      },
      sends: sends || [],
      total_sends: totalSends || 0,
      page,
    },
    error: null,
  });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data: campaign } = await supabase.from('email_campaigns').select('status').eq('id', id).single();
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (campaign.status === 'sending' || campaign.status === 'sent') {
    return NextResponse.json({ error: 'Cannot cancel a campaign that is sending or sent' }, { status: 400 });
  }

  await supabase.from('email_campaigns').update({ status: 'cancelled' }).eq('id', id);
  return NextResponse.json({ data: { cancelled: true }, error: null });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  const body = await request.json();
  const { data, error } = await supabase.from('email_campaigns').update(body).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
