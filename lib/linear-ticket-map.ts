/**
 * Maps Linear issue fields to internal CRM `tickets` row shape.
 * Used by CSV import, sync→reconcile (phase 2), and dual-write create (phase 3).
 */

export type TicketStatus =
  | 'backlog'
  | 'todo'
  | 'open'
  | 'in_progress'
  | 'in_review'
  | 'testing'
  | 'done'
  | 'canceled';

export type TicketPriority = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type TicketType =
  | 'bug'
  | 'feature_request'
  | 'issue'
  | 'improvement'
  | 'task'
  | 'epic';

/** Linear workflow `state.type` → CRM Kanban status */
export const LINEAR_STATE_TYPE_TO_TICKET_STATUS: Record<string, TicketStatus> = {
  backlog: 'backlog',
  unstarted: 'todo',
  started: 'in_progress',
  completed: 'done',
  canceled: 'canceled',
  duplicate: 'canceled',
};

/** Linear workflow state display name → CRM status (CSV import + custom states) */
export const LINEAR_STATUS_NAME_TO_TICKET_STATUS: Record<string, TicketStatus> = {
  Backlog: 'backlog',
  Todo: 'todo',
  'In Progress': 'in_progress',
  'In Review': 'in_review',
  Done: 'done',
  Canceled: 'canceled',
  Cancelled: 'canceled',
  Duplicate: 'canceled',
};

/** Linear priority label (CSV / priorityLabel) → CRM priority */
export const LINEAR_PRIORITY_LABEL_TO_TICKET_PRIORITY: Record<string, TicketPriority> = {
  Urgent: 'critical',
  High: 'high',
  Medium: 'medium',
  Normal: 'medium',
  Low: 'low',
  'No priority': 'none',
};

/** Linear numeric priority (0–4) → CRM priority */
export const LINEAR_PRIORITY_NUMBER_TO_TICKET_PRIORITY: Record<number, TicketPriority> = {
  0: 'none',
  1: 'critical',
  2: 'high',
  3: 'medium',
  4: 'low',
};

export const LINEAR_LABEL_TO_TICKET_TYPE: Record<string, TicketType> = {
  Bug: 'bug',
  Critical: 'bug',
  Feature: 'feature_request',
  Enhancement: 'improvement',
  'Technical Debt': 'improvement',
  'tasks-mvp': 'task',
};

/** CRM priority → Linear numeric priority (0–4) */
export const TICKET_PRIORITY_TO_LINEAR_PRIORITY: Record<TicketPriority, number> = {
  none: 0,
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

/** CRM type → default Linear label name for issueCreate */
export const TICKET_TYPE_TO_LINEAR_LABEL: Partial<Record<TicketType, string>> = {
  bug: 'Bug',
  feature_request: 'Feature',
  improvement: 'Enhancement',
  task: 'tasks-mvp',
};

export function mapTicketPriorityToLinearPriority(priority: TicketPriority): number {
  return TICKET_PRIORITY_TO_LINEAR_PRIORITY[priority] ?? 0;
}

export function mapTicketTypeToLinearLabel(type: TicketType): string | null {
  return TICKET_TYPE_TO_LINEAR_LABEL[type] ?? null;
}

/** Cached `linear_issues` row or live API issue fields used for ticket upsert */
export interface LinearIssueForTicket {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  priority?: number | null;
  priority_label?: string | null;
  state_type?: string | null;
  state_name?: string | null;
  assignee_email?: string | null;
  creator_email?: string | null;
  project_name?: string | null;
  estimate?: number | null;
  due_date?: string | null;
  url?: string | null;
  url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  canceled_at?: string | null;
  label_names?: string[];
}

export interface TicketRowFromLinearOptions {
  assignee_id?: string | null;
  creator_id?: string | null;
  project?: string | null;
}

export function mapLinearStateToTicketStatus(
  stateType?: string | null,
  stateName?: string | null
): TicketStatus {
  if (stateName?.trim()) {
    const byName = LINEAR_STATUS_NAME_TO_TICKET_STATUS[stateName.trim()];
    if (byName) return byName;
  }
  if (stateType?.trim()) {
    const byType = LINEAR_STATE_TYPE_TO_TICKET_STATUS[stateType.trim().toLowerCase()];
    if (byType) return byType;
  }
  return 'open';
}

export function mapLinearPriorityToTicketPriority(
  priority?: number | null,
  priorityLabel?: string | null
): TicketPriority {
  if (priorityLabel?.trim()) {
    const byLabel = LINEAR_PRIORITY_LABEL_TO_TICKET_PRIORITY[priorityLabel.trim()];
    if (byLabel) return byLabel;
  }
  if (priority !== undefined && priority !== null) {
    const byNumber = LINEAR_PRIORITY_NUMBER_TO_TICKET_PRIORITY[priority];
    if (byNumber) return byNumber;
  }
  return 'none';
}

export function mapLinearLabelsToTicketType(labels: string[]): TicketType {
  for (const label of labels) {
    const ticketType = LINEAR_LABEL_TO_TICKET_TYPE[label];
    if (ticketType) return ticketType;
  }
  return 'issue';
}

/**
 * Parse Linear CSV date: "Thu Oct 23 2025 14:05:25 GMT+0000 (GMT)"
 */
export function parseLinearDate(dateStr: string): string | null {
  if (!dateStr?.trim()) return null;
  try {
    let clean = dateStr.trim();
    if (clean.includes('(')) {
      clean = clean.substring(0, clean.indexOf('(')).trim();
    }
    const dt = new Date(clean);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString();
  } catch {
    return null;
  }
}

/**
 * Build a `tickets` upsert payload from a Linear issue.
 * `external_id` = Linear issue UUID; `linear_identifier` = e.g. TRA-123.
 */
export function buildTicketRowFromLinearIssue(
  issue: LinearIssueForTicket,
  options: TicketRowFromLinearOptions = {}
): Record<string, unknown> {
  const labels = issue.label_names ?? [];
  const status = mapLinearStateToTicketStatus(issue.state_type, issue.state_name);
  const priority = mapLinearPriorityToTicketPriority(issue.priority, issue.priority_label);
  const type = mapLinearLabelsToTicketType(labels);

  let resolved_at: string | null = null;
  if (status === 'done' && issue.completed_at) resolved_at = issue.completed_at;
  if (status === 'canceled' && issue.canceled_at) resolved_at = issue.canceled_at;

  const row: Record<string, unknown> = {
    external_id: issue.id,
    linear_identifier: issue.identifier,
    linear_id: issue.id,
    linear_url: issue.url ?? null,
    title: issue.title,
    description: issue.description ?? null,
    type,
    priority,
    status,
    assignee_id: options.assignee_id ?? null,
    creator_id: options.creator_id ?? null,
    labels,
    project: options.project ?? issue.project_name ?? null,
    story_points: issue.estimate ?? null,
    due_date: issue.due_date ?? null,
    resolved_at,
  };

  if (issue.created_at) row.created_at = issue.created_at;
  if (issue.updated_at) row.updated_at = issue.updated_at;

  return row;
}

/** Match workspace search: TRA-123, tra-123 */
export function parseLinearIdentifierSearch(search: string): string | null {
  const match = search.trim().match(/^([A-Za-z]+)-(\d+)$/);
  if (!match) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}
