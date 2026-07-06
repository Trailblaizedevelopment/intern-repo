import { SupabaseClient } from '@supabase/supabase-js';
import { getGitHubRepoFull } from '../github-repo';
import { grillTaskPlan } from '../grill';
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
  const maxMinutes = input.maxMinutes ?? 60;
  const deadline = new Date(Date.now() + maxMinutes * 60_000).toISOString();

  const { data: created, error } = await supabase
    .from('brain_tasks')
    .insert([
      {
        employee_id: input.employeeId ?? null,
        source: input.source ?? 'chat',
        conversation_id: input.conversationId ?? null,
        linear_issue_id: input.linearIssueId ?? null,
        goal: input.goal.trim(),
        status: 'planning',
        github_repo: defaultRepo(),
        max_minutes: maxMinutes,
        max_iterations: parseInt(process.env.BRAIN_TASK_MAX_ITERATIONS || '12', 10) || 12,
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

  const plan = await grillTaskPlan(input.goal, input.linearIssueId);
  const log: BrainTaskLogEntry[] = [
    { at: new Date().toISOString(), kind: 'grill', message: 'Execution plan generated' },
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
    .in('status', ['queued', 'planning', 'running', 'blocked'])
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data as BrainTaskRow[]) || [];
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
