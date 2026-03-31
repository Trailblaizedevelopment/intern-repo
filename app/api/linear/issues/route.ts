// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { 
  getLinearIssues, 
  createLinearIssue, 
  getLinearTeams,
  getLinearWorkflowStates 
} from '@/lib/linear';

/**
 * GET /api/linear/issues
 * Fetch issues from Linear (live data) or from synced cache
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const employeeId = searchParams.get('employee_id');
  const teamId = searchParams.get('team_id');
  const projectId = searchParams.get('project_id');
  const assigneeId = searchParams.get('assignee_id');
  const status = searchParams.get('status');
  const source = searchParams.get('source') || 'live'; // 'live' or 'cache'

  if (!employeeId) {
    return NextResponse.json(
      { error: 'Employee ID is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // If fetching from cache (synced via webhooks)
    if (source === 'cache') {
      let query = supabase
        .from('linear_issues')
        .select(`
          *,
          linear_teams (id, name, key),
          linear_projects (id, name, color),
          linear_issue_labels (
            linear_labels (id, name, color)
          )
        `)
        .order('updated_at', { ascending: false });

      if (teamId) query = query.eq('team_id', teamId);
      if (projectId) query = query.eq('project_id', projectId);
      if (assigneeId) query = query.eq('assignee_id', assigneeId);
      if (status) query = query.eq('state_type', status);

      const { data, error } = await query.limit(100);

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ data, source: 'cache' });
    }

    // Fetch live from Linear API
    const { data: tokenData, error: tokenError } = await supabase
      .from('linear_oauth_tokens')
      .select('access_token')
      .eq('employee_id', employeeId)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'Linear not connected' },
        { status: 401 }
      );
    }

    const issues = await getLinearIssues(tokenData.access_token, {
      teamId: teamId || undefined,
      projectId: projectId || undefined,
      assigneeId: assigneeId || undefined,
      status: status || undefined,
      first: 50,
    });

    return NextResponse.json({ data: issues, source: 'live' });
  } catch (error) {
    console.error('Error fetching Linear issues:', error);
    return NextResponse.json(
      { error: 'Failed to fetch issues' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/linear/issues
 * Create a new issue in Linear
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      employeeId, 
      teamId, 
      title, 
      description, 
      priority, 
      projectId,
      assigneeId,
      labelIds,
      estimate,
      dueDate,
    } = body;

    if (!employeeId || !teamId || !title) {
      return NextResponse.json(
        { error: 'Employee ID, team ID, and title are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Get access token
    const { data: tokenData, error: tokenError } = await supabase
      .from('linear_oauth_tokens')
      .select('access_token')
      .eq('employee_id', employeeId)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'Linear not connected' },
        { status: 401 }
      );
    }

    // Create the issue in Linear
    const issue = await createLinearIssue(tokenData.access_token, {
      teamId,
      title,
      description,
      priority,
      projectId,
      assigneeId,
      labelIds,
      estimate,
      dueDate,
    });

    return NextResponse.json({ 
      data: issue, 
      message: 'Issue created successfully' 
    });
  } catch (error) {
    console.error('Error creating Linear issue:', error);
    return NextResponse.json(
      { error: 'Failed to create issue' },
      { status: 500 }
    );
  }
}
