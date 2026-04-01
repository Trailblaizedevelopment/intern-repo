'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Map, List, LayoutList, ChevronDown, X, RefreshCw, Plus, ChevronRight, GanttChart } from 'lucide-react';
import type { RoadmapTicket, RawTicket, RoadmapProject, Employee, Filters } from './types';
import { buildTicket, projectColor } from './utils';
import { ListView } from './ListView';
import { TicketModal } from './TicketModal';

// ── Supabase REST fetch helpers ─────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

async function fetchFromSupabase<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  return res.json() as Promise<T[]>;
}

// ── Extended project type with date fields ───────────────────────────────────
interface GanttProject extends RoadmapProject {
  color: string | null;
  start_date: string | null;
  target_date: string | null;
  estimated_start: string | null;
  estimated_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
}

// ── Gantt helpers ────────────────────────────────────────────────────────────
const PROJECT_COLORS_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];

function getProjectColor(p: GanttProject, index: number): string {
  if (p.color) return p.color;
  const hashed = projectColor(p.name);
  return hashed || PROJECT_COLORS_PALETTE[index % PROJECT_COLORS_PALETTE.length];
}

function statusFillPct(status: string | null): number {
  switch (status) {
    case 'done': case 'completed': case 'resolved': return 100;
    case 'in_progress': case 'in_review': case 'testing': return 50;
    default: return 0;
  }
}

const TESTER_INITIALS: Record<string, string> = {
  Owen: 'O',
  Adam: 'A',
  Ford: 'F',
  Devin: 'D',
};

function testerInitial(name: string | null | undefined): string | null {
  if (!name) return null;
  for (const [full, init] of Object.entries(TESTER_INITIALS)) {
    if (name.toLowerCase().includes(full.toLowerCase())) return init;
  }
  return name.charAt(0).toUpperCase();
}

// ── Project Gantt View ───────────────────────────────────────────────────────

interface ProjectGanttProps {
  projects: GanttProject[];
  tickets: RoadmapTicket[];
  timeScale: 'week' | 'month';
}

function ProjectGantt({ projects, tickets, timeScale }: ProjectGanttProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // Build timeline
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Determine timeline window
  const allDates: Date[] = [];
  for (const p of projects) {
    const start = p.estimated_start || p.start_date;
    const end = p.estimated_end || p.target_date;
    if (start) allDates.push(new Date(start + 'T00:00:00'));
    if (end) allDates.push(new Date(end + 'T00:00:00'));
  }
  // Always include today
  allDates.push(today);

  const minDate = allDates.length > 0
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : today;
  const maxDate = allDates.length > 0
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : new Date(today.getTime() + 30 * 86400000);

  // Snap to week/month boundaries
  const snapStart = new Date(minDate);
  snapStart.setDate(snapStart.getDate() - 3);
  const snapEnd = new Date(maxDate);
  snapEnd.setDate(snapEnd.getDate() + 7);

  const totalDays = Math.max(Math.ceil((snapEnd.getTime() - snapStart.getTime()) / 86400000), 14);

  const LABEL_WIDTH = 220;
  const DAY_PX = timeScale === 'week' ? 80 : 28;

  function dayOffset(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    return Math.round((d.getTime() - snapStart.getTime()) / 86400000);
  }

  function dayOffsetDate(d: Date): number {
    return Math.round((d.getTime() - snapStart.getTime()) / 86400000);
  }

  // Header: weeks or months
  const headers: { label: string; days: number; offset: number }[] = [];
  if (timeScale === 'week') {
    // Week headers
    let cur = new Date(snapStart);
    while (cur <= snapEnd) {
      const weekStart = new Date(cur);
      const weekEnd = new Date(cur);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const endClamped = weekEnd > snapEnd ? snapEnd : weekEnd;
      const days = Math.ceil((endClamped.getTime() - weekStart.getTime()) / 86400000) + 1;
      const offset = dayOffsetDate(weekStart);
      const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      headers.push({ label, days, offset });
      cur.setDate(cur.getDate() + 7);
    }
  } else {
    // Month headers
    let cur = new Date(snapStart.getFullYear(), snapStart.getMonth(), 1);
    while (cur <= snapEnd) {
      const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      const startClamped = cur < snapStart ? snapStart : cur;
      const endClamped = monthEnd > snapEnd ? snapEnd : monthEnd;
      const days = Math.ceil((endClamped.getTime() - startClamped.getTime()) / 86400000) + 1;
      const offset = dayOffsetDate(startClamped);
      const label = cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      headers.push({ label, days, offset });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }

  // Scheduled vs unscheduled
  const scheduled = projects.filter(p => p.estimated_start || p.start_date || p.estimated_end || p.target_date);
  const unscheduled = projects.filter(p => !p.estimated_start && !p.start_date && !p.estimated_end && !p.target_date);

  const totalWidth = totalDays * DAY_PX;
  const todayX = LABEL_WIDTH + dayOffsetDate(today) * DAY_PX;

  function renderProjectRow(p: GanttProject, idx: number) {
    const color = getProjectColor(p, idx);
    const startStr = p.estimated_start || p.start_date;
    const endStr = p.estimated_end || p.target_date;
    const startOff = dayOffset(startStr);
    const endOff = dayOffset(endStr);
    const isExpanded = expanded[p.id];
    const projTickets = tickets.filter(t => t.project_id === p.id || t.project === p.name);

    const avgFill = projTickets.length > 0
      ? Math.round(projTickets.reduce((s, t) => s + statusFillPct(t.status), 0) / projTickets.length)
      : statusFillPct(p.status);

    const tester = testerInitial(projTickets[0]?.assignee_id ? projTickets[0]?.project : null);

    const barX = startOff !== null ? LABEL_WIDTH + startOff * DAY_PX : null;
    const barWidth = (startOff !== null && endOff !== null && endOff > startOff)
      ? (endOff - startOff) * DAY_PX
      : (barX !== null ? 120 : null);

    return (
      <React.Fragment key={p.id}>
        <div className="flex items-center border-b border-gray-100 hover:bg-gray-50/50 transition-colors" style={{ height: 40 }}>
          {/* Label */}
          <div
            className="flex items-center gap-2 px-3 shrink-0 cursor-pointer"
            style={{ width: LABEL_WIDTH }}
            onClick={() => toggle(p.id)}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-sm text-gray-800 font-medium truncate flex-1">{p.name}</span>
            {projTickets.length > 0 && (
              isExpanded
                ? <ChevronDown size={13} className="text-gray-400 shrink-0" />
                : <ChevronRight size={13} className="text-gray-400 shrink-0" />
            )}
          </div>

          {/* Chart area */}
          <div className="relative flex-1 overflow-hidden h-full" style={{ minWidth: totalWidth }}>
            {/* Today line */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10 pointer-events-none"
              style={{ left: todayX - LABEL_WIDTH }}
            />
            {barX !== null && barWidth !== null && (
              <div
                className="absolute top-2 rounded-md overflow-hidden flex items-center"
                style={{
                  left: barX - LABEL_WIDTH,
                  width: barWidth,
                  height: 24,
                  background: `${color}25`,
                  border: `1.5px solid ${color}`,
                }}
              >
                {/* Fill % */}
                <div
                  className="h-full opacity-50"
                  style={{ width: `${avgFill}%`, background: color }}
                />
                {/* Tester dot */}
                {tester && (
                  <div
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {tester}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ticket sub-rows */}
        {isExpanded && projTickets.map(ticket => {
          const tStartOff = dayOffset(ticket.barStart);
          const tEndOff = dayOffset(ticket.barEnd);
          const tBarX = tStartOff !== null ? LABEL_WIDTH + tStartOff * DAY_PX : null;
          const tBarWidth = (tStartOff !== null && tEndOff !== null && tEndOff > tStartOff)
            ? (tEndOff - tStartOff) * DAY_PX
            : 80;
          const fill = statusFillPct(ticket.status);

          return (
            <div key={ticket.id} className="flex items-center border-b border-gray-100 bg-indigo-50/30 hover:bg-indigo-50/50" style={{ height: 34 }}>
              <div className="flex items-center gap-2 px-3 shrink-0 pl-8" style={{ width: LABEL_WIDTH }}>
                <span className="text-xs text-gray-500 truncate">#{ticket.number} {ticket.title}</span>
              </div>
              <div className="relative flex-1 overflow-hidden h-full" style={{ minWidth: totalWidth }}>
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-400/40 z-10 pointer-events-none"
                  style={{ left: todayX - LABEL_WIDTH }}
                />
                {tBarX !== null && (
                  <div
                    className="absolute top-2 rounded overflow-hidden"
                    style={{
                      left: tBarX - LABEL_WIDTH,
                      width: tBarWidth,
                      height: 20,
                      background: `${color}18`,
                      border: `1px solid ${color}80`,
                    }}
                  >
                    <div
                      className="h-full opacity-40"
                      style={{ width: `${fill}%`, background: color }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </React.Fragment>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Timeline header */}
      <div className="flex sticky top-0 z-20 bg-white border-b border-gray-200">
        <div className="shrink-0 bg-white" style={{ width: LABEL_WIDTH }} />
        <div className="flex" style={{ minWidth: totalWidth }}>
          {headers.map((h, i) => (
            <div
              key={i}
              className="border-l border-gray-100 px-2 py-1.5 text-xs font-medium text-gray-500"
              style={{ width: h.days * DAY_PX, minWidth: 40, flexShrink: 0 }}
            >
              {h.label}
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div>
        {scheduled.map((p, i) => renderProjectRow(p, i))}
      </div>

      {/* Unscheduled */}
      {unscheduled.length > 0 && (
        <div>
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Unscheduled</span>
          </div>
          {unscheduled.map((p, i) => {
            const color = getProjectColor(p, scheduled.length + i);
            const projTickets = tickets.filter(t => t.project_id === p.id || t.project === p.name);
            return (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2 border-b border-gray-100 hover:bg-gray-50">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-sm text-gray-700 flex-1">{p.name}</span>
                <span className="text-xs text-gray-400">{projTickets.length} tickets</span>
                <span className="text-xs text-gray-300 italic">no dates set</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="space-y-3 p-4 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-8 bg-gray-200 rounded w-48 flex-shrink-0" />
          <div className="h-8 bg-gray-100 rounded flex-1" style={{ width: `${40 + (i % 3) * 20}%` }} />
        </div>
      ))}
    </div>
  );
}

// ── Multi-select dropdown ────────────────────────────────────────────────────
interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (vals: string[]) => void;
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const toggle = (val: string) =>
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:border-gray-300 bg-white transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span>{label}</span>
        {selected.length > 0 && (
          <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {selected.length}
          </span>
        )}
        <ChevronDown size={14} className="text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1 max-h-64 overflow-y-auto">
            {options.map(opt => (
              <label key={opt.value} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(opt.value)}
                  className="rounded border-gray-300 text-blue-600"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Create Ticket Modal ──────────────────────────────────────────────────────
interface CreateTicketModalProps {
  projects: RoadmapProject[];
  onClose: () => void;
  onCreated: (ticket: RawTicket) => void;
}

function CreateTicketModal({ projects, onClose, onCreated }: CreateTicketModalProps) {
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [priority, setPriority] = useState('');
  const [sprint, setSprint] = useState('');
  const [status, setStatus] = useState('open');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = projects.find(p => p.id === projectId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/roadmap/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          project: selectedProject?.name ?? null,
          project_id: projectId || null,
          priority: priority || null,
          sprint: sprint || null,
          status,
        }),
      });
      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const created = await res.json() as RawTicket;
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create ticket');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Ticket</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors" aria-label="Close">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={e => void handleSubmit(e)} className="p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 transition-colors"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Project</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 transition-colors"
              >
                <option value="">None</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 transition-colors"
              >
                <option value="">—</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sprint</label>
              <select
                value={sprint}
                onChange={e => setSprint(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 transition-colors"
              >
                <option value="">None</option>
                <option value="Sprint 1">Sprint 1</option>
                <option value="Sprint 2">Sprint 2</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 transition-colors"
              >
                <option value="backlog">Backlog</option>
                <option value="open">Open</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-4xl mb-3">🗺️</div>
      <p className="text-gray-500 font-medium">No tickets match your filters</p>
      <button
        onClick={onClear}
        className="mt-3 text-blue-600 text-sm hover:underline"
      >
        Clear filters
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
function RoadmapPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  type ViewType = 'gantt' | 'list';
  const [view, setView] = useState<ViewType>(() => {
    if (typeof window === 'undefined') return 'gantt';
    if (window.innerWidth < 768) return 'list';
    try { return (localStorage.getItem('roadmap_view') as ViewType) ?? 'gantt'; }
    catch { return 'gantt'; }
  });

  const [timeScale, setTimeScale] = useState<'week' | 'month'>('month');

  // Data
  const [tickets, setTickets] = useState<RoadmapTicket[]>([]);
  const [projects, setProjects] = useState<GanttProject[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedTicket, setSelectedTicket] = useState<RawTicket | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filters
  const [filters, setFilters] = useState<Filters>(() => ({
    sprint: (searchParams.get('sprint') as Filters['sprint']) ?? 'all',
    priority: searchParams.get('priority') ? searchParams.get('priority')!.split(',') : [],
    projectIds: searchParams.get('projects') ? searchParams.get('projects')!.split(',') : [],
    assigneeId: searchParams.get('assignee') ?? '',
  }));

  const updateFilters = useCallback((update: Partial<Filters>) => {
    const next = { ...filters, ...update };
    setFilters(next);
    const params = new URLSearchParams();
    if (next.sprint !== 'all') params.set('sprint', next.sprint);
    if (next.priority.length) params.set('priority', next.priority.join(','));
    if (next.projectIds.length) params.set('projects', next.projectIds.join(','));
    if (next.assigneeId) params.set('assignee', next.assigneeId);
    router.replace(`/dashboard/roadmap${params.toString() ? '?' + params.toString() : ''}`);
  }, [filters, router]);

  const clearFilters = useCallback(() => {
    updateFilters({ sprint: 'all', priority: [], projectIds: [], assigneeId: '' });
  }, [updateFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rawTickets, rawProjects, rawEmployees] = await Promise.all([
        fetchFromSupabase<RawTicket>(
          'tickets?select=id,number,title,description,type,priority,status,assignee_id,project,project_id,due_date,created_at,sprint,labels,estimated_start,estimated_end,actual_start,actual_end&order=number.asc'
        ),
        fetchFromSupabase<GanttProject>(
          'projects?select=id,name,status,color,start_date,target_date,estimated_start,estimated_end,actual_start,actual_end'
        ),
        fetchFromSupabase<Employee>('employees?select=id,name'),
      ]);
      setTickets(rawTickets.map(buildTicket));
      setProjects(rawProjects);
      setEmployees(rawEmployees);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleViewChange = (v: ViewType) => {
    setView(v);
    try { localStorage.setItem('roadmap_view', v); } catch { /* ignore */ }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (filters.sprint !== 'all') {
        const s = (t.sprint ?? '').toLowerCase();
        if (filters.sprint === 'sprint1') {
          if (!(s.includes('sprint 1') || s.includes('sprint1') || /\bsprint.{0,3}1\b/.test(s))) return false;
        } else if (filters.sprint === 'sprint2') {
          if (!(s.includes('sprint 2') || s.includes('sprint2') || /\bsprint.{0,3}2\b/.test(s))) return false;
        }
      }
      if (filters.priority.length > 0) {
        if (!filters.priority.includes(t.priority ?? 'none')) return false;
      }
      if (filters.projectIds.length > 0) {
        const projId = t.project_id ?? projects.find(p => p.name === t.project)?.id ?? '';
        if (!filters.projectIds.includes(projId)) return false;
      }
      if (filters.assigneeId) {
        if (t.assignee_id !== filters.assigneeId) return false;
      }
      return true;
    });
  }, [tickets, filters, projects]);

  const handleReschedule = useCallback(async (ticketId: string, newEnd: string) => {
    setTickets(ts => ts.map(t => t.id === ticketId ? buildTicket({ ...t, due_date: newEnd }) : t));
    try {
      const res = await fetch(`/api/roadmap/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: newEnd }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      void load();
    }
  }, [load]);

  const handleTicketUpdate = useCallback((updated: RawTicket) => {
    const rebuilt = buildTicket(updated);
    setTickets(ts => ts.map(t => t.id === rebuilt.id ? rebuilt : t));
    setSelectedTicket(updated);
  }, []);

  const handleStatusChange = useCallback(async (ticketId: string, newStatus: string) => {
    setTickets(ts => ts.map(t => t.id === ticketId ? buildTicket({ ...t, status: newStatus }) : t));
    try {
      const res = await fetch(`/api/roadmap/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      void load();
    }
  }, [load]);

  const handleCreated = useCallback((raw: RawTicket) => {
    const built = buildTicket(raw);
    setTickets(ts => [...ts, built]);
    setShowCreateModal(false);
  }, []);

  const openModal = useCallback((t: RoadmapTicket) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { barStart: _bs, barEnd: _be, ...raw } = t;
    setSelectedTicket(raw);
  }, []);

  const hasFilters = filters.sprint !== 'all' || filters.priority.length > 0 || filters.projectIds.length > 0 || filters.assigneeId !== '';

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Map size={22} className="text-blue-600" />
            Product Roadmap
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {projects.length} projects · {tickets.length} tickets
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="hidden md:flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${view === 'gantt' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => handleViewChange('gantt')}
            >
              <GanttChart size={16} />
              Gantt
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border-l border-gray-200 transition-colors ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => handleViewChange('list')}
            >
              <List size={16} />
              List
            </button>
          </div>

          {/* Time scale toggle (gantt only) */}
          {view === 'gantt' && (
            <div className="hidden md:flex items-center border border-gray-200 rounded-lg overflow-hidden">
              {(['week', 'month'] as const).map(s => (
                <button
                  key={s}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0 border-gray-200 capitalize ${timeScale === s ? 'bg-gray-100 text-gray-800' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  onClick={() => setTimeScale(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => void load()}
            className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-500"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Filter Bar (list view only) */}
      {view === 'list' && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg sticky top-0 z-20">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {(['all', 'sprint1', 'sprint2'] as const).map(s => {
              const labels: Record<string, string> = { all: 'All', sprint1: 'Sprint 1', sprint2: 'Sprint 2' };
              return (
                <button
                  key={s}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-r-0 border-gray-200 ${filters.sprint === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  onClick={() => updateFilters({ sprint: s })}
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>

          <MultiSelect
            label="Priority"
            options={[
              { value: 'critical', label: '🔴 Critical' },
              { value: 'high', label: '🟠 High' },
              { value: 'medium', label: '🟡 Medium' },
              { value: 'low', label: '⚪ Low' },
              { value: 'none', label: '— None' },
            ]}
            selected={filters.priority}
            onChange={vals => updateFilters({ priority: vals })}
          />

          <MultiSelect
            label="Project"
            options={projects.map(p => ({ value: p.id, label: p.name }))}
            selected={filters.projectIds}
            onChange={vals => updateFilters({ projectIds: vals })}
          />

          <select
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 transition-colors"
            value={filters.assigneeId}
            onChange={e => updateFilters({ assigneeId: e.target.value })}
          >
            <option value="">All Assignees</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
              onClick={clearFilters}
            >
              <X size={12} /> Clear
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400">
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
          </span>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={14} />
            New Ticket
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <Skeleton />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Error loading roadmap data: {error}
        </div>
      ) : view === 'gantt' ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <ProjectGantt
            projects={projects}
            tickets={tickets}
            timeScale={timeScale}
          />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <EmptyState onClear={clearFilters} />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="md:hidden">
            <ListView
              tickets={filteredTickets}
              employees={employees}
              totalCount={tickets.length}
              onTicketClick={openModal}
              onStatusChange={handleStatusChange}
            />
          </div>
          <div className="hidden md:block">
            <ListView
              tickets={filteredTickets}
              employees={employees}
              totalCount={tickets.length}
              onTicketClick={openModal}
              onStatusChange={handleStatusChange}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedTicket && (
        <TicketModal
          ticket={selectedTicket}
          employees={employees}
          onClose={() => setSelectedTicket(null)}
          onUpdate={handleTicketUpdate}
        />
      )}

      {showCreateModal && (
        <CreateTicketModal
          projects={projects}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

export default function RoadmapPage() {
  return (
    <Suspense fallback={<div className="p-4 animate-pulse text-sm text-gray-400">Loading roadmap…</div>}>
      <RoadmapPageInner />
    </Suspense>
  );
}
