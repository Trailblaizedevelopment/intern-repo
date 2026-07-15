import { SupabaseClient } from '@supabase/supabase-js';
import { deriveIntegrationBranch } from './integration-branch';
import { CursorDispatchInput, runCursorDispatch } from './cursor-dispatch';
import { ConnectorContext } from './connectors/types';
import { appendTaskLog, getBrainTask, updateTaskStatus } from './tasks/store';
import { postSlackMessage } from './slack/client';
import { BrainTaskRow } from './tasks/types';

export interface PendingCursorDispatch {
  kind: 'cursor_dispatch';
  prompt: string;
  linear_issue_id: string | null;
  integration_branch: string;
  starting_ref: string | null;
  auto_create_pr: boolean;
  mode: 'agent' | 'plan';
  follow_up: boolean;
  task_id: string | null;
  conversation_id: string | null;
  requested_at: string;
}

export function cursorApprovalRequired(): boolean {
  return process.env.BRAIN_CURSOR_REQUIRE_APPROVAL !== 'false';
}

export function formatCursorApprovalSlackMessage(pending: PendingCursorDispatch): string {
  const lines = [
    '*Cursor dispatch approval needed*',
    pending.linear_issue_id ? `Linear: \`${pending.linear_issue_id}\`` : null,
    `Branch: \`${pending.integration_branch}\``,
    '',
    'Reply *yes dispatch* to approve or *cancel* to skip.',
  ];
  return lines.filter(Boolean).join('\n');
}

export function isCursorApprovalMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(yes|yes dispatch|approve|approved|go ahead|dispatch|dispatch it|confirmed|do it|lgtm)\b/.test(t);
}

export function isCursorDenialMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(no|cancel|cancelled|deny|denied|stop|skip|don't|dont)\b/.test(t);
}

function buildPending(
  input: CursorDispatchInput,
  ctx: ConnectorContext,
  integrationBranch: string
): PendingCursorDispatch {
  return {
    kind: 'cursor_dispatch',
    prompt: input.prompt,
    linear_issue_id:
      (typeof input.linear_issue_id === 'string' ? input.linear_issue_id.trim() : null) ||
      null,
    integration_branch: integrationBranch,
    starting_ref:
      typeof input.starting_ref === 'string' && input.starting_ref.trim()
        ? input.starting_ref.trim()
        : null,
    auto_create_pr: input.auto_create_pr !== false,
    mode: input.mode === 'plan' ? 'plan' : 'agent',
    follow_up: input.follow_up === true,
    task_id: ctx.taskId ?? null,
    conversation_id: ctx.conversationId ?? null,
    requested_at: new Date().toISOString(),
  };
}

export async function requestCursorDispatchApproval(
  input: CursorDispatchInput,
  ctx: ConnectorContext,
  linearIssueId: string | null,
  taskGoal: string | null
): Promise<{ ok: true; data: Record<string, unknown> }> {
  const integrationBranch = deriveIntegrationBranch(
    linearIssueId,
    taskGoal || input.prompt
  );
  const pending = buildPending(input, ctx, integrationBranch);

  if (ctx.taskId) {
    const task = await getBrainTask(ctx.supabase, ctx.taskId);
    const extendedDeadline =
      task?.deadline_at && new Date(task.deadline_at) < new Date(Date.now() + 30 * 60_000)
        ? new Date(Date.now() + 30 * 60_000).toISOString()
        : task?.deadline_at ?? null;

    await ctx.supabase
      .from('brain_tasks')
      .update({
        pending_cursor_dispatch: pending,
        status: 'awaiting_approval',
        ...(extendedDeadline ? { deadline_at: extendedDeadline } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.taskId);
    await appendTaskLog(ctx.supabase, ctx.taskId, {
      kind: 'info',
      message: `Awaiting Cursor dispatch approval on ${integrationBranch}`,
    });
  } else if (ctx.conversationId) {
    await ctx.supabase
      .from('brain_conversations')
      .update({
        pending_action: pending,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.conversationId);
  }

  const slackMsg = formatCursorApprovalSlackMessage(pending);
  if (ctx.slackChannel) {
    await postSlackMessage(ctx.slackChannel, slackMsg, ctx.slackThreadTs || undefined);
  }

  return {
    ok: true,
    data: {
      status: 'awaiting_approval',
      integration_branch: integrationBranch,
      linear_issue_id: linearIssueId,
      message: slackMsg,
    },
  };
}

export async function findPendingDispatchForSlackThread(
  supabase: SupabaseClient,
  channel: string,
  threadTs: string
): Promise<{ pending: PendingCursorDispatch; source: 'task' | 'conversation'; task?: BrainTaskRow } | null> {
  const { data: taskRow } = await supabase
    .from('brain_tasks')
    .select('*')
    .eq('slack_channel', channel)
    .eq('slack_thread_ts', threadTs)
    .not('pending_cursor_dispatch', 'is', null)
    .in('status', ['queued', 'planning', 'running', 'blocked', 'awaiting_approval', 'failed'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (taskRow?.pending_cursor_dispatch) {
    return {
      pending: taskRow.pending_cursor_dispatch as PendingCursorDispatch,
      source: 'task',
      task: taskRow as BrainTaskRow,
    };
  }

  const convoTitle = `slack:${channel}:${threadTs}`;
  const { data: convo } = await supabase
    .from('brain_conversations')
    .select('id, pending_action')
    .eq('title', convoTitle)
    .maybeSingle();

  const action = convo?.pending_action as PendingCursorDispatch | null;
  // TRA-900: conversation pending_action may be linear_cursor_delegate — ignore here.
  if (action && action.kind === 'cursor_dispatch') {
    return {
      pending: action,
      source: 'conversation',
    };
  }

  return null;
}

export async function clearPendingDispatch(
  supabase: SupabaseClient,
  pending: PendingCursorDispatch
): Promise<void> {
  if (pending.task_id) {
    await updateTaskStatus(supabase, pending.task_id, 'running', {
      pending_cursor_dispatch: null,
    });
  }
  if (pending.conversation_id) {
    await supabase
      .from('brain_conversations')
      .update({ pending_action: null, updated_at: new Date().toISOString() })
      .eq('id', pending.conversation_id);
  }
}

export async function executeApprovedCursorDispatch(
  supabase: SupabaseClient,
  pending: PendingCursorDispatch,
  slack?: { channel: string; threadTs: string }
): Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }> {
  const ctx: ConnectorContext = {
    supabase,
    employeeId: null,
    mcpSessions: new Map(),
    taskId: pending.task_id,
    conversationId: pending.conversation_id,
    surface: 'slack',
    slackChannel: slack?.channel ?? null,
    slackThreadTs: slack?.threadTs ?? null,
  };

  const result = await runCursorDispatch(
    {
      prompt: pending.prompt,
      starting_ref: pending.starting_ref || undefined,
      auto_create_pr: pending.auto_create_pr,
      mode: pending.mode,
      linear_issue_id: pending.linear_issue_id || undefined,
      follow_up: pending.follow_up,
      approved: true,
    },
    ctx
  );

  if (!result.ok) {
    if (pending.task_id) {
      await updateTaskStatus(supabase, pending.task_id, 'blocked', {
        error: result.error,
        pending_cursor_dispatch: null,
      });
    }
    return { ok: false, message: `Dispatch failed: ${result.error}` };
  }

  const agentId = result.data.agentId as string | undefined;
  const agentUrl = result.data.agentUrl as string | undefined;
  const branch = result.data.integration_branch as string;

  if (pending.task_id) {
    await appendTaskLog(supabase, pending.task_id, {
      kind: 'cursor',
      message: `Approved dispatch → agent ${agentId || 'unknown'} on ${branch}`,
    });
  }

  const msg = [
    '*Cursor dispatch approved*',
    pending.linear_issue_id ? `Linear: \`${pending.linear_issue_id}\`` : null,
    `Branch: \`${branch}\``,
    agentId ? `Agent: \`${agentId}\`` : null,
    agentUrl ? `<${agentUrl}|Open in Cursor>` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (slack?.channel) {
    await postSlackMessage(slack.channel, msg, slack.threadTs);
  }

  return { ok: true, message: msg, data: result.data };
}

export async function denyPendingCursorDispatch(
  supabase: SupabaseClient,
  pending: PendingCursorDispatch,
  slack?: { channel: string; threadTs: string }
): Promise<string> {
  if (pending.task_id) {
    await updateTaskStatus(supabase, pending.task_id, 'blocked', {
      pending_cursor_dispatch: null,
      error: 'Cursor dispatch cancelled by user',
      result_summary: 'Dispatch not approved.',
      next_run_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    await appendTaskLog(supabase, pending.task_id, {
      kind: 'info',
      message: 'Cursor dispatch cancelled by user',
    });
  }
  if (pending.conversation_id) {
    await supabase
      .from('brain_conversations')
      .update({ pending_action: null, updated_at: new Date().toISOString() })
      .eq('id', pending.conversation_id);
  }

  const msg = 'Cursor dispatch cancelled. Reply in thread if you want to try again.';
  if (slack?.channel) {
    await postSlackMessage(slack.channel, msg, slack.threadTs);
  }
  return msg;
}
