import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/platform-members?chapter_id=X
 *
 * Returns alumni who have signed up on trailblaize.net for the given chapter.
 * Pulls from `platform_members` table, joined on `chapter_external_mappings`
 * to resolve the internal chapter_id.
 *
 * Protected by INTERNAL_API_KEY via middleware.
 *
 * Query params:
 *   chapter_id  (required) internal UUID of the chapter
 *
 * Response:
 *   { data: { members: [...], count: N }, error: null }
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

    const { data, error, count } = await supabase
      .from('platform_members')
      .select(
        `id,
        first_name,
        last_name,
        email,
        grad_year,
        signed_up_at,
        onboarding_completed`,
        { count: 'exact' }
      )
      .eq('chapter_id', chapterId)
      .order('signed_up_at', { ascending: false });

    if (error) {
      console.error('[GET /api/platform-members] DB error:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    // Normalize: surface a single `name` field for convenience
    const members = (data || []).map((m) => ({
      id:                   m.id,
      name:                 [m.first_name, m.last_name].filter(Boolean).join(' ') || null,
      email:                m.email,
      grad_year:            m.grad_year,
      signed_up_at:         m.signed_up_at,
      onboarding_completed: m.onboarding_completed,
    }));

    return NextResponse.json({
      data: {
        members,
        count: count ?? members.length,
      },
      error: null,
    });
  } catch (err) {
    console.error('[GET /api/platform-members] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
