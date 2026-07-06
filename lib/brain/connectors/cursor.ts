import { buildCursorDispatchPrompt } from '../cursor-context';
import {
  createCursorAgent,
  getCursorAgent,
  isCursorConfigured,
} from '../cursor-api';
import {
  cursorApprovalRequired,
  requestCursorDispatchApproval,
} from '../cursor-approval';
import { runCursorDispatch } from '../cursor-dispatch';
import { getBrainTask } from '../tasks/store';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

const CONNECTOR_ID = 'cursor';

const TOOLS: ConnectorTool[] = [
  {
    name: 'cursor_dispatch_agent',
    description:
      'Launch Cursor on Trailblaize-Web. Creates/uses an integration feature branch; PRs target that branch only — never develop/main. Requires user approval in Slack before dispatch (unless approved=true).',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Implementation instructions for the cloud agent' },
        starting_ref: {
          type: 'string',
          description: 'Override start branch (default: task integration_branch). Must not be develop/main.',
        },
        auto_create_pr: { type: 'boolean', description: 'Open PR to integration branch when done (default true)' },
        mode: { type: 'string', enum: ['agent', 'plan'], description: 'agent=implement, plan=explore first' },
        linear_issue_id: { type: 'string', description: 'Linear id e.g. TRA-465' },
        follow_up: {
          type: 'boolean',
          description: 'Second dispatch after cursor PR merged into integration branch',
        },
        approved: {
          type: 'boolean',
          description: 'Internal — set true only after user approved in Slack',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'cursor_get_agent',
    description: 'Get status of a Cursor Cloud Agent by id (includes latest run status).',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', description: 'Cursor agent id (bc-...)' },
      },
      required: ['agent_id'],
    },
  },
];

export const cursorConnector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'Cursor Cloud Agents',
  kind: 'in-process',

  isAvailable() {
    return isCursorConfigured();
  },

  async listTools(): Promise<ConnectorTool[]> {
    return TOOLS;
  },

  async callTool(toolName: string, input: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorCallResult> {
    try {
      if (toolName === 'cursor_dispatch_agent') {
        const implementation = String(input.prompt || '').trim();
        if (!implementation) return { ok: false, error: 'prompt is required' };

        const followUp = input.follow_up === true;
        const approved = input.approved === true;
        let linearIssueId =
          typeof input.linear_issue_id === 'string' ? input.linear_issue_id.trim() : null;
        let taskGoal: string | null = null;

        if (ctx.taskId) {
          const task = await getBrainTask(ctx.supabase, ctx.taskId);
          if (task) {
            linearIssueId = linearIssueId || task.linear_issue_id;
            taskGoal = task.goal;
          }
        }

        if (cursorApprovalRequired() && !approved) {
          const pending = await requestCursorDispatchApproval(
            {
              prompt: implementation,
              starting_ref:
                typeof input.starting_ref === 'string' ? input.starting_ref : undefined,
              auto_create_pr: input.auto_create_pr !== false,
              mode: input.mode === 'plan' ? 'plan' : 'agent',
              linear_issue_id: linearIssueId || undefined,
              follow_up: followUp,
            },
            ctx,
            linearIssueId,
            taskGoal
          );
          return { ok: true, data: pending.data };
        }

        const result = await runCursorDispatch(
          {
            prompt: implementation,
            starting_ref:
              typeof input.starting_ref === 'string' ? input.starting_ref : undefined,
            auto_create_pr: input.auto_create_pr !== false,
            mode: input.mode === 'plan' ? 'plan' : 'agent',
            linear_issue_id: linearIssueId || undefined,
            follow_up: followUp,
            approved: true,
          },
          ctx
        );

        if (!result.ok) return { ok: false, error: result.error };
        return { ok: true, data: result.data };
      }

      if (toolName === 'cursor_get_agent') {
        const agentId = String(input.agent_id || '').trim();
        if (!agentId) return { ok: false, error: 'agent_id is required' };
        const agent = await getCursorAgent(agentId);
        const { getLatestCursorRunSnapshot } = await import('../cursor-api');
        const run = await getLatestCursorRunSnapshot(agentId);
        return { ok: true, data: { agent, latest_run: run } };
      }

      return { ok: false, error: `Unknown tool: ${toolName}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Cursor call failed' };
    }
  },
};
