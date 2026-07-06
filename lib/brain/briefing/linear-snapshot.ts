import { linearGQLWithApiKey } from '@/lib/linear';
import { BriefingIssue, BriefingSnapshot } from './types';
import { formatDateKey, formatDateLabel, getBrainTimezone } from './time';

const ACTIVE_STATE_TYPES = ['backlog', 'unstarted', 'started'];

interface GqlIssue {
  identifier: string;
  title: string;
  priority: number;
  priorityLabel: string;
  dueDate?: string | null;
  estimate?: number | null;
  updatedAt: string;
  completedAt?: string | null;
  url: string;
  state: { name: string; type: string };
  assignee?: { name: string; email: string } | null;
}

function toBriefingIssue(node: GqlIssue): BriefingIssue {
  return {
    identifier: node.identifier,
    title: node.title,
    priority: node.priority,
    priorityLabel: node.priorityLabel,
    dueDate: node.dueDate ?? null,
    estimate: node.estimate ?? null,
    stateName: node.state.name,
    stateType: node.state.type,
    assigneeName: node.assignee?.name ?? null,
    assigneeEmail: node.assignee?.email ?? null,
    url: node.url,
    updatedAt: node.updatedAt,
    completedAt: node.completedAt ?? null,
  };
}

function getYesterdayKey(timeZone: string): string {
  const today = formatDateKey(new Date(), timeZone);
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function buildTeamFilter(teamKey: string | null): Record<string, unknown> | undefined {
  if (!teamKey) return undefined;
  return { key: { eq: teamKey } };
}

async function fetchIssues(
  filter: Record<string, unknown>,
  first = 100
): Promise<BriefingIssue[]> {
  const query = `
    query($filter: IssueFilter, $first: Int) {
      issues(filter: $filter, first: $first, orderBy: updatedAt) {
        nodes {
          identifier
          title
          priority
          priorityLabel
          dueDate
          estimate
          updatedAt
          completedAt
          url
          state { name type }
          assignee { name email }
        }
      }
    }
  `;

  const data = await linearGQLWithApiKey<{ issues: { nodes: GqlIssue[] } }>(query, {
    filter,
    first,
  });
  return data.issues.nodes.map(toBriefingIssue);
}

/** Pull active board + yesterday completions from Linear GraphQL. */
export async function fetchBriefingSnapshot(): Promise<BriefingSnapshot> {
  const timeZone = getBrainTimezone();
  const now = new Date();
  const teamKey = (process.env.BRAIN_LINEAR_TEAM_KEY || 'TRA').trim() || null;
  const focusEmail = (process.env.BRAIN_BRIEFING_ASSIGNEE_EMAIL || 'devin@trailblaize.net').toLowerCase();
  const todayKey = formatDateKey(now, timeZone);
  const yesterdayKey = getYesterdayKey(timeZone);

  const teamFilter = buildTeamFilter(teamKey);

  const activeFilter: Record<string, unknown> = {
    state: { type: { in: ACTIVE_STATE_TYPES } },
  };
  if (teamFilter) activeFilter.team = teamFilter;

  const completedFilter: Record<string, unknown> = {
    state: { type: { eq: 'completed' } },
    completedAt: { gte: yesterdayKey, lt: todayKey },
  };
  if (teamFilter) completedFilter.team = teamFilter;

  const [active, completedYesterday] = await Promise.all([
    fetchIssues(activeFilter, 150),
    fetchIssues(completedFilter, 80),
  ]);

  const dueToday = active.filter(i => i.dueDate === todayKey);
  const overdue = active.filter(i => i.dueDate && i.dueDate < todayKey);

  const countsByState: Record<string, number> = {};
  for (const issue of active) {
    countsByState[issue.stateName] = (countsByState[issue.stateName] || 0) + 1;
  }

  return {
    generatedAt: now.toISOString(),
    timezone: timeZone,
    briefingDateLabel: formatDateLabel(now, timeZone),
    yesterdayLabel: formatDateLabel(
      new Date(new Date(`${yesterdayKey}T12:00:00Z`).getTime()),
      timeZone
    ),
    teamKey,
    focusAssigneeEmail: focusEmail,
    active,
    completedYesterday,
    dueToday,
    overdue,
    countsByState,
  };
}

/** Compact JSON for the LLM — caps list sizes. */
export function snapshotForPrompt(snapshot: BriefingSnapshot): Record<string, unknown> {
  const focusEmail = snapshot.focusAssigneeEmail;
  const myActive = snapshot.active.filter(
    i => i.assigneeEmail?.toLowerCase() === focusEmail
  );

  const pick = (issues: BriefingIssue[], limit: number) =>
    issues.slice(0, limit).map(i => ({
      id: i.identifier,
      title: i.title,
      state: i.stateName,
      priority: i.priorityLabel,
      due: i.dueDate,
      points: i.estimate,
      assignee: i.assigneeName,
    }));

  return {
    date: snapshot.briefingDateLabel,
    yesterday: snapshot.yesterdayLabel,
    team: snapshot.teamKey,
    focus_assignee: focusEmail,
    counts_by_state: snapshot.countsByState,
    completed_yesterday: pick(snapshot.completedYesterday, 25),
    due_today: pick(snapshot.dueToday, 20),
    overdue: pick(snapshot.overdue, 15),
    my_in_progress: pick(
      myActive.filter(i => i.stateType === 'started'),
      15
    ),
    my_todo: pick(
      myActive.filter(i => i.stateType === 'unstarted' || i.stateType === 'backlog'),
      15
    ),
    board_totals: {
      active: snapshot.active.length,
      completed_yesterday: snapshot.completedYesterday.length,
      due_today: snapshot.dueToday.length,
      overdue: snapshot.overdue.length,
    },
  };
}
