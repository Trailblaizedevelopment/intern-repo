import {
  getDevelopBranch,
  getGitHubRepoFull,
  getGitHubToken,
  getProductionBranch,
  getPullRequest,
  getRepoFileContents,
  listMergedPullRequests,
  listOpenPullRequests,
  listRepoCommits,
  searchRepoCode,
  searchRepoCommits,
} from '../github-repo';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

const CONNECTOR_ID = 'github';
const DEFAULT_REPO = getGitHubRepoFull();

const TOOLS: ConnectorTool[] = [
  {
    name: 'github_list_open_prs',
    description:
      'List open GitHub pull requests on Trailblaize-Web. Use for ANY question about open PRs, pull requests, or what is in review on GitHub. Do NOT use Linear tools for PRs.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: `owner/repo (default ${DEFAULT_REPO})` },
        limit: { type: 'number', description: 'Max PRs to return (default 10, max 30)' },
      },
    },
  },
  {
    name: 'github_get_pr',
    description: 'Get details for one GitHub pull request by number on Trailblaize-Web.',
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'number', description: 'PR number' },
        repo: { type: 'string', description: 'owner/repo' },
      },
      required: ['number'],
    },
  },
  {
    name: 'github_search_code',
    description:
      'Search the Trailblaize-Web codebase on GitHub by keyword. Use for "where is X", "what file has Y", outreach sequences, profile cards, email templates, etc. Returns file paths — follow with github_get_file if needed.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords to search (e.g. "profile card", "outreach sequence email")',
        },
        repo: { type: 'string', description: 'owner/repo' },
        limit: { type: 'number', description: 'Max results (default 8, max 30)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_get_file',
    description:
      'Read a file from Trailblaize-Web at a repo path (e.g. src/components/ProfileCard.tsx). Use after github_search_code or when the user names a path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path in the repo' },
        ref: {
          type: 'string',
          description: `Branch or commit (default ${getDevelopBranch()})`,
        },
        repo: { type: 'string', description: 'owner/repo' },
      },
      required: ['path'],
    },
  },
  {
    name: 'github_list_commits',
    description:
      'List git commits on Trailblaize-Web for a date range. Use for "what committed last Thursday", recent history on develop, or commits touching a path. Pass since/until as ISO 8601 (Central → UTC).',
    inputSchema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO 8601 start (inclusive), e.g. 2026-07-03T05:00:00Z for Jul 3 CT midnight' },
        until: { type: 'string', description: 'ISO 8601 end (exclusive)' },
        branch: { type: 'string', description: `Branch (default ${getDevelopBranch()})` },
        path: { type: 'string', description: 'Only commits touching this file path' },
        limit: { type: 'number', description: 'Max commits (default 10)' },
        repo: { type: 'string', description: 'owner/repo' },
      },
    },
  },
  {
    name: 'github_list_merged_prs',
    description:
      'List merged pull requests on Trailblaize-Web (develop or main). Use for "what merged last week", production releases, or merge history.',
    inputSchema: {
      type: 'object',
      properties: {
        base: {
          type: 'string',
          description: `Target branch: ${getDevelopBranch()} or ${getProductionBranch()} (default ${getDevelopBranch()})`,
        },
        since: { type: 'string', description: 'ISO 8601 — only merges after this time' },
        until: { type: 'string', description: 'ISO 8601 — only merges before this time' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        repo: { type: 'string', description: 'owner/repo' },
      },
    },
  },
  {
    name: 'github_search_commits',
    description:
      'Search commit messages by keyword (e.g. "devtools", "profile card", "outreach"). Optional since/until as YYYY-MM-DD for committer-date filter.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword(s) in commit message' },
        since: { type: 'string', description: 'Start date YYYY-MM-DD' },
        until: { type: 'string', description: 'End date YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max results (default 8)' },
        repo: { type: 'string', description: 'owner/repo' },
      },
      required: ['query'],
    },
  },
];

function resolveRepo(input?: unknown): string | undefined {
  return typeof input === 'string' && input.trim() ? input.trim() : undefined;
}

export const githubConnector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'GitHub (Trailblaize-Web)',
  kind: 'in-process',

  isAvailable() {
    return Boolean(getGitHubToken());
  },

  async listTools(): Promise<ConnectorTool[]> {
    return TOOLS;
  },

  async callTool(toolName: string, input: Record<string, unknown>): Promise<ConnectorCallResult> {
    try {
      const repo = resolveRepo(input.repo);

      if (toolName === 'github_list_open_prs') {
        const data = await listOpenPullRequests({
          repoFull: repo,
          limit: Number(input.limit) || 10,
        });
        return { ok: true, data };
      }

      if (toolName === 'github_get_pr') {
        const num = Number(input.number);
        if (!num) return { ok: false, error: 'number is required' };
        const data = await getPullRequest(num, repo);
        return { ok: true, data };
      }

      if (toolName === 'github_search_code') {
        const query = typeof input.query === 'string' ? input.query.trim() : '';
        if (!query) return { ok: false, error: 'query is required' };
        const data = await searchRepoCode(query, {
          repoFull: repo,
          limit: Number(input.limit) || 8,
        });
        return { ok: true, data };
      }

      if (toolName === 'github_get_file') {
        const path = typeof input.path === 'string' ? input.path.trim() : '';
        if (!path) return { ok: false, error: 'path is required' };
        const ref = typeof input.ref === 'string' ? input.ref.trim() : undefined;
        const data = await getRepoFileContents(path, { repoFull: repo, ref });
        return { ok: true, data };
      }

      if (toolName === 'github_list_commits') {
        const since = typeof input.since === 'string' ? input.since.trim() : undefined;
        const until = typeof input.until === 'string' ? input.until.trim() : undefined;
        const branch = typeof input.branch === 'string' ? input.branch.trim() : undefined;
        const path = typeof input.path === 'string' ? input.path.trim() : undefined;
        const data = await listRepoCommits({
          repoFull: repo,
          branch,
          since,
          until,
          path,
          limit: Number(input.limit) || 10,
        });
        return { ok: true, data };
      }

      if (toolName === 'github_list_merged_prs') {
        const base = typeof input.base === 'string' ? input.base.trim() : undefined;
        const since = typeof input.since === 'string' ? input.since.trim() : undefined;
        const until = typeof input.until === 'string' ? input.until.trim() : undefined;
        const data = await listMergedPullRequests({
          repoFull: repo,
          base,
          since,
          until,
          limit: Number(input.limit) || 10,
        });
        return { ok: true, data };
      }

      if (toolName === 'github_search_commits') {
        const query = typeof input.query === 'string' ? input.query.trim() : '';
        if (!query) return { ok: false, error: 'query is required' };
        const since = typeof input.since === 'string' ? input.since.trim() : undefined;
        const until = typeof input.until === 'string' ? input.until.trim() : undefined;
        const data = await searchRepoCommits(query, {
          repoFull: repo,
          since,
          until,
          limit: Number(input.limit) || 8,
        });
        return { ok: true, data };
      }

      return { ok: false, error: `Unknown tool: ${toolName}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'GitHub call failed' };
    }
  },
};
