import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

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
    }

    if (assigneeId) query = query.eq('assignee_id', assigneeId);
    if (creatorId) query = query.eq('creator_id', creatorId);
    if (priority) query = query.eq('priority', priority);
    if (type) query = query.eq('type', type);
    if (project) query = query.eq('project', project);
    if (search) {
      // Support searching by ticket number: #238 or TRA-238
      const numberMatch = search.match(/^#?(\d+)$/) || search.match(/^TRA-(\d+)$/i);
      if (numberMatch) {
        query = query.eq('number', parseInt(numberMatch[1], 10));
      } else {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
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
    const { title, description, type, priority, assignee_id, creator_id, due_date, labels, project_id, parent_ticket_id, milestone_id, sprint, story_points } = body;

    if (!title) {
      return NextResponse.json(
        { data: null, error: { message: 'Title is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
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
        status: 'open',
        due_date: due_date || null,
        labels: labels || [],
        project_id: project_id || null,
        parent_ticket_id: parent_ticket_id || null,
        milestone_id: milestone_id || null,
        sprint: sprint || null,
        story_points: story_points || null,
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
      to_value: 'open',
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
