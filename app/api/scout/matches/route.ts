import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { searchNetwork, type ScoutRejection } from '@/lib/scout/search';
import { loadActiveRejections } from '@/lib/scout/tool-handlers';
import { enrichProfileFromPlatform, toDiscoveryProfile } from '@/lib/scout/discovery';

/**
 * GET /api/scout/matches?profile_id=...
 * Debug/ops: ranked chapter (tier 1) search with rejection filters.
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

    const { data: profileRow, error } = await supabase
      .from('scout_profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (error || !profileRow) {
      return NextResponse.json(
        { data: null, error: { message: 'Profile not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const profile = await enrichProfileFromPlatform(toDiscoveryProfile(profileRow));
    const rejections: ScoutRejection[] = await loadActiveRejections(supabase, profileId);
    const result = await searchNetwork(
      {
        id: profile.id,
        platform_chapter_id: profile.platform_chapter_id,
        source_type: profile.source_type,
        source_id: profile.source_id,
        looking_for: profile.looking_for,
        career_interest: profile.career_interest || profile.industry,
        location: profile.location,
        industry: profile.industry,
        goals: profile.goals,
        opt_in_status: profileRow.opt_in_status,
      },
      { query: profile.looking_for || undefined, location: profile.location || undefined },
      rejections
    );

    return NextResponse.json({
      data: {
        platform_chapter_id: profile.platform_chapter_id,
        rejections,
        ...result,
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
