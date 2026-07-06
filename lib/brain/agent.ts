import {
  ConnectorContext,
  callConnectorTool,
  getAnthropicTools,
} from './router';

/**
 * Trailblaize Brain agent loop — Anthropic Messages API with tool calling.
 * Tools are routed through the MCP connector router (Linear).
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
/** Override via BRAIN_MODEL env. Must be a valid Anthropic model id with tool-use support. */
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const MAX_TOOL_ITERATIONS = parseInt(process.env.BRAIN_MAX_TOOL_ITERATIONS || '8', 10) || 8;
const MAX_TOKENS = 2048;

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface BrainMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolEvent {
  name: string;
  connector?: string;
  input: Record<string, unknown>;
  ok: boolean;
  output: unknown;
  error?: string;
}

export interface AgentRunResult {
  reply: string;
  messages: BrainMessage[];
  toolEvents: ToolEvent[];
}

function buildSystemPrompt(employeeName: string | null, toolNames: string[], linearWriteMode: boolean): string {
  const now = new Date();
  const centralDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const hasLinear = toolNames.some(n => n.startsWith('linear_'));

  const toolGuidance: string[] = [];
  if (hasLinear) {
    toolGuidance.push(
      '- Linear is the only source of truth for tickets and engineering work. Use linear_* tools exclusively — never invent ticket IDs or statuses.'
    );
    if (linearWriteMode) {
      toolGuidance.push(
        '- Write mode is ON. You may create or update Linear issues when asked. Confirm title, team, and priority before creating; use create_issue (or equivalent) with minimal required fields.'
      );
    } else {
      toolGuidance.push('- Linear write tools are disabled (read-only). Do not attempt creates or updates.');
    }
  }

  return [
    `You are Trailblaize Brain, the engineering co-pilot for ${employeeName || 'Devin'} (founding engineer) inside the Trailblaize internal CRM.`,
    '',
    `Today is ${centralDate} (Central Time — company timezone).`,
    '',
    'Answer questions about engineering work using connector tools only.',
    'If a tool returns no results, say so plainly.',
    '',
    'Tool routing:',
    ...toolGuidance,
    '- Reference tickets by Linear identifier (e.g. TRA-238) when available.',
    '- Keep answers concise. Use markdown lists for multiple items.',
  ].join('\n');
}

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: string;
}

function serializeToolOutput(result: unknown): string {
  const json = JSON.stringify(result);
  return json.length > 12000 ? `${json.slice(0, 12000)}…(truncated)` : json;
}

function createConnectorContext(
  supabase: ConnectorContext['supabase'],
  employeeId: string | null
): ConnectorContext {
  return { supabase, employeeId, mcpSessions: new Map() };
}

export async function runBrainAgent(
  history: BrainMessage[],
  baseCtx: Pick<ConnectorContext, 'supabase' | 'employeeId'>,
  employeeName: string | null
): Promise<AgentRunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const ctx = createConnectorContext(baseCtx.supabase, baseCtx.employeeId);
  const anthropicTools = await getAnthropicTools(ctx);
  if (anthropicTools.length === 0) {
    throw new Error('No connector tools available — check LINEAR_API_KEY and database connection');
  }

  const linearWriteMode = process.env.BRAIN_LINEAR_READ_ONLY === 'false';

  const system = buildSystemPrompt(
    employeeName,
    anthropicTools.map(t => t.name),
    linearWriteMode
  );
  const messages: BrainMessage[] = [...history];
  const toolEvents: ToolEvent[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.BRAIN_MODEL || DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools: anthropicTools,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[brain] Anthropic API error:', response.status, errText);
      let detail = `Anthropic API error: ${response.status}`;
      try {
        const parsed = JSON.parse(errText) as { error?: { message?: string } };
        if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        // use generic message
      }
      throw new Error(detail);
    }

    const data = (await response.json()) as AnthropicResponse;
    messages.push({ role: 'assistant', content: data.content });

    const toolUses = data.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const reply = data.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      return { reply: reply || 'Done.', messages, toolEvents };
    }

    const results: ToolResultBlock[] = [];
    for (const use of toolUses) {
      try {
        const result = await callConnectorTool(use.name, use.input || {}, ctx);
        toolEvents.push({
          name: use.name,
          connector: result.connectorId,
          input: use.input,
          ok: result.ok,
          output: result.ok ? result.data : null,
          error: result.error,
        });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: result.ok ? serializeToolOutput(result.data) : `Error: ${result.error}`,
          is_error: !result.ok,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connector call failed';
        console.error(`[brain] tool ${use.name} threw:`, err);
        toolEvents.push({
          name: use.name,
          input: use.input,
          ok: false,
          output: null,
          error: message,
        });
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: `Error: ${message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: results });
  }

  return {
    reply: `I hit the limit of ${MAX_TOOL_ITERATIONS} tool-call rounds for this message. Try a narrower question or split the task into steps (e.g. "list due tickets" then "rank by priority").`,
    messages,
    toolEvents,
  };
}

export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  tools?: Array<{ name: string; connector?: string; ok: boolean }>;
}

export function toDisplayMessages(messages: BrainMessage[]): DisplayMessage[] {
  const display: DisplayMessage[] = [];
  let pendingTools: Array<{ name: string; ok: boolean }> = [];

  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      if (msg.content.trim()) display.push({ role: msg.role, text: msg.content });
      continue;
    }

    if (msg.role === 'user') {
      for (const block of msg.content) {
        if (block.type === 'text' && block.text.trim()) {
          display.push({ role: 'user', text: block.text });
        } else if (block.type === 'tool_result') {
          const last = pendingTools[pendingTools.length - 1];
          if (last) last.ok = !block.is_error;
        }
      }
      continue;
    }

    const text = msg.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    const uses = msg.content.filter(b => b.type === 'tool_use') as Array<{ name: string }>;

    if (uses.length > 0) {
      pendingTools.push(...uses.map(u => ({ name: u.name, ok: true })));
    }
    if (text) {
      display.push({
        role: 'assistant',
        text,
        tools: pendingTools.length
          ? pendingTools.map(t => ({
              name: t.name,
              connector: t.name.split('_')[0],
              ok: t.ok,
            }))
          : undefined,
      });
      pendingTools = [];
    }
  }

  return display;
}
