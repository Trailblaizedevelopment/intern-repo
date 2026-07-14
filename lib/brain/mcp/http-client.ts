/**
 * Minimal MCP Streamable HTTP client for Vercel serverless.
 * Speaks JSON-RPC 2.0 to remote MCP endpoints (e.g. Linear at mcp.linear.app).
 *
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
 */

const MCP_PROTOCOL_VERSION = '2024-11-05';
const CLIENT_INFO = { name: 'trailblaize-brain', version: '1.0.0' };

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

let requestId = 0;

function nextId(): number {
  requestId += 1;
  return requestId;
}

/** Parse SSE body into JSON-RPC response objects. */
function parseSseJsonRpc(body: string): JsonRpcResponse[] {
  const results: JsonRpcResponse[] = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const parsed = JSON.parse(payload) as JsonRpcResponse;
      if (parsed.jsonrpc === '2.0') results.push(parsed);
    } catch {
      // skip malformed SSE chunks
    }
  }
  return results;
}

export class McpHttpClient {
  private sessionId: string | null = null;
  private initialized = false;

  constructor(
    private readonly endpoint: string,
    private readonly getAuthHeader: () => string
  ) {}

  /** Drop MCP session state so the next call re-initializes. */
  reset(): void {
    this.sessionId = null;
    this.initialized = false;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private shouldReconnect(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      /MCP HTTP (401|404|410|502|503)/.test(msg) ||
      /session/i.test(msg) ||
      /empty body/i.test(msg) ||
      /SSE stream returned no/i.test(msg)
    );
  }

  private buildHeaders(): Record<string, string> {
    const auth = this.getAuthHeader();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (auth) headers.Authorization = auth;
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    return headers;
  }

  private async post(message: Record<string, unknown>, retried = false): Promise<JsonRpcResponse> {
    try {
      return await this.postOnce(message);
    } catch (err) {
      if (!retried && this.shouldReconnect(err)) {
        this.reset();
        return this.post(message, true);
      }
      throw err;
    }
  }

  private async postOnce(message: Record<string, unknown>): Promise<JsonRpcResponse> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(30_000),
    });

    const newSession = res.headers.get('mcp-session-id');
    if (newSession) this.sessionId = newSession;

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    const isNotification = message.id === undefined;

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    // MCP notifications (e.g. notifications/initialized) often return 202 with no body
    if (!text.trim()) {
      if (isNotification || res.status === 202) {
        return { jsonrpc: '2.0', result: {} };
      }
      throw new Error('MCP HTTP returned empty body');
    }

    // Linear MCP returns SSE even for single JSON-RPC responses
    if (contentType.includes('text/event-stream') || text.startsWith('event:')) {
      const messages = parseSseJsonRpc(text);
      if (message.id !== undefined) {
        const withId = messages.find(m => m.id === message.id);
        if (withId) return withId;
      }
      const last = messages[messages.length - 1];
      if (last) return last;
      throw new Error('MCP SSE stream returned no JSON-RPC response');
    }

    try {
      return JSON.parse(text) as JsonRpcResponse;
    } catch {
      throw new Error(`MCP invalid JSON response: ${text.slice(0, 200)}`);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const response = await this.post({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    });

    if (response.error) {
      throw new Error(`MCP initialize failed: ${response.error.message}`);
    }

    // Required notification after successful initialize
    await this.post({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    this.initialized = true;
  }

  async listTools(): Promise<McpToolDef[]> {
    await this.initialize();

    const response = await this.post({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/list',
      params: {},
    });

    if (response.error) {
      throw new Error(`MCP tools/list failed: ${response.error.message}`);
    }

    const result = response.result as { tools?: McpToolDef[] } | undefined;
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.initialize();

    const response = await this.post({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'tools/call',
      params: { name, arguments: args },
    });

    if (response.error) {
      throw new Error(`MCP tools/call failed: ${response.error.message}`);
    }

    return response.result;
  }
}

/** Prefix connector id to MCP tool name for global uniqueness in the router. */
export function prefixedToolName(connectorId: string, mcpToolName: string): string {
  const safe = mcpToolName.replace(/[^a-zA-Z0-9_]/g, '_');
  return `${connectorId}_${safe}`.slice(0, 64);
}

/** Strip connector prefix to recover the original MCP tool name. */
export function unprefixedToolName(connectorId: string, prefixed: string): string {
  const prefix = `${connectorId}_`;
  if (!prefixed.startsWith(prefix)) return prefixed;
  return prefixed.slice(prefix.length);
}

/**
 * When BRAIN_LINEAR_READ_ONLY is true (default), only expose tools whose names
 * look read-only. Write tools ship when explicitly disabled.
 */
export function isReadOnlyMcpTool(toolName: string): boolean {
  return !isWriteMcpTool(toolName);
}

export function isWriteMcpTool(toolName: string): boolean {
  const n = toolName.toLowerCase();
  if (n.startsWith('save_') || n.includes('_save_')) return true;
  const writePatterns = ['create', 'update', 'delete', 'remove', 'assign', 'archive', 'move'];
  return writePatterns.some(p => n.includes(p));
}
