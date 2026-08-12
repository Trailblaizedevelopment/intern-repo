import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  findChapterCandidates,
  formatAlumniMatches,
  shouldFetchMatches,
} from '@/lib/scout/match';

/**
 * GET /api/scout/matches?profile_id=...
 * Debug/ops: return ranked platform chapter peers for a Scout profile.
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

    const profileId = new URL(request.url).searchParams.get('profile_id');
    if (!profileId) {
      return NextResponse.json(
        { data: null, error: { message: 'profile_id is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const { data: profile, error } = await supabase
      .from('scout_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { data: null, error: { message: 'Profile not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const wouldFetch = shouldFetchMatches('reply', profile);
    const candidates = await findChapterCandidates({
      id: profile.id,
      platform_chapter_id: profile.platform_chapter_id,
      source_type: profile.source_type,
      source_id: profile.source_id,
      looking_for: profile.looking_for,
      career_interest: profile.career_interest,
      goals: profile.goals,
      opt_in_status: profile.opt_in_status,
    });

    return NextResponse.json({
      data: {
        platform_chapter_id: profile.platform_chapter_id,
        would_inject_on_reply: wouldFetch,
        candidates,
        formatted: formatAlumniMatches(candidates),
      },
      error: null,
    });
  } catch (err) {
    console.error('[GET /api/scout/matches] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
