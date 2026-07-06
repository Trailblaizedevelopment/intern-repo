import { SupabaseClient } from '@supabase/supabase-js';
import { runBrainAgent } from '../agent';
import { postSlackMessage } from '../slack/client';
import { appendTaskLog, claimNextRunnableTask, getBrainTask } from './store';
import { BrainTaskRow } from './types';

const TICK_INTERVAL_MS = parseInt(process.env.BRAIN_TASK_TICK_MS || '120000', 10) || 120_000;

function buildTaskIterationPrompt(task: BrainTaskRow): string {
  const parts = [
    `Continue brain_task ${task.id}.`,
    `Goal: ${task.goal}`,
  ];
  if (task.linear_issue_id) parts.push(`Linear: ${task.linear_issue_id}`);
  if (task.plan) parts.push(`Plan:\n${task.plan}`);
  if (task.cursor_agent_id) {
    parts.push(`Cursor agent already dispatched: ${task.cursor_agent_id}`);
    if (task.cursor_agent_url) parts.push(`URL: ${task.cursor_agent_url}`);
  }
  parts.push(
    `Iteration ${task.iteration_count + 1}/${task.max_iterations}. Deadline: ${task.deadline_at || 'none'}.`,
    'Use tools to make progress. Call tasks_complete when done, tasks_block if stuck, or cursor_dispatch_agent for code work.'
  );
  return parts.join('\n\n');
}

function buildTaskSystemAppend(task: BrainTaskRow): string {
  return [
    'TASK ORCHESTRATION MODE — you are executing one iteration of a background goal.',
    `Task id: ${task.id} (pass to tasks_* tools or rely on task context).`,
    'Be action-oriented: research in Linear/GitHub, dispatch Cursor for implementation, then complete or block.',
    'Do not ask the user questions — make reasonable assumptions and log them in the summary.',
  ].join('\n');
}

async function notifySlack(task: BrainTaskRow, message: string): Promise<void> {
  if (!task.slack_channel) return;
  await postSlackMessage(task.slack_channel, message, task.slack_thread_ts || undefined);
}

export interface TaskRunnerResult {
  processed: boolean;
  taskId?: string;
  status?: string;
  reply?: string;
  error?: string;
}

export async function runOneTaskIteration(supabase: SupabaseClient): Promise<TaskRunnerResult> {
  const task = await claimNextRunnableTask(supabase);
  if (!task) return { processed: false };

  const prevStatus = task.status;
  await supabase
    .from('brain_tasks')
    .update({
      status: 'running',
      iteration_count: task.iteration_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  await appendTaskLog(supabase, task.id, {
    kind: 'info',
    message: `Iteration ${task.iteration_count + 1} started`,
  });

  let reply = '';
  let runError: string | undefined;

  try {
    const result = await runBrainAgent(
      [{ role: 'user', content: buildTaskIterationPrompt(task) }],
      { supabase, employeeId: task.employee_id },
      null,
      {
        surface: task.source === 'slack' ? 'slack' : 'workspace',
        systemAppend: buildTaskSystemAppend(task),
        maxIterations: parseInt(process.env.BRAIN_TASK_TOOL_ITERATIONS || '10', 10) || 10,
        taskId: task.id,
        conversationId: task.conversation_id,
        slackChannel: task.slack_channel,
        slackThreadTs: task.slack_thread_ts,
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
    return { processed: true, taskId: task.id, error: 'Task disappeared after run' };
  }

  const terminal = ['completed', 'failed', 'cancelled'].includes(refreshed.status);

  if (!terminal && refreshed.status !== 'blocked') {
    const nextRun = new Date(Date.now() + TICK_INTERVAL_MS).toISOString();
    await supabase
      .from('brain_tasks')
      .update({
        status: 'running',
        next_run_at: nextRun,
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);
  }

  if (prevStatus !== refreshed.status || terminal) {
    const headline = terminal
      ? `*Brain task ${terminal ? refreshed.status : refreshed.status}*`
      : `*Brain task update*`;
    const body = [
      headline,
      refreshed.linear_issue_id ? `Linear: ${refreshed.linear_issue_id}` : null,
      refreshed.goal.slice(0, 200),
      refreshed.result_summary || refreshed.error || reply.slice(0, 300),
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
  };
}
