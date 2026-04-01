// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const LINEAR_API_KEY = process.env.LINEAR_API_KEY || '';
const LINEAR_TEAM_ID = 'ba3a89b4-61f0-4a3e-85e4-b264de5cb592';
const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';

async function linearGQL(query: string, variables?: Record<string, unknown>) {
  const response = await fetch(LINEAR_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) throw new Error(`Linear API error: ${response.status}`);
  const result = await response.json();
  if (result.errors) throw new Error(result.errors[0]?.message || 'GraphQL error');
  return result.data;
}

/**
 * POST /api/linear/sync
 * Sync all Linear data for the Trailblaize team using API key directly
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.includes('hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const teamId = body.teamId || LINEAR_TEAM_ID;

    const supabase = getSupabaseAdmin();
    const syncResults = { teams: 0, projects: 0, issues: 0, labels: 0 };

    // Sync teams
    const teamsData = await linearGQL(`
      query { teams { nodes { id name key description } } }
    `);
    const teams = teamsData?.teams?.nodes ?? [];
    for (const team of teams) {
      await supabase.from('linear_teams').upsert({
        id: team.id,
        name: team.name,
        key: team.key,
        description: team.description,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      syncResults.teams++;
    }

    // Sync projects for team
    const projectsData = await linearGQL(`
      query($teamId: String) {
        projects(filter: { team: { id: { eq: $teamId } } }) {
          nodes { id name description icon color state startDate targetDate progress }
        }
      }
    `, { teamId });
    const projects = projectsData?.projects?.nodes ?? [];
    for (const project of projects) {
      await supabase.from('linear_projects').upsert({
        id: project.id,
        name: project.name,
        description: project.description,
        icon: project.icon,
        color: project.color,
        state: project.state,
        start_date: project.startDate,
        target_date: project.targetDate,
        progress: project.progress,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      syncResults.projects++;
    }

    // Sync labels
    const labelsData = await linearGQL(`
      query($teamId: String!) {
        team(id: $teamId) { labels { nodes { id name color description } } }
      }
    `, { teamId });
    const labels = labelsData?.team?.labels?.nodes ?? [];
    for (const label of labels) {
      await supabase.from('linear_labels').upsert({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description,
        team_id: teamId,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      syncResults.labels++;
    }

    // Sync issues — paginate through all
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const issuesData = await linearGQL(`
        query($filter: IssueFilter, $first: Int, $after: String) {
          issues(filter: $filter, first: $first, after: $after, orderBy: updatedAt) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id identifier title description priority priorityLabel
              state { id name color type }
              assignee { id name email }
              creator { id name }
              team { id name key }
              project { id name }
              labels { nodes { id name color } }
              estimate dueDate url createdAt updatedAt completedAt canceledAt
            }
          }
        }
      `, {
        filter: { team: { id: { eq: teamId } } },
        first: 100,
        after: cursor,
      });

      const issuesPage = issuesData?.issues;
      const issueNodes = issuesPage?.nodes ?? [];
      hasNextPage = issuesPage?.pageInfo?.hasNextPage ?? false;
      cursor = issuesPage?.pageInfo?.endCursor ?? null;

      for (const issue of issueNodes) {
        await supabase.from('linear_issues').upsert({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || null,
          priority: issue.priority,
          priority_label: issue.priorityLabel,
          state_id: issue.state?.id,
          state_name: issue.state?.name,
          state_color: issue.state?.color,
          state_type: issue.state?.type,
          assignee_id: issue.assignee?.id,
          assignee_name: issue.assignee?.name,
          assignee_email: issue.assignee?.email,
          creator_id: issue.creator?.id,
          creator_name: issue.creator?.name,
          team_id: issue.team?.id,
          project_id: issue.project?.id,
          estimate: issue.estimate,
          due_date: issue.dueDate,
          url: issue.url,
          created_at: issue.createdAt,
          updated_at: issue.updatedAt,
          completed_at: issue.completedAt,
          canceled_at: issue.canceledAt,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        // Sync issue labels
        if (issue.labels?.nodes?.length > 0) {
          await supabase.from('linear_issue_labels').delete().eq('issue_id', issue.id);
          await supabase.from('linear_issue_labels').insert(
            issue.labels.nodes.map((label: { id: string }) => ({
              issue_id: issue.id,
              label_id: label.id,
            }))
          );
        }

        syncResults.issues++;
      }

      // Safety: if no cursor, stop
      if (!cursor) hasNextPage = false;
    }

    return NextResponse.json({
      success: true,
      message: 'Sync completed successfully',
      synced: syncResults,
    });
  } catch (error) {
    console.error('Error syncing Linear data:', error);
    return NextResponse.json({ error: 'Failed to sync data', details: String(error) }, { status: 500 });
  }
}
