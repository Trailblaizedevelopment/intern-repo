import {
  addConversationMemories,
  isMem0Configured,
  resolveMem0UserId,
  searchMemories,
} from '../mem0/client';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

const CONNECTOR_ID = 'mem0';

function userIdFromCtx(ctx: ConnectorContext, input?: Record<string, unknown>): string {
  if (typeof input?.user_id === 'string' && input.user_id.trim()) {
    return input.user_id.trim();
  }
  return resolveMem0UserId({
    employeeId: ctx.employeeId,
    slackUserId: ctx.slackUserId,
  });
}

type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ConnectorContext
) => Promise<ConnectorCallResult>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  search: async (input, ctx) => {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) return { ok: false, error: 'query is required' };

    try {
      const userId = userIdFromCtx(ctx, input);
      const memories = await searchMemories(query, userId, {
        topK: typeof input.limit === 'number' ? input.limit : 8,
      });
      return {
        ok: true,
        data: {
          user_id: userId,
          count: memories.length,
          memories: memories.map(m => ({
            id: m.id,
            memory: m.memory,
            score: m.score,
            categories: m.categories,
          })),
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Mem0 search failed',
      };
    }
  },

  remember: async (input, ctx) => {
    const fact = typeof input.fact === 'string' ? input.fact.trim() : '';
    if (!fact) return { ok: false, error: 'fact is required' };

    const userId = userIdFromCtx(ctx, input);
    const result = await addConversationMemories(
      [
        { role: 'user', content: `Please remember: ${fact}` },
        { role: 'assistant', content: 'Got it — I will remember that.' },
      ],
      userId,
      { kind: 'explicit_remember', surface: ctx.surface || 'workspace' }
    );

    if (result.skipped) {
      return { ok: false, error: 'MEM0_API_KEY not configured' };
    }
    if (!result.ok) {
      return { ok: false, error: result.error || 'Mem0 remember failed' };
    }

    return {
      ok: true,
      data: {
        user_id: userId,
        status: result.status || 'PENDING',
        event_id: result.eventId || null,
        fact,
      },
    };
  },
};

const TOOLS: ConnectorTool[] = [
  {
    name: 'mem0_search',
    description:
      'Search persistent Mem0 memories for this user (preferences, active Linear focus, recurring codebase paths). Use when prior context may help across Slack threads.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search (e.g. "Slack reply preferences", "active tickets")',
        },
        limit: {
          type: 'number',
          description: 'Max results (1–20, default 8)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'mem0_remember',
    description:
      'Persist an explicit durable fact the user asked you to remember (preferences, ticket focus, codebase paths). Do not store one-off greetings.',
    inputSchema: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'Short durable fact to store',
        },
      },
      required: ['fact'],
    },
  },
];

export const mem0Connector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'Mem0 Memory',
  kind: 'in-process',
  isAvailable: () => isMem0Configured(),
  listTools: async () => TOOLS,
  callTool: async (toolName, input, ctx) => {
    const short = toolName.startsWith(`${CONNECTOR_ID}_`)
      ? toolName.slice(CONNECTOR_ID.length + 1)
      : toolName;
    const handler = TOOL_HANDLERS[short];
    if (!handler) return { ok: false, error: `Unknown Mem0 tool: ${toolName}` };
    return handler(input, ctx);
  },
};
