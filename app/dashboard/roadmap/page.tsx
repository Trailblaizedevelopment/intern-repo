'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Map, List, LayoutList, ChevronDown, X, RefreshCw, Plus } from 'lucide-react';
import type { RoadmapTicket, RawTicket, RoadmapProject, Employee, Filters } from './types';
import { buildTicket } from './utils';
import { GanttView } from './GanttView';
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
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Ticket</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors" aria-label="Close">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={e => void handleSubmit(e)} className="p-5 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Title */}
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
            {/* Project */}
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

            {/* Priority */}
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

            {/* Sprint */}
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

            {/* Status */}
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

          {/* Actions */}
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

// ── Main Page (wrapped in Suspense for useSearchParams) ─────────────────────
function RoadmapPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [view, setView] = useState<'gantt' | 'list'>(() => {
    if (typeof window === 'undefined') return 'gantt';
    if (window.innerWidth < 768) return 'list';
    try { return (localStorage.getItem('roadmap_view') as 'gantt' | 'list') ?? 'gantt'; }
    catch { return 'gantt'; }
  });

  // Data
  const [tickets, setTickets] = useState<RoadmapTicket[]>([]);
  const [projects, setProjects] = useState<RoadmapProject[]>([]);
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

  // Load data
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rawTickets, rawProjects, rawEmployees] = await Promise.all([
        fetchFromSupabase<RawTicket>(
          'tickets?select=id,number,title,description,type,priority,status,assignee_id,project,project_id,due_date,created_at,sprint,labels&order=number.asc'
        ),
        fetchFromSupabase<RoadmapProject>('projects?select=id,name,status'),
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

  const handleViewChange = (v: 'gantt' | 'list') => {
    setView(v);
    try { localStorage.setItem('roadmap_view', v); } catch { /* ignore */ }
  };

  // Filter tickets
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

  // Handle drag reschedule
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
      // Revert by reloading
      void load();
    }
  }, [load]);

  // Handle ticket field update (from modal)
  const handleTicketUpdate = useCallback((updated: RawTicket) => {
    const rebuilt = buildTicket(updated);
    setTickets(ts => ts.map(t => t.id === rebuilt.id ? rebuilt : t));
    setSelectedTicket(updated);
  }, []);

  // Handle status change (from list view action menu)
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

  // Handle new ticket created
  const handleCreated = useCallback((raw: RawTicket) => {
    const built = buildTicket(raw);
    setTickets(ts => [...ts, built]);
    setShowCreateModal(false);
  }, []);

  // Open ticket modal (convert RoadmapTicket → RawTicket)
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
            Sprint 1 (Mar 17–21) · Sprint 2 (Mar 22–31) · {tickets.length} tickets
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle — hide gantt on mobile */}
          <div className="hidden md:flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${view === 'gantt' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              onClick={() => handleViewChange('gantt')}
            >
              <LayoutList size={16} />
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
          <button
            onClick={() => void load()}
            className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-500"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg sticky top-0 z-20">
        {/* Sprint button group */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          {(['all', 'sprint1', 'sprint2'] as const).map(s => {
            const labels: Record<string, string> = {
              all: 'All',
              sprint1: 'Sprint 1',
              sprint2: 'Sprint 2',
            };
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
            { value: 'high',     label: '🟠 High' },
            { value: 'medium',   label: '🟡 Medium' },
            { value: 'low',      label: '⚪ Low' },
            { value: 'none',     label: '— None' },
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

        {/* Clear filters */}
        {hasFilters && (
          <button
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
            onClick={clearFilters}
          >
            <X size={12} /> Clear
          </button>
        )}

        {/* Ticket count */}
        <span className="ml-auto text-xs text-gray-400">
          {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
        </span>

        {/* New Ticket button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          New Ticket
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <Skeleton />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          Error loading roadmap data: {error}
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <EmptyState onClear={clearFilters} />
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Mobile: always list */}
          <div className="md:hidden">
            <ListView
              tickets={filteredTickets}
              employees={employees}
              totalCount={tickets.length}
              onTicketClick={openModal}
              onStatusChange={handleStatusChange}
            />
          </div>
          {/* Desktop: gantt or list */}
          <div className="hidden md:block">
            {view === 'gantt' ? (
              <GanttView
                tickets={filteredTickets}
                employees={employees}
                onTicketClick={openModal}
                onReschedule={handleReschedule}
              />
            ) : (
              <ListView
                tickets={filteredTickets}
                employees={employees}
                totalCount={tickets.length}
                onTicketClick={openModal}
                onStatusChange={handleStatusChange}
              />
            )}
          </div>
        </div>
      )}

      {/* Ticket editor modal */}
      {selectedTicket && (
        <TicketModal
          ticket={selectedTicket}
          employees={employees}
          onClose={() => setSelectedTicket(null)}
          onUpdate={handleTicketUpdate}
        />
      )}

      {/* Create ticket modal */}
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
