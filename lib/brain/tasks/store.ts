import { SupabaseClient } from '@supabase/supabase-js';
import { deriveIntegrationBranch } from '../integration-branch';
import { getGitHubRepoFull } from '../github-repo';
import { grillTaskPlan } from '../grill';
import {
  GOAL_DEFAULT_MAX_MINUTES,
  SLICE_DEFAULT_MAX_ITERATIONS,
  SLICE_DEFAULT_MAX_MINUTES,
} from '../intent-routing';
import { BrainTaskLogEntry, BrainTaskRow, BrainTaskStatus, CreateBrainTaskInput } from './types';

function defaultRepo(): string {
  return getGitHubRepoFull();
}

export async function appendTaskLog(
  supabase: SupabaseClient,
  taskId: string,
  entry: Omit<BrainTaskLogEntry, 'at'>
): Promise<void> {
  const { data } = await supabase.from('brain_tasks').select('log').eq('id', taskId).single();
  const log = ((data?.log as BrainTaskLogEntry[]) || []).slice(-49);
  log.push({ ...entry, at: new Date().toISOString() });
  await supabase
    .from('brain_tasks')
    .update({ log, updated_at: new Date().toISOString() })
    .eq('id', taskId);
}

export async function createBrainTask(
  supabase: SupabaseClient,
  input: CreateBrainTaskInput
): Promise<BrainTaskRow> {
  const taskKind = input.taskKind ?? 'goal';
  const maxMinutes =
    input.maxMinutes ??
    (taskKind === 'slice' ? SLICE_DEFAULT_MAX_MINUTES : GOAL_DEFAULT_MAX_MINUTES);
  const maxIterations =
    input.maxIterations ??
    (taskKind === 'slice'
      ? SLICE_DEFAULT_MAX_ITERATIONS
      : parseInt(process.env.BRAIN_TASK_MAX_ITERATIONS || '12', 10) || 12);
  const deadline = new Date(Date.now() + maxMinutes * 60_000).toISOString();
  const integrationBranch = deriveIntegrationBranch(input.linearIssueId, input.goal);

  const { data: created, error } = await supabase
    .from('brain_tasks')
    .insert([
      {
        employee_id: input.employeeId ?? null,
        source: input.source ?? 'chat',
        conversation_id: input.conversationId ?? null,
        linear_issue_id: input.linearIssueId ?? null,
        goal: input.goal.trim(),
        task_kind: taskKind,
        status: 'planning',
        github_repo: defaultRepo(),
        integration_branch: integrationBranch,
        max_minutes: maxMinutes,
        max_iterations: maxIterations,
        deadline_at: deadline,
        slack_channel: input.slackChannel ?? null,
        slack_thread_ts: input.slackThreadTs ?? null,
        next_run_at: new Date().toISOString(),
      },
    ])
    .select('*')
    .single();

  if (error || !created) {
    throw new Error(error?.message || 'Failed to create task');
  }

  const plan = await grillTaskPlan(input.goal, input.linearIssueId, taskKind);
  const log: BrainTaskLogEntry[] = [
    {
      at: new Date().toISOString(),
      kind: 'grill',
      message: `${taskKind === 'slice' ? 'Slice' : 'Goal'} plan generated`,
    },
    { at: new Date().toISOString(), kind: 'info', message: plan.slice(0, 500) },
  ];

  const { data: updated, error: updateErr } = await supabase
    .from('brain_tasks')
    .update({
      plan,
      status: 'queued',
      log,
      updated_at: new Date().toISOString(),
    })
    .eq('id', created.id)
    .select('*')
    .single();

  if (updateErr || !updated) {
    throw new Error(updateErr?.message || 'Failed to update task plan');
  }

  return updated as BrainTaskRow;
}

export async function getBrainTask(
  supabase: SupabaseClient,
  taskId: string
): Promise<BrainTaskRow | null> {
  const { data } = await supabase.from('brain_tasks').select('*').eq('id', taskId).maybeSingle();
  return (data as BrainTaskRow) || null;
}

export async function listActiveBrainTasks(
  supabase: SupabaseClient,
  limit = 10
): Promise<BrainTaskRow[]> {
  const { data } = await supabase
    .from('brain_tasks')
    .select('*')
    .in('status', ['queued', 'planning', 'running', 'blocked', 'awaiting_approval'])
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as BrainTaskRow[]) || [];
}

/** Tasks due for cron runner (excludes awaiting_approval). */
export async function countRunnableTasks(supabase: SupabaseClient): Promise<number> {
  const now = new Date().toISOString();
  const { count, error } = await supabase
    .from('brain_tasks')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'running', 'blocked'])
    .lte('next_run_at', now);

  if (error) {
    console.error('[brain/tasks] countRunnableTasks:', error.message);
    return 0;
  }
  return count ?? 0;
}

export async function updateTaskStatus(
  supabase: SupabaseClient,
  taskId: string,
  status: BrainTaskStatus,
  fields: Partial<BrainTaskRow> = {}
): Promise<void> {
  await supabase
    .from('brain_tasks')
    .update({
      status,
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

export async function claimNextRunnableTask(
  supabase: SupabaseClient
): Promise<BrainTaskRow | null> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('brain_tasks')
    .select('*')
    .in('status', ['queued', 'running', 'blocked'])
    .lte('next_run_at', now)
    .order('next_run_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const task = data as BrainTaskRow;
  if (task.deadline_at && task.deadline_at < now) {
    await updateTaskStatus(supabase, task.id, 'failed', {
      error: 'Deadline exceeded',
      result_summary: 'Task stopped: time budget exhausted.',
    });
    return null;
  }

  if (task.iteration_count >= task.max_iterations) {
    await updateTaskStatus(supabase, task.id, 'blocked', {
      error: 'Max iterations reached',
      result_summary: 'Task paused: iteration limit hit. Resume manually or increase max_iterations.',
    });
    return null;
  }

  return task;
}
