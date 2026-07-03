import type { SupabaseClient } from '@supabase/supabase-js';
import { htmlToLinearDescription, resolveLinearLabelIds, resolveLinearUserIdByEmail } from '@/lib/linear-create-issue';
import {
  LINEAR_TEAM_ID,
  resolveLinearStateIdForTicketStatus,
} from '@/lib/linear-workflow-states';
import {
  mapTicketPriorityToLinearPriority,
  mapTicketTypeToLinearLabel,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from '@/lib/linear-ticket-map';
import { updateLinearIssueFields, type LinearIssueUpdateInput } from '@/lib/linear-update-issue';

interface TicketRow {
  external_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  type: string;
  assignee_id: string | null;
  due_date: string | null;
  labels: string[] | null;
}

interface PatchBody {
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  type?: string;
  assignee_id?: string | null;
  due_date?: string | null;
  labels?: string[];
}

/**
 * Push CRM ticket field changes to Linear for linked tickets.
 * Returns null when ticket is not Linear-linked or nothing to push.
 */
export async function pushTicketPatchToLinear(
  supabase: SupabaseClient,
  current: TicketRow,
  body: PatchBody
): Promise<LinearIssueUpdateInput | null> {
  if (!current.external_id) return null;

  const linearInput: LinearIssueUpdateInput = {};
  let hasChanges = false;

  if (body.title !== undefined && body.title !== current.title) {
    linearInput.title = body.title.trim();
    hasChanges = true;
  }

  if (body.description !== undefined && body.description !== current.description) {
    linearInput.description = body.description
      ? htmlToLinearDescription(body.description)
      : '';
    hasChanges = true;
  }

  if (body.priority !== undefined && body.priority !== current.priority) {
    linearInput.priority = mapTicketPriorityToLinearPriority(body.priority as TicketPriority);
    hasChanges = true;
  }

  if (body.status !== undefined && body.status !== current.status) {
    const stateId = await resolveLinearStateIdForTicketStatus(
      supabase,
      LINEAR_TEAM_ID,
      body.status as TicketStatus
    );
    if (!stateId) {
      throw new Error(
        `No Linear workflow state mapped for status "${body.status}". Run Sync with Linear first.`
      );
    }
    linearInput.stateId = stateId;
    hasChanges = true;
  }

  if (body.assignee_id !== undefined && body.assignee_id !== current.assignee_id) {
    if (body.assignee_id) {
      const { data: assignee } = await supabase
        .from('employees')
        .select('email')
        .eq('id', body.assignee_id)
        .maybeSingle();
      linearInput.assigneeId = assignee?.email
        ? await resolveLinearUserIdByEmail(assignee.email)
        : null;
    } else {
      linearInput.assigneeId = null;
    }
    hasChanges = true;
  }

  if (body.due_date !== undefined && body.due_date !== current.due_date) {
    linearInput.dueDate = body.due_date || null;
    hasChanges = true;
  }

  if (body.labels !== undefined) {
    const currentLabels = current.labels ?? [];
    const nextLabels = body.labels ?? [];
    const labelsChanged =
      currentLabels.length !== nextLabels.length ||
      currentLabels.some((label, index) => label !== nextLabels[index]);
    if (labelsChanged) {
      linearInput.labelIds = await resolveLinearLabelIds(supabase, nextLabels);
      hasChanges = true;
    }
  } else if (body.type !== undefined && body.type !== current.type) {
    const typeLabel = mapTicketTypeToLinearLabel(body.type as TicketType);
    if (typeLabel) {
      const mergedLabels = [...new Set([...(current.labels ?? []), typeLabel])];
      linearInput.labelIds = await resolveLinearLabelIds(supabase, mergedLabels);
      hasChanges = true;
    }
  }

  if (!hasChanges) return null;

  await updateLinearIssueFields(current.external_id, linearInput);

  if (linearInput.stateId) {
    await supabase
      .from('linear_issues')
      .update({
        state_id: linearInput.stateId,
        synced_at: new Date().toISOString(),
      })
      .eq('id', current.external_id);
  }

  return linearInput;
}
