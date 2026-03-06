import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/chapters
 *
 * Returns all chapters with full detail needed by the alumni agent and success agent.
 * Protected by INTERNAL_API_KEY via middleware (Authorization: Bearer <key> or x-api-key header).
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from('chapters')
      .select(`
        id,
        chapter_name,
        school,
        fraternity,
        status,
        health,
        alumni_join_link,
        payment_amount,
        payment_type,
        last_payment_date,
        next_payment_date,
        last_check_in_date,
        next_check_in_date,
        check_in_frequency,
        onboarding_completed,
        next_action,
        notes,
        active_members,
        estimated_alumni
      `)
      .order('chapter_name', { ascending: true });

    if (error) {
      console.error('[GET /api/chapters] DB error:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[GET /api/chapters] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
