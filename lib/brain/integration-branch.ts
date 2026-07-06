import { getDevelopBranch, getGitHubRepoFull, getGitHubToken } from './github-repo';

function slugFromGoal(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 36);
}

/** Derive the human-reviewed integration branch for a task (not develop). */
export function deriveIntegrationBranch(
  linearIssueId?: string | null,
  goal?: string | null
): string {
  const slug = slugFromGoal(goal || 'work');
  const linear = linearIssueId?.trim();
  if (linear) {
    return `feature/${linear}-${slug}`;
  }
  return `feature/brain-${slug}`;
}

function parseRepo(): { owner: string; repo: string } | null {
  const [owner, repo] = getGitHubRepoFull().split('/');
  return owner && repo ? { owner, repo } : null;
}

async function ghApi(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getGitHubToken();
  if (!token) throw new Error('GITHUB_TOKEN not configured');
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
}

async function branchExists(owner: string, repo: string, branch: string): Promise<boolean> {
  const res = await ghApi(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  return res.ok;
}

/**
 * Create integration branch from develop if it does not exist.
 * Agents never merge to develop — they stack PRs into this branch.
 */
export async function ensureIntegrationBranchOnGitHub(
  integrationBranch: string
): Promise<{ ok: boolean; created: boolean; error?: string }> {
  const parsed = parseRepo();
  if (!parsed) return { ok: false, created: false, error: 'Invalid GITHUB_REPO' };

  const { owner, repo } = parsed;
  const develop = getDevelopBranch();

  if (await branchExists(owner, repo, integrationBranch)) {
    return { ok: true, created: false };
  }

  const baseRes = await ghApi(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(develop)}`);
  if (!baseRes.ok) {
    return { ok: false, created: false, error: `Base branch ${develop} not found` };
  }

  const baseData = (await baseRes.json()) as { object: { sha: string } };
  const createRes = await ghApi(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: `refs/heads/${integrationBranch}`,
      sha: baseData.object.sha,
    }),
  });

  if (!createRes.ok) {
    const body = await createRes.text();
    if (createRes.status === 422 && body.includes('Reference already exists')) {
      return { ok: true, created: false };
    }
    return { ok: false, created: false, error: `Create branch failed: ${body.slice(0, 200)}` };
  }

  return { ok: true, created: true };
}

export function getProtectedBranches(): string[] {
  const develop = getDevelopBranch();
  const main = process.env.GITHUB_PRODUCTION_BRANCH || 'main';
  return [develop, main, 'main', 'master'];
}

export function isProtectedTargetBranch(branch: string | null | undefined): boolean {
  if (!branch) return false;
  return getProtectedBranches().includes(branch);
}
