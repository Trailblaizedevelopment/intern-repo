'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  ArrowRight,
  PenLine,
  BarChart3,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  Ticket,
  CheckSquare,
} from 'lucide-react';
import { supabase, Deal } from '@/lib/supabase';
import { TrailblaizeCalendar } from './TrailblaizeCalendar';
import { useGoogleIntegration } from '../hooks/useGoogleIntegration';
import { UseWorkspaceDataReturn } from '../hooks/useWorkspaceData';
import { Employee } from '@/lib/supabase';
import { useUserRole } from '../hooks/useUserRole';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STAGE_EMOJI: Record<string, string> = {
  lead: '🎯',
  demo_booked: '📅',
  first_demo: '🎬',
  second_call: '🤝',
  contract_sent: '📝',
  closed_won: '🏆',
};

interface CommandCenterProps {
  data: UseWorkspaceDataReturn;
  teamMembers: Employee[];
  firstName: string;
}

export function CommandCenter({ data, firstName }: CommandCenterProps) {
  const { currentEmployee } = data;
  const { isFounder, isEngineer, isIntern } = useUserRole();
  const google = useGoogleIntegration(currentEmployee?.id);

  const [myDeals, setMyDeals] = useState<Deal[]>([]);
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [chapters, setChapters] = useState<{ status: string; payment_amount: number | null; payment_type: string | null }[]>([]);
  const [metricsOpen, setMetricsOpen] = useState(false);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  useEffect(() => {
    if (!supabase) return;

    async function fetchData() {
      if (!supabase) return;

      // Founder: fetch own deals filtered by assigned_to
      if (isFounder && currentEmployee?.id) {
        const { data: d } = await supabase
          .from('deals')
          .select('*')
          .eq('assigned_to', currentEmployee.id)
          .order('next_followup', { ascending: true });
        if (d) setMyDeals(d as Deal[]);
      }

      // Founders + Engineers: fetch all deals + chapter count for company metrics
      if (isFounder || isEngineer) {
        const { data: d } = await supabase
          .from('deals')
          .select('id, stage, value, assigned_to');
        if (d) setAllDeals(d as unknown as Deal[]);

        const { data: chapterData } = await supabase
          .from('chapters')
          .select('status, payment_amount, payment_type')
          .in('status', ['active', 'onboarding']);
        setChapters(chapterData ?? []);
      }
    }

    fetchData();
  }, [currentEmployee?.id, isFounder, isEngineer]);

  // --- My active deals (all, sorted by stage urgency then value) ---
  const STAGE_PRIORITY: Record<string, number> = {
    contract_sent: 0, second_call: 1, first_demo: 2, demo_booked: 3, lead: 4,
  };

  const myActiveDealsAll = useMemo(() =>
    myDeals
      .filter(d => !['closed_won', 'closed_lost', 'hold_off'].includes(d.stage))
      .sort((a, b) => {
        const sp = (STAGE_PRIORITY[a.stage] ?? 5) - (STAGE_PRIORITY[b.stage] ?? 5);
        if (sp !== 0) return sp;
        return (b.value || 0) - (a.value || 0);
      }),
    [myDeals]
  );

  // Overdue count for badge
  const overdueCount = useMemo(() =>
    myActiveDealsAll.filter(d =>
      d.next_followup && new Date(d.next_followup) < now
    ).length,
    [myActiveDealsAll, now]
  );

  // --- Personal metrics (founders) ---
  const myClosedWon = useMemo(() => myDeals.filter(d => d.stage === 'closed_won'), [myDeals]);
  const myARR = useMemo(() => myClosedWon.reduce((s, d) => s + (d.value || 0), 0), [myClosedWon]);


  // --- Company-wide metrics (chapters-based) ---
  const totalARR = useMemo(() =>
    chapters.reduce((s, c) => {
      const amt = c.payment_amount || 0;
      if (!amt) return s;
      // Monthly payment_type: annualize; annual/one_time: use as-is
      return s + (c.payment_type === 'monthly' ? amt * 12 : amt);
    }, 0),
    [chapters]
  );
  const activeChapters = useMemo(() => chapters.filter(c => c.status === 'active').length, [chapters]);
  const activeAndOnboardingChapters = useMemo(() => chapters.length, [chapters]);

  // --- Intern: personal leads with activity needed ---
  const internLeads = useMemo(() => {
    if (!isIntern) return [];
    return data.leads
      .filter(l => !['converted', 'lost'].includes(l.status))
      .slice(0, 8);
  }, [data.leads, isIntern]);

  // --- Today's calendar events ---
  const todayEvents = useMemo(() => {
    if (!google.calendarEvents) return [];
    return google.calendarEvents
      .filter(e => {
        const start = e.start.dateTime || e.start.date || '';
        return start.startsWith(todayStr);
      })
      .sort((a, b) => {
        const aTime = a.start.dateTime || a.start.date || '';
        const bTime = b.start.dateTime || b.start.date || '';
        return aTime.localeCompare(bTime);
      });
  }, [google.calendarEvents, todayStr]);

  const urgentCount = overdueCount;

  return (
    <div className="cc-dashboard">

      {/* ─── 1. GREETING ─── */}
      <div className="cc-greeting-block">
        <div className="cc-greeting">
          <span className="cc-greeting-text">
            {getGreeting()}, {firstName}
          </span>
          <span className="cc-greeting-date">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        {urgentCount > 0 && isFounder && (
          <div className="cc-greeting-stat">
            <strong>{urgentCount} follow-up{urgentCount !== 1 ? 's' : ''}</strong> need your attention today
          </div>
        )}
      </div>

      {/* ─── 2. TODAY'S MEETINGS + FOLLOW-UPS ─── */}
      <div className="cc-today-grid">

        {/* Today's Meetings */}
        <div className="cc-card">
          <div className="cc-card-header">
            <span className="cc-card-title">Today&apos;s Meetings</span>
            {todayEvents.length > 0 && (
              <span className="cc-badge">{todayEvents.length}</span>
            )}
          </div>
          {google.calendarLoading ? (
            <div className="cc-empty">Loading calendar…</div>
          ) : !google.status?.connected ? (
            <div className="cc-empty">
              <button onClick={google.connect} className="cc-connect-btn">
                Connect Google Calendar
              </button>
            </div>
          ) : todayEvents.length === 0 ? (
            <div className="cc-empty">
              <CheckCircle size={15} />
              No meetings today
            </div>
          ) : (
            <div className="cc-list">
              {todayEvents.map(e => {
                const time = e.start.dateTime
                  ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                  : 'All day';
                return (
                  <a key={e.id} href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="cc-list-row">
                    <span className="cc-list-time">{time}</span>
                    <span className="cc-list-name">{e.summary}</span>
                    <ArrowRight size={12} className="cc-list-arrow" />
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* My Deals: Founders */}
        {isFounder && (
          <div className="cc-card">
            <div className="cc-card-header">
              <span className="cc-card-title">My Deals</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {overdueCount > 0 && (
                  <span className="cc-badge cc-badge--red">{overdueCount} overdue</span>
                )}
                {myActiveDealsAll.length > 0 && (
                  <span className="cc-badge">{myActiveDealsAll.length}</span>
                )}
              </div>
            </div>
            {myActiveDealsAll.length === 0 ? (
              <div className="cc-empty">
                <CheckCircle size={15} />
                No active deals
              </div>
            ) : (
              <div className="cc-list">
                {myActiveDealsAll.slice(0, 10).map(d => {
                  const rel = d.next_followup ? relativeDate(d.next_followup) : '';
                  const isOverdue = d.next_followup && new Date(d.next_followup) < now;
                  return (
                    <Link key={d.id} href="/nucleus/pipeline" className="cc-list-row">
                      <span className="cc-list-stage">{STAGE_EMOJI[d.stage] || '📌'}</span>
                      <span className="cc-list-name">{d.contact_name || d.name}</span>
                      {rel && (
                        <span className={`cc-list-time ${isOverdue ? 'cc-list-time--overdue' : ''}`}>
                          {rel}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
            {myActiveDealsAll.length > 10 && (
              <Link href="/nucleus/pipeline" className="cc-view-all">
                View all {myActiveDealsAll.length} <ArrowRight size={11} />
              </Link>
            )}
          </div>
        )}

        {/* Follow-ups: Growth Interns — personal leads */}
        {isIntern && (
          <div className="cc-card">
            <div className="cc-card-header">
              <span className="cc-card-title">My Leads</span>
              {internLeads.length > 0 && (
                <span className="cc-badge">{internLeads.length}</span>
              )}
            </div>
            {internLeads.length === 0 ? (
              <div className="cc-empty">
                <CheckCircle size={15} />
                No active leads
              </div>
            ) : (
              <div className="cc-list">
                {internLeads.map(l => (
                  <Link key={l.id} href="/workspace/leads" className="cc-list-row">
                    <span className="cc-list-name">{l.name}</span>
                    <span className="cc-list-org">{l.organization || ''}</span>
                    <span className={`cc-list-status cc-list-status--${l.status}`}>{l.status.replace('_', ' ')}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Engineer: Open tasks */}
        {isEngineer && (
          <div className="cc-card">
            <div className="cc-card-header">
              <span className="cc-card-title">Open Work</span>
              {data.tasks.filter(t => t.status !== 'done').length > 0 && (
                <span className="cc-badge">{data.tasks.filter(t => t.status !== 'done').length}</span>
              )}
            </div>
            {data.tasks.filter(t => t.status !== 'done').length === 0 ? (
              <div className="cc-empty">
                <CheckCircle size={15} />
                Nothing open — nice
              </div>
            ) : (
              <div className="cc-list">
                {data.tasks
                  .filter(t => t.status !== 'done')
                  .sort((a, b) => {
                    const p = { urgent: 0, high: 1, medium: 2, low: 3 };
                    return (p[a.priority] ?? 2) - (p[b.priority] ?? 2);
                  })
                  .slice(0, 8)
                  .map(t => (
                    <Link key={t.id} href="/workspace/tasks" className="cc-list-row">
                      <span className={`cc-task-dot cc-task-dot--${t.priority}`} />
                      <span className="cc-list-name">{t.title}</span>
                      <span className={`cc-task-status cc-task-status--${t.status}`}>
                        {t.status === 'in_progress' ? 'In progress' : 'To do'}
                      </span>
                    </Link>
                  ))}
              </div>
            )}
            <div className="cc-eng-links">
              <Link href="/workspace/tickets" className="cc-eng-link">
                <Ticket size={12} /> Tickets
              </Link>
              <Link href="/workspace/projects" className="cc-eng-link">
                <CheckSquare size={12} /> Projects
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ─── 3. PERSONAL METRICS (founders) ─── */}
      {isFounder && (
        <div className="cc-metrics-row">
          <div className="cc-metric-tile cc-metric-tile--green">
            <div className="cc-metric-number">{formatCurrency(myARR)}</div>
            <div className="cc-metric-label">My ARR Sold</div>
          </div>
          <div className="cc-metric-tile">
            <div className="cc-metric-number">{activeChapters}</div>
            <div className="cc-metric-label">Chapters Active</div>
          </div>
          <div className="cc-metric-tile">
            <div className="cc-metric-number">{myActiveDealsAll.length}</div>
            <div className="cc-metric-label">Active Pipeline</div>
          </div>
          <div className="cc-metric-tile cc-metric-tile--amber">
            <div className="cc-metric-number">{urgentCount}</div>
            <div className="cc-metric-label">Due Today</div>
          </div>
        </div>
      )}

      {/* ─── 4. COMPANY METRICS — collapsible (founders + engineers) ─── */}
      {(isFounder || isEngineer) && (
        <div className="cc-overall-section">
          <button
            className="cc-metrics-toggle"
            onClick={() => setMetricsOpen(v => !v)}
            aria-expanded={metricsOpen}
          >
            <BarChart3 size={13} />
            <span>Company Metrics</span>
            {metricsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {metricsOpen && (
            <div className="cc-metrics-row cc-metrics-row--overall">
              <div className="cc-metric-tile cc-metric-tile--green">
                <div className="cc-metric-number">{formatCurrency(totalARR)}</div>
                <div className="cc-metric-label">Total ARR</div>
              </div>
              <div className="cc-metric-tile cc-metric-tile--blue">
                <div className="cc-metric-number">{activeAndOnboardingChapters}</div>
                <div className="cc-metric-label">Active + Onboarding</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 5. CALENDAR ─── */}
      <div className="cc-calendar-section">
        <TrailblaizeCalendar
          events={google.calendarEvents}
          loading={google.calendarLoading}
          connected={google.status?.connected || false}
          onConnect={google.connect}
          onRefresh={google.fetchCalendarEvents}
        />
      </div>

      {/* ─── 6. WHITEBOARD PORTAL (founders + engineers, bottom) ─── */}
      {(isFounder || isEngineer) && (
        <div className="cc-whiteboard-portal">
          <Link href="/workspace/whiteboard" className="cc-whiteboard-btn">
            <PenLine size={16} />
            <span>Whiteboard</span>
            <ArrowRight size={14} className="cc-wb-arrow" />
          </Link>
        </div>
      )}

    </div>
  );
}
