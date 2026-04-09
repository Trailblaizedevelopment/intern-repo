'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, X, ChevronLeft, FileText, Ticket, Loader2, Calendar, Target,
  Edit3, Trash2, Image, Upload, Users, MessageSquare, Send, Paperclip,
  StickyNote, MoreHorizontal, Camera, Link2, ExternalLink, Globe, Smartphone,
  LayoutGrid, GanttChart, Sparkles,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Employee } from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import { RichTextEditor, RichTextDisplay } from '@/components/RichTextEditor';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  platform: 'web' | 'ios';
  color: string | null;
  start_date: string | null;
  target_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  ticket_count?: number;
  tickets_done?: number;
  milestones?: MilestoneData[];
  tickets?: TicketRef[];
  documents?: DocData[];
  screenshots?: ScreenshotData[];
  members?: MemberData[];
}

interface MilestoneData {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  target_date: string | null;
  status: string;
  sort_order: number;
}

interface TicketRef {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  type: string;
  due_date: string | null;
  assignee?: { id: string; name: string } | null;
}

interface DocData {
  id: string;
  project_id: string;
  title: string;
  content: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  author?: { id: string; name: string } | null;
}

interface ScreenshotData {
  id: string;
  project_id: string;
  url: string;
  caption: string | null;
  created_by: string | null;
  created_at: string;
}

interface MemberData {
  id: string;
  employee_id: string;
  role: string;
  employee?: { id: string; name: string; email: string; role: string } | null;
}

interface CommentData {
  id: string;
  project_id: string;
  author_id: string | null;
  content: string;
  created_at: string;
  author?: { id: string; name: string } | null;
}

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════

const STATUS_CONFIG: Record<string, { label: string; }> = {
  planning: { label: 'Planning' },
  active: { label: 'Active' },
  paused: { label: 'Paused' },
  completed: { label: 'Completed' },
  archived: { label: 'Archived' },
};

// Sticky note color palettes — each note gets one
const NOTE_COLORS = [
  { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', accent: '#D97706' },  // amber
  { bg: '#DBEAFE', border: '#3B82F6', text: '#1E3A5F', accent: '#2563EB' },  // blue
  { bg: '#D1FAE5', border: '#10B981', text: '#065F46', accent: '#059669' },  // emerald
  { bg: '#FCE7F3', border: '#EC4899', text: '#831843', accent: '#DB2777' },  // pink
  { bg: '#EDE9FE', border: '#8B5CF6', text: '#4C1D95', accent: '#7C3AED' },  // violet
  { bg: '#FEE2E2', border: '#EF4444', text: '#7F1D1D', accent: '#DC2626' },  // red
  { bg: '#E0F2FE', border: '#0EA5E9', text: '#0C4A6E', accent: '#0284C7' },  // sky
  { bg: '#F3E8FF', border: '#A855F7', text: '#581C87', accent: '#9333EA' },  // purple
  { bg: '#CCFBF1', border: '#14B8A6', text: '#134E4A', accent: '#0D9488' },  // teal
  { bg: '#FFF7ED', border: '#F97316', text: '#7C2D12', accent: '#EA580C' },  // orange
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#3B82F6',
  low: '#6B7280',
  none: '#D1D5DB',
};

const STATUS_PILL: Record<string, string> = {
  backlog: '#9ca3af', todo: '#6b7280', open: '#6b7280', in_progress: '#f59e0b',
  in_review: '#8b5cf6', testing: '#3b82f6', done: '#10b981', canceled: '#ef4444',
};

function getNoteColor(index: number) {
  return NOTE_COLORS[index % NOTE_COLORS.length];
}

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPlatform, setFilterPlatform] = useState<'all' | 'web' | 'ios'>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'timeline'>('cards');

  useEffect(() => {
    if (!user) return;
    fetch('/api/employees?status=active')
      .then(res => res.json())
      .then(({ data }) => {
        if (data) {
          setEmployees(data);
          const me = data.find((e: Employee) => e.email === user.email);
          if (me) setCurrentEmployeeId(me.id);
        }
      })
      .catch(err => console.error('Error fetching employees:', err));
  }, [user]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const { data } = await res.json();
      if (data) setProjects(data);
    } catch (err) {
      console.error('Error fetching projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const fetchProjectDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const { data } = await res.json();
      if (data) setSelectedProject(data);
    } catch (err) {
      console.error('Error fetching project detail:', err);
    }
  }, []);

  const filteredProjects = projects
    .filter(p => !filterStatus || p.status === filterStatus)
    .filter(p => filterPlatform === 'all' || (p.platform || 'web') === filterPlatform);

  // Stats
  const activeCount = projects.filter(p => p.status === 'active').length;
  const totalTickets = projects.reduce((s, p) => s + (p.ticket_count || 0), 0);
  const totalDone = projects.reduce((s, p) => s + (p.tickets_done || 0), 0);

  if (selectedProject) {
    return (
      <ProjectDetailView
        project={selectedProject}
        currentEmployeeId={currentEmployeeId}
        employees={employees}
        onBack={() => { setSelectedProject(null); fetchProjects(); }}
        onRefresh={() => fetchProjectDetail(selectedProject.id)}
      />
    );
  }

  return (
    <div className="sn">
      {/* Header */}
      <header className="sn__header">
        <div className="sn__header-left">
          <StickyNote size={22} />
          <h1>Projects</h1>
          <span className="sn__header-count">{projects.length}</span>
        </div>
        <div className="sn__header-right">
          {/* Platform toggle */}
          <div className="sn__platform-toggle">
            <button
              className={`sn__platform-btn ${filterPlatform === 'all' ? 'active' : ''}`}
              onClick={() => setFilterPlatform('all')}
            >All</button>
            <button
              className={`sn__platform-btn ${filterPlatform === 'web' ? 'active' : ''}`}
              onClick={() => setFilterPlatform('web')}
            ><Globe size={13} /> Web</button>
            <button
              className={`sn__platform-btn ${filterPlatform === 'ios' ? 'active' : ''}`}
              onClick={() => setFilterPlatform('ios')}
            ><Smartphone size={13} /> iOS</button>
          </div>
          <div className="sn__filter-pills">
            <button className={`sn__pill ${!filterStatus ? 'active' : ''}`} onClick={() => setFilterStatus('')}>All</button>
            <button className={`sn__pill ${filterStatus === 'active' ? 'active' : ''}`} onClick={() => setFilterStatus('active')}>Active</button>
            <button className={`sn__pill ${filterStatus === 'planning' ? 'active' : ''}`} onClick={() => setFilterStatus('planning')}>Planning</button>
            <button className={`sn__pill ${filterStatus === 'completed' ? 'active' : ''}`} onClick={() => setFilterStatus('completed')}>Done</button>
          </div>
          {/* View Toggle */}
          <div className="sn__platform-toggle">
            <button
              className={`sn__platform-btn ${viewMode === 'cards' ? 'active' : ''}`}
              onClick={() => setViewMode('cards')}
            >
              <LayoutGrid size={13} /> Cards
            </button>
            <button
              className={`sn__platform-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
            >
              <GanttChart size={13} /> Timeline
            </button>
          </div>
          <button className="sn__create-btn" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> New Project
          </button>
        </div>
      </header>

      {/* Quick Stats */}
      <div className="sn__stats">
        <div className="sn__stat">
          <span className="sn__stat-value">{activeCount}</span>
          <span className="sn__stat-label">Active</span>
        </div>
        <div className="sn__stat">
          <span className="sn__stat-value">{totalTickets}</span>
          <span className="sn__stat-label">Tickets</span>
        </div>
        <div className="sn__stat">
          <span className="sn__stat-value">{totalTickets > 0 ? Math.round((totalDone / totalTickets) * 100) : 0}%</span>
          <span className="sn__stat-label">Complete</span>
        </div>
      </div>

      {/* Sticky Notes Grid / Timeline */}
      {loading ? (
        <div className="tkt__loading"><Loader2 size={24} className="tkt__spinner" /><p>Loading projects...</p></div>
      ) : viewMode === 'timeline' ? (
        <ProjectTimeline projects={filteredProjects} onProjectClick={id => fetchProjectDetail(id)} />
      ) : filteredProjects.length === 0 ? (
        <div className="sn__empty">
          <StickyNote size={48} strokeWidth={1} />
          <h3>{filterStatus ? 'No projects with this status' : 'No projects yet'}</h3>
          <p>Create your first project to start organizing work</p>
          {!filterStatus && (
            <button className="sn__create-btn" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="sn__grid">
          {filteredProjects.map((project, i) => (
            <StickyNoteCard
              key={project.id}
              project={project}
              colorIndex={i}
              onClick={() => fetchProjectDetail(project.id)}
            />
          ))}
          {/* Add new note card */}
          <button className="sn__add-card" onClick={() => setShowCreate(true)}>
            <Plus size={28} strokeWidth={1.5} />
            <span>New Project</span>
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateProjectModal
          currentEmployeeId={currentEmployeeId}
          employees={employees}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchProjects(); }}
        />
      )}
    </div>
  );
}


// ═══════════════════════════════════════════
// PROJECT COLOR (deterministic by name)
// ═══════════════════════════════════════════

const PROJECT_COLOR_PALETTE = [
  '#6366f1', '#10b981', '#8b5cf6', '#f43f5e',
  '#f59e0b', '#06b6d4', '#0ea5e9', '#ec4899',
];

function projectColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return PROJECT_COLOR_PALETTE[hash % PROJECT_COLOR_PALETTE.length];
}

// ═══════════════════════════════════════════
// TIMELINE VIEW
// ═══════════════════════════════════════════

function ProjectTimeline({
  projects,
  onProjectClick,
}: {
  projects: Project[];
  onProjectClick: (id: string) => void;
}) {
  const now = new Date();
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  // Determine timeline range from project dates
  const allDates: Date[] = [];
  projects.forEach(p => {
    if (p.start_date) allDates.push(new Date(p.start_date + 'T00:00:00'));
    if (p.target_date) allDates.push(new Date(p.target_date + 'T00:00:00'));
  });

  // Default to current quarter if no dates
  const rangeStart = allDates.length > 0
    ? new Date(Math.min(...allDates.map(d => d.getTime())))
    : new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const rangeEnd = allDates.length > 0
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 0);

  // Ensure at least 1 month span
  const minEnd = new Date(rangeStart);
  minEnd.setMonth(minEnd.getMonth() + 1);
  const effectiveEnd = rangeEnd > minEnd ? rangeEnd : minEnd;

  // Snap to month boundaries
  const timelineStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  const timelineEnd = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth() + 1, 0);
  const totalMs = timelineEnd.getTime() - timelineStart.getTime();

  // Generate months for header
  const months: { label: string; leftPct: number; widthPct: number }[] = [];
  {
    let cursor = new Date(timelineStart);
    while (cursor <= timelineEnd) {
      const mStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const leftPct = ((mStart.getTime() - timelineStart.getTime()) / totalMs) * 100;
      const widthPct = ((Math.min(mEnd.getTime(), timelineEnd.getTime()) - mStart.getTime()) / totalMs) * 100;
      months.push({
        label: mStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        leftPct: Math.max(0, leftPct),
        widthPct,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const todayPct = Math.max(0, Math.min(100, ((now.getTime() - timelineStart.getTime()) / totalMs) * 100));

  function getStatusColor(project: Project): string {
    const targetDate = project.target_date ? new Date(project.target_date + 'T00:00:00') : null;
    const startDate = project.start_date ? new Date(project.start_date + 'T00:00:00') : null;
    const ticketCount = project.ticket_count || 0;
    const ticketsDone = project.tickets_done || 0;
    const pctDone = ticketCount > 0 ? ticketsDone / ticketCount : 0;
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    if (project.status === 'completed') return '#3b82f6';
    if (project.status === 'planning') return '#6366f1';
    if (project.status === 'paused') return '#9ca3af';
    if (targetDate && targetDate < now && project.status !== 'completed') return '#ef4444'; // overdue
    if (project.status === 'active') {
      if (targetDate && targetDate < in14Days && pctDone < 0.5 && startDate && startDate < now) return '#f59e0b'; // at-risk
      return '#10b981'; // on-track
    }
    return project.color || projectColor(project.name);
  }

  function getBarProps(project: Project): { left: string; width: string; color: string; fillPct: number; isPlaceholder: boolean } {
    const start = project.start_date
      ? new Date(project.start_date + 'T00:00:00')
      : now;
    const end = project.target_date
      ? new Date(project.target_date + 'T00:00:00')
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const leftPct = Math.max(0, ((start.getTime() - timelineStart.getTime()) / totalMs) * 100);
    const rightPct = Math.min(100, ((end.getTime() - timelineStart.getTime()) / totalMs) * 100);
    const width = Math.max(2, rightPct - leftPct);
    const isPlaceholder = !project.start_date && !project.target_date;
    const ticketCount = project.ticket_count || 0;
    const ticketsDone = project.tickets_done || 0;
    const fillPct = ticketCount > 0 ? Math.round((ticketsDone / ticketCount) * 100) : 0;

    return { left: `${leftPct}%`, width: `${width}%`, color: getStatusColor(project), fillPct, isPlaceholder };
  }

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 12,
      padding: 16,
      overflow: 'hidden',
    }}>
      {/* Month header */}
      <div style={{
        display: 'flex',
        background: 'rgba(255,255,255,0.05)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 4,
      }}>
        <div style={{ width: 180, flexShrink: 0 }} />
        <div style={{ position: 'relative', flex: 1, height: 28, overflow: 'hidden' }}>
          {months.map((m, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${m.leftPct}%`,
                width: `${m.widthPct}%`,
                color: '#94a3b8',
                fontSize: 11,
                padding: '4px 2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                lineHeight: '20px',
              }}
            >
              {m.label}
            </div>
          ))}
          {/* Today line in header */}
          <div style={{
            position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0,
            width: 2, background: '#ef4444', zIndex: 10,
          }}>
            <span style={{
              position: 'absolute', top: 0, left: 3, fontSize: '0.6rem',
              color: '#ef4444', fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1,
            }}>Today</span>
          </div>
        </div>
      </div>

      {/* Project rows */}
      <div>
        {projects.length === 0 ? (
          <p style={{ color: '#9ca3af', padding: '16px 0' }}>No projects to display.</p>
        ) : (
          projects.map(project => {
            const { left, width, color, fillPct, isPlaceholder } = getBarProps(project);
            const ticketCount = project.ticket_count || 0;
            const targetDateStr = project.target_date
              ? new Date(project.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'No target date';
            const milestones = project.milestones || [];
            return (
              <div
                key={project.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer',
                  minHeight: 44,
                }}
                onClick={() => onProjectClick(project.id)}
              >
                <div style={{ width: 180, flexShrink: 0, paddingRight: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span>
                  <span style={{ color, fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', marginTop: 1 }}>
                    {(project.platform || 'web') === 'ios' ? 'iOS' : 'Web'}
                  </span>
                </div>
                <div style={{ position: 'relative', flex: 1, height: 28 }}>
                  {/* Project bar with progress fill and hover tooltip */}
                  <div
                    onMouseEnter={() => setHoveredProjectId(project.id)}
                    onMouseLeave={() => setHoveredProjectId(null)}
                    style={{
                      position: 'absolute',
                      left,
                      width,
                      top: 0,
                      bottom: 0,
                      opacity: isPlaceholder ? 0.4 : 1,
                      background: color,
                      borderRadius: 4,
                      height: 28,
                      overflow: 'visible',
                      cursor: 'pointer',
                    }}
                  >
                    {/* Progress fill (lighter inner bar) */}
                    {fillPct > 0 && (
                      <div style={{
                        position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${fillPct}%`,
                        background: `${color}55`,
                        borderRadius: 4,
                      }} />
                    )}
                    {/* Hover tooltip */}
                    <div style={{
                      display: hoveredProjectId === project.id ? 'block' : 'none',
                      position: 'absolute',
                      bottom: 'calc(100% + 8px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(15,23,42,0.98)',
                      color: '#f9fafb',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      minWidth: 200,
                      zIndex: 50,
                      fontSize: '0.78rem',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: '0.85rem' }}>{project.name}</div>
                      <div style={{ marginBottom: 2 }}>
                        <span style={{
                          background: color,
                          color: '#fff',
                          borderRadius: 4,
                          padding: '1px 6px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          textTransform: 'capitalize',
                        }}>{project.status}</span>
                      </div>
                      <div style={{ color: '#d1d5db', marginTop: 4 }}>
                        {ticketCount} ticket{ticketCount !== 1 ? 's' : ''} · {fillPct}% done
                      </div>
                      <div style={{ color: '#9ca3af', marginTop: 2 }}>{targetDateStr}</div>
                    </div>
                    {/* Milestone ticks */}
                    {milestones.filter(ms => ms.target_date).map(ms => {
                      const msDate = new Date(ms.target_date! + 'T00:00:00');
                      const barStart = project.start_date ? new Date(project.start_date + 'T00:00:00') : now;
                      const barEnd = project.target_date ? new Date(project.target_date + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth() + 1, 0);
                      const barMs = barEnd.getTime() - barStart.getTime();
                      const msPct = barMs > 0 ? Math.max(0, Math.min(100, ((msDate.getTime() - barStart.getTime()) / barMs) * 100)) : 0;
                      return (
                        <div key={ms.id} title={ms.name} style={{
                          position: 'absolute',
                          left: `${msPct}%`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          fontSize: 8,
                          color: '#fff',
                          zIndex: 5,
                          cursor: 'default',
                        }}>◆</div>
                      );
                    })}
                  </div>
                  {/* Today line */}
                  <div style={{
                    position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0,
                    width: 2, background: '#ef4444', zIndex: 10, pointerEvents: 'none',
                  }} />
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

// ═══════════════════════════════════════════
// STICKY NOTE CARD
// ═══════════════════════════════════════════

function StickyNoteCard({ project, colorIndex, onClick }: {
  project: Project;
  colorIndex: number;
  onClick: () => void;
}) {
  const color = getNoteColor(colorIndex);
  const pct = project.ticket_count && project.ticket_count > 0
    ? Math.round(((project.tickets_done || 0) / project.ticket_count) * 100)
    : 0;

  const isOverdue = project.target_date && new Date(project.target_date + 'T00:00:00') < new Date() && project.status !== 'completed';

  return (
    <div
      className="sn__note"
      style={{
        '--note-bg': color.bg,
        '--note-border': color.border,
        '--note-text': color.text,
        '--note-accent': color.accent,
      } as React.CSSProperties}
      onClick={onClick}
    >
      {/* Folded corner effect */}
      <div className="sn__note-fold" />

      {/* Status + platform indicator */}
      <div className="sn__note-status">
        <span className="sn__note-status-dot" style={{
          background: project.status === 'active' ? '#10B981'
            : project.status === 'completed' ? '#3B82F6'
            : project.status === 'paused' ? '#F59E0B'
            : '#9CA3AF'
        }} />
        <span>{STATUS_CONFIG[project.status]?.label || project.status}</span>
        <span className="sn__note-platform-badge">
          {(project.platform || 'web') === 'ios'
            ? <><Smartphone size={10} /> iOS</>
            : <><Globe size={10} /> Web</>}
        </span>
      </div>

      {/* Title */}
      <h3 className="sn__note-title">{project.name}</h3>

      {/* Description snippet */}
      {project.description && (
        <p className="sn__note-desc">
          {project.description.replace(/<[^>]*>/g, '').substring(0, 80)}
          {project.description.length > 80 ? '...' : ''}
        </p>
      )}

      {/* Ticket counter */}
      <div className="sn__note-tickets">
        <Ticket size={13} />
        <span className="sn__note-ticket-count">{project.ticket_count || 0}</span>
        <span className="sn__note-ticket-label">tickets</span>
        {project.ticket_count && project.ticket_count > 0 && (
          <span className="sn__note-pct">{pct}%</span>
        )}
      </div>

      {/* Progress bar */}
      {project.ticket_count && project.ticket_count > 0 ? (
        <div className="sn__note-progress">
          <div className="sn__note-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {/* Footer: date */}
      {project.target_date && (
        <div className={`sn__note-date ${isOverdue ? 'overdue' : ''}`}>
          <Calendar size={11} />
          <span>
            {new Date(project.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CREATE PROJECT MODAL
// ═══════════════════════════════════════════

/* ── Ticket Detail Modal ───────────────────────────────────────────────────── */
function TicketDetailModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const [ticket, setTicket] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tickets/${ticketId}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error.message || String(json.error));
        setTicket(json.data || json);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticketId]);

  const t = ticket as Record<string, unknown> | null;
  const assignee = t?.assignee as { name: string } | null;
  const creator = t?.creator as { name: string } | null;
  const status = (t?.status as string) || '';
  const priority = (t?.priority as string) || '';
  const statusColor = STATUS_PILL[status] || '#6b7280';
  const priorityColor = PRIORITY_COLORS[priority] || '#D1D5DB';

  return (
    <ModalOverlay className="tkt__overlay" onClose={onClose}>
      <div className="tkt__modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, width: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="tkt__modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {loading ? (
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={16} className="tkt__spinner" /> Loading ticket…</h2>
          ) : error ? (
            <h2 style={{ color: '#dc2626' }}>Failed to load ticket</h2>
          ) : (
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
              <span style={{ color: '#9ca3af', fontWeight: 400, marginRight: 6 }}>#{t?.number as number}</span>
              {t?.title as string}
            </h2>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, display: 'flex', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {!loading && !error && t && (
          <div className="tkt__modal-body" style={{ paddingTop: 8 }}>
            {/* Status + Priority row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <span className="tkt__status-pill" style={{ color: statusColor, background: `${statusColor}18`, fontWeight: 600, fontSize: '0.78rem', padding: '3px 10px', borderRadius: 20 }}>
                {status.replace(/_/g, ' ')}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: '#374151', background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: priorityColor, display: 'inline-block' }} />
                {priority}
              </span>
              {Boolean(t?.type) && (
                <span style={{ fontSize: '0.78rem', color: '#6b7280', background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>
                  {String(t!.type)}
                </span>
              )}
              {Boolean(t?.project) && (
                <span style={{ fontSize: '0.78rem', color: '#6b7280', background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>
                  {String(t!.project)}
                </span>
              )}
            </div>

            {/* Meta grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 16, fontSize: '0.8rem' }}>
              {assignee && (
                <div><span style={{ color: '#9ca3af' }}>Assignee</span><br /><strong>{assignee.name}</strong></div>
              )}
              {creator && (
                <div><span style={{ color: '#9ca3af' }}>Created by</span><br /><strong>{creator.name}</strong></div>
              )}
              {Boolean(t?.due_date) && (
                <div><span style={{ color: '#9ca3af' }}>Due</span><br /><strong>{new Date(String(t!.due_date) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
              )}
              {Boolean(t?.created_at) && (
                <div><span style={{ color: '#9ca3af' }}>Created</span><br /><strong>{new Date(String(t!.created_at)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong></div>
              )}
            </div>

            {/* Description */}
            {t?.description ? (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Description</div>
                <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#111827', background: '#f9fafb', padding: '10px 14px', borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <RichTextDisplay content={t.description as string} />
                </div>
              </div>
            ) : (
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', fontStyle: 'italic' }}>No description added.</p>
            )}
          </div>
        )}

        {error && (
          <div className="tkt__modal-body" style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</div>
        )}
      </div>
    </ModalOverlay>
  );
}

function CreateProjectModal({ currentEmployeeId, employees, onClose, onCreated }: {
  currentEmployeeId: string | null;
  employees: Employee[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [platform, setPlatform] = useState<'web' | 'ios'>('web');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetDate, setTargetDate] = useState('');
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
      if (spec.title || spec.name) setName(spec.title || spec.name);
      if (spec.description) {
        const acLines = Array.isArray(spec.acceptance_criteria) && spec.acceptance_criteria.length > 0
          ? '\n\nAcceptance Criteria:\n' + spec.acceptance_criteria.map((c: string) => `- ${c}`).join('\n')
          : '';
        setDescription(spec.description + acLines);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to generate spec');
    } finally {
      setGeneratingSpec(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          status,
          platform,
          start_date: startDate || new Date().toISOString().split('T')[0],
          target_date: targetDate || null,
          created_by: currentEmployeeId,
        }),
      });
      const result = await res.json();
      if (result.error) alert(result.error.message);
      else onCreated();
    } catch (err) { console.error(err); }
    finally { setCreating(false); }
  };

  return (
    <ModalOverlay className="tkt__overlay" onClose={onClose}>
      <div className="tkt__modal" onClick={e => e.stopPropagation()}>
        <div className="tkt__modal-header"><h2>New Project</h2><button onClick={onClose}><X size={18} /></button></div>
        <div className="tkt__modal-body">
          {/* AI Spec Generation */}
          <div className="tkt__field tkt__ai-spec-field">
            <label>Describe in plain English <span style={{ color: '#8b5cf6', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              placeholder="e.g. Build a new alumni profile page with photo upload and chapter history..."
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
            <label>Project Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Alumni Outreach V2, Mobile App Redesign..." autoFocus />
          </div>
          <div className="tkt__field">
            <label>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this project about?" rows={3} style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div className="tkt__field">
            <label>Platform</label>
            <div className="sn__platform-toggle" style={{ marginTop: 4 }}>
              <button type="button" className={`sn__platform-btn ${platform === 'web' ? 'active' : ''}`} onClick={() => setPlatform('web')}>
                <Globe size={13} /> Web App
              </button>
              <button type="button" className={`sn__platform-btn ${platform === 'ios' ? 'active' : ''}`} onClick={() => setPlatform('ios')}>
                <Smartphone size={13} /> iOS App
              </button>
            </div>
          </div>
          <div className="tkt__field-row">
            <div className="tkt__field">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
              </select>
            </div>
            <div className="tkt__field">
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="tkt__field">
              <label>Target Date</label>
              <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="tkt__modal-footer">
          <button className="tkt__btn-secondary" onClick={onClose}>Cancel</button>
          <button className="tkt__btn-primary" onClick={handleSubmit} disabled={!name.trim() || creating}>
            {creating ? <Loader2 size={14} className="tkt__spinner" /> : <Plus size={14} />}
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ═══════════════════════════════════════════
// PROJECT DETAIL VIEW — The "Juice"
// ═══════════════════════════════════════════

function ProjectDetailView({ project, currentEmployeeId, employees, onBack, onRefresh }: {
  project: Project;
  currentEmployeeId: string | null;
  employees: Employee[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'tickets' | 'screenshots' | 'docs' | 'milestones'>('tickets');
  const [viewingTicketId, setViewingTicketId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDesc, setEditDesc] = useState(project.description || '');
  const [editStatus, setEditStatus] = useState(project.status);
  const [editStartDate, setEditStartDate] = useState(project.start_date || '');
  const [editTargetDate, setEditTargetDate] = useState(project.target_date || '');
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showLinkTicket, setShowLinkTicket] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');
  const [searchResults, setSearchResults] = useState<TicketRef[]>([]);
  const [searchingTickets, setSearchingTickets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Milestones
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [msName, setMsName] = useState('');
  const [msDate, setMsDate] = useState('');

  // Docs
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [editingDoc, setEditingDoc] = useState<DocData | null>(null);

  const milestones = project.milestones || [];
  const tickets = project.tickets || [];
  const docs = project.documents || [];
  const screenshots = project.screenshots || [];
  const ticketsDone = tickets.filter(t => t.status === 'done').length;
  const pct = tickets.length > 0 ? Math.round((ticketsDone / tickets.length) * 100) : 0;

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/comments`);
      const { data } = await res.json();
      if (data) setComments(data);
    } catch { /* silent */ }
  }, [project.id]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // Update project fields
  useEffect(() => {
    setEditName(project.name);
    setEditDesc(project.description || '');
    setEditStatus(project.status);
    setEditStartDate(project.start_date || '');
    setEditTargetDate(project.target_date || '');
  }, [project]);

  const saveProject = async () => {
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc, status: editStatus, start_date: editStartDate || null, target_date: editTargetDate || null }),
      });
      setEditingProject(false);
      onRefresh();
    } catch (err) { console.error(err); }
  };

  const deleteProject = async () => {
    if (!confirm('Delete this project? Tickets will be unlinked but not deleted.')) return;
    try {
      await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      onBack();
    } catch (err) { console.error(err); }
  };

  // Comments
  const postComment = async () => {
    if (!commentText.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/projects/${project.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim(), author_id: currentEmployeeId }),
      });
      setCommentText('');
      fetchComments();
    } catch (err) { console.error(err); }
    finally { setSending(false); }
  };

  // Screenshot upload
  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', `projects/${project.id}`);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadResult = await uploadRes.json();
        if (uploadResult.data?.url) {
          await fetch(`/api/projects/${project.id}/screenshots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: uploadResult.data.url,
              caption: file.name,
              created_by: currentEmployeeId,
            }),
          });
        }
      }
      onRefresh();
    } catch (err) { console.error(err); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const deleteScreenshot = async (ssId: string) => {
    try {
      await fetch(`/api/projects/${project.id}/screenshots/${ssId}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) { console.error(err); }
  };

  // Link existing ticket
  const searchTickets = async (q: string) => {
    setTicketSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchingTickets(true);
    try {
      const res = await fetch(`/api/tickets?search=${encodeURIComponent(q)}`);
      const { data } = await res.json();
      if (data) {
        // Filter out already linked tickets
        const linkedIds = new Set(tickets.map(t => t.id));
        setSearchResults(data.filter((t: TicketRef) => !linkedIds.has(t.id)).slice(0, 8));
      }
    } catch { /* silent */ }
    finally { setSearchingTickets(false); }
  };

  const linkTicket = async (ticketId: string) => {
    try {
      await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, actor_id: currentEmployeeId }),
      });
      setShowLinkTicket(false);
      setTicketSearch('');
      setSearchResults([]);
      onRefresh();
    } catch (err) { console.error(err); }
  };

  const unlinkTicket = async (ticketId: string) => {
    try {
      await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: null, actor_id: currentEmployeeId }),
      });
      onRefresh();
    } catch (err) { console.error(err); }
  };

  // Milestones
  const addMilestone = async () => {
    if (!msName.trim()) return;
    try {
      await fetch(`/api/projects/${project.id}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: msName.trim(), target_date: msDate || null }),
      });
      setMsName(''); setMsDate(''); setShowAddMilestone(false);
      onRefresh();
    } catch (err) { console.error(err); }
  };

  const updateMilestone = async (msId: string, updates: Record<string, unknown>) => {
    try {
      await fetch(`/api/projects/${project.id}/milestones/${msId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      onRefresh();
    } catch (err) { console.error(err); }
  };

  const deleteMilestone = async (msId: string) => {
    if (!confirm('Delete this milestone?')) return;
    try {
      await fetch(`/api/projects/${project.id}/milestones/${msId}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) { console.error(err); }
  };

  // Docs
  const addDoc = async () => {
    if (!docTitle.trim()) return;
    try {
      await fetch(`/api/projects/${project.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: docTitle.trim(), content: docContent || null, created_by: currentEmployeeId }),
      });
      setDocTitle(''); setDocContent(''); setShowAddDoc(false);
      onRefresh();
    } catch (err) { console.error(err); }
  };

  const saveDoc = async () => {
    if (!editingDoc) return;
    try {
      await fetch(`/api/projects/${project.id}/documents/${editingDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingDoc.title, content: editingDoc.content }),
      });
      setEditingDoc(null);
      onRefresh();
    } catch (err) { console.error(err); }
  };

  const deleteDoc = async (docId: string) => {
    if (!confirm('Delete this document?')) return;
    try {
      await fetch(`/api/projects/${project.id}/documents/${docId}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) { console.error(err); }
  };

  // Group tickets by status for a mini board
  const ticketsByStatus: Record<string, TicketRef[]> = {};
  tickets.forEach(t => {
    if (!ticketsByStatus[t.status]) ticketsByStatus[t.status] = [];
    ticketsByStatus[t.status].push(t);
  });

  return (
    <div className="sn__detail">
      {/* Header */}
      <header className="sn__detail-header">
        <button className="sn__back-btn" onClick={onBack}>
          <ChevronLeft size={18} /> Projects
        </button>
        <div className="sn__detail-actions">
          <button className="tkt__icon-btn" onClick={() => setEditingProject(!editingProject)} title="Edit"><Edit3 size={14} /></button>
          <button className="tkt__icon-btn" onClick={deleteProject} title="Delete project"><Trash2 size={14} /></button>
        </div>
      </header>

      {/* Project Hero */}
      <div className="sn__hero">
        {!editingProject ? (
          <>
            <div className="sn__hero-top">
              <h1 className="sn__hero-title">{project.name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="sn__hero-platform-badge">
                  {(project.platform || 'web') === 'ios'
                    ? <><Smartphone size={12} /> iOS App</>
                    : <><Globe size={12} /> Web App</>}
                </span>
                <span className="sn__hero-status" style={{
                  color: project.status === 'active' ? '#10B981' : project.status === 'completed' ? '#3B82F6' : '#9CA3AF',
                }}>
                  {STATUS_CONFIG[project.status]?.label || project.status}
                </span>
              </div>
            </div>
            {project.description && <p className="sn__hero-desc">{project.description}</p>}
          </>
        ) : (
          <div className="sn__hero-edit">
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="sn__hero-edit-title" />
            <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} className="sn__hero-edit-desc" placeholder="Description..." />
            <div className="sn__hero-edit-row">
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="sn__hero-edit-row">
              <div className="tkt__field">
                <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Start Date</label>
                <input type="date" value={editStartDate} onChange={e => setEditStartDate(e.target.value)} />
              </div>
              <div className="tkt__field">
                <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Target Date</label>
                <input type="date" value={editTargetDate} onChange={e => setEditTargetDate(e.target.value)} />
              </div>
              <button className="tkt__btn-primary" onClick={saveProject} style={{ padding: '6px 16px' }}>Save</button>
              <button className="tkt__btn-secondary" onClick={() => setEditingProject(false)} style={{ padding: '6px 16px' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Progress + Stats */}
        <div className="sn__hero-stats">
          <div className="sn__hero-stat">
            <span className="sn__hero-stat-value">{tickets.length}</span>
            <span className="sn__hero-stat-label">Tickets</span>
          </div>
          <div className="sn__hero-stat">
            <span className="sn__hero-stat-value">{ticketsDone}</span>
            <span className="sn__hero-stat-label">Done</span>
          </div>
          <div className="sn__hero-stat">
            <span className="sn__hero-stat-value">{pct}%</span>
            <span className="sn__hero-stat-label">Complete</span>
          </div>
          <div className="sn__hero-stat">
            <span className="sn__hero-stat-value">{milestones.length}</span>
            <span className="sn__hero-stat-label">Milestones</span>
          </div>
        </div>
        {tickets.length > 0 && (
          <div className="sn__hero-progress">
            <div className="sn__hero-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="sn__tabs">
        <button className={activeTab === 'tickets' ? 'active' : ''} onClick={() => setActiveTab('tickets')}>
          <Ticket size={14} /> Tickets ({tickets.length})
        </button>
        <button className={activeTab === 'screenshots' ? 'active' : ''} onClick={() => setActiveTab('screenshots')}>
          <Camera size={14} /> Screenshots ({screenshots.length})
        </button>
        <button className={activeTab === 'docs' ? 'active' : ''} onClick={() => setActiveTab('docs')}>
          <FileText size={14} /> Docs ({docs.length})
        </button>
        <button className={activeTab === 'milestones' ? 'active' : ''} onClick={() => setActiveTab('milestones')}>
          <Target size={14} /> Milestones ({milestones.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="sn__tab-content">
        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <div className="sn__tickets">
            <div className="sn__tickets-header">
              <h3>Linked Tickets</h3>
              <button className="sn__link-btn" onClick={() => setShowLinkTicket(!showLinkTicket)}>
                <Link2 size={14} /> Link Ticket
              </button>
            </div>

            {showLinkTicket && (
              <div className="sn__link-search">
                <input
                  type="text"
                  placeholder="Search tickets by title or #number..."
                  value={ticketSearch}
                  onChange={e => searchTickets(e.target.value)}
                  autoFocus
                />
                {searchResults.length > 0 && (
                  <div className="sn__link-results">
                    {searchResults.map(t => (
                      <div key={t.id} className="sn__link-result" onClick={() => linkTicket(t.id)}>
                        <span className="sn__link-result-num">#{t.number}</span>
                        <span className="sn__link-result-title">{t.title}</span>
                        <span className="tkt__status-pill" style={{ color: STATUS_PILL[t.status], background: `${STATUS_PILL[t.status]}15`, fontSize: '0.65rem', padding: '1px 6px' }}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {searchingTickets && <div className="sn__link-searching"><Loader2 size={14} className="tkt__spinner" /> Searching...</div>}
              </div>
            )}

            {tickets.length === 0 ? (
              <p className="sn__empty-text">No tickets linked yet. Use "Link Ticket" to connect existing tickets to this project.</p>
            ) : (
              <div className="sn__ticket-list">
                {tickets.map(t => (
                  <div key={t.id} className="sn__ticket-row" onClick={() => setViewingTicketId(t.id)} style={{ cursor: 'pointer' }}>
                    <span className="sn__ticket-priority" style={{ background: PRIORITY_COLORS[t.priority] || '#D1D5DB' }} />
                    <span className="sn__ticket-num">#{t.number}</span>
                    <span className="sn__ticket-title">{t.title}</span>
                    <span className="tkt__status-pill" style={{ color: STATUS_PILL[t.status], background: `${STATUS_PILL[t.status]}15` }}>
                      {t.status.replace('_', ' ')}
                    </span>
                    {t.assignee && <span className="sn__ticket-assignee">{t.assignee.name}</span>}
                    {t.due_date && (
                      <span className="sn__ticket-due">
                        <Calendar size={10} />
                        {new Date(t.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <button className="sn__ticket-unlink" onClick={(e) => { e.stopPropagation(); unlinkTicket(t.id); }} title="Unlink from project">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCREENSHOTS TAB */}
        {activeTab === 'screenshots' && (
          <div className="sn__screenshots">
            <div className="sn__screenshots-header">
              <h3>Product Screenshots</h3>
              <button className="sn__link-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={14} className="tkt__spinner" /> : <Upload size={14} />}
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleScreenshotUpload}
              />
            </div>

            {screenshots.length === 0 ? (
              <div className="sn__screenshots-empty">
                <Image size={40} strokeWidth={1} />
                <p>No screenshots yet. Upload product screenshots, mockups, or designs.</p>
              </div>
            ) : (
              <div className="sn__screenshots-grid">
                {screenshots.map(ss => (
                  <div key={ss.id} className="sn__screenshot">
                    <img src={ss.url} alt={ss.caption || 'Screenshot'} loading="lazy" />
                    <div className="sn__screenshot-overlay">
                      {ss.caption && <span>{ss.caption}</span>}
                      <button onClick={() => deleteScreenshot(ss.id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DOCS TAB */}
        {activeTab === 'docs' && (
          <div className="sn__docs">
            {editingDoc ? (
              <div className="sn__doc-editor">
                <input type="text" value={editingDoc.title} onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })} className="sn__doc-title-input" placeholder="Document title..." />
                <RichTextEditor content={editingDoc.content || ''} onChange={val => setEditingDoc({ ...editingDoc, content: val })} placeholder="Write documentation..." />
                <div className="sn__doc-editor-actions">
                  <button className="tkt__btn-primary" onClick={saveDoc}>Save</button>
                  <button className="tkt__btn-secondary" onClick={() => setEditingDoc(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {docs.map(d => (
                  <div key={d.id} className="sn__doc">
                    <div className="sn__doc-header">
                      <FileText size={14} />
                      <span className="sn__doc-name">{d.title}</span>
                      <span className="sn__doc-meta">{d.author?.name} · {new Date(d.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <button className="tkt__icon-btn" onClick={() => setEditingDoc(d)}><Edit3 size={12} /></button>
                      <button className="tkt__icon-btn" onClick={() => deleteDoc(d.id)}><Trash2 size={12} /></button>
                    </div>
                    {d.content && <div className="sn__doc-content"><RichTextDisplay content={d.content} /></div>}
                  </div>
                ))}
                {!showAddDoc ? (
                  <button className="sn__add-btn" onClick={() => setShowAddDoc(true)}>
                    <Plus size={14} /> Add Document
                  </button>
                ) : (
                  <div className="sn__doc-editor">
                    <input type="text" placeholder="Document title..." value={docTitle} onChange={e => setDocTitle(e.target.value)} className="sn__doc-title-input" autoFocus />
                    <RichTextEditor content={docContent} onChange={setDocContent} placeholder="Write documentation..." />
                    <div className="sn__doc-editor-actions">
                      <button className="tkt__btn-primary" onClick={addDoc} disabled={!docTitle.trim()}>Add</button>
                      <button className="tkt__btn-secondary" onClick={() => setShowAddDoc(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* MILESTONES TAB */}
        {activeTab === 'milestones' && (
          <div className="sn__milestones">
            {milestones.map(ms => (
              <div key={ms.id} className={`sn__milestone ${ms.status === 'completed' ? 'completed' : ''}`}>
                <div className="sn__milestone-check">
                  <input
                    type="checkbox"
                    checked={ms.status === 'completed'}
                    onChange={() => updateMilestone(ms.id, { status: ms.status === 'completed' ? 'open' : 'completed' })}
                  />
                </div>
                <div className="sn__milestone-body">
                  <span className="sn__milestone-name">{ms.name}</span>
                  {ms.target_date && (
                    <span className="sn__milestone-date">
                      <Calendar size={11} />
                      {new Date(ms.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <select
                  value={ms.status}
                  onChange={e => updateMilestone(ms.id, { status: e.target.value })}
                  className="sn__milestone-status"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                <button className="tkt__icon-btn" onClick={() => deleteMilestone(ms.id)}><Trash2 size={12} /></button>
              </div>
            ))}
            {!showAddMilestone ? (
              <button className="sn__add-btn" onClick={() => setShowAddMilestone(true)}>
                <Plus size={14} /> Add Milestone
              </button>
            ) : (
              <div className="sn__add-form">
                <input type="text" placeholder="Milestone name..." value={msName} onChange={e => setMsName(e.target.value)} autoFocus />
                <input type="date" value={msDate} onChange={e => setMsDate(e.target.value)} />
                <button className="tkt__btn-primary" onClick={addMilestone} disabled={!msName.trim()} style={{ padding: '6px 14px' }}>Add</button>
                <button className="tkt__btn-secondary" onClick={() => setShowAddMilestone(false)} style={{ padding: '6px 14px' }}>Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collaboration: Comments at the bottom */}
      <div className="sn__collab">
        <h3><MessageSquare size={14} /> Discussion ({comments.length})</h3>
        <div className="sn__comments">
          {comments.length === 0 && <p className="sn__empty-text">No comments yet. Start the conversation about this project.</p>}
          {comments.map(c => (
            <div key={c.id} className="sn__comment">
              <div className="sn__comment-avatar">
                {c.author?.name?.split(' ').map(n => n[0]).join('').substring(0, 2) || '?'}
              </div>
              <div className="sn__comment-body">
                <div className="sn__comment-meta">
                  <span className="sn__comment-author">{c.author?.name || 'Unknown'}</span>
                  <span className="sn__comment-time">
                    {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' '}
                    {new Date(c.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                <p className="sn__comment-text">{c.content}</p>
              </div>
            </div>
          ))}
          <div ref={commentsEndRef} />
        </div>
        <div className="sn__comment-input">
          <textarea
            placeholder="Add a comment..."
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postComment(); }}
            rows={2}
          />
          <button className="sn__send-btn" onClick={postComment} disabled={!commentText.trim() || sending}>
            {sending ? <Loader2 size={14} className="tkt__spinner" /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {/* Ticket Detail Modal */}
      {viewingTicketId && (
        <TicketDetailModal ticketId={viewingTicketId} onClose={() => setViewingTicketId(null)} />
      )}
    </div>
  );
}
