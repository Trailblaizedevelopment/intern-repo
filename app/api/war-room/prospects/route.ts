/**
 * War Room Campaign Prospects API
 * Replaces localStorage persistence with Supabase for multi-user shared state.
 *
 * Requires: campaign_prospects table (see MIGRATIONS_PENDING.md)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Map camelCase frontend fields → snake_case DB columns
function toDb(p: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (p.id          !== undefined) row.id               = p.id;
  if (p.campaignId  !== undefined) row.campaign_id      = p.campaignId;
  if (p.orgName     !== undefined) row.org_name         = p.orgName;
  if (p.school      !== undefined) row.school           = p.school;
  if (p.contactName !== undefined) row.contact_name     = p.contactName;
  if (p.contactEmail!== undefined) row.contact_email    = p.contactEmail;
  if (p.contactPhone!== undefined) row.contact_phone    = p.contactPhone;
  if (p.contactIg   !== undefined) row.contact_ig       = p.contactIg;
  if (p.channel     !== undefined) row.channel          = p.channel;
  if (p.status      !== undefined) row.status           = p.status;
  if (p.outreachDate!== undefined) row.outreach_date    = p.outreachDate;
  if (p.lastActivityDate !== undefined) row.last_activity_date = p.lastActivityDate;
  if (p.assignedTo  !== undefined) row.assigned_to      = p.assignedTo;
  if (p.notes       !== undefined) row.notes            = p.notes;
  if (p.dealId      !== undefined) row.deal_id          = p.dealId;
  return row;
}

function toFrontend(row: Record<string, unknown>) {
  return {
    id:               row.id,
    campaignId:       row.campaign_id,
    orgName:          row.org_name,
    school:           row.school,
    contactName:      row.contact_name,
    contactEmail:     row.contact_email,
    contactPhone:     row.contact_phone,
    contactIg:        row.contact_ig,
    channel:          row.channel,
    status:           row.status,
    outreachDate:     row.outreach_date,
    lastActivityDate: row.last_activity_date,
    assignedTo:       row.assigned_to,
    notes:            row.notes,
    dealId:           row.deal_id,
    createdAt:        row.created_at,
  };
}

/** GET /api/war-room/prospects?campaign_id=xxx — fetch all or by campaign */
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const campaignId = req.nextUrl.searchParams.get('campaign_id');
  let query = admin
    .from('campaign_prospects')
    .select('*')
    .order('created_at', { ascending: true });

  if (campaignId) query = query.eq('campaign_id', campaignId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(toFrontend));
}

/** POST /api/war-room/prospects — create one prospect OR bulk array */
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const isBulk = Array.isArray(body);
  const items: Record<string, unknown>[] = isBulk ? body : [body];

  const payload = items.map(toDb);

  const { data, error } = await admin
    .from('campaign_prospects')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: false })
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const result = (data ?? []).map(toFrontend);
  return NextResponse.json(isBulk ? result : result[0], { status: 201 });
}

/** PATCH /api/war-room/prospects — update one prospect by id */
export async function PATCH(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const { id, ...rest } = body as Record<string, unknown>;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const payload = toDb(rest);

  const { data, error } = await admin
    .from('campaign_prospects')
    .update(payload)
    .eq('id', id as string)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toFrontend(data as Record<string, unknown>));
}

/** DELETE /api/war-room/prospects?id=xxx — delete one prospect */
export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await admin.from('campaign_prospects').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
