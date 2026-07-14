import { SupabaseClient } from '@supabase/supabase-js';
import {
  BrainConnector,
  ConnectorCallResult,
  ConnectorContext,
  ConnectorTool,
} from './types';

/**
 * Read-only Supabase connector for Brain.
 *
 * Only public views named `brain_v_*` are queryable.
 * Catalog is discovered via `brain_list_catalog()` RPC (auto-picks up new views).
 * Fallback static catalog ships for employees/contacts/chapters if RPC is missing.
 */

const CONNECTOR_ID = 'supabase';
const VIEW_PREFIX = 'brain_v_';
const HARD_MAX_ROWS = 25;
const TEXT_TRUNCATE = 500;
const CATALOG_CACHE_MS = 60_000;

const COLUMN_DENY =
  /^(password|passwd|secret|token|api_key|apikey|auth_user_id|ssn|webhook|private_key)$/i;
const COLUMN_DENY_SUBSTRING = /(password|secret|token|api[_-]?key|ssn)/i;

type FilterOp = 'eq' | 'ilike' | 'in' | 'gte' | 'lte' | 'is_null';

interface TableColumn {
  name: string;
  data_type?: string;
  udt_name?: string;
  description?: string;
}

export interface BrainViewEntry {
  name: string;
  description: string;
  columns: TableColumn[];
  searchable: string[];
  filterable: string[];
  defaultOrder: { column: string; ascending: boolean };
}

/** Shipped with code — used when migration/RPC not applied yet. */
const FALLBACK_CATALOG: BrainViewEntry[] = [
  {
    name: 'brain_v_employees',
    description: 'Internal team members (interns, engineers, founders, ops).',
    columns: [
      { name: 'id', data_type: 'uuid' },
      { name: 'name', data_type: 'text' },
      { name: 'email', data_type: 'text' },
      { name: 'role', data_type: 'text' },
      { name: 'department', data_type: 'text' },
      { name: 'status', data_type: 'text' },
      { name: 'start_date', data_type: 'date' },
      { name: 'created_at', data_type: 'timestamp with time zone' },
    ],
    searchable: ['name', 'email'],
    filterable: ['status', 'role', 'department'],
    defaultOrder: { column: 'name', ascending: true },
  },
  {
    name: 'brain_v_contacts',
    description: 'External pipeline contacts (presidents, advisors, FSL directors, etc.).',
    columns: [
      { name: 'id', data_type: 'uuid' },
      { name: 'name', data_type: 'text' },
      { name: 'email', data_type: 'text' },
      { name: 'phone', data_type: 'text' },
      { name: 'role', data_type: 'text' },
      { name: 'org_id', data_type: 'uuid' },
      { name: 'national_org_id', data_type: 'uuid' },
      { name: 'notes', data_type: 'text' },
      { name: 'created_at', data_type: 'timestamp with time zone' },
      { name: 'updated_at', data_type: 'timestamp with time zone' },
    ],
    searchable: ['name', 'email', 'phone'],
    filterable: ['role', 'org_id', 'national_org_id'],
    defaultOrder: { column: 'name', ascending: true },
  },
  {
    name: 'brain_v_chapters',
    description: 'Customer Success chapters — status/health/MRR summary.',
    columns: [
      { name: 'id', data_type: 'uuid' },
      { name: 'chapter_name', data_type: 'text' },
      { name: 'school', data_type: 'text' },
      { name: 'fraternity', data_type: 'text' },
      { name: 'contact_name', data_type: 'text' },
      { name: 'contact_email', data_type: 'text' },
      { name: 'status', data_type: 'text' },
      { name: 'health', data_type: 'text' },
      { name: 'mrr', data_type: 'numeric' },
      { name: 'onboarding_started', data_type: 'date' },
      { name: 'onboarding_completed', data_type: 'date' },
      { name: 'last_activity', data_type: 'date' },
      { name: 'next_action', data_type: 'text' },
      { name: 'created_at', data_type: 'timestamp with time zone' },
      { name: 'updated_at', data_type: 'timestamp with time zone' },
    ],
    searchable: ['chapter_name', 'school', 'fraternity', 'contact_name', 'contact_email'],
    filterable: ['status', 'health', 'school', 'fraternity'],
    defaultOrder: { column: 'chapter_name', ascending: true },
  },
];

let catalogCache: { entries: BrainViewEntry[]; expiresAt: number; source: 'rpc' | 'fallback' } | null =
  null;

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function maxRows(): number {
  return Math.min(envInt('BRAIN_SUPABASE_MAX_ROWS', HARD_MAX_ROWS), HARD_MAX_ROWS);
}

/** Optional env narrows discovered views (comma-separated short or brain_v_ names). */
function envViewFilter(): Set<string> | null {
  const raw = (process.env.BRAIN_SUPABASE_ALLOWED_TABLES || '').trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(',')
      .map(s => normalizeViewName(s.trim()))
      .filter(Boolean)
  );
}

export function normalizeViewName(raw: string): string {
  const name = raw.trim().toLowerCase();
  if (!name) return '';
  if (name.startsWith(VIEW_PREFIX)) return name;
  return `${VIEW_PREFIX}${name}`;
}

function isBrainViewName(name: string): boolean {
  return /^brain_v_[a-z][a-z0-9_]*$/.test(name);
}

function isDeniedColumn(name: string): boolean {
  return COLUMN_DENY.test(name) || COLUMN_DENY_SUBSTRING.test(name);
}

function isTextish(col: TableColumn): boolean {
  const t = `${col.data_type || ''} ${col.udt_name || ''}`.toLowerCase();
  return /text|char|name|citext/.test(t);
}

function isFilterableType(col: TableColumn): boolean {
  const t = `${col.data_type || ''} ${col.udt_name || ''}`.toLowerCase();
  if (/json|array|bytea|xml/.test(t)) return false;
  return true;
}

function deriveSearchable(columns: TableColumn[]): string[] {
  const preferred = ['name', 'email', 'phone', 'title', 'chapter_name', 'school', 'fraternity'];
  const names = columns.map(c => c.name).filter(n => !isDeniedColumn(n));
  const hits = preferred.filter(p => names.includes(p));
  if (hits.length > 0) return hits;
  return columns.filter(c => isTextish(c) && !isDeniedColumn(c.name)).map(c => c.name).slice(0, 5);
}

function deriveFilterable(columns: TableColumn[]): string[] {
  return columns
    .filter(c => !isDeniedColumn(c.name) && isFilterableType(c))
    .filter(c => !['notes', 'description', 'content', 'body'].includes(c.name))
    .map(c => c.name)
    .slice(0, 12);
}

function deriveDefaultOrder(columns: TableColumn[]): { column: string; ascending: boolean } {
  const names = columns.map(c => c.name);
  for (const pref of ['name', 'chapter_name', 'title', 'created_at', 'id']) {
    if (names.includes(pref)) return { column: pref, ascending: pref !== 'created_at' };
  }
  return { column: names[0] || 'id', ascending: true };
}

function enrichEntry(raw: {
  name: string;
  description?: string;
  columns?: TableColumn[];
}): BrainViewEntry | null {
  const name = normalizeViewName(raw.name);
  if (!isBrainViewName(name)) return null;

  const columns = (raw.columns || [])
    .map(c => ({
      name: String(c.name || '').trim(),
      data_type: c.data_type,
      udt_name: c.udt_name,
      description: c.description,
    }))
    .filter(c => c.name && !isDeniedColumn(c.name));

  if (columns.length === 0) return null;

  return {
    name,
    description: (raw.description || '').trim() || `Read-only Brain view ${name}`,
    columns,
    searchable: deriveSearchable(columns),
    filterable: deriveFilterable(columns),
    defaultOrder: deriveDefaultOrder(columns),
  };
}

function applyEnvFilter(entries: BrainViewEntry[]): BrainViewEntry[] {
  const filter = envViewFilter();
  if (!filter) return entries;
  return entries.filter(e => filter.has(e.name));
}

async function loadCatalog(
  supabase: SupabaseClient
): Promise<{ entries: BrainViewEntry[]; source: 'rpc' | 'fallback' }> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) {
    return { entries: catalogCache.entries, source: catalogCache.source };
  }

  const { data, error } = await supabase.rpc('brain_list_catalog');
  if (!error && data) {
    const rawList = Array.isArray(data) ? data : [];
    const entries = applyEnvFilter(
      rawList
        .map(item => enrichEntry(item as { name: string; description?: string; columns?: TableColumn[] }))
        .filter((e): e is BrainViewEntry => Boolean(e))
    );
    if (entries.length > 0) {
      catalogCache = { entries, expiresAt: Date.now() + CATALOG_CACHE_MS, source: 'rpc' };
      return { entries, source: 'rpc' };
    }
  }

  const entries = applyEnvFilter(FALLBACK_CATALOG.map(e => ({ ...e, columns: [...e.columns] })));
  catalogCache = { entries, expiresAt: Date.now() + CATALOG_CACHE_MS, source: 'fallback' };
  return { entries, source: 'fallback' };
}

/** Sync list for debug endpoints (fallback names; runtime may discover more via RPC). */
export function getAllowedSupabaseTables(): string[] {
  const filtered = applyEnvFilter(FALLBACK_CATALOG);
  return filtered.map(e => e.name);
}

export function invalidateSupabaseCatalogCache(): void {
  catalogCache = null;
}

function columnNames(entry: BrainViewEntry): string[] {
  return entry.columns.map(c => c.name);
}

function selectClause(entry: BrainViewEntry): string {
  return columnNames(entry).join(', ');
}

function sanitizeSearch(raw: string): string {
  return raw.trim().replace(/[%,]/g, ' ').slice(0, 120);
}

function truncateRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string' && value.length > TEXT_TRUNCATE) {
      out[key] = `${value.slice(0, TEXT_TRUNCATE)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function resolveTable(
  input: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<{ ok: true; entry: BrainViewEntry } | { ok: false; error: string }> {
  const raw = typeof input.table === 'string' ? input.table : '';
  const table = normalizeViewName(raw);
  if (!table) return { ok: false, error: 'table is required (e.g. brain_v_employees or employees)' };
  if (!isBrainViewName(table)) {
    return {
      ok: false,
      error: `Only brain_v_* views are readable. Got "${raw}".`,
    };
  }

  const { entries } = await loadCatalog(supabase);
  const entry = entries.find(e => e.name === table);
  if (!entry) {
    return {
      ok: false,
      error: `View "${table}" is not in the Brain catalog. Allowed: ${entries.map(e => e.name).join(', ') || '(none)'}`,
    };
  }
  return { ok: true, entry };
}

type FilterSpec = {
  column: string;
  op: FilterOp;
  value?: string | number | boolean | string[];
};

function parseFilters(
  raw: unknown,
  entry: BrainViewEntry
): { ok: true; filters: FilterSpec[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, filters: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'filters must be an array of { column, op, value? }' };
  }

  const allowedOps: FilterOp[] = ['eq', 'ilike', 'in', 'gte', 'lte', 'is_null'];
  const filters: FilterSpec[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'each filter must be an object' };
    }
    const f = item as Record<string, unknown>;
    const column = typeof f.column === 'string' ? f.column.trim() : '';
    const op = typeof f.op === 'string' ? (f.op.trim() as FilterOp) : null;

    if (!column || !entry.filterable.includes(column)) {
      return {
        ok: false,
        error: `Filter column "${column}" is not filterable on this view. Allowed: ${entry.filterable.join(', ')}`,
      };
    }
    if (!op || !allowedOps.includes(op)) {
      return { ok: false, error: `Invalid filter op "${String(f.op)}". Allowed: ${allowedOps.join(', ')}` };
    }
    if (op === 'is_null') {
      filters.push({ column, op });
      continue;
    }
    if (op === 'in') {
      if (!Array.isArray(f.value) || f.value.length === 0) {
        return { ok: false, error: 'in filters require a non-empty value array' };
      }
      filters.push({
        column,
        op,
        value: f.value.map(v => String(v)).slice(0, 50),
      });
      continue;
    }
    if (f.value === undefined || f.value === null) {
      return { ok: false, error: `Filter op "${op}" requires a value` };
    }
    if (typeof f.value === 'string' || typeof f.value === 'number' || typeof f.value === 'boolean') {
      filters.push({ column, op, value: f.value });
    } else {
      return { ok: false, error: `Unsupported filter value type for column "${column}"` };
    }
  }

  return { ok: true, filters };
}

function applyFilterSpecs<T extends object>(query: T, filters: FilterSpec[]): T {
  let q = query as T & {
    eq: (c: string, v: unknown) => T;
    ilike: (c: string, v: string) => T;
    in: (c: string, v: string[]) => T;
    gte: (c: string, v: unknown) => T;
    lte: (c: string, v: unknown) => T;
    is: (c: string, v: null) => T;
  };
  for (const f of filters) {
    if (f.op === 'eq') q = q.eq(f.column, f.value) as typeof q;
    else if (f.op === 'ilike') q = q.ilike(f.column, `%${String(f.value)}%`) as typeof q;
    else if (f.op === 'in') q = q.in(f.column, f.value as string[]) as typeof q;
    else if (f.op === 'gte') q = q.gte(f.column, f.value) as typeof q;
    else if (f.op === 'lte') q = q.lte(f.column, f.value) as typeof q;
    else if (f.op === 'is_null') q = q.is(f.column, null) as typeof q;
  }
  return q;
}

type ToolHandler = (input: Record<string, unknown>, ctx: ConnectorContext) => Promise<ConnectorCallResult>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  list_tables: async (_input, ctx) => {
    const { entries, source } = await loadCatalog(ctx.supabase);
    return {
      ok: true,
      data: {
        read_only: true,
        catalog_source: source,
        views_prefix: VIEW_PREFIX,
        max_rows: maxRows(),
        tables: entries.map(e => ({
          name: e.name,
          short_name: e.name.slice(VIEW_PREFIX.length),
          description: e.description,
          column_count: e.columns.length,
          searchable: e.searchable,
          filterable: e.filterable,
        })),
        note: 'Only brain_v_* views are readable. New views appear after CREATE VIEW brain_v_... in Supabase.',
      },
    };
  },

  describe_table: async (input, ctx) => {
    const resolved = await resolveTable(input, ctx.supabase);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const { entry } = resolved;
    return {
      ok: true,
      data: {
        table: entry.name,
        short_name: entry.name.slice(VIEW_PREFIX.length),
        description: entry.description,
        columns: entry.columns,
        searchable: entry.searchable,
        filterable: entry.filterable,
        default_order: entry.defaultOrder,
        max_rows: maxRows(),
      },
    };
  },

  query_rows: async (input, ctx) => {
    const resolved = await resolveTable(input, ctx.supabase);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const { entry } = resolved;

    const parsed = parseFilters(input.filters, entry);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), maxRows());
    const search =
      typeof input.search === 'string' && input.search.trim()
        ? sanitizeSearch(input.search)
        : null;

    if (search && entry.searchable.length === 0) {
      return { ok: false, error: `View "${entry.name}" does not support search` };
    }

    let query = ctx.supabase.from(entry.name).select(selectClause(entry));
    query = applyFilterSpecs(query, parsed.filters);

    if (search) {
      const ors = entry.searchable.map(col => `${col}.ilike.%${search}%`).join(',');
      query = query.or(ors);
    }

    const { data, error } = await query
      .order(entry.defaultOrder.column, { ascending: entry.defaultOrder.ascending })
      .limit(limit);

    if (error) return { ok: false, error: error.message };

    const rows = ((data as unknown as Record<string, unknown>[]) || []).map(truncateRow);
    return {
      ok: true,
      data: {
        table: entry.name,
        count: rows.length,
        limit,
        rows,
      },
    };
  },

  count_rows: async (input, ctx) => {
    const resolved = await resolveTable(input, ctx.supabase);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const { entry } = resolved;

    const parsed = parseFilters(input.filters, entry);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const search =
      typeof input.search === 'string' && input.search.trim()
        ? sanitizeSearch(input.search)
        : null;

    let query = ctx.supabase.from(entry.name).select(selectClause(entry), {
      count: 'exact',
      head: true,
    });
    query = applyFilterSpecs(query, parsed.filters);

    if (search) {
      if (entry.searchable.length === 0) {
        return { ok: false, error: `View "${entry.name}" does not support search` };
      }
      const ors = entry.searchable.map(col => `${col}.ilike.%${search}%`).join(',');
      query = query.or(ors);
    }

    const { count, error } = await query;
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      data: {
        table: entry.name,
        count: count ?? 0,
        filters_applied: parsed.filters.length,
        search: search || null,
      },
    };
  },
};

const STATIC_TOOLS: ConnectorTool[] = [
  {
    name: `${CONNECTOR_ID}_list_tables`,
    mcpName: 'list_tables',
    description:
      '[Supabase read-only] List Brain CRM views (brain_v_*). Auto-discovers new views. Call before querying.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: `${CONNECTOR_ID}_describe_table`,
    mcpName: 'describe_table',
    description:
      '[Supabase read-only] Show columns / searchable / filterable fields for a brain_v_* view. ' +
      'Accepts short names (employees) or full names (brain_v_employees).',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'View name: brain_v_employees or employees' },
      },
      required: ['table'],
    },
  },
  {
    name: `${CONNECTOR_ID}_query_rows`,
    mcpName: 'query_rows',
    description:
      '[Supabase read-only] Query a brain_v_* view (max 25 rows). Structured filters only — no SQL. ' +
      'Use for employees, contacts, chapters, and other published Brain views.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'brain_v_* view or short name' },
        search: { type: 'string', description: 'Keyword search across searchable columns' },
        filters: {
          type: 'array',
          description: '[{ column, op, value? }] ops: eq|ilike|in|gte|lte|is_null',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              op: { type: 'string', enum: ['eq', 'ilike', 'in', 'gte', 'lte', 'is_null'] },
              value: {},
            },
            required: ['column', 'op'],
          },
        },
        limit: { type: 'number', description: 'Max rows (default 20, hard max 25)' },
      },
      required: ['table'],
    },
  },
  {
    name: `${CONNECTOR_ID}_count_rows`,
    mcpName: 'count_rows',
    description:
      '[Supabase read-only] Count rows on a brain_v_* view. Prefer for headcount / "how many" questions.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        search: { type: 'string' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string' },
              op: { type: 'string', enum: ['eq', 'ilike', 'in', 'gte', 'lte', 'is_null'] },
              value: {},
            },
            required: ['column', 'op'],
          },
        },
      },
      required: ['table'],
    },
  },
];

export const supabaseDataConnector: BrainConnector = {
  id: CONNECTOR_ID,
  label: 'Supabase (brain_v_* read views)',
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
      return { ok: false, error: `Unknown supabase tool: ${toolName}` };
    }
    return handler(input, ctx);
  },
};
