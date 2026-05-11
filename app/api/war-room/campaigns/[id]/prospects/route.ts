// /app/api/war-room/campaigns/[id]/prospects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { data, error } = await admin
    .from('campaign_prospects')
    .select('*')
    .eq('campaign_id', params.id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(dbToFrontend));
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  // Support bulk insert (array) or single object
  const items = Array.isArray(body) ? body : [body];

  const rows = items.map(p => frontendToDb(p, params.id));

  const { data, error } = await admin
    .from('campaign_prospects')
    .insert(rows)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(dbToFrontend), { status: 201 });
}

export async function PATCH(req: NextRequest, { params: _params }: { params: { id: string } }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'Missing prospect id' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (rest.orgName !== undefined)          patch.org_name            = rest.orgName;
  if (rest.school !== undefined)           patch.school              = rest.school;
  if (rest.contactName !== undefined)      patch.contact_name        = rest.contactName;
  if (rest.contactEmail !== undefined)     patch.contact_email       = rest.contactEmail;
  if (rest.contactPhone !== undefined)     patch.contact_phone       = rest.contactPhone;
  if (rest.contactIg !== undefined)        patch.contact_ig          = rest.contactIg;
  if (rest.channel !== undefined)          patch.channel             = rest.channel;
  if (rest.status !== undefined)           patch.status              = rest.status;
  if (rest.outreachDate !== undefined)     patch.outreach_date       = rest.outreachDate;
  if (rest.lastActivityDate !== undefined) patch.last_activity_date  = rest.lastActivityDate;
  if (rest.assignedTo !== undefined)       patch.assigned_to         = rest.assignedTo;
  if (rest.notes !== undefined)            patch.notes               = rest.notes;
  if (rest.dealId !== undefined)           patch.deal_id             = rest.dealId;

  const { data, error } = await admin
    .from('campaign_prospects')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(dbToFrontend(data));
}

export async function DELETE(req: NextRequest, { params: _params }: { params: { id: string } }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const prospectId = req.nextUrl.searchParams.get('prospectId');
  if (!prospectId) return NextResponse.json({ error: 'Missing prospectId' }, { status: 400 });

  const { error } = await admin
    .from('campaign_prospects')
    .delete()
    .eq('id', prospectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function dbToFrontend(row: Record<string, unknown>) {
  return {
    id:               row.id,
    campaignId:       row.campaign_id,
    orgName:          row.org_name ?? '',
    school:           row.school ?? '',
    contactName:      row.contact_name ?? '',
    contactEmail:     row.contact_email ?? '',
    contactPhone:     row.contact_phone ?? '',
    contactIg:        row.contact_ig ?? '',
    channel:          row.channel ?? '',
    status:           row.status ?? 'not_contacted',
    outreachDate:     row.outreach_date ?? null,
    lastActivityDate: row.last_activity_date ?? null,
    assignedTo:       row.assigned_to ?? '',
    notes:            row.notes ?? '',
    dealId:           row.deal_id ?? null,
    createdAt:        row.created_at,
  };
}

function frontendToDb(p: Record<string, unknown>, campaignId: string) {
  return {
    id:                (p.id && typeof p.id === 'string' && !p.id.startsWith('api-')) ? p.id : undefined,
    campaign_id:       campaignId,
    org_name:          p.orgName ?? '',
    school:            p.school ?? '',
    contact_name:      p.contactName ?? '',
    contact_email:     p.contactEmail ?? '',
    contact_phone:     p.contactPhone ?? '',
    contact_ig:        p.contactIg ?? '',
    channel:           p.channel ?? '',
    status:            p.status ?? 'not_contacted',
    outreach_date:     p.outreachDate ?? null,
    last_activity_date: p.lastActivityDate ?? null,
    assigned_to:       p.assignedTo ?? '',
    notes:             p.notes ?? '',
    deal_id:           p.dealId ?? null,
  };
}
