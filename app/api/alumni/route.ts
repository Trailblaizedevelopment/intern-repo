import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortDir = searchParams.get('sort_dir') || 'desc';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');
    const offset = (page - 1) * limit;

    if (!chapterId) {
      return NextResponse.json(
        { data: null, error: { message: 'chapter_id is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    let query = supabase
      .from('alumni_contacts')
      .select('*', { count: 'exact' })
      .eq('chapter_id', chapterId);

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone_primary.ilike.%${search}%,phone_secondary.ilike.%${search}%`);
    }

    if (status && status !== 'all') {
      query = query.eq('outreach_status', status);
    }

    const imessageFilter = searchParams.get('imessage_filter');
    if (imessageFilter === 'imessage') {
      query = query.eq('is_imessage', true);
    } else if (imessageFilter === 'sms') {
      query = query.eq('is_imessage', false);
    } else if (imessageFilter === 'unverified') {
      query = query.not('phone_primary', 'is', null).is('is_imessage', null);
    }

    const lineFilter = searchParams.get('line_filter');
    if (lineFilter && lineFilter !== 'all') {
      query = query.eq('assigned_line', parseInt(lineFilter));
    }

    const touchFilter = searchParams.get('touch_filter');
    if (touchFilter === 'needs_touch1') {
      query = query.eq('is_imessage', true).eq('outreach_status', 'not_contacted').is('touch1_sent_at', null);
    } else if (touchFilter === 'needs_touch2') {
      query = query.not('touch1_sent_at', 'is', null).is('touch2_sent_at', null);
    } else if (touchFilter === 'needs_touch3') {
      query = query.not('touch2_sent_at', 'is', null).is('touch3_sent_at', null);
    } else if (touchFilter === 'complete') {
      query = query.not('touch3_sent_at', 'is', null);
    } else if (touchFilter === 'no_response') {
      query = query.not('touch1_sent_at', 'is', null).is('last_response_at', null);
    }

    const validSortColumns = [
      'first_name', 'last_name', 'email', 'phone_primary', 'phone_secondary',
      'year', 'outreach_status', 'created_at', 'assigned_line',
      'touch1_sent_at', 'last_response_at',
    ];
    const col = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    query = query.order(col, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { contacts: data, total: count ?? 0, page, limit },
      error: null,
    });
  } catch (err) {
    console.error('Error fetching alumni:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to fetch alumni contacts', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { chapter_id, first_name, last_name, phone_primary, phone_secondary, email, year } = body;

    if (!chapter_id || !first_name || !last_name) {
      return NextResponse.json(
        { data: null, error: { message: 'chapter_id, first_name, and last_name are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('alumni_contacts')
      .insert({ chapter_id, first_name, last_name, phone_primary: phone_primary || null, phone_secondary: phone_secondary || null, email: email || null, year: year || null })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { data: null, error: { message: 'A contact with this phone number already exists for this chapter', code: 'DUPLICATE' } },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Error creating alumni contact:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to create alumni contact', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { ids, updates } = body as { ids: string[]; updates: Record<string, unknown> };

    if (!ids || ids.length === 0) {
      return NextResponse.json(
        { data: null, error: { message: 'ids array is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const allowedFields = [
      'first_name', 'last_name', 'phone_primary', 'phone_secondary', 'email', 'year',
      'outreach_status', 'is_imessage', 'provider_conversation_id', 'assigned_line',
      'touch1_sent_at', 'touch2_sent_at', 'touch3_sent_at',
      'last_response_at', 'response_text', 'response_classification',
    ];
    const sanitized: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
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
      .from('alumni_contacts')
      .update(sanitized)
      .in('id', ids)
      .select();

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Error updating alumni contacts:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to update alumni contacts', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { ids } = body as { ids: string[] };

    if (!ids || ids.length === 0) {
      return NextResponse.json(
        { data: null, error: { message: 'ids array is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('alumni_contacts')
      .delete()
      .in('id', ids);

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { deleted: ids.length }, error: null });
  } catch (err) {
    console.error('Error deleting alumni contacts:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to delete alumni contacts', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
