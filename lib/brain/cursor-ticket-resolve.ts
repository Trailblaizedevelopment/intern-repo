/**
 * Resolve a Cursor Cloud agent for a Linear ticket (TRA-901 heuristics).
 * Shared by Slack status Lookup and Path A finish-watch (TRA-919).
 */

import {
  CursorAgentListItem,
  CursorRunSnapshot,
  getCursorAgent,
  getLatestCursorRunSnapshot,
  isCursorConfigured,
  listCursorAgents,
} from './cursor-api';
import { LinearIssueStatusBundle } from './linear-delegate';

const AGENT_ID_RE = /\b(bc-[a-f0-9-]{8,})\b/i;
const AGENT_URL_RE = /https?:\/\/(?:www\.)?cursor\.com\/agents\/(bc-[a-f0-9-]+)/i;
const PR_URL_RE = /https?:\/\/github\.com\/[^\s)>\]]+\/pull\/\d+/gi;

export interface CursorCloudTicketMatch {
  agent: CursorAgentListItem | Record<string, unknown> | null;
  run: CursorRunSnapshot | null;
  agentId: string | null;
  agentUrl: string | null;
  matchNote: string | null;
  unavailableReason: string | null;
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
  const hay = [agent.name, ...agent.startingRefs, ...agent.prUrls, ...agent.repoUrls]
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

function agentIdFromRecord(agent: CursorAgentListItem | Record<string, unknown>): string | null {
  if ('id' in agent && typeof agent.id === 'string' && agent.id) return agent.id;
  return null;
}

/** Match Linear ticket → Cursor Cloud agent + latest run when resolvable. */
export async function resolveCursorCloudForTicket(
  linear: LinearIssueStatusBundle
): Promise<CursorCloudTicketMatch> {
  if (!isCursorConfigured()) {
    return {
      agent: null,
      run: null,
      agentId: null,
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
        typeof agent.url === 'string' ? agent.url : `https://cursor.com/agents/${agentId}`;
      return {
        agent,
        run,
        agentId,
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
        agentId: null,
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
      agentId: best.agent.id,
      agentUrl: best.agent.url || `https://cursor.com/agents/${best.agent.id}`,
      matchNote: `Matched Cloud agent via heuristics (score ${best.score}).`,
      unavailableReason: null,
    };
  } catch (err) {
    return {
      agent: null,
      run: null,
      agentId: null,
      agentUrl: null,
      matchNote: null,
      unavailableReason: err instanceof Error ? err.message : 'Cursor API lookup failed',
    };
  }
}

/** Resolve by known agent id (Path A watch after first successful match). */
export async function resolveCursorCloudByAgentId(
  agentId: string
): Promise<CursorCloudTicketMatch> {
  if (!isCursorConfigured()) {
    return {
      agent: null,
      run: null,
      agentId: null,
      agentUrl: null,
      matchNote: null,
      unavailableReason: 'CURSOR_API_KEY is not configured on this deployment.',
    };
  }

  try {
    const agent = await getCursorAgent(agentId);
    const run = await getLatestCursorRunSnapshot(agentId);
    const url =
      typeof agent.url === 'string' ? agent.url : `https://cursor.com/agents/${agentId}`;
    return {
      agent,
      run,
      agentId: agentIdFromRecord(agent) || agentId,
      agentUrl: url,
      matchNote: 'Resolved from stored Path A watch agent id.',
      unavailableReason: null,
    };
  } catch (err) {
    return {
      agent: null,
      run: null,
      agentId,
      agentUrl: `https://cursor.com/agents/${agentId}`,
      matchNote: null,
      unavailableReason: err instanceof Error ? err.message : 'Cursor API lookup failed',
    };
  }
}
