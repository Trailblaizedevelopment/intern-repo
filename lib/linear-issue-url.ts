/**
 * Resolve the canonical Linear issue URL for a CRM ticket.
 * Prefers stored `linear_url` from the Linear API; falls back to identifier-based URL.
 */

export interface LinearTicketUrlFields {
  linear_url?: string | null;
  linear_identifier?: string | null;
  external_id?: string | null;
}

const DEFAULT_WORKSPACE =
  process.env.NEXT_PUBLIC_LINEAR_WORKSPACE?.trim() ||
  process.env.LINEAR_WORKSPACE_SLUG?.trim() ||
  'trailblaize';

export function resolveLinearTicketUrl(ticket: LinearTicketUrlFields): string | null {
  if (ticket.linear_url?.trim()) {
    return ticket.linear_url.trim();
  }

  const identifier = ticket.linear_identifier?.trim();
  if (identifier) {
    return `https://linear.app/${DEFAULT_WORKSPACE}/issue/${identifier}`;
  }

  const externalId = ticket.external_id?.trim();
  if (externalId) {
    return `https://linear.app/issue/${externalId}`;
  }

  return null;
}

export function hasLinearLink(ticket: LinearTicketUrlFields): boolean {
  return Boolean(resolveLinearTicketUrl(ticket));
}
