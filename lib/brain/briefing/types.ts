export interface BriefingIssue {
  identifier: string;
  title: string;
  priority: number;
  priorityLabel: string;
  dueDate: string | null;
  estimate: number | null;
  stateName: string;
  stateType: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  url: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface BriefingSnapshot {
  generatedAt: string;
  timezone: string;
  briefingDateLabel: string;
  yesterdayLabel: string;
  teamKey: string | null;
  focusAssigneeEmail: string | null;
  active: BriefingIssue[];
  completedYesterday: BriefingIssue[];
  dueToday: BriefingIssue[];
  overdue: BriefingIssue[];
  countsByState: Record<string, number>;
}

export interface MorningBriefingResult {
  snapshot: BriefingSnapshot;
  message: string;
  slack: {
    attempted: boolean;
    ok: boolean;
    targets: string[];
    error?: string;
  };
}

export interface RunMorningBriefingOptions {
  /** Print message only — do not post to Slack. */
  dryRun?: boolean;
  /** Force Slack post even when dryRun is false default path. */
  postToSlack?: boolean;
}
