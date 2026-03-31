// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface WorkspaceTask {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string | null;
  due_date: string | null;
  ticket_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  employee?: { id: string; name: string; email: string; role: string } | null;
  ticket?: { id: string; number: number; title: string; status: string } | null;
}

const TASK_SELECT = `
  *,
  employee:employee_id(id, name, email, role),
  ticket:ticket_id(id, number, title, status)
`;

/**
 * GET /api/workspace/tasks
 * Params:
 *   employee_id - filter by employee (omit for team-wide)
 *   status      - filter by status
 *   completed_since - ISO date, filters completed_at >= value
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const status = searchParams.get('status');
    const completedSince = searchParams.get('completed_since');

    let query = getSupabaseAdmin()
      .from('workspace_tasks')
      .select(TASK_SELECT)
      .order('created_at', { ascending: false });

    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (completedSince) {
      query = query.gte('completed_at', completedSince);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching tasks:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Tasks GET error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspace/tasks
 * Create a new task
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employee_id, title, description, status, priority, category, due_date, ticket_id } = body;

    if (!employee_id || !title) {
      return NextResponse.json(
        { data: null, error: { message: 'employee_id and title are required', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from('workspace_tasks')
      .insert({
        employee_id,
        title,
        description: description || null,
        status: status || 'todo',
        priority: priority || 'medium',
        category: category || null,
        due_date: due_date || null,
        ticket_id: ticket_id || null,
      })
      .select(TASK_SELECT)
      .single();

    if (error) {
      console.error('Error creating task:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    console.error('Tasks POST error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
