import { buildCursorDispatchPrompt } from '../cursor-context';
import {
  createCursorAgent,
  getCursorAgent,
  isCursorConfigured,
} from '../cursor-api';
import {
  deriveIntegrationBranch,
  ensureIntegrationBranchOnGitHub,
  isProtectedTargetBranch,
} from '../integration-branch';
import { delegateLinearIssueToCursor } from '../linear-delegate';
import { getBrainTask } from '../tasks/store';
import { isCursorDispatchLocked } from '../tasks/cursor-lock';
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
      'Launch Cursor on Trailblaize-Web. Creates/uses an integration feature branch; PRs target that branch only — never develop/main. One dispatch per task unless follow_up=true.',
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

async function persistCursorDispatch(
  ctx: ConnectorContext,
  result: Awaited<ReturnType<typeof createCursorAgent>>,
  integrationBranch: string
): Promise<void> {
  if (!ctx.taskId || !result.agentId) return;
  await ctx.supabase
    .from('brain_tasks')
    .update({
      cursor_agent_id: result.agentId,
      cursor_agent_url: result.agentUrl,
      cursor_run_id: result.runId,
      cursor_run_status: result.runStatus || 'CREATING',
      cursor_pr_merged: false,
      integration_branch: integrationBranch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.taskId);
}

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
        let linearIssueId =
          typeof input.linear_issue_id === 'string' ? input.linear_issue_id.trim() : null;
        let taskGoal: string | null = null;
        let task: Awaited<ReturnType<typeof getBrainTask>> = null;

        if (ctx.taskId) {
          task = await getBrainTask(ctx.supabase, ctx.taskId);
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
        }

        const integrationBranch =
          task?.integration_branch ||
          deriveIntegrationBranch(linearIssueId, taskGoal || implementation);

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

        await persistCursorDispatch(ctx, result, integrationBranch);

        let linearDelegate: Awaited<ReturnType<typeof delegateLinearIssueToCursor>> | null = null;
        if (linearIssueId) {
          linearDelegate = await delegateLinearIssueToCursor(linearIssueId);
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
