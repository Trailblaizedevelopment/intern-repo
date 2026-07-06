const DEFAULT_REPO = 'Trailblaizedevelopment/Trailblaize-Web';

export function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

export function getGitHubRepoFull(): string {
  return process.env.GITHUB_REPO || DEFAULT_REPO;
}

export function getDevelopBranch(): string {
  return process.env.GITHUB_DEVELOP_BRANCH || 'develop';
}

export function getProductionBranch(): string {
  return process.env.GITHUB_PRODUCTION_BRANCH || 'main';
}

function parseRepo(full: string): { owner: string; repo: string } | null {
  const [owner, repo] = full.split('/');
  return owner && repo ? { owner, repo } : null;
}

export async function githubApiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getGitHubToken();
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

export interface CodeSearchHit {
  path: string;
  name: string;
  url: string;
}

/** Search code in the configured repo (GitHub /search/code). */
export async function searchRepoCode(
  query: string,
  options?: { repoFull?: string; limit?: number }
): Promise<{ repo: string; query: string; items: CodeSearchHit[] }> {
  const full = options?.repoFull || getGitHubRepoFull();
  const parsed = parseRepo(full);
  if (!parsed) throw new Error('Invalid GITHUB_REPO');

  const terms = query.trim();
  if (!terms) throw new Error('query is required');

  const perPage = Math.min(Math.max(options?.limit ?? 10, 1), 30);
  const q = `${terms} repo:${parsed.owner}/${parsed.repo}`;
  const res = await githubApiFetch(
    `/search/code?q=${encodeURIComponent(q)}&per_page=${perPage}`
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub code search ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    items?: Array<{ path?: string; name?: string; html_url?: string }>;
  };

  return {
    repo: full,
    query: terms,
    items: (data.items ?? []).map(item => ({
      path: item.path || '',
      name: item.name || '',
      url: item.html_url || '',
    })),
  };
}

export interface RepoFileContents {
  repo: string;
  path: string;
  ref: string;
  content: string;
  truncated: boolean;
  size_bytes: number;
}

/** Read a text file from the repo at ref (default develop). */
export async function getRepoFileContents(
  path: string,
  options?: { repoFull?: string; ref?: string; maxChars?: number }
): Promise<RepoFileContents> {
  const full = options?.repoFull || getGitHubRepoFull();
  const parsed = parseRepo(full);
  if (!parsed) throw new Error('Invalid GITHUB_REPO');

  const filePath = path.replace(/^\//, '').trim();
  if (!filePath) throw new Error('path is required');

  const ref = options?.ref || getDevelopBranch();
  const maxChars = options?.maxChars ?? 8000;

  const res = await githubApiFetch(
    `/repos/${parsed.owner}/${parsed.repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`,
    { headers: { Accept: 'application/vnd.github.raw' } }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub file ${res.status}: ${body.slice(0, 300)}`);
  }

  const text = await res.text();
  const truncated = text.length > maxChars;

  return {
    repo: full,
    path: filePath,
    ref,
    content: truncated ? `${text.slice(0, maxChars)}\n…(truncated)` : text,
    truncated,
    size_bytes: text.length,
  };
}

export interface OpenPrSummary {
  number: number;
  title: string;
  url: string;
  author: string | null;
  draft: boolean;
  created_at: string | null;
  updated_at: string | null;
  head: string | null;
  base: string | null;
}

/** List open pull requests for the configured repo. */
export async function listOpenPullRequests(
  options?: { repoFull?: string; limit?: number }
): Promise<{ repo: string; prs: OpenPrSummary[] }> {
  const full = options?.repoFull || getGitHubRepoFull();
  const parsed = parseRepo(full);
  if (!parsed) throw new Error('Invalid GITHUB_REPO');

  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 30);
  const res = await githubApiFetch(
    `/repos/${parsed.owner}/${parsed.repo}/pulls?state=open&sort=updated&direction=desc&per_page=${limit}`
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub pulls ${res.status}: ${body.slice(0, 300)}`);
  }

  const pulls = (await res.json()) as Array<Record<string, unknown>>;
  return {
    repo: full,
    prs: pulls.map(p => ({
      number: p.number as number,
      title: String(p.title ?? ''),
      url: String(p.html_url ?? ''),
      author: (p.user as { login?: string })?.login ?? null,
      draft: Boolean(p.draft),
      created_at: typeof p.created_at === 'string' ? p.created_at : null,
      updated_at: typeof p.updated_at === 'string' ? p.updated_at : null,
      head: (p.head as { ref?: string })?.ref ?? null,
      base: (p.base as { ref?: string })?.ref ?? null,
    })),
  };
}

export async function getPullRequest(
  number: number,
  repoFull?: string
): Promise<Record<string, unknown>> {
  const full = repoFull || getGitHubRepoFull();
  const parsed = parseRepo(full);
  if (!parsed) throw new Error('Invalid GITHUB_REPO');
  if (!number) throw new Error('number is required');

  const res = await githubApiFetch(`/repos/${parsed.owner}/${parsed.repo}/pulls/${number}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub PR ${res.status}: ${body.slice(0, 300)}`);
  }

  const pr = (await res.json()) as Record<string, unknown>;
  return {
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
    merged_at: pr.merged_at,
  };
}

export interface CommitSummary {
  sha: string;
  short_sha: string;
  message: string;
  author: string | null;
  date: string;
  url: string;
}

function trimCommitMessage(msg: string, maxLen = 200): string {
  const first = msg.split('\n')[0]?.trim() || msg;
  return first.length <= maxLen ? first : `${first.slice(0, maxLen)}…`;
}

function inDateRange(iso: string, since?: string, until?: string): boolean {
  const t = new Date(iso).getTime();
  if (since && t < new Date(since).getTime()) return false;
  if (until && t > new Date(until).getTime()) return false;
  return true;
}

/** List commits on a branch, optionally filtered by since/until (ISO 8601) and path. */
export async function listRepoCommits(options?: {
  repoFull?: string;
  branch?: string;
  since?: string;
  until?: string;
  path?: string;
  limit?: number;
}): Promise<{ repo: string; branch: string; since: string | null; until: string | null; commits: CommitSummary[] }> {
  const full = options?.repoFull || getGitHubRepoFull();
  const parsed = parseRepo(full);
  if (!parsed) throw new Error('Invalid GITHUB_REPO');

  const branch = options?.branch || getDevelopBranch();
  const since = options?.since?.trim() || undefined;
  const until = options?.until?.trim() || undefined;
  const path = options?.path?.trim() || undefined;
  const limit = Math.min(Math.max(options?.limit ?? 15, 1), 50);

  const params = new URLSearchParams();
  params.set('sha', branch);
  params.set('per_page', String(Math.min(limit * 2, 100)));
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  if (path) params.set('path', path);

  const res = await githubApiFetch(
    `/repos/${parsed.owner}/${parsed.repo}/commits?${params.toString()}`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub commits ${res.status}: ${body.slice(0, 300)}`);
  }

  const rows = (await res.json()) as Array<{
    sha?: string;
    html_url?: string;
    commit?: { message?: string; author?: { name?: string; date?: string } };
    author?: { login?: string } | null;
  }>;

  const commits: CommitSummary[] = [];
  for (const row of rows) {
    const date = row.commit?.author?.date;
    if (!row.sha || !date) continue;
    if (!inDateRange(date, since, until)) continue;
    commits.push({
      sha: row.sha,
      short_sha: row.sha.slice(0, 7),
      message: trimCommitMessage(row.commit?.message || ''),
      author: row.author?.login || row.commit?.author?.name || null,
      date,
      url: row.html_url || `https://github.com/${full}/commit/${row.sha}`,
    });
    if (commits.length >= limit) break;
  }

  return { repo: full, branch, since: since ?? null, until: until ?? null, commits };
}

export interface MergedPrSummary {
  number: number;
  title: string;
  url: string;
  author: string | null;
  merged_at: string;
  base: string;
  head: string | null;
}

/** List recently merged pull requests targeting a base branch (develop or main). */
export async function listMergedPullRequests(options?: {
  repoFull?: string;
  base?: string;
  since?: string;
  until?: string;
  limit?: number;
}): Promise<{ repo: string; base: string; merges: MergedPrSummary[] }> {
  const full = options?.repoFull || getGitHubRepoFull();
  const parsed = parseRepo(full);
  if (!parsed) throw new Error('Invalid GITHUB_REPO');

  const base = options?.base || getDevelopBranch();
  const since = options?.since?.trim() || undefined;
  const until = options?.until?.trim() || undefined;
  const limit = Math.min(Math.max(options?.limit ?? 15, 1), 30);

  const params = new URLSearchParams();
  params.set('state', 'closed');
  params.set('base', base);
  params.set('sort', 'updated');
  params.set('direction', 'desc');
  params.set('per_page', '50');

  const res = await githubApiFetch(
    `/repos/${parsed.owner}/${parsed.repo}/pulls?${params.toString()}`
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub merged PRs ${res.status}: ${body.slice(0, 300)}`);
  }

  const pulls = (await res.json()) as Array<{
    number?: number;
    title?: string;
    html_url?: string;
    merged_at?: string | null;
    user?: { login?: string };
    base?: { ref?: string };
    head?: { ref?: string };
  }>;

  const merges: MergedPrSummary[] = [];
  for (const pr of pulls) {
    if (!pr.merged_at || !pr.number) continue;
    if (!inDateRange(pr.merged_at, since, until)) continue;
    if (/^develop$/i.test(String(pr.title || '').trim())) continue;
    merges.push({
      number: pr.number,
      title: String(pr.title ?? ''),
      url: String(pr.html_url ?? ''),
      author: pr.user?.login ?? null,
      merged_at: pr.merged_at,
      base: pr.base?.ref || base,
      head: pr.head?.ref ?? null,
    });
    if (merges.length >= limit) break;
  }

  return { repo: full, base, merges };
}

export interface CommitSearchHit {
  sha: string;
  short_sha: string;
  message: string;
  author: string | null;
  date: string;
  url: string;
}

/** Search commit messages in the repo (keyword + optional committer-date range). */
export async function searchRepoCommits(
  query: string,
  options?: { repoFull?: string; since?: string; until?: string; limit?: number }
): Promise<{ repo: string; query: string; commits: CommitSearchHit[] }> {
  const full = options?.repoFull || getGitHubRepoFull();
  const parsed = parseRepo(full);
  if (!parsed) throw new Error('Invalid GITHUB_REPO');

  const terms = query.trim();
  if (!terms) throw new Error('query is required');

  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 30);
  let q = `${terms} repo:${parsed.owner}/${parsed.repo}`;

  const sinceDay = options?.since?.slice(0, 10);
  const untilDay = options?.until?.slice(0, 10);
  if (sinceDay && untilDay) q += ` committer-date:${sinceDay}..${untilDay}`;
  else if (sinceDay) q += ` committer-date:>=${sinceDay}`;
  else if (untilDay) q += ` committer-date:<=${untilDay}`;

  const res = await githubApiFetch(`/search/commits?q=${encodeURIComponent(q)}&per_page=${limit}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub commit search ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      sha?: string;
      html_url?: string;
      commit?: { message?: string; author?: { name?: string; date?: string } };
      author?: { login?: string } | null;
    }>;
  };

  return {
    repo: full,
    query: terms,
    commits: (data.items ?? []).map(item => ({
      sha: item.sha || '',
      short_sha: (item.sha || '').slice(0, 7),
      message: trimCommitMessage(item.commit?.message || ''),
      author: item.author?.login || item.commit?.author?.name || null,
      date: item.commit?.author?.date || '',
      url: item.html_url || '',
    })),
  };
}

let rulesCache: { at: number; payload: TrailblaizeWebRules } | null = null;
const RULES_TTL_MS = 60 * 60 * 1000;

export interface TrailblaizeWebRules {
  agentsExcerpt: string;
  guardrailsExcerpt: string;
  workflowExcerpt: string;
  fetched: boolean;
}

const FALLBACK_RULES: TrailblaizeWebRules = {
  fetched: false,
  agentsExcerpt:
    'Brain orchestrates; Cursor implements. Do not push to main/develop directly. PRs target develop. Branch prefix: cursor/TRA-xxx-slug.',
  guardrailsExcerpt:
    'NEVER push to main or develop. ALWAYS branch from develop. PRs target develop only. Include Linear ticket ID in commits.',
  workflowExcerpt:
    'Cursor branches from develop with prefix cursor/. autoCreatePR targets develop. Human reviews before merge.',
};

async function fetchRawFile(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const data = await getRepoFileContents(path, {
      repoFull: `${owner}/${repo}`,
      ref: getDevelopBranch(),
      maxChars: 6000,
    });
    return data.content;
  } catch {
    return null;
  }
}

function excerpt(text: string, maxLen = 2500): string {
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}\n…(truncated)`;
}

/** Fetch AGENTS.md + guardrails from Trailblaize-Web (cached 1h). */
export async function fetchTrailblaizeWebRules(): Promise<TrailblaizeWebRules> {
  if (rulesCache && Date.now() - rulesCache.at < RULES_TTL_MS) {
    return rulesCache.payload;
  }

  const parsed = parseRepo(getGitHubRepoFull());
  if (!parsed) {
    return FALLBACK_RULES;
  }

  const [agents, guardrails, workflow] = await Promise.all([
    fetchRawFile(parsed.owner, parsed.repo, 'AGENTS.md'),
    fetchRawFile(parsed.owner, parsed.repo, 'docs/OPENCLAW_GUARDRAILS.md'),
    fetchRawFile(parsed.owner, parsed.repo, 'docs/users/linear_cursor_workflow.md'),
  ]);

  const payload: TrailblaizeWebRules = {
    fetched: Boolean(agents || guardrails),
    agentsExcerpt: excerpt(agents || FALLBACK_RULES.agentsExcerpt),
    guardrailsExcerpt: excerpt(guardrails || FALLBACK_RULES.guardrailsExcerpt, 2000),
    workflowExcerpt: excerpt(workflow || FALLBACK_RULES.workflowExcerpt, 1500),
  };

  rulesCache = { at: Date.now(), payload };
  return payload;
}

export async function findOpenPrByBranch(
  headBranch: string,
  repoFull?: string
): Promise<{ number: number; url: string; title: string } | null> {
  const token = getGitHubToken();
  const full = repoFull || getGitHubRepoFull();
  const parsed = parseRepo(full);
  if (!token || !parsed) return null;

  const res = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls?state=open&head=${parsed.owner}:${headBranch}&per_page=5`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!res.ok) return null;
  const pulls = (await res.json()) as Array<{ number: number; html_url: string; title: string }>;
  const match = pulls[0];
  return match ? { number: match.number, url: match.html_url, title: match.title } : null;
}
