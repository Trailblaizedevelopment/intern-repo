import { linearGQLWithApiKey } from '@/lib/linear';

export interface LinearIssueStateUpdateResult {
  id: string;
  state_id: string | null;
  state_name: string | null;
  state_type: string | null;
}

/**
 * Update a Linear issue's workflow state via API key.
 */
export async function updateLinearIssueState(
  issueId: string,
  stateId: string
): Promise<LinearIssueStateUpdateResult> {
  const mutation = `
    mutation UpdateIssueState($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          state { id name type }
        }
      }
    }
  `;

  const result = await linearGQLWithApiKey<{
    issueUpdate?: {
      success?: boolean;
      issue?: { id: string; state?: { id: string; name: string; type: string } | null };
    };
  }>(mutation, { id: issueId, input: { stateId } });

  const issue = result?.issueUpdate?.issue;
  if (!result?.issueUpdate?.success || !issue?.id) {
    throw new Error('Linear issueUpdate did not succeed');
  }

  return {
    id: issue.id,
    state_id: issue.state?.id ?? null,
    state_name: issue.state?.name ?? null,
    state_type: issue.state?.type ?? null,
  };
}
