import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Trailblaize Brain — fixed skill registry (Phase 1: ticket triage).
 *
 * Skills are plain TypeScript functions exposed to the LLM as Anthropic tools.
 * No dynamic loading; the model can only call what is defined here.
 */

export interface SkillContext {
  supabase: SupabaseClient;
  /** Devin's employees.id — used to resolve "my tickets". */
  employeeId: string | null;
}

export interface SkillResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface SkillDefinition {
  name: string;
  description: string;
  /** Anthropic tool input_schema (JSON Schema). */
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>, ctx: SkillContext) => Promise<SkillResult>;
}

const ACTIVE_STATUSES = ['backlog', 'todo', 'open', 'in_progress', 'in_review', 'testing'];
const ALL_STATUSES = [...ACTIVE_STATUSES, 'done', 'canceled'];
const PRIORITIES = ['none', 'low', 'medium', 'high', 'critical'];

const TICKET_LIST_SELECT =
  'id, number, title, status, priority, type, due_date, story_points, labels, project, linear_identifier, linear_url, created_at, updated_at, ' +
  'assignee:employees!tickets_assignee_id_fkey(id, name, email)';

/** YYYY-MM-DD for "today" in Central Time (company timezone). */
function todayCentral(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

function isoDateOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Normalize due_date (date or timestamptz) to YYYY-MM-DD for comparisons. */
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

// ── query_tickets ────────────────────────────────────────────────────────────

const queryTickets: SkillDefinition = {
  name: 'query_tickets',
  description:
    'Search and filter CRM tickets (synced with Linear). Use for questions like "what is due this week", ' +
    '"my in-progress tickets", "open bugs", "overdue work". Returns up to 25 tickets sorted by due date then priority. ' +
    'Statuses: backlog, todo, open, in_progress, in_review, testing, done, canceled. "active" means all non-done, non-canceled.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: [...ALL_STATUSES, 'active'],
        description: 'Filter by status. Use "active" for all open work.',
      },
      priority: { type: 'string', enum: PRIORITIES },
      assignee_me: {
        type: 'boolean',
        description: 'True to only show tickets assigned to the current user (Devin).',
      },
      unassigned: { type: 'boolean', description: 'True to only show tickets with no assignee.' },
      overdue: {
        type: 'boolean',
        description: 'True to only show active tickets with a due date before today (Central Time).',
      },
      due_on: { type: 'string', description: 'Exact due date, YYYY-MM-DD.' },
      due_before: { type: 'string', description: 'Due date strictly before this date, YYYY-MM-DD.' },
      due_after: { type: 'string', description: 'Due date on or after this date, YYYY-MM-DD.' },
      search: { type: 'string', description: 'Free-text search in title/description.' },
      limit: { type: 'number', description: 'Max results, 1-25. Default 20.' },
    },
  },
  async execute(input, ctx) {
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
      // due_date may be stored as date or timestamptz — bound to the full day.
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
      data: {
        count: rows.length,
        today,
        tickets: rows.map(formatTicketRow),
      },
    };
  },
};

// ── get_ticket ───────────────────────────────────────────────────────────────

const getTicket: SkillDefinition = {
  name: 'get_ticket',
  description:
    'Fetch full detail for one ticket, including description and recent activity. ' +
    'Identifier can be a Linear identifier (TRA-123), a plain ticket number (238 or #238), a UUID, or a title fragment.',
  inputSchema: {
    type: 'object',
    properties: {
      identifier: { type: 'string', description: 'TRA-123, #238, 238, UUID, or title fragment.' },
    },
    required: ['identifier'],
  },
  async execute(input, ctx) {
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
};

// ── ticket_summary ───────────────────────────────────────────────────────────

const ticketSummary: SkillDefinition = {
  name: 'ticket_summary',
  description:
    'Aggregate snapshot of active tickets: counts by status and priority, overdue, due today, due within 7 days, ' +
    'and unassigned. Use for standup-style questions like "how does the board look" or "morning summary".',
  inputSchema: {
    type: 'object',
    properties: {
      assignee_me: {
        type: 'boolean',
        description: 'True to scope the summary to tickets assigned to the current user (Devin).',
      },
    },
  },
  async execute(input, ctx) {
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

// ── Registry ─────────────────────────────────────────────────────────────────

export const BRAIN_SKILLS: SkillDefinition[] = [queryTickets, getTicket, ticketSummary];

export function getSkill(name: string): SkillDefinition | undefined {
  return BRAIN_SKILLS.find(s => s.name === name);
}

/** Anthropic `tools` array for the Messages API. */
export function getAnthropicTools() {
  return BRAIN_SKILLS.map(s => ({
    name: s.name,
    description: s.description,
    input_schema: s.inputSchema,
  }));
}
