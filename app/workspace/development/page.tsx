'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Smartphone, Globe, RefreshCw, Plus, Loader2, ExternalLink,
  ChevronDown, ChevronRight,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DevTicket {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  linear_id: string | null;
  assigned_tester: string | null;
  test_result: 'pass' | 'revisions' | null;
  project: string | null;
  project_id: string | null;
  assignee?: { name: string } | null;
  estimated_start: string | null;
  estimated_end: string | null;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state_name: string;
  state_type: string;
  assignee_name: string | null;
  priority: number;
  project_id: string | null;
  url: string | null;
  team_id: string;
}

interface Project {
  id: string;
  name: string;
  status: string;
  color: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const AUTH = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const STATUS_BADGE: Record<string, string> = {
  todo: 'bg-slate-700/60 text-slate-300 border border-slate-600/40',
  backlog: 'bg-slate-700/60 text-slate-400 border border-slate-600/40',
  open: 'bg-slate-700/60 text-slate-300 border border-slate-600/40',
  in_progress: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  in_review: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  testing: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  done: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  canceled: 'bg-red-500/20 text-red-400 border border-red-500/30',
  // Linear state types
  unstarted: 'bg-slate-700/60 text-slate-300 border border-slate-600/40',
  started: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-blue-400',
  4: 'bg-slate-500',
  0: 'bg-slate-600',
};

const PRIORITY_TEXT_BADGE: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  low: 'bg-slate-700/60 text-slate-400 border border-slate-600/40',
  none: 'bg-slate-800/60 text-slate-500 border border-slate-700/40',
};

const PROJECT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];

function projectColor(name: string, color?: string | null) {
  if (color) return color;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}

function StatusBadge({ status, stateType }: { status: string; stateType?: string }) {
  const key = stateType || status.toLowerCase().replace(/\s+/g, '_');
  const cls = STATUS_BADGE[key] || STATUS_BADGE[status] || 'bg-slate-700/60 text-slate-300 border border-slate-600/40';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_TEXT_BADGE[priority.toLowerCase()] || 'bg-slate-700/60 text-slate-400 border border-slate-600/40';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {priority}
    </span>
  );
}

function LinearBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] font-medium rounded border border-indigo-500/30">
      Linear
    </span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TicketRow({ ticket }: { ticket: DevTicket }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group">
      <span className="text-xs text-slate-500 w-10 shrink-0 font-mono">#{ticket.number}</span>
      <span className="flex-1 text-sm text-slate-200 truncate group-hover:text-white transition-colors">{ticket.title}</span>
      {ticket.assignee?.name && (
        <span className="text-xs text-slate-500 hidden sm:block">{ticket.assignee.name}</span>
      )}
      {ticket.test_result && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          ticket.test_result === 'pass' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
        }`}>
          {ticket.test_result}
        </span>
      )}
      {ticket.priority && ticket.priority !== 'none' && (
        <PriorityBadge priority={ticket.priority} />
      )}
      <StatusBadge status={ticket.status} />
    </div>
  );
}

function LinearIssueRow({ issue }: { issue: LinearIssue }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 group">
      <span className="text-xs text-slate-500 w-16 shrink-0 font-mono">{issue.identifier}</span>
      <span className="flex-1 text-sm text-slate-200 truncate group-hover:text-white transition-colors">{issue.title}</span>
      {issue.assignee_name && (
        <span className="text-xs text-slate-500 hidden sm:block">{issue.assignee_name}</span>
      )}
      {issue.priority > 0 && (
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[issue.priority] || 'bg-slate-500'}`} />
        </span>
      )}
      <LinearBadge />
      <StatusBadge status={issue.state_name} stateType={issue.state_type} />
      {issue.url && (
        <a
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-600 hover:text-indigo-400 transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

interface ProjectGroupProps {
  name: string;
  color: string;
  children: React.ReactNode;
  count: number;
}

function ProjectGroup({ name, color, children, count }: ProjectGroupProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-0">
      <button
        className="flex items-center gap-2.5 w-full px-4 py-2.5 hover:bg-white/5 transition-colors text-left border-b border-white/5"
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-2 h-2 rounded-full shrink-0 shadow-sm" style={{ background: color, boxShadow: `0 0 6px ${color}80` }} />
        <span className="font-semibold text-sm text-slate-200 flex-1 tracking-tight">{name}</span>
        <span className="text-xs text-slate-500 tabular-nums bg-white/5 px-1.5 py-0.5 rounded-full">{count}</span>
        {open
          ? <ChevronDown size={13} className="text-slate-500" />
          : <ChevronRight size={13} className="text-slate-500" />}
      </button>
      {open && <div className="ml-0">{children}</div>}
    </div>
  );
}

// ─── iOS Tab ──────────────────────────────────────────────────────────────────

function IOSTab({ tickets, projects }: { tickets: DevTicket[]; projects: Project[] }) {
  // Temporary: show all tickets until the development system migration runs and
  // tickets are properly categorized as iOS or Web.
  const iosTickets = tickets;

  const byProject: Record<string, DevTicket[]> = {};
  for (const t of iosTickets) {
    const key = t.project || 'No Project';
    if (!byProject[key]) byProject[key] = [];
    byProject[key].push(t);
  }

  return (
    <div className="divide-y-0">
      <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
        <p className="text-xs text-amber-400">Tickets will be categorized as iOS or Web once the development system migration runs.</p>
      </div>
      {iosTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Smartphone size={36} strokeWidth={1} className="text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-400">No tickets yet</p>
          <p className="text-xs text-slate-500 mt-1">Submit a request to create the first one</p>
        </div>
      ) : null}
      {Object.entries(byProject).map(([projName, projTickets]) => {
        const proj = projects.find(p => p.name === projName);
        const color = projectColor(projName, proj?.color);
        return (
          <ProjectGroup key={projName} name={projName} color={color} count={projTickets.length}>
            {projTickets.map(t => <TicketRow key={t.id} ticket={t} />)}
          </ProjectGroup>
        );
      })}
    </div>
  );
}

// ─── Web Tab ──────────────────────────────────────────────────────────────────

function WebTab({
  tickets,
  linearIssues,
  projects,
  syncing,
  onSync,
}: {
  tickets: DevTicket[];
  linearIssues: LinearIssue[];
  projects: Project[];
  syncing: boolean;
  onSync: () => void;
}) {
  // Temporary: show all tickets until the development system migration runs and
  // tickets are properly categorized as iOS or Web.
  const webTickets = tickets;

  const byProject: Record<string, { tickets: DevTicket[]; linear: LinearIssue[] }> = {};

  for (const t of webTickets) {
    const key = t.project || 'No Project';
    if (!byProject[key]) byProject[key] = { tickets: [], linear: [] };
    byProject[key].tickets.push(t);
  }

  for (const issue of linearIssues) {
    const proj = projects.find(p => p.id === issue.project_id);
    const key = proj?.name || 'No Project';
    if (!byProject[key]) byProject[key] = { tickets: [], linear: [] };
    byProject[key].linear.push(issue);
  }

  const projectNames = Object.keys(byProject).sort((a, b) => {
    if (a === 'No Project') return 1;
    if (b === 'No Project') return -1;
    return a.localeCompare(b);
  });

  return (
    <div>
      {/* Migration note */}
      <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20">
        <p className="text-xs text-amber-400">Tickets will be categorized as iOS or Web once the development system migration runs.</p>
      </div>

      {/* Sync bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/3">
        <span className="text-xs text-slate-500">
          {linearIssues.length} Linear issue{linearIssues.length !== 1 ? 's' : ''} · {webTickets.length} native ticket{webTickets.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-300 border border-white/10 rounded-md hover:bg-white/10 hover:border-white/20 hover:text-white transition-colors disabled:opacity-50 bg-white/5"
        >
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync with Linear'}
        </button>
      </div>

      {projectNames.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe size={36} strokeWidth={1} className="text-slate-600 mb-3" />
          <p className="text-sm font-medium text-slate-400">No web tickets yet</p>
          <p className="text-xs text-slate-500 mt-1">Sync with Linear or submit a new request</p>
        </div>
      ) : (
        <div>
          {projectNames.map(projName => {
            const group = byProject[projName];
            const proj = projects.find(p => p.name === projName);
            const color = projectColor(projName, proj?.color);
            const total = group.tickets.length + group.linear.length;
            return (
              <ProjectGroup key={projName} name={projName} color={color} count={total}>
                {group.tickets.map(t => <TicketRow key={t.id} ticket={t} />)}
                {group.linear.map(issue => <LinearIssueRow key={issue.id} issue={issue} />)}
              </ProjectGroup>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DevelopmentPage() {
  const [tab, setTab] = useState<'ios' | 'web'>('web');
  const [tickets, setTickets] = useState<DevTicket[]>([]);
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketsRes, projectsRes, linearRes] = await Promise.all([
        fetch('/api/tickets?status=all', {
          headers: { Authorization: AUTH },
        }),
        fetch('/api/projects'),
        fetch('/api/linear/issues?source=cache', {
          headers: { Authorization: AUTH },
        }),
      ]);

      const ticketsJson = await ticketsRes.json();
      const projectsJson = await projectsRes.json();
      const linearJson = await linearRes.json();

      console.log('[DevelopmentPage] tickets response:', ticketsJson);
      console.log('[DevelopmentPage] projects response:', projectsJson);
      console.log('[DevelopmentPage] linear response:', linearJson);

      if (ticketsJson.data) setTickets(ticketsJson.data as DevTicket[]);
      if (projectsJson.data) setProjects(projectsJson.data as Project[]);
      if (linearJson.data) setLinearIssues(linearJson.data as LinearIssue[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/api/linear/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AUTH,
        },
        body: JSON.stringify({}),
      });
      const res = await fetch('/api/linear/issues?source=cache', {
        headers: { Authorization: AUTH },
      });
      const json = await res.json();
      if (json.data) setLinearIssues(json.data as LinearIssue[]);
    } catch (e) {
      console.error('Sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-0">
      {/* Page Header */}
      <div className="relative flex items-center justify-between px-1 pb-5 mb-1">
        {/* Ambient gradient accent */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-0 left-0 w-64 h-16 bg-indigo-500/10 blur-2xl rounded-full" />
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">Development</h1>
          <p className="text-sm text-slate-400 mt-0.5">iOS &amp; Web engineering work</p>
        </div>
        <Link
          href="/workspace/development/submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-all shadow-lg hover:shadow-indigo-500/20 hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
        >
          <Plus size={14} />
          Submit Request
        </Link>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center border-b border-white/10 mb-0">
        <button
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'ios'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
          }`}
          onClick={() => setTab('ios')}
        >
          <Smartphone size={14} />
          iOS
        </button>
        <button
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'web'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
          }`}
          onClick={() => setTab('web')}
        >
          <Globe size={14} />
          Web
        </button>
      </div>

      {/* Content Card */}
      <div className="rounded-xl overflow-hidden shadow-xl border"
        style={{
          background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.85) 100%)',
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: '0 4px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-400 bg-red-500/10 rounded-lg border border-red-500/20">{error}</div>
        ) : tab === 'ios' ? (
          <IOSTab tickets={tickets} projects={projects} />
        ) : (
          <WebTab
            tickets={tickets}
            linearIssues={linearIssues}
            projects={projects}
            syncing={syncing}
            onSync={handleSync}
          />
        )}
      </div>
    </div>
  );
}
