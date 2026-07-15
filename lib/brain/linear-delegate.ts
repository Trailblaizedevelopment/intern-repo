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

export interface LinearIssueSummary {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description: string | null;
}

export interface LinearIssueCommentDigest {
  author: string;
  body: string;
  createdAt: string;
}

export interface LinearIssueStatusBundle {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description: string | null;
  stateName: string;
  stateType: string;
  assigneeName: string | null;
  delegateName: string | null;
  comments: LinearIssueCommentDigest[];
  attachmentUrls: string[];
}

/** Fetch title/url for Slack confirm (Path A). */
export async function fetchLinearIssueSummary(
  linearIdentifier: string
): Promise<LinearIssueSummary | null> {
  const status = await fetchLinearIssueStatusBundle(linearIdentifier);
  if (!status) return null;
  return {
    id: status.id,
    identifier: status.identifier,
    title: status.title,
    url: status.url,
    description: status.description,
  };
}

/** Full status bundle for Lookup progress reports (TRA-901). */
export async function fetchLinearIssueStatusBundle(
  linearIdentifier: string
): Promise<LinearIssueStatusBundle | null> {
  const parsed = parseLinearIdentifier(linearIdentifier);
  if (!parsed) return null;

  try {
    const data = await linearGQLWithApiKey<{
      issues: {
        nodes: Array<{
          id: string;
          identifier: string;
          title: string;
          description: string | null;
          url: string;
          state: { name: string; type: string } | null;
          assignee: { name: string; displayName: string } | null;
          delegate: { name: string; displayName: string } | null;
          comments: {
            nodes: Array<{
              body: string;
              createdAt: string;
              user: { name: string; displayName: string } | null;
            }>;
          };
          attachments: { nodes: Array<{ url: string; title: string | null }> };
        }>;
      };
    }>(
      `query($filter: IssueFilter!) {
        issues(filter: $filter, first: 1) {
          nodes {
            id
            identifier
            title
            description
            url
            state { name type }
            assignee { name displayName }
            delegate { name displayName }
            comments(first: 12, orderBy: createdAt) {
              nodes {
                body
                createdAt
                user { name displayName }
              }
            }
            attachments {
              nodes { url title }
            }
          }
        }
      }`,
      {
        filter: {
          number: { eq: parsed.number },
          team: { key: { eq: parsed.teamKey } },
        },
      }
    );

    const issue = data.issues.nodes[0];
    if (!issue) return null;

    const person = (u: { name: string; displayName: string } | null): string | null => {
      if (!u) return null;
      return u.displayName || u.name || null;
    };

    return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      url: issue.url,
      description: issue.description,
      stateName: issue.state?.name || 'Unknown',
      stateType: issue.state?.type || 'unknown',
      assigneeName: person(issue.assignee),
      delegateName: person(issue.delegate),
      comments: (issue.comments?.nodes || [])
        .slice()
        .reverse()
        .map(c => ({
          author: person(c.user) || 'Unknown',
          body: (c.body || '').trim(),
          createdAt: c.createdAt,
        }))
        .filter(c => c.body.length > 0),
      attachmentUrls: (issue.attachments?.nodes || [])
        .map(a => a.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0),
    };
  } catch {
    return null;
  }
}

export function isLinearCursorDelegateEnabled(): boolean {
  return process.env.BRAIN_LINEAR_DELEGATE_CURSOR === 'true';
}

/**
 * Delegate a Linear issue to the Cursor app user (triggers Linear ↔ Cursor integration).
 * Set LINEAR_CURSOR_DELEGATE_ID if auto-lookup fails.
 *
 * @param options.required — when true (Path A), fail instead of silently skipping if env is off.
 */
export async function delegateLinearIssueToCursor(
  linearIdentifier: string,
  options?: { required?: boolean }
): Promise<DelegateToCursorResult> {
  if (!isLinearCursorDelegateEnabled()) {
    if (options?.required) {
      return {
        ok: false,
        error:
          'Linear Cursor delegate is disabled. Set BRAIN_LINEAR_DELEGATE_CURSOR=true on the Brain deployment.',
      };
    }
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
