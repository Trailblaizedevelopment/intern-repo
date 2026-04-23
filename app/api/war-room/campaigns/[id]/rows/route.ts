import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/war-room/campaigns/[id]/rows
 * Appends one or more rows to a campaign's rows JSONB array.
 *
 * Body (single):  { chapterName, contactName?, contactInfo?, method?, status?, notes?, meetingBooked? }
 * Body (bulk):    { rows: [{ chapterName, ... }, ...] }
 *
 * GET /api/war-room/campaigns/[id]/rows
 * Returns the campaign's rows array.
 */

interface CampaignRow {
  id: string;
  chapterName: string;
  contactName: string;
  contactInfo: string;
  method: string;
  status: string;
  notes: string;
  sourceUrl: string;
  meetingBooked: boolean;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { id } = await params;
  const { data, error } = await admin
    .from('war_room_campaigns')
    .select('rows')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data: data?.rows ?? [], error: null });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { id } = await params;
  const body = await req.json();

  // Support single row or bulk rows
  const newRows: Partial<CampaignRow>[] = Array.isArray(body.rows) ? body.rows : [body];

  // Fetch existing campaign
  const { data: campaign, error: fetchErr } = await admin
    .from('war_room_campaigns')
    .select('rows')
    .eq('id', id)
    .single();

  if (fetchErr || !campaign) {
    return NextResponse.json({ error: fetchErr?.message ?? 'Campaign not found' }, { status: 404 });
  }

  const existingRows: CampaignRow[] = Array.isArray(campaign.rows) ? campaign.rows : [];

  // Build new rows with defaults
  const rowsToAdd: CampaignRow[] = newRows.map(r => ({
    id: r.id || generateId(),
    chapterName: r.chapterName || '',
    contactName: r.contactName || '',
    contactInfo: r.contactInfo || '',
    method: r.method || '',
    status: r.status || 'not_contacted',
    notes: r.notes || '',
    sourceUrl: r.sourceUrl || '',
    meetingBooked: r.meetingBooked ?? false,
  }));

  // Deduplicate by chapterName (case-insensitive) — skip rows that already exist
  const existingNames = new Set(existingRows.map(r => (r.chapterName || '').toLowerCase()));
  const uniqueNew = rowsToAdd.filter(r => !existingNames.has((r.chapterName || '').toLowerCase()));

  const updatedRows = [...existingRows, ...uniqueNew];

  // Update campaign
  const { data: updated, error: updateErr } = await admin
    .from('war_room_campaigns')
    .update({ rows: updatedRows, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      added: uniqueNew.length,
      skipped: rowsToAdd.length - uniqueNew.length,
      totalRows: updatedRows.length,
      rows: updatedRows,
    },
    error: null,
  });
}
