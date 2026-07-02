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
const PRODUCTION_BRANCH = process.env.GITHUB_PRODUCTION_BRANCH || 'main';
const DEVELOP_BRANCH = process.env.GITHUB_DEVELOP_BRANCH || 'develop';

function getGitHubToken(): string | null {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function countThisWeek(items: GitHubMergeItem[]): number {
  const weekStart = startOfWeek(new Date());
  return items.filter(item => new Date(item.merged_at) >= weekStart).length;
}

function isNoiseMergeTitle(title: string): boolean {
  return /^develop$/i.test(title.trim());
}

async function fetchMergedPullRequests(
  owner: string,
  repo: string,
  base: string,
  token: string | null,
  perPage = 20
): Promise<GitHubMergeItem[]> {
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/pulls`);
  url.searchParams.set('state', 'closed');
  url.searchParams.set('base', base);
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('direction', 'desc');
  url.searchParams.set('per_page', String(perPage));

  const headers: HeadersInit = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    headers,
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }

  const pulls = (await res.json()) as Array<{
    number: number;
    title: string;
    merged_at: string | null;
    html_url: string;
    user?: { login?: string } | null;
  }>;

  return pulls
    .filter(pull => pull.merged_at && !isNoiseMergeTitle(pull.title))
    .slice(0, 6)
    .map(pull => ({
      number: pull.number,
      title: pull.title,
      merged_at: pull.merged_at!,
      author: pull.user?.login ?? null,
      url: pull.html_url,
      base,
    }));
}

export async function fetchGitHubMergesSummary(): Promise<GitHubMergesSummary> {
  const repoFull = process.env.GITHUB_REPO || DEFAULT_REPO;
  const [owner, repo] = repoFull.split('/');
  const token = getGitHubToken();

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
    const [develop, production] = await Promise.all([
      fetchMergedPullRequests(owner, repo, DEVELOP_BRANCH, token),
      fetchMergedPullRequests(owner, repo, PRODUCTION_BRANCH, token),
    ]);

    return {
      repo: repoFull,
      configured: true,
      develop,
      production,
      develop_this_week: countThisWeek(develop),
      production_this_week: countThisWeek(production),
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
