import { getDevelopBranch, getGitHubRepoFull } from './github-repo';

const CURSOR_API_BASE = (process.env.CURSOR_API_BASE_URL || 'https://api.cursor.com').replace(/\/$/, '');

const TERMINAL_RUN_STATUSES = new Set(['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED']);
const ACTIVE_RUN_STATUSES = new Set(['CREATING', 'RUNNING', 'PENDING', 'ACTIVE']);

function getCursorApiKey(): string | null {
  return process.env.CURSOR_API_KEY?.trim() || null;
}

export function isCursorConfigured(): boolean {
  return Boolean(getCursorApiKey());
}

export function getDefaultCursorStartingRef(): string {
  return getDevelopBranch();
}

export interface CursorAgentCreateInput {
  prompt: string;
  repo?: string;
  startingRef?: string;
  autoCreatePR?: boolean;
  mode?: 'agent' | 'plan';
}

export interface CursorAgentCreateResult {
  agentId: string;
  agentUrl: string | null;
  runId: string | null;
  runStatus: string | null;
  status: string;
}

export interface CursorRunGitBranch {
  repoUrl?: string;
  branch?: string;
  prUrl?: string;
}

export interface CursorRunSnapshot {
  runId: string;
  status: string;
  result: string | null;
  prUrl: string | null;
  branch: string | null;
  durationMs: number | null;
}

async function cursorFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = getCursorApiKey();
  if (!key) throw new Error('CURSOR_API_KEY not configured');

  return fetch(`${CURSOR_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      ...(init.headers || {}),
    },
  });
}

function extractGitFromRun(run: Record<string, unknown>): { prUrl: string | null; branch: string | null } {
  const git = run.git as { branches?: CursorRunGitBranch[] } | undefined;
  const branches = git?.branches || [];
  const latest = branches[branches.length - 1] || branches[0];
  return {
    prUrl: latest?.prUrl || null,
    branch: latest?.branch || null,
  };
}

export async function createCursorAgent(
  input: CursorAgentCreateInput
): Promise<CursorAgentCreateResult> {
  const repoFull = input.repo || getGitHubRepoFull();
  const repoUrl = repoFull.startsWith('http') ? repoFull : `https://github.com/${repoFull}`;
  const startingRef = input.startingRef || getDefaultCursorStartingRef();

  const body = {
    prompt: { text: input.prompt },
    repos: [{ url: repoUrl, startingRef }],
    autoCreatePR: input.autoCreatePR ?? true,
    mode: input.mode ?? 'agent',
  };

  const res = await cursorFetch('/v1/agents', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cursor API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    agent?: { id?: string; url?: string; status?: string };
    run?: { id?: string; status?: string };
  };

  return {
    agentId: data.agent?.id || '',
    agentUrl: data.agent?.url || null,
    runId: data.run?.id || null,
    runStatus: data.run?.status || null,
    status: data.agent?.status || 'UNKNOWN',
  };
}

export async function getCursorAgent(agentId: string): Promise<Record<string, unknown>> {
  const res = await cursorFetch(`/v1/agents/${encodeURIComponent(agentId)}`);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cursor API ${res.status}: ${errText.slice(0, 300)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function getCursorRun(agentId: string, runId: string): Promise<CursorRunSnapshot> {
  const res = await cursorFetch(
    `/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cursor API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const run = (await res.json()) as Record<string, unknown>;
  const git = extractGitFromRun(run);

  return {
    runId: String(run.id || runId),
    status: String(run.status || 'UNKNOWN'),
    result: typeof run.result === 'string' ? run.result : null,
    prUrl: git.prUrl,
    branch: git.branch,
    durationMs: typeof run.durationMs === 'number' ? run.durationMs : null,
  };
}

export async function getLatestCursorRunSnapshot(agentId: string): Promise<CursorRunSnapshot | null> {
  const agent = await getCursorAgent(agentId);
  const runId = typeof agent.latestRunId === 'string' ? agent.latestRunId : null;
  if (!runId) return null;
  return getCursorRun(agentId, runId);
}

export function isCursorRunTerminal(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(status.toUpperCase());
}

export function isCursorRunActive(status: string): boolean {
  const upper = status.toUpperCase();
  return ACTIVE_RUN_STATUSES.has(upper) || upper === 'ACTIVE';
}
