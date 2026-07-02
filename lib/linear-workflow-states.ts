import type { SupabaseClient } from '@supabase/supabase-js';
import { linearGQLWithApiKey } from '@/lib/linear';
import type { TicketStatus } from '@/lib/linear-ticket-map';

export const LINEAR_TEAM_ID = 'ba3a89b4-61f0-4a3e-85e4-b264de5cb592';

/** CRM Kanban status → preferred Linear workflow state display names (first match wins). */
export const TICKET_STATUS_TO_LINEAR_STATE_NAMES: Record<TicketStatus, string[]> = {
  backlog: ['Backlog'],
  todo: ['Todo'],
  open: ['Todo', 'Open'],
  in_progress: ['In Progress'],
  in_review: ['In Review'],
  testing: ['Testing', 'QA', 'In Review'],
  done: ['Done'],
  canceled: ['Canceled', 'Cancelled', 'Duplicate'],
};

/** Fallback when state name is missing from cache — Linear `state.type`. */
export const TICKET_STATUS_TO_LINEAR_STATE_TYPE: Partial<Record<TicketStatus, string>> = {
  backlog: 'backlog',
  todo: 'unstarted',
  open: 'unstarted',
  in_progress: 'started',
  in_review: 'started',
  testing: 'started',
  done: 'completed',
  canceled: 'canceled',
};

interface WorkflowStateRow {
  id: string;
  name: string;
  type: string | null;
}

/**
 * Fetch and cache workflow states for a Linear team.
 */
export async function syncLinearWorkflowStates(
  supabase: SupabaseClient,
  teamId: string
): Promise<number> {
  const query = `
    query($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name color type position } }
      }
    }
  `;
  const result = await linearGQLWithApiKey<{
    team?: { states?: { nodes: Array<{ id: string; name: string; color?: string; type?: string; position?: number }> } };
  }>(query, { teamId });

  const states = result?.team?.states?.nodes ?? [];
  const syncedAt = new Date().toISOString();

  for (const state of states) {
    await supabase.from('linear_workflow_states').upsert(
      {
        id: state.id,
        team_id: teamId,
        name: state.name,
        type: state.type ?? null,
        color: state.color ?? null,
        position: state.position ?? null,
        synced_at: syncedAt,
      },
      { onConflict: 'id' }
    );
  }

  return states.length;
}

/**
 * Resolve a Linear `stateId` for a CRM ticket status using cached workflow states.
 */
export async function resolveLinearStateIdForTicketStatus(
  supabase: SupabaseClient,
  teamId: string,
  status: TicketStatus
): Promise<string | null> {
  const { data: states, error } = await supabase
    .from('linear_workflow_states')
    .select('id, name, type')
    .eq('team_id', teamId);

  if (error || !states?.length) {
    return null;
  }

  const rows = states as WorkflowStateRow[];
  const nameCandidates = TICKET_STATUS_TO_LINEAR_STATE_NAMES[status] ?? [];

  for (const candidate of nameCandidates) {
    const match = rows.find((s) => s.name === candidate);
    if (match) return match.id;
  }

  const typeTarget = TICKET_STATUS_TO_LINEAR_STATE_TYPE[status];
  if (typeTarget) {
    const byType = rows.find((s) => (s.type ?? '').toLowerCase() === typeTarget);
    if (byType) return byType.id;
  }

  return null;
}
