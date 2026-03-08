import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/alumni-contacts?chapter_id=X
 *
 * Returns all alumni contacts for a chapter, with optional filtering.
 * Protected by INTERNAL_API_KEY via middleware.
 *
 * Query params:
 *   chapter_id       (required) UUID of the chapter
 *   outreach_status  (optional) filter by status enum
 *   limit            (optional) default 100, max 500
 *   offset           (optional) default 0
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');

    if (!chapterId) {
      return NextResponse.json(
        { data: null, error: { message: 'chapter_id is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const outreachStatus = searchParams.get('outreach_status');
    // Allow full export when export=true (no page cap)
    const isExport = searchParams.get('export') === 'true';
    const limit  = isExport ? 10000 : Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    let query = supabase
      .from('alumni_contacts')
      .select(
        `id,
        first_name, last_name,
        email, year,
        phone_primary, phone_secondary,
        outreach_status, is_imessage, assigned_line,
        linq_chat_id,
        touch1_sent_at, touch2_sent_at, touch3_sent_at,
        last_response_at, response_text, response_classification,
        flagged, flagged_reason,
        signed_up_at, platform_user_id,
        created_at`,
        { count: 'exact' }
      )
      .eq('chapter_id', chapterId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);

    if (outreachStatus) {
      query = query.eq('outreach_status', outreachStatus);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/alumni-contacts] DB error:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: {
        contacts: data,
        total: count ?? 0,
        limit,
        offset,
      },
      error: null,
    });
  } catch (err) {
    console.error('[GET /api/alumni-contacts] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
