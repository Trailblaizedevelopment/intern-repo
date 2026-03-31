import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface EngineeringIssue {
  id: string;
  project_id: string;
  cycle_id: string | null;
  assignee_id: string | null;
  creator_id: string | null;
  number: number;
  title: string;
  description: string | null;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled';
  priority: number;
  labels: string[];
  issue_type: 'feature' | 'bug' | 'improvement' | 'task' | 'epic';
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
  // Joined fields
  assignee?: { id: string; name: string; email: string };
  creator?: { id: string; name: string };
  project?: { id: string; name: string; identifier: string; color: string };
}

// GET - Fetch issues with filters
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const projectId = searchParams.get('project_id');
    const assigneeId = searchParams.get('assignee_id');
    const cycleId = searchParams.get('cycle_id');
    const search = searchParams.get('search');

    let query = supabase
      .from('engineering_issues')
      .select(`
        *,
        assignee:employees!engineering_issues_assignee_id_fkey(id, name, email),
        creator:employees!engineering_issues_creator_id_fkey(id, name),
        project:engineering_projects(id, name, identifier, color)
      `)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      if (status === 'active') {
        query = query.in('status', ['todo', 'in_progress', 'in_review']);
      } else {
        query = query.eq('status', status);
      }
    }

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (assigneeId) {
      query = query.eq('assignee_id', assigneeId);
    }

    if (cycleId) {
      query = query.eq('cycle_id', cycleId);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching issues:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// POST - Create new issue
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const body = await request.json();
    const { title, description, project_id, assignee_id, creator_id, priority, labels, issue_type, due_date, status } = body;

    if (!title || !project_id) {
      return NextResponse.json(
        { data: null, error: { message: 'Title and project_id are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('engineering_issues')
      .insert([{
        title,
        description: description || null,
        project_id,
        assignee_id: assignee_id || null,
        creator_id: creator_id || null,
        priority: priority ?? 0,
        labels: labels || [],
        issue_type: issue_type || 'task',
        due_date: due_date || null,
        status: status || 'backlog'
      }])
      .select(`
        *,
        assignee:employees!engineering_issues_assignee_id_fkey(id, name, email),
        creator:employees!engineering_issues_creator_id_fkey(id, name),
        project:engineering_projects(id, name, identifier, color)
      `)
      .single();

    if (error) {
      console.error('Error creating issue:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
