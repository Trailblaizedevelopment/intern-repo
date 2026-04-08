import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// DELETE import batch by id
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const { error } = await supabaseAdmin!
      .from('import_batches')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting import batch:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
