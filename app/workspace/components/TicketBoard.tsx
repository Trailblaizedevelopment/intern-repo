'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  X,
  ChevronDown,
  Clock,
  AlertTriangle,
  Bug,
  Sparkles,
  AlertCircle,
  User,
  MessageSquare,
  Activity,
  Send,
  Bell,
  BellOff,
  Loader2,
  Ticket,
  Zap,
  Target,
  Layers,
  CalendarDays,
  BarChart3,
  GanttChart,
  Link2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase, Employee } from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import { RichTextEditor, RichTextDisplay } from '@/components/RichTextEditor';

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
  content: string;
  mentions: string[];
  created_at: string;
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

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; icon: string }> = {
  none: { label: 'None', color: '#d1d5db', icon: '—' },
  low: { label: 'Low', color: '#6b7280', icon: '▽' },
  medium: { label: 'Medium', color: '#3b82f6', icon: '■' },
  high: { label: 'High', color: '#f59e0b', icon: '▲' },
  critical: { label: 'Critical', color: '#ef4444', icon: '⚡' },
};

const PRIORITY_BAR_COLORS: Record<TicketPriority, string> = {
  none: '#d1d5db',
  low: '#6b7280',
  medium: '#3b82f6',
  high: '#f59e0b',
  critical: '#ef4444',
};

const TYPE_CONFIG: Record<TicketType, { label: string; icon: typeof Bug; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: '#ef4444' },
  feature_request: { label: 'Feature', icon: Sparkles, color: '#8b5cf6' },
  issue: { label: 'Issue', icon: AlertCircle, color: '#f59e0b' },
  improvement: { label: 'Improvement', icon: Zap, color: '#10b981' },
  task: { label: 'Task', icon: Target, color: '#3b82f6' },
  epic: { label: 'Epic', icon: Layers, color: '#f59e0b' },
};

// ═══════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════

export function TicketBoard() {
  const { user } = useAuth();

  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [projectTab, setProjectTab] = useState<ProjectTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [notifications, setNotifications] = useState<TicketNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // ── Linear state ──
  interface LinearIssue {
    id: string;
    identifier: string;
    title: string;
    status: { name: string; color: string } | null;
    priority: number;
    url: string;
    team?: { name: string } | null;
    project?: { name: string } | null;
  }
  const [linearIssues, setLinearIssues] = useState<LinearIssue[]>([]);
  const [linearLoading, setLinearLoading] = useState(false);
  const [linearSyncing, setLinearSyncing] = useState(false);
  const [linearError, setLinearError] = useState<string | null>(null);

  // ── Data fetching ──

  const fetchCurrentEmployee = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase.from('employees').select('*').eq('email', user.email).single();
    if (data) setCurrentEmployee(data);
  }, [user]);

  const fetchEmployees = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('employees').select('*').eq('status', 'active').order('name');
    if (data) setEmployees(data);
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
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/tickets?${params}`);
      const { data } = await res.json();
      if (data) setTickets(data);
    } catch (err) {
      console.error('Error fetching tickets:', err);
    } finally {
      setLoading(false);
    }
  }, [filterAssignee, filterPriority, filterType, filterProject, filterStatus, searchQuery, projectTab]);

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

  const fetchLinearIssues = useCallback(async () => {
    setLinearLoading(true);
    setLinearError(null);
    try {
      const res = await fetch('/api/linear/issues?source=cache');
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || String(json.error));
      setLinearIssues(json.data || json.issues || []);
    } catch (err: unknown) {
      setLinearError(err instanceof Error ? err.message : 'Failed to load Linear issues');
    } finally {
      setLinearLoading(false);
    }
  }, []);

  const syncLinear = async () => {
    setLinearSyncing(true);
    setLinearError(null);
    try {
      await fetch('/api/linear/sync', { method: 'POST' });
      await fetchLinearIssues();
    } catch (err: unknown) {
      setLinearError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setLinearSyncing(false);
    }
  };

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

  const activeFilterCount = [filterStatus, filterAssignee, filterPriority, filterType, filterProject].filter(Boolean).length;

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
          <Ticket size={22} />
          <h1>Tickets</h1>
        </div>
        <div className="tkt__header-right">
          <div className="tkt__search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search tickets... (#238 or TRA-238)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            className={`tkt__icon-btn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            title="Filters"
          >
            <Filter size={16} />
            {activeFilterCount > 0 && <span className="tkt__filter-count">{activeFilterCount}</span>}
          </button>

          <div className="tkt__view-toggle">
            <button className={viewMode === 'board' ? 'active' : ''} onClick={() => setViewMode('board')} title="Board">
              <LayoutGrid size={16} />
            </button>
            <button className={viewMode === 'list' ? 'active' : ''} onClick={() => setViewMode('list')} title="List">
              <List size={16} />
            </button>
            <button className={viewMode === 'timeline' ? 'active' : ''} onClick={() => setViewMode('timeline')} title="Timeline">
              <GanttChart size={16} />
            </button>
            <button className={viewMode === 'dashboard' ? 'active' : ''} onClick={() => setViewMode('dashboard')} title="Dashboard">
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

          <button className="tkt__create-btn" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> New Ticket
          </button>
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
              if (tab === 'Web App' || tab === 'all') fetchLinearIssues();
            }}
          >
            {tab === 'all' ? 'All Projects' : tab}
            <span className="tkt__project-tab-count">{projectTab === tab || tab === 'all' ? projectTabCounts[tab] : '—'}</span>
          </button>
        ))}
        <div className="tkt__linear-sync">
          <button
            className="tkt__linear-sync-btn"
            onClick={syncLinear}
            disabled={linearSyncing}
            title="Sync issues from Linear"
          >
            <RefreshCw size={14} className={linearSyncing ? 'tkt__spinner' : ''} />
            {linearSyncing ? 'Syncing...' : 'Sync with Linear'}
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      {showFilters && (
        <div className="tkt__filters">
          <div className="tkt__filter-group">
            <label>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              {STATUS_COLUMNS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div className="tkt__filter-group">
            <label>Assignee</label>
            <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
              <option value="">Anyone</option>
              {currentEmployee && <option value={currentEmployee.id}>Me</option>}
              {employees.filter(e => e.id !== currentEmployee?.id).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="tkt__filter-group">
            <label>Priority</label>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">Any</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">None</option>
            </select>
          </div>
          <div className="tkt__filter-group">
            <label>Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Any</option>
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {uniqueProjects.length > 0 && (
            <div className="tkt__filter-group">
              <label>Project</label>
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)}>
                <option value="">Any</option>
                {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          {activeFilterCount > 0 && (
            <button className="tkt__clear-filters" onClick={() => { setFilterStatus(''); setFilterAssignee(''); setFilterPriority(''); setFilterType(''); setFilterProject(''); }}>
              Clear all
            </button>
          )}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="tkt__loading">
          <Loader2 size={24} className="tkt__spinner" />
          <p>Loading tickets...</p>
        </div>
      ) : viewMode === 'board' ? (
        <div className="tkt__board">
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
        </div>
      ) : viewMode === 'list' ? (
        <TicketListView tickets={tickets} onTicketClick={setSelectedTicket} />
      ) : viewMode === 'timeline' ? (
        <TimelineView tickets={tickets} onTicketClick={setSelectedTicket} />
      ) : (
        <DashboardView tickets={tickets} projects={projects} />
      )}

      {/* ── Linear Issues ── */}
      {(linearIssues.length > 0 || linearLoading || linearError) && (
        <LinearIssuesSection
          issues={linearIssues}
          loading={linearLoading}
          error={linearError}
          onSync={syncLinear}
          syncing={linearSyncing}
        />
      )}

      {showCreateModal && (
        <CreateTicketModal
          employees={employees}
          currentEmployee={currentEmployee}
          projects={projects}
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
// TICKET CARD (Kanban)
// ═══════════════════════════════════════════

function TicketCard({ ticket, onClick, onDragStart }: { ticket: TicketData; onClick: () => void; onDragStart: () => void }) {
  const TypeIcon = TYPE_CONFIG[ticket.type]?.icon || AlertCircle;
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];

  return (
    <div
      className="tkt__card"
      onClick={onClick}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
    >
      <div className="tkt__card-top">
        <span className="tkt__card-number">#{ticket.number}</span>
        {ticket.external_id && <span className="tkt__card-external-id">{ticket.external_id}</span>}
        <span className="tkt__card-priority" style={{ color: priorityCfg.color }}>{priorityCfg.icon}</span>
      </div>
      <h4 className="tkt__card-title">{ticket.title}</h4>
      {ticket.project && (
        <div className="tkt__card-project">
          <span className={`tkt__project-badge tkt__project-badge--${ticket.project === 'Mobile App' ? 'mobile' : 'web'}`}>
            {ticket.project === 'Mobile App' ? '📱' : '🌐'} {ticket.project}
          </span>
        </div>
      )}
      {(ticket.labels && ticket.labels.length > 0) && (
        <div className="tkt__labels">
          {ticket.labels.slice(0, 3).map(l => <span key={l} className="tkt__label-pill">{l}</span>)}
          {ticket.labels.length > 3 && <span className="tkt__label-pill tkt__label-more">+{ticket.labels.length - 3}</span>}
        </div>
      )}
      <div className="tkt__card-bottom">
        <span className="tkt__card-type" style={{ color: TYPE_CONFIG[ticket.type]?.color }}>
          <TypeIcon size={12} /> {TYPE_CONFIG[ticket.type]?.label}
        </span>
        {ticket.due_date && (
          <span className="tkt__card-due" title={`Due: ${ticket.due_date}`}>
            <CalendarDays size={11} />
            {new Date(ticket.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
        {ticket.assignee ? (
          <div className="tkt__card-assignee" title={ticket.assignee.name}>
            {ticket.assignee.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
          </div>
        ) : (
          <div className="tkt__card-assignee unassigned"><User size={12} /></div>
        )}
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

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : '';
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
        <span className="tkt__list-col tkt__list-col--id tkt__sort-header" onClick={() => toggleSort('number')}>#{sortIndicator('number')}</span>
        <span className="tkt__list-col tkt__list-col--title tkt__sort-header" onClick={() => toggleSort('title')}>Title{sortIndicator('title')}</span>
        <span className="tkt__list-col tkt__list-col--project">Project</span>
        <span className="tkt__list-col tkt__list-col--status tkt__sort-header" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</span>
        <span className="tkt__list-col tkt__list-col--priority tkt__sort-header" onClick={() => toggleSort('priority')}>Priority{sortIndicator('priority')}</span>
        <span className="tkt__list-col tkt__list-col--type tkt__sort-header" onClick={() => toggleSort('type')}>Type{sortIndicator('type')}</span>
        <span className="tkt__list-col tkt__list-col--assignee tkt__sort-header" onClick={() => toggleSort('assignee')}>Assignee{sortIndicator('assignee')}</span>
        <span className="tkt__list-col tkt__list-col--date tkt__sort-header" onClick={() => toggleSort('due_date')}>Due{sortIndicator('due_date')}</span>
        <span className="tkt__list-col tkt__list-col--date tkt__sort-header" onClick={() => toggleSort('created_at')}>Created{sortIndicator('created_at')}</span>
      </div>
      {sorted.length === 0 ? (
        <div className="tkt__list-empty">No tickets found</div>
      ) : (
        sorted.map(ticket => {
          const statusCol = STATUS_COLUMNS.find(s => s.key === ticket.status);
          const TypeIcon = TYPE_CONFIG[ticket.type]?.icon || AlertCircle;
          return (
            <div key={ticket.id} className="tkt__list-row" onClick={() => onTicketClick(ticket)}>
              <span className="tkt__list-col tkt__list-col--id">
                {ticket.number}
                {ticket.external_id && <span className="tkt__external-id">{ticket.external_id}</span>}
              </span>
              <span className="tkt__list-col tkt__list-col--title" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ticket.title}
                {ticket.labels && ticket.labels.length > 0 && (
                  <span className="tkt__labels tkt__labels--inline">
                    {ticket.labels.slice(0, 2).map(l => <span key={l} className="tkt__label-pill tkt__label-pill--sm">{l}</span>)}
                  </span>
                )}
              </span>
              <span className="tkt__list-col tkt__list-col--project">
                {ticket.project && (
                  <span className={`tkt__project-badge tkt__project-badge--${ticket.project === 'Mobile App' ? 'mobile' : 'web'}`}>
                    {ticket.project === 'Mobile App' ? '📱' : '🌐'} {ticket.project}
                  </span>
                )}
              </span>
              <span className="tkt__list-col tkt__list-col--status">
                <span className="tkt__status-pill" style={{ color: statusCol?.color, background: `${statusCol?.color}15` }}>{statusCol?.label}</span>
              </span>
              <span className="tkt__list-col tkt__list-col--priority" style={{ flexShrink: 0 }}>
                <span style={{ color: PRIORITY_CONFIG[ticket.priority].color }}>
                  {PRIORITY_CONFIG[ticket.priority].icon} {PRIORITY_CONFIG[ticket.priority].label}
                </span>
              </span>
              <span className="tkt__list-col tkt__list-col--type">
                <TypeIcon size={12} style={{ color: TYPE_CONFIG[ticket.type]?.color }} /> {TYPE_CONFIG[ticket.type]?.label}
              </span>
              <span className="tkt__list-col tkt__list-col--assignee">{ticket.assignee?.name || 'Unassigned'}</span>
              <span className="tkt__list-col tkt__list-col--date">
                {ticket.due_date ? new Date(ticket.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
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
// TIMELINE VIEW
// ═══════════════════════════════════════════

function TimelineView({ tickets, onTicketClick }: { tickets: TicketData[]; onTicketClick: (t: TicketData) => void }) {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const endMonth = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const totalDays = Math.ceil((endMonth.getTime() - startMonth.getTime()) / (1000 * 60 * 60 * 24));

  const timelineTickets = tickets.filter(t => t.due_date);

  // Generate month headers
  const months: { label: string; startPx: number; widthPx: number }[] = [];
  for (let m = -2; m <= 2; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const dEnd = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
    const startDay = Math.max(0, Math.ceil((d.getTime() - startMonth.getTime()) / (1000 * 60 * 60 * 24)));
    const endDay = Math.min(totalDays, Math.ceil((dEnd.getTime() - startMonth.getTime()) / (1000 * 60 * 60 * 24)));
    months.push({
      label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      startPx: (startDay / totalDays) * 100,
      widthPx: ((endDay - startDay) / totalDays) * 100,
    });
  }

  const todayPct = Math.max(0, Math.min(100, ((now.getTime() - startMonth.getTime()) / (endMonth.getTime() - startMonth.getTime())) * 100));

  const getBarStyle = (ticket: TicketData) => {
    const start = new Date(ticket.created_at);
    const end = ticket.due_date ? new Date(ticket.due_date + 'T00:00:00') : now;
    const leftPct = Math.max(0, ((start.getTime() - startMonth.getTime()) / (endMonth.getTime() - startMonth.getTime())) * 100);
    const rightPct = Math.min(100, ((end.getTime() - startMonth.getTime()) / (endMonth.getTime() - startMonth.getTime())) * 100);
    const width = Math.max(1, rightPct - leftPct);
    return { left: `${leftPct}%`, width: `${width}%`, background: PRIORITY_BAR_COLORS[ticket.priority] || '#6b7280' };
  };

  // Group by status
  const grouped: Record<string, TicketData[]> = {};
  timelineTickets.forEach(t => {
    const statusLabel = STATUS_COLUMNS.find(s => s.key === t.status)?.label || t.status;
    if (!grouped[statusLabel]) grouped[statusLabel] = [];
    grouped[statusLabel].push(t);
  });

  return (
    <div className="tkt__timeline">
      <div className="tkt__timeline-header">
        {months.map((m, i) => (
          <div key={i} className="tkt__timeline-month" style={{ left: `${m.startPx}%`, width: `${m.widthPx}%` }}>
            {m.label}
          </div>
        ))}
        <div className="tkt__timeline-today" style={{ left: `${todayPct}%` }} />
      </div>
      <div className="tkt__timeline-body">
        {Object.keys(grouped).length === 0 ? (
          <div className="tkt__list-empty">No tickets with due dates</div>
        ) : (
          Object.entries(grouped).map(([group, tix]) => (
            <div key={group} className="tkt__timeline-group">
              <div className="tkt__timeline-group-label">{group}</div>
              {tix.map(t => (
                <div key={t.id} className="tkt__timeline-row" onClick={() => onTicketClick(t)}>
                  <span className="tkt__timeline-row-label">#{t.number} {t.title}</span>
                  <div className="tkt__timeline-track">
                    <div className="tkt__timeline-bar" style={getBarStyle(t)} title={`${t.title} — Due: ${t.due_date}`} />
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// DASHBOARD VIEW
// ═══════════════════════════════════════════

function DashboardView({ tickets, projects }: { tickets: TicketData[]; projects: ProjectData[] }) {
  // Sprint stats
  const activeTickets = tickets.filter(t => !['done', 'canceled'].includes(t.status));
  const doneTickets = tickets.filter(t => t.status === 'done');
  const blockedCount = tickets.filter(t => t.priority === 'critical' && !['done', 'canceled'].includes(t.status)).length;
  const total = tickets.length;
  const completionPct = total > 0 ? Math.round((doneTickets.length / total) * 100) : 0;

  // Recent activity: use updated_at to approximate
  const recentTickets = [...tickets].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10);

  return (
    <div className="tkt__dashboard">
      {/* Sprint Section */}
      <div className="tkt__dash-section">
        <h3 className="tkt__dash-title">Current Sprint</h3>
        <div className="tkt__dash-cards">
          <div className="tkt__dash-card">
            <div className="tkt__dash-card-value">{completionPct}%</div>
            <div className="tkt__dash-card-label">Completion</div>
            <div className="tkt__dash-progress">
              <div className="tkt__dash-progress-bar" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
          <div className="tkt__dash-card">
            <div className="tkt__dash-card-value">{doneTickets.length}/{total}</div>
            <div className="tkt__dash-card-label">Tickets Done</div>
          </div>
          <div className="tkt__dash-card">
            <div className="tkt__dash-card-value">{activeTickets.length}</div>
            <div className="tkt__dash-card-label">Active</div>
          </div>
          <div className="tkt__dash-card">
            <div className="tkt__dash-card-value" style={{ color: blockedCount > 0 ? '#ef4444' : undefined }}>{blockedCount}</div>
            <div className="tkt__dash-card-label">Critical / Blocked</div>
          </div>
        </div>
      </div>

      {/* Projects Section */}
      {projects.length > 0 && (
        <div className="tkt__dash-section">
          <h3 className="tkt__dash-title">Project Overview</h3>
          <div className="tkt__dash-cards">
            {projects.map(p => {
              const pct = p.ticket_count > 0 ? Math.round((p.tickets_done / p.ticket_count) * 100) : 0;
              return (
                <div key={p.id} className="tkt__dash-card">
                  <div className="tkt__dash-card-name">{p.name}</div>
                  <div className="tkt__dash-card-label">{p.ticket_count} tickets · {pct}% done</div>
                  <div className="tkt__dash-progress">
                    <div className="tkt__dash-progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  {p.target_date && <div className="tkt__dash-card-label">Target: {new Date(p.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="tkt__dash-section">
        <h3 className="tkt__dash-title">Recent Activity</h3>
        <div className="tkt__dash-activity">
          {recentTickets.map(t => (
            <div key={t.id} className="tkt__dash-activity-item">
              <span className="tkt__dash-activity-num">#{t.number}</span>
              <span className="tkt__dash-activity-title">{t.title}</span>
              <span className="tkt__status-pill" style={{
                color: STATUS_COLUMNS.find(s => s.key === t.status)?.color,
                background: `${STATUS_COLUMNS.find(s => s.key === t.status)?.color}15`,
              }}>
                {STATUS_COLUMNS.find(s => s.key === t.status)?.label}
              </span>
              <span className="tkt__dash-activity-time">
                {new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════
// LINEAR ISSUES SECTION
// ═══════════════════════════════════════════

const LINEAR_PRIORITY_DOT: Record<number, string> = {
  0: '#9ca3af',
  1: '#ef4444',
  2: '#f59e0b',
  3: '#3b82f6',
  4: '#6b7280',
};

const LINEAR_PRIORITY_LABEL: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  status: { name: string; color: string } | null;
  priority: number;
  url: string;
  team?: { name: string } | null;
  project?: { name: string } | null;
}

function LinearIssuesSection({
  issues,
  loading,
  error,
}: {
  issues: LinearIssue[];
  loading: boolean;
  error: string | null;
  onSync: () => void;
  syncing: boolean;
}) {
  const grouped = useMemo(() => {
    const g: Record<string, LinearIssue[]> = {};
    issues.forEach(issue => {
      const key = issue.project?.name || issue.team?.name || 'General';
      if (!g[key]) g[key] = [];
      g[key].push(issue);
    });
    return g;
  }, [issues]);

  return (
    <div className="tkt__linear-section">
      <div className="tkt__linear-header">
        <h3 className="tkt__linear-title">
          <Zap size={16} style={{ color: '#5e6ad2' }} />
          Linear Issues
          {issues.length > 0 && <span className="tkt__column-count">{issues.length}</span>}
        </h3>
        {error && <span className="tkt__linear-error">{error}</span>}
      </div>

      {loading ? (
        <div className="tkt__loading" style={{ padding: '1rem' }}>
          <Loader2 size={18} className="tkt__spinner" />
          <span>Loading Linear issues...</span>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="tkt__list-empty">No Linear issues synced. Click &quot;Sync with Linear&quot; to pull issues.</p>
      ) : (
        Object.entries(grouped).map(([projectName, projectIssues]) => (
          <div key={projectName} className="tkt__linear-group">
            <div className="tkt__linear-group-label">{projectName}</div>
            <div className="tkt__linear-rows">
              {projectIssues.map(issue => (
                <div key={issue.id} className="tkt__linear-row">
                  <span
                    className="tkt__linear-priority-dot"
                    style={{ background: LINEAR_PRIORITY_DOT[issue.priority] ?? '#9ca3af' }}
                    title={LINEAR_PRIORITY_LABEL[issue.priority] ?? 'Unknown priority'}
                  />
                  <span className="tkt__linear-identifier">{issue.identifier}</span>
                  <span className="tkt__linear-issue-title">{issue.title}</span>
                  {issue.status && (
                    <span
                      className="tkt__status-pill"
                      style={{ color: issue.status.color || '#6b7280', background: `${issue.status.color || '#6b7280'}18` }}
                    >
                      {issue.status.name}
                    </span>
                  )}
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tkt__linear-ext-link"
                    onClick={e => e.stopPropagation()}
                    title="Open in Linear"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CREATE TICKET MODAL
// ═══════════════════════════════════════════

function CreateTicketModal({
  employees,
  currentEmployee,
  projects,
  tickets,
  onClose,
  onCreated,
  defaultProject,
}: {
  employees: Employee[];
  currentEmployee: Employee | null;
  projects: ProjectData[];
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
  const [labelsInput, setLabelsInput] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [projectApp, setProjectApp] = useState<string>(defaultProject && defaultProject !== 'all' ? defaultProject : 'Web App');
  const [projectId, setProjectId] = useState('');
  const [parentTicketId, setParentTicketId] = useState('');
  const [creating, setCreating] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [generatingSpec, setGeneratingSpec] = useState(false);

  const generateSpec = async () => {
    if (!aiDescription.trim()) return;
    setGeneratingSpec(true);
    try {
      const res = await fetch('/api/development/generate-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h' },
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
        setDescription(`<p>${spec.description}</p>${acLines ? `<p><strong>Acceptance Criteria:</strong></p><ul>${spec.acceptance_criteria.map((c: string) => `<li>${c}</li>`).join('')}</ul>` : ''}`);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate spec');
    } finally {
      setGeneratingSpec(false);
    }
  };

  const isDescriptionEmpty = !description || description === '<p></p>' || !description.replace(/<[^>]*>/g, '').trim();

  const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && labelsInput.trim()) {
      e.preventDefault();
      const newLabel = labelsInput.trim().replace(/,/g, '');
      if (newLabel && !labels.includes(newLabel)) {
        setLabels([...labels, newLabel]);
      }
      setLabelsInput('');
    }
  };

  const removeLabel = (label: string) => {
    setLabels(labels.filter(l => l !== label));
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setCreating(true);
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
          project_id: projectId || null,
          parent_ticket_id: parentTicketId || null,
        }),
      });
      const result = await res.json();
      if (result.error) alert(result.error.message);
      else onCreated();
    } catch (err) {
      console.error('Error creating ticket:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ModalOverlay className="tkt__overlay" onClose={onClose}>
      <div className="tkt__modal" onClick={e => e.stopPropagation()}>
        <div className="tkt__modal-header">
          <h2>New Ticket</h2>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="tkt__modal-body">
          {/* AI Spec Generation */}
          <div className="tkt__field tkt__ai-spec-field">
            <label>Describe in plain English <span style={{ color: '#8b5cf6', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              placeholder="e.g. The login button doesn't work on mobile Safari when the keyboard is open..."
              value={aiDescription}
              onChange={e => setAiDescription(e.target.value)}
              rows={2}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <button
              type="button"
              className="tkt__generate-spec-btn"
              onClick={generateSpec}
              disabled={!aiDescription.trim() || generatingSpec}
            >
              {generatingSpec ? <Loader2 size={13} className="tkt__spinner" /> : <Sparkles size={13} />}
              {generatingSpec ? 'Generating...' : 'Generate Spec ✨'}
            </button>
          </div>
          <div className="tkt__field">
            <label>Title *</label>
            <input type="text" placeholder="Brief summary..." value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="tkt__field">
            <label>Description</label>
            <RichTextEditor content={description} onChange={setDescription} placeholder="Steps to reproduce, expected behavior..." />
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
          <div className="tkt__field-row">
            <div className="tkt__field">
              <label>Type</label>
              <select value={type} onChange={e => setType(e.target.value as TicketType)}>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="tkt__field">
              <label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value as TicketPriority)}>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="tkt__field">
              <label>Assign to</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">Unassigned</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
          </div>
          <div className="tkt__field-row">
            <div className="tkt__field">
              <label>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div className="tkt__field">
              <label>Project</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">None</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="tkt__field">
              <label>Parent Ticket</label>
              <select value={parentTicketId} onChange={e => setParentTicketId(e.target.value)}>
                <option value="">None</option>
                {tickets.filter(t => t.type === 'epic' || t.type === 'feature_request').map(t => (
                  <option key={t.id} value={t.id}>#{t.number} {t.title.substring(0, 40)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="tkt__field">
            <label>Labels</label>
            <div className="tkt__labels-input">
              {labels.map(l => (
                <span key={l} className="tkt__label-pill">
                  {l}
                  <button onClick={() => removeLabel(l)}><X size={10} /></button>
                </span>
              ))}
              <input
                type="text"
                placeholder="Type and press Enter..."
                value={labelsInput}
                onChange={e => setLabelsInput(e.target.value)}
                onKeyDown={handleLabelKeyDown}
              />
            </div>
          </div>
        </div>
        <div className="tkt__modal-footer">
          <button className="tkt__btn-secondary" onClick={onClose}>Cancel</button>
          <button className="tkt__btn-primary" onClick={handleSubmit} disabled={!title.trim() || creating}>
            {creating ? <Loader2 size={14} className="tkt__spinner" /> : <Plus size={14} />}
            {creating ? 'Creating...' : 'Create Ticket'}
          </button>
        </div>
      </div>
    </ModalOverlay>
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
}: {
  ticket: TicketData;
  employees: Employee[];
  currentEmployee: Employee | null;
  projects: ProjectData[];
  allTickets: TicketData[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'comments' | 'activity'>('comments');
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [activity, setActivity] = useState<TicketActivityEntry[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Labels editing
  const [editLabels, setEditLabels] = useState<string[]>(ticket.labels || []);
  const [labelInput, setLabelInput] = useState('');

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
      else { onUpdate(); fetchActivity(); }
    } catch (err) { console.error('Error updating ticket:', err); }
    finally { setUpdating(false); }
  };

  const handleLabelAdd = () => {
    const val = labelInput.trim();
    if (val && !editLabels.includes(val)) {
      const newLabels = [...editLabels, val];
      setEditLabels(newLabels);
      setLabelInput('');
      handleFieldUpdate('labels', newLabels);
    }
  };

  const handleLabelRemove = (label: string) => {
    const newLabels = editLabels.filter(l => l !== label);
    setEditLabels(newLabels);
    handleFieldUpdate('labels', newLabels);
  };

  const statusCol = STATUS_COLUMNS.find(s => s.key === ticket.status);
  const TypeIcon = TYPE_CONFIG[ticket.type]?.icon || AlertCircle;

  return (
    <ModalOverlay className="tkt__overlay" onClose={onClose}>
      <div className="tkt__detail" onClick={e => e.stopPropagation()}>
        <div className="tkt__detail-header">
          <div className="tkt__detail-header-left">
            <span className="tkt__detail-number">#{ticket.number}</span>
            {ticket.external_id && <span className="tkt__detail-external-id">{ticket.external_id}</span>}
            <span className="tkt__status-pill" style={{ color: statusCol?.color, background: `${statusCol?.color}15` }}>{statusCol?.label}</span>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        <div className="tkt__detail-body">
          <h2 className="tkt__detail-title">{ticket.title}</h2>
          {ticket.description && <div className="tkt__detail-desc"><RichTextDisplay content={ticket.description} /></div>}

          {/* Parent ticket link */}
          {parentTicket && (
            <div className="tkt__detail-parent">
              <Link2 size={12} /> Parent: <strong>#{parentTicket.number}</strong> {parentTicket.title}
            </div>
          )}

          <div className="tkt__detail-meta">
            <div className="tkt__meta-row">
              <label>Status</label>
              <select value={ticket.status} onChange={e => handleFieldUpdate('status', e.target.value)} disabled={updating}>
                {STATUS_COLUMNS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="tkt__meta-row">
              <label>Priority</label>
              <select value={ticket.priority} onChange={e => handleFieldUpdate('priority', e.target.value)} disabled={updating}>
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="tkt__meta-row">
              <label>Type</label>
              <span style={{ color: TYPE_CONFIG[ticket.type]?.color || '#6b7280', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <TypeIcon size={14} /> {TYPE_CONFIG[ticket.type]?.label || ticket.type}
              </span>
            </div>
            <div className="tkt__meta-row">
              <label>Assignee</label>
              <select value={ticket.assignee_id || ''} onChange={e => handleFieldUpdate('assignee_id', e.target.value || null)} disabled={updating}>
                <option value="">Unassigned</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="tkt__meta-row">
              <label>Reviewer</label>
              <select value={ticket.reviewer_id || ''} onChange={e => handleFieldUpdate('reviewer_id', e.target.value || null)} disabled={updating}>
                <option value="">None</option>
                {employees.filter(emp => emp.id !== ticket.assignee_id).map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="tkt__meta-row">
              <label>Due Date</label>
              <input type="date" value={ticket.due_date || ''} onChange={e => handleFieldUpdate('due_date', e.target.value || null)} disabled={updating} />
            </div>
            <div className="tkt__meta-row">
              <label>Project</label>
              <select value={ticket.project_id || ''} onChange={e => handleFieldUpdate('project_id', e.target.value || null)} disabled={updating}>
                <option value="">None</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="tkt__meta-row">
              <label>Creator</label>
              <span>{ticket.creator?.name || 'Unknown'}</span>
            </div>
            <div className="tkt__meta-row">
              <label>Created</label>
              <span>{new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            {ticket.resolved_at && (
              <div className="tkt__meta-row">
                <label>Resolved</label>
                <span>{new Date(ticket.resolved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
          </div>

          {/* Labels */}
          <div className="tkt__detail-section">
            <label>Labels</label>
            <div className="tkt__labels-input">
              {editLabels.map(l => (
                <span key={l} className="tkt__label-pill">
                  {l}
                  <button onClick={() => handleLabelRemove(l)}><X size={10} /></button>
                </span>
              ))}
              <input
                type="text"
                placeholder="Add label..."
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleLabelAdd(); } }}
              />
            </div>
          </div>

          {/* Sub-tickets */}
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

          {/* QA Gate */}
          {ticket.status === 'testing' && (
            <div className="tkt__qa-gate">
              <AlertTriangle size={14} />
              <span>QA Gate: A reviewer (different from assignee) must verify before marking Done.
                {!ticket.reviewer_id && ' Assign a reviewer above.'}
              </span>
            </div>
          )}

          {/* Tabs */}
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
              {comments.length === 0 ? (
                <p className="tkt__comments-empty">No comments yet. Start the conversation.</p>
              ) : (
                comments.map(c => (
                  <div key={c.id} className="tkt__comment">
                    <div className="tkt__comment-avatar">
                      {c.author?.name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '?'}
                    </div>
                    <div className="tkt__comment-body">
                      <div className="tkt__comment-header">
                        <span className="tkt__comment-author">{c.author?.name || 'Unknown'}</span>
                        <span className="tkt__comment-time">
                          {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {' '}{new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="tkt__comment-text">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={commentsEndRef} />
              <div className="tkt__comment-input">
                <textarea
                  placeholder="Write a comment... Use @name to mention"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleComment(); }}
                  rows={2}
                />
                <button className="tkt__send-btn" onClick={handleComment} disabled={!commentText.trim() || sending}>
                  {sending ? <Loader2 size={14} className="tkt__spinner" /> : <Send size={14} />}
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
                      <span className="tkt__activity-actor">{a.actor?.name || 'System'}</span>{' '}
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
        </div>
      </div>
    </ModalOverlay>
  );
}

function formatActivityAction(a: TicketActivityEntry): string {
  switch (a.action) {
    case 'created': return 'created this ticket';
    case 'status_changed': return `changed status from ${a.from_value?.replace('_', ' ')} to ${a.to_value?.replace('_', ' ')}`;
    case 'assigned': return a.to_value ? 'assigned this ticket' : 'unassigned this ticket';
    case 'priority_changed': return `changed priority from ${a.from_value} to ${a.to_value}`;
    case 'commented': return 'added a comment';
    default: return a.action.replace('_', ' ');
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
