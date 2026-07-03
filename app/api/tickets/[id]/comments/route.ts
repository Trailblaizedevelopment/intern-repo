import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createTicketCommentWithLinearSync } from '@/lib/linear-comment-bridge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { id } = await params;

    const { data, error } = await supabase
      .from('ticket_comments')
      .select(`
        *,
        author:employees!ticket_comments_author_id_fkey(id, name, email, role)
      `)
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comments:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { id: ticketId } = await params;
    const body = await request.json();
    const { content, author_id, mentions } = body;

    if (!content?.trim()) {
      return NextResponse.json(
        { data: null, error: { message: 'Comment content is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data: ticket } = await supabase
      .from('tickets')
      .select('id, external_id, number, title, creator_id, assignee_id')
      .eq('id', ticketId)
      .single();

    if (!ticket) {
      return NextResponse.json(
        { data: null, error: { message: 'Ticket not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    let comment: Record<string, unknown>;
    try {
      const result = await createTicketCommentWithLinearSync(
        supabase,
        ticket,
        content,
        author_id || null,
        mentions || []
      );
      comment = result.comment;
    } catch (syncErr) {
      const message = syncErr instanceof Error ? syncErr.message : 'Failed to sync comment to Linear';
      console.error('Comment sync failed:', syncErr);
      return NextResponse.json(
        { data: null, error: { message: `Linear comment sync failed: ${message}`, code: 'LINEAR_COMMENT_FAILED' } },
        { status: 502 }
      );
    }

    await supabase.from('ticket_activity').insert([{
      ticket_id: ticketId,
      actor_id: author_id || null,
      action: 'commented',
      to_value: content.trim().substring(0, 100),
    }]);

    const authorName = (comment.author as { name?: string } | null)?.name || 'Someone';
    const notifications: Array<{
      recipient_id: string;
      ticket_id: string;
      type: string;
      message: string;
      actor_id: string | null;
    }> = [];

    if (mentions && mentions.length > 0) {
      for (const mentionedId of mentions) {
        if (mentionedId !== author_id) {
          notifications.push({
            recipient_id: mentionedId,
            ticket_id: ticketId,
            type: 'mentioned',
            message: `${authorName} mentioned you in ticket #${ticket.number}: ${ticket.title}`,
            actor_id: author_id || null,
          });
        }
      }
    }

    if (ticket.creator_id && ticket.creator_id !== author_id && !mentions?.includes(ticket.creator_id)) {
      notifications.push({
        recipient_id: ticket.creator_id,
        ticket_id: ticketId,
        type: 'commented',
        message: `${authorName} commented on ticket #${ticket.number}: ${ticket.title}`,
        actor_id: author_id || null,
      });
    }

    if (
      ticket.assignee_id &&
      ticket.assignee_id !== author_id &&
      ticket.assignee_id !== ticket.creator_id &&
      !mentions?.includes(ticket.assignee_id)
    ) {
      notifications.push({
        recipient_id: ticket.assignee_id,
        ticket_id: ticketId,
        type: 'commented',
        message: `${authorName} commented on ticket #${ticket.number}: ${ticket.title}`,
        actor_id: author_id || null,
      });
    }

    if (notifications.length > 0) {
      await supabase.from('ticket_notifications').insert(notifications);
    }

    return NextResponse.json({ data: comment, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
