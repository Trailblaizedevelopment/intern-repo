import { SupabaseClient } from '@supabase/supabase-js';

/** Shared runtime context passed to every connector on each agent run. */
export interface ConnectorContext {
  supabase: SupabaseClient;
  employeeId: string | null;
  /** Per-run MCP HTTP sessions (keyed by connector id). */
  mcpSessions: Map<string, unknown>;
}

export interface ConnectorTool {
  /** Globally unique tool name exposed to the LLM (e.g. linear_search_issues). */
  name: string;
  /** Original MCP tool name when proxied from a remote server. */
  mcpName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ConnectorCallResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/**
 * A Brain connector — either an in-process adapter (Supabase) or a remote HTTP MCP server.
 */
export interface BrainConnector {
  id: string;
  label: string;
  kind: 'in-process' | 'mcp-http';
  /** Whether this connector is available (env vars present, etc.). */
  isAvailable(): boolean;
  listTools(ctx: ConnectorContext): Promise<ConnectorTool[]>;
  callTool(toolName: string, input: Record<string, unknown>, ctx: ConnectorContext): Promise<ConnectorCallResult>;
}
