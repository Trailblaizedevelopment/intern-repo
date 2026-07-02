import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildTicketRowFromLinearIssue,
  type LinearIssueForTicket,
} from '@/lib/linear-ticket-map';

interface CachedLinearIssueRow {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  priority_label: string | null;
  state_type: string | null;
  state_name: string | null;
  assignee_email: string | null;
  estimate: number | null;
  due_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  linear_projects?: { name: string } | { name: string }[] | null;
}

function projectName(
  rel: CachedLinearIssueRow['linear_projects']
): string | null {
  if (!rel) return null;
  const row = Array.isArray(rel) ? rel[0] : rel;
  return row?.name ?? null;
}

/**
 * Upsert CRM `tickets` rows from cached `linear_issues` for a team.
 * Matches on `external_id` (Linear issue UUID).
 */
export async function reconcileLinearIssuesToTickets(
  supabase: SupabaseClient,
  teamId: string
): Promise<{ reconciled: number; errors: string[] }> {
  const errors: string[] = [];

  const { data: issues, error: issuesError } = await supabase
    .from('linear_issues')
    .select(`
      id, identifier, title, description, priority, priority_label,
      state_type, state_name, assignee_email,
      estimate, due_date, created_at, updated_at, completed_at, canceled_at,
      linear_projects ( name )
    `)
    .eq('team_id', teamId);

  if (issuesError) {
    throw new Error(issuesError.message);
  }

  const rows = (issues ?? []) as CachedLinearIssueRow[];
  if (rows.length === 0) {
    return { reconciled: 0, errors };
  }

  const issueIds = rows.map((r) => r.id);

  const { data: labelLinks, error: labelsError } = await supabase
    .from('linear_issue_labels')
    .select('issue_id, linear_labels ( name )')
    .in('issue_id', issueIds);

  if (labelsError) {
    throw new Error(labelsError.message);
  }

  const labelsByIssue = new Map<string, string[]>();
  for (const link of labelLinks ?? []) {
    const issueId = link.issue_id as string;
    const labelRel = link.linear_labels as { name: string } | { name: string }[] | null;
    const name = Array.isArray(labelRel) ? labelRel[0]?.name : labelRel?.name;
    if (!name) continue;
    const list = labelsByIssue.get(issueId) ?? [];
    list.push(name);
    labelsByIssue.set(issueId, list);
  }

  const { data: employees } = await supabase
    .from('employees')
    .select('id, email');

  const employeeByEmail: Record<string, string> = {};
  for (const emp of employees ?? []) {
    if (emp.email) {
      employeeByEmail[emp.email.toLowerCase()] = emp.id;
    }
  }

  const tickets = rows.map((row) => {
    const label_names = labelsByIssue.get(row.id) ?? [];
    const assigneeEmail = row.assignee_email?.toLowerCase() ?? '';
    const linearIssue: LinearIssueForTicket = {
      id: row.id,
      identifier: row.identifier,
      title: row.title,
      description: row.description,
      priority: row.priority,
      priority_label: row.priority_label,
      state_type: row.state_type,
      state_name: row.state_name,
      assignee_email: row.assignee_email,
      project_name: projectName(row.linear_projects),
      estimate: row.estimate,
      due_date: row.due_date,
      created_at: row.created_at,
      updated_at: row.updated_at,
      completed_at: row.completed_at,
      canceled_at: row.canceled_at,
      label_names,
    };

    return buildTicketRowFromLinearIssue(linearIssue, {
      assignee_id: assigneeEmail ? employeeByEmail[assigneeEmail] ?? null : null,
      project: projectName(row.linear_projects),
    });
  });

  const BATCH_SIZE = 50;
  let reconciled = 0;

  for (let i = 0; i < tickets.length; i += BATCH_SIZE) {
    const batch = tickets.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('tickets')
      .upsert(batch, { onConflict: 'external_id' })
      .select('id');

    if (error) {
      errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      reconciled += (data ?? []).length;
    }
  }

  return { reconciled, errors };
}
