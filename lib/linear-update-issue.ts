import { linearGQLWithApiKey } from '@/lib/linear';

export interface LinearIssueUpdateInput {
  title?: string;
  description?: string;
  priority?: number;
  stateId?: string;
  assigneeId?: string | null;
  labelIds?: string[];
  dueDate?: string | null;
  estimate?: number | null;
}

export interface LinearIssueUpdateResult {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  priority?: number | null;
  state_id: string | null;
  state_name: string | null;
  state_type: string | null;
  assignee_email: string | null;
  due_date: string | null;
}

export interface LinearCommentCreateResult {
  id: string;
  body: string;
  created_at: string;
  user_name: string | null;
}

/**
 * Update a Linear issue via API key (title, description, priority, state, assignee, labels, due date).
 */
export async function updateLinearIssueFields(
  issueId: string,
  input: LinearIssueUpdateInput
): Promise<LinearIssueUpdateResult> {
  const gqlInput: Record<string, unknown> = {};

  if (input.title !== undefined) gqlInput.title = input.title;
  if (input.description !== undefined) gqlInput.description = input.description;
  if (input.priority !== undefined) gqlInput.priority = input.priority;
  if (input.stateId !== undefined) gqlInput.stateId = input.stateId;
  if (input.assigneeId !== undefined) gqlInput.assigneeId = input.assigneeId;
  if (input.labelIds !== undefined) gqlInput.labelIds = input.labelIds;
  if (input.dueDate !== undefined) gqlInput.dueDate = input.dueDate;
  if (input.estimate !== undefined) gqlInput.estimate = input.estimate;

  const mutation = `
    mutation UpdateIssueFields($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          identifier
          title
          description
          priority
          dueDate
          state { id name type }
          assignee { email }
        }
      }
    }
  `;

  const result = await linearGQLWithApiKey<{
    issueUpdate?: {
      success?: boolean;
      issue?: {
        id: string;
        identifier: string;
        title: string;
        description?: string | null;
        priority?: number | null;
        dueDate?: string | null;
        state?: { id: string; name: string; type: string } | null;
        assignee?: { email: string } | null;
      };
    };
  }>(mutation, { id: issueId, input: gqlInput });

  const issue = result?.issueUpdate?.issue;
  if (!result?.issueUpdate?.success || !issue?.id) {
    throw new Error('Linear issueUpdate did not succeed');
  }

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description ?? null,
    priority: issue.priority ?? null,
    state_id: issue.state?.id ?? null,
    state_name: issue.state?.name ?? null,
    state_type: issue.state?.type ?? null,
    assignee_email: issue.assignee?.email ?? null,
    due_date: issue.dueDate ?? null,
  };
}

/**
 * Update a Linear issue's workflow state via API key.
 */
export async function updateLinearIssueState(
  issueId: string,
  stateId: string
): Promise<Pick<LinearIssueUpdateResult, 'id' | 'state_id' | 'state_name' | 'state_type'>> {
  const updated = await updateLinearIssueFields(issueId, { stateId });
  return {
    id: updated.id,
    state_id: updated.state_id,
    state_name: updated.state_name,
    state_type: updated.state_type,
  };
}

/**
 * Permanently delete a Linear issue via API key.
 */
export async function deleteLinearIssue(issueId: string): Promise<void> {
  const mutation = `
    mutation DeleteIssue($id: String!) {
      issueDelete(id: $id) {
        success
      }
    }
  `;

  const result = await linearGQLWithApiKey<{
    issueDelete?: { success?: boolean };
  }>(mutation, { id: issueId });

  if (!result?.issueDelete?.success) {
    throw new Error('Linear issueDelete did not succeed');
  }
}

/**
 * Create a comment on a Linear issue via API key.
 */
export async function createLinearCommentWithApiKey(
  issueId: string,
  body: string
): Promise<LinearCommentCreateResult> {
  const mutation = `
    mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
          body
          createdAt
          user { name }
        }
      }
    }
  `;

  const result = await linearGQLWithApiKey<{
    commentCreate?: {
      success?: boolean;
      comment?: {
        id: string;
        body: string;
        createdAt: string;
        user?: { name?: string } | null;
      };
    };
  }>(mutation, { input: { issueId, body } });

  const comment = result?.commentCreate?.comment;
  if (!result?.commentCreate?.success || !comment?.id) {
    throw new Error('Linear commentCreate did not succeed');
  }

  return {
    id: comment.id,
    body: comment.body,
    created_at: comment.createdAt,
    user_name: comment.user?.name ?? null,
  };
}
