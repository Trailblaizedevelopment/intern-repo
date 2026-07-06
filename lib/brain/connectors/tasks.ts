import {
  appendTaskLog,
  createBrainTask,
  getBrainTask,
  listActiveBrainTasks,
  updateTaskStatus,
} from '../tasks/store';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

const CONNECTOR_ID = 'tasks';

const TOOLS: ConnectorTool[] = [
  {
    name: 'tasks_start_goal',
    description:
      'Start a durable multi-step work goal. Generates an execution plan (grill) and queues background iterations. Use when asked to work on something for an extended period.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'What to accomplish' },
        linear_issue_id: { type: 'string', description: 'Optional Linear id e.g. TRA-465' },
        max_minutes: { type: 'number', description: 'Time budget (default 60)' },
      },
      required: ['goal'],
    },
  },
  {
    name: 'tasks_list_active',
    description: 'List active brain tasks (queued, running, blocked).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tasks_get_status',
    description: 'Get full status for a brain task by id.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'tasks_complete',
    description: 'Mark the current or specified brain task as completed with a summary.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task id (defaults to active task context)' },
        summary: { type: 'string', description: 'What was accomplished' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'tasks_fail',
    description: 'Mark task failed with reason.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'tasks_block',
    description: 'Pause task — needs human input. Will retry later unless cancelled.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
];

function resolveTaskId(ctx: ConnectorContext, input: Record<string, unknown>): string | null {
  const fromInput = typeof input.task_id === 'string' ? input.task_id.trim() : '';
  return fromInput || ctx.taskId || null;
}

export const tasksConnector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'Task Orchestration',
  kind: 'in-process',

  isAvailable() {
    return true;
  },

  async listTools(): Promise<ConnectorTool[]> {
    return TOOLS;
  },

  async callTool(toolName: string, input: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorCallResult> {
    try {
      if (toolName === 'tasks_start_goal') {
        const goal = String(input.goal || '').trim();
        if (!goal) return { ok: false, error: 'goal is required' };

        const task = await createBrainTask(ctx.supabase, {
          goal,
          linearIssueId: typeof input.linear_issue_id === 'string' ? input.linear_issue_id : null,
          maxMinutes: Number(input.max_minutes) || 60,
          employeeId: ctx.employeeId,
          source: ctx.surface === 'slack' ? 'slack' : 'chat',
          conversationId: ctx.conversationId ?? null,
          slackChannel: ctx.slackChannel ?? null,
          slackThreadTs: ctx.slackThreadTs ?? null,
        });

        return {
          ok: true,
          data: {
            task_id: task.id,
            status: task.status,
            plan: task.plan,
            deadline_at: task.deadline_at,
            message: 'Task queued. Background runner will iterate until complete, blocked, or deadline.',
          },
        };
      }

      if (toolName === 'tasks_list_active') {
        const tasks = await listActiveBrainTasks(ctx.supabase);
        return {
          ok: true,
          data: tasks.map(t => ({
            id: t.id,
            goal: t.goal,
            status: t.status,
            linear_issue_id: t.linear_issue_id,
            iteration_count: t.iteration_count,
            cursor_agent_id: t.cursor_agent_id,
            deadline_at: t.deadline_at,
          })),
        };
      }

      if (toolName === 'tasks_get_status') {
        const taskId = resolveTaskId(ctx, input);
        if (!taskId) return { ok: false, error: 'task_id required' };
        const task = await getBrainTask(ctx.supabase, taskId);
        if (!task) return { ok: false, error: 'Task not found' };
        return { ok: true, data: task };
      }

      if (toolName === 'tasks_complete') {
        const taskId = resolveTaskId(ctx, input);
        if (!taskId) return { ok: false, error: 'task_id required' };
        const summary = String(input.summary || '').trim();
        await updateTaskStatus(ctx.supabase, taskId, 'completed', { result_summary: summary });
        await appendTaskLog(ctx.supabase, taskId, { kind: 'info', message: `Completed: ${summary}` });
        return { ok: true, data: { task_id: taskId, status: 'completed' } };
      }

      if (toolName === 'tasks_fail') {
        const taskId = resolveTaskId(ctx, input);
        if (!taskId) return { ok: false, error: 'task_id required' };
        const reason = String(input.reason || '').trim();
        await updateTaskStatus(ctx.supabase, taskId, 'failed', { error: reason });
        await appendTaskLog(ctx.supabase, taskId, { kind: 'error', message: reason });
        return { ok: true, data: { task_id: taskId, status: 'failed' } };
      }

      if (toolName === 'tasks_block') {
        const taskId = resolveTaskId(ctx, input);
        if (!taskId) return { ok: false, error: 'task_id required' };
        const reason = String(input.reason || '').trim();
        const nextRun = new Date(Date.now() + 15 * 60_000).toISOString();
        await updateTaskStatus(ctx.supabase, taskId, 'blocked', {
          error: reason,
          next_run_at: nextRun,
        });
        await appendTaskLog(ctx.supabase, taskId, { kind: 'info', message: `Blocked: ${reason}` });
        return { ok: true, data: { task_id: taskId, status: 'blocked', next_run_at: nextRun } };
      }

      return { ok: false, error: `Unknown tool: ${toolName}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Tasks call failed' };
    }
  },
};
