import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET - Fetch notifications for a user
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const recipientId = searchParams.get('recipient_id');
    const unreadOnly = searchParams.get('unread_only') === 'true';

    if (!recipientId) {
      return NextResponse.json(
        { data: null, error: { message: 'recipient_id is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    let query = supabase
      .from('ticket_notifications')
      .select(`
        *,
        ticket:tickets!ticket_notifications_ticket_id_fkey(id, number, title, status),
        actor:employees!ticket_notifications_actor_id_fkey(id, name)
      `)
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notifications:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// PATCH - Mark notifications as read
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const body = await request.json();
    const { notification_ids, recipient_id, mark_all } = body;

    if (mark_all && recipient_id) {
      const { error } = await supabase
        .from('ticket_notifications')
        .update({ is_read: true })
        .eq('recipient_id', recipient_id)
        .eq('is_read', false);

      if (error) {
        return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
      }

      return NextResponse.json({ data: { success: true }, error: null });
    }

    if (notification_ids && notification_ids.length > 0) {
      const { error } = await supabase
        .from('ticket_notifications')
        .update({ is_read: true })
        .in('id', notification_ids);

      if (error) {
        return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
      }

      return NextResponse.json({ data: { success: true }, error: null });
    }

    return NextResponse.json(
      { data: null, error: { message: 'notification_ids or mark_all with recipient_id required', code: 'VALIDATION_ERROR' } },
      { status: 400 }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
