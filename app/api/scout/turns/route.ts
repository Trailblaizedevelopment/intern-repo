import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/scout/turns?profile_id=...&limit=20
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
    const profileId = searchParams.get('profile_id');
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    if (!profileId) {
      return NextResponse.json(
        { data: null, error: { message: 'profile_id is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('scout_turn_logs')
      .select(
        'id, profile_id, inbound_text, tool_calls, tool_results, rejection_set, validation, sent_text, latency_ms, dry_run, created_at'
      )
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[GET /api/scout/turns] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: data || [], error: null });
  } catch (err) {
    console.error('[GET /api/scout/turns] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
