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
  const token = getGitHubToken();
  if (!token) return null;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!res.ok) return null;
  const text = await res.text();
  return text.slice(0, 6000);
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
