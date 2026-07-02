// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { assertLinearApiKeyConfigured, linearGQLWithApiKey } from '@/lib/linear';
import {
  archiveTicketsRemovedFromLinear,
  pruneStaleLinearIssues,
  reconcileLinearIssuesToTickets,
} from '@/lib/linear-reconcile';
import { syncLinearWorkflowStates } from '@/lib/linear-workflow-states';

const LINEAR_TEAM_ID = 'ba3a89b4-61f0-4a3e-85e4-b264de5cb592';

/**
 * POST /api/linear/sync
 * Sync all Linear data for the Trailblaize team using API key directly
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.includes(process.env.INTERNAL_API_KEY || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    assertLinearApiKeyConfigured();

    const body = await request.json().catch(() => ({}));
    const teamId = body.teamId || LINEAR_TEAM_ID;
    const incremental = body.incremental === true;

    const supabase = getSupabaseAdmin();
    const syncResults = {
      teams: 0,
      projects: 0,
      issues: 0,
      labels: 0,
      tickets: 0,
      ticketsCreated: 0,
      ticketsUpdated: 0,
      workflowStates: 0,
      prunedIssues: 0,
      archivedTickets: 0,
    };

    let lastSyncAt: string | null = null;
    if (incremental) {
      const { data: teamRow } = await supabase
        .from('linear_teams')
        .select('synced_at')
        .eq('id', teamId)
        .maybeSingle();
      lastSyncAt = teamRow?.synced_at ?? null;
    }

    // Sync teams
    const teamsData = await linearGQLWithApiKey(`
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

    // Sync projects for team (ProjectFilter uses accessibleTeams, not team)
    const projectsData = await linearGQLWithApiKey(`
      query($teamId: ID!) {
        projects(filter: { accessibleTeams: { id: { eq: $teamId } } }) {
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
    const labelsData = await linearGQLWithApiKey(`
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

    syncResults.workflowStates = await syncLinearWorkflowStates(supabase, teamId);

    const issueFilter: Record<string, unknown> = { team: { id: { eq: teamId } } };
    if (incremental && lastSyncAt) {
      issueFilter.updatedAt = { gt: lastSyncAt };
    }

    // Sync issues — paginate through all (or incremental delta)
    let hasNextPage = true;
    let cursor: string | null = null;
    const syncedIssueIds = new Set<string>();

    while (hasNextPage) {
      const issuesData = await linearGQLWithApiKey(`
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
        filter: issueFilter,
        first: 100,
        after: cursor,
      });

      const issuesPage = issuesData?.issues;
      const issueNodes = issuesPage?.nodes ?? [];
      hasNextPage = issuesPage?.pageInfo?.hasNextPage ?? false;
      cursor = issuesPage?.pageInfo?.endCursor ?? null;

      for (const issue of issueNodes) {
        syncedIssueIds.add(issue.id);
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

    if (!incremental && syncedIssueIds.size > 0) {
      syncResults.prunedIssues = await pruneStaleLinearIssues(
        supabase,
        teamId,
        syncedIssueIds
      );
      const archiveResult = await archiveTicketsRemovedFromLinear(supabase, teamId);
      syncResults.archivedTickets = archiveResult.archived;
    }

    const reconcileResult = await reconcileLinearIssuesToTickets(supabase, teamId);
    syncResults.tickets = reconcileResult.reconciled;
    syncResults.ticketsCreated = reconcileResult.created;
    syncResults.ticketsUpdated = reconcileResult.updated;
    if (reconcileResult.errors.length > 0) {
      console.error('Linear reconcile errors:', reconcileResult.errors);
    }

    await supabase.from('linear_teams').update({
      synced_at: new Date().toISOString(),
    }).eq('id', teamId);

    return NextResponse.json({
      success: true,
      message: incremental ? 'Incremental sync completed' : 'Sync completed successfully',
      mode: incremental ? 'incremental' : 'full',
      synced: syncResults,
      reconcileErrors: reconcileResult.errors.length > 0 ? reconcileResult.errors : undefined,
    });
  } catch (error) {
    console.error('Error syncing Linear data:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync data';
    const status = message.includes('LINEAR_API_KEY is not configured') ? 503 : 500;
    return NextResponse.json({ error: message, details: String(error) }, { status });
  }
}
