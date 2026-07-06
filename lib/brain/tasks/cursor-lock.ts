import { SupabaseClient } from '@supabase/supabase-js';
import {
  getPullRequestMergeStatus,
  isPrMergedToIntegrationBranch,
  isPrMergedToProtectedBranch,
} from '../pr-watch';
import { appendTaskLog } from './store';
import { BrainTaskRow } from './types';

export interface PrMergeWatchResult {
  handled: boolean;
  merged?: boolean;
  releasedDispatchLock?: boolean;
  mergedToProtected?: boolean;
}

/** Release Cursor dispatch lock after PR merges into the integration feature branch. */
export async function releaseCursorDispatchLock(
  supabase: SupabaseClient,
  taskId: string
): Promise<void> {
  await supabase
    .from('brain_tasks')
    .update({
      cursor_agent_id: null,
      cursor_agent_url: null,
      cursor_run_id: null,
      cursor_run_status: null,
      cursor_branch: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

export function isCursorDispatchLocked(task: BrainTaskRow, followUp = false): boolean {
  if (!task.cursor_agent_id || followUp) return false;
  const status = (task.cursor_run_status || '').toUpperCase();
  return !['ERROR', 'CANCELLED', 'EXPIRED'].includes(status);
}

/**
 * Poll GitHub for PR merge.
 * - Merged into integration_branch → release lock, allow follow-up slices.
 * - Merged into develop/main → log only; humans own that merge. No agent follow-up.
 */
export async function handlePrMergeWatch(
  supabase: SupabaseClient,
  task: BrainTaskRow
): Promise<PrMergeWatchResult> {
  if (!task.cursor_pr_url || task.cursor_pr_merged) {
    return { handled: false };
  }

  const pr = await getPullRequestMergeStatus(task.cursor_pr_url);
  if (!pr || !pr.merged) {
    return { handled: false };
  }

  const integration = task.integration_branch;
  const mergedToIntegration = isPrMergedToIntegrationBranch(pr, integration);
  const mergedToProtected = isPrMergedToProtectedBranch(pr);

  await supabase
    .from('brain_tasks')
    .update({
      cursor_pr_merged: mergedToIntegration,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  await appendTaskLog(supabase, task.id, {
    kind: 'info',
    message: `PR #${pr.number} merged to ${pr.base || 'base'}: ${pr.url}`,
  });

  if (mergedToProtected && !mergedToIntegration) {
    await appendTaskLog(supabase, task.id, {
      kind: 'error',
      message: `PR merged to protected branch ${pr.base} — agents must not target develop/main. Human review required.`,
    });
    return { handled: true, merged: true, mergedToProtected: true, releasedDispatchLock: false };
  }

  if (mergedToIntegration) {
    await releaseCursorDispatchLock(supabase, task.id);
    await appendTaskLog(supabase, task.id, {
      kind: 'info',
      message: `Merged into ${integration}. Dispatch lock released — follow-up may branch from integration branch.`,
    });
    return { handled: true, merged: true, releasedDispatchLock: true };
  }

  return { handled: true, merged: true, releasedDispatchLock: false };
}
