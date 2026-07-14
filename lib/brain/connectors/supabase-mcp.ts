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
 * Official Supabase remote MCP — dual databases for Brain.
 *
 * - supabase_web_*  → Trailblaize 1.0 consumer app (DEFAULT product DB)
 * - supabase_crm_*  → Growth Space internal CRM
 *
 * URL always includes read_only=true + project_ref + features=database.
 * Auth: SUPABASE_ACCESS_TOKEN (PAT). Optional Slack gate shared across both.
 */

const DEFAULT_BASE = 'https://mcp.supabase.com/mcp';

/** Hardcoded defaults — override with env if projects rotate. */
export const SUPABASE_DB_CATALOG = {
  web: {
    id: 'supabase_web' as const,
    key: 'trailblaize_web' as const,
    label: 'Trailblaize 1.0 (web app)',
    description:
      'Consumer GreekSpeed / Trailblaize production DB — profiles, spaces, alumni, announcements, messages, invitations, chapters branding, etc.',
    defaultProjectRef: 'ssqpfkiesxwnmphwyezb',
  },
  crm: {
    id: 'supabase_crm' as const,
    key: 'growth_space' as const,
    label: 'Growth Space (internal CRM)',
    description:
      'Internal CRM DB — employees, contacts, pipeline_deals, tickets, chapters (CS), outreach, brain_* tables.',
    defaultProjectRef: 'uoemlefauspgmmpeoilq',
  },
} as const;

export type SupabaseDbKey = (typeof SUPABASE_DB_CATALOG)[keyof typeof SUPABASE_DB_CATALOG]['key'];

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

/** Per-connector endpoint cache. */
const toolsCacheByConnector = new Map<
  string,
  { tools: ConnectorTool[]; expiresAt: number; endpoint: string }
>();

export function invalidateSupabaseMcpToolsCache(): void {
  toolsCacheByConnector.clear();
}

function getAccessToken(): string {
  return (process.env.SUPABASE_ACCESS_TOKEN || '').trim();
}

function getFeatures(): string {
  return (process.env.BRAIN_SUPABASE_MCP_FEATURES || 'database').trim() || 'database';
}

function projectRefFor(db: 'web' | 'crm'): string {
  if (db === 'web') {
    return (
      (process.env.BRAIN_SUPABASE_WEB_PROJECT_REF || '').trim() ||
      SUPABASE_DB_CATALOG.web.defaultProjectRef
    );
  }
  return (
    (process.env.BRAIN_SUPABASE_CRM_PROJECT_REF || '').trim() ||
    // Fall back to CRM URL used by the intern app, then hard default
    (() => {
      const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
      if (url) {
        try {
          const host = new URL(url).hostname;
          const ref = host.split('.')[0] || '';
          if (ref && ref !== 'supabase') return ref;
        } catch {
          /* ignore */
        }
      }
      return SUPABASE_DB_CATALOG.crm.defaultProjectRef;
    })()
  );
}

export function getSupabaseMcpEndpointFor(db: 'web' | 'crm'): string {
  const base = (process.env.SUPABASE_MCP_URL || DEFAULT_BASE).trim().replace(/\/$/, '');
  const projectRef = projectRefFor(db);
  const params = new URLSearchParams();
  params.set('read_only', 'true');
  if (projectRef) params.set('project_ref', projectRef);
  params.set('features', getFeatures());
  const join = base.includes('?') ? '&' : '?';
  return `${base}${join}${params.toString()}`;
}

/** @deprecated Use getSupabaseMcpEndpointFor('web') — web is the product default. */
export function getSupabaseMcpEndpoint(): string {
  return getSupabaseMcpEndpointFor('web');
}

/** @deprecated Prefer catalog; returns web project ref (product default). */
export function getSupabaseProjectRef(): string {
  return projectRefFor('web');
}

function getAuthHeader(): string {
  const token = getAccessToken();
  if (!token) return '';
  return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

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
  return Boolean(getAccessToken());
}

export function isSupabaseMcpAllowedForContext(ctx: ConnectorContext): boolean {
  if (!isSupabaseMcpConfigured()) return false;
  const allowed = getSupabaseMcpAllowedUserIds();
  if (allowed.size === 0) return true;
  if (ctx.surface !== 'slack') return true;
  const userId = (ctx.slackUserId || '').trim();
  return Boolean(userId && allowed.has(userId));
}

export function listSupabaseDbCatalog() {
  return [
    {
      key: SUPABASE_DB_CATALOG.web.key,
      connector_id: SUPABASE_DB_CATALOG.web.id,
      label: SUPABASE_DB_CATALOG.web.label,
      description: SUPABASE_DB_CATALOG.web.description,
      project_ref: projectRefFor('web'),
      tool_prefix: `${SUPABASE_DB_CATALOG.web.id}_`,
      is_default_product_db: true,
    },
    {
      key: SUPABASE_DB_CATALOG.crm.key,
      connector_id: SUPABASE_DB_CATALOG.crm.id,
      label: SUPABASE_DB_CATALOG.crm.label,
      description: SUPABASE_DB_CATALOG.crm.description,
      project_ref: projectRefFor('crm'),
      tool_prefix: `${SUPABASE_DB_CATALOG.crm.id}_`,
      is_default_product_db: false,
    },
  ];
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

function mapTools(
  connectorId: string,
  label: string,
  mcpTools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
): ConnectorTool[] {
  return mcpTools
    .filter(t => !TOOL_DENYLIST.has(t.name))
    .filter(t => {
      const n = t.name.toLowerCase();
      if (n.includes('apply_migration')) return false;
      if (n.startsWith('deploy_') || n.startsWith('create_') || n.startsWith('delete_')) return false;
      if (n.startsWith('update_') || n.startsWith('pause_') || n.startsWith('restore_')) return false;
      if (n.startsWith('merge_') || n.startsWith('reset_') || n.startsWith('rebase_')) return false;
      return true;
    })
    .map(t => ({
      name: prefixedToolName(connectorId, t.name),
      mcpName: t.name,
      description: `[${label} · Supabase MCP read-only] ${t.description || t.name}`,
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }));
}

function createSupabaseMcpConnector(opts: {
  db: 'web' | 'crm';
}): BrainConnector {
  const meta = SUPABASE_DB_CATALOG[opts.db];
  const connectorId = meta.id;
  const sessionKey = connectorId;

  function getClient(ctx: ConnectorContext): McpHttpClient {
    const existing = ctx.mcpSessions.get(sessionKey) as McpHttpClient | undefined;
    if (existing) return existing;
    const client = new McpHttpClient(getSupabaseMcpEndpointFor(opts.db), getAuthHeader);
    ctx.mcpSessions.set(sessionKey, client);
    return client;
  }

  function dropClient(ctx: ConnectorContext): void {
    const existing = ctx.mcpSessions.get(sessionKey) as McpHttpClient | undefined;
    existing?.reset();
    ctx.mcpSessions.delete(sessionKey);
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
      toolsCacheByConnector.delete(connectorId);
      const client = getClient(ctx);
      return client.callTool(mcpName, input);
    }
  }

  return {
    id: connectorId,
    label: `Supabase · ${meta.label}`,
    kind: 'mcp-http',

    isAvailable() {
      return Boolean(getAccessToken() && projectRefFor(opts.db));
    },

    async listTools(ctx) {
      if (!this.isAvailable() || !isSupabaseMcpAllowedForContext(ctx)) return [];

      const endpoint = getSupabaseMcpEndpointFor(opts.db);
      const cached = toolsCacheByConnector.get(connectorId);
      if (cached && cached.endpoint === endpoint && cached.expiresAt > Date.now()) {
        return cached.tools;
      }

      try {
        const client = getClient(ctx);
        const mcpTools = await client.listTools();
        const tools = mapTools(connectorId, meta.label, mcpTools);
        toolsCacheByConnector.set(connectorId, {
          tools,
          endpoint,
          expiresAt: Date.now() + TOOLS_CACHE_TTL_MS,
        });
        return tools;
      } catch (err) {
        if (isReconnectError(err)) {
          dropClient(ctx);
          toolsCacheByConnector.delete(connectorId);
          try {
            const client = getClient(ctx);
            const mcpTools = await client.listTools();
            const tools = mapTools(connectorId, meta.label, mcpTools);
            toolsCacheByConnector.set(connectorId, {
              tools,
              endpoint,
              expiresAt: Date.now() + TOOLS_CACHE_TTL_MS,
            });
            return tools;
          } catch (retryErr) {
            console.error(`[brain/${connectorId}] tools/list retry failed:`, retryErr);
            return [];
          }
        }
        console.error(`[brain/${connectorId}] tools/list failed:`, err);
        return [];
      }
    },

    async callTool(toolName, input, ctx): Promise<ConnectorCallResult> {
      if (!this.isAvailable()) {
        return {
          ok: false,
          error: `${meta.label} MCP not configured (need SUPABASE_ACCESS_TOKEN)`,
        };
      }
      if (!isSupabaseMcpAllowedForContext(ctx)) {
        return { ok: false, error: 'Supabase MCP not allowed for this Slack user' };
      }

      const mcpName = unprefixedToolName(connectorId, toolName);
      if (TOOL_DENYLIST.has(mcpName)) {
        return { ok: false, error: `Tool "${mcpName}" is blocked (read-only connector)` };
      }

      try {
        const result = await callMcpTool(ctx, mcpName, input);
        return { ok: true, data: mcpResultToData(result) };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Supabase MCP call failed';
        console.error(`[brain/${connectorId}] tools/call ${mcpName}:`, err);
        return { ok: false, error: message };
      }
    },
  };
}

export const supabaseWebMcpConnector = createSupabaseMcpConnector({ db: 'web' });
export const supabaseCrmMcpConnector = createSupabaseMcpConnector({ db: 'crm' });

/** @deprecated Use supabaseWebMcpConnector — kept for any stray imports. */
export const supabaseMcpConnector = supabaseWebMcpConnector;
