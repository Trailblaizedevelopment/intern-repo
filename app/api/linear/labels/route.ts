import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface LinearLabelOption {
  id: string;
  name: string;
  color: string | null;
}

/**
 * GET /api/linear/labels
 * Returns synced Linear labels for ticket property editing.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.includes(process.env.INTERNAL_API_KEY || '')) {
    return NextResponse.json({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from('linear_labels')
      .select('id, name, color')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching linear labels:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data: (data ?? []) as LinearLabelOption[], error: null });
  } catch (err) {
    console.error('Unexpected error fetching linear labels:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
