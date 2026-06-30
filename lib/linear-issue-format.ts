/** Cached `linear_issues` row (snake_case) with optional Supabase joins. */
export interface LinearIssueRow {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string | null;
  state_name?: string | null;
  state_color?: string | null;
  linear_projects?: { name: string } | { name: string }[] | null;
  linear_teams?: { name: string; key?: string } | { name: string; key?: string }[] | null;
}

/** Shape consumed by TicketBoard / LinearIssuesSection. */
export interface FormattedLinearIssue {
  id: string;
  identifier: string;
  title: string;
  priority: number;
  url: string;
  status: { name: string; color: string } | null;
  team: { name: string } | null;
  project: { name: string } | null;
}

function joinedName<T extends { name: string }>(
  rel: T | T[] | null | undefined
): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

export function formatCachedLinearIssue(row: LinearIssueRow): FormattedLinearIssue {
  const projectName = joinedName(row.linear_projects);
  const teamName = joinedName(row.linear_teams);

  return {
    id: row.id,
    identifier: row.identifier,
    title: row.title,
    priority: row.priority ?? 0,
    url: row.url ?? '',
    status: row.state_name
      ? { name: row.state_name, color: row.state_color || '#6b7280' }
      : null,
    team: teamName ? { name: teamName } : null,
    project: projectName ? { name: projectName } : null,
  };
}
