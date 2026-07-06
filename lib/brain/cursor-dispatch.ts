import { SupabaseClient } from '@supabase/supabase-js';
import { buildCursorDispatchPrompt } from './cursor-context';
import { createCursorAgent } from './cursor-api';
import {
  deriveIntegrationBranch,
  ensureIntegrationBranchOnGitHub,
  isProtectedTargetBranch,
} from './integration-branch';
import { delegateLinearIssueToCursor } from './linear-delegate';
import { getBrainTask } from './tasks/store';
import { isCursorDispatchLocked } from './tasks/cursor-lock';
import { ConnectorContext } from './connectors/types';

export interface CursorDispatchInput {
  prompt: string;
  starting_ref?: string;
  auto_create_pr?: boolean;
  mode?: 'agent' | 'plan';
  linear_issue_id?: string;
  follow_up?: boolean;
  approved?: boolean;
}

async function persistCursorDispatch(
  supabase: SupabaseClient,
  taskId: string | null,
  result: Awaited<ReturnType<typeof createCursorAgent>>,
  integrationBranch: string
): Promise<void> {
  if (!taskId || !result.agentId) return;
  await supabase
    .from('brain_tasks')
    .update({
      cursor_agent_id: result.agentId,
      cursor_agent_url: result.agentUrl,
      cursor_run_id: result.runId,
      cursor_run_status: result.runStatus || 'CREATING',
      cursor_pr_merged: false,
      integration_branch: integrationBranch,
      pending_cursor_dispatch: null,
      status: 'running',
      next_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

/** Execute Cursor cloud agent dispatch (after approval when required). */
export async function runCursorDispatch(
  input: CursorDispatchInput,
  ctx: ConnectorContext
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const implementation = String(input.prompt || '').trim();
  if (!implementation) return { ok: false, error: 'prompt is required' };

  const followUp = input.follow_up === true;
  let linearIssueId =
    typeof input.linear_issue_id === 'string' ? input.linear_issue_id.trim() : null;
  let taskGoal: string | null = null;
  let task = ctx.taskId ? await getBrainTask(ctx.supabase, ctx.taskId) : null;

  if (task) {
    linearIssueId = linearIssueId || task.linear_issue_id;
    taskGoal = task.goal;

    if (isCursorDispatchLocked(task, followUp)) {
      return {
        ok: false,
        error: `Dispatch locked — Cursor agent ${task.cursor_agent_id} is active (${task.cursor_run_status}). Wait for PR merge into ${task.integration_branch || 'integration branch'} or pass follow_up=true.`,
      };
    }
  }

  const integrationBranch =
    task?.integration_branch || deriveIntegrationBranch(linearIssueId, taskGoal || implementation);

  const startingRef =
    typeof input.starting_ref === 'string' && input.starting_ref.trim()
      ? input.starting_ref.trim()
      : integrationBranch;

  if (isProtectedTargetBranch(startingRef)) {
    return {
      ok: false,
      error: `Cannot branch/PR to protected branch "${startingRef}". Use integration branch ${integrationBranch}. Humans merge feature → develop.`,
    };
  }

  const branchReady = await ensureIntegrationBranchOnGitHub(integrationBranch);
  if (!branchReady.ok) {
    return { ok: false, error: branchReady.error || 'Failed to ensure integration branch' };
  }

  const fullPrompt = await buildCursorDispatchPrompt({
    implementation,
    linearIssueId,
    taskGoal,
    integrationBranch,
  });

  const result = await createCursorAgent({
    prompt: fullPrompt,
    startingRef,
    autoCreatePR: input.auto_create_pr !== false,
    mode: input.mode === 'plan' ? 'plan' : 'agent',
  });

  await persistCursorDispatch(ctx.supabase, ctx.taskId ?? null, result, integrationBranch);

  let linearDelegate: Awaited<ReturnType<typeof delegateLinearIssueToCursor>> | null = null;
  if (linearIssueId) {
    linearDelegate = await delegateLinearIssueToCursor(linearIssueId);
  }

  if (ctx.conversationId) {
    await ctx.supabase
      .from('brain_conversations')
      .update({ pending_action: null, updated_at: new Date().toISOString() })
      .eq('id', ctx.conversationId);
  }

  return {
    ok: true,
    data: {
      ...result,
      integration_branch: integrationBranch,
      starting_ref: startingRef,
      integration_branch_created: branchReady.created,
      linear_delegate: linearDelegate,
    },
  };
}
