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
  todo: 'bg-gray-100 text-gray-600',
  backlog: 'bg-gray-100 text-gray-500',
  open: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-amber-100 text-amber-700',
  testing: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  canceled: 'bg-red-100 text-red-500',
  // Linear state types
  unstarted: 'bg-gray-100 text-gray-600',
  started: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-500',
};

const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-400',
  3: 'bg-blue-400',
  4: 'bg-gray-300',
  0: 'bg-gray-200',
};

const PRIORITY_TEXT_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-500',
  none: 'bg-gray-100 text-gray-400',
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
  const cls = STATUS_BADGE[key] || STATUS_BADGE[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_TEXT_BADGE[priority.toLowerCase()] || 'bg-gray-100 text-gray-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {priority}
    </span>
  );
}

function LinearBadge() {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-medium rounded border border-gray-200">
      Linear
    </span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TicketRow({ ticket }: { ticket: DevTicket }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-10 shrink-0 font-mono">#{ticket.number}</span>
      <span className="flex-1 text-sm text-gray-800 truncate">{ticket.title}</span>
      {ticket.assignee?.name && (
        <span className="text-xs text-gray-500 hidden sm:block">{ticket.assignee.name}</span>
      )}
      {ticket.test_result && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          ticket.test_result === 'pass' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
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
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-16 shrink-0 font-mono">{issue.identifier}</span>
      <span className="flex-1 text-sm text-gray-800 truncate">{issue.title}</span>
      {issue.assignee_name && (
        <span className="text-xs text-gray-500 hidden sm:block">{issue.assignee_name}</span>
      )}
      {issue.priority > 0 && (
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[issue.priority] || 'bg-gray-300'}`} />
        </span>
      )}
      <LinearBadge />
      <StatusBadge status={issue.state_name} stateType={issue.state_type} />
      {issue.url && (
        <a
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-600 transition-colors"
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
    <div className="mb-1">
      <button
        className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="font-medium text-sm text-gray-700 flex-1">{name}</span>
        <span className="text-xs text-gray-400 tabular-nums">{count}</span>
        {open
          ? <ChevronDown size={13} className="text-gray-400" />
          : <ChevronRight size={13} className="text-gray-400" />}
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
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
        <p className="text-xs text-amber-600">Tickets will be categorized as iOS or Web once the development system migration runs.</p>
      </div>
      {iosTickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Smartphone size={36} strokeWidth={1} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No tickets yet</p>
          <p className="text-xs text-gray-400 mt-1">Submit a request to create the first one</p>
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
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
        <p className="text-xs text-amber-600">Tickets will be categorized as iOS or Web once the development system migration runs.</p>
      </div>

      {/* Sync bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50/80">
        <span className="text-xs text-gray-500">
          {linearIssues.length} Linear issue{linearIssues.length !== 1 ? 's' : ''} · {webTickets.length} native ticket{webTickets.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-white hover:border-gray-300 hover:text-gray-800 transition-colors disabled:opacity-50 bg-white"
        >
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync with Linear'}
        </button>
      </div>

      {projectNames.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe size={36} strokeWidth={1} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No web tickets yet</p>
          <p className="text-xs text-gray-400 mt-1">Sync with Linear or submit a new request</p>
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
      <div className="flex items-center justify-between px-1 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Development</h1>
          <p className="text-sm text-gray-500 mt-0.5">iOS &amp; Web engineering work</p>
        </div>
        <Link
          href="/workspace/development/submit"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus size={14} />
          Submit Request
        </Link>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center border-b border-gray-200 mb-0">
        <button
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'ios'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => setTab('ios')}
        >
          <Smartphone size={14} />
          iOS
        </button>
        <button
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'web'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
          onClick={() => setTab('web')}
        >
          <Globe size={14} />
          Web
        </button>
      </div>

      {/* Content Card */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600 bg-red-50 rounded-lg">{error}</div>
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
