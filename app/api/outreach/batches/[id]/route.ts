import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/batches/[id]
 * Returns a single batch with its contacts.
 *
 * PATCH /api/outreach/batches/[id]
 * Body: { action: 'approve' | 'reject' | 'approve_contact' | 'reject_contact', batch_contact_id?: string }
 *
 * approve         → status = 'approved', approved_at = now
 * reject          → status = 'cancelled', cancelled_at = now
 * approve_contact → outreach_batch_contacts row status = 'approved'
 * reject_contact  → outreach_batch_contacts row status = 'rejected'
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const { id } = await params;

    const [{ data: batch, error: batchErr }, { data: contacts, error: contactsErr }] = await Promise.all([
      supabase.from('outreach_batches').select('*').eq('id', id).single(),
      supabase.from('outreach_batch_contacts').select('*').eq('batch_id', id).order('created_at', { ascending: true }),
    ]);

    if (batchErr) {
      return NextResponse.json({ data: null, error: { message: batchErr.message, code: batchErr.code } }, { status: 404 });
    }

    return NextResponse.json({
      data: { ...batch, contacts: contacts || [] },
      error: null,
    });
  } catch (err) {
    console.error('[GET /api/outreach/batches/[id]]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const { id }  = await params;
    const body    = await request.json();
    const { action, batch_contact_id } = body as {
      action: 'approve' | 'reject' | 'approve_contact' | 'reject_contact';
      batch_contact_id?: string;
    };

    if (!action) {
      return NextResponse.json({ data: null, error: { message: 'action is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    // ── Bulk batch actions ────────────────────────────────────────────────
    if (action === 'approve') {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('outreach_batches')
        .update({ status: 'approved', approved_at: now })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
      }

      // Also mark any still-pending contacts as approved
      await supabase
        .from('outreach_batch_contacts')
        .update({ status: 'approved' })
        .eq('batch_id', id)
        .eq('status', 'pending');

      return NextResponse.json({ data, error: null });
    }

    if (action === 'reject') {
      const { data, error } = await supabase
        .from('outreach_batches')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
      }
      return NextResponse.json({ data, error: null });
    }

    // ── Per-contact actions ───────────────────────────────────────────────
    if (!batch_contact_id) {
      return NextResponse.json({ data: null, error: { message: 'batch_contact_id is required for contact-level actions', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const newStatus = action === 'approve_contact' ? 'approved' : 'rejected';
    const { data, error } = await supabase
      .from('outreach_batch_contacts')
      .update({ status: newStatus })
      .eq('id', batch_contact_id)
      .eq('batch_id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[PATCH /api/outreach/batches/[id]]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
