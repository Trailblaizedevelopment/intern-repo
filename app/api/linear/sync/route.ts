// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { 
  getLinearIssues, 
  getLinearProjects, 
  getLinearTeams,
  getLinearLabels 
} from '@/lib/linear';

/**
 * POST /api/linear/sync
 * Manually sync Linear data to our database
 * This is useful for initial setup or to catch up on missed webhooks
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, teamId } = body;

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Employee ID is required' },
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

    const accessToken = tokenData.access_token;
    const syncResults = {
      teams: 0,
      projects: 0,
      issues: 0,
      labels: 0,
    };

    // Sync teams
    const teams = await getLinearTeams(accessToken);
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

    // Determine which teams to sync
    const teamsToSync = teamId ? [teamId] : teams.map(t => t.id);

    // Sync projects
    const projects = await getLinearProjects(accessToken);
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

    // Sync issues for each team
    for (const tid of teamsToSync) {
      // Sync labels for team
      const labels = await getLinearLabels(accessToken, tid);
      for (const label of labels) {
        await supabase.from('linear_labels').upsert({
          id: label.id,
          name: label.name,
          color: label.color,
          description: label.description,
          team_id: tid,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        syncResults.labels++;
      }

      // Sync issues for team
      const issues = await getLinearIssues(accessToken, { teamId: tid, first: 100 });
      for (const issue of issues) {
        await supabase.from('linear_issues').upsert({
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
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
          await supabase
            .from('linear_issue_labels')
            .delete()
            .eq('issue_id', issue.id);

          await supabase.from('linear_issue_labels').insert(
            issue.labels.nodes.map(label => ({
              issue_id: issue.id,
              label_id: label.id,
            }))
          );
        }

        syncResults.issues++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Sync completed successfully',
      synced: syncResults,
    });
  } catch (error) {
    console.error('Error syncing Linear data:', error);
    return NextResponse.json(
      { error: 'Failed to sync data' },
      { status: 500 }
    );
  }
}
