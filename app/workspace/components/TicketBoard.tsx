'use client';

import './ticket-roadmap.css';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertTriangle,
  Sparkles,
  User,
  MessageSquare,
  Activity,
  Send,
  Bell,
  BellOff,
  Loader2,
  CalendarDays,
  BarChart3,
  GanttChart,
  Link2,
  RefreshCw,
  ExternalLink,
  Trash2,
  SlidersHorizontal,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  GitMerge,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Employee } from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import { Dropdown } from '@/components/Dropdown';
import { Tooltip } from '@/components/Tooltip';
import { HorizontalScrollNav } from '@/components/HorizontalScrollNav';
import { useToast } from '@/components/Toast';
import { RichTextEditor } from '@/components/RichTextEditor';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { INTERNAL_AUTH_HEADER } from '@/lib/internal-auth';
import { getLinearMobileProjectName, mapCrmAppToLinearProjectName } from '@/lib/linear-project-map';
import { hasLinearLink, resolveLinearTicketUrl } from '@/lib/linear-issue-url';
import {
  formatLinearSyncToast,
  linearSyncHadChanges,
  type LinearSyncResponse,
} from '@/lib/linear-sync-toast';
import { buildWeeklyCompletionBuckets, type GitHubMergesSummary } from '@/lib/github-merges';

const LINEAR_JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  Authorization: INTERNAL_AUTH_HEADER,
};

const LINEAR_AUTO_SYNC_MS = 24 * 60 * 60 * 1000;
const LINEAR_AUTO_SYNC_STORAGE_KEY = 'linear-last-auto-sync';

async function parseLinearApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.json();
    if (typeof json.error === 'string') return json.error;
    if (json.error?.message) return json.error.message;
    if (json.details) return `${fallback}: ${json.details}`;
  } catch {
    // ignore JSON parse errors
  }
  return `${fallback} (HTTP ${res.status})`;
}

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

type TicketStatus = 'backlog' | 'todo' | 'open' | 'in_progress' | 'in_review' | 'testing' | 'done' | 'canceled';
type TicketType = 'bug' | 'feature_request' | 'issue' | 'improvement' | 'task' | 'epic';
type TicketPriority = 'none' | 'low' | 'medium' | 'high' | 'critical';
type ViewMode = 'board' | 'list' | 'timeline' | 'dashboard';
type ProjectTab = 'all' | 'Web App' | 'Mobile App';

interface TicketData {
  id: string;
  number: number;
  title: string;
  description: string | null;
  type: TicketType;
  priority: TicketPriority;
  status: TicketStatus;
  creator_id: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  external_id: string | null;
  linear_identifier: string | null;
  linear_url: string | null;
  labels: string[];
  project: string | null;
  project_id: string | null;
  parent_ticket_id: string | null;
  milestone_id: string | null;
  sprint: string | null;
  story_points: number | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  creator?: { id: string; name: string; email: string; role: string } | null;
  assignee?: { id: string; name: string; email: string; role: string } | null;
  reviewer?: { id: string; name: string; email: string; role: string } | null;
}

interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_name?: string | null;
  content: string;
  mentions: string[];
  created_at: string;
  source?: string;
  author?: { id: string; name: string; email: string; role: string } | null;
}

interface TicketActivityEntry {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  action: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  actor?: { id: string; name: string; email: string } | null;
}

interface TicketNotification {
  id: string;
  recipient_id: string;
  ticket_id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  ticket?: { id: string; number: number; title: string; status: string } | null;
  actor?: { id: string; name: string } | null;
}

interface ProjectData {
  id: string;
  name: string;
  status: string;
  target_date: string | null;
  ticket_count: number;
  tickets_done: number;
}

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════

const STATUS_COLUMNS: { key: TicketStatus; label: string; color: string }[] = [
  { key: 'backlog', label: 'Backlog', color: '#9ca3af' },
  { key: 'todo', label: 'Todo', color: '#6b7280' },
  { key: 'open', label: 'Open', color: '#6b7280' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'in_review', label: 'In Review', color: '#8b5cf6' },
  { key: 'testing', label: 'Testing', color: '#3b82f6' },
  { key: 'done', label: 'Done', color: '#10b981' },
  { key: 'canceled', label: 'Canceled', color: '#ef4444' },
];

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string }> = {
  none: { label: 'None', color: '#d1d5db' },
  low: { label: 'Low', color: '#6b7280' },
  medium: { label: 'Medium', color: '#3b82f6' },
  high: { label: 'High', color: '#f59e0b' },
  critical: { label: 'Critical', color: '#ef4444' },
};

const PRIORITY_BAR_COLORS: Record<TicketPriority, string> = {
  none: '#d1d5db',
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
};

const TYPE_CONFIG: Record<TicketType, { label: string; color: string }> = {
  bug: { label: 'Bug', color: '#db2777' },
  feature_request: { label: 'Feature', color: '#7c3aed' },
  issue: { label: 'Issue', color: '#ca8a04' },
  improvement: { label: 'Improvement', color: '#059669' },
  task: { label: 'Task', color: '#6366f1' },
  epic: { label: 'Epic', color: '#0d9488' },
};

const LINEAR_SYNC_HELP = (
  <>
    <p className="ui-tooltip__title">Sync with Linear</p>
    <p><strong>Click</strong> — incremental sync: pulls recent updates from Linear.</p>
    <p><strong>Shift+click</strong> — full sync: reconciles all issues and removes tickets deleted in Linear from the board (soft-archived as canceled in CRM).</p>
  </>
);

interface TicketFiltersDropdownProps {
  filterStatus: string;
  filterAssignee: string;
  filterPriority: string;
  filterType: string;
  filterProject: string;
  filterLinearOnly: boolean;
  activeFilterCount: number;
  employees: Employee[];
  currentEmployee: Employee | null;
  uniqueProjects: string[];
  onStatusChange: (value: string) => void;
  onAssigneeChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  onLinearOnlyChange: (value: boolean) => void;
  onClear: () => void;
}

function TicketFiltersDropdown({
  filterStatus,
  filterAssignee,
  filterPriority,
  filterType,
  filterProject,
  filterLinearOnly,
  activeFilterCount,
  employees,
  currentEmployee,
  uniqueProjects,
  onStatusChange,
  onAssigneeChange,
  onPriorityChange,
  onTypeChange,
  onProjectChange,
  onLinearOnlyChange,
  onClear,
}: TicketFiltersDropdownProps) {
  return (
    <Dropdown
      align="end"
      panelClassName="tkt__filter-dropdown"
      trigger={
        <button
          type="button"
          className={`tkt__icon-btn ${activeFilterCount > 0 ? 'active' : ''}`}
          title="Filters"
          aria-label="Filter tickets"
        >
          <Filter size={16} />
          {activeFilterCount > 0 && <span className="tkt__filter-count">{activeFilterCount}</span>}
        </button>
      }
    >
      <div className="tkt__filter-dropdown-header">
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <button type="button" className="tkt__clear-filters" onClick={onClear}>
            Clear all
          </button>
        )}
      </div>
      <div className="tkt__filter-group">
        <label htmlFor="tkt-filter-status">Status</label>
        <select id="tkt-filter-status" value={filterStatus} onChange={e => onStatusChange(e.target.value)}>
          <option value="">All</option>
          <option value="active">Active</option>
          {STATUS_COLUMNS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <div className="tkt__filter-group">
        <label htmlFor="tkt-filter-assignee">Assignee</label>
        <select id="tkt-filter-assignee" value={filterAssignee} onChange={e => onAssigneeChange(e.target.value)}>
          <option value="">Anyone</option>
          {currentEmployee && <option value={currentEmployee.id}>Me</option>}
          {employees.filter(e => e.id !== currentEmployee?.id).map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <div className="tkt__filter-group">
        <label htmlFor="tkt-filter-priority">Priority</label>
        <select id="tkt-filter-priority" value={filterPriority} onChange={e => onPriorityChange(e.target.value)}>
          <option value="">Any</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">None</option>
        </select>
      </div>
      <div className="tkt__filter-group">
        <label htmlFor="tkt-filter-type">Type</label>
        <select id="tkt-filter-type" value={filterType} onChange={e => onTypeChange(e.target.value)}>
          <option value="">Any</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      {uniqueProjects.length > 0 && (
        <div className="tkt__filter-group">
          <label htmlFor="tkt-filter-project">Project</label>
          <select id="tkt-filter-project" value={filterProject} onChange={e => onProjectChange(e.target.value)}>
            <option value="">Any</option>
            {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      )}
      <div className="tkt__filter-group tkt__filter-group--checkbox">
        <label className="tkt__filter-checkbox" htmlFor="tkt-filter-linear">
          <input
            id="tkt-filter-linear"
            type="checkbox"
            checked={filterLinearOnly}
            onChange={e => onLinearOnlyChange(e.target.checked)}
          />
          Linear-linked only
        </label>
      </div>
    </Dropdown>
  );
}

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export function TicketBoard() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [projectTab, setProjectTab] = useState<ProjectTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterLinearOnly, setFilterLinearOnly] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [notifications, setNotifications] = useState<TicketNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [linearSyncing, setLinearSyncing] = useState(false);
  const [linearError, setLinearError] = useState<string | null>(null);

  // ── Data fetching ──

  const fetchCurrentEmployee = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`/api/employees?email=${encodeURIComponent(user.email ?? '')}`);
      const { data } = await res.json();
      if (data && data.length > 0) setCurrentEmployee(data[0]);
    } catch (err) {
      console.error('Error fetching current employee:', err);
    }
  }, [user]);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees?status=active');
      const { data } = await res.json();
      if (data) setEmployees(data);
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const { data } = await res.json();
      if (data) setProjects(data);
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterAssignee) params.set('assignee_id', filterAssignee);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterType) params.set('type', filterType);
      // projectTab takes priority over filterProject when set
      if (projectTab !== 'all') params.set('project', projectTab);
      else if (filterProject) params.set('project', filterProject);
      if (filterStatus) params.set('status', filterStatus);
      if (filterLinearOnly) params.set('linked_linear', 'true');
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/tickets?${params}`);
      const { data } = await res.json();
      if (data) setTickets(data);
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [filterAssignee, filterPriority, filterType, filterProject, filterStatus, filterLinearOnly, searchQuery, projectTab]);

  const fetchNotifications = useCallback(async () => {
    if (!currentEmployee) return;
    try {
      const res = await fetch(`/api/tickets/notifications?recipient_id=${currentEmployee.id}&unread_only=true`);
      const { data } = await res.json();
      if (data) setNotifications(data);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [currentEmployee]);

  useEffect(() => {
    fetchCurrentEmployee();
    fetchEmployees();
    fetchProjects();
  }, [fetchCurrentEmployee, fetchEmployees, fetchProjects]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const syncLinear = useCallback(async (fullSync = false, options?: { quiet?: boolean }): Promise<boolean> => {
    setLinearSyncing(true);
    setLinearError(null);
    try {
      const res = await fetch('/api/linear/sync', {
        method: 'POST',
        headers: LINEAR_JSON_HEADERS,
        body: JSON.stringify({ incremental: !fullSync }),
      });
      if (!res.ok) throw new Error(await parseLinearApiError(res, 'Sync failed'));
      const json = (await res.json()) as LinearSyncResponse & { error?: string | { message?: string } };
      if (json.error) {
        throw new Error(typeof json.error === 'string' ? json.error : json.error.message || 'Sync failed');
      }
      await fetchTickets();

      const shouldNotify = !options?.quiet || linearSyncHadChanges(json);
      if (shouldNotify) {
        const toast = formatLinearSyncToast(json, fullSync);
        showToast(toast.message, toast.type);
      }
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sync failed';
      setLinearError(message);
      if (!options?.quiet) {
        showToast(message, 'error', 6000);
      }
      return false;
    } finally {
      setLinearSyncing(false);
    }
  }, [fetchTickets, showToast]);

  // Incremental pull at most once per day (persists across visits via localStorage)
  useEffect(() => {
    const runAutoSyncIfDue = async () => {
      try {
        const last = localStorage.getItem(LINEAR_AUTO_SYNC_STORAGE_KEY);
        const lastMs = last ? Number(last) : 0;
        if (Number.isFinite(lastMs) && Date.now() - lastMs < LINEAR_AUTO_SYNC_MS) return;
      } catch {
        // localStorage unavailable — still attempt sync
      }

      const ok = await syncLinear(false, { quiet: true });
      if (!ok) return;

      try {
        localStorage.setItem(LINEAR_AUTO_SYNC_STORAGE_KEY, String(Date.now()));
      } catch {
        // ignore
      }
    };

    void runAutoSyncIfDue();
    const interval = setInterval(() => void runAutoSyncIfDue(), LINEAR_AUTO_SYNC_MS);
    return () => clearInterval(interval);
  }, [syncLinear]);

  // ── Grouped tickets for Kanban ──

  const groupedTickets = useMemo(() => {
    const groups: Record<TicketStatus, TicketData[]> = {
      backlog: [], todo: [], open: [], in_progress: [], in_review: [], testing: [], done: [], canceled: [],
    };
    tickets.forEach(t => groups[t.status]?.push(t));
    // Sort each column by priority
    (Object.keys(groups) as TicketStatus[]).forEach(status => {
      groups[status].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));
    });
    return groups;
  }, [tickets]);

  // ── Actions ──

  const markNotificationsRead = async () => {
    if (!currentEmployee || notifications.length === 0) return;
    try {
      await fetch('/api/tickets/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all: true, recipient_id: currentEmployee.id }),
      });
      setNotifications([]);
    } catch (err) {
      console.error('Error marking notifications read:', err);
    }
  };

  const uniqueProjects = useMemo(() => {
    const p = new Set<string>();
    tickets.forEach(t => { if (t.project) p.add(t.project); });
    return Array.from(p).sort();
  }, [tickets]);

  // Ticket counts per project tab (based on all loaded tickets when tab=all)
  const projectTabCounts = useMemo(() => {
    return {
      'all': tickets.length,
      'Web App': tickets.filter(t => t.project === 'Web App').length,
      'Mobile App': tickets.filter(t => t.project === 'Mobile App').length,
    };
  }, [tickets]);

  const activeFilterCount = [filterStatus, filterAssignee, filterPriority, filterType, filterProject, filterLinearOnly].filter(Boolean).length;

  // ── Drag & Drop ──
  const [dragTicketId, setDragTicketId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);

  const handleDragStart = (ticketId: string) => {
    setDragTicketId(ticketId);
  };

  const handleDragOver = (e: React.DragEvent, status: TicketStatus) => {
    e.preventDefault();
    setDragOverStatus(status);
  };

  const handleDragLeave = () => {
    setDragOverStatus(null);
  };

  const clearFilters = () => {
    setFilterStatus('');
    setFilterAssignee('');
    setFilterPriority('');
    setFilterType('');
    setFilterProject('');
    setFilterLinearOnly(false);
  };

  const handleDrop = async (newStatus: TicketStatus) => {
    setDragOverStatus(null);
    if (!dragTicketId) return;
    const ticket = tickets.find(t => t.id === dragTicketId);
    if (!ticket || ticket.status === newStatus) { setDragTicketId(null); return; }
    setDragTicketId(null);
    await handleStatusChange(ticket.id, newStatus, currentEmployee, null, fetchTickets);
  };

  return (
    <div className="tkt">
      {/* ── Header ── */}
      <header className="tkt__header">
        <div className="tkt__header-left">
          <h1>Tickets</h1>
        </div>
        <div className="tkt__header-right">
          <div className="tkt__search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search tickets... (#238 or TRA-123)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <TicketFiltersDropdown
            filterStatus={filterStatus}
            filterAssignee={filterAssignee}
            filterPriority={filterPriority}
            filterType={filterType}
            filterProject={filterProject}
            filterLinearOnly={filterLinearOnly}
            activeFilterCount={activeFilterCount}
            employees={employees}
            currentEmployee={currentEmployee}
            uniqueProjects={uniqueProjects}
            onStatusChange={setFilterStatus}
            onAssigneeChange={setFilterAssignee}
            onPriorityChange={setFilterPriority}
            onTypeChange={setFilterType}
            onProjectChange={setFilterProject}
            onLinearOnlyChange={setFilterLinearOnly}
            onClear={clearFilters}
          />

          <div className="tkt__view-toggle">
            <button className={viewMode === 'board' ? 'active' : ''} onClick={() => setViewMode('board')} title="Board">
              <LayoutGrid size={16} />
            </button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} title="List">
              <List size={16} />
            </button>
            <button className={viewMode === 'timeline' ? 'active' : ''} onClick={() => setViewMode('timeline')} title="Roadmap">
              <GanttChart size={16} />
            </button>
            <button className={viewMode === 'dashboard' ? 'active' : ''} onClick={() => setViewMode('dashboard')} title="Analytics">
              <BarChart3 size={16} />
            </button>
          </div>

          <div className="tkt__notif-wrapper">
            <button className="tkt__icon-btn" onClick={() => setShowNotifications(!showNotifications)} title="Notifications">
              <Bell size={16} />
              {notifications.length > 0 && <span className="tkt__notif-dot">{notifications.length}</span>}
            </button>
            {showNotifications && (
              <NotificationDropdown
                notifications={notifications}
                onClose={() => setShowNotifications(false)}
                onMarkRead={markNotificationsRead}
                onTicketClick={id => {
                  const t = tickets.find(tk => tk.id === id);
                  if (t) setSelectedTicket(t);
                  setShowNotifications(false);
                }}
              />
            )}
          </div>
        </div>
      </header>

      {/* ── Project Tabs ── */}
      <div className="tkt__project-tabs">
        {(['all', 'Web App', 'Mobile App'] as ProjectTab[]).map(tab => (
          <button
            key={tab}
            className={`tkt__project-tab ${projectTab === tab ? 'active' : ''}`}
            onClick={() => {
              setProjectTab(tab);
              setLoading(true);
            }}
          >
            {tab === 'all' ? 'All Tickets' : tab}
            <span className="tkt__project-tab-count">{projectTab === tab || tab === 'all' ? projectTabCounts[tab] : '—'}</span>
          </button>
        ))}
        <div className="tkt__tab-actions">
          {linearError && <span className="tkt__linear-error">{linearError}</span>}
          <Tooltip content="New ticket" side="bottom" align="end" compact>
            <button
              type="button"
              className="tkt__round-btn tkt__round-btn--create"
              onClick={() => setShowCreateModal(true)}
              aria-label="New ticket"
            >
              <Plus size={16} />
            </button>
          </Tooltip>
          <Tooltip content={LINEAR_SYNC_HELP} side="bottom" align="end">
            <button
              type="button"
              className="tkt__round-btn tkt__round-btn--sync"
              onClick={e => syncLinear(e.shiftKey)}
              disabled={linearSyncing}
              aria-label="Sync with Linear. Shift+click for full sync."
              aria-busy={linearSyncing}
            >
              <RefreshCw size={16} className={linearSyncing ? 'tkt__spinner' : ''} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="tkt__loading">
          <Loader2 size={24} className="tkt__spinner" />
          <p>Loading tickets...</p>
        </div>
      ) : viewMode === 'board' ? (
        <HorizontalScrollNav
          className="tkt__board-shell"
          viewportClassName="tkt__board"
          controlsClassName="tkt__board-nav"
          itemSelector=".tkt__column"
          ariaLabel="Ticket board columns"
        >
          {STATUS_COLUMNS.map(col => (
            <div
              key={col.key}
              className={`tkt__column ${dragOverStatus === col.key ? 'tkt__drag-over' : ''}`}
              onDragOver={e => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(col.key)}
            >
              <div className="tkt__column-header">
                <span className="tkt__column-dot" style={{ background: col.color }} />
                <span className="tkt__column-label">{col.label}</span>
                <span className="tkt__column-count">{groupedTickets[col.key].length}</span>
              </div>
              <div className="tkt__column-body">
                {groupedTickets[col.key].length === 0 ? (
                  <div className="tkt__column-empty">No tickets</div>
                ) : (
                  groupedTickets[col.key].map(ticket => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onClick={() => setSelectedTicket(ticket)}
                      onDragStart={() => handleDragStart(ticket.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </HorizontalScrollNav>
      ) : viewMode === 'list' ? (
        <TicketListView tickets={tickets} onTicketClick={setSelectedTicket} />
      ) : viewMode === 'timeline' ? (
        <RoadmapView tickets={tickets} onTicketClick={setSelectedTicket} />
      ) : (
        <DashboardView tickets={tickets} />
      )}

      {showCreateModal && (
        <CreateTicketModal
          employees={employees}
          currentEmployee={currentEmployee}
          tickets={tickets}
          defaultProject={projectTab !== 'all' ? projectTab : 'Web App'}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchTickets(); }}
        />
      )}

      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          employees={employees}
          currentEmployee={currentEmployee}
          projects={projects}
          allTickets={tickets}
          onClose={() => setSelectedTicket(null)}
          onUpdate={() => { fetchTickets(); fetchNotifications(); }}
          onTicketChange={setSelectedTicket}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// STATUS CHANGE HELPER
// ═══════════════════════════════════════════

async function handleStatusChange(
  ticketId: string,
  newStatus: TicketStatus,
  currentEmployee: Employee | null,
  reviewerId: string | null,
  onDone: () => void
) {
  try {
    const body: Record<string, unknown> = { status: newStatus, actor_id: currentEmployee?.id };
    if (reviewerId) body.reviewer_id = reviewerId;
    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (result.error) alert(result.error.message);
    onDone();
  } catch (err) {
    console.error('Error changing status:', err);
  }
}

// ═══════════════════════════════════════════
// LINEAR LINK
// ═══════════════════════════════════════════

function LinearTicketLink({
  ticket,
  className = 'tkt__linear-link',
  showIcon = true,
}: {
  ticket: Pick<TicketData, 'linear_url' | 'linear_identifier' | 'external_id'>;
  className?: string;
  showIcon?: boolean;
}) {
  const url = resolveLinearTicketUrl(ticket);
  const label = ticket.linear_identifier;
  if (!url || !label) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="Open in Linear"
      onClick={e => e.stopPropagation()}
    >
      {label}
      {showIcon && <ExternalLink size={10} />}
    </a>
  );
}

// ═══════════════════════════════════════════
// TICKET CARD (Kanban)
// ═══════════════════════════════════════════

function TicketCard({ ticket, onClick, onDragStart }: { ticket: TicketData; onClick: () => void; onDragStart: () => void }) {
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];
  const typeCfg = TYPE_CONFIG[ticket.type];
  const platformBadge =
    ticket.project === 'Mobile App'
      ? { key: 'mobile' as const, label: 'Mobile' }
      : ticket.project
        ? { key: 'web' as const, label: 'Web' }
        : null;

  return (
    <div
      className="tkt__card"
      onClick={onClick}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
    >
      <div className="tkt__card-header">
        <div className="tkt__card-ids">
          {hasLinearLink(ticket) ? (
            <LinearTicketLink ticket={ticket} className="tkt__card-id tkt__linear-link" />
          ) : (
            <span className="tkt__card-id">#{ticket.number}</span>
          )}
        </div>
        {ticket.assignee ? (
          <div className="tkt__card-assignee" title={ticket.assignee.name}>
            {ticket.assignee.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
        ) : (
          <div className="tkt__card-assignee unassigned" title="Unassigned">
            <User size={11} />
          </div>
        )}
      </div>

      <h4 className="tkt__card-title" title={ticket.title}>{ticket.title}</h4>

      <div className="tkt__card-footer">
        <div className="tkt__card-footer-left">
          {platformBadge && (
            <span className={`tkt__project-badge tkt__project-badge--${platformBadge.key}`}>
              {platformBadge.label}
            </span>
          )}
        </div>
        <div
          className="tkt__card-footer-right"
          onMouseEnter={e => e.stopPropagation()}
        >
          {ticket.priority !== 'none' && (
            <Tooltip content={`Priority: ${priorityCfg.label}`} side="top" align="end" delayMs={250} compact>
              <span
                className="tkt__priority-dot"
                style={{ backgroundColor: priorityCfg.color }}
                role="img"
                aria-label={`Priority: ${priorityCfg.label}`}
              />
            </Tooltip>
          )}
          {typeCfg && (
            <Tooltip content={`Type: ${typeCfg.label}`} side="top" align="end" delayMs={250} compact>
              <span
                className="tkt__type-dot"
                style={{ backgroundColor: typeCfg.color }}
                role="img"
                aria-label={`Type: ${typeCfg.label}`}
              />
            </Tooltip>
          )}
          {ticket.due_date && (
            <Tooltip content={`Due ${parseDueDateLocal(ticket.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`} side="top" align="end" delayMs={250} compact>
              <span className="tkt__card-due">
                <CalendarDays size={11} />
                {formatDueDateShort(ticket.due_date)}
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// LIST VIEW (with sorting)
// ═══════════════════════════════════════════

type SortField = 'number' | 'title' | 'status' | 'priority' | 'type' | 'assignee' | 'created_at' | 'due_date';
type SortDir = 'asc' | 'desc' | null;

const PRIORITY_ORDER: Record<TicketPriority, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

function ListSortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
  className = '',
}: {
  field: SortField;
  label: string;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const active = sortField === field;
  const SortIcon = !active || !sortDir
    ? ArrowUpDown
    : sortDir === 'asc'
      ? ArrowUp
      : ArrowDown;

  return (
    <span
      className={`tkt__list-col tkt__sort-header ${className} ${active ? 'tkt__sort-header--active' : ''}`.trim()}
      onClick={() => onSort(field)}
      role="columnheader"
      aria-sort={active && sortDir ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={active && sortDir ? `Sorted ${sortDir === 'asc' ? 'ascending' : 'descending'}` : 'Sort column'}
    >
      <span>{label}</span>
      <SortIcon
        size={12}
        className={`tkt__sort-icon ${active && sortDir ? 'tkt__sort-icon--active' : 'tkt__sort-icon--neutral'}`}
        aria-hidden
      />
    </span>
  );
}

function TicketListView({ tickets, onTicketClick }: { tickets: TicketData[]; onTicketClick: (t: TicketData) => void }) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') { setSortField(null); setSortDir(null); }
      else setSortDir('asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortField || !sortDir) return [...tickets].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4));
    const arr = [...tickets];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortField) {
        case 'number': return (a.number - b.number) * dir;
        case 'title': return a.title.localeCompare(b.title) * dir;
        case 'status': return a.status.localeCompare(b.status) * dir;
        case 'priority': return ((PRIORITY_ORDER[a.priority] || 0) - (PRIORITY_ORDER[b.priority] || 0)) * dir;
        case 'type': return a.type.localeCompare(b.type) * dir;
        case 'assignee': return (a.assignee?.name || '').localeCompare(b.assignee?.name || '') * dir;
        case 'created_at': return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
        case 'due_date': {
          const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return (da - db) * dir;
        }
        default: return 0;
      }
    });
    return arr;
  }, [tickets, sortField, sortDir]);

  return (
    <div className="tkt__list">
      <div className="tkt__list-header-row">
        <ListSortHeader field="number" label="#" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="tkt__list-col--id" />
        <ListSortHeader field="title" label="Title" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="tkt__list-col--title" />
        <span className="tkt__list-col tkt__list-col--project">Project</span>
        <ListSortHeader field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="tkt__list-col--status" />
        <ListSortHeader field="priority" label="Priority" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="tkt__list-col--priority" />
        <ListSortHeader field="type" label="Type" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="tkt__list-col--type" />
        <ListSortHeader field="assignee" label="Assignee" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="tkt__list-col--assignee" />
        <ListSortHeader field="due_date" label="Due" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="tkt__list-col--date" />
        <ListSortHeader field="created_at" label="Created" sortField={sortField} sortDir={sortDir} onSort={toggleSort} className="tkt__list-col--date" />
      </div>
      {sorted.length === 0 ? (
        <div className="tkt__list-empty">No tickets found</div>
      ) : (
        sorted.map(ticket => {
          const statusCol = STATUS_COLUMNS.find(s => s.key === ticket.status);
          const typeCfg = TYPE_CONFIG[ticket.type];
          return (
            <div key={ticket.id} className="tkt__list-row" onClick={() => onTicketClick(ticket)}>
              <span className="tkt__list-col tkt__list-col--id">{ticket.number}</span>
              <span className="tkt__list-col tkt__list-col--title">
                <span className="tkt__list-title-cell">
                  {hasLinearLink(ticket) && (
                    <LinearTicketLink
                      ticket={ticket}
                      className="tkt__list-linear-key tkt__linear-link"
                      showIcon={false}
                    />
                  )}
                  <span className="tkt__list-title-text" title={ticket.title}>{ticket.title}</span>
                </span>
              </span>
              <span className="tkt__list-col tkt__list-col--project">
                {ticket.project && (
                  <span className={`tkt__project-badge tkt__project-badge--${ticket.project === 'Mobile App' ? 'mobile' : 'web'}`}>
                    {ticket.project === 'Mobile App' ? 'Mobile' : 'Web'}
                  </span>
                )}
              </span>
              <span className="tkt__list-col tkt__list-col--status">
                <span className="tkt__status-pill" style={{ color: statusCol?.color, background: `${statusCol?.color}15` }}>{statusCol?.label}</span>
              </span>
              <span className="tkt__list-col tkt__list-col--priority" style={{ flexShrink: 0 }}>
                <span className="tkt__list-priority">
                  <span className="tkt__priority-dot" style={{ backgroundColor: PRIORITY_CONFIG[ticket.priority].color }} />
                  {PRIORITY_CONFIG[ticket.priority].label}
                </span>
              </span>
              <span className="tkt__list-col tkt__list-col--type">
                {typeCfg && (
                  <span className="tkt__list-type">
                    <span className="tkt__type-dot" style={{ backgroundColor: typeCfg.color }} />
                    {typeCfg.label}
                  </span>
                )}
              </span>
              <span className="tkt__list-col tkt__list-col--assignee">{ticket.assignee?.name || 'Unassigned'}</span>
              <span className="tkt__list-col tkt__list-col--date">
                {ticket.due_date ? formatDueDateShort(ticket.due_date) : '—'}
              </span>
              <span className="tkt__list-col tkt__list-col--date">
                {new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// ROADMAP VIEW (Linear, week-by-week)
// ═══════════════════════════════════════════

const ROADMAP_STATUSES: TicketStatus[] = ['in_progress', 'todo', 'open', 'in_review'];
const ROADMAP_WEEKS_BACK = 2;
const ROADMAP_MONTHS_FORWARD = 2;
const ROADMAP_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface RoadmapWeek {
  key: string;
  start: Date;
  end: Date;
  label: string;
  isCurrent: boolean;
}

interface RoadmapDay {
  key: string;
  date: Date;
  dayName: string;
  dateLabel: string;
  isToday: boolean;
}

function startOfWeekSunday(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function endOfWeekSaturday(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** CRM stores due_date as YYYY-MM-DD or full ISO (e.g. from Supabase timestamptz). */
function parseDueDateLocal(dueDate: string): Date {
  return new Date(dueDate.slice(0, 10) + 'T00:00:00');
}

function formatDueDateShort(dueDate: string): string {
  return parseDueDateLocal(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function buildRoadmapWeeks(anchor: Date): { weeks: RoadmapWeek[]; rangeLabel: string } {
  const today = new Date(anchor);
  today.setHours(0, 0, 0, 0);
  const rangeStart = startOfWeekSunday(addDays(today, -ROADMAP_WEEKS_BACK * 7));
  const rangeEnd = endOfWeekSaturday(startOfWeekSunday(addMonths(today, ROADMAP_MONTHS_FORWARD)));

  const weeks: RoadmapWeek[] = [];
  let cursor = new Date(rangeStart);
  while (cursor.getTime() <= rangeEnd.getTime()) {
    const start = new Date(cursor);
    const end = endOfWeekSaturday(start);
    weeks.push({
      key: localDateKey(start),
      start,
      end,
      label: formatWeekRange(start, end),
      isCurrent: today >= start && today <= end,
    });
    cursor = addDays(start, 7);
  }

  const rangeLabel = `${rangeStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${rangeEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  return { weeks, rangeLabel };
}

function buildWeekDays(weekStart: Date, today: Date): RoadmapDay[] {
  const days: RoadmapDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const isToday = localDateKey(date) === localDateKey(today);
    days.push({
      key: localDateKey(date),
      date,
      dayName: ROADMAP_DAY_NAMES[i],
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isToday,
    });
  }
  return days;
}

function dueDateDayKey(dueDate: string): string {
  return localDateKey(parseDueDateLocal(dueDate));
}

function RoadmapView({ tickets, onTicketClick }: { tickets: TicketData[]; onTicketClick: (t: TicketData) => void }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const { weeks: allWeeks, rangeLabel } = useMemo(() => buildRoadmapWeeks(today), [today]);

  const defaultWeekIndex = useMemo(() => {
    const currentIdx = allWeeks.findIndex(w => w.isCurrent);
    return currentIdx >= 0 ? currentIdx : 0;
  }, [allWeeks]);

  const [weekIndex, setWeekIndex] = useState(defaultWeekIndex);

  const visibleWeek = allWeeks[weekIndex];
  const visibleDays = useMemo(
    () => (visibleWeek ? buildWeekDays(visibleWeek.start, today) : []),
    [visibleWeek, today]
  );

  const roadmapTickets = useMemo(() => {
    if (allWeeks.length === 0) return [];
    const rangeStart = allWeeks[0].start.getTime();
    const rangeEnd = allWeeks[allWeeks.length - 1].end.getTime();
    return tickets
      .filter(t => hasLinearLink(t))
      .filter(t => t.due_date)
      .filter(t => ROADMAP_STATUSES.includes(t.status))
      .filter(t => {
        const due = parseDueDateLocal(t.due_date!).getTime();
        return due >= rangeStart && due <= rangeEnd;
      })
      .sort((a, b) => parseDueDateLocal(a.due_date!).getTime() - parseDueDateLocal(b.due_date!).getTime());
  }, [tickets, allWeeks]);

  const visibleDayKeys = useMemo(() => new Set(visibleDays.map(d => d.key)), [visibleDays]);

  const visibleTickets = useMemo(
    () => roadmapTickets.filter(t => t.due_date && visibleDayKeys.has(dueDateDayKey(t.due_date))),
    [roadmapTickets, visibleDayKeys]
  );

  const gridCols = `minmax(200px, 1fr) repeat(7, minmax(52px, 1fr))`;
  const gridStyle = { display: 'grid' as const, gridTemplateColumns: gridCols };

  const filterStats = useMemo(() => {
    if (allWeeks.length === 0) {
      return { linear: 0, withDue: 0, inRange: 0 };
    }
    const rangeStart = allWeeks[0].start.getTime();
    const rangeEnd = allWeeks[allWeeks.length - 1].end.getTime();
    const linear = tickets.filter(t => hasLinearLink(t));
    const withDue = linear.filter(t => t.due_date);
    const inRange = withDue
      .filter(t => ROADMAP_STATUSES.includes(t.status))
      .filter(t => {
        const due = parseDueDateLocal(t.due_date!).getTime();
        return due >= rangeStart && due <= rangeEnd;
      });
    return { linear: linear.length, withDue: withDue.length, inRange: inRange.length };
  }, [tickets, allWeeks]);

  const maxWeekIndex = Math.max(0, allWeeks.length - 1);

  return (
    <div className="tkt__roadmap">
      <div className="tkt__roadmap-toolbar">
        <div className="tkt__roadmap-toolbar-text">
          <h3 className="tkt__roadmap-title">Linear Roadmap</h3>
          <p className="tkt__roadmap-subtitle">
            Active work to ship · one week at a time · due on that day · {rangeLabel}
          </p>
        </div>
        <div className="tkt__roadmap-nav">
          <button
            type="button"
            className="tkt__roadmap-nav-btn"
            disabled={weekIndex <= 0}
            onClick={() => setWeekIndex(i => Math.max(0, i - 1))}
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="tkt__roadmap-nav-label">
            {visibleWeek?.label}
            {visibleWeek?.isCurrent && <span className="tkt__roadmap-nav-today"> · This week</span>}
          </span>
          <button
            type="button"
            className="tkt__roadmap-nav-btn"
            disabled={weekIndex >= maxWeekIndex}
            onClick={() => setWeekIndex(i => Math.min(maxWeekIndex, i + 1))}
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <span className="tkt__roadmap-count">{visibleTickets.length} ticket{visibleTickets.length === 1 ? '' : 's'}</span>
      </div>

      <div className="tkt__roadmap-sheet">
        <div className="tkt__roadmap-scroll">
          <div className="tkt__roadmap-header-row" style={gridStyle}>
            <div className="tkt__roadmap-label-col tkt__roadmap-label-col--header">Work item</div>
            {visibleDays.map(day => (
              <div
                key={day.key}
                className={`tkt__roadmap-day-col ${day.isToday ? 'tkt__roadmap-day-col--today' : ''}`}
              >
                <span className="tkt__roadmap-day-name">{day.dayName}</span>
                <span className="tkt__roadmap-day-date">{day.dateLabel}</span>
              </div>
            ))}
          </div>

          <div className="tkt__roadmap-body">
          {visibleTickets.length === 0 ? (
            <div className="tkt__roadmap-empty">
              {roadmapTickets.length === 0 ? (
                <>
                  No active Linear tickets with due dates in this range.
                  <p className="tkt__roadmap-empty-hint">
                    {filterStats.linear} Linear-linked · {filterStats.withDue} with due dates ·{' '}
                    {filterStats.inRange} in range ({rangeLabel})
                  </p>
                </>
              ) : (
                <>
                  Nothing due this week — use ← → to browse other weeks ({roadmapTickets.length} ticket
                  {roadmapTickets.length === 1 ? '' : 's'} in range).
                </>
              )}
            </div>
          ) : (
            visibleTickets.map(ticket => {
              const statusCfg = STATUS_COLUMNS.find(s => s.key === ticket.status);
              const dueDayKey = ticket.due_date ? dueDateDayKey(ticket.due_date) : '';
              const priorityCfg = PRIORITY_CONFIG[ticket.priority];
              return (
                <div
                  key={ticket.id}
                  className="tkt__roadmap-row"
                  style={gridStyle}
                  onClick={() => onTicketClick(ticket)}
                >
                  <div className="tkt__roadmap-label-col">
                    <div className="tkt__roadmap-ticket-ids">
                      <LinearTicketLink ticket={ticket} className="tkt__roadmap-linear-id" />
                      {statusCfg && (
                        <span
                          className="tkt__roadmap-status"
                          style={{ color: statusCfg.color, borderColor: statusCfg.color }}
                        >
                          {statusCfg.label}
                        </span>
                      )}
                    </div>
                    <p className="tkt__roadmap-ticket-title" title={ticket.title}>{ticket.title}</p>
                    <div className="tkt__roadmap-ticket-meta">
                      {ticket.assignee ? (
                        <span className="tkt__roadmap-assignee">{ticket.assignee.name}</span>
                      ) : (
                        <span className="tkt__roadmap-assignee tkt__roadmap-assignee--none">Unassigned</span>
                      )}
                      {ticket.due_date && (
                        <span className="tkt__roadmap-due">
                          <CalendarDays size={11} />
                          {formatDueDateShort(ticket.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  {visibleDays.map(day => (
                    <div
                      key={day.key}
                      className={`tkt__roadmap-day-col tkt__roadmap-day-cell ${day.isToday ? 'tkt__roadmap-day-col--today' : ''}`}
                    >
                      {dueDayKey === day.key && (
                        <span
                          className="tkt__roadmap-day-marker"
                          style={{ backgroundColor: priorityCfg.color }}
                          title={`Due ${formatDueDateShort(ticket.due_date!)} · ${ticket.title}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// ANALYTICS VIEW
// ═══════════════════════════════════════════

function formatMergeDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DASH_KPI_TIPS = {
  doneThisWeek: 'Tickets marked Done since Monday. Uses resolved date, or last update if none. Counts match the current board filters.',
  priorAvg: 'Average Done tickets per week over the three calendar weeks before this one (Mon–Sun).',
  prodMerges: 'Merged pull requests into main (production) on Trailblaize-Web this calendar week.',
  active: 'Tickets still open (excluding Done and Canceled). Critical is the urgent-priority subset.',
} as const;

const DASH_SECTION_TIPS = {
  weekly: (
    <>
      <p className="ui-tooltip__title">Weekly completions</p>
      <p>Done tickets grouped by calendar week (Monday start). The purple bar is this week; gray bars are prior weeks.</p>
    </>
  ),
  github: (
    <>
      <p className="ui-tooltip__title">GitHub merges</p>
      <p>Recent merged PRs from Trailblaize-Web. Develop is the integration branch; Production is main. Generic branch-sync PRs titled &quot;Develop&quot; are hidden.</p>
    </>
  ),
} as const;

function DashKpiCard({
  tip,
  children,
}: {
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={tip} side="top" align="center" delayMs={200} compact>
      <div className="tkt__dash-kpi tkt__dash-kpi--tip" tabIndex={0}>
        {children}
      </div>
    </Tooltip>
  );
}

function DashSectionTip({ content, label }: { content: React.ReactNode; label: string }) {
  return (
    <Tooltip content={content} side="top" align="start" delayMs={150}>
      <button type="button" className="tkt__dash-info-btn" aria-label={`About ${label}`}>
        <HelpCircle size={13} />
      </button>
    </Tooltip>
  );
}

function DashboardView({ tickets }: { tickets: TicketData[] }) {
  const [github, setGithub] = useState<GitHubMergesSummary | null>(null);
  const [githubLoading, setGithubLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/github/merges');
        const json = await res.json();
        if (!cancelled && json.data) setGithub(json.data);
      } catch (err) {
        console.error('Failed to load GitHub merges:', err);
      } finally {
        if (!cancelled) setGithubLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const weeklyBuckets = useMemo(() => buildWeeklyCompletionBuckets(tickets, 4), [tickets]);
  const maxWeekly = Math.max(1, ...weeklyBuckets.map(b => b.count));
  const thisWeekDone = weeklyBuckets[weeklyBuckets.length - 1]?.count ?? 0;
  const priorWeeks = weeklyBuckets.slice(0, -1);
  const priorAvg = priorWeeks.length
    ? Math.round(priorWeeks.reduce((sum, b) => sum + b.count, 0) / priorWeeks.length)
    : 0;

  const activeTickets = tickets.filter(t => !['done', 'canceled'].includes(t.status));
  const criticalCount = tickets.filter(t => t.priority === 'critical' && !['done', 'canceled'].includes(t.status)).length;

  const weekStart = useMemo(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const completedThisWeek = useMemo(() => (
    tickets
      .filter(t => {
        if (t.status !== 'done') return false;
        const resolved = new Date(t.resolved_at || t.updated_at);
        return resolved >= weekStart;
      })
      .sort((a, b) => new Date(b.resolved_at || b.updated_at).getTime() - new Date(a.resolved_at || a.updated_at).getTime())
      .slice(0, 5)
  ), [tickets, weekStart]);

  const renderMergeList = (items: GitHubMergesSummary['develop'], emptyLabel: string) => {
    if (githubLoading) {
      return <p className="tkt__dash-muted"><Loader2 size={14} className="tkt__spinner" /> Loading merges…</p>;
    }
    if (!github?.configured) {
      return <p className="tkt__dash-muted">Add GITHUB_TOKEN to show merge activity.</p>;
    }
    if (github.error) {
      return <p className="tkt__dash-muted">{github.error}</p>;
    }
    if (items.length === 0) {
      return <p className="tkt__dash-muted">{emptyLabel}</p>;
    }
    return (
      <ul className="tkt__dash-merge-list">
        {items.map(item => (
          <li key={`${item.base}-${item.number}`}>
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="tkt__dash-merge-link">
              <span className="tkt__dash-merge-title">#{item.number} {item.title}</span>
              <span className="tkt__dash-merge-meta">
                {formatMergeDate(item.merged_at)}
                {item.author ? ` · ${item.author}` : ''}
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="tkt__dashboard tkt__dashboard--analytics">
      <div className="tkt__dash-kpi-row">
        <DashKpiCard tip={DASH_KPI_TIPS.doneThisWeek}>
          <span className="tkt__dash-kpi-value">{thisWeekDone}</span>
          <span className="tkt__dash-kpi-label">Done this week</span>
        </DashKpiCard>
        <DashKpiCard tip={DASH_KPI_TIPS.priorAvg}>
          <span className="tkt__dash-kpi-value">{priorAvg}</span>
          <span className="tkt__dash-kpi-label">Prior 3-wk avg</span>
        </DashKpiCard>
        <DashKpiCard tip={DASH_KPI_TIPS.prodMerges}>
          <span className="tkt__dash-kpi-value">{github?.production_this_week ?? '—'}</span>
          <span className="tkt__dash-kpi-label">Prod merges (wk)</span>
        </DashKpiCard>
        <DashKpiCard tip={DASH_KPI_TIPS.active}>
          <span className="tkt__dash-kpi-value" style={{ color: criticalCount > 0 ? '#ef4444' : undefined }}>
            {activeTickets.length}
          </span>
          <span className="tkt__dash-kpi-label">Active · {criticalCount} critical</span>
        </DashKpiCard>
      </div>

      <div className="tkt__dash-grid">
        <section className="tkt__dash-panel">
          <div className="tkt__dash-panel-head">
            <h3 className="tkt__dash-title">
              Weekly completions
              <DashSectionTip content={DASH_SECTION_TIPS.weekly} label="weekly completions" />
            </h3>
            <span className="tkt__dash-subtitle">Tickets marked done</span>
          </div>
          <div className="tkt__dash-week-bars">
            {weeklyBuckets.map(bucket => (
              <div key={bucket.label} className="tkt__dash-week-bar">
                <span className="tkt__dash-week-count">{bucket.count}</span>
                <div
                  className={`tkt__dash-week-bar-fill ${bucket.isCurrent ? 'tkt__dash-week-bar-fill--current' : ''}`}
                  style={{ height: `${Math.max(8, (bucket.count / maxWeekly) * 100)}%` }}
                />
                <span className="tkt__dash-week-label">{bucket.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="tkt__dash-panel">
          <div className="tkt__dash-panel-head">
            <h3 className="tkt__dash-title">
              <GitMerge size={15} />
              GitHub · Trailblaize-Web
              <DashSectionTip content={DASH_SECTION_TIPS.github} label="GitHub merges" />
            </h3>
            <a
              href="https://github.com/Trailblaizedevelopment/Trailblaize-Web"
              target="_blank"
              rel="noopener noreferrer"
              className="tkt__dash-repo-link"
            >
              Open repo <ExternalLink size={11} />
            </a>
          </div>
          <div className="tkt__dash-merge-columns">
            <div className="tkt__dash-merge-col">
              <div className="tkt__dash-merge-col-head">
                <span className="tkt__dash-merge-branch tkt__dash-merge-branch--develop">develop</span>
                <span className="tkt__dash-merge-count">{github?.develop_this_week ?? 0} this wk</span>
              </div>
              {renderMergeList(github?.develop ?? [], 'No recent develop merges')}
            </div>
            <div className="tkt__dash-merge-col">
              <div className="tkt__dash-merge-col-head">
                <span className="tkt__dash-merge-branch tkt__dash-merge-branch--prod">production</span>
                <span className="tkt__dash-merge-count">{github?.production_this_week ?? 0} this wk</span>
              </div>
              {renderMergeList(github?.production ?? [], 'No recent production merges')}
            </div>
          </div>
        </section>
      </div>

      <section className="tkt__dash-panel tkt__dash-panel--compact">
        <div className="tkt__dash-panel-head">
          <h3 className="tkt__dash-title">Completed this week</h3>
          <span className="tkt__dash-subtitle">Latest done tickets for sales / eng sync</span>
        </div>
        {completedThisWeek.length === 0 ? (
          <p className="tkt__dash-muted">No tickets completed yet this week.</p>
        ) : (
          <div className="tkt__dash-done-list">
            {completedThisWeek.map(t => (
              <div key={t.id} className="tkt__dash-done-item">
                <span className="tkt__dash-done-id">{t.linear_identifier || `#${t.number}`}</span>
                <span className="tkt__dash-done-title" title={t.title}>{t.title}</span>
                <span className="tkt__dash-done-date">
                  {formatMergeDate(t.resolved_at || t.updated_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


// ═══════════════════════════════════════════
// CREATE TICKET MODAL
// ═══════════════════════════════════════════

interface LinearLabelOption {
  id: string;
  name: string;
  color: string | null;
}

interface LinearProjectOption {
  id: string;
  name: string;
  color: string | null;
  state: string | null;
}

function CreateTicketModal({
  employees,
  currentEmployee,
  tickets,
  onClose,
  onCreated,
  defaultProject,
}: {
  employees: Employee[];
  currentEmployee: Employee | null;
  tickets: TicketData[];
  onClose: () => void;
  onCreated: () => void;
  defaultProject?: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TicketType>('bug');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelPicker, setLabelPicker] = useState('');
  const [linearLabels, setLinearLabels] = useState<LinearLabelOption[]>([]);
  const [linearProjects, setLinearProjects] = useState<LinearProjectOption[]>([]);
  const [linearMetaLoading, setLinearMetaLoading] = useState(true);
  const [projectApp, setProjectApp] = useState<string>(defaultProject && defaultProject !== 'all' ? defaultProject : 'Web App');
  const [linearProjectId, setLinearProjectId] = useState('');
  const [parentTicketId, setParentTicketId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [descriptionKey, setDescriptionKey] = useState(0);
  const [aiDescription, setAiDescription] = useState('');
  const [generatingSpec, setGeneratingSpec] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const aiPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aiExpanded) return;
    requestAnimationFrame(() => {
      aiPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [aiExpanded]);

  useEffect(() => {
    let cancelled = false;
    const fetchLinearMeta = async () => {
      setLinearMetaLoading(true);
      try {
        const headers = { Authorization: INTERNAL_AUTH_HEADER };
        const [labelsRes, projectsRes] = await Promise.all([
          fetch('/api/linear/labels', { headers }),
          fetch('/api/linear/projects', { headers }),
        ]);
        const labelsJson = await labelsRes.json();
        const projectsJson = await projectsRes.json();
        if (cancelled) return;
        if (labelsJson.data) setLinearLabels(labelsJson.data);
        if (projectsJson.data) setLinearProjects(projectsJson.data);
      } catch (err) {
        console.error('Error fetching Linear metadata:', err);
      } finally {
        if (!cancelled) setLinearMetaLoading(false);
      }
    };
    void fetchLinearMeta();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (linearProjects.length === 0) return;
    const targetName = mapCrmAppToLinearProjectName(projectApp);
    if (!targetName) {
      setLinearProjectId('');
      return;
    }
    const mobileName = getLinearMobileProjectName().toLowerCase();
    const match = linearProjects.find(p =>
      p.name.toLowerCase() === targetName.toLowerCase() ||
      (projectApp === 'Mobile App' && p.name.toLowerCase() === mobileName)
    );
    setLinearProjectId(match?.id ?? '');
  }, [projectApp, linearProjects]);

  const availableLabels = useMemo(
    () => linearLabels.filter(l => !labels.includes(l.name)),
    [linearLabels, labels]
  );

  const addLabel = (labelName: string) => {
    if (!labelName || labels.includes(labelName)) return;
    setLabels(prev => [...prev, labelName]);
    setLabelPicker('');
  };

  const removeLabel = (label: string) => {
    setLabels(prev => prev.filter(l => l !== label));
  };

  const generateSpec = async () => {
    if (!aiDescription.trim()) return;
    setGeneratingSpec(true);
    try {
      const res = await fetch('/api/development/generate-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': INTERNAL_AUTH_HEADER },
        body: JSON.stringify({ description: aiDescription.trim() }),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error.message || String(result.error));
      const spec = result.spec || result.data || result;
      if (spec.title) setTitle(spec.title);
      if (spec.description) {
        const acLines = Array.isArray(spec.acceptance_criteria) && spec.acceptance_criteria.length > 0
          ? '\n\n**Acceptance Criteria:**\n' + spec.acceptance_criteria.map((c: string) => `- ${c}`).join('\n')
          : '';
        const html = `<p>${spec.description}</p>${acLines ? `<p><strong>Acceptance Criteria:</strong></p><ul>${spec.acceptance_criteria.map((c: string) => `<li>${c}</li>`).join('')}</ul>` : ''}`;
        setDescription(html);
        setDescriptionKey(k => k + 1);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate spec');
    } finally {
      setGeneratingSpec(false);
    }
  };

  const isDescriptionEmpty = !description || description === '<p></p>' || !description.replace(/<[^>]*>/g, '').trim();

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: isDescriptionEmpty ? null : description,
          type,
          priority,
          assignee_id: assigneeId || null,
          creator_id: currentEmployee?.id || null,
          due_date: dueDate || null,
          labels,
          project: projectApp || 'Web App',
          linear_project_id: linearProjectId || null,
          parent_ticket_id: parentTicketId || null,
          create_in_linear: true,
        }),
      });
      const result = await res.json();
      if (result.error) {
        setCreateError(result.error.message || 'Failed to create ticket');
        return;
      }
      onCreated();
    } catch (err) {
      console.error('Error creating ticket:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalOverlay className="tkt__overlay tkt__overlay--modal" onClose={onClose}>
      <div className="tkt__modal tkt__modal--create" onClick={e => e.stopPropagation()}>
        <div className="tkt__modal-header">
          <h2>New Ticket</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <form className="tkt__modal-form" onSubmit={handleSubmit}>
          <div className="tkt__modal-body">
            <div className="tkt__field">
              <label htmlFor="create-ticket-title">Title *</label>
              <input
                id="create-ticket-title"
                type="text"
                placeholder="Brief summary..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="tkt__field">
              <label>App</label>
              <div className="tkt__project-tab-select">
                {(['Web App', 'Mobile App'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`tkt__project-tab-btn ${projectApp === p ? 'active' : ''}`}
                    onClick={() => setProjectApp(p)}
                  >
                    {p === 'Mobile App' ? '📱' : '🌐'} {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="tkt__field-row tkt__field-row--compact">
              <div className="tkt__field">
                <label htmlFor="create-ticket-type">Type</label>
                <select id="create-ticket-type" value={type} onChange={e => setType(e.target.value as TicketType)}>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="tkt__field">
                <label htmlFor="create-ticket-priority">Priority</label>
                <select id="create-ticket-priority" value={priority} onChange={e => setPriority(e.target.value as TicketPriority)}>
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="tkt__field">
                <label htmlFor="create-ticket-assignee">Assign to</label>
                <select id="create-ticket-assignee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
            </div>
            <div className="tkt__field tkt__field--rte">
              <label>Description</label>
              <RichTextEditor key={descriptionKey} content={description} onChange={setDescription} placeholder="Steps to reproduce, expected behavior..." />
            </div>
            <div className="tkt__field-row tkt__field-row--compact">
              <div className="tkt__field">
                <label htmlFor="create-ticket-due">Due Date</label>
                <input id="create-ticket-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div className="tkt__field">
                <label htmlFor="create-ticket-linear-project">Linear Project</label>
                <select
                  id="create-ticket-linear-project"
                  value={linearProjectId}
                  onChange={e => setLinearProjectId(e.target.value)}
                  disabled={linearMetaLoading}
                >
                  <option value="">{linearMetaLoading ? 'Loading projects…' : 'None'}</option>
                  {linearProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {!linearMetaLoading && linearProjects.length === 0 && (
                  <span className="tkt__field-hint">No Linear projects synced. Run Sync with Linear first.</span>
                )}
              </div>
              <div className="tkt__field">
                <label htmlFor="create-ticket-parent">Parent Ticket</label>
                <select id="create-ticket-parent" value={parentTicketId} onChange={e => setParentTicketId(e.target.value)}>
                  <option value="">None</option>
                  {tickets.filter(t => t.type === 'epic' || t.type === 'feature_request').map(t => (
                    <option key={t.id} value={t.id}>#{t.number} {t.title.substring(0, 40)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="tkt__field">
              <label htmlFor="create-ticket-labels">Labels</label>
              {linearMetaLoading ? (
                <p className="tkt__props-labels-empty">Loading Linear labels…</p>
              ) : linearLabels.length === 0 ? (
                <p className="tkt__props-labels-empty">No Linear labels synced yet. Run Sync with Linear first.</p>
              ) : (
                <>
                  <select
                    id="create-ticket-labels"
                    value={labelPicker}
                    onChange={e => addLabel(e.target.value)}
                    disabled={availableLabels.length === 0}
                  >
                    <option value="">
                      {availableLabels.length === 0 ? 'All labels selected' : 'Add label…'}
                    </option>
                    {availableLabels.map(label => (
                      <option key={label.id} value={label.name}>{label.name}</option>
                    ))}
                  </select>
                  {labels.length > 0 && (
                    <div className="tkt__create-labels-selected">
                      {labels.map(name => {
                        const meta = linearLabels.find(l => l.name === name);
                        return (
                          <span key={name} className="tkt__label-pill">
                            <span
                              className="tkt__props-label-dot"
                              style={{ backgroundColor: meta?.color || '#9ca3af' }}
                            />
                            {name}
                            <button type="button" onClick={() => removeLabel(name)} aria-label={`Remove label ${name}`}>
                              <X size={10} />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="tkt__ai-spec-panel" ref={aiPanelRef}>
              <button
                type="button"
                className="tkt__ai-spec-toggle"
                onClick={() => setAiExpanded(open => !open)}
                aria-expanded={aiExpanded}
              >
                <Sparkles size={14} />
                <span>Generate from plain English (optional)</span>
                <ChevronDown size={16} className={aiExpanded ? 'tkt__ai-spec-chevron--open' : undefined} />
              </button>
              {aiExpanded && (
                <div className="tkt__ai-spec-body">
                  <textarea
                    placeholder="e.g. The login button doesn't work on mobile Safari when the keyboard is open..."
                    value={aiDescription}
                    onChange={e => setAiDescription(e.target.value)}
                    rows={2}
                  />
                  <button
                    type="button"
                    className="tkt__generate-spec-btn"
                    onClick={generateSpec}
                    disabled={!aiDescription.trim() || generatingSpec}
                  >
                    {generatingSpec ? <Loader2 size={13} className="tkt__spinner" /> : <Sparkles size={13} />}
                    {generatingSpec ? 'Generating...' : 'Generate Spec'}
                  </button>
                </div>
              )}
            </div>
            {createError && (
              <p className="tkt__modal-error" role="alert">{createError}</p>
            )}
          </div>
          <div className="tkt__modal-footer">
            <button type="button" className="tkt__btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="tkt__btn-primary" disabled={!title.trim() || creating}>
              {creating ? <Loader2 size={14} className="tkt__spinner" /> : <Plus size={14} />}
              {creating ? 'Creating in Linear...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
}

// ═══════════════════════════════════════════
// TICKET PROPERTIES WIZARD
// ═══════════════════════════════════════════

interface TicketPropertiesWizardProps {
  ticket: TicketData;
  employees: Employee[];
  projects: ProjectData[];
  linearLabels: LinearLabelOption[];
  labelsLoading: boolean;
  editLabels: string[];
  updating: boolean;
  onFieldUpdate: (field: string, value: unknown) => void;
  onToggleLabel: (label: string) => void;
  onDone: () => void;
}

function TicketPropertiesWizard({
  ticket,
  employees,
  projects,
  linearLabels,
  labelsLoading,
  editLabels,
  updating,
  onFieldUpdate,
  onToggleLabel,
  onDone,
}: TicketPropertiesWizardProps) {
  const typeCfg = TYPE_CONFIG[ticket.type];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];

  return (
    <div className="tkt__props-wizard">
      <div className="tkt__props-wizard-intro">
        <h3>Ticket properties</h3>
        <p>Update fields synced with your board. Labels come from Linear only.</p>
      </div>

      <div className="tkt__props-wizard-grid">
        <div className="tkt__props-field">
          <label htmlFor="tkt-prop-status">Status</label>
          <select id="tkt-prop-status" value={ticket.status} onChange={e => onFieldUpdate('status', e.target.value)} disabled={updating}>
            {STATUS_COLUMNS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        <div className="tkt__props-field">
          <label htmlFor="tkt-prop-priority">Priority</label>
          <select id="tkt-prop-priority" value={ticket.priority} onChange={e => onFieldUpdate('priority', e.target.value)} disabled={updating}>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <span className="tkt__props-hint">
            <span className="tkt__priority-dot" style={{ backgroundColor: priorityCfg.color }} />
            {priorityCfg.label}
          </span>
        </div>

        <div className="tkt__props-field">
          <label htmlFor="tkt-prop-type">Type</label>
          <select id="tkt-prop-type" value={ticket.type} onChange={e => onFieldUpdate('type', e.target.value)} disabled={updating}>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {typeCfg && (
            <span className="tkt__props-hint">
              <span className="tkt__type-dot" style={{ backgroundColor: typeCfg.color }} />
              {typeCfg.label}
            </span>
          )}
        </div>

        <div className="tkt__props-field">
          <label htmlFor="tkt-prop-assignee">Assignee</label>
          <select id="tkt-prop-assignee" value={ticket.assignee_id || ''} onChange={e => onFieldUpdate('assignee_id', e.target.value || null)} disabled={updating}>
            <option value="">Unassigned</option>
            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>

        <div className="tkt__props-field">
          <label htmlFor="tkt-prop-reviewer">Reviewer</label>
          <select id="tkt-prop-reviewer" value={ticket.reviewer_id || ''} onChange={e => onFieldUpdate('reviewer_id', e.target.value || null)} disabled={updating}>
            <option value="">None</option>
            {employees.filter(emp => emp.id !== ticket.assignee_id).map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
        </div>

        <div className="tkt__props-field">
          <label htmlFor="tkt-prop-due">Due date</label>
          <input id="tkt-prop-due" type="date" value={ticket.due_date || ''} onChange={e => onFieldUpdate('due_date', e.target.value || null)} disabled={updating} />
        </div>

        <div className="tkt__props-field tkt__props-field--full">
          <label htmlFor="tkt-prop-project">Project</label>
          <select id="tkt-prop-project" value={ticket.project_id || ''} onChange={e => onFieldUpdate('project_id', e.target.value || null)} disabled={updating}>
            <option value="">None</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div className="tkt__props-field tkt__props-field--full">
          <label>Labels</label>
          {labelsLoading ? (
            <p className="tkt__props-labels-empty">Loading Linear labels…</p>
          ) : linearLabels.length === 0 ? (
            <p className="tkt__props-labels-empty">No Linear labels synced yet. Run Sync with Linear first.</p>
          ) : (
            <div className="tkt__props-labels">
              {linearLabels.map(label => {
                const selected = editLabels.includes(label.name);
                return (
                  <button
                    key={label.id}
                    type="button"
                    className={`tkt__props-label-btn ${selected ? 'selected' : ''}`}
                    onClick={() => onToggleLabel(label.name)}
                    disabled={updating}
                  >
                    <span className="tkt__props-label-dot" style={{ backgroundColor: label.color || '#9ca3af' }} />
                    {label.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="tkt__props-readonly">
        <div><span>Creator</span><strong>{ticket.creator?.name || 'Unknown'}</strong></div>
        <div><span>Created</span><strong>{new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong></div>
        {ticket.resolved_at && (
          <div><span>Resolved</span><strong>{new Date(ticket.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong></div>
        )}
      </div>

      <div className="tkt__props-wizard-footer">
        <button type="button" className="tkt__props-done-btn" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// TICKET DETAIL PANEL
// ═══════════════════════════════════════════

function TicketDetailPanel({
  ticket,
  employees,
  currentEmployee,
  projects,
  allTickets,
  onClose,
  onUpdate,
  onTicketChange,
}: {
  ticket: TicketData;
  employees: Employee[];
  currentEmployee: Employee | null;
  projects: ProjectData[];
  allTickets: TicketData[];
  onClose: () => void;
  onUpdate: () => void;
  onTicketChange: (ticket: TicketData) => void;
}) {
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [detailView, setDetailView] = useState<'content' | 'properties'>('content');
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [activity, setActivity] = useState<TicketActivityEntry[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const [editLabels, setEditLabels] = useState<string[]>(ticket.labels || []);
  const [linearLabels, setLinearLabels] = useState<LinearLabelOption[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);

  const subTickets = allTickets.filter(t => t.parent_ticket_id === ticket.id);
  const parentTicket = ticket.parent_ticket_id ? allTickets.find(t => t.id === ticket.parent_ticket_id) : null;

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/comments`);
      const { data } = await res.json();
      if (data) setComments(data);
    } catch (err) { console.error('Error fetching comments:', err); }
  }, [ticket.id]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/activity`);
      const { data } = await res.json();
      if (data) setActivity(data);
    } catch (err) { console.error('Error fetching activity:', err); }
  }, [ticket.id]);

  useEffect(() => { fetchComments(); fetchActivity(); }, [fetchComments, fetchActivity]);
  useEffect(() => { commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments]);
  useEffect(() => { setEditLabels(ticket.labels || []); }, [ticket.labels]);
  useEffect(() => { setDetailView('content'); }, [ticket.id]);

  const fetchLinearLabels = useCallback(async () => {
    setLabelsLoading(true);
    try {
      const res = await fetch('/api/linear/labels', {
        headers: { Authorization: INTERNAL_AUTH_HEADER },
      });
      const { data } = await res.json();
      if (data) setLinearLabels(data);
    } catch (err) {
      console.error('Error fetching Linear labels:', err);
    } finally {
      setLabelsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (detailView === 'properties') void fetchLinearLabels();
  }, [detailView, fetchLinearLabels]);

  const parseMentions = (text: string): string[] => {
    const mentioned: string[] = [];
    const matches = Array.from(text.matchAll(/@(\w+\s\w+)/g));
    for (const m of matches) {
      const emp = employees.find(e => e.name.toLowerCase() === m[1].toLowerCase());
      if (emp) mentioned.push(emp.id);
    }
    return mentioned;
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSending(true);
    try {
      const mentions = parseMentions(commentText);
      await fetch(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim(), author_id: currentEmployee?.id || null, mentions }),
      });
      setCommentText('');
      fetchComments();
      fetchActivity();
    } catch (err) { console.error('Error posting comment:', err); }
    finally { setSending(false); }
  };

  const handleDelete = async () => {
    const linearNote = hasLinearLink(ticket)
      ? ' This will also delete the linked Linear issue.'
      : '';
    if (!confirm(`Delete ticket #${ticket.number}?${linearNote} This cannot be easily undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.error) {
        alert(result.error.message);
        setDeleting(false);
        return;
      }
      // Optimistic: close panel and refresh list
      onUpdate();
      onClose();
    } catch (err) {
      console.error('Error deleting ticket:', err);
      setDeleting(false);
    }
  };

  const isCreatorOrAdmin = currentEmployee && (
    ticket.creator_id === currentEmployee.id
    || currentEmployee.role === 'founder'
    || currentEmployee.role === 'cofounder'
    || currentEmployee.email?.toLowerCase() === 'devin@trailblaize.net'
  );

  const handleFieldUpdate = async (field: string, value: unknown) => {
    setUpdating(true);
    try {
      const body: Record<string, unknown> = { [field]: value, actor_id: currentEmployee?.id };
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (result.error) alert(result.error.message);
      else {
        if (result.data) onTicketChange(result.data);
        onUpdate();
        fetchActivity();
      }
    } catch (err) { console.error('Error updating ticket:', err); }
    finally { setUpdating(false); }
  };

  const handleLabelToggle = (label: string) => {
    const newLabels = editLabels.includes(label)
      ? editLabels.filter(l => l !== label)
      : [...editLabels, label];
    setEditLabels(newLabels);
    handleFieldUpdate('labels', newLabels);
  };

  const handleDescriptionSave = async (description: string) => {
    await handleFieldUpdate('description', description);
  };

  const statusCol = STATUS_COLUMNS.find(s => s.key === ticket.status);
  const typeCfg = TYPE_CONFIG[ticket.type];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];
  const assigneeName = ticket.assignee?.name || 'Unassigned';

  return (
    <ModalOverlay className="tkt__overlay" onClose={onClose}>
      <div className="tkt__detail" onClick={e => e.stopPropagation()}>
        <div className="tkt__detail-header">
          <div className="tkt__detail-header-left">
            {detailView === 'properties' ? (
              <button type="button" className="tkt__detail-back" onClick={() => setDetailView('content')}>
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <>
                <span className="tkt__detail-number">#{ticket.number}</span>
                {hasLinearLink(ticket) && (
                  <LinearTicketLink ticket={ticket} className="tkt__detail-external-id tkt__linear-link" />
                )}
                <span className="tkt__status-pill" style={{ color: statusCol?.color, background: `${statusCol?.color}15` }}>{statusCol?.label}</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {detailView === 'content' && (
              <button
                type="button"
                className="tkt__detail-props-btn"
                onClick={() => setDetailView('properties')}
                aria-label="Edit ticket properties"
              >
                <SlidersHorizontal size={15} />
                Properties
              </button>
            )}
            {isCreatorOrAdmin && detailView === 'content' && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                title="Delete ticket"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4, display: 'flex', alignItems: 'center', opacity: deleting ? 0.5 : 1 }}
              >
                {deleting ? <Loader2 size={16} className="tkt__spinner" /> : <Trash2 size={16} />}
              </button>
            )}
            <button onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="tkt__detail-body">
          {detailView === 'properties' ? (
            <TicketPropertiesWizard
              ticket={ticket}
              employees={employees}
              projects={projects}
              linearLabels={linearLabels}
              labelsLoading={labelsLoading}
              editLabels={editLabels}
              updating={updating}
              onFieldUpdate={handleFieldUpdate}
              onToggleLabel={handleLabelToggle}
              onDone={() => setDetailView('content')}
            />
          ) : (
            <>
              <h2 className="tkt__detail-title">{ticket.title}</h2>

              <div className="tkt__detail-summary">
                <span className="tkt__detail-summary-item">
                  <span className="tkt__priority-dot" style={{ backgroundColor: priorityCfg.color }} />
                  {priorityCfg.label}
                </span>
                {typeCfg && (
                  <span className="tkt__detail-summary-item">
                    <span className="tkt__type-dot" style={{ backgroundColor: typeCfg.color }} />
                    {typeCfg.label}
                  </span>
                )}
                <span className="tkt__detail-summary-item">{assigneeName}</span>
                {ticket.project && (
                  <span className={`tkt__project-badge tkt__project-badge--${ticket.project === 'Mobile App' ? 'mobile' : 'web'}`}>
                    {ticket.project === 'Mobile App' ? 'Mobile' : 'Web'}
                  </span>
                )}
                {editLabels.slice(0, 3).map(label => (
                  <span key={label} className="tkt__label-pill tkt__label-pill--sm">{label}</span>
                ))}
                {editLabels.length > 3 && (
                  <span className="tkt__label-pill tkt__label-pill--sm tkt__label-more">+{editLabels.length - 3}</span>
                )}
              </div>

              <div className="tkt__detail-desc">
                <label className="tkt__detail-section-label">Description</label>
                <MarkdownEditor
                  value={ticket.description || ''}
                  onSave={handleDescriptionSave}
                  placeholder="Add a description… Supports **markdown**, lists, and code blocks."
                />
              </div>

              {parentTicket && (
                <div className="tkt__detail-parent">
                  <Link2 size={12} /> Parent: <strong>#{parentTicket.number}</strong> {parentTicket.title}
                </div>
              )}

              {subTickets.length > 0 && (
                <div className="tkt__detail-section">
                  <label>Sub-tickets ({subTickets.length})</label>
                  <div className="tkt__subtasks">
                    {subTickets.map(st => {
                      const stStatus = STATUS_COLUMNS.find(s => s.key === st.status);
                      return (
                        <div key={st.id} className="tkt__subtask-item">
                          <span className="tkt__subtask-num">#{st.number}</span>
                          <span className="tkt__subtask-title">{st.title}</span>
                          <span className="tkt__status-pill" style={{ color: stStatus?.color, background: `${stStatus?.color}15`, fontSize: '0.65rem' }}>{stStatus?.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {ticket.status === 'testing' && (
                <div className="tkt__qa-gate">
                  <AlertTriangle size={14} />
                  <span>QA Gate: A reviewer (different from assignee) must verify before marking Done.
                    {!ticket.reviewer_id && ' Assign a reviewer in Properties.'}
                  </span>
                </div>
              )}

              <div className="tkt__tabs">
                <button className={activeTab === 'comments' ? 'active' : ''} onClick={() => setActiveTab('comments')}>
                  <MessageSquare size={14} /> Comments ({comments.length})
                </button>
                <button className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')}>
                  <Activity size={14} /> Activity ({activity.length})
                </button>
              </div>

              {activeTab === 'comments' && (
                <div className="tkt__comments">
                  <div className="tkt__comments-list">
                    {comments.length === 0 ? (
                      <p className="tkt__comments-empty">No comments yet.</p>
                    ) : (
                      comments.map(c => (
                        <div key={c.id} className="tkt__comment">
                          <div className="tkt__comment-avatar">
                            {(c.author?.name || c.author_name || '?').split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </div>
                          <div className="tkt__comment-body">
                            <div className="tkt__comment-header">
                              <span className="tkt__comment-author">
                                {c.author?.name || c.author_name || 'Unknown'}
                              </span>
                              <span className="tkt__comment-time">
                                {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {' · '}
                                {new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="tkt__comment-text">{c.content}</p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={commentsEndRef} />
                  </div>
                  <div className="tkt__comment-composer">
                    <input
                      type="text"
                      placeholder="Leave a comment…"
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleComment(); }}
                    />
                    <button
                      type="button"
                      className="tkt__send-btn"
                      onClick={handleComment}
                      disabled={!commentText.trim() || sending}
                      aria-label="Send comment"
                    >
                      {sending ? <Loader2 size={13} className="tkt__spinner" /> : <Send size={13} />}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'activity' && (
                <div className="tkt__activity">
                  {activity.length === 0 ? (
                    <p className="tkt__activity-empty">No activity recorded yet.</p>
                  ) : (
                    activity.map(a => (
                      <div key={a.id} className="tkt__activity-item">
                        <div className="tkt__activity-dot" />
                        <div className="tkt__activity-content">
                          <span className="tkt__activity-actor">
                            {a.actor?.name || (a.metadata?.author_name as string | undefined) || (a.metadata?.source === 'linear' ? 'Linear' : 'System')}
                          </span>{' '}
                          <span className="tkt__activity-action">{formatActivityAction(a)}</span>
                          <span className="tkt__activity-time">
                            {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' '}{new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}

function formatActivityAction(a: TicketActivityEntry): string {
  switch (a.action) {
    case 'created': return 'created this ticket';
    case 'status_changed': return `changed status from ${a.from_value?.replace(/_/g, ' ')} to ${a.to_value?.replace(/_/g, ' ')}`;
    case 'assigned': return a.to_value ? 'assigned this ticket' : 'unassigned this ticket';
    case 'priority_changed': return `changed priority from ${a.from_value} to ${a.to_value}`;
    case 'title_changed': return 'updated the title';
    case 'description_changed': return 'updated the description';
    case 'commented': return 'added a comment';
    default: return a.action.replace(/_/g, ' ');
  }
}

// ═══════════════════════════════════════════
// NOTIFICATION DROPDOWN
// ═══════════════════════════════════════════

function NotificationDropdown({
  notifications, onClose, onMarkRead, onTicketClick,
}: {
  notifications: TicketNotification[];
  onClose: () => void;
  onMarkRead: () => void;
  onTicketClick: (ticketId: string) => void;
}) {
  return (
    <div className="tkt__notif-dropdown">
      <div className="tkt__notif-header">
        <span>Notifications</span>
        {notifications.length > 0 && <button onClick={onMarkRead}>Mark all read</button>}
      </div>
      {notifications.length === 0 ? (
        <div className="tkt__notif-empty">
          <BellOff size={20} />
          <p>All caught up</p>
        </div>
      ) : (
        <div className="tkt__notif-list">
          {notifications.map(n => (
            <div key={n.id} className="tkt__notif-item" onClick={() => onTicketClick(n.ticket_id)}>
              <p className="tkt__notif-message">{n.message}</p>
              <span className="tkt__notif-time">
                {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
