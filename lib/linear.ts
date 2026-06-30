/**
 * Linear OAuth & API Integration
 * Handles authentication flow and API calls to Linear for issue tracking
 */

// Linear OAuth Configuration
export const LINEAR_CONFIG = {
  clientId: process.env.LINEAR_CLIENT_ID || '',
  clientSecret: process.env.LINEAR_CLIENT_SECRET || '',
  redirectUri: process.env.LINEAR_REDIRECT_URI || 'https://trailblaize.space/api/linear/callback',
  webhookSecret: process.env.LINEAR_WEBHOOK_SECRET || '',
  scopes: ['read', 'write', 'issues:create', 'comments:create'],
};

// Linear API base URL
const LINEAR_API_URL = 'https://api.linear.app';
const LINEAR_OAUTH_URL = 'https://linear.app/oauth';

/** Personal API key Authorization header (raw key or Bearer-prefixed). */
export function getLinearApiKeyHeader(): string {
  const key = (process.env.LINEAR_API_KEY || '').trim();
  if (!key) return '';
  return key.startsWith('Bearer ') ? key : key;
}

export function assertLinearApiKeyConfigured(): void {
  if (!getLinearApiKeyHeader()) {
    throw new Error('LINEAR_API_KEY is not configured');
  }
}

// Generate OAuth URL for user authorization
export function getLinearAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: LINEAR_CONFIG.clientId,
    redirect_uri: LINEAR_CONFIG.redirectUri,
    response_type: 'code',
    scope: LINEAR_CONFIG.scopes.join(','),
    ...(state && { state }),
  });

  return `${LINEAR_OAUTH_URL}/authorize?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeLinearCodeForTokens(code: string): Promise<LinearTokens> {
  const response = await fetch(`${LINEAR_API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: LINEAR_CONFIG.clientId,
      client_secret: LINEAR_CONFIG.clientSecret,
      redirect_uri: LINEAR_CONFIG.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.error || 'Failed to exchange code for tokens');
  }

  return response.json();
}

// Refresh access token using refresh token (Linear tokens don't expire, but keeping for future-proofing)
export async function refreshLinearAccessToken(refreshToken: string): Promise<LinearTokens> {
  const response = await fetch(`${LINEAR_API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: LINEAR_CONFIG.clientId,
      client_secret: LINEAR_CONFIG.clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Failed to refresh token');
  }

  return response.json();
}

// Revoke Linear token
export async function revokeLinearToken(accessToken: string): Promise<void> {
  await fetch(`${LINEAR_API_URL}/oauth/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: new URLSearchParams({
      token: accessToken,
    }),
  });
}

// Types
export interface LinearTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope: string;
}

export interface LinearUser {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  admin: boolean;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  state: string;
  startDate?: string;
  targetDate?: string;
  progress: number;
  teamIds: string[];
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  priorityLabel: string;
  state: {
    id: string;
    name: string;
    color: string;
    type: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  creator?: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  project?: {
    id: string;
    name: string;
  };
  labels: {
    nodes: Array<{
      id: string;
      name: string;
      color: string;
    }>;
  };
  estimate?: number;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  canceledAt?: string;
  url: string;
}

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  issue: {
    id: string;
    identifier: string;
  };
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface LinearAttachment {
  id: string;
  title: string;
  url: string;
  subtitle?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// Linear GraphQL API client
export async function linearGraphQL<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${LINEAR_API_URL}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.errors?.[0]?.message || 'GraphQL request failed');
  }

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(result.errors[0]?.message || 'GraphQL query error');
  }

  return result.data;
}

// Fetch current user info
export async function getLinearCurrentUser(accessToken: string): Promise<LinearUser> {
  const query = `
    query {
      viewer {
        id
        name
        displayName
        email
        avatarUrl
        admin
      }
    }
  `;

  const data = await linearGraphQL<{ viewer: LinearUser }>(accessToken, query);
  return data.viewer;
}

// Fetch user's teams
export async function getLinearTeams(accessToken: string): Promise<LinearTeam[]> {
  const query = `
    query {
      teams {
        nodes {
          id
          name
          key
          description
        }
      }
    }
  `;

  const data = await linearGraphQL<{ teams: { nodes: LinearTeam[] } }>(accessToken, query);
  return data.teams.nodes;
}

// Fetch projects
export async function getLinearProjects(accessToken: string, teamId?: string): Promise<LinearProject[]> {
  const query = `
    query($teamId: String) {
      projects(filter: { team: { id: { eq: $teamId } } }) {
        nodes {
          id
          name
          description
          icon
          color
          state
          startDate
          targetDate
          progress
          teams {
            nodes {
              id
            }
          }
        }
      }
    }
  `;

  const data = await linearGraphQL<{ projects: { nodes: LinearProject[] } }>(
    accessToken,
    query,
    teamId ? { teamId } : undefined
  );
  return data.projects.nodes;
}

// Fetch issues
export async function getLinearIssues(
  accessToken: string,
  options?: {
    teamId?: string;
    projectId?: string;
    assigneeId?: string;
    status?: string;
    first?: number;
  }
): Promise<LinearIssue[]> {
  const query = `
    query($filter: IssueFilter, $first: Int) {
      issues(filter: $filter, first: $first, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          description
          priority
          priorityLabel
          state {
            id
            name
            color
            type
          }
          assignee {
            id
            name
            email
            avatarUrl
          }
          creator {
            id
            name
          }
          team {
            id
            name
            key
          }
          project {
            id
            name
          }
          labels {
            nodes {
              id
              name
              color
            }
          }
          estimate
          dueDate
          createdAt
          updatedAt
          completedAt
          canceledAt
          url
        }
      }
    }
  `;

  const filter: Record<string, unknown> = {};
  
  if (options?.teamId) {
    filter.team = { id: { eq: options.teamId } };
  }
  if (options?.projectId) {
    filter.project = { id: { eq: options.projectId } };
  }
  if (options?.assigneeId) {
    filter.assignee = { id: { eq: options.assigneeId } };
  }
  if (options?.status) {
    filter.state = { type: { eq: options.status } };
  }

  const data = await linearGraphQL<{ issues: { nodes: LinearIssue[] } }>(
    accessToken,
    query,
    { filter: Object.keys(filter).length > 0 ? filter : undefined, first: options?.first || 50 }
  );
  return data.issues.nodes;
}

// Create issue
export async function createLinearIssue(
  accessToken: string,
  input: {
    teamId: string;
    title: string;
    description?: string;
    priority?: number;
    projectId?: string;
    assigneeId?: string;
    labelIds?: string[];
    estimate?: number;
    dueDate?: string;
  }
): Promise<LinearIssue> {
  const mutation = `
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          description
          priority
          priorityLabel
          state {
            id
            name
            color
            type
          }
          assignee {
            id
            name
            email
          }
          team {
            id
            name
            key
          }
          project {
            id
            name
          }
          labels {
            nodes {
              id
              name
              color
            }
          }
          createdAt
          url
        }
      }
    }
  `;

  const data = await linearGraphQL<{ issueCreate: { success: boolean; issue: LinearIssue } }>(
    accessToken,
    mutation,
    { input }
  );

  if (!data.issueCreate.success) {
    throw new Error('Failed to create issue');
  }

  return data.issueCreate.issue;
}

// Update issue
export async function updateLinearIssue(
  accessToken: string,
  issueId: string,
  input: {
    title?: string;
    description?: string;
    priority?: number;
    stateId?: string;
    assigneeId?: string;
    projectId?: string;
    labelIds?: string[];
    estimate?: number;
    dueDate?: string;
  }
): Promise<LinearIssue> {
  const mutation = `
    mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id
          identifier
          title
          description
          priority
          priorityLabel
          state {
            id
            name
            color
            type
          }
          assignee {
            id
            name
            email
          }
          team {
            id
            name
            key
          }
          url
        }
      }
    }
  `;

  const data = await linearGraphQL<{ issueUpdate: { success: boolean; issue: LinearIssue } }>(
    accessToken,
    mutation,
    { id: issueId, input }
  );

  if (!data.issueUpdate.success) {
    throw new Error('Failed to update issue');
  }

  return data.issueUpdate.issue;
}

// Create comment on issue
export async function createLinearComment(
  accessToken: string,
  issueId: string,
  body: string
): Promise<LinearComment> {
  const mutation = `
    mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment {
          id
          body
          createdAt
          updatedAt
          user {
            id
            name
            avatarUrl
          }
          issue {
            id
            identifier
          }
        }
      }
    }
  `;

  const data = await linearGraphQL<{ commentCreate: { success: boolean; comment: LinearComment } }>(
    accessToken,
    mutation,
    { input: { issueId, body } }
  );

  if (!data.commentCreate.success) {
    throw new Error('Failed to create comment');
  }

  return data.commentCreate.comment;
}

// Fetch workflow states for a team
export async function getLinearWorkflowStates(
  accessToken: string,
  teamId: string
): Promise<Array<{ id: string; name: string; color: string; type: string }>> {
  const query = `
    query($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            color
            type
          }
        }
      }
    }
  `;

  const data = await linearGraphQL<{ team: { states: { nodes: Array<{ id: string; name: string; color: string; type: string }> } } }>(
    accessToken,
    query,
    { teamId }
  );
  return data.team.states.nodes;
}

// Fetch labels for a team
export async function getLinearLabels(
  accessToken: string,
  teamId?: string
): Promise<LinearLabel[]> {
  const query = `
    query($teamId: String) {
      issueLabels(filter: { team: { id: { eq: $teamId } } }) {
        nodes {
          id
          name
          color
          description
        }
      }
    }
  `;

  const data = await linearGraphQL<{ issueLabels: { nodes: LinearLabel[] } }>(
    accessToken,
    query,
    teamId ? { teamId } : undefined
  );
  return data.issueLabels.nodes;
}

// Webhook signature verification
export function verifyLinearWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expectedSignature = hmac.digest('hex');
  
  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

// Webhook event types
export type LinearWebhookEventType =
  | 'Issue'
  | 'Comment'
  | 'Project'
  | 'ProjectUpdate'
  | 'IssueLabel'
  | 'Attachment';

export type LinearWebhookAction =
  | 'create'
  | 'update'
  | 'remove';

export interface LinearWebhookPayload {
  action: LinearWebhookAction;
  type: LinearWebhookEventType;
  data: Record<string, unknown>;
  createdAt: string;
  url?: string;
  organizationId: string;
  webhookId: string;
  webhookTimestamp: number;
}
