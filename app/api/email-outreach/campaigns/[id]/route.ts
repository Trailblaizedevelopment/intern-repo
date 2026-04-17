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

  return NextResponse.json({
    data: {
      campaign: {
        ...campaign,
        open_rate:   campaign.sent_count > 0 ? Math.round((campaign.opened_count  / campaign.sent_count) * 100) : 0,
        click_rate:  campaign.sent_count > 0 ? Math.round((campaign.clicked_count / campaign.sent_count) * 100) : 0,
        bounce_rate: campaign.sent_count > 0 ? Math.round((campaign.bounced_count / campaign.sent_count) * 100) : 0,
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
