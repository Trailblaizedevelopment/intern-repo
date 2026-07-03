import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getLinearApiKeyHeader } from '@/lib/linear';
import { pushTicketPatchToLinear } from '@/lib/linear-push-ticket';
import { deleteLinearIssue } from '@/lib/linear-update-issue';

const TICKET_SELECT = `
  *,
  creator:employees!tickets_creator_id_fkey(id, name, email, role),
  assignee:employees!tickets_assignee_id_fkey(id, name, email, role),
  reviewer:employees!tickets_reviewer_id_fkey(id, name, email, role)
`;

function validateStatusTransition(
  currentStatus: string,
  newStatus: string,
  _assigneeId: string | null,
  _reviewerId: string | null
): { valid: boolean; message?: string } {
  const ALL_STATUSES = ['backlog', 'todo', 'open', 'in_progress', 'in_review', 'testing', 'done', 'canceled'];
  if (!ALL_STATUSES.includes(newStatus)) {
    return { valid: false, message: `Unknown status: "${newStatus}"` };
  }
  if (currentStatus === newStatus) {
    return { valid: false, message: `Ticket is already "${currentStatus}"` };
  }
  return { valid: true };
}

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
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching ticket:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { id } = await params;
    const body = await request.json();
    const actorId = body.actor_id;

    const { data: current, error: fetchError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ data: null, error: { message: 'Ticket not found', code: 'NOT_FOUND' } }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = ['title', 'description', 'type', 'priority', 'status', 'assignee_id', 'reviewer_id', 'due_date', 'labels', 'project_id', 'parent_ticket_id', 'milestone_id', 'sprint', 'story_points', 'test_result'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (body.status && body.status !== current.status) {
      const reviewerId = body.reviewer_id ?? current.reviewer_id;
      const assigneeId = body.assignee_id ?? current.assignee_id;

      const validation = validateStatusTransition(current.status, body.status, assigneeId, reviewerId);
      if (!validation.valid) {
        return NextResponse.json(
          { data: null, error: { message: validation.message, code: 'INVALID_TRANSITION' } },
          { status: 400 }
        );
      }

      if (body.status === 'done') {
        updateData.resolved_at = new Date().toISOString();
      } else {
        updateData.resolved_at = null;
      }
    }

    if (current.external_id && getLinearApiKeyHeader()) {
      try {
        await pushTicketPatchToLinear(supabase, current, body);
      } catch (linearErr) {
        const message =
          linearErr instanceof Error ? linearErr.message : 'Failed to update Linear issue';
        console.error('Linear update failed:', linearErr);
        return NextResponse.json(
          { data: null, error: { message: `Linear update failed: ${message}`, code: 'LINEAR_UPDATE_FAILED' } },
          { status: 502 }
        );
      }
    }

    const { data: updated, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', id)
      .select(TICKET_SELECT)
      .single();

    if (error) {
      console.error('Error updating ticket:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    const activityEntries: Array<{
      ticket_id: string;
      actor_id: string | null;
      action: string;
      from_value: string | null;
      to_value: string | null;
    }> = [];

    if (body.title !== undefined && body.title !== current.title) {
      activityEntries.push({
        ticket_id: id,
        actor_id: actorId || null,
        action: 'title_changed',
        from_value: current.title,
        to_value: body.title,
      });
    }

    if (body.description !== undefined && body.description !== current.description) {
      activityEntries.push({
        ticket_id: id,
        actor_id: actorId || null,
        action: 'description_changed',
        from_value: current.description ? current.description.substring(0, 100) : null,
        to_value: body.description ? String(body.description).substring(0, 100) : null,
      });
    }

    if (body.status && body.status !== current.status) {
      activityEntries.push({
        ticket_id: id,
        actor_id: actorId || null,
        action: 'status_changed',
        from_value: current.status,
        to_value: body.status,
      });
    }

    if (body.assignee_id !== undefined && body.assignee_id !== current.assignee_id) {
      activityEntries.push({
        ticket_id: id,
        actor_id: actorId || null,
        action: 'assigned',
        from_value: current.assignee_id,
        to_value: body.assignee_id,
      });

      if (body.assignee_id && body.assignee_id !== actorId) {
        const actorName = updated.creator?.name || 'Someone';
        await supabase.from('ticket_notifications').insert([{
          recipient_id: body.assignee_id,
          ticket_id: id,
          type: 'assigned',
          message: `${actorName} assigned you ticket #${updated.number}: ${updated.title}`,
          actor_id: actorId || null,
        }]);
      }
    }

    if (body.priority && body.priority !== current.priority) {
      activityEntries.push({
        ticket_id: id,
        actor_id: actorId || null,
        action: 'priority_changed',
        from_value: current.priority,
        to_value: body.priority,
      });
    }

    if (activityEntries.length > 0) {
      await supabase.from('ticket_activity').insert(activityEntries);
    }

    if (body.status && body.status !== current.status && current.creator_id && current.creator_id !== actorId) {
      await supabase.from('ticket_notifications').insert([{
        recipient_id: current.creator_id,
        ticket_id: id,
        type: 'status_changed',
        message: `Ticket #${updated.number} moved to ${body.status.replace('_', ' ')}`,
        actor_id: actorId || null,
      }]);
    }

    return NextResponse.json({ data: updated, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { id } = await params;

    const { data: ticket } = await supabase
      .from('tickets')
      .select('external_id, number')
      .eq('id', id)
      .maybeSingle();

    if (ticket?.external_id && getLinearApiKeyHeader()) {
      try {
        await deleteLinearIssue(ticket.external_id);
      } catch (linearErr) {
        const message =
          linearErr instanceof Error ? linearErr.message : 'Failed to delete Linear issue';
        console.error('Linear delete failed:', linearErr);
        return NextResponse.json(
          { data: null, error: { message: `Linear delete failed: ${message}`, code: 'LINEAR_DELETE_FAILED' } },
          { status: 502 }
        );
      }

      await supabase.from('linear_issue_labels').delete().eq('issue_id', ticket.external_id);
      await supabase.from('linear_comments').delete().eq('issue_id', ticket.external_id);
      await supabase.from('linear_issues').delete().eq('id', ticket.external_id);
    }

    await supabase.from('ticket_activity').delete().eq('ticket_id', id);
    await supabase.from('ticket_comments').delete().eq('ticket_id', id);
    await supabase.from('ticket_notifications').delete().eq('ticket_id', id);

    const { error } = await supabase
      .from('tickets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting ticket:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
