import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/batch-contacts?ids=uuid1,uuid2,...
 * Returns name + grad year for a list of contact IDs.
 * Used by the batch preview expandable contact list.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: [], error: { message: 'Platform database not configured', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const ids = searchParams.get('ids')?.split(',').filter(Boolean) || [];

    if (ids.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const { data, error } = await supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, year, chapter_id')
      .in('id', ids.slice(0, 200)); // cap at 200 for safety

    if (error) throw new Error(error.message);

    return NextResponse.json({ data: data || [] });
  } catch (err) {
    console.error('Error fetching batch contacts:', err);
    return NextResponse.json(
      { data: [], error: { message: 'Failed to fetch contacts', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
