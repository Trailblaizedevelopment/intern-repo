import {
  McpHttpClient,
  prefixedToolName,
  unprefixedToolName,
} from '../mcp/http-client';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

/**
 * Official Supabase remote MCP — Cursor-like schema/SQL depth for Brain.
 *
 * Defaults (hardcoded into URL):
 * - read_only=true
 * - project_ref scoped
 * - features=database (no branching / edge deploy / account tools)
 *
 * Auth: SUPABASE_ACCESS_TOKEN (personal access token) — not the service role key.
 * Optional Slack gate: BRAIN_SUPABASE_MCP_ALLOWED_USER_IDS
 */

const CONNECTOR_ID = 'supabase_mcp';
const DEFAULT_BASE = 'https://mcp.supabase.com/mcp';

/** Block anything that can mutate schema/data even if the remote list drifts. */
const TOOL_DENYLIST = new Set([
  'apply_migration',
  'deploy_edge_function',
  'create_branch',
  'delete_branch',
  'merge_branch',
  'reset_branch',
  'rebase_branch',
  'create_project',
  'pause_project',
  'restore_project',
  'update_storage_config',
]);

const TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;

let toolsCache: { tools: ConnectorTool[]; expiresAt: number; endpoint: string } | null = null;

export function invalidateSupabaseMcpToolsCache(): void {
  toolsCache = null;
}

function getAccessToken(): string {
  return (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
}

/** Prefer explicit ref; else parse from NEXT_PUBLIC_SUPABASE_URL. */
export function getSupabaseProjectRef(): string {
  const explicit = (process.env.SUPABASE_PROJECT_REF || process.env.BRAIN_SUPABASE_PROJECT_REF || '').trim();
  if (explicit) return explicit;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!url) return '';
  try {
    const host = new URL(url).hostname; // e.g. uoemlefauspgmmpeoilq.supabase.co
    const ref = host.split('.')[0] || '';
    return ref && ref !== 'supabase' ? ref : '';
  } catch {
    return '';
  }
}

function getFeatures(): string {
  return (process.env.BRAIN_SUPABASE_MCP_FEATURES || 'database').trim() || 'database';
}

/** Built URL with safety query params. */
export function getSupabaseMcpEndpoint(): string {
  const base = (process.env.SUPABASE_MCP_URL || DEFAULT_BASE).trim().replace(/\/$/, '');
  const projectRef = getSupabaseProjectRef();
  const params = new URLSearchParams();
  params.set('read_only', 'true');
  if (projectRef) params.set('project_ref', projectRef);
  params.set('features', getFeatures());

  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}${params.toString()}`;
}

function getAuthHeader(): string {
  const token = getAccessToken();
  if (!token) return '';
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

/** Comma-separated Slack user IDs. Empty = no extra Slack user gate. */
export function getSupabaseMcpAllowedUserIds(): Set<string> {
  const raw = (process.env.BRAIN_SUPABASE_MCP_ALLOWED_USER_IDS || '').trim();
  return new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
}

export function isSupabaseMcpConfigured(): boolean {
  return Boolean(getAccessToken() && getSupabaseProjectRef());
}

/**
 * When BRAIN_SUPABASE_MCP_ALLOWED_USER_IDS is set and surface is Slack,
 * only listed users get tools. Workspace / tasks skip this gate.
 */
export function isSupabaseMcpAllowedForContext(ctx: ConnectorContext): boolean {
  if (!isSupabaseMcpConfigured()) return false;
  const allowed = getSupabaseMcpAllowedUserIds();
  if (allowed.size === 0) return true;
  if (ctx.surface !== 'slack') return true;
  const userId = (ctx.slackUserId || '').trim();
  return Boolean(userId && allowed.has(userId));
}

function getClient(ctx: ConnectorContext): McpHttpClient {
  const existing = ctx.mcpSessions.get(CONNECTOR_ID) as McpHttpClient | undefined;
  if (existing) return existing;

  const client = new McpHttpClient(getSupabaseMcpEndpoint(), getAuthHeader);
  ctx.mcpSessions.set(CONNECTOR_ID, client);
  return client;
}

function dropClient(ctx: ConnectorContext): void {
  const existing = ctx.mcpSessions.get(CONNECTOR_ID) as McpHttpClient | undefined;
  existing?.reset();
  ctx.mcpSessions.delete(CONNECTOR_ID);
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

function isReconnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /MCP HTTP (401|404|410|502|503)/.test(msg) || /session/i.test(msg);
}

function mapTools(mcpTools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>): ConnectorTool[] {
  return mcpTools
    .filter(t => !TOOL_DENYLIST.has(t.name))
    .filter(t => {
      // Defense in depth: never expose obvious write tooling
      const n = t.name.toLowerCase();
      if (n.includes('apply_migration')) return false;
      if (n.startsWith('deploy_') || n.startsWith('create_') || n.startsWith('delete_')) return false;
      if (n.startsWith('update_') || n.startsWith('pause_') || n.startsWith('restore_')) return false;
      if (n.startsWith('merge_') || n.startsWith('reset_') || n.startsWith('rebase_')) return false;
      return true;
    })
    .map(t => ({
      name: prefixedToolName(CONNECTOR_ID, t.name),
      mcpName: t.name,
      description: `[Supabase MCP read-only] ${t.description || t.name}`,
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }));
}

async function callMcpTool(
  ctx: ConnectorContext,
  mcpName: string,
  input: Record<string, unknown>
): Promise<unknown> {
  try {
    const client = getClient(ctx);
    return await client.callTool(mcpName, input);
  } catch (err) {
    if (!isReconnectError(err)) throw err;
    dropClient(ctx);
    invalidateSupabaseMcpToolsCache();
    const client = getClient(ctx);
    return client.callTool(mcpName, input);
  }
}

export const supabaseMcpConnector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'Supabase (remote MCP, read-only)',
  kind: 'mcp-http',

  isAvailable() {
    return isSupabaseMcpConfigured();
  },

  async listTools(ctx) {
    if (!this.isAvailable() || !isSupabaseMcpAllowedForContext(ctx)) return [];

    const endpoint = getSupabaseMcpEndpoint();
    if (toolsCache && toolsCache.endpoint === endpoint && toolsCache.expiresAt > Date.now()) {
      return toolsCache.tools;
    }

    try {
      const client = getClient(ctx);
      const mcpTools = await client.listTools();
      const tools = mapTools(mcpTools);
      toolsCache = { tools, endpoint, expiresAt: Date.now() + TOOLS_CACHE_TTL_MS };
      return tools;
    } catch (err) {
      if (isReconnectError(err)) {
        dropClient(ctx);
        invalidateSupabaseMcpToolsCache();
        try {
          const client = getClient(ctx);
          const mcpTools = await client.listTools();
          const tools = mapTools(mcpTools);
          toolsCache = { tools, endpoint, expiresAt: Date.now() + TOOLS_CACHE_TTL_MS };
          return tools;
        } catch (retryErr) {
          console.error('[brain/supabase_mcp] tools/list retry failed:', retryErr);
          return [];
        }
      }
      console.error('[brain/supabase_mcp] tools/list failed:', err);
      return [];
    }
  },

  async callTool(toolName, input, ctx): Promise<ConnectorCallResult> {
    if (!this.isAvailable()) {
      return {
        ok: false,
        error: 'Supabase MCP not configured (need SUPABASE_ACCESS_TOKEN + project ref)',
      };
    }
    if (!isSupabaseMcpAllowedForContext(ctx)) {
      return { ok: false, error: 'Supabase MCP not allowed for this Slack user' };
    }

    const mcpName = unprefixedToolName(CONNECTOR_ID, toolName);
    if (TOOL_DENYLIST.has(mcpName)) {
      return { ok: false, error: `Supabase MCP tool "${mcpName}" is blocked (read-only connector)` };
    }

    try {
      const result = await callMcpTool(ctx, mcpName, input);
      return { ok: true, data: mcpResultToData(result) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Supabase MCP call failed';
      console.error(`[brain/supabase_mcp] tools/call ${mcpName}:`, err);
      return { ok: false, error: message };
    }
  },
};
