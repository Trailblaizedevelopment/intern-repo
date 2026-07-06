const CURSOR_API_BASE = (process.env.CURSOR_API_BASE_URL || 'https://api.cursor.com').replace(/\/$/, '');

function getCursorApiKey(): string | null {
  return process.env.CURSOR_API_KEY?.trim() || null;
}

export function isCursorConfigured(): boolean {
  return Boolean(getCursorApiKey());
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
  status: string;
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

export async function createCursorAgent(
  input: CursorAgentCreateInput
): Promise<CursorAgentCreateResult> {
  const repoFull = input.repo || process.env.GITHUB_REPO || 'Trailblaizedevelopment/Trailblaize-Web';
  const repoUrl = repoFull.startsWith('http') ? repoFull : `https://github.com/${repoFull}`;
  const startingRef = input.startingRef || process.env.GITHUB_PRODUCTION_BRANCH || 'main';

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
    run?: { id?: string };
  };

  return {
    agentId: data.agent?.id || '',
    agentUrl: data.agent?.url || null,
    runId: data.run?.id || null,
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
