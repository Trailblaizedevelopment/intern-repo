/**
 * TRA-901: Lookup status / progress for a Linear ticket (+ Cursor Cloud when resolvable).
 */

import { BrainMessage } from '../agent';
import { resolveCursorCloudForTicket } from '../cursor-ticket-resolve';
import { fetchLinearIssueStatusBundle } from '../linear-delegate';
import { extractLinearIssueId, isLinearTicketCreateIntent } from './orchestration-kickoff';
import { isStartWorkIntent } from './ticket-intent';

const STATUS_NEAR_TRA =
  /\bTRA-\d+\b[\s\S]{0,40}\b(status|progress|update|updates)\b|\b(status|progress|update|updates)\b[\s\S]{0,40}\bTRA-\d+\b/i;

const GOING_ON_NEAR_TRA =
  /\bTRA-\d+\b[\s\S]{0,60}\b(what's going on|whats going on|what is going on|how's it going|how is it going|check on|look(?:ing)? up)\b|\b(what's going on|whats going on|what is going on|how's it going|how is it going|check on|look(?:ing)? up)\b[\s\S]{0,60}\bTRA-\d+\b/i;

/** True when user wants a progress/status report on a ticket (Lookup, not implement). */
export function isTicketStatusIntent(message: string): boolean {
  const text = message.trim();
  if (!text || isLinearTicketCreateIntent(text)) return false;

  // Prefer Path A handoff when start/implement verbs are present (even if "progress" appears later).
  if (isStartWorkIntent(text)) return false;

  const hasTra = /TRA-\d+/i.test(text);
  if (!hasTra) return false;

  // Short forms: "TRA-123 status", "TRA-123?"
  if (/^TRA-\d+\s*(status|progress|update)?\??$/i.test(text)) return true;

  // Require status/progress words near the TRA id (avoid "check progress later" stealing handoff).
  if (STATUS_NEAR_TRA.test(text)) return true;
  if (GOING_ON_NEAR_TRA.test(text)) return true;

  return false;
}

function clipComment(body: string, max = 220): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function formatStatusReply(
  linear: NonNullable<Awaited<ReturnType<typeof fetchLinearIssueStatusBundle>>>,
  cloud: Awaited<ReturnType<typeof resolveCursorCloudForTicket>>
): string {
  const lines: string[] = [
    '*Mode: Lookup*',
    '',
    `*\`${linear.identifier}\`* — ${linear.title}`,
    `Status: *${linear.stateName}* (${linear.stateType})`,
  ];

  if (linear.delegateName) lines.push(`Delegate: ${linear.delegateName}`);
  if (linear.assigneeName) lines.push(`Assignee: ${linear.assigneeName}`);
  lines.push(linear.url);

  const recent = linear.comments.slice(0, 5);
  if (recent.length > 0) {
    lines.push('', '*Recent comments*');
    for (const c of recent) {
      lines.push(`• *${c.author}:* ${clipComment(c.body)}`);
    }
  } else {
    lines.push('', '_No recent Linear comments._');
  }

  lines.push('', '*Cursor Cloud*');
  if (cloud.agent && cloud.agentUrl) {
    const status =
      typeof (cloud.agent as { status?: string }).status === 'string'
        ? (cloud.agent as { status: string }).status
        : 'UNKNOWN';
    lines.push(`Agent: <${cloud.agentUrl}|open> (\`${status}\`)`);
    if (cloud.run) {
      lines.push(`Latest run: *${cloud.run.status}*`);
      if (cloud.run.prUrl) lines.push(`PR: ${cloud.run.prUrl}`);
      if (cloud.run.branch) lines.push(`Branch: \`${cloud.run.branch}\``);
      if (cloud.run.result) lines.push(`Result: ${clipComment(cloud.run.result, 280)}`);
    }
    if (cloud.matchNote) lines.push(`_${cloud.matchNote}_`);
  } else {
    lines.push(cloud.unavailableReason || 'No Cloud agent details available.');
  }

  return lines.join('\n');
}

/**
 * Fast-path Lookup status for Slack. Returns null when message is not a status ask.
 */
export async function tryTicketStatusLookup(input: {
  message: string;
  history: BrainMessage[];
}): Promise<{ reply: string; messages: BrainMessage[] } | null> {
  if (!isTicketStatusIntent(input.message)) return null;

  const linearId = extractLinearIssueId(input.message, input.history);
  if (!linearId) {
    const reply = [
      '*Mode: Lookup*',
      '',
      'Which Linear ticket? Include an id like `TRA-123` (e.g. *progress on TRA-123*).',
    ].join('\n');
    return {
      reply,
      messages: [
        ...input.history,
        { role: 'user', content: input.message },
        { role: 'assistant', content: reply },
      ],
    };
  }

  const linear = await fetchLinearIssueStatusBundle(linearId);
  if (!linear) {
    const reply = [
      '*Mode: Lookup*',
      '',
      `Could not load \`${linearId}\` from Linear. Check the id and that \`LINEAR_API_KEY\` can read the workspace.`,
    ].join('\n');
    return {
      reply,
      messages: [
        ...input.history,
        { role: 'user', content: input.message },
        { role: 'assistant', content: reply },
      ],
    };
  }

  const cloud = await resolveCursorCloudForTicket(linear);
  const reply = formatStatusReply(linear, cloud);

  return {
    reply,
    messages: [
      ...input.history,
      { role: 'user', content: input.message },
      { role: 'assistant', content: reply },
    ],
  };
}
