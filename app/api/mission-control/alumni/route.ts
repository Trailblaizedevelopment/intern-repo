import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/mission-control/alumni
 * Global alumni view with chapter name join. Supports search, chapter filter, status filter, pagination.
 */
export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Database not configured', data: [], count: 0, chapters: [], statusCounts: {} },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const chapter = searchParams.get('chapter'); // chapter_id
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') ?? '1');
    const rawLimit = parseInt(searchParams.get('limit') ?? '50');
    const limit = rawLimit > 0 ? rawLimit : 50; // no cap — caller controls
    const offset = (page - 1) * limit;

    let query = supabase
      .from('alumni_contacts')
      .select(
        `id, first_name, last_name, chapter_id, phone_primary, outreach_status, updated_at,
         chapter:chapters!chapter_id(id, chapter_name, school, fraternity)`,
        { count: 'exact' }
      )
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (chapter) query = query.eq('chapter_id', chapter);
    if (status) query = query.eq('outreach_status', status);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Get chapters that have alumni for filter dropdown
    const { data: chaptersData } = await supabase
      .from('chapters')
      .select('id, chapter_name, fraternity, school')
      .order('chapter_name');

    // Status counts (global, no filter)
    const { data: statusData } = await supabase
      .from('alumni_contacts')
      .select('outreach_status');

    const statusCounts: Record<string, number> = {};
    for (const row of statusData ?? []) {
      statusCounts[row.outreach_status] = (statusCounts[row.outreach_status] ?? 0) + 1;
    }

    return NextResponse.json({
      data,
      count,
      chapters: chaptersData ?? [],
      statusCounts,
      page,
      limit,
    });
  } catch (err) {
    console.error('[mission-control/alumni] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch alumni data', data: [], count: 0, chapters: [], statusCounts: {} },
      { status: 500 }
    );
  }
}
