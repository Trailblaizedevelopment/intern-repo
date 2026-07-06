import { SkillContext, getAnthropicTools, getSkill } from './skills';

/**
 * Trailblaize Brain agent loop — Anthropic Messages API with tool calling.
 * Same raw-fetch pattern as app/api/development/generate-spec/route.ts,
 * extended with a bounded tool-use loop.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOOL_ITERATIONS = 8;
const MAX_TOKENS = 2048;

// ── Anthropic message types (subset we use) ─────────────────────────────────

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

function buildSystemPrompt(employeeName: string | null): string {
  const now = new Date();
  const centralDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);

  return [
    `You are Trailblaize Brain, the engineering co-pilot for ${employeeName || 'Devin'} (founding engineer) inside the Trailblaize internal CRM.`,
    '',
    `Today is ${centralDate} (Central Time — company timezone).`,
    '',
    'You answer questions about the engineering ticket board (CRM tickets synced two-way with Linear). ' +
      'Use the provided tools to fetch real data — never invent ticket numbers, statuses, or due dates. ' +
      'If a tool returns no results, say so plainly.',
    '',
    'Guidelines:',
    '- "My tickets" means tickets assigned to the current user; pass assignee_me: true.',
    '- Ticket statuses: backlog, todo, open, in_progress, in_review, testing, done, canceled.',
    '- Reference tickets by their Linear identifier (e.g. TRA-238) when available, otherwise #number.',
    '- Keep answers concise and scannable. Use short markdown lists for multiple tickets; include status, due date, and priority when relevant.',
    '- You currently have read-only access. If asked to update tickets, create automations, or launch agents, explain that write skills ship in Phase 2.',
  ].join('\n');
}

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: string;
}

async function callAnthropic(
  apiKey: string,
  system: string,
  messages: BrainMessage[]
): Promise<AnthropicResponse> {
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
      tools: getAnthropicTools(),
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[brain] Anthropic API error:', response.status, errText);
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  return (await response.json()) as AnthropicResponse;
}

/** Truncate tool output so oversized results don't blow up the context window. */
function serializeToolOutput(result: unknown): string {
  const json = JSON.stringify(result);
  return json.length > 12000 ? `${json.slice(0, 12000)}…(truncated)` : json;
}

/**
 * Runs the agent loop: send history, execute any requested tools,
 * feed results back, repeat until the model produces a final text answer.
 */
export async function runBrainAgent(
  history: BrainMessage[],
  ctx: SkillContext,
  employeeName: string | null
): Promise<AgentRunResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const system = buildSystemPrompt(employeeName);
  const messages: BrainMessage[] = [...history];
  const toolEvents: ToolEvent[] = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await callAnthropic(apiKey, system, messages);

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const reply = response.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      return { reply: reply || 'Done.', messages, toolEvents };
    }

    const results: ToolResultBlock[] = [];
    for (const use of toolUses) {
      const skill = getSkill(use.name);
      if (!skill) {
        toolEvents.push({ name: use.name, input: use.input, ok: false, output: null, error: 'Unknown skill' });
        results.push({ type: 'tool_result', tool_use_id: use.id, content: 'Error: unknown tool', is_error: true });
        continue;
      }

      try {
        const result = await skill.execute(use.input || {}, ctx);
        toolEvents.push({
          name: use.name,
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
        const message = err instanceof Error ? err.message : 'Skill execution failed';
        console.error(`[brain] skill ${use.name} threw:`, err);
        toolEvents.push({ name: use.name, input: use.input, ok: false, output: null, error: message });
        results.push({ type: 'tool_result', tool_use_id: use.id, content: `Error: ${message}`, is_error: true });
      }
    }

    messages.push({ role: 'user', content: results });
  }

  return {
    reply: 'I hit the tool-call limit for a single message. Try narrowing the question.',
    messages,
    toolEvents,
  };
}

// ── Display transform (server → UI) ─────────────────────────────────────────

export interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  tools?: Array<{ name: string; ok: boolean }>;
}

/**
 * Collapses raw Anthropic history into renderable chat messages:
 * tool_use/tool_result plumbing becomes small "tools used" chips on the
 * assistant message that follows them.
 */
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

    // assistant
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
      display.push({ role: 'assistant', text, tools: pendingTools.length ? pendingTools : undefined });
      pendingTools = [];
    }
  }

  return display;
}
