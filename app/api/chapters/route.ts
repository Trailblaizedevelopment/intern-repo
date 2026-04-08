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
      .select('*')
      .order('created_at', { ascending: false });

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

/**
 * POST /api/chapters
 * Create a new chapter using the admin client (bypasses RLS).
 * Body: chapter fields to insert.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const body = await request.json();

    // Strip id and timestamps so DB defaults apply
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _created_at, updated_at: _updated_at, ...fields } = body;

    if (!fields.chapter_name?.trim()) {
      return NextResponse.json(
        { data: null, error: { message: 'chapter_name is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('chapters')
      .insert([fields])
      .select()
      .single();

    if (error) {
      console.error('[POST /api/chapters] DB error:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/chapters] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
