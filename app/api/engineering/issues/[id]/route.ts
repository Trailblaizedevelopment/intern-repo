import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET - Fetch single issue
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
      .from('engineering_issues')
      .select(`
        *,
        assignee:employees!engineering_issues_assignee_id_fkey(id, name, email),
        creator:employees!engineering_issues_creator_id_fkey(id, name),
        project:engineering_projects(id, name, identifier, color)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching issue:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// PATCH - Update issue
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

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    const allowedFields = ['title', 'description', 'status', 'priority', 'labels', 'issue_type', 'due_date', 'assignee_id', 'cycle_id', 'sort_order'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Handle status transitions
    if (body.status === 'in_progress' && !updateData.started_at) {
      updateData.started_at = new Date().toISOString();
    }
    if (body.status === 'done' && !updateData.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }
    if (body.status && body.status !== 'done') {
      updateData.completed_at = null;
    }

    const { data, error } = await supabase
      .from('engineering_issues')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        assignee:employees!engineering_issues_assignee_id_fkey(id, name, email),
        creator:employees!engineering_issues_creator_id_fkey(id, name),
        project:engineering_projects(id, name, identifier, color)
      `)
      .single();

    if (error) {
      console.error('Error updating issue:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// DELETE - Delete issue
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

    const { error } = await supabase
      .from('engineering_issues')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting issue:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
