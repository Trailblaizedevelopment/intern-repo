import { SupabaseClient } from '@supabase/supabase-js';
import { isCursorConfigured } from '../cursor-api';
import { watchCursorAgent } from '../cursor-watch';
import { runBrainAgent } from '../agent';
import { postSlackMessage } from '../slack/client';
import { handlePrMergeWatch } from './cursor-lock';
import { appendTaskLog, claimNextRunnableTask, getBrainTask, updateTaskStatus } from './store';
import { BrainTaskRow } from './types';

const TICK_INTERVAL_MS = parseInt(process.env.BRAIN_TASK_TICK_MS || '120000', 10) || 120_000;
const CURSOR_POLL_INTERVAL_MS = parseInt(process.env.BRAIN_CURSOR_POLL_MS || '60000', 10) || 60_000;

function buildTaskIterationPrompt(task: BrainTaskRow, cursorNote?: string): string {
  const parts = [
    `Continue brain_task ${task.id}.`,
    `Goal: ${task.goal}`,
  ];
  if (task.linear_issue_id) parts.push(`Linear: ${task.linear_issue_id}`);
  if (task.integration_branch) {
    parts.push(`Integration branch (PR target): ${task.integration_branch} — humans merge this → develop`);
  }
  if (task.plan) parts.push(`Plan:\n${task.plan}`);
  if (task.cursor_agent_id) {
    parts.push(`Cursor agent: ${task.cursor_agent_id}`);
    if (task.cursor_agent_url) parts.push(`Dashboard: ${task.cursor_agent_url}`);
    if (task.cursor_run_status) parts.push(`Run status: ${task.cursor_run_status}`);
    if (task.cursor_pr_url) parts.push(`PR: ${task.cursor_pr_url}${task.cursor_pr_merged ? ' (merged)' : ''}`);
    if (task.cursor_branch) parts.push(`Branch: ${task.cursor_branch}`);
  }
  if (cursorNote) parts.push(cursorNote);
  parts.push(
    `Iteration ${task.iteration_count + 1}/${task.max_iterations}. Deadline: ${task.deadline_at || 'none'}.`,
    'Use tools to make progress. Call tasks_complete when done, tasks_block if stuck.',
    'If cursor PR merged into integration branch, use cursor_dispatch_agent with follow_up=true for next slice.',
    'Never target develop or main with PRs — humans only.'
  );
  return parts.join('\n\n');
}

function buildTaskSystemAppend(task: BrainTaskRow): string {
  return [
    'TASK ORCHESTRATION MODE — you are executing one iteration of a background goal.',
    `Task id: ${task.id} (pass to tasks_* tools or rely on task context).`,
    'Brain orchestrates; Cursor implements on Trailblaize-Web. PRs target the task integration feature branch only — humans merge feature → develop.',
    'Be action-oriented: research in Linear/GitHub, dispatch Cursor once for implementation, then complete when PR exists.',
    'Do not ask the user questions — make reasonable assumptions and log them in the summary.',
  ].join('\n');
}

async function notifySlack(task: BrainTaskRow, message: string): Promise<void> {
  if (!task.slack_channel) return;
  await postSlackMessage(task.slack_channel, message, task.slack_thread_ts || undefined);
}

async function scheduleNextRun(
  supabase: SupabaseClient,
  taskId: string,
  delayMs: number,
  status: BrainTaskRow['status'] = 'running'
): Promise<void> {
  await supabase
    .from('brain_tasks')
    .update({
      status,
      next_run_at: new Date(Date.now() + delayMs).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

async function persistCursorWatch(
  supabase: SupabaseClient,
  taskId: string,
  watch: Awaited<ReturnType<typeof watchCursorAgent>>
): Promise<void> {
  await supabase
    .from('brain_tasks')
    .update({
      cursor_run_id: watch.runId,
      cursor_run_status: watch.runStatus,
      cursor_pr_url: watch.prUrl,
      cursor_branch: watch.branch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

/**
 * Poll Cursor when a task has a dispatched agent. Returns true if this tick was
 * handled without running a full Brain agent iteration.
 */
async function handleCursorWatchTick(
  supabase: SupabaseClient,
  task: BrainTaskRow
): Promise<{ handled: boolean; result?: TaskRunnerResult }> {
  if (!task.cursor_agent_id || !isCursorConfigured()) {
    return { handled: false };
  }

  const prevRunStatus = task.cursor_run_status;
  const watch = await watchCursorAgent(task.cursor_agent_id, task.cursor_run_id);
  await persistCursorWatch(supabase, task.id, watch);

  if (watch.phase === 'running') {
    await appendTaskLog(supabase, task.id, {
      kind: 'cursor',
      message: `Cursor run ${watch.runStatus || 'RUNNING'}${watch.branch ? ` on ${watch.branch}` : ''}`,
    });
    await scheduleNextRun(supabase, task.id, CURSOR_POLL_INTERVAL_MS);
    return {
      handled: true,
      result: {
        processed: true,
        taskId: task.id,
        status: 'running',
        reply: `Waiting for Cursor (${watch.runStatus})`,
      },
    };
  }

  if (watch.phase === 'failed') {
    const reason = `Cursor run ${watch.runStatus}: ${watch.summary || 'failed'}`;
    await appendTaskLog(supabase, task.id, { kind: 'error', message: reason });
    await updateTaskStatus(supabase, task.id, 'blocked', { error: reason });
    const refreshed = await getBrainTask(supabase, task.id);
    if (refreshed) {
      await notifySlack(refreshed, `*Brain task blocked*\n${reason}`);
    }
    return {
      handled: true,
      result: { processed: true, taskId: task.id, status: 'blocked', error: reason },
    };
  }

  if (watch.phase === 'finished') {
    const justFinished = prevRunStatus !== 'FINISHED';
    const prLine = watch.prUrl ? `PR: ${watch.prUrl}` : watch.branch ? `Branch: ${watch.branch}` : '';
    await appendTaskLog(supabase, task.id, {
      kind: 'cursor',
      message: `Cursor FINISHED. ${prLine} ${watch.summary?.slice(0, 200) || ''}`.trim(),
    });

    if (justFinished && task.slack_channel) {
      await notifySlack(task, [
        '*Cursor agent finished*',
        task.linear_issue_id ? `Linear: ${task.linear_issue_id}` : null,
        prLine || null,
        watch.summary?.slice(0, 300) || null,
        task.cursor_agent_url ? `<${task.cursor_agent_url}|View agent>` : null,
      ]
        .filter(Boolean)
        .join('\n'));
    }

    return { handled: false };
  }

  return { handled: false };
}

async function handlePrMergeWatchTick(
  supabase: SupabaseClient,
  task: BrainTaskRow
): Promise<{ handled: boolean; result?: TaskRunnerResult }> {
  const mergeResult = await handlePrMergeWatch(supabase, task);
  if (!mergeResult.handled || !mergeResult.merged) {
    return { handled: false };
  }

  const refreshed = (await getBrainTask(supabase, task.id)) || task;
  const msg = mergeResult.releasedDispatchLock
    ? `PR merged into ${refreshed.integration_branch}. Dispatch lock released — follow-up allowed on integration branch.`
    : mergeResult.mergedToProtected
      ? `PR merged to protected branch — human action only. Agent will not continue.`
      : `PR merged. Verify and tasks_complete.`;

  if (refreshed.slack_channel) {
    await notifySlack(refreshed, [
      '*PR merged*',
      refreshed.linear_issue_id ? `Linear: ${refreshed.linear_issue_id}` : null,
      refreshed.cursor_pr_url || null,
      mergeResult.releasedDispatchLock
        ? `Ready for follow-up dispatch on ${refreshed.integration_branch}.`
        : null,
    ]
      .filter(Boolean)
      .join('\n'));
  }

  await scheduleNextRun(supabase, task.id, TICK_INTERVAL_MS);
  return {
    handled: true,
    result: {
      processed: true,
      taskId: task.id,
      status: refreshed.status,
      reply: msg,
      mode: 'poll',
    },
  };
}

export interface TaskRunnerResult {
  processed: boolean;
  taskId?: string;
  status?: string;
  reply?: string;
  error?: string;
  mode?: 'poll' | 'agent';
}

export async function runOneTaskIteration(supabase: SupabaseClient): Promise<TaskRunnerResult> {
  const task = await claimNextRunnableTask(supabase);
  if (!task) return { processed: false };

  const prMergeTick = await handlePrMergeWatchTick(supabase, task);
  if (prMergeTick.handled && prMergeTick.result) {
    return prMergeTick.result;
  }

  const watchTick = await handleCursorWatchTick(supabase, task);
  if (watchTick.handled && watchTick.result) {
    return { ...watchTick.result, mode: 'poll' };
  }

  const refreshedForPrompt = (await getBrainTask(supabase, task.id)) || task;
  const cursorNote = refreshedForPrompt.cursor_pr_merged
    ? `PR merged into ${refreshedForPrompt.integration_branch}. tasks_complete if done, or cursor_dispatch_agent with follow_up=true for next slice.`
    : refreshedForPrompt.cursor_run_status === 'FINISHED'
      ? 'Cursor FINISHED. Verify PR targets integration branch (not develop), then tasks_complete.'
      : undefined;

  const prevStatus = refreshedForPrompt.status;
  await supabase
    .from('brain_tasks')
    .update({
      status: 'running',
      iteration_count: refreshedForPrompt.iteration_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  await appendTaskLog(supabase, task.id, {
    kind: 'info',
    message: `Agent iteration ${refreshedForPrompt.iteration_count + 1} started`,
  });

  let reply = '';
  let runError: string | undefined;

  try {
    const result = await runBrainAgent(
      [{ role: 'user', content: buildTaskIterationPrompt(refreshedForPrompt, cursorNote) }],
      { supabase, employeeId: refreshedForPrompt.employee_id },
      null,
      {
        surface: refreshedForPrompt.source === 'slack' ? 'slack' : 'workspace',
        systemAppend: buildTaskSystemAppend(refreshedForPrompt),
        maxIterations: parseInt(process.env.BRAIN_TASK_TOOL_ITERATIONS || '10', 10) || 10,
        taskId: refreshedForPrompt.id,
        conversationId: refreshedForPrompt.conversation_id,
        slackChannel: refreshedForPrompt.slack_channel,
        slackThreadTs: refreshedForPrompt.slack_thread_ts,
      }
    );
    reply = result.reply;
    await appendTaskLog(supabase, task.id, {
      kind: 'info',
      message: reply.slice(0, 800),
    });
  } catch (err) {
    runError = err instanceof Error ? err.message : 'Task iteration failed';
    await appendTaskLog(supabase, task.id, { kind: 'error', message: runError });
  }

  const refreshed = await getBrainTask(supabase, task.id);
  if (!refreshed) {
    return { processed: true, taskId: task.id, error: 'Task disappeared after run', mode: 'agent' };
  }

  const terminal = ['completed', 'failed', 'cancelled'].includes(refreshed.status);

  if (!terminal && refreshed.status !== 'blocked') {
    const delay = refreshed.cursor_agent_id && refreshed.cursor_run_status !== 'FINISHED'
      ? CURSOR_POLL_INTERVAL_MS
      : TICK_INTERVAL_MS;
    await scheduleNextRun(supabase, refreshed.id, delay);
  }

  if (prevStatus !== refreshed.status || terminal) {
    const headline = terminal ? `*Brain task ${refreshed.status}*` : `*Brain task update*`;
    const body = [
      headline,
      refreshed.linear_issue_id ? `Linear: ${refreshed.linear_issue_id}` : null,
      refreshed.goal.slice(0, 200),
      refreshed.result_summary || refreshed.error || reply.slice(0, 300),
      refreshed.cursor_pr_url ? `<${refreshed.cursor_pr_url}|PR>` : null,
      refreshed.cursor_agent_url ? `<${refreshed.cursor_agent_url}|Cursor agent>` : null,
    ]
      .filter(Boolean)
      .join('\n');
    await notifySlack(refreshed, body);
  }

  return {
    processed: true,
    taskId: task.id,
    status: refreshed.status,
    reply: reply.slice(0, 500),
    error: runError,
    mode: 'agent',
  };
}
