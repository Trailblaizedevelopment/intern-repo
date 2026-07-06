import { buildCursorDispatchPrompt } from '../cursor-context';
import {
  createCursorAgent,
  getCursorAgent,
  getDefaultCursorStartingRef,
  isCursorConfigured,
} from '../cursor-api';
import { getBrainTask } from '../tasks/store';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

const CONNECTOR_ID = 'cursor';
const developBranch = () => getDefaultCursorStartingRef();

const TOOLS: ConnectorTool[] = [
  {
    name: 'cursor_dispatch_agent',
    description: `Launch a Cursor Cloud Agent on Trailblaize-Web (base branch: ${developBranch()}). Injects AGENTS.md + guardrails. PR targets develop.`,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Implementation instructions for the cloud agent' },
        starting_ref: {
          type: 'string',
          description: `Branch to start from (default ${developBranch()})`,
        },
        auto_create_pr: { type: 'boolean', description: 'Open PR to develop when done (default true)' },
        mode: { type: 'string', enum: ['agent', 'plan'], description: 'agent=implement, plan=explore first' },
        linear_issue_id: { type: 'string', description: 'Linear id e.g. TRA-465 for branch naming' },
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
  result: Awaited<ReturnType<typeof createCursorAgent>>
): Promise<void> {
  if (!ctx.taskId || !result.agentId) return;
  await ctx.supabase
    .from('brain_tasks')
    .update({
      cursor_agent_id: result.agentId,
      cursor_agent_url: result.agentUrl,
      cursor_run_id: result.runId,
      cursor_run_status: result.runStatus || 'CREATING',
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

        const fullPrompt = await buildCursorDispatchPrompt({
          implementation,
          linearIssueId,
          taskGoal,
        });

        const result = await createCursorAgent({
          prompt: fullPrompt,
          startingRef: typeof input.starting_ref === 'string' ? input.starting_ref : undefined,
          autoCreatePR: input.auto_create_pr !== false,
          mode: input.mode === 'plan' ? 'plan' : 'agent',
        });

        await persistCursorDispatch(ctx, result);

        return { ok: true, data: { ...result, starting_ref: input.starting_ref || developBranch() } };
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
