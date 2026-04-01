// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const LINEAR_API_KEY = process.env.LINEAR_API_KEY || 'lin_api_uqFcamsDt0F6tLmLBuPfRWa8nkjCWsbnXet6pGfb';
const LINEAR_TEAM_ID = 'ba3a89b4-61f0-4a3e-85e4-b264de5cb592';
const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';

function linearGQL(query: string, variables?: Record<string, unknown>) {
  return fetch(LINEAR_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  }).then(r => r.json());
}

/**
 * GET /api/linear/issues
 * Fetch issues from synced cache or live from Linear API key
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.includes('hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const teamId = searchParams.get('team_id') || LINEAR_TEAM_ID;
  const projectId = searchParams.get('project_id');
  const status = searchParams.get('status');
  const source = searchParams.get('source') || 'cache';

  try {
    const supabase = getSupabaseAdmin();

    if (source === 'cache') {
      let query = supabase
        .from('linear_issues')
        .select('*')
        .order('updated_at', { ascending: false });

      if (teamId) query = query.eq('team_id', teamId);
      if (projectId) query = query.eq('project_id', projectId);
      if (status) query = query.eq('state_type', status);

      const { data, error } = await query.limit(200);
      if (error) throw new Error(error.message);
      return NextResponse.json({ data, source: 'cache' });
    }

    // Live from Linear using API key
    const gqlQuery = `
      query($filter: IssueFilter, $first: Int) {
        issues(filter: $filter, first: $first, orderBy: updatedAt) {
          nodes {
            id identifier title description priority priorityLabel
            state { id name color type }
            assignee { id name email }
            creator { id name }
            team { id name key }
            project { id name }
            estimate dueDate url createdAt updatedAt completedAt canceledAt
          }
        }
      }
    `;

    const filter: Record<string, unknown> = { team: { id: { eq: teamId } } };
    if (projectId) filter.project = { id: { eq: projectId } };
    if (status) filter.state = { type: { eq: status } };

    const result = await linearGQL(gqlQuery, { filter, first: 200 });
    if (result.errors) throw new Error(result.errors[0]?.message);

    return NextResponse.json({ data: result.data?.issues?.nodes ?? [], source: 'live' });
  } catch (error) {
    console.error('Error fetching Linear issues:', error);
    return NextResponse.json({ error: 'Failed to fetch issues' }, { status: 500 });
  }
}

/**
 * POST /api/linear/issues
 * Create a new issue in Linear using API key
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.includes('hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { teamId = LINEAR_TEAM_ID, title, description, priority, projectId, assigneeId, estimate, dueDate } = body;

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id identifier title url
            state { name }
          }
        }
      }
    `;

    const input: Record<string, unknown> = { teamId, title };
    if (description) input.description = description;
    if (priority !== undefined) input.priority = priority;
    if (projectId) input.projectId = projectId;
    if (assigneeId) input.assigneeId = assigneeId;
    if (estimate) input.estimate = estimate;
    if (dueDate) input.dueDate = dueDate;

    const result = await linearGQL(mutation, { input });
    if (result.errors) throw new Error(result.errors[0]?.message);

    return NextResponse.json({
      data: result.data?.issueCreate?.issue,
      message: 'Issue created successfully',
    });
  } catch (error) {
    console.error('Error creating Linear issue:', error);
    return NextResponse.json({ error: 'Failed to create issue' }, { status: 500 });
  }
}
