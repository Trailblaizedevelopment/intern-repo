import type { SupabaseClient } from '@supabase/supabase-js';
import { linearGQLWithApiKey } from '@/lib/linear';
import {
  mapTicketPriorityToLinearPriority,
  mapTicketTypeToLinearLabel,
  type TicketPriority,
  type TicketType,
} from '@/lib/linear-ticket-map';
import {
  getLinearMobileProjectId,
  getLinearMobileProjectName,
  mapCrmAppToLinearProjectName,
} from '@/lib/linear-project-map';

export const LINEAR_TEAM_ID = 'ba3a89b4-61f0-4a3e-85e4-b264de5cb592';

export interface CreateLinearIssueInput {
  title: string;
  description?: string | null;
  type?: TicketType;
  priority?: TicketPriority;
  assigneeEmail?: string | null;
  dueDate?: string | null;
  /** CRM App tab: Web App | Mobile App — drives default Linear project when linearProjectId is unset. */
  app?: string | null;
  /** Explicit Linear project UUID (overrides app-based project resolution). */
  linearProjectId?: string | null;
  parentLinearIssueId?: string | null;
  labelNames?: string[];
  teamId?: string;
}

export interface CreatedLinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  priority?: number | null;
  priority_label?: string | null;
  state_type?: string | null;
  state_name?: string | null;
  assignee_email?: string | null;
  project_name?: string | null;
  estimate?: number | null;
  due_date?: string | null;
  url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  label_names?: string[];
}

interface LinearIssueCreateResponse {
  issueCreate?: {
    success?: boolean;
    issue?: {
      id: string;
      identifier: string;
      title: string;
      description?: string | null;
      priority?: number | null;
      priorityLabel?: string | null;
      url?: string | null;
      estimate?: number | null;
      dueDate?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
      state?: { id?: string; name?: string; color?: string; type?: string } | null;
      assignee?: { id?: string; name?: string; email?: string } | null;
      creator?: { id?: string; name?: string } | null;
      project?: { id?: string; name?: string } | null;
      labels?: { nodes?: { id: string; name: string }[] } | null;
    };
  };
}

/** Strip rich-text HTML for Linear markdown description. */
export function htmlToLinearDescription(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function resolveLinearUserIdByEmail(email: string): Promise<string | null> {
  const query = `
    query($filter: UserFilter) {
      users(filter: $filter, first: 1) {
        nodes { id }
      }
    }
  `;
  const result = await linearGQLWithApiKey<{
    users?: { nodes: { id: string }[] };
  }>(query, { filter: { email: { eq: email } } });
  return result?.users?.nodes?.[0]?.id ?? null;
}

async function resolveLinearProjectId(
  supabase: SupabaseClient,
  linearProjectName?: string | null
): Promise<string | null> {
  if (!linearProjectName?.trim()) return null;

  const mobileProjectId = getLinearMobileProjectId();
  const mobileProjectName = getLinearMobileProjectName();
  if (
    mobileProjectId &&
    linearProjectName.trim().toLowerCase() === mobileProjectName.toLowerCase()
  ) {
    return mobileProjectId;
  }

  const { data } = await supabase
    .from('linear_projects')
    .select('id')
    .ilike('name', linearProjectName.trim())
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolveLinearLabelIds(
  supabase: SupabaseClient,
  labelNames: string[]
): Promise<string[]> {
  const unique = [...new Set(labelNames.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const { data } = await supabase
    .from('linear_labels')
    .select('id, name')
    .in('name', unique);

  const ids: string[] = [];
  for (const name of unique) {
    const row = (data ?? []).find((l) => l.name === name);
    if (row?.id) ids.push(row.id);
  }
  return ids;
}

function toCreatedLinearIssue(
  issue: NonNullable<LinearIssueCreateResponse['issueCreate']>['issue']
): CreatedLinearIssue {
  const labelNames = issue?.labels?.nodes?.map((l) => l.name) ?? [];
  return {
    id: issue!.id,
    identifier: issue!.identifier,
    title: issue!.title,
    description: issue!.description ?? null,
    priority: issue!.priority ?? null,
    priority_label: issue!.priorityLabel ?? null,
    state_type: issue!.state?.type ?? null,
    state_name: issue!.state?.name ?? null,
    assignee_email: issue!.assignee?.email ?? null,
    project_name: issue!.project?.name ?? null,
    estimate: issue!.estimate ?? null,
    due_date: issue!.dueDate ?? null,
    url: issue!.url ?? null,
    created_at: issue!.createdAt ?? null,
    updated_at: issue!.updatedAt ?? null,
    label_names: labelNames,
  };
}

/**
 * Create an issue in Linear via API key. Resolves assignee, project, and labels from CRM context.
 */
export async function createLinearIssue(
  supabase: SupabaseClient,
  input: CreateLinearIssueInput
): Promise<CreatedLinearIssue> {
  const teamId = input.teamId ?? LINEAR_TEAM_ID;
  const labelNames = [...(input.labelNames ?? [])];
  const typeLabel = input.type ? mapTicketTypeToLinearLabel(input.type) : null;
  if (typeLabel && !labelNames.includes(typeLabel)) {
    labelNames.unshift(typeLabel);
  }

  const linearProjectName = mapCrmAppToLinearProjectName(input.app);
  const [assigneeId, projectId, labelIds] = await Promise.all([
    input.assigneeEmail
      ? resolveLinearUserIdByEmail(input.assigneeEmail)
      : Promise.resolve(null),
    input.linearProjectId
      ? Promise.resolve(input.linearProjectId)
      : resolveLinearProjectId(supabase, linearProjectName),
    resolveLinearLabelIds(supabase, labelNames),
  ]);

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id identifier title description priority priorityLabel url
          estimate dueDate createdAt updatedAt
          state { id name color type }
          assignee { id name email }
          creator { id name }
          project { id name }
          labels { nodes { id name } }
        }
      }
    }
  `;

  const gqlInput: Record<string, unknown> = {
    teamId,
    title: input.title,
  };

  if (input.description?.trim()) {
    gqlInput.description = input.description;
  }
  if (input.priority) {
    gqlInput.priority = mapTicketPriorityToLinearPriority(input.priority);
  }
  if (assigneeId) gqlInput.assigneeId = assigneeId;
  if (projectId) gqlInput.projectId = projectId;
  if (input.parentLinearIssueId) gqlInput.parentId = input.parentLinearIssueId;
  if (labelIds.length > 0) gqlInput.labelIds = labelIds;
  if (input.dueDate) gqlInput.dueDate = input.dueDate;

  const result = await linearGQLWithApiKey<LinearIssueCreateResponse>(mutation, {
    input: gqlInput,
  });

  const created = result?.issueCreate?.issue;
  if (!result?.issueCreate?.success || !created?.id) {
    throw new Error('Linear issueCreate did not return an issue');
  }

  return toCreatedLinearIssue(created);
}

/** Upsert a newly created issue into `linear_issues` cache (best-effort). */
export async function cacheCreatedLinearIssue(
  supabase: SupabaseClient,
  issue: CreatedLinearIssue & {
    state_id?: string | null;
    state_color?: string | null;
    assignee_id?: string | null;
    assignee_name?: string | null;
    creator_id?: string | null;
    creator_name?: string | null;
    project_id?: string | null;
    team_id?: string;
  }
): Promise<void> {
  await supabase.from('linear_issues').upsert(
    {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? null,
      priority: issue.priority ?? null,
      priority_label: issue.priority_label ?? null,
      state_id: issue.state_id ?? null,
      state_name: issue.state_name ?? null,
      state_color: issue.state_color ?? null,
      state_type: issue.state_type ?? null,
      assignee_id: issue.assignee_id ?? null,
      assignee_name: issue.assignee_name ?? null,
      assignee_email: issue.assignee_email ?? null,
      creator_id: issue.creator_id ?? null,
      creator_name: issue.creator_name ?? null,
      team_id: issue.team_id ?? LINEAR_TEAM_ID,
      project_id: issue.project_id ?? null,
      estimate: issue.estimate ?? null,
      due_date: issue.due_date ?? null,
      url: issue.url ?? null,
      created_at: issue.created_at ?? null,
      updated_at: issue.updated_at ?? null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
}
