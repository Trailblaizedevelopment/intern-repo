import { CommitSummary } from '../github-repo';
import { ParsedReleaseCommit } from './types';

const TRA_PATTERN = /\bTRA-\d+\b/gi;
const MERGE_PR_PATTERN = /^Merge pull request #(\d+)\b/i;
const CONVENTIONAL_PATTERN = /^(feat|fix|chore|docs|refactor|perf|test|style|ci|build)(\([^)]+\))?!?:\s*/i;

const AREA_BY_PREFIX: Record<string, string> = {
  auth: 'Auth',
  analytics: 'Analytics',
  ui: 'UI',
  api: 'API',
  db: 'Database',
  email: 'Email',
  outreach: 'Outreach',
};

function uniqueTickets(messages: string[]): string[] {
  const seen = new Set<string>();
  for (const msg of messages) {
    for (const match of msg.matchAll(TRA_PATTERN)) {
      seen.add(match[0].toUpperCase());
    }
  }
  return [...seen].sort();
}

function inferArea(message: string): string | null {
  const scopeMatch = message.match(/^[^:]+?\(([^)]+)\)/);
  const scope = scopeMatch?.[1]?.toLowerCase();
  if (scope && AREA_BY_PREFIX[scope]) return AREA_BY_PREFIX[scope];

  const lower = message.toLowerCase();
  for (const [key, label] of Object.entries(AREA_BY_PREFIX)) {
    if (lower.includes(key)) return label;
  }
  return null;
}

function stripConventionalPrefix(message: string): string {
  return message.replace(CONVENTIONAL_PATTERN, '').trim();
}

export function parseReleaseCommits(commits: CommitSummary[]): ParsedReleaseCommit[] {
  return commits.map(commit => {
    const mergeMatch = commit.message.match(MERGE_PR_PATTERN);
    const ticketIds = uniqueTickets([commit.message]);
    const kind: ParsedReleaseCommit['kind'] = mergeMatch ? 'merge' : ticketIds.length > 0 || CONVENTIONAL_PATTERN.test(commit.message)
      ? 'feature'
      : 'other';

    return {
      sha: commit.sha,
      short_sha: commit.short_sha,
      message: stripConventionalPrefix(commit.message),
      author: commit.author,
      url: commit.url,
      kind,
      ticketIds,
      area: inferArea(commit.message),
      mergedPrNumber: mergeMatch ? parseInt(mergeMatch[1], 10) : null,
    };
  });
}

export function snapshotFromCommits(
  commits: ParsedReleaseCommit[]
): { ticketIds: string[]; includedPrNumbers: number[]; featureCommits: ParsedReleaseCommit[] } {
  const ticketIds = uniqueTickets(commits.map(c => c.message));
  const includedPrNumbers = [
    ...new Set(commits.map(c => c.mergedPrNumber).filter((n): n is number => n != null)),
  ].sort((a, b) => a - b);
  const featureCommits = commits.filter(c => c.kind !== 'merge');

  return { ticketIds, includedPrNumbers, featureCommits };
}

export function commitsForPrompt(commits: ParsedReleaseCommit[]): Array<Record<string, unknown>> {
  return commits.map(c => ({
    message: c.message,
    author: c.author,
    short_sha: c.short_sha,
    kind: c.kind,
    ticket_ids: c.ticketIds,
    area: c.area,
    merged_pr: c.mergedPrNumber,
  }));
}
