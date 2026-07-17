/**
 * Hosted Mem0 platform client (TRA-914).
 * Thin REST wrapper — no mem0ai npm package (peer conflict with pg).
 * Docs: https://docs.mem0.ai/api-reference/memory/add-memories
 */

const MEM0_API_BASE = (process.env.MEM0_API_BASE_URL || 'https://api.mem0.ai').replace(/\/$/, '');
const AGENT_ID = 'dynamo';

export interface Mem0Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Mem0MemoryHit {
  id: string;
  memory: string;
  score: number | null;
  categories: string[];
  metadata: Record<string, unknown> | null;
}

export function isMem0Configured(): boolean {
  return Boolean(process.env.MEM0_API_KEY?.trim());
}

function getApiKey(): string | null {
  return process.env.MEM0_API_KEY?.trim() || null;
}

/** Stable user scope for Brain — prefer employee email, else Slack user id. */
export function resolveMem0UserId(input: {
  employeeEmail?: string | null;
  employeeId?: string | null;
  slackUserId?: string | null;
}): string {
  const email = input.employeeEmail?.trim().toLowerCase();
  if (email) return email;
  if (input.employeeId?.trim()) return `employee:${input.employeeId.trim()}`;
  if (input.slackUserId?.trim()) return `slack:${input.slackUserId.trim()}`;
  return 'trailblaize-brain';
}

async function mem0Fetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = getApiKey();
  if (!key) throw new Error('MEM0_API_KEY not configured');

  const res = await fetch(`${MEM0_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Mem0 API ${res.status}: ${errText.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

export async function searchMemories(
  query: string,
  userId: string,
  options?: { topK?: number; threshold?: number }
): Promise<Mem0MemoryHit[]> {
  if (!isMem0Configured()) return [];

  const data = await mem0Fetch<{
    results?: Array<{
      id?: string;
      memory?: string;
      score?: number;
      categories?: string[];
      metadata?: Record<string, unknown> | null;
    }>;
  }>('/v3/memories/search/', {
    query: query.slice(0, 2000),
    filters: { user_id: userId },
    top_k: Math.min(Math.max(options?.topK ?? 8, 1), 20),
    threshold: options?.threshold ?? 0.15,
  });

  return (data.results || [])
    .filter(r => typeof r.memory === 'string' && r.memory.trim())
    .map(r => ({
      id: String(r.id || ''),
      memory: (r.memory || '').trim(),
      score: typeof r.score === 'number' ? r.score : null,
      categories: Array.isArray(r.categories) ? r.categories.map(String) : [],
      metadata: r.metadata && typeof r.metadata === 'object' ? r.metadata : null,
    }));
}

export interface AddMemoriesResult {
  ok: boolean;
  eventId?: string;
  status?: string;
  error?: string;
  skipped?: boolean;
}

/** Extract + store memories from a short conversation turn (async on Mem0 side). */
export async function addConversationMemories(
  messages: Mem0Message[],
  userId: string,
  metadata?: Record<string, unknown>
): Promise<AddMemoriesResult> {
  if (!isMem0Configured()) {
    return { ok: true, skipped: true };
  }

  const cleaned = messages
    .map(m => ({
      role: m.role,
      content: m.content.trim().slice(0, 4000),
    }))
    .filter(m => m.content.length > 0);

  if (cleaned.length === 0) {
    return { ok: true, skipped: true };
  }

  try {
    const data = await mem0Fetch<{
      status?: string;
      event_id?: string;
      message?: string;
    }>('/v3/memories/add/', {
      messages: cleaned,
      user_id: userId,
      agent_id: AGENT_ID,
      metadata: {
        source: 'trailblaize-brain',
        ...(metadata || {}),
      },
      custom_instructions: [
        'Extract durable facts useful across Slack threads for Trailblaize Brain (Dynamo).',
        'Prefer: Slack reply style preferences, active Linear ticket/project focus,',
        'recurring codebase paths/repos, CS/outreach patterns, and explicit "remember that" facts.',
        'Ignore one-off greetings and transient status checks.',
      ].join(' '),
    });

    return {
      ok: true,
      eventId: data.event_id,
      status: data.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mem0 add failed';
    console.error('[brain/mem0] add failed:', message);
    return { ok: false, error: message };
  }
}

/** Best-effort search that never throws into the agent loop. */
export async function safeSearchMemories(
  query: string,
  userId: string
): Promise<{ memories: Mem0MemoryHit[]; error?: string }> {
  try {
    const memories = await searchMemories(query, userId);
    return { memories };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mem0 search failed';
    console.error('[brain/mem0] search failed:', message);
    return { memories: [], error: message };
  }
}
