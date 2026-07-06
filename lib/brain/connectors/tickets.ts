import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

const CONNECTOR_ID = 'tickets';

const ACTIVE_STATUSES = ['backlog', 'todo', 'open', 'in_progress', 'in_review', 'testing'];
const ALL_STATUSES = [...ACTIVE_STATUSES, 'done', 'canceled'];
const PRIORITIES = ['none', 'low', 'medium', 'high', 'critical'];

const TICKET_LIST_SELECT =
  'id, number, title, status, priority, type, due_date, story_points, labels, project, linear_identifier, linear_url, created_at, updated_at, ' +
  'assignee:employees!tickets_assignee_id_fkey(id, name, email)';

function todayCentral(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function dueDay(due: string | null): string | null {
  if (!due) return null;
  return due.slice(0, 10);
}

type TicketRow = {
  id: string;
  number: number | null;
  title: string;
  status: string;
  priority: string | null;
  type: string | null;
  due_date: string | null;
  story_points: number | null;
  labels: string[] | null;
  project: string | null;
  linear_identifier: string | null;
  linear_url: string | null;
  created_at: string;
  updated_at: string;
  assignee: { id: string; name: string; email: string } | null;
};

function formatTicketRow(t: TicketRow) {
  return {
    id: t.id,
    number: t.number,
    linear: t.linear_identifier,
    title: t.title,
    status: t.status,
    priority: t.priority,
    type: t.type,
    due_date: dueDay(t.due_date),
    story_points: t.story_points,
    labels: t.labels || [],
    project: t.project,
    assignee: t.assignee?.name || null,
    linear_url: t.linear_url,
  };
}

type ToolHandler = (input: Record<string, unknown>, ctx: ConnectorContext) => Promise<ConnectorCallResult>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  query_tickets: async (input, ctx) => {
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 25);
    const today = todayCentral();

    let query = ctx.supabase.from('tickets').select(TICKET_LIST_SELECT);

    const status = typeof input.status === 'string' ? input.status : null;
    if (status === 'active') {
      query = query.in('status', ACTIVE_STATUSES);
    } else if (status && ALL_STATUSES.includes(status)) {
      query = query.eq('status', status);
    } else {
      query = query.neq('status', 'canceled');
    }

    const priority = typeof input.priority === 'string' ? input.priority : null;
    if (priority && PRIORITIES.includes(priority)) {
      query = query.eq('priority', priority);
    }

    if (input.assignee_me === true) {
      if (!ctx.employeeId) {
        return { ok: false, error: 'Could not resolve your employee record for "my tickets".' };
      }
      query = query.eq('assignee_id', ctx.employeeId);
    }
    if (input.unassigned === true) {
      query = query.is('assignee_id', null);
    }

    if (input.overdue === true) {
      query = query.lt('due_date', today).in('status', ACTIVE_STATUSES);
    }
    const dueOn = isoDateOrNull(input.due_on);
    if (dueOn) {
      query = query.gte('due_date', dueOn).lt('due_date', `${dueOn}T23:59:59.999`);
    }
    const dueBefore = isoDateOrNull(input.due_before);
    if (dueBefore) query = query.lt('due_date', dueBefore);
    const dueAfter = isoDateOrNull(input.due_after);
    if (dueAfter) query = query.gte('due_date', dueAfter);

    if (typeof input.search === 'string' && input.search.trim()) {
      const s = input.search.trim().replace(/[%,]/g, ' ');
      query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
    }

    const { data, error } = await query
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) return { ok: false, error: error.message };

    const rows = (data as unknown as TicketRow[]) || [];
    return {
      ok: true,
      data: { count: rows.length, today, tickets: rows.map(formatTicketRow) },
    };
  },

  get_ticket: async (input, ctx) => {
    const raw = String(input.identifier || '').trim();
    if (!raw) return { ok: false, error: 'identifier is required' };

    const select =
      '*, ' +
      'creator:employees!tickets_creator_id_fkey(id, name, email), ' +
      'assignee:employees!tickets_assignee_id_fkey(id, name, email), ' +
      'reviewer:employees!tickets_reviewer_id_fkey(id, name, email)';

    let query = ctx.supabase.from('tickets').select(select).limit(1);

    const linearMatch = raw.match(/^([A-Za-z]{2,5})-(\d+)$/);
    const numberMatch = raw.match(/^#?(\d+)$/);
    const isUuid = /^[0-9a-f-]{36}$/i.test(raw);

    if (linearMatch) {
      query = query.eq('linear_identifier', raw.toUpperCase());
    } else if (numberMatch) {
      query = query.eq('number', parseInt(numberMatch[1], 10));
    } else if (isUuid) {
      query = query.eq('id', raw);
    } else {
      query = query.ilike('title', `%${raw.replace(/[%,]/g, ' ')}%`);
    }

    const { data: rawData, error } = await query.maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!rawData) return { ok: false, error: `No ticket found for "${raw}"` };

    const data = rawData as unknown as TicketRow & {
      description: string | null;
      sprint: string | null;
      creator: { name?: string } | null;
      reviewer: { name?: string } | null;
    };

    const { data: activity } = await ctx.supabase
      .from('ticket_activity')
      .select('action, details, created_at')
      .eq('ticket_id', data.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const description: string = data.description || '';
    return {
      ok: true,
      data: {
        ticket: {
          ...formatTicketRow(data),
          description: description.length > 2000 ? `${description.slice(0, 2000)}…` : description,
          creator: data.creator?.name || null,
          reviewer: data.reviewer?.name || null,
          sprint: data.sprint,
          created_at: data.created_at,
          updated_at: data.updated_at,
        },
        recent_activity: activity || [],
      },
    };
  },

  ticket_summary: async (input, ctx) => {
    let query = ctx.supabase
      .from('tickets')
      .select(TICKET_LIST_SELECT)
      .in('status', ACTIVE_STATUSES)
      .limit(500);

    if (input.assignee_me === true) {
      if (!ctx.employeeId) {
        return { ok: false, error: 'Could not resolve your employee record for "my tickets".' };
      }
      query = query.eq('assignee_id', ctx.employeeId);
    }

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };

    const rows = (data as unknown as TicketRow[]) || [];
    const today = todayCentral();
    const weekOut = new Date(`${today}T00:00:00`);
    weekOut.setDate(weekOut.getDate() + 7);
    const weekOutDay = weekOut.toISOString().slice(0, 10);

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const overdue: TicketRow[] = [];
    const dueToday: TicketRow[] = [];
    const dueThisWeek: TicketRow[] = [];
    let unassigned = 0;

    for (const t of rows) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      const p = t.priority || 'none';
      byPriority[p] = (byPriority[p] || 0) + 1;
      if (!t.assignee) unassigned++;

      const day = dueDay(t.due_date);
      if (!day) continue;
      if (day < today) overdue.push(t);
      else if (day === today) dueToday.push(t);
      else if (day <= weekOutDay) dueThisWeek.push(t);
    }

    const brief = (list: TicketRow[]) =>
      list
        .sort((a, b) => (dueDay(a.due_date) || '').localeCompare(dueDay(b.due_date) || ''))
        .slice(0, 10)
        .map(formatTicketRow);

    return {
      ok: true,
      data: {
        today,
        scope: input.assignee_me === true ? 'my tickets' : 'all tickets',
        total_active: rows.length,
        by_status: byStatus,
        by_priority: byPriority,
        unassigned,
        overdue_count: overdue.length,
        overdue: brief(overdue),
        due_today: brief(dueToday),
        due_this_week: brief(dueThisWeek),
      },
    };
  },
};

const STATIC_TOOLS: ConnectorTool[] = [
  {
    name: `${CONNECTOR_ID}_query_tickets`,
    mcpName: 'query_tickets',
    description:
      '[CRM cache] Search and filter tickets synced from Linear. Fast local board data. ' +
      'Use for due dates, assignee filters, overdue, standup lists.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...ALL_STATUSES, 'active'] },
        priority: { type: 'string', enum: PRIORITIES },
        assignee_me: { type: 'boolean' },
        unassigned: { type: 'boolean' },
        overdue: { type: 'boolean' },
        due_on: { type: 'string' },
        due_before: { type: 'string' },
        due_after: { type: 'string' },
        search: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: `${CONNECTOR_ID}_get_ticket`,
    mcpName: 'get_ticket',
    description: '[CRM cache] Full ticket detail + recent activity. Identifier: TRA-123, #238, UUID, or title.',
    inputSchema: {
      type: 'object',
      properties: { identifier: { type: 'string' } },
      required: ['identifier'],
    },
  },
  {
    name: `${CONNECTOR_ID}_ticket_summary`,
    mcpName: 'ticket_summary',
    description: '[CRM cache] Aggregate board snapshot: counts, overdue, due today/week, unassigned.',
    inputSchema: {
      type: 'object',
      properties: { assignee_me: { type: 'boolean' } },
    },
  },
];

export const ticketsConnector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'CRM Tickets (Supabase)',
  kind: 'in-process',

  isAvailable() {
    return true;
  },

  async listTools() {
    return STATIC_TOOLS;
  },

  async callTool(toolName, input, ctx) {
    const mcpName = toolName.startsWith(`${CONNECTOR_ID}_`)
      ? toolName.slice(CONNECTOR_ID.length + 1)
      : toolName;
    const handler = TOOL_HANDLERS[mcpName];
    if (!handler) {
      return { ok: false, error: `Unknown tickets tool: ${toolName}` };
    }
    return handler(input, ctx);
  },
};
