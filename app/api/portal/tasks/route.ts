// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/portal/tasks
 * Params:
 *   employee_id   - required, filter by employee
 *   status        - optional, filter by exact status
 *   exclude_done  - optional ('true'), exclude done tasks
 *   order_by      - optional, 'due_date' | 'created_at' (default: due_date asc)
 *   limit         - optional, max results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const status = searchParams.get('status');
    const excludeDone = searchParams.get('exclude_done') === 'true';
    const orderBy = searchParams.get('order_by') || 'due_date';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

    if (!employeeId) {
      return NextResponse.json(
        { data: null, error: { message: 'employee_id is required', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    let query = getSupabaseAdmin()
      .from('employee_tasks')
      .select('*')
      .eq('employee_id', employeeId);

    if (status) {
      query = query.eq('status', status);
    }

    if (excludeDone) {
      query = query.neq('status', 'done');
    }

    if (orderBy === 'due_date') {
      query = query.order('due_date', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching portal tasks:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Portal tasks GET error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portal/tasks
 * Create a new employee task
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employee_id, title, description, priority, status, due_date, category } = body;

    if (!employee_id || !title) {
      return NextResponse.json(
        { data: null, error: { message: 'employee_id and title are required', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from('employee_tasks')
      .insert({
        employee_id,
        title,
        description: description || null,
        priority: priority || 'medium',
        status: status || 'todo',
        due_date: due_date || null,
        category: category || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating portal task:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    console.error('Portal tasks POST error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
