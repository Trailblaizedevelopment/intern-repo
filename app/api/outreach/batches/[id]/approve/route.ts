import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/outreach/batches/[id]/approve
 * Approves a pending outreach batch.
 * Body: { approved_by: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const approved_by: string = body.approved_by || 'Unknown';

  // Verify batch exists and is in pending_approval state
  const { data: existing, error: fetchError } = await admin
    .from('outreach_batches')
    .select('id, status')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  if (existing.status !== 'pending_approval') {
    return NextResponse.json(
      { error: `Cannot approve a batch with status '${existing.status}'` },
      { status: 409 }
    );
  }

  const { data, error } = await admin
    .from('outreach_batches')
    .update({
      status: 'approved',
      approved_by,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
