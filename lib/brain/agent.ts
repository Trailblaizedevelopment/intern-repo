import {
  ConnectorContext,
  callConnectorTool,
  getAnthropicTools,
} from './router';
import {
  extractUserMessagePreview,
  finalizeAgentRun,
  resolveAgentRunSurface,
  startAgentRun,
} from './agent-runs';
import { buildIntentRoutingPrompt } from './intent-routing';

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

export interface AgentRunOptions {
  surface?: 'workspace' | 'slack';
  systemAppend?: string;
  maxIterations?: number;
  taskId?: string | null;
  conversationId?: string | null;
  slackChannel?: string | null;
  slackThreadTs?: string | null;
  slackUserId?: string | null;
}

function buildSystemPrompt(
  employeeName: string | null,
  toolNames: string[],
  linearWriteMode: boolean,
  surface: 'workspace' | 'slack' = 'workspace',
  systemAppend?: string
): string {
  const now = new Date();
  const centralDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const hasLinear = toolNames.some(n => n.startsWith('linear_'));
  const hasGitHub = toolNames.some(n => n.startsWith('github_'));
  const hasCursor = toolNames.some(n => n.startsWith('cursor_'));
  const hasTasks = toolNames.some(n => n.startsWith('tasks_'));
  const hasTickets = toolNames.some(n => n.startsWith('tickets_'));

  const toolGuidance: string[] = [];
  if (hasGitHub) {
    toolGuidance.push(
      '- GitHub (Trailblaize-Web) questions use github_* tools ONLY — never Linear for PRs, commits, or code.',
      '- Default branch for eng work: develop. Use main only when the user asks about production, releases, or main.',
      '- Open PRs → github_list_open_prs. Merged PRs → github_list_merged_prs (base=develop or base=main).',
      '- Commit history → github_list_commits with branch=develop unless production is specified.',
      '- Keyword in commits → github_search_commits. Codebase paths → github_search_code + github_get_file.',
      '- Read-only. Answer in 1–3 sentences plus SHAs, paths, or PR links; no large dumps unless asked.'
    );
  }
  if (hasLinear) {
    toolGuidance.push(
      '- Linear is the source of truth for tickets and engineering work status. Use linear_* for issues — never invent ticket IDs.',
      '- Do NOT use Linear for GitHub PRs or repository file search.'
    );
    if (linearWriteMode) {
      toolGuidance.push(
        '- Write mode is ON. You may create or update Linear issues when asked. Confirm title, team, and priority before creating; use create_issue (or equivalent) with minimal required fields.'
      );
    } else {
      toolGuidance.push('- Linear write tools are disabled (read-only). Do not attempt creates or updates.');
    }
  }
  if (hasTickets) {
    toolGuidance.push(
      '- tickets_* reads the CRM Supabase ticket cache (board snapshot, assignee filters). Prefer linear_* for live Linear workflow state.'
    );
  }
  if (hasCursor) {
    toolGuidance.push(
      '- cursor_dispatch_agent pauses for Slack approval (awaiting_approval) — user must reply yes dispatch. Never pass approved=true yourself.',
      '- Use cursor_dispatch_agent for implementation inside an active Slice or Goal task. Do not dispatch from Lookup mode.',
      '- PRs target the task integration feature branch (feature/TRA-xxx-...) — NEVER develop or main.',
      '- Integration branch is created from develop automatically. Humans merge feature → develop after review.',
      '- Goal tasks: follow_up=true allowed after cursor PR merges into integration branch. Slice tasks: one dispatch only.',
      '- Runner polls Cursor and PR merge into integration branch automatically.'
    );
  }
  if (hasTasks) {
    toolGuidance.push(
      '- tasks_start_slice / tasks_start_goal from Slack chat: queue on the FIRST tool call. Never research before queueing.',
      '- tasks_start_slice: focused one-PR work (~15 min). Use for fixes and small changes — NOT for questions.',
      '- tasks_start_goal: multi-step background work (e.g. "work on this for an hour"). NOT for quick lookups or single-file fixes.',
      '- During an active task iteration, call tasks_complete when done, tasks_block if you need human input, or cursor_dispatch_agent for code changes.',
      '- tasks_list_active / tasks_get_status: answer status questions without starting new work.'
    );
  }

  const lines = [
    `You are Trailblaize Brain, the engineering co-pilot for ${employeeName || 'Devin'} (founding engineer) inside the Trailblaize internal CRM.`,
    '',
    `Today is ${centralDate} (Central Time — company timezone).`,
    '',
    buildIntentRoutingPrompt(surface),
    '',
    'Answer questions about engineering work using connector tools only.',
    'If a tool returns no results, say so plainly.',
    '',
    'Tool routing:',
    ...toolGuidance,
    '- Reference tickets by Linear identifier (e.g. TRA-238) when available.',
    '- CRM cached tickets: tickets_* tools. Linear live issues: linear_* tools. Do not mix sources for the same question.',
    surface === 'slack'
      ? '- You are replying in Slack. Be concise. Use Slack mrkdwn (*bold*, • bullets). No emojis.'
      : '- Keep answers concise. Use markdown lists for multiple items.',
  ];

  if (systemAppend) lines.push('', systemAppend);
  return lines.join('\n');
}

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

function serializeToolOutput(result: unknown): string {
  const json = JSON.stringify(result);
  return json.length > 12000 ? `${json.slice(0, 12000)}…(truncated)` : json;
}

function createConnectorContext(
  supabase: ConnectorContext['supabase'],
  employeeId: string | null,
  options: AgentRunOptions = {}
): ConnectorContext {
  return {
    supabase,
    employeeId,
    mcpSessions: new Map(),
    taskId: options.taskId ?? null,
    conversationId: options.conversationId ?? null,
    surface: options.surface ?? 'workspace',
    slackChannel: options.slackChannel ?? null,
    slackThreadTs: options.slackThreadTs ?? null,
  };
}

export async function runBrainAgent(
  history: BrainMessage[],
  baseCtx: Pick<ConnectorContext, 'supabase' | 'employeeId'>,
  employeeName: string | null,
  options: AgentRunOptions | 'workspace' | 'slack' = 'workspace'
): Promise<AgentRunResult> {
  const opts: AgentRunOptions =
    typeof options === 'string' ? { surface: options } : options;
  const surface = opts.surface ?? 'workspace';
  const maxIterations = opts.maxIterations ?? MAX_TOOL_ITERATIONS;
  const model = process.env.BRAIN_MODEL || DEFAULT_MODEL;
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let apiIterations = 0;

  const runSurface = resolveAgentRunSurface({ surface, taskId: opts.taskId });
  const runId = await startAgentRun(baseCtx.supabase, {
    employeeId: baseCtx.employeeId,
    surface: runSurface,
    conversationId: opts.conversationId,
    taskId: opts.taskId,
    slackChannel: opts.slackChannel,
    slackThreadTs: opts.slackThreadTs,
    slackUserId: opts.slackUserId,
    model,
    userMessagePreview: extractUserMessagePreview(history),
  });

  const finishRun = async (
    status: 'success' | 'failed',
    reply: string,
    toolEvents: ToolEvent[],
    error?: string
  ): Promise<AgentRunResult> => {
    await finalizeAgentRun(baseCtx.supabase, runId, {
      status,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      toolCallCount: toolEvents.length,
      iterationCount: apiIterations,
      replyPreview: reply,
      error,
    });
    return { reply, messages, toolEvents };
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const msg = 'ANTHROPIC_API_KEY not configured';
    await finalizeAgentRun(baseCtx.supabase, runId, {
      status: 'failed',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      toolCallCount: 0,
      iterationCount: 0,
      error: msg,
    });
    throw new Error(msg);
  }

  const ctx = createConnectorContext(baseCtx.supabase, baseCtx.employeeId, opts);
  const anthropicTools = await getAnthropicTools(ctx);
  if (anthropicTools.length === 0) {
    const msg =
      'No connector tools available — check LINEAR_API_KEY, GITHUB_TOKEN, and database connection';
    await finalizeAgentRun(baseCtx.supabase, runId, {
      status: 'failed',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      toolCallCount: 0,
      iterationCount: 0,
      error: msg,
    });
    throw new Error(msg);
  }

  const linearWriteMode = process.env.BRAIN_LINEAR_READ_ONLY === 'false';

  const system = buildSystemPrompt(
    employeeName,
    anthropicTools.map(t => t.name),
    linearWriteMode,
    surface,
    opts.systemAppend
  );
  const messages: BrainMessage[] = [...history];
  const toolEvents: ToolEvent[] = [];

  try {
    for (let i = 0; i < maxIterations; i++) {
      apiIterations += 1;
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
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
      inputTokens += data.usage?.input_tokens ?? 0;
      outputTokens += data.usage?.output_tokens ?? 0;
      messages.push({ role: 'assistant', content: data.content });

      const toolUses = data.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
      if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const reply = data.content
          .filter((b): b is TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();
        return finishRun('success', reply || 'Done.', toolEvents);
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

    const reply = `I hit the limit of ${maxIterations} tool-call rounds for this message. Try a narrower question or split the task into steps (e.g. "list due tickets" then "rank by priority").`;
    return finishRun('success', reply, toolEvents);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Agent run failed';
    await finalizeAgentRun(baseCtx.supabase, runId, {
      status: 'failed',
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
      toolCallCount: toolEvents.length,
      iterationCount: apiIterations,
      error: msg,
    });
    throw err;
  }
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
