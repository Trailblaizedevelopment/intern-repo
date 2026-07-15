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
import { buildLinearTicketTemplateGuidance } from './linear-ticket-template';

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
  const hasSupabaseWeb = toolNames.some(n => n.startsWith('supabase_web_'));
  const hasSupabaseCrm = toolNames.some(n => n.startsWith('supabase_crm_'));
  const hasSupabaseMcp = hasSupabaseWeb || hasSupabaseCrm;

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
        '- Write mode is ON. Create/update Linear issues with linear_save_issue (not create_issue).',
        '- When the user asks to create/file/open/build a ticket or add to the roadmap: FIRST tool call linear_save_issue with title (Verb + what + where), team Trailblaize (or TRA), and description markdown per the LINEAR TICKET FORMAT block.',
        buildLinearTicketTemplateGuidance(),
        '- Do not call github_*, tickets_*, or linear list/search tools before creating unless they asked to check for duplicates.',
        '- Ask at most one clarifying question only if a title + acceptance criteria cannot be inferred. After create, reply with the TRA identifier and URL.'
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
  if (hasSupabaseMcp) {
    toolGuidance.push(
      '- Dual Supabase MCP (read-only):',
      '  • supabase_web_* → Trailblaize 1.0 web app DB (profiles, spaces, alumni, announcements, messages, invitations, …). Product default.',
      '  • supabase_crm_* → Growth Space internal CRM (employees, contacts, pipeline_deals, tickets, CS chapters, outreach, brain_*, …).',
      '- CRITICAL — database selection before any Supabase tool call:',
      '  1. If the user has not clearly chosen a database in this thread, STOP. Do not call supabase_web_* or supabase_crm_* yet.',
      '  2. Ask exactly: "Which database should I use — *Trailblaize 1.0* (web app) or *Growth Space* (internal CRM)?"',
      '  3. After they answer, use that DB for the rest of the thread unless they switch.',
      '- Clear signals (no need to re-ask): "web app" / "Trailblaize 1.0" / "profiles" / "alumni" / "spaces" → supabase_web_*.',
      '  "CRM" / "Growth Space" / "pipeline" / "contacts" / "tickets table" / internal employees → supabase_crm_*.',
      '- Prefer list_tables before execute_sql. SELECTs with LIMIT only; never DDL/DML.',
      '- Do NOT use Supabase MCP for Linear/GitHub workflow — use linear_* / tickets_* / github_*.'
    );
  }
  if (hasCursor) {
    toolGuidance.push(
      '- TRA-900: Do NOT call cursor_dispatch_agent from Slack Lookup. Ticket implement = Slack confirm → Linear assign Cursor (outside this agent loop).',
      '- cursor_dispatch_agent remains only for legacy Slice/Goal runners if BRAIN_SLICE_GOAL_ENABLED=true. Never pass approved=true yourself.'
    );
  }
  if (hasTasks) {
    toolGuidance.push(
      '- TRA-900: Slice/Goal are frozen. Do NOT call tasks_start_slice or tasks_start_goal from Slack.',
      '- For "fix/implement TRA-xxx": the Slack handler asks to assign Cursor on Linear — do not invent a task queue.',
      '- tasks_list_active / tasks_get_status: answer status questions for any legacy tasks without starting new work.'
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
    '- CRM cached tickets: tickets_* tools. Linear live issues: linear_* tools. Database schema/SQL: supabase_web_* (Trailblaize 1.0) or supabase_crm_* (Growth Space) — ask which DB if unclear.',
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
    slackUserId: options.slackUserId ?? null,
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
