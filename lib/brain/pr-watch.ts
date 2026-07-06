import { getGitHubRepoFull, getGitHubToken } from './github-repo';

export interface PrMergeStatus {
  number: number;
  url: string;
  merged: boolean;
  state: string;
  title: string | null;
  base: string | null;
}

export function parseGitHubPrUrl(
  prUrl: string
): { owner: string; repo: string; number: number } | null {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: parseInt(match[3], 10) };
}

/** Check whether a Cursor-opened PR has been merged to its base branch. */
export async function getPullRequestMergeStatus(prUrl: string): Promise<PrMergeStatus | null> {
  const token = getGitHubToken();
  const parsed = parseGitHubPrUrl(prUrl);
  if (!token || !parsed) return null;

  const res = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.number}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!res.ok) return null;

  const pr = (await res.json()) as {
    number: number;
    html_url: string;
    merged: boolean;
    state: string;
    title?: string;
    base?: { ref?: string };
  };

  return {
    number: pr.number,
    url: pr.html_url,
    merged: Boolean(pr.merged),
    state: pr.state,
    title: pr.title ?? null,
    base: pr.base?.ref ?? null,
  };
}

export function isPrMergedToIntegrationBranch(
  status: PrMergeStatus,
  integrationBranch: string | null | undefined
): boolean {
  if (!status.merged || !integrationBranch) return false;
  return status.base === integrationBranch;
}

/** @deprecated Use isPrMergedToIntegrationBranch — agents must not merge to develop. */
export function isPrMergedToDevelop(status: PrMergeStatus): boolean {
  const develop = process.env.GITHUB_DEVELOP_BRANCH || 'develop';
  return status.merged && status.base === develop;
}

export function isPrMergedToProtectedBranch(status: PrMergeStatus): boolean {
  if (!status.merged || !status.base) return false;
  const develop = process.env.GITHUB_DEVELOP_BRANCH || 'develop';
  const main = process.env.GITHUB_PRODUCTION_BRANCH || 'main';
  return status.base === develop || status.base === main;
}
