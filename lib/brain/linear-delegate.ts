import { linearGQLWithApiKey } from '@/lib/linear';

const CURSOR_DELEGATE_CACHE: { id: string | null; at: number } = { id: null, at: 0 };
const CACHE_TTL_MS = 60 * 60 * 1000;

function parseLinearIdentifier(identifier: string): { teamKey: string; number: number } | null {
  const match = identifier.trim().match(/^([A-Za-z]+)-(\d+)$/);
  if (!match) return null;
  return { teamKey: match[1].toUpperCase(), number: parseInt(match[2], 10) };
}

async function resolveCursorDelegateId(): Promise<string | null> {
  const fromEnv = process.env.LINEAR_CURSOR_DELEGATE_ID?.trim();
  if (fromEnv) return fromEnv;

  if (CURSOR_DELEGATE_CACHE.id && Date.now() - CURSOR_DELEGATE_CACHE.at < CACHE_TTL_MS) {
    return CURSOR_DELEGATE_CACHE.id;
  }

  const data = await linearGQLWithApiKey<{
    users: { nodes: Array<{ id: string; name: string; displayName: string }> };
  }>(
    `query {
      users(first: 50) {
        nodes { id name displayName }
      }
    }`
  );

  const cursorUser = data.users.nodes.find(
    u =>
      u.displayName?.toLowerCase() === 'cursor' ||
      u.name?.toLowerCase() === 'cursor' ||
      u.displayName?.toLowerCase().includes('cursor')
  );

  CURSOR_DELEGATE_CACHE.id = cursorUser?.id ?? null;
  CURSOR_DELEGATE_CACHE.at = Date.now();
  return CURSOR_DELEGATE_CACHE.id;
}

async function resolveIssueUuid(identifier: string): Promise<string | null> {
  const parsed = parseLinearIdentifier(identifier);
  if (!parsed) return null;

  const data = await linearGQLWithApiKey<{
    issues: { nodes: Array<{ id: string; identifier: string }> };
  }>(
    `query($filter: IssueFilter!) {
      issues(filter: $filter, first: 1) {
        nodes { id identifier }
      }
    }`,
    {
      filter: {
        number: { eq: parsed.number },
        team: { key: { eq: parsed.teamKey } },
      },
    }
  );

  return data.issues.nodes[0]?.id ?? null;
}

export interface DelegateToCursorResult {
  ok: boolean;
  issueId?: string;
  delegateId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Delegate a Linear issue to the Cursor app user (triggers Linear ↔ Cursor integration).
 * Set LINEAR_CURSOR_DELEGATE_ID if auto-lookup fails.
 */
export async function delegateLinearIssueToCursor(
  linearIdentifier: string
): Promise<DelegateToCursorResult> {
  if (process.env.BRAIN_LINEAR_DELEGATE_CURSOR !== 'true') {
    return { ok: true, skipped: true };
  }

  try {
    const [issueId, delegateId] = await Promise.all([
      resolveIssueUuid(linearIdentifier),
      resolveCursorDelegateId(),
    ]);

    if (!issueId) {
      return { ok: false, error: `Linear issue not found: ${linearIdentifier}` };
    }
    if (!delegateId) {
      return {
        ok: false,
        error:
          'Cursor delegate user not found in Linear. Set LINEAR_CURSOR_DELEGATE_ID or install Cursor Linear integration.',
      };
    }

    const result = await linearGQLWithApiKey<{
      issueUpdate: { success: boolean; issue?: { id: string; identifier: string } };
    }>(
      `mutation($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue { id identifier }
        }
      }`,
      { id: issueId, input: { delegateId } }
    );

    if (!result.issueUpdate.success) {
      return { ok: false, error: 'Linear issueUpdate delegate failed' };
    }

    return { ok: true, issueId, delegateId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Linear delegate failed' };
  }
}
