import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/mission-control/alumni
 * Global alumni view (no chapter_id required). Supports search, chapter filter, status filter, pagination.
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
    const chapter = searchParams.get('chapter');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') ?? '1');
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const offset = (page - 1) * limit;

    let query = supabase
      .from('alumni_contacts')
      .select(
        'id, first_name, last_name, chapter_id, chapter_name, school_name, phone_primary, outreach_status, updated_at',
        { count: 'exact' }
      )
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (chapter) query = query.eq('chapter_name', chapter);
    if (status) query = query.eq('outreach_status', status);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Distinct chapters for filter dropdown
    const { data: chaptersRaw } = await supabase
      .from('alumni_contacts')
      .select('chapter_name')
      .not('chapter_name', 'is', null)
      .order('chapter_name');

    const distinctChapters = [
      ...new Set((chaptersRaw ?? []).map((r: { chapter_name: string }) => r.chapter_name)),
    ].filter(Boolean);

    // Status counts
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
      chapters: distinctChapters,
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
