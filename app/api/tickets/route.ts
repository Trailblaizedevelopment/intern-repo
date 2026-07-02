import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  mapLinearStateToTicketStatus,
  parseLinearIdentifierSearch,
} from '@/lib/linear-ticket-map';
import {
  cacheCreatedLinearIssue,
  createLinearIssue,
  htmlToLinearDescription,
  LINEAR_TEAM_ID,
} from '@/lib/linear-create-issue';
import { getLinearApiKeyHeader } from '@/lib/linear';

const TICKET_SELECT = `
  *,
  creator:employees!tickets_creator_id_fkey(id, name, email, role),
  assignee:employees!tickets_assignee_id_fkey(id, name, email, role),
  reviewer:employees!tickets_reviewer_id_fkey(id, name, email, role)
`;

// GET - List tickets with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assigneeId = searchParams.get('assignee_id');
    const creatorId = searchParams.get('creator_id');
    const priority = searchParams.get('priority');
    const type = searchParams.get('type');
    const project = searchParams.get('project');
    const search = searchParams.get('search');

    let query = supabase
      .from('tickets')
      .select(TICKET_SELECT)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      if (status === 'active') {
        query = query.in('status', ['backlog', 'todo', 'open', 'in_progress', 'in_review', 'testing']);
      } else {
        query = query.eq('status', status);
      }
    } else if (!status) {
      // Default: exclude canceled (soft-deleted) tickets unless explicitly requested
      query = query.neq('status', 'canceled');
    }

    if (assigneeId) query = query.eq('assignee_id', assigneeId);
    if (creatorId) query = query.eq('creator_id', creatorId);
    if (priority) query = query.eq('priority', priority);
    if (type) query = query.eq('type', type);
    if (project) query = query.eq('project', project);
    if (search) {
      const linearIdentifier = parseLinearIdentifierSearch(search);
      if (linearIdentifier) {
        query = query.eq('linear_identifier', linearIdentifier);
      } else {
        // Support searching by ticket number: #238 or TRA-238 style on number field
        const numberMatch = search.match(/^#?(\d+)$/) || search.match(/^TRA-(\d+)$/i);
        if (numberMatch) {
          query = query.eq('number', parseInt(numberMatch[1], 10));
        } else if (/^[0-9a-f-]{36}$/i.test(search.trim())) {
          query = query.eq('external_id', search.trim());
        } else {
          query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,linear_identifier.ilike.%${search}%`);
        }
      }
    }

    const parentTicketId = searchParams.get('parent_ticket_id');
    if (parentTicketId) query = query.eq('parent_ticket_id', parentTicketId);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tickets:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// POST - Create a new ticket
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const body = await request.json();
    const {
      title,
      description,
      type,
      priority,
      assignee_id,
      creator_id,
      due_date,
      labels,
      project,
      project_id,
      parent_ticket_id,
      milestone_id,
      sprint,
      story_points,
      external_id,
      linear_identifier,
      create_in_linear,
      skip_linear,
    } = body;

    if (!title) {
      return NextResponse.json(
        { data: null, error: { message: 'Title is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const shouldCreateInLinear =
      !external_id &&
      !skip_linear &&
      create_in_linear !== false &&
      Boolean(getLinearApiKeyHeader());

    let linearIssueId = external_id || null;
    let linearIdentifier = linear_identifier || null;
    let linearUrl: string | null = null;
    let ticketStatus = 'open';
    let linearLabelNames = labels || [];

    if (shouldCreateInLinear) {
      let assigneeEmail: string | null = null;
      if (assignee_id) {
        const { data: assignee } = await supabase
          .from('employees')
          .select('email')
          .eq('id', assignee_id)
          .maybeSingle();
        assigneeEmail = assignee?.email ?? null;
      }

      let crmProjectName: string | null = project || null;
      if (project_id) {
        const { data: crmProject } = await supabase
          .from('projects')
          .select('name')
          .eq('id', project_id)
          .maybeSingle();
        if (crmProject?.name) crmProjectName = crmProject.name;
      }

      let parentLinearIssueId: string | null = null;
      if (parent_ticket_id) {
        const { data: parentTicket } = await supabase
          .from('tickets')
          .select('external_id')
          .eq('id', parent_ticket_id)
          .maybeSingle();
        parentLinearIssueId = parentTicket?.external_id ?? null;
      }

      const linearDescription = description
        ? htmlToLinearDescription(description)
        : null;

      try {
        const created = await createLinearIssue(supabase, {
          title: title.trim(),
          description: linearDescription,
          type: type || 'bug',
          priority: priority || 'medium',
          assigneeEmail,
          dueDate: due_date || null,
          projectName: project || null,
          crmProjectName,
          parentLinearIssueId,
          labelNames: labels || [],
        });

        linearIssueId = created.id;
        linearIdentifier = created.identifier;
        linearUrl = created.url ?? null;
        linearLabelNames = created.label_names?.length
          ? created.label_names
          : linearLabelNames;
        ticketStatus = mapLinearStateToTicketStatus(
          created.state_type,
          created.state_name
        );

        try {
          await cacheCreatedLinearIssue(supabase, {
            ...created,
            team_id: LINEAR_TEAM_ID,
          });
        } catch (cacheErr) {
          console.warn('Failed to cache created Linear issue:', cacheErr);
        }
      } catch (linearErr) {
        const message =
          linearErr instanceof Error ? linearErr.message : 'Failed to create Linear issue';
        console.error('Linear create failed:', linearErr);
        return NextResponse.json(
          {
            data: null,
            error: { message: `Linear create failed: ${message}`, code: 'LINEAR_CREATE_FAILED' },
          },
          { status: 502 }
        );
      }
    }

    // Create the ticket
    const { data: ticket, error } = await supabase
      .from('tickets')
      .insert([{
        title,
        description: description || null,
        type: type || 'bug',
        priority: priority || 'medium',
        assignee_id: assignee_id || null,
        creator_id: creator_id || null,
        status: ticketStatus,
        due_date: due_date || null,
        labels: linearLabelNames,
        project: project || 'Web App',
        project_id: project_id || null,
        parent_ticket_id: parent_ticket_id || null,
        milestone_id: milestone_id || null,
        sprint: sprint || null,
        story_points: story_points || null,
        external_id: linearIssueId,
        linear_identifier: linearIdentifier,
        linear_id: linearIssueId,
        linear_url: linearUrl,
      }])
      .select(TICKET_SELECT)
      .single();

    if (error) {
      console.error('Error creating ticket:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    // Log activity
    await supabase.from('ticket_activity').insert([{
      ticket_id: ticket.id,
      actor_id: creator_id || null,
      action: 'created',
      to_value: ticketStatus,
    }]);

    // Notify assignee if assigned on creation
    if (assignee_id && assignee_id !== creator_id) {
      const creatorName = ticket.creator?.name || 'Someone';
      await supabase.from('ticket_notifications').insert([{
        recipient_id: assignee_id,
        ticket_id: ticket.id,
        type: 'assigned',
        message: `${creatorName} assigned you ticket #${ticket.number}: ${title}`,
        actor_id: creator_id || null,
      }]);
    }

    return NextResponse.json({ data: ticket, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
