import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mapLinearPriorityToTicketPriority,
  mapLinearStateToTicketStatus,
} from '@/lib/linear-ticket-map';

interface TicketSnapshot {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  assignee_id: string | null;
}

interface LinearIssueSnapshot {
  title: string;
  description?: string | null;
  priority: number;
  priorityLabel?: string;
  state: { name: string; type: string };
  assignee?: { email?: string; name?: string } | null;
}

const LINEAR_METADATA = { source: 'linear' } as const;

/**
 * Log CRM activity entries when Linear pushes issue field changes via webhook.
 */
export async function logLinearIssueUpdateActivity(
  supabase: SupabaseClient,
  before: TicketSnapshot,
  issue: LinearIssueSnapshot
): Promise<void> {
  const entries: Array<{
    ticket_id: string;
    actor_id: null;
    action: string;
    from_value: string | null;
    to_value: string | null;
    metadata: Record<string, unknown>;
  }> = [];

  const nextStatus = mapLinearStateToTicketStatus(issue.state.type, issue.state.name);
  const nextPriority = mapLinearPriorityToTicketPriority(issue.priority, issue.priorityLabel ?? null);
  const nextDescription = issue.description ?? null;

  if (issue.title !== before.title) {
    entries.push({
      ticket_id: before.id,
      actor_id: null,
      action: 'title_changed',
      from_value: before.title,
      to_value: issue.title,
      metadata: LINEAR_METADATA,
    });
  }

  if (nextDescription !== before.description) {
    entries.push({
      ticket_id: before.id,
      actor_id: null,
      action: 'description_changed',
      from_value: before.description ? before.description.substring(0, 100) : null,
      to_value: nextDescription ? nextDescription.substring(0, 100) : null,
      metadata: LINEAR_METADATA,
    });
  }

  if (nextPriority !== before.priority) {
    entries.push({
      ticket_id: before.id,
      actor_id: null,
      action: 'priority_changed',
      from_value: before.priority,
      to_value: nextPriority,
      metadata: LINEAR_METADATA,
    });
  }

  if (nextStatus !== before.status) {
    entries.push({
      ticket_id: before.id,
      actor_id: null,
      action: 'status_changed',
      from_value: before.status,
      to_value: nextStatus,
      metadata: LINEAR_METADATA,
    });
  }

  const assigneeEmail = issue.assignee?.email?.toLowerCase() ?? null;
  let beforeAssigneeEmail: string | null = null;

  if (before.assignee_id) {
    const { data: beforeAssignee } = await supabase
      .from('employees')
      .select('email')
      .eq('id', before.assignee_id)
      .maybeSingle();
    beforeAssigneeEmail = beforeAssignee?.email?.toLowerCase() ?? null;
  }

  if (assigneeEmail !== beforeAssigneeEmail) {
    const { data: nextAssignee } = assigneeEmail
      ? await supabase.from('employees').select('id').ilike('email', assigneeEmail).maybeSingle()
      : { data: null };

    entries.push({
      ticket_id: before.id,
      actor_id: null,
      action: 'assigned',
      from_value: before.assignee_id,
      to_value: nextAssignee?.id ?? null,
      metadata: {
        ...LINEAR_METADATA,
        assignee_name: issue.assignee?.name ?? null,
      },
    });
  }

  if (entries.length === 0) return;

  await supabase.from('ticket_activity').insert(entries);
}
