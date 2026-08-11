import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100')));
    const offset = (page - 1) * limit;
    const line = searchParams.get('line');
    const flagged = searchParams.get('flagged');
    const unread = searchParams.get('unread');
    const phone = searchParams.get('phone');
    const profileId = searchParams.get('profile_id');

    let query = supabase
      .from('scout_conversations')
      .select('*', { count: 'exact' });

    if (line) query = query.eq('linq_line', line);
    if (flagged === 'true') query = query.eq('flagged', true);
    if (unread === 'true') query = query.eq('read', false);
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      const normalized = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : phone.startsWith('+') ? phone : `+${digits}`;
      const raw10 = digits.slice(-10);
      query = query.or(`phone_number.eq.${phone},phone_number.eq.${normalized},phone_number.eq.${raw10}`);
    }
    if (profileId) query = query.eq('profile_id', profileId);

    query = query.order('created_at', { ascending: false });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/scout/conversations] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, total: count ?? 0, error: null });
  } catch (err) {
    console.error('[GET /api/scout/conversations] Unexpected error:', err);
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
    const { phone_number, linq_line, linq_chat_id, direction, message_body, profile_id } = body;

    if (!phone_number || !linq_line || !direction || !message_body) {
      return NextResponse.json(
        { data: null, error: { message: 'phone_number, linq_line, direction, and message_body are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    if (!['inbound', 'outbound'].includes(direction)) {
      return NextResponse.json(
        { data: null, error: { message: 'direction must be inbound or outbound', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const insertData: Record<string, unknown> = {
      phone_number,
      linq_line,
      linq_chat_id: linq_chat_id || null,
      direction,
      message_body,
      profile_id: profile_id || null,
      read: direction === 'outbound',
    };

    const { data, error } = await supabase
      .from('scout_conversations')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[POST /api/scout/conversations] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/scout/conversations] Unexpected error:', err);
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
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { data: null, error: { message: 'id is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const allowedFields = ['read', 'flagged', 'flag_reason'];
    const sanitized: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        sanitized[key] = updates[key];
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json(
        { data: null, error: { message: 'No valid fields to update', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('scout_conversations')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[PATCH /api/scout/conversations] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[PATCH /api/scout/conversations] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
