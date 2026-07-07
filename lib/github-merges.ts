export interface GitHubMergeItem {
  number: number;
  title: string;
  merged_at: string;
  author: string | null;
  url: string;
  base: string;
}

export interface GitHubMergesSummary {
  repo: string;
  configured: boolean;
  develop: GitHubMergeItem[];
  production: GitHubMergeItem[];
  develop_this_week: number;
  production_this_week: number;
  error?: string;
}

const DEFAULT_REPO = 'Trailblaizedevelopment/Trailblaize-Web';

function getGitHubToken(): string | null {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
  return token?.trim() || null;
}

function getProductionBranch(): string {
  return (process.env.GITHUB_PRODUCTION_BRANCH || 'main').trim();
}

function getDevelopBranch(): string {
  return (process.env.GITHUB_DEVELOP_BRANCH || 'develop').trim();
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekStartIsoDate(): string {
  return startOfWeek(new Date()).toISOString().slice(0, 10);
}

function isNoiseMergeTitle(title: string): boolean {
  return /^develop$/i.test(title.trim());
}

async function githubApiFetch(path: string, token: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
    },
  });
}

interface SearchIssueRow {
  number: number;
  title: string;
  html_url: string;
  user?: { login?: string } | null;
  pull_request?: { merged_at?: string | null };
}

function mapSearchIssue(row: SearchIssueRow, base: string): GitHubMergeItem | null {
  const mergedAt = row.pull_request?.merged_at;
  if (!mergedAt || !row.number) return null;
  return {
    number: row.number,
    title: row.title,
    merged_at: mergedAt,
    author: row.user?.login ?? null,
    url: row.html_url,
    base,
  };
}

/** Merged PRs via search — avoids closed-but-unmerged PRs crowding list results. */
async function fetchMergedPullRequests(
  owner: string,
  repo: string,
  base: string,
  token: string,
  limit = 6
): Promise<GitHubMergeItem[]> {
  const q = `is:pr is:merged base:${base} repo:${owner}/${repo}`;
  const params = new URLSearchParams({
    q,
    sort: 'updated',
    order: 'desc',
    per_page: '30',
  });

  const res = await githubApiFetch(`/search/issues?${params}`, token);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub search ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { items?: SearchIssueRow[] };
  const items: GitHubMergeItem[] = [];

  for (const row of data.items ?? []) {
    const mapped = mapSearchIssue(row, base);
    if (!mapped || isNoiseMergeTitle(mapped.title)) continue;
    items.push(mapped);
    if (items.length >= limit) break;
  }

  return items;
}

/** Accurate weekly count from search total_count (not limited to displayed list). */
async function countMergedThisWeek(
  owner: string,
  repo: string,
  base: string,
  token: string,
  excludeNoiseTitles: boolean
): Promise<number> {
  const mergedSince = weekStartIsoDate();
  const q = `is:pr is:merged base:${base} repo:${owner}/${repo} merged:>=${mergedSince}`;
  const res = await githubApiFetch(
    `/search/issues?q=${encodeURIComponent(q)}&per_page=1`,
    token
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub search count ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { total_count?: number; items?: SearchIssueRow[] };
  let count = data.total_count ?? 0;

  if (excludeNoiseTitles && count > 0 && (data.items?.length ?? 0) > 0) {
    const noiseQ = `is:pr is:merged base:${base} repo:${owner}/${repo} merged:>=${mergedSince} in:title develop`;
    const noiseRes = await githubApiFetch(
      `/search/issues?q=${encodeURIComponent(noiseQ)}&per_page=1`,
      token
    );
    if (noiseRes.ok) {
      const noiseData = (await noiseRes.json()) as { total_count?: number };
      count = Math.max(0, count - (noiseData.total_count ?? 0));
    }
  }

  return count;
}

export async function fetchGitHubMergesSummary(): Promise<GitHubMergesSummary> {
  const repoFull = (process.env.GITHUB_REPO || DEFAULT_REPO).trim();
  const [owner, repo] = repoFull.split('/');
  const token = getGitHubToken();
  const developBranch = getDevelopBranch();
  const productionBranch = getProductionBranch();

  if (!owner || !repo) {
    return {
      repo: repoFull,
      configured: false,
      develop: [],
      production: [],
      develop_this_week: 0,
      production_this_week: 0,
      error: 'Invalid GITHUB_REPO format',
    };
  }

  if (!token) {
    return {
      repo: repoFull,
      configured: false,
      develop: [],
      production: [],
      develop_this_week: 0,
      production_this_week: 0,
      error: 'GITHUB_TOKEN not configured',
    };
  }

  try {
    const [develop, production, developThisWeek, productionThisWeek] = await Promise.all([
      fetchMergedPullRequests(owner, repo, developBranch, token),
      fetchMergedPullRequests(owner, repo, productionBranch, token),
      countMergedThisWeek(owner, repo, developBranch, token, false),
      countMergedThisWeek(owner, repo, productionBranch, token, false),
    ]);

    return {
      repo: repoFull,
      configured: true,
      develop,
      production,
      develop_this_week: developThisWeek,
      production_this_week: productionThisWeek,
    };
  } catch (err) {
    return {
      repo: repoFull,
      configured: Boolean(token),
      develop: [],
      production: [],
      develop_this_week: 0,
      production_this_week: 0,
      error: err instanceof Error ? err.message : 'Failed to fetch GitHub merges',
    };
  }
}

export interface WeeklyCompletionBucket {
  label: string;
  count: number;
  isCurrent: boolean;
}

export function buildWeeklyCompletionBuckets(
  tickets: Array<{ status: string; resolved_at: string | null; updated_at: string }>,
  weekCount = 4
): WeeklyCompletionBucket[] {
  const done = tickets.filter(t => t.status === 'done');
  const thisWeekStart = startOfWeek(new Date());

  return Array.from({ length: weekCount }, (_, i) => {
    const start = new Date(thisWeekStart);
    start.setDate(start.getDate() - (weekCount - 1 - i) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const isCurrent = i === weekCount - 1;

    const count = done.filter(t => {
      const resolved = new Date(t.resolved_at || t.updated_at);
      return resolved >= start && resolved < end;
    }).length;

    const label = isCurrent
      ? 'This week'
      : start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return { label, count, isCurrent };
  });
}
