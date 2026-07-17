import { SupabaseClient } from '@supabase/supabase-js';
import { isCursorConfigured } from '../cursor-api';
import {
  resolveCursorCloudByAgentId,
  resolveCursorCloudForTicket,
} from '../cursor-ticket-resolve';
import { watchCursorAgent } from '../cursor-watch';
import { fetchLinearIssueStatusBundle } from '../linear-delegate';
import { notifyCursorWatchSlack } from './slack';
import {
  BrainCursorWatchRow,
  listActiveCursorWatches,
  updateCursorWatch,
} from './store';

export interface CursorDelegateWatchTickResult {
  watchId: string;
  linearIssueId: string;
  action:
    | 'still_waiting'
    | 'agent_pending'
    | 'notified_finished'
    | 'notified_failed'
    | 'cancelled_ticket_done'
    | 'expired'
    | 'error';
  detail?: string;
}

export interface CursorDelegateWatchRunResult {
  polled: number;
  results: CursorDelegateWatchTickResult[];
}

function isLinearStillInProgress(stateType: string, stateName: string): boolean {
  const type = stateType.toLowerCase();
  if (type === 'started') return true;
  const name = stateName.toLowerCase();
  return name.includes('progress') || name === 'in progress' || name === 'started';
}

function isLinearTerminal(stateType: string): boolean {
  const type = stateType.toLowerCase();
  return type === 'completed' || type === 'canceled' || type === 'cancelled';
}

async function tickOneWatch(
  supabase: SupabaseClient,
  watch: BrainCursorWatchRow
): Promise<CursorDelegateWatchTickResult> {
  const nowIso = new Date().toISOString();

  if (new Date(watch.expires_at).getTime() <= Date.now()) {
    await updateCursorWatch(supabase, watch.id, {
      status: 'expired',
      last_polled_at: nowIso,
      last_error: null,
    });
    return {
      watchId: watch.id,
      linearIssueId: watch.linear_issue_id,
      action: 'expired',
    };
  }

  const linear = await fetchLinearIssueStatusBundle(watch.linear_issue_id);
  if (!linear) {
    await updateCursorWatch(supabase, watch.id, {
      last_polled_at: nowIso,
      last_error: 'Failed to load Linear issue',
    });
    return {
      watchId: watch.id,
      linearIssueId: watch.linear_issue_id,
      action: 'error',
      detail: 'Linear lookup failed',
    };
  }

  if (isLinearTerminal(linear.stateType)) {
    await updateCursorWatch(supabase, watch.id, {
      status: 'cancelled',
      issue_title: linear.title,
      issue_url: linear.url,
      last_polled_at: nowIso,
      last_error: null,
    });
    return {
      watchId: watch.id,
      linearIssueId: watch.linear_issue_id,
      action: 'cancelled_ticket_done',
      detail: `${linear.stateName} (${linear.stateType})`,
    };
  }

  if (!isCursorConfigured()) {
    await updateCursorWatch(supabase, watch.id, {
      last_polled_at: nowIso,
      last_error: 'CURSOR_API_KEY not configured',
    });
    return {
      watchId: watch.id,
      linearIssueId: watch.linear_issue_id,
      action: 'error',
      detail: 'Cursor not configured',
    };
  }

  const cloud = watch.cursor_agent_id
    ? await resolveCursorCloudByAgentId(watch.cursor_agent_id)
    : await resolveCursorCloudForTicket(linear);

  if (!cloud.agentId) {
    await updateCursorWatch(supabase, watch.id, {
      last_polled_at: nowIso,
      last_error: cloud.unavailableReason || 'Agent not resolved yet',
    });
    return {
      watchId: watch.id,
      linearIssueId: watch.linear_issue_id,
      action: 'agent_pending',
      detail: cloud.unavailableReason || undefined,
    };
  }

  const watchResult = await watchCursorAgent(cloud.agentId, watch.cursor_run_id || cloud.run?.runId);

  await updateCursorWatch(supabase, watch.id, {
    cursor_agent_id: cloud.agentId,
    cursor_agent_url: cloud.agentUrl,
    cursor_run_id: watchResult.runId,
    cursor_run_status: watchResult.runStatus,
    cursor_pr_url: watchResult.prUrl,
    cursor_branch: watchResult.branch,
    last_polled_at: nowIso,
    last_error: null,
  });

  if (watchResult.phase === 'running' || watchResult.phase === 'unknown') {
    return {
      watchId: watch.id,
      linearIssueId: watch.linear_issue_id,
      action: 'still_waiting',
      detail: watchResult.runStatus || watchResult.phase,
    };
  }

  const stillInProgress = isLinearStillInProgress(linear.stateType, linear.stateName);

  if (watchResult.phase === 'finished') {
    if (!stillInProgress) {
      await updateCursorWatch(supabase, watch.id, {
        status: 'cancelled',
        last_polled_at: nowIso,
      });
      return {
        watchId: watch.id,
        linearIssueId: watch.linear_issue_id,
        action: 'cancelled_ticket_done',
        detail: `Cursor FINISHED but Linear is ${linear.stateName}`,
      };
    }

    // Idempotency: only notify once (status still watching)
    const notify = await notifyCursorWatchSlack({
      watch: {
        ...watch,
        cursor_agent_id: cloud.agentId,
        cursor_agent_url: cloud.agentUrl,
        cursor_pr_url: watchResult.prUrl,
        cursor_branch: watchResult.branch,
      },
      kind: 'finished',
      linearStateName: linear.stateName,
      summary: watchResult.summary,
      prUrl: watchResult.prUrl,
      branch: watchResult.branch,
      agentUrl: cloud.agentUrl,
      runStatus: watchResult.runStatus,
    });

    await updateCursorWatch(supabase, watch.id, {
      status: 'notified',
      notified_at: nowIso,
      notified_kind: 'finished',
      last_polled_at: nowIso,
      last_error: notify.error || null,
    });

    return {
      watchId: watch.id,
      linearIssueId: watch.linear_issue_id,
      action: 'notified_finished',
      detail: notify.targets.join(', ') || notify.error,
    };
  }

  if (watchResult.phase === 'failed') {
    const notify = await notifyCursorWatchSlack({
      watch: {
        ...watch,
        cursor_agent_id: cloud.agentId,
        cursor_agent_url: cloud.agentUrl,
      },
      kind: 'failed',
      linearStateName: linear.stateName,
      summary: watchResult.summary,
      prUrl: watchResult.prUrl,
      branch: watchResult.branch,
      agentUrl: cloud.agentUrl,
      runStatus: watchResult.runStatus,
    });

    await updateCursorWatch(supabase, watch.id, {
      status: 'failed_notified',
      notified_at: nowIso,
      notified_kind: 'failed',
      last_polled_at: nowIso,
      last_error: notify.error || watchResult.summary || watchResult.runStatus,
    });

    return {
      watchId: watch.id,
      linearIssueId: watch.linear_issue_id,
      action: 'notified_failed',
      detail: notify.targets.join(', ') || notify.error,
    };
  }

  return {
    watchId: watch.id,
    linearIssueId: watch.linear_issue_id,
    action: 'still_waiting',
    detail: watchResult.phase,
  };
}

/** Poll all active Path A Cursor watches and notify Slack on terminal runs. */
export async function runCursorDelegateWatch(
  supabase: SupabaseClient
): Promise<CursorDelegateWatchRunResult> {
  const watches = await listActiveCursorWatches(supabase);
  const results: CursorDelegateWatchTickResult[] = [];

  for (const watch of watches) {
    try {
      results.push(await tickOneWatch(supabase, watch));
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'tick failed';
      console.error('[brain/cursor-delegate-watch]', watch.linear_issue_id, err);
      await updateCursorWatch(supabase, watch.id, {
        last_polled_at: new Date().toISOString(),
        last_error: detail.slice(0, 500),
      });
      results.push({
        watchId: watch.id,
        linearIssueId: watch.linear_issue_id,
        action: 'error',
        detail,
      });
    }
  }

  return { polled: watches.length, results };
}
