'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Building2, ChevronLeft, FileText, Milestone, Ticket, Loader2,
  Calendar, Target, Edit3, Trash2, ChevronDown, ChevronRight, GripVertical,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
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

const STATUS_COLORS: Record<string, string> = {
  planning: '#9ca3af',
  active: '#10b981',
  paused: '#f59e0b',
  completed: '#3b82f6',
  archived: '#6b7280',
};

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !user) return;
    supabase.from('employees').select('id').eq('email', user.email).single().then(({ data }) => {
      if (data) setCurrentEmployeeId(data.id);
    });
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

  if (selectedProject) {
    return (
      <ProjectDetailView
        project={selectedProject}
        currentEmployeeId={currentEmployeeId}
        onBack={() => setSelectedProject(null)}
        onRefresh={() => fetchProjectDetail(selectedProject.id)}
      />
    );
  }

  return (
    <div className="proj">
      <header className="proj__header">
        <div className="proj__header-left">
          <Building2 size={22} />
          <h1>Projects</h1>
        </div>
        <button className="tkt__create-btn" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Project
        </button>
      </header>

      {loading ? (
        <div className="tkt__loading"><Loader2 size={24} className="tkt__spinner" /><p>Loading projects...</p></div>
      ) : projects.length === 0 ? (
        <div className="proj__empty">
          <Building2 size={40} strokeWidth={1} />
          <p>No projects yet. Create your first project to get started.</p>
        </div>
      ) : (
        <div className="proj__grid">
          {projects.map(p => {
            const pct = p.ticket_count && p.ticket_count > 0 ? Math.round(((p.tickets_done || 0) / p.ticket_count) * 100) : 0;
            return (
              <div key={p.id} className="proj__card" onClick={() => fetchProjectDetail(p.id)}>
                <div className="proj__card-header">
                  <h3>{p.name}</h3>
                  <span className="proj__status-pill" style={{ color: STATUS_COLORS[p.status], background: `${STATUS_COLORS[p.status]}15` }}>
                    {p.status}
                  </span>
                </div>
                {p.description && <p className="proj__card-desc">{p.description.substring(0, 120)}{p.description.length > 120 ? '...' : ''}</p>}
                <div className="proj__card-stats">
                  <span><Ticket size={12} /> {p.ticket_count || 0} tickets</span>
                  <span>{pct}% done</span>
                  {p.target_date && <span><Calendar size={12} /> {new Date(p.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                </div>
                {p.ticket_count && p.ticket_count > 0 ? (
                  <div className="tkt__dash-progress"><div className="tkt__dash-progress-bar" style={{ width: `${pct}%` }} /></div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          currentEmployeeId={currentEmployeeId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchProjects(); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// CREATE PROJECT MODAL
// ═══════════════════════════════════════════

function CreateProjectModal({ currentEmployeeId, onClose, onCreated }: {
  currentEmployeeId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [creating, setCreating] = useState(false);

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
          start_date: startDate || null,
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
          <div className="tkt__field">
            <label>Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Project name..." autoFocus />
          </div>
          <div className="tkt__field">
            <label>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this project about?" rows={3} style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div className="tkt__field-row">
            <div className="tkt__field">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
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
// PROJECT DETAIL VIEW
// ═══════════════════════════════════════════

function ProjectDetailView({ project, currentEmployeeId, onBack, onRefresh }: {
  project: Project;
  currentEmployeeId: string | null;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [activeSection, setActiveSection] = useState<'milestones' | 'tickets' | 'docs'>('tickets');
  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editDesc, setEditDesc] = useState(project.description || '');
  const [editStatus, setEditStatus] = useState(project.status);

  // Milestones
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [msName, setMsName] = useState('');
  const [msDate, setMsDate] = useState('');

  // Docs
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docContent, setDocContent] = useState('');
  const [editingDoc, setEditingDoc] = useState<DocData | null>(null);

  const saveProject = async () => {
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc, status: editStatus }),
      });
      setEditingProject(false);
      onRefresh();
    } catch (err) { console.error(err); }
  };

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

  const milestones = project.milestones || [];
  const tickets = project.tickets || [];
  const docs = project.documents || [];
  const ticketsDone = tickets.filter(t => t.status === 'done').length;
  const pct = tickets.length > 0 ? Math.round((ticketsDone / tickets.length) * 100) : 0;

  const STATUS_PILL_COLORS: Record<string, string> = {
    backlog: '#9ca3af', todo: '#6b7280', open: '#6b7280', in_progress: '#f59e0b',
    in_review: '#8b5cf6', testing: '#3b82f6', done: '#10b981', canceled: '#ef4444',
  };

  return (
    <div className="proj">
      <header className="proj__header">
        <div className="proj__header-left">
          <button className="proj__back-btn" onClick={onBack}><ChevronLeft size={18} /> Back</button>
          {!editingProject ? (
            <>
              <h1>{project.name}</h1>
              <span className="proj__status-pill" style={{ color: STATUS_COLORS[project.status], background: `${STATUS_COLORS[project.status]}15` }}>
                {project.status}
              </span>
              <button className="tkt__icon-btn" onClick={() => setEditingProject(true)} title="Edit project"><Edit3 size={14} /></button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1 }}>
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1 }} />
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
              <button className="tkt__btn-primary" onClick={saveProject} style={{ padding: '4px 12px' }}>Save</button>
              <button className="tkt__btn-secondary" onClick={() => setEditingProject(false)} style={{ padding: '4px 12px' }}>Cancel</button>
            </div>
          )}
        </div>
      </header>

      {/* Project Info */}
      <div className="proj__info">
        {project.description && <p className="proj__desc">{project.description}</p>}
        <div className="proj__meta">
          <span>{tickets.length} tickets · {pct}% complete</span>
          {project.start_date && <span>Started: {new Date(project.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
          {project.target_date && <span>Target: {new Date(project.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
        </div>
        {tickets.length > 0 && (
          <div className="tkt__dash-progress" style={{ marginTop: '0.5rem' }}>
            <div className="tkt__dash-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div className="proj__tabs">
        <button className={activeSection === 'tickets' ? 'active' : ''} onClick={() => setActiveSection('tickets')}>
          <Ticket size={14} /> Tickets ({tickets.length})
        </button>
        <button className={activeSection === 'milestones' ? 'active' : ''} onClick={() => setActiveSection('milestones')}>
          <Target size={14} /> Milestones ({milestones.length})
        </button>
        <button className={activeSection === 'docs' ? 'active' : ''} onClick={() => setActiveSection('docs')}>
          <FileText size={14} /> Docs ({docs.length})
        </button>
      </div>

      {/* Tickets Section */}
      {activeSection === 'tickets' && (
        <div className="proj__section">
          {tickets.length === 0 ? (
            <p className="proj__empty-text">No tickets linked to this project yet. Assign tickets via the ticket detail panel.</p>
          ) : (
            <div className="proj__ticket-list">
              {tickets.map(t => (
                <div key={t.id} className="proj__ticket-row">
                  <span className="proj__ticket-num">#{t.number}</span>
                  <span className="proj__ticket-title">{t.title}</span>
                  <span className="tkt__status-pill" style={{ color: STATUS_PILL_COLORS[t.status], background: `${STATUS_PILL_COLORS[t.status]}15` }}>
                    {t.status.replace('_', ' ')}
                  </span>
                  <span className="proj__ticket-assignee">{t.assignee?.name || 'Unassigned'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Milestones Section */}
      {activeSection === 'milestones' && (
        <div className="proj__section">
          {milestones.map(ms => (
            <div key={ms.id} className="proj__milestone">
              <div className="proj__milestone-header">
                <span className="proj__milestone-name">{ms.name}</span>
                <select
                  value={ms.status}
                  onChange={e => updateMilestone(ms.id, { status: e.target.value })}
                  className="proj__milestone-status"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
                {ms.target_date && (
                  <span className="proj__milestone-date">
                    <Calendar size={11} /> {new Date(ms.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <button className="tkt__icon-btn" onClick={() => deleteMilestone(ms.id)} title="Delete"><Trash2 size={12} /></button>
              </div>
              {ms.description && <p className="proj__milestone-desc">{ms.description}</p>}
            </div>
          ))}
          {!showAddMilestone ? (
            <button className="proj__add-btn" onClick={() => setShowAddMilestone(true)}>
              <Plus size={14} /> Add Milestone
            </button>
          ) : (
            <div className="proj__add-form">
              <input type="text" placeholder="Milestone name..." value={msName} onChange={e => setMsName(e.target.value)} autoFocus />
              <input type="date" value={msDate} onChange={e => setMsDate(e.target.value)} />
              <button className="tkt__btn-primary" onClick={addMilestone} disabled={!msName.trim()} style={{ padding: '4px 12px' }}>Add</button>
              <button className="tkt__btn-secondary" onClick={() => setShowAddMilestone(false)} style={{ padding: '4px 12px' }}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Docs Section */}
      {activeSection === 'docs' && (
        <div className="proj__section">
          {editingDoc ? (
            <div className="proj__doc-editor">
              <input type="text" value={editingDoc.title} onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })} style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }} />
              <RichTextEditor content={editingDoc.content || ''} onChange={val => setEditingDoc({ ...editingDoc, content: val })} placeholder="Write documentation..." />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="tkt__btn-primary" onClick={saveDoc} style={{ padding: '4px 12px' }}>Save</button>
                <button className="tkt__btn-secondary" onClick={() => setEditingDoc(null)} style={{ padding: '4px 12px' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {docs.map(d => (
                <div key={d.id} className="proj__doc">
                  <div className="proj__doc-header">
                    <FileText size={14} />
                    <span className="proj__doc-title">{d.title}</span>
                    <span className="proj__doc-meta">{d.author?.name} · {new Date(d.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <button className="tkt__icon-btn" onClick={() => setEditingDoc(d)} title="Edit"><Edit3 size={12} /></button>
                    <button className="tkt__icon-btn" onClick={() => deleteDoc(d.id)} title="Delete"><Trash2 size={12} /></button>
                  </div>
                  {d.content && <div className="proj__doc-content"><RichTextDisplay content={d.content} /></div>}
                </div>
              ))}
              {!showAddDoc ? (
                <button className="proj__add-btn" onClick={() => setShowAddDoc(true)}>
                  <Plus size={14} /> Add Document
                </button>
              ) : (
                <div className="proj__doc-editor">
                  <input type="text" placeholder="Document title..." value={docTitle} onChange={e => setDocTitle(e.target.value)} autoFocus />
                  <RichTextEditor content={docContent} onChange={setDocContent} placeholder="Write documentation..." />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button className="tkt__btn-primary" onClick={addDoc} disabled={!docTitle.trim()} style={{ padding: '4px 12px' }}>Add</button>
                    <button className="tkt__btn-secondary" onClick={() => setShowAddDoc(false)} style={{ padding: '4px 12px' }}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
