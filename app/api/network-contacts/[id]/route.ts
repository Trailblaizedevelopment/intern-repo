import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * PATCH /api/network-contacts/[id]
 * Update a network contact.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabase
      .from('network_contacts')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[PATCH /api/network-contacts/[id]] DB error:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[PATCH /api/network-contacts/[id]] Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

/**
 * DELETE /api/network-contacts/[id]
 * Delete a network contact.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { id } = await params;

    const { error } = await supabase
      .from('network_contacts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[DELETE /api/network-contacts/[id]] DB error:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('[DELETE /api/network-contacts/[id]] Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
