/**
 * Shared utility functions used across pipeline, customer success, and other modules.
 * Consolidates duplicated helpers from pipeline/page.tsx, LeadDetailPanel.tsx, PipelineTreeView.tsx.
 */

/**
 * Format a number as USD currency.
 * Duplicated in 3+ files previously.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Pipeline stage ordering for consistent rendering and advancement logic.
 * Previously duplicated across pipeline/page.tsx and LeadDetailPanel.tsx.
 */
export const PIPELINE_STAGES = [
  'new_lead',
  'demo_booked',
  'first_demo',
  'second_call',
  'contract_sent',
  'closed_won',
  'closed_lost',
  'hold_off',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * Human-readable stage labels.
 */
export const STAGE_LABELS: Record<string, string> = {
  new_lead: '🎯 New Lead',
  demo_booked: '📅 Demo Booked',
  first_demo: '🎬 First Demo',
  second_call: '🤝 Second Call',
  contract_sent: '📝 Contract Sent',
  closed_won: '🏆 Closed Won',
  closed_lost: '❌ Closed Lost',
  hold_off: '⏸️ Hold Off',
};

/**
 * Get the next stage in the pipeline.
 * Returns null if already at final active stage (contract_sent) or terminal stage.
 */
export function getNextStage(currentStage: string): string | null {
  const advanceable = ['new_lead', 'demo_booked', 'first_demo', 'second_call', 'contract_sent'];
  const idx = advanceable.indexOf(currentStage);
  if (idx === -1 || idx >= advanceable.length - 1) return null;
  return advanceable[idx + 1];
}

/**
 * Ticket type and status constants.
 * Consolidates the source of truth for valid ticket types/statuses.
 */
export const TICKET_TYPES = [
  'bug',
  'feature_request',
  'issue',
  'improvement',
  'task',
  'epic',
] as const;

export const TICKET_STATUSES = [
  'backlog',
  'todo',
  'open',
  'in_progress',
  'in_review',
  'testing',
  'done',
  'canceled',
] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * Calculate relative time string (e.g., "in 3d", "2d ago").
 */
export function relativeTime(date: string | Date): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays > 0) return `in ${diffDays}d`;
  return `${Math.abs(diffDays)}d ago`;
}

/**
 * Pagination defaults.
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/**
 * Parse pagination params from URL search params.
 */
export function parsePagination(searchParams: URLSearchParams): { from: number; to: number; pageSize: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE)))
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { from, to, pageSize };
}
