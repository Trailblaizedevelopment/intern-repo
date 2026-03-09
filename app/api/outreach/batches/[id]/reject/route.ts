import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/outreach/batches/[id]/reject
 * Rejects a pending outreach batch.
 * Body: { notes?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const notes: string | undefined = body.notes;

  // Verify batch exists and is in pending_approval state
  const { data: existing, error: fetchError } = await admin
    .from('outreach_batches')
    .select('id, status, notes')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  if (existing.status !== 'pending_approval') {
    return NextResponse.json(
      { error: `Cannot reject a batch with status '${existing.status}'` },
      { status: 409 }
    );
  }

  const updatePayload: Record<string, unknown> = { status: 'rejected' };
  if (notes) updatePayload.notes = notes;

  const { data, error } = await admin
    .from('outreach_batches')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
