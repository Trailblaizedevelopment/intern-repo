import { createCursorAgent, getCursorAgent, isCursorConfigured } from '../cursor-api';
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
      'Launch a Cursor Cloud Agent on Trailblaize-Web to implement code changes. Returns agent id and dashboard URL.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Implementation instructions for the cloud agent' },
        starting_ref: { type: 'string', description: 'Branch to start from (default main)' },
        auto_create_pr: { type: 'boolean', description: 'Open PR when done (default true)' },
        mode: { type: 'string', enum: ['agent', 'plan'], description: 'agent=implement, plan=explore first' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'cursor_get_agent',
    description: 'Get status of a Cursor Cloud Agent by id.',
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
        const prompt = String(input.prompt || '').trim();
        if (!prompt) return { ok: false, error: 'prompt is required' };

        const result = await createCursorAgent({
          prompt,
          startingRef: typeof input.starting_ref === 'string' ? input.starting_ref : undefined,
          autoCreatePR: input.auto_create_pr !== false,
          mode: input.mode === 'plan' ? 'plan' : 'agent',
        });

        if (ctx.taskId && result.agentId) {
          await ctx.supabase
            .from('brain_tasks')
            .update({
              cursor_agent_id: result.agentId,
              cursor_agent_url: result.agentUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ctx.taskId);
        }

        return { ok: true, data: result };
      }

      if (toolName === 'cursor_get_agent') {
        const agentId = String(input.agent_id || '').trim();
        if (!agentId) return { ok: false, error: 'agent_id is required' };
        const agent = await getCursorAgent(agentId);
        return { ok: true, data: agent };
      }

      return { ok: false, error: `Unknown tool: ${toolName}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Cursor call failed' };
    }
  },
};
