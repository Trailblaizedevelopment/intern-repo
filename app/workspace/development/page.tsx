'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Smartphone, Globe, RefreshCw, Plus, Loader2, ExternalLink,
  ChevronDown, ChevronRight,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DevTicket {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  ticket_type: 'ios' | 'web';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUTH = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600',
  backlog: 'bg-gray-100 text-gray-500',
  open: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-amber-100 text-amber-700',
  testing: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  canceled: 'bg-red-100 text-red-500',
  // Linear state types
  backlog_type: 'bg-gray-100 text-gray-600',
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
};

function statusBadge(status: string, stateType?: string) {
  const key = stateType || status.toLowerCase().replace(/\s+/g, '_');
  const cls = STATUS_COLOR[key] || STATUS_COLOR[status] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

const PROJECT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];
function projectColor(name: string, color?: string | null) {
  if (color) return color;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function LinearBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-semibold rounded border border-indigo-200">
      Linear
    </span>
  );
}

function TicketRow({ ticket }: { ticket: DevTicket }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-10 shrink-0">#{ticket.number}</span>
      <span className="flex-1 text-sm text-gray-800 truncate">{ticket.title}</span>
      {ticket.assigned_tester && (
        <span className="text-xs text-gray-500">{ticket.assigned_tester}</span>
      )}
      {ticket.test_result && (
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          ticket.test_result === 'pass' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {ticket.test_result}
        </span>
      )}
      {statusBadge(ticket.status)}
    </div>
  );
}

function LinearIssueRow({ issue, projects }: { issue: LinearIssue; projects: Project[] }) {
  const proj = projects.find(p => p.id === issue.project_id);
  return (
    <div className="flex items-center gap-3 py-2.5 px-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-400 w-16 shrink-0">{issue.identifier}</span>
      <span className="flex-1 text-sm text-gray-800 truncate">{issue.title}</span>
      {issue.assignee_name && (
        <span className="text-xs text-gray-500 hidden sm:block">{issue.assignee_name}</span>
      )}
      <LinearBadge />
      {statusBadge(issue.state_name, issue.state_type)}
      {issue.url && (
        <a href={issue.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-indigo-500">
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
    <div className="mb-3">
      <button
        className="flex items-center gap-2 w-full px-4 py-2 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="font-semibold text-sm text-gray-800 flex-1 text-left">{name}</span>
        <span className="text-xs text-gray-400">{count}</span>
        {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

// ─── iOS Tab ──────────────────────────────────────────────────────────────────

function iOSTab({ tickets, projects }: { tickets: DevTicket[]; projects: Project[] }) {
  const iosTickets = tickets.filter(t => t.ticket_type === 'ios');

  // Group by project
  const byProject: Record<string, DevTicket[]> = {};
  for (const t of iosTickets) {
    const key = t.project || 'No Project';
    if (!byProject[key]) byProject[key] = [];
    byProject[key].push(t);
  }

  if (iosTickets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Smartphone size={40} strokeWidth={1} className="text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No iOS tickets yet</p>
        <p className="text-gray-400 text-sm mt-1">Submit a request to create the first one</p>
      </div>
    );
  }

  return (
    <div>
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

// ─── Web Tab ─────────────────────────────────────────────────────────────────

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
  const webTickets = tickets.filter(t => t.ticket_type === 'web');

  // Group everything by project
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
      {/* Sync bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
        <span className="text-xs text-gray-500">
          {linearIssues.length} Linear issues · {webTickets.length} native tickets
        </span>
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync with Linear'}
        </button>
      </div>

      {projectNames.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Globe size={40} strokeWidth={1} className="text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No web tickets yet</p>
          <p className="text-gray-400 text-sm mt-1">Sync Linear or submit a new request</p>
        </div>
      ) : (
        projectNames.map(projName => {
          const group = byProject[projName];
          const proj = projects.find(p => p.name === projName);
          const color = projectColor(projName, proj?.color);
          const total = group.tickets.length + group.linear.length;
          return (
            <ProjectGroup key={projName} name={projName} color={color} count={total}>
              {group.tickets.map(t => <TicketRow key={t.id} ticket={t} />)}
              {group.linear.map(issue => (
                <LinearIssueRow key={issue.id} issue={issue} projects={projects} />
              ))}
            </ProjectGroup>
          );
        })
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
      // Reload linear issues
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Development
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">iOS & Web engineering work</p>
        </div>
        <Link
          href="/workspace/development/submit"
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={14} />
          Submit Request
        </Link>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center border-b border-gray-200">
        <button
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'ios'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('ios')}
        >
          <Smartphone size={15} />
          iOS Development
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'web'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('web')}
        >
          <Globe size={15} />
          Web Development
        </button>
      </div>

      {/* Content */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600 bg-red-50">{error}</div>
        ) : tab === 'ios' ? (
          iOSTab({ tickets, projects })
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
