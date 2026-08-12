import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const INTRO_SELECT = `
  *,
  requester:requester_id(id, name, phone_number, university, chapter, career_interest),
  target:target_id(id, name, phone_number, university, chapter, career_interest)
`;

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
    const status = searchParams.get('status');
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));

    let query = supabase
      .from('scout_introductions')
      .select(INTRO_SELECT);

    if (status) {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/scout/introductions] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[GET /api/scout/introductions] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

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
    const {
      requester_id,
      target_id,
      platform_target_id,
      platform_target_snapshot,
      reason,
    } = body;

    if (!requester_id || !reason) {
      return NextResponse.json(
        { data: null, error: { message: 'requester_id and reason are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    if (!target_id && !platform_target_id) {
      return NextResponse.json(
        {
          data: null,
          error: { message: 'target_id or platform_target_id is required', code: 'MISSING_FIELDS' },
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('scout_introductions')
      .insert({
        requester_id,
        target_id: target_id || null,
        platform_target_id: platform_target_id || null,
        platform_target_snapshot: platform_target_snapshot || null,
        reason,
        status: body.status || 'suggested',
      })
      .select(INTRO_SELECT)
      .single();

    if (error) {
      console.error('[POST /api/scout/introductions] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/scout/introductions] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { data: null, error: { message: 'id and status are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const validStatuses = ['suggested', 'pending_approval', 'sent', 'accepted', 'declined'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { data: null, error: { message: `status must be one of: ${validStatuses.join(', ')}`, code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('scout_introductions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(INTRO_SELECT)
      .single();

    if (error) {
      console.error('[PATCH /api/scout/introductions] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[PATCH /api/scout/introductions] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
