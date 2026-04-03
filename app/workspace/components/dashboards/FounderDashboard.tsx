'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Target,
  TrendingUp,
  Users,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Briefcase,
  ArrowRight,
  Mail,
  CheckSquare,
  Ticket,
  AlertTriangle,
  FlaskConical,
  RefreshCw,
  Plus,
  X,
  Sparkles,
} from 'lucide-react';
import { TaskSection } from '../TaskSection';
import { LeadSection } from '../LeadSection';
import { FocusTimer } from '../FocusTimer';
import { TeamView, TeamList } from '../TeamView';
import { TrailblaizeCalendar } from '../TrailblaizeCalendar';
import { SmartSuggestions } from '../SmartSuggestions';
import { GoogleGmailWidget } from '../GoogleGmailWidget';
import { UseWorkspaceDataReturn } from '../../hooks/useWorkspaceData';
import { useGoogleIntegration } from '../../hooks/useGoogleIntegration';
import { Employee } from '@/lib/supabase';

interface FounderDashboardProps {
  data: UseWorkspaceDataReturn;
  teamMembers: Employee[];
}

/**
 * Founder Dashboard
 * Calendar-centric, awareness-focused design
 * Shows what's happening now and suggests contextual actions
 */
export function FounderDashboard({ data, teamMembers }: FounderDashboardProps) {
  const {
    currentEmployee,
    viewAsEmployee,
    setViewAsEmployee,
    tasks,
    leads,
    stats,
    tasksLoading,
    leadsLoading,
    createTask,
    updateTask,
    toggleTask,
    deleteTask,
    createLead,
    updateLead,
    updateLeadStatus,
    deleteLead,
  } = data;

  const [showSecondaryWidgets, setShowSecondaryWidgets] = useState(true);

  // Ticket summary data
  interface TicketSummaryItem {
    id: string;
    status: string;
    priority: string;
    title?: string;
    number?: number;
    assignee_id?: string | null;
  }
  const [ticketSummary, setTicketSummary] = useState<TicketSummaryItem[]>([]);
  const [ticketSummaryLoading, setTicketSummaryLoading] = useState(true);

  const fetchTicketSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets?status=active');
      const { data: ticketData } = await res.json();
      if (ticketData) setTicketSummary(ticketData);
    } catch (err) {
      console.error('Error fetching ticket summary:', err);
    } finally {
      setTicketSummaryLoading(false);
    }
  }, []);

  const [ticketRefreshing, setTicketRefreshing] = useState(false);

  const handleManualRefresh = useCallback(async () => {
    setTicketRefreshing(true);
    await fetchTicketSummary();
    setTicketRefreshing(false);
  }, [fetchTicketSummary]);

  useEffect(() => {
    fetchTicketSummary();
  }, [fetchTicketSummary]);

  // New Ticket / AI Spec Generator state
  const [showNewTicketPanel, setShowNewTicketPanel] = useState(false);
  const [specDescription, setSpecDescription] = useState('');
  const [specLoading, setSpecLoading] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<{
    title: string;
    description: string;
    complexity: string;
  } | null>(null);
  const [ticketPriority, setTicketPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [ticketCreating, setTicketCreating] = useState(false);
  const [ticketToast, setTicketToast] = useState('');

  const AUTH_HEADER = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', {
        headers: { Authorization: AUTH_HEADER },
      });
      const { data: projectData } = await res.json();
      if (projectData) {
        setProjects(projectData);
        if (projectData.length > 0) setSelectedProjectId(projectData[0].id);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  }, []);

  const handleOpenNewTicket = useCallback(() => {
    setShowNewTicketPanel(true);
    setGeneratedSpec(null);
    setSpecDescription('');
    setTicketPriority('medium');
    fetchProjects();
  }, [fetchProjects]);

  const handleGenerateSpec = useCallback(async () => {
    if (!specDescription.trim()) return;
    setSpecLoading(true);
    setGeneratedSpec(null);
    try {
      const res = await fetch('/api/development/generate-spec', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AUTH_HEADER,
        },
        body: JSON.stringify({ description: specDescription }),
      });
      const result = await res.json();
      if (result.data || result.spec) {
        const spec = result.data || result.spec;
        setGeneratedSpec({
          title: spec.title || 'Untitled',
          description: spec.description || '',
          complexity: spec.complexity || 'medium',
        });
      } else if (result.title) {
        setGeneratedSpec({
          title: result.title,
          description: result.description || '',
          complexity: result.complexity || 'medium',
        });
      }
    } catch (err) {
      console.error('Error generating spec:', err);
    } finally {
      setSpecLoading(false);
    }
  }, [specDescription]);

  const handleCreateTicket = useCallback(async () => {
    if (!generatedSpec) return;
    setTicketCreating(true);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AUTH_HEADER,
        },
        body: JSON.stringify({
          title: generatedSpec.title,
          description: generatedSpec.description,
          priority: ticketPriority,
          project_id: selectedProjectId || undefined,
        }),
      });
      const result = await res.json();
      if (!result.error) {
        setShowNewTicketPanel(false);
        fetchTicketSummary();
        setTicketToast('Ticket created');
        setTimeout(() => setTicketToast(''), 3000);
      }
    } catch (err) {
      console.error('Error creating ticket:', err);
    } finally {
      setTicketCreating(false);
    }
  }, [generatedSpec, ticketPriority, selectedProjectId, fetchTicketSummary]);

  // Pending Review queue state
  const [dismissedReviewIds, setDismissedReviewIds] = useState<Set<string>>(new Set());
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});

  const reviewTickets = useMemo(() => {
    return ticketSummary.filter(
      t => (t.status === 'in_review' || t.status === 'testing') && !dismissedReviewIds.has(t.id)
    );
  }, [ticketSummary, dismissedReviewIds]);

  const handleMarkTested = useCallback(async (ticket: TicketSummaryItem) => {
    // Optimistic remove
    setDismissedReviewIds(prev => new Set([...prev, ticket.id]));
    setReviewErrors(prev => { const next = { ...prev }; delete next[ticket.id]; return next; });

    // in_review → testing (advance to QA); testing → done (founder is reviewer)
    const isInReview = ticket.status === 'in_review';
    const payload = isInReview
      ? { status: 'testing', actor_id: currentEmployee?.id }
      : { status: 'done', reviewer_id: currentEmployee?.id, actor_id: currentEmployee?.id };

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.error) {
        // Rollback optimistic update and show error
        setDismissedReviewIds(prev => { const next = new Set(prev); next.delete(ticket.id); return next; });
        setReviewErrors(prev => ({ ...prev, [ticket.id]: result.error.message }));
      } else {
        // Refresh ticket summary to get accurate stats
        fetchTicketSummary();
      }
    } catch {
      setDismissedReviewIds(prev => { const next = new Set(prev); next.delete(ticket.id); return next; });
      setReviewErrors(prev => ({ ...prev, [ticket.id]: 'Network error — try again' }));
    }
  }, [currentEmployee?.id, fetchTicketSummary]);

  const handleRequestRevisions = useCallback(async (ticket: TicketSummaryItem) => {
    // Optimistic remove
    setDismissedReviewIds(prev => new Set([...prev, ticket.id]));
    setReviewErrors(prev => { const next = { ...prev }; delete next[ticket.id]; return next; });

    const payload = { status: 'in_progress', test_result: 'revisions', actor_id: currentEmployee?.id };

    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.error) {
        setDismissedReviewIds(prev => { const next = new Set(prev); next.delete(ticket.id); return next; });
        setReviewErrors(prev => ({ ...prev, [ticket.id]: result.error.message }));
      } else {
        fetchTicketSummary();
      }
    } catch {
      setDismissedReviewIds(prev => { const next = new Set(prev); next.delete(ticket.id); return next; });
      setReviewErrors(prev => ({ ...prev, [ticket.id]: 'Network error — try again' }));
    }
  }, [currentEmployee?.id, fetchTicketSummary]);

  const ticketStats = useMemo(() => {
    const open = ticketSummary.filter(t => t.status !== 'done');
    const p0 = open.filter(t => t.priority === 'critical').length;
    const p1 = open.filter(t => t.priority === 'high').length;
    const p2 = open.filter(t => t.priority === 'medium').length;
    const p3 = open.filter(t => t.priority === 'low').length;
    return { total: open.length, p0, p1, p2, p3 };
  }, [ticketSummary]);

  // Google Integration
  const google = useGoogleIntegration(currentEmployee?.id);

  // Calculate meeting context for smart suggestions
  const meetingContext = useMemo(() => {
    const now = Date.now();
    
    const currentEvent = google.calendarEvents.find(event => {
      if (!event.start.dateTime || !event.end.dateTime) return false;
      const start = new Date(event.start.dateTime).getTime();
      const end = new Date(event.end.dateTime).getTime();
      return now >= start && now <= end;
    });

    const nextEvent = google.calendarEvents.find(event => {
      if (!event.start.dateTime) return false;
      const start = new Date(event.start.dateTime).getTime();
      return start > now;
    });

    let minutesUntilNext: number | null = null;
    if (nextEvent?.start.dateTime) {
      minutesUntilNext = Math.floor((new Date(nextEvent.start.dateTime).getTime() - now) / 60000);
    }

    return {
      isInMeeting: !!currentEvent,
      minutesUntilNext,
      currentEvent,
      nextEvent
    };
  }, [google.calendarEvents]);

  // Priority tasks for this week
  const thisWeekTasks = tasks.filter(t => {
    if (!t.due_date) return t.status !== 'done';
    const due = new Date(t.due_date);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return due <= nextWeek && t.status !== 'done';
  });

  // Stats for smart suggestions
  const suggestionStats = {
    openTasks: thisWeekTasks.length,
    overdueItems: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length,
    unreadMessages: google.unreadCount,
    activeLeads: leads.filter(l => !['converted', 'lost'].includes(l.status)).length,
    pendingFollowups: leads.filter(l => l.status === 'contacted').length,
  };

  return (
    <div className="ws-dashboard ws-dashboard-awareness">
      {/* Team Switcher (top-right, non-intrusive) */}
      <div className="ws-awareness-header">
        <TeamView
          currentEmployee={currentEmployee}
          teamMembers={teamMembers}
          viewAsEmployee={viewAsEmployee}
          onViewAsChange={setViewAsEmployee}
        />
      </div>

      {/* Trailblaize Calendar - Google Calendar Style */}
      <TrailblaizeCalendar
        events={google.calendarEvents}
        loading={google.calendarLoading}
        connected={google.status?.connected || false}
        onConnect={google.connect}
        onRefresh={google.fetchCalendarEvents}
      />

      {/* Smart Suggestions - Contextual Actions */}
      <SmartSuggestions
        role="founder"
        isInMeeting={meetingContext.isInMeeting}
        minutesUntilNext={meetingContext.minutesUntilNext}
        stats={suggestionStats}
      />

      {/* Toast */}
      {ticketToast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
          color: '#10b981', padding: '10px 18px', borderRadius: 8,
          backdropFilter: 'blur(12px)', fontSize: 14, fontWeight: 500,
        }}>
          ✅ {ticketToast}
        </div>
      )}

      {/* Pending Review Queue */}
      <section className="ws-card ws-pending-review-card">
        <div className="ws-card-header">
          <h3>
            <FlaskConical size={16} />
            Pending Review
            {reviewTickets.length > 0 && (
              <span className="ws-pending-review__count">{reviewTickets.length}</span>
            )}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="ws-pending-review__tagline" style={{ marginRight: 4 }}>
              {reviewTickets.length > 0 ? 'Ready to test — grab one before someone else does' : ''}
            </span>
            <button
              onClick={handleManualRefresh}
              disabled={ticketRefreshing || ticketSummaryLoading}
              title="Refresh"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.5)', padding: '2px 4px', display: 'flex',
                alignItems: 'center', borderRadius: 4,
              }}
            >
              <RefreshCw
                size={14}
                style={{
                  animation: (ticketRefreshing || ticketSummaryLoading) ? 'spin 0.8s linear infinite' : 'none',
                }}
              />
            </button>
            <button
              onClick={handleOpenNewTicket}
              title="New Ticket"
              style={{
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)',
                cursor: 'pointer', color: 'rgba(165,167,255,0.9)', padding: '3px 8px',
                display: 'flex', alignItems: 'center', gap: 4, borderRadius: 5,
                fontSize: 12, fontWeight: 500,
              }}
            >
              <Plus size={12} />
              New Ticket
            </button>
          </div>
        </div>

        {/* Inline New Ticket Panel */}
        {showNewTicketPanel && (
          <div style={{
            margin: '0 0 14px 0', padding: 16,
            background: 'rgba(15,15,25,0.7)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 10, backdropFilter: 'blur(16px)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>✨ Quick Ticket</span>
              <button
                onClick={() => setShowNewTicketPanel(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>

            {!generatedSpec ? (
              <>
                <textarea
                  placeholder="Describe what you want built..."
                  value={specDescription}
                  onChange={e => setSpecDescription(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%', background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                    color: 'rgba(255,255,255,0.9)', padding: '8px 10px', fontSize: 13,
                    resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button
                  onClick={handleGenerateSpec}
                  disabled={specLoading || !specDescription.trim()}
                  style={{
                    marginTop: 8, background: 'rgba(99,102,241,0.2)',
                    border: '1px solid rgba(99,102,241,0.4)', color: 'rgba(165,167,255,0.95)',
                    padding: '6px 14px', borderRadius: 6, cursor: specLoading ? 'wait' : 'pointer',
                    fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6,
                    opacity: !specDescription.trim() ? 0.5 : 1,
                  }}
                >
                  {specLoading ? (
                    <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
                  ) : (
                    <Sparkles size={13} />
                  )}
                  {specLoading ? 'Generating...' : 'Generate Spec ✨'}
                </button>
              </>
            ) : (
              <>
                {/* Generated Spec */}
                <div style={{
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 7, padding: '10px 12px', marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{generatedSpec.title}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
                      background:
                        generatedSpec.complexity === 'high' || generatedSpec.complexity === 'complex' ? 'rgba(239,68,68,0.2)' :
                        generatedSpec.complexity === 'low' || generatedSpec.complexity === 'simple' ? 'rgba(16,185,129,0.2)' :
                        'rgba(245,158,11,0.2)',
                      color:
                        generatedSpec.complexity === 'high' || generatedSpec.complexity === 'complex' ? '#f87171' :
                        generatedSpec.complexity === 'low' || generatedSpec.complexity === 'simple' ? '#34d399' :
                        '#fbbf24',
                    }}>
                      {generatedSpec.complexity}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.5 }}>
                    {generatedSpec.description}
                  </p>
                </div>

                {/* Priority + Project selectors */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <select
                    value={ticketPriority}
                    onChange={e => setTicketPriority(e.target.value as 'high' | 'medium' | 'low')}
                    style={{
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(255,255,255,0.85)', padding: '5px 10px', borderRadius: 6,
                      fontSize: 12, cursor: 'pointer', outline: 'none',
                    }}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>

                  {projects.length > 0 && (
                    <select
                      value={selectedProjectId}
                      onChange={e => setSelectedProjectId(e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                        color: 'rgba(255,255,255,0.85)', padding: '5px 10px', borderRadius: 6,
                        fontSize: 12, cursor: 'pointer', outline: 'none', flex: 1,
                      }}
                    >
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleCreateTicket}
                    disabled={ticketCreating}
                    style={{
                      background: 'rgba(99,102,241,0.25)', border: '1px solid rgba(99,102,241,0.5)',
                      color: 'rgba(165,167,255,0.95)', padding: '6px 14px', borderRadius: 6,
                      cursor: ticketCreating ? 'wait' : 'pointer', fontSize: 13, fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    {ticketCreating ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
                    {ticketCreating ? 'Creating...' : 'Create Ticket'}
                  </button>
                  <button
                    onClick={() => setGeneratedSpec(null)}
                    style={{
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.45)', padding: '6px 12px', borderRadius: 6,
                      cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    ← Back
                  </button>
                </div>
              </>
            )}
          </div>
        )}


        {ticketSummaryLoading ? (
          <div className="ws-pending-review__loading">Loading...</div>
        ) : reviewTickets.length === 0 ? (
          <div className="ws-pending-review__empty">No tickets pending review — all clear ✅</div>
        ) : (
          <ul className="ws-pending-review__list">
            {reviewTickets.map(ticket => {
              const isInReview = ticket.status === 'in_review';
              const priorityLabel =
                ticket.priority === 'critical' ? 'P0' :
                ticket.priority === 'high' ? 'P1' :
                ticket.priority === 'medium' ? 'P2' : 'P3';
              const priorityClass = `ws-ticket-summary__badge--${
                ticket.priority === 'critical' ? 'p0' :
                ticket.priority === 'high' ? 'p1' :
                ticket.priority === 'medium' ? 'p2' : 'p3'
              }`;
              return (
                <li key={ticket.id} className="ws-pending-review__item">
                  <div className="ws-pending-review__item-main">
                    <span className={`ws-ticket-summary__badge ${priorityClass}`}>{priorityLabel}</span>
                    <span className="ws-pending-review__item-title">
                      {ticket.number ? `#${ticket.number} ` : ''}{ticket.title || ticket.id}
                    </span>
                    <span className="ws-pending-review__item-status">
                      {isInReview ? '🔍 In Review' : '🧪 Testing'}
                    </span>
                  </div>
                  {reviewErrors[ticket.id] && (
                    <span className="ws-pending-review__error">{reviewErrors[ticket.id]}</span>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="ws-pending-review__btn"
                      onClick={() => handleMarkTested(ticket)}
                      title={isInReview ? 'Advance to Testing' : 'Mark as Done'}
                    >
                      {isInReview ? 'Move to Testing →' : 'Mark Tested ✓'}
                    </button>
                    {!isInReview && (
                      <button
                        className="ws-pending-review__btn ws-pending-review__btn--revisions"
                        onClick={() => handleRequestRevisions(ticket)}
                        title="Send back to Devin for revisions"
                      >
                        ↩ Request Revisions
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Quick Stats Bar */}
      <div className="ws-quick-stats-bar">
        <div className="ws-quick-stat">
          <CheckSquare size={16} />
          <span className="quick-stat-value">{thisWeekTasks.length}</span>
          <span className="quick-stat-label">Tasks</span>
        </div>
        <div className="ws-quick-stat">
          <Mail size={16} />
          <span className="quick-stat-value">{google.unreadCount}</span>
          <span className="quick-stat-label">Unread</span>
        </div>
        <div className="ws-quick-stat">
          <Target size={16} />
          <span className="quick-stat-value">{leads.length}</span>
          <span className="quick-stat-label">Leads</span>
        </div>
        <div className="ws-quick-stat">
          <Users size={16} />
          <span className="quick-stat-value">{teamMembers.length}</span>
          <span className="quick-stat-label">Team</span>
        </div>
        <div className="ws-quick-stats-spacer" />
        <FocusTimer compact />
      </div>

      {/* Secondary Widgets - Collapsible */}
      <div className="ws-secondary-section">
        <button 
          className="ws-secondary-toggle"
          onClick={() => setShowSecondaryWidgets(!showSecondaryWidgets)}
        >
          <span>Details & Actions</span>
          {showSecondaryWidgets ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showSecondaryWidgets && (
          <div className="ws-secondary-grid">
            {/* Tasks */}
            <div className="ws-secondary-widget">
              <TaskSection
                tasks={thisWeekTasks}
                onToggleTask={toggleTask}
                onCreateTask={createTask}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                title="Priority Tasks"
                limit={4}
                compact
                loading={tasksLoading}
              />
            </div>

            {/* Gmail */}
            <div className="ws-secondary-widget">
              <GoogleGmailWidget
                emails={google.emails}
                unreadCount={google.unreadCount}
                loading={google.gmailLoading}
                connected={google.status?.connected || false}
                onConnect={google.connect}
                onRefresh={google.fetchEmails}
              />
            </div>

            {/* Leads */}
            <div className="ws-secondary-widget">
              <LeadSection
                leads={leads}
                onCreateLead={createLead}
                onUpdateStatus={updateLeadStatus}
                onUpdateLead={updateLead}
                onDeleteLead={deleteLead}
                title="Active Leads"
                limit={3}
                compact
                loading={leadsLoading}
              />
            </div>

            {/* Team */}
            <div className="ws-secondary-widget">
              <section className="ws-card ws-team-compact-card">
                <div className="ws-card-header">
                  <h3>
                    <Users size={16} />
                    Team
                  </h3>
                  <Link href="/workspace/team" className="ws-see-all">
                    View all
                    <ArrowRight size={14} />
                  </Link>
                </div>
                <div className="ws-team-avatars">
                  {teamMembers.slice(0, 6).map((member, i) => (
                    <div 
                      key={member.id} 
                      className="ws-team-avatar-small"
                      style={{ 
                        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'][i % 6],
                        zIndex: 6 - i
                      }}
                      title={member.name}
                    >
                      {member.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </div>
                  ))}
                  {teamMembers.length > 6 && (
                    <div className="ws-team-avatar-more">
                      +{teamMembers.length - 6}
                    </div>
                  )}
                </div>
                <Link href="/nucleus" className="ws-card-link">
                  Open Nucleus
                  <ArrowRight size={14} />
                </Link>
              </section>
            </div>

            {/* Ticket Summary */}
            <div className="ws-secondary-widget">
              <section className="ws-card ws-ticket-summary-card">
                <div className="ws-card-header">
                  <h3>
                    <Ticket size={16} />
                    Tickets
                  </h3>
                  <Link href="/workspace/tickets" className="ws-see-all">
                    View all
                    <ArrowRight size={14} />
                  </Link>
                </div>
                {ticketSummaryLoading ? (
                  <div className="ws-ticket-summary__loading">Loading...</div>
                ) : (
                  <>
                    <div className="ws-ticket-summary__total">
                      <span className="ws-ticket-summary__total-num">{ticketStats.total}</span>
                      <span className="ws-ticket-summary__total-label">Open Tickets</span>
                    </div>
                    <div className="ws-ticket-summary__breakdown">
                      {ticketStats.p0 > 0 && (
                        <span className="ws-ticket-summary__badge ws-ticket-summary__badge--p0">
                          {ticketStats.p0} P0
                        </span>
                      )}
                      {ticketStats.p1 > 0 && (
                        <span className="ws-ticket-summary__badge ws-ticket-summary__badge--p1">
                          {ticketStats.p1} P1
                        </span>
                      )}
                      {ticketStats.p2 > 0 && (
                        <span className="ws-ticket-summary__badge ws-ticket-summary__badge--p2">
                          {ticketStats.p2} P2
                        </span>
                      )}
                      {ticketStats.p3 > 0 && (
                        <span className="ws-ticket-summary__badge ws-ticket-summary__badge--p3">
                          {ticketStats.p3} P3
                        </span>
                      )}
                      {ticketStats.total === 0 && (
                        <span className="ws-ticket-summary__all-clear">All clear</span>
                      )}
                    </div>
                    {ticketStats.total > 0 && (
                      <div className="ws-ticket-summary__bar">
                        {ticketStats.p0 > 0 && (
                          <div
                            className="ws-ticket-summary__bar-seg ws-ticket-summary__bar-seg--p0"
                            style={{ flex: ticketStats.p0 }}
                            title={`${ticketStats.p0} Critical`}
                          />
                        )}
                        {ticketStats.p1 > 0 && (
                          <div
                            className="ws-ticket-summary__bar-seg ws-ticket-summary__bar-seg--p1"
                            style={{ flex: ticketStats.p1 }}
                            title={`${ticketStats.p1} High`}
                          />
                        )}
                        {ticketStats.p2 > 0 && (
                          <div
                            className="ws-ticket-summary__bar-seg ws-ticket-summary__bar-seg--p2"
                            style={{ flex: ticketStats.p2 }}
                            title={`${ticketStats.p2} Medium`}
                          />
                        )}
                        {ticketStats.p3 > 0 && (
                          <div
                            className="ws-ticket-summary__bar-seg ws-ticket-summary__bar-seg--p3"
                            style={{ flex: ticketStats.p3 }}
                            title={`${ticketStats.p3} Low`}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
                <Link href="/workspace/tickets" className="ws-card-link">
                  Open Tickets
                  <ArrowRight size={14} />
                </Link>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
