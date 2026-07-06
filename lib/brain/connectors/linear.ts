import { getLinearApiKeyHeader } from '@/lib/linear';
import {
  McpHttpClient,
  isReadOnlyMcpTool,
  prefixedToolName,
  unprefixedToolName,
} from '../mcp/http-client';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

const CONNECTOR_ID = 'linear';
const DEFAULT_ENDPOINT = 'https://mcp.linear.app/mcp';

/** In-memory tool list cache (warm serverless instances). */
let toolsCache: { tools: ConnectorTool[]; expiresAt: number } | null = null;
const TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;

function linearReadOnly(): boolean {
  return process.env.BRAIN_LINEAR_READ_ONLY !== 'false';
}

function getEndpoint(): string {
  return (process.env.LINEAR_MCP_URL || DEFAULT_ENDPOINT).trim();
}

function getAuthHeader(): string {
  const key = getLinearApiKeyHeader();
  if (!key) return '';
  return key.startsWith('Bearer ') ? key : `Bearer ${key}`;
}

function getClient(ctx: ConnectorContext): McpHttpClient {
  const existing = ctx.mcpSessions.get(CONNECTOR_ID) as McpHttpClient | undefined;
  if (existing) return existing;

  const client = new McpHttpClient(getEndpoint(), getAuthHeader);
  ctx.mcpSessions.set(CONNECTOR_ID, client);
  return client;
}

function mcpResultToData(result: unknown): unknown {
  if (result && typeof result === 'object' && 'content' in result) {
    const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
    if (Array.isArray(content)) {
      const texts = content.filter(c => c.type === 'text' && c.text).map(c => c.text);
      if (texts.length === 1) {
        try {
          return JSON.parse(texts[0] as string);
        } catch {
          return texts[0];
        }
      }
      return texts;
    }
  }
  return result;
}

export const linearConnector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'Linear (remote MCP)',
  kind: 'mcp-http',

  isAvailable() {
    return Boolean(getLinearApiKeyHeader());
  },

  async listTools(ctx) {
    if (!this.isAvailable()) return [];

    if (toolsCache && toolsCache.expiresAt > Date.now()) {
      return toolsCache.tools;
    }

    try {
      const client = getClient(ctx);
      const mcpTools = await client.listTools();
      const readOnly = linearReadOnly();

      const tools: ConnectorTool[] = mcpTools
        .filter(t => !readOnly || isReadOnlyMcpTool(t.name))
        .map(t => ({
          name: prefixedToolName(CONNECTOR_ID, t.name),
          mcpName: t.name,
          description: `[Linear live] ${t.description || t.name}`,
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
        }));

      toolsCache = { tools, expiresAt: Date.now() + TOOLS_CACHE_TTL_MS };
      return tools;
    } catch (err) {
      console.error('[brain/linear] tools/list failed:', err);
      return [];
    }
  },

  async callTool(toolName, input, ctx) {
    if (!this.isAvailable()) {
      return { ok: false, error: 'LINEAR_API_KEY not configured' };
    }

    const mcpName = unprefixedToolName(CONNECTOR_ID, toolName);
    if (linearReadOnly() && !isReadOnlyMcpTool(mcpName)) {
      return { ok: false, error: `Linear write tool "${mcpName}" is disabled (read-only mode)` };
    }

    try {
      const client = getClient(ctx);
      const result = await client.callTool(mcpName, input);
      return { ok: true, data: mcpResultToData(result) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Linear MCP call failed';
      console.error(`[brain/linear] tools/call ${mcpName}:`, err);
      return { ok: false, error: message };
    }
  },
};
