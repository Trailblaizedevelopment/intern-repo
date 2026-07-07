import { CommitSummary, OpenPrSummary } from '../github-repo';

export interface ParsedReleaseCommit {
  sha: string;
  short_sha: string;
  message: string;
  author: string | null;
  url: string;
  kind: 'feature' | 'merge' | 'other';
  ticketIds: string[];
  area: string | null;
  mergedPrNumber: number | null;
}

export interface ReleasePrSnapshot {
  pr: OpenPrSummary;
  repo: string;
  commits: ParsedReleaseCommit[];
  ticketIds: string[];
  includedPrNumbers: number[];
  commitCount: number;
}

export interface ComposeReleasePrOptions {
  dryRun?: boolean;
}

export interface ReleasePrWatchResult {
  processed: boolean;
  skipped: boolean;
  reason?: string;
  prNumber?: number;
  prUrl?: string;
  description?: string;
  slack?: {
    attempted: boolean;
    ok: boolean;
    targets: string[];
    error?: string;
  };
}

export interface RunReleasePrWatchOptions {
  dryRun?: boolean;
  postToSlack?: boolean;
  force?: boolean;
  prNumber?: number;
}

export type { CommitSummary, OpenPrSummary };
