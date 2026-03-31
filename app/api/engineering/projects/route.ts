import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface EngineeringProject {
  id: string;
  name: string;
  identifier: string;
  description: string | null;
  color: string;
  lead_id: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  // Aggregates
  issue_count?: number;
  open_issue_count?: number;
}

// GET - Fetch all projects
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { data: projects, error } = await supabase
      .from('engineering_projects')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching projects:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    // Get issue counts per project
    const { data: issueCounts } = await supabase
      .from('engineering_issues')
      .select('project_id, status');

    const projectsWithCounts = projects?.map(project => {
      const projectIssues = issueCounts?.filter(i => i.project_id === project.id) || [];
      return {
        ...project,
        issue_count: projectIssues.length,
        open_issue_count: projectIssues.filter(i => !['done', 'cancelled'].includes(i.status)).length
      };
    });

    return NextResponse.json({ data: projectsWithCounts, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// POST - Create new project
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const body = await request.json();
    const { name, identifier, description, color, lead_id } = body;

    if (!name || !identifier) {
      return NextResponse.json(
        { data: null, error: { message: 'Name and identifier are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('engineering_projects')
      .insert([{
        name,
        identifier: identifier.toUpperCase(),
        description: description || null,
        color: color || '#5e6ad2',
        lead_id: lead_id || null
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
