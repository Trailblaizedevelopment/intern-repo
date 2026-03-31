import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const TICKET_SELECT = `
  *,
  creator:employees!tickets_creator_id_fkey(id, name, email, role),
  assignee:employees!tickets_assignee_id_fkey(id, name, email, role),
  reviewer:employees!tickets_reviewer_id_fkey(id, name, email, role)
`;

// GET - Single project with milestones, tickets, docs
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

    const [projectRes, milestonesRes, ticketsRes, docsRes, screenshotsRes] = await Promise.all([
      supabase.from('projects').select('*, created_by_employee:employees!projects_created_by_fkey(id, name, email)').eq('id', id).single(),
      supabase.from('milestones').select('*').eq('project_id', id).order('sort_order'),
      supabase.from('tickets').select(TICKET_SELECT).eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('project_documents').select('*, author:employees!project_documents_created_by_fkey(id, name)').eq('project_id', id).order('updated_at', { ascending: false }),
      supabase.from('project_screenshots').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    ]);

    if (projectRes.error) {
      return NextResponse.json({ data: null, error: { message: projectRes.error.message, code: projectRes.error.code } }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        ...projectRes.data,
        milestones: milestonesRes.data || [],
        tickets: ticketsRes.data || [],
        documents: docsRes.data || [],
        screenshots: screenshotsRes.data || [],
      },
      error: null,
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// PATCH - Update project
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

    const updateData: Record<string, unknown> = {};
    const allowedFields = ['name', 'description', 'status', 'start_date', 'target_date'];
    for (const field of allowedFields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// DELETE - Delete project
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

    const { error } = await supabase.from('projects').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
