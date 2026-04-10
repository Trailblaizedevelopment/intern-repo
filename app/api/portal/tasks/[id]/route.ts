// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/portal/tasks/[id]
 * Update an employee task. Automatically manages completed_at.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const allowedFields = ['title', 'description', 'status', 'priority', 'category', 'due_date'];
    const updates: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: { message: 'No valid fields to update', code: 'INVALID_UPDATE' } },
        { status: 400 }
      );
    }

    if (updates.status === 'done') {
      updates.completed_at = new Date().toISOString();
    } else if (updates.status && updates.status !== 'done') {
      updates.completed_at = null;
    }

    const { data, error } = await getSupabaseAdmin()
      .from('employee_tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { data: null, error: { message: 'Task not found', code: 'NOT_FOUND' } },
          { status: 404 }
        );
      }
      console.error('Error updating portal task:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Portal task PATCH error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/portal/tasks/[id]
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const { error } = await getSupabaseAdmin()
      .from('employee_tasks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting portal task:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { deleted: true }, error: null });
  } catch (error) {
    console.error('Portal task DELETE error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
