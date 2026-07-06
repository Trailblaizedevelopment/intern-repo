import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

const CONNECTOR_ID = 'github';
const DEFAULT_REPO = 'Trailblaizedevelopment/Trailblaize-Web';

function getToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

function resolveRepo(input?: unknown): { owner: string; repo: string; full: string } | null {
  const full = (typeof input === 'string' && input.trim()) || process.env.GITHUB_REPO || DEFAULT_REPO;
  const [owner, repo] = full.split('/');
  if (!owner || !repo) return null;
  return { owner, repo, full };
}

async function ghFetch(path: string): Promise<unknown> {
  const token = getToken();
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

const TOOLS: ConnectorTool[] = [
  {
    name: 'github_list_open_prs',
    description: 'List open pull requests for the Trailblaize-Web repo (or specified repo).',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'owner/repo, default from GITHUB_REPO' },
        limit: { type: 'number', description: 'Max PRs (default 10)' },
      },
    },
  },
  {
    name: 'github_get_pr',
    description: 'Get details for a single pull request by number.',
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'number', description: 'PR number' },
        repo: { type: 'string', description: 'owner/repo' },
      },
      required: ['number'],
    },
  },
];

export const githubConnector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'GitHub',
  kind: 'in-process',

  isAvailable() {
    return Boolean(getToken());
  },

  async listTools(): Promise<ConnectorTool[]> {
    return TOOLS;
  },

  async callTool(toolName: string, input: Record<string, unknown>): Promise<ConnectorCallResult> {
    try {
      if (toolName === 'github_list_open_prs') {
        const resolved = resolveRepo(input.repo);
        if (!resolved) return { ok: false, error: 'Invalid repo' };
        const limit = Math.min(Number(input.limit) || 10, 30);
        const pulls = (await ghFetch(
          `/repos/${resolved.owner}/${resolved.repo}/pulls?state=open&sort=updated&direction=desc&per_page=${limit}`
        )) as Array<Record<string, unknown>>;
        return {
          ok: true,
          data: {
            repo: resolved.full,
            prs: pulls.map(p => ({
              number: p.number,
              title: p.title,
              url: p.html_url,
              author: (p.user as { login?: string })?.login,
              draft: p.draft,
              created_at: p.created_at,
              updated_at: p.updated_at,
              head: (p.head as { ref?: string })?.ref,
              base: (p.base as { ref?: string })?.ref,
            })),
          },
        };
      }

      if (toolName === 'github_get_pr') {
        const num = Number(input.number);
        if (!num) return { ok: false, error: 'number is required' };
        const resolved = resolveRepo(input.repo);
        if (!resolved) return { ok: false, error: 'Invalid repo' };
        const pr = (await ghFetch(`/repos/${resolved.owner}/${resolved.repo}/pulls/${num}`)) as Record<
          string,
          unknown
        >;
        return {
          ok: true,
          data: {
            number: pr.number,
            title: pr.title,
            state: pr.state,
            merged: pr.merged,
            url: pr.html_url,
            body: typeof pr.body === 'string' ? pr.body.slice(0, 2000) : null,
            author: (pr.user as { login?: string })?.login,
            head: (pr.head as { ref?: string })?.ref,
            base: (pr.base as { ref?: string })?.ref,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
          },
        };
      }

      return { ok: false, error: `Unknown tool: ${toolName}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'GitHub call failed' };
    }
  },
};
