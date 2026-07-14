import { BrainMessage, AgentRunResult } from '../agent';
import { SLICE_DEFAULT_MAX_MINUTES } from '../intent-routing';
import { buildLinearTicketTemplateGuidance } from '../linear-ticket-template';
import { createBrainTask } from '../tasks/store';
import { BrainTaskKind } from '../tasks/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { postSlackMessage } from './client';
import { findActiveTasksForSlackThread } from './task-control';

export interface SlackOrchestrationContext {
  channel: string;
  threadTs: string;
}

const LOOKUP_ONLY =
  /\b(mode lookup|lookup only|summarize only|do not start|don't start|no background|status only|what is|what's the status)\b/i;
const QUESTION_ONLY = /\b(how would we|how do we|how should we|what would|explain how|can you explain)\b/i;
const SLICE_SIGNALS =
  /\b(slice|implement|fix|build|add|dispatch cursor|one pr|queue slice|tasks_start_slice|anti-burst)\b/i;
const GOAL_SIGNALS =
  /\b(goal|work on .+ for (an hour|\d+\s*(min|minutes|hour|hours))|keep iterating|tasks_start_goal)\b/i;

/** File / create a Linear ticket — Lookup write, never Slice/Goal. */
const LINEAR_TICKET_CREATE =
  /\b((i\s+need\s+to|please|can\s+you|help\s+me|want\s+to)\s+)?(create|file|open|draft|build)\b.{0,80}\b(a\s+)?(ticket|linear\s+issue|roadmap\s+item)\b|\badd\s+(this\s+)?to\s+the\s+roadmap\b|\b(create|file|open)\s+(a\s+)?TRA\b/i;

function messageText(msg: BrainMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join('\n');
}

/**
 * True when the user wants Dynamo to create/file a Linear ticket (not implement code).
 * Examples: "create a ticket for…", "build a ticket for the governance persona", "add to the roadmap".
 */
export function isLinearTicketCreateIntent(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  return LINEAR_TICKET_CREATE.test(text);
}

/** Detect Slice vs Goal kickoff from user message (not Lookup). */
export function detectOrchestrationKickoff(message: string): BrainTaskKind | null {
  const text = message.trim();
  if (!text || LOOKUP_ONLY.test(text) || QUESTION_ONLY.test(text)) return null;

  // Creating/filing a Linear ticket must stay in the Lookup chat path (TRA-896 / TRA-897).
  if (isLinearTicketCreateIntent(text)) return null;

  const lower = text.toLowerCase();
  if (/^(yes dispatch|yes|approve|cancel|stop|dispatch it)\b/.test(lower)) return null;

  const sliceHint = SLICE_SIGNALS.test(text) || /\bper the linear ticket\b/i.test(text);
  const goalHint = GOAL_SIGNALS.test(text);

  if (goalHint && !/\b(one pr|slice|dispatch cursor once)\b/i.test(text)) return 'goal';
  if (sliceHint) return 'slice';
  return null;
}

/** Pull TRA-xxx from message or recent thread history. */
export function extractLinearIssueId(message: string, history: BrainMessage[]): string | null {
  const fromMessage = message.match(/TRA-\d+/i)?.[0]?.toUpperCase();
  if (fromMessage) return fromMessage;

  for (let i = history.length - 1; i >= 0; i--) {
    const match = messageText(history[i]).match(/TRA-\d+/i);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

function threadHasLookupContext(history: BrainMessage[]): boolean {
  return history.some(msg => {
    const text = messageText(msg);
    return /\bMode: Lookup\b/i.test(text) || /\bAcceptance Criteria\b/i.test(text);
  });
}

function buildKickoffReply(
  kind: BrainTaskKind,
  taskId: string,
  linearId: string | null,
  hadLookup: boolean
): string {
  const label = kind === 'slice' ? 'Slice' : 'Goal';
  return [
    `*Mode: ${label}*`,
    '',
    `*${label} queued* — background runner will research, then request Cursor dispatch in this thread.`,
    linearId ? `Linear: \`${linearId}\`` : null,
    `Task: \`${taskId.slice(0, 8)}…\``,
    kind === 'slice' ? '_One Cursor dispatch max. Reply *yes dispatch* when prompted._' : null,
    hadLookup ? '_Reusing Lookup context from this thread — no duplicate research in chat._' : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface OrchestrationKickoffInput {
  message: string;
  history: BrainMessage[];
  ctx: SlackOrchestrationContext;
  supabase: SupabaseClient;
  employeeId: string | null;
  conversationId: string | null;
}

/**
 * Queue Slice/Goal immediately without burning chat tool rounds on research.
 * Returns null when the message should go through the normal agent loop.
 */
export async function tryOrchestrationKickoff(
  input: OrchestrationKickoffInput
): Promise<AgentRunResult | null> {
  const kind = detectOrchestrationKickoff(input.message);
  if (!kind) return null;

  const existingActive = await findActiveTasksForSlackThread(
    input.supabase,
    input.ctx.channel,
    input.ctx.threadTs
  );
  if (existingActive.length > 0) {
    const ids = existingActive.map(t => `\`${t.id.slice(0, 8)}…\` (${t.status})`).join(', ');
    const reply = [
      `*Active task already running in this thread* — not starting a duplicate.`,
      `Task(s): ${ids}`,
      'Reply *stop* to cancel, or wait for Cursor approval / completion.',
    ].join('\n');
    return {
      reply,
      messages: [
        ...input.history,
        { role: 'user', content: input.message },
        { role: 'assistant', content: reply },
      ],
      toolEvents: [],
    };
  }

  const linearId = extractLinearIssueId(input.message, input.history);
  const hadLookup = threadHasLookupContext(input.history);

  let goal = input.message.trim();
  if (hadLookup && !input.message.match(/TRA-\d+/i)) {
    goal = `${goal}\n\n(Context: prior messages in this thread contain Lookup research — reuse that; do not re-research from scratch.)`;
  }

  const task = await createBrainTask(input.supabase, {
    goal,
    taskKind: kind,
    linearIssueId: linearId,
    employeeId: input.employeeId,
    source: 'slack',
    conversationId: input.conversationId,
    slackChannel: input.ctx.channel,
    slackThreadTs: input.ctx.threadTs,
  });

  const maxMinutes = kind === 'slice' ? SLICE_DEFAULT_MAX_MINUTES : 60;
  const label = kind === 'slice' ? 'Slice queued' : 'Goal queued';
  await postSlackMessage(
    input.ctx.channel,
    [
      `*${label}* (${maxMinutes} min)`,
      linearId ? `Linear: \`${linearId}\`` : null,
      task.goal.slice(0, 200),
      `Branch: \`${task.integration_branch}\``,
      kind === 'slice' ? '_One Cursor dispatch max._' : null,
    ]
      .filter(Boolean)
      .join('\n'),
    input.ctx.threadTs
  );

  const reply = buildKickoffReply(kind, task.id, linearId, hadLookup);
  const userMsg: BrainMessage = { role: 'user', content: input.message };
  const assistantMsg: BrainMessage = { role: 'assistant', content: reply };

  return {
    reply,
    messages: [...input.history, userMsg, assistantMsg],
    toolEvents: [
      {
        name: kind === 'slice' ? 'tasks_start_slice' : 'tasks_start_goal',
        connector: 'tasks',
        input: { goal, linear_issue_id: linearId, task_kind: kind, fast_path: true },
        ok: true,
        output: { task_id: task.id, status: task.status, plan: task.plan },
      },
    ],
  };
}

/** Create-first Linear ticket instructions for Slack Lookup (TRA-896). */
function buildSlackTicketCreateAppend(): string {
  return [
    'SLACK LINEAR TICKET CREATE (Lookup)',
    'Mode: Lookup — create a Linear issue. Do NOT call tasks_start_slice or tasks_start_goal.',
    'Your FIRST tool call MUST be linear_save_issue with:',
    '  - title: Verb + what + where (actionable, one deliverable)',
    '  - team: Trailblaize (or team key TRA)',
    '  - description: markdown body per LINEAR TICKET FORMAT below (not a raw paste of the Slack message)',
    '  - priority: set only if clearly implied; otherwise omit',
    buildLinearTicketTemplateGuidance(),
    'Do NOT call github_*, tickets_*, or linear_list_* / search before create unless the user asked to check for duplicates.',
    'Ask at most one clarifying question only if you cannot invent a title + at least two acceptance criteria from the message.',
    'After create succeeds, reply with the Linear identifier (e.g. TRA-xxx), URL, and a one-line confirmation that AC were included. Keep the reply short.',
  ].join('\n');
}

/** Strong queue-first / ticket-create instructions appended to chat agent runs. */
export function buildSlackOrchestrationAppend(message: string, history: BrainMessage[]): string | undefined {
  if (isLinearTicketCreateIntent(message)) {
    return buildSlackTicketCreateAppend();
  }

  const kind = detectOrchestrationKickoff(message);
  if (!kind) return undefined;

  const linearId = extractLinearIssueId(message, history);
  const lines = [
    kind === 'slice' ? 'SLACK SLICE KICKOFF' : 'SLACK GOAL KICKOFF',
    'Your FIRST tool call MUST be tasks_start_slice or tasks_start_goal — no linear_*, github_*, or tickets_* before queueing.',
    'Do NOT research in this Slack reply. The background runner handles research and Cursor dispatch.',
    'Put the user request and constraints into the goal field.',
  ];
  if (linearId) lines.push(`Set linear_issue_id to ${linearId}.`);
  if (threadHasLookupContext(history)) {
    lines.push('Thread already has Lookup context — reference it in goal; do not re-fetch.');
  }
  return lines.join('\n');
}
