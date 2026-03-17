'use client';

import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Map, List, LayoutList, ChevronDown, X, RefreshCw } from 'lucide-react';
import type { RoadmapTicket, RoadmapProject, Employee, Filters } from './types';
import { buildTicket, sprintLabel } from './utils';
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
  return res.json();
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

// ── Main Page (wrapped in Suspense for useSearchParams) ─────────────────────
function RoadmapPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // View: gantt | list
  const [view, setView] = useState<'gantt' | 'list'>(() => {
    if (typeof window === 'undefined') return 'gantt';
    if (window.innerWidth < 768) return 'list';
    try {
      return (localStorage.getItem('roadmap_view') as 'gantt' | 'list') ?? 'gantt';
    } catch {
      return 'gantt';
    }
  });

  // Data
  const [tickets, setTickets] = useState<RoadmapTicket[]>([]);
  const [projects, setProjects] = useState<RoadmapProject[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal
  const [selectedTicket, setSelectedTicket] = useState<RoadmapTicket | null>(null);

  // Filters — URL-param persisted
  const [filters, setFilters] = useState<Filters>(() => ({
    sprint: (searchParams.get('sprint') as Filters['sprint']) ?? 'all',
    priority: searchParams.get('priority') ? searchParams.get('priority')!.split(',') : [],
    projectIds: searchParams.get('projects') ? searchParams.get('projects')!.split(',') : [],
    assigneeId: searchParams.get('assignee') ?? '',
  }));

  // Persist filters to URL
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

  // Load data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [rawTickets, rawProjects, rawEmployees] = await Promise.all([
          fetchFromSupabase<Omit<RoadmapTicket, 'barStart' | 'barEnd'>>(
            'tickets?select=id,number,title,description,type,priority,status,assignee_id,project,project_id,due_date,created_at,sprint,labels&order=number.asc'
          ),
          fetchFromSupabase<RoadmapProject>('projects?select=id,name,status'),
          fetchFromSupabase<Employee>('employees?select=id,name'),
        ]);
        if (cancelled) return;
        setTickets(rawTickets.map(buildTicket));
        setProjects(rawProjects);
        setEmployees(rawEmployees);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Handle view toggle (save to localStorage)
  const handleViewChange = (v: 'gantt' | 'list') => {
    setView(v);
    try { localStorage.setItem('roadmap_view', v); } catch { /* */ }
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
    // Optimistic update
    setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, due_date: newEnd, barEnd: newEnd } : t));
    try {
      const res = await fetch(`/api/roadmap/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: newEnd }),
      });
      if (!res.ok) {
        // Revert
        setTickets(ts => ts.map(t =>
          t.id === ticketId ? { ...t, due_date: t.due_date, barEnd: t.barEnd } : t
        ));
      }
    } catch {
      // Revert
      setTickets(ts => [...ts]);
    }
  }, []);

  // Stats
  const noDueDate = tickets.filter(t => !t.due_date).length;

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
            {noDueDate > 0 && (
              <span className="ml-2 text-yellow-600">({noDueDate} without due date — using sprint/priority fallback)</span>
            )}
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
            onClick={() => window.location.reload()}
            className="p-1.5 rounded border border-gray-200 hover:bg-gray-50 text-gray-500"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg sticky top-0 z-20 border-b">
        {/* Sprint button group */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          {(['all', 'sprint1', 'sprint2'] as const).map(s => {
            const labels: Record<string, string> = { all: 'All', sprint1: 'Sprint 1 (Mar 17–21)', sprint2: 'Sprint 2 (Mar 22–31)' };
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

        {/* Assignee dropdown */}
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
        {(filters.sprint !== 'all' || filters.priority.length > 0 || filters.projectIds.length > 0 || filters.assigneeId) && (
          <button
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
            onClick={() => updateFilters({ sprint: 'all', priority: [], projectIds: [], assigneeId: '' })}
          >
            <X size={12} /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
        </span>
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
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {/* Mobile: always list */}
          <div className="md:hidden">
            <ListView tickets={filteredTickets} employees={employees} onTicketClick={setSelectedTicket} />
          </div>
          {/* Desktop: gantt or list */}
          <div className="hidden md:block">
            {view === 'gantt' ? (
              <GanttView
                tickets={filteredTickets}
                employees={employees}
                onTicketClick={setSelectedTicket}
                onReschedule={handleReschedule}
              />
            ) : (
              <ListView tickets={filteredTickets} employees={employees} onTicketClick={setSelectedTicket} />
            )}
          </div>
        </div>
      )}

      {/* Ticket modal */}
      {selectedTicket && (
        <TicketModal
          ticket={selectedTicket}
          employees={employees}
          onClose={() => setSelectedTicket(null)}
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
