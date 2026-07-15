/**
 * TRA-901: Lookup status / progress for a Linear ticket (+ Cursor Cloud when resolvable).
 */

import { BrainMessage } from '../agent';
import {
  CursorAgentListItem,
  CursorRunSnapshot,
  getCursorAgent,
  getLatestCursorRunSnapshot,
  isCursorConfigured,
  listCursorAgents,
} from '../cursor-api';
import { fetchLinearIssueStatusBundle, LinearIssueStatusBundle } from '../linear-delegate';
import { extractLinearIssueId, isLinearTicketCreateIntent } from './orchestration-kickoff';

const STATUS_SIGNALS =
  /\b(status|progress|update|updates|what's going on|whats going on|what is going on|how's it going|how is it going|how'?s .+ going|check on|look(?:ing)? up)\b/i;

const AGENT_ID_RE = /\b(bc-[a-f0-9-]{8,})\b/i;
const AGENT_URL_RE = /https?:\/\/(?:www\.)?cursor\.com\/agents\/(bc-[a-f0-9-]+)/i;
const PR_URL_RE = /https?:\/\/github\.com\/[^\s)>\]]+\/pull\/\d+/gi;

/** True when user wants a progress/status report on a ticket (Lookup, not implement). */
export function isTicketStatusIntent(message: string): boolean {
  const text = message.trim();
  if (!text || isLinearTicketCreateIntent(text)) return false;

  const hasTra = /TRA-\d+/i.test(text);
  if (!hasTra) return false;

  if (STATUS_SIGNALS.test(text)) return true;

  // Short forms: "TRA-123 status", "TRA-123?"
  if (/^TRA-\d+\s*(status|progress|update)?\??$/i.test(text)) return true;
  if (/\bTRA-\d+\b.{0,40}\b(status|progress|update)\b/i.test(text)) return true;

  return false;
}

function extractAgentIdsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(new RegExp(AGENT_URL_RE.source, 'gi'))) {
    if (match[1]) found.add(match[1]);
  }
  for (const match of text.matchAll(new RegExp(AGENT_ID_RE.source, 'gi'))) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

function extractPrUrls(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(PR_URL_RE)) {
      found.add(match[0].replace(/[.,)]+$/, ''));
    }
  }
  return [...found];
}

function normalizeTitleToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreAgentForTicket(
  agent: CursorAgentListItem,
  linearId: string,
  title: string,
  prUrls: string[]
): number {
  let score = 0;
  const idLower = linearId.toLowerCase();
  const hay = [
    agent.name,
    ...agent.startingRefs,
    ...agent.prUrls,
    ...agent.repoUrls,
  ]
    .join(' ')
    .toLowerCase();

  if (hay.includes(idLower)) score += 100;
  if (agent.startingRefs.some(r => r.toLowerCase().includes(idLower))) score += 40;

  for (const pr of prUrls) {
    if (agent.prUrls.some(u => u.toLowerCase() === pr.toLowerCase())) score += 80;
  }

  const titleTokens = normalizeTitleToken(title)
    .split(/\s+/)
    .filter(t => t.length > 3);
  const nameNorm = normalizeTitleToken(agent.name);
  let overlap = 0;
  for (const token of titleTokens.slice(0, 6)) {
    if (nameNorm.includes(token)) overlap += 1;
  }
  if (overlap >= 2) score += overlap * 8;

  return score;
}

async function resolveCursorCloudForTicket(
  linear: LinearIssueStatusBundle
): Promise<{
  agent: CursorAgentListItem | Record<string, unknown> | null;
  run: CursorRunSnapshot | null;
  agentUrl: string | null;
  matchNote: string | null;
  unavailableReason: string | null;
}> {
  if (!isCursorConfigured()) {
    return {
      agent: null,
      run: null,
      agentUrl: null,
      matchNote: null,
      unavailableReason: 'CURSOR_API_KEY is not configured on this deployment.',
    };
  }

  const textBlob = [
    linear.description || '',
    ...linear.comments.map(c => c.body),
    ...linear.attachmentUrls,
  ].join('\n');

  const embeddedIds = extractAgentIdsFromText(textBlob);
  const prUrls = extractPrUrls(textBlob, ...linear.attachmentUrls);

  try {
    if (embeddedIds.length > 0) {
      const agentId = embeddedIds[0];
      const agent = await getCursorAgent(agentId);
      const run = await getLatestCursorRunSnapshot(agentId);
      const url =
        typeof agent.url === 'string'
          ? agent.url
          : `https://cursor.com/agents/${agentId}`;
      return {
        agent,
        run,
        agentUrl: url,
        matchNote: 'Resolved from Linear comments/description agent link.',
        unavailableReason: null,
      };
    }

    const { items } = await listCursorAgents({ limit: 80 });
    let best: { agent: CursorAgentListItem; score: number } | null = null;
    for (const agent of items) {
      if (!agent.id) continue;
      const score = scoreAgentForTicket(agent, linear.identifier, linear.title, prUrls);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { agent, score };
    }

    if (!best || best.score < 40) {
      return {
        agent: null,
        run: null,
        agentUrl: null,
        matchNote: null,
        unavailableReason:
          'No Cursor Cloud agent matched this TRA under the configured API key (try again after Cursor posts on the ticket, or confirm Linear↔Cursor uses the same org key).',
      };
    }

    const run = await getLatestCursorRunSnapshot(best.agent.id);
    return {
      agent: best.agent,
      run,
      agentUrl: best.agent.url || `https://cursor.com/agents/${best.agent.id}`,
      matchNote: `Matched Cloud agent via heuristics (score ${best.score}).`,
      unavailableReason: null,
    };
  } catch (err) {
    return {
      agent: null,
      run: null,
      agentUrl: null,
      matchNote: null,
      unavailableReason: err instanceof Error ? err.message : 'Cursor API lookup failed',
    };
  }
}

function clipComment(body: string, max = 220): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

function formatStatusReply(
  linear: LinearIssueStatusBundle,
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
