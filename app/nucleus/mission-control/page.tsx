'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Radar, Users, Bot, Clock, Brain, Search, Filter, RefreshCw,
  ChevronLeft, ChevronRight, LayoutGrid, Network, X, Activity,
  CheckCircle2, AlertCircle, Circle, Play, Phone, MessageSquare,
  TrendingUp, ArrowUpRight, BookOpen, FileText, Calendar,
  Loader2, ChevronDown, Plus, Lightbulb, Terminal, Home,
  ArrowLeft, LayoutDashboard, Zap, Tag, User, ChevronUp,
  ArrowRight, CheckSquare, Package,
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

// ─── Error Boundary ────────────────────────────────────────────────────────

class MissionControlErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, error: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown, info: unknown) {
    console.error('[MissionControl] crash:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#991b1b' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 1rem' }} />
          <h2>Mission Control crashed</h2>
          <pre style={{ fontSize: '0.8rem', background: '#fee2e2', padding: '1rem', borderRadius: 8, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', borderRadius: 8, background: '#991b1b', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MCTab = 'command' | 'ideas' | 'agents' | 'system' | 'team';

interface CronJob {
  id: string;
  name: string;
  description?: string;
  agent?: string;
  scheduleKind?: 'cron' | 'every' | 'at';
  scheduleExpr?: string;
  scheduleInterval?: number;
  scheduleUnit?: string;
  scheduleTime?: string;
  scheduleTz?: string;
  schedule?: string;
  nextRun?: string | null;
  lastRun?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  consecutiveErrors?: number;
  enabled?: boolean;
}

interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
  status: 'active' | 'idle';
  lastActive: string | null;
  isMain?: boolean;
  gatewayConnected?: boolean;
}

interface Employee {
  id: string;
  name: string;
  role?: string;
  department?: string;
  email?: string;
  status?: string;
}

// ─── Ideas System ─────────────────────────────────────────────────────────────

type IdeaCategory = 'Product' | 'Sales' | 'Growth' | 'Operations' | 'Hiring' | 'Other';
type IdeaPriority = 'Do Now' | 'This Week' | 'This Sprint' | 'Backlog';
type IdeaStatus = 'Idea' | 'Task' | 'In Progress' | 'Shipped';
type IdeaAssignee = 'Tony' | 'Forge' | 'Devin' | 'Owen' | '';

interface Idea {
  id: string;
  title: string;
  description: string;
  category: IdeaCategory;
  priority: IdeaPriority;
  assignedTo: IdeaAssignee;
  status: IdeaStatus;
  createdAt: string;
  updatedAt: string;
}

const PRIORITY_RANK: Record<IdeaPriority, number> = {
  'Do Now': 0,
  'This Week': 1,
  'This Sprint': 2,
  'Backlog': 3,
};

const PRIORITY_STYLES: Record<IdeaPriority, { bg: string; color: string }> = {
  'Do Now':     { bg: '#FEE2E2', color: '#991B1B' },
  'This Week':  { bg: '#FEF3C7', color: '#B45309' },
  'This Sprint':{ bg: '#DBEAFE', color: '#1D4ED8' },
  'Backlog':    { bg: '#F3F4F6', color: '#6B7280' },
};

const STATUS_FLOW: Record<IdeaStatus, IdeaStatus | null> = {
  'Idea': 'Task',
  'Task': 'In Progress',
  'In Progress': 'Shipped',
  'Shipped': null,
};

const STATUS_STYLES: Record<IdeaStatus, { bg: string; color: string }> = {
  'Idea':        { bg: '#F3F4F6', color: '#6B7280' },
  'Task':        { bg: '#EFF6FF', color: '#1D4ED8' },
  'In Progress': { bg: '#ECFDF5', color: '#065F46' },
  'Shipped':     { bg: '#F0FDF4', color: '#15803D' },
};

const CATEGORY_STYLES: Record<IdeaCategory, { bg: string; color: string }> = {
  'Product':    { bg: '#EEF2FF', color: '#4338CA' },
  'Sales':      { bg: '#ECFDF5', color: '#065F46' },
  'Growth':     { bg: '#FFF7ED', color: '#C2410C' },
  'Operations': { bg: '#F0F9FF', color: '#0369A1' },
  'Hiring':     { bg: '#FDF4FF', color: '#7E22CE' },
  'Other':      { bg: '#F3F4F6', color: '#6B7280' },
};

const IDEAS_KEY = 'mc_ideas_v1';

function loadIdeas(): Idea[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(IDEAS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveIdeas(ideas: Idea[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(IDEAS_KEY, JSON.stringify(ideas));
}

// ─── Standup Notes ────────────────────────────────────────────────────────────

const STANDUP_KEY = 'mc_standup_v1';

function loadStandup(): Record<string, Record<string, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STANDUP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveStandup(data: Record<string, Record<string, string>>) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STANDUP_KEY, JSON.stringify(data));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function humanScheduleFromJob(job: CronJob): string {
  const kind = job.scheduleKind;
  if (kind === 'every') {
    const unit = job.scheduleUnit ?? 'minutes';
    const interval = job.scheduleInterval ?? 1;
    const unitLabel = interval === 1 ? unit.replace(/s$/, '') : unit;
    return `Every ${interval} ${unitLabel}`;
  }
  if (kind === 'at') {
    const timeStr = job.scheduleTime;
    if (!timeStr) return 'One-time';
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true, timeZone: 'America/Chicago',
    }) + ' CST';
  }
  if (kind === 'cron' && job.scheduleExpr) {
    return humanSchedule(job.scheduleExpr);
  }
  if (job.schedule) return humanSchedule(job.schedule);
  return '—';
}

function humanSchedule(cron: string): string {
  if (!cron) return cron;
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;
  if (dow !== '*' && dom === '*') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = parseInt(dow);
    return `${days[d] ?? dow} at ${hour}:${min.padStart(2, '0')}`;
  }
  if (min === '0' && hour !== '*' && dom === '*') {
    const hours = hour.split(',').map((h) => {
      const hNum = parseInt(h);
      const suffix = hNum >= 12 ? 'PM' : 'AM';
      const h12 = hNum % 12 === 0 ? 12 : hNum % 12;
      return `${h12}:00 ${suffix}`;
    });
    if (hours.length === 1) return `Daily at ${hours[0]} CST`;
    return `Daily at ${hours.join(', ')} CST`;
  }
  if (min !== '*' && hour !== '*' && dom === '*') {
    const minNum = parseInt(min);
    const hourNum = parseInt(hour);
    const suffix = hourNum >= 12 ? 'PM' : 'AM';
    const h12 = hourNum % 12 === 0 ? 12 : hourNum % 12;
    return `Daily at ${h12}:${String(minNum).padStart(2, '0')} ${suffix} CST`;
  }
  if (min.startsWith('*/') && hour.includes('-')) {
    const interval = min.replace('*/', '');
    const [startH, endH] = hour.split('-').map(Number);
    return `Every ${interval}m (${startH}am–${endH}pm CST)`;
  }
  return cron;
}

function fmtNextRun(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 60_000) return 'in <1m';
  if (diff < 3_600_000) return `in ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `in ${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function MissionControlInner() {
  const [activeTab, setActiveTab] = useState<MCTab>('command');

  const TABS: { key: MCTab; label: string; icon: React.ReactNode }[] = [
    { key: 'command', label: 'Command', icon: <Terminal size={15} /> },
    { key: 'ideas',   label: 'Ideas',   icon: <Lightbulb size={15} /> },
    { key: 'agents',  label: 'Agents',  icon: <Bot size={15} /> },
    { key: 'system',  label: 'System',  icon: <Activity size={15} /> },
    { key: 'team',    label: 'Team',    icon: <Users size={15} /> },
  ];

  return (
    <div className="module-page">
      {/* Header */}
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus" className="module-back">
              <ArrowLeft size={20} />
              Back to Nucleus
            </Link>
            <Link href="/workspace" className="module-back">
              <LayoutDashboard size={20} />
              Back to Workspace
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#F3F4F6', color: '#0F172A' }}>
              <Radar size={24} />
            </div>
            <div>
              <h1>Mission Control</h1>
              <p>Command center — ideas, agents, system health</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 20, padding: '0 24px 0', overflowX: 'auto' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px',
                fontSize: '0.875rem', fontWeight: 500,
                background: 'none', cursor: 'pointer',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: activeTab === t.key ? '2px solid #0F172A' : '2px solid transparent',
                color: activeTab === t.key ? '#0F172A' : '#6B7280',
                transition: 'color 0.15s, border-color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="module-main">
        {activeTab === 'command' && <CommandTab onNavigate={setActiveTab} />}
        {activeTab === 'ideas'   && <IdeasTab />}
        {activeTab === 'agents'  && <AgentsTab />}
        {activeTab === 'system'  && <SystemTab />}
        {activeTab === 'team'    && <TeamTab />}
      </main>
    </div>
  );
}

export default function MissionControlPage() {
  return (
    <MissionControlErrorBoundary>
      <MissionControlInner />
    </MissionControlErrorBoundary>
  );
}

// ─── COMMAND TAB ─────────────────────────────────────────────────────────────

interface PipelineStats {
  mrr: number;
  closedDealCount: number;
  schoolsInConversation: number;
  demosNext7: number;
  decisionsNext7: number;
  recentDeals: Array<{
    id: string;
    stage: string;
    value: number | null;
    assigned_to: string | null;
    updated_at: string | null;
    organization?: { name: string | null; school?: { name: string | null } | null } | null;
  }>;
}

interface OutreachToday {
  today_stats?: { t1_sent: number; t2_sent: number; sent: number };
  inbox?: { total: number; flagged: number };
}

function CommandTab({ onNavigate }: { onNavigate: (t: MCTab) => void }) {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [cronsError, setCronsError] = useState<string | null>(null);
  const [cronsLoading, setCronsLoading] = useState(true);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [outreach, setOutreach] = useState<OutreachToday | null>(null);
  const [ideas] = useState<Idea[]>(() => loadIdeas());

  useEffect(() => {
    fetch('/api/mission-control/crons')
      .then((r) => r.json())
      .then((d) => {
        setCrons(d.jobs ?? []);
        if (d.error) setCronsError(d.error);
      })
      .catch(() => setCronsError('Failed to load crons'))
      .finally(() => setCronsLoading(false));

    fetch('/api/pipeline/stats')
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});

    fetch('/api/mission-control/outreach')
      .then((r) => r.json())
      .then((d) => setOutreach(d))
      .catch(() => {});
  }, []);

  const now = Date.now();
  const todayCrons = crons
    .filter((j) => {
      if (!j.nextRun) return false;
      const t = new Date(j.nextRun).getTime();
      return t > now && t < now + 86_400_000;
    })
    .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())
    .slice(0, 6);

  const enabledCrons = crons.filter((j) => j.enabled !== false).length;
  const failedCrons  = crons.filter((j) => j.lastStatus === 'error').length;

  const topIdeas = ideas
    .filter((i) => i.status !== 'Shipped')
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt))
    .slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* System Health Cards */}
      <div>
        <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          System Health
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          {/* Crons health */}
          <button
            onClick={() => onNavigate('system')}
            style={{ background: 'white', border: `1px solid ${failedCrons > 0 ? '#FECACA' : '#E5E7EB'}`, borderRadius: 12, padding: '1rem', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Clock size={14} style={{ color: failedCrons > 0 ? '#EF4444' : '#6B7280' }} />
              <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>CRONS</span>
            </div>
            {cronsLoading ? (
              <Loader2 size={14} style={{ color: '#6B7280' }} className="animate-spin" />
            ) : cronsError ? (
              <div style={{ fontSize: '0.875rem', color: '#9CA3AF', fontStyle: 'italic' }}>Not connected</div>
            ) : (
              <>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>{enabledCrons} active</div>
                {failedCrons > 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#EF4444', fontWeight: 500 }}>{failedCrons} failed</div>
                )}
              </>
            )}
          </button>

          {/* Deploys */}
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Package size={14} style={{ color: '#6B7280' }} />
              <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>DEPLOYS</span>
            </div>
            <div style={{ fontSize: '0.875rem', color: '#9CA3AF', fontStyle: 'italic' }}>Vercel connected</div>
          </div>

          {/* Outreach */}
          <button
            onClick={() => onNavigate('team')}
            style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1rem', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <MessageSquare size={14} style={{ color: '#6B7280' }} />
              <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>OUTREACH</span>
            </div>
            {outreach?.today_stats ? (
              <>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>
                  {outreach.today_stats.sent} sent
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                  T1: {outreach.today_stats.t1_sent} · T2: {outreach.today_stats.t2_sent}
                </div>
              </>
            ) : (
              <div style={{ fontSize: '0.875rem', color: '#9CA3AF', fontStyle: 'italic' }}>Loading…</div>
            )}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left: Today's Schedule */}
        <div>
          <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
            Today&apos;s Schedule
          </h2>

          {cronsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6B7280', fontSize: '0.875rem', padding: '16px 0' }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : cronsError ? (
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontStyle: 'italic' }}>{cronsError}</div>
            </div>
          ) : todayCrons.length === 0 ? (
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#9CA3AF', fontStyle: 'italic' }}>No jobs scheduled today.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todayCrons.map((job) => {
                const nextDate = new Date(job.nextRun!);
                const timeLabel = nextDate.toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago',
                });
                return (
                  <div key={job.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ width: 64, flexShrink: 0 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>{timeLabel}</div>
                    </div>
                    <div style={{ width: 1, height: 28, background: '#E5E7EB', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</div>
                      {job.agent && <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: 1 }}>{job.agent}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pipeline snapshot */}
          {stats && (
            <div style={{ marginTop: '1.5rem' }}>
              <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                Pipeline
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { label: 'MRR',    value: `$${stats.mrr.toLocaleString()}` },
                  { label: 'Demos',  value: stats.demosNext7 },
                  { label: 'Schools',value: stats.schoolsInConversation },
                ].map((s) => (
                  <div key={s.label} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500, marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Top Ideas */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Top Ideas
            </h2>
            <button
              onClick={() => onNavigate('ideas')}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
            >
              View all <ArrowRight size={12} />
            </button>
          </div>

          {topIdeas.length === 0 ? (
            <div style={{ background: 'white', border: '1px dashed #E5E7EB', borderRadius: 12, padding: '1.5rem', textAlign: 'center' }}>
              <Lightbulb size={24} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>No ideas yet</div>
              <button
                onClick={() => onNavigate('ideas')}
                style={{ marginTop: 8, fontSize: '0.75rem', color: '#0F172A', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Add your first idea →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topIdeas.map((idea) => {
                const ps = PRIORITY_STYLES[idea.priority];
                const ss = STATUS_STYLES[idea.status];
                return (
                  <div key={idea.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#0F172A', flex: 1, lineHeight: 1.4 }}>{idea.title}</div>
                      <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: 9999, background: ps.bg, color: ps.color, fontWeight: 600, flexShrink: 0 }}>
                        {idea.priority}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: 9999, background: ss.bg, color: ss.color }}>
                        {idea.status}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{idea.category}</span>
                      {idea.assignedTo && <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>→ {idea.assignedTo}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            { label: 'View Crons',   icon: <Clock size={14} />,      tab: 'system' as MCTab },
            { label: 'View Agents',  icon: <Bot size={14} />,        tab: 'agents' as MCTab },
            { label: 'Open Ideas',   icon: <Lightbulb size={14} />,  tab: 'ideas'  as MCTab },
            { label: 'Team Status',  icon: <Users size={14} />,      tab: 'team'   as MCTab },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => onNavigate(a.tab)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 8,
                background: '#0F172A', color: 'white',
                border: 'none', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 500,
                transition: 'opacity 0.15s',
              }}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── IDEAS TAB ────────────────────────────────────────────────────────────────

const EMPTY_IDEA: Omit<Idea, 'id' | 'createdAt' | 'updatedAt'> = {
  title: '',
  description: '',
  category: 'Product',
  priority: 'This Week',
  assignedTo: '',
  status: 'Idea',
};

function IdeasTab() {
  const [ideas, setIdeasState] = useState<Idea[]>(() => loadIdeas());
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_IDEA>({ ...EMPTY_IDEA });
  const [filterCat, setFilterCat] = useState<IdeaCategory | ''>('');
  const [filterPri, setFilterPri] = useState<IdeaPriority | ''>('');
  const [filterStatus, setFilterStatus] = useState<IdeaStatus | ''>('');
  const [convertId, setConvertId] = useState<string | null>(null);
  const [convertDeadline, setConvertDeadline] = useState('');

  const setIdeas = (next: Idea[]) => {
    setIdeasState(next);
    saveIdeas(next);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_IDEA });
    setShowModal(true);
  };

  const openEdit = (idea: Idea) => {
    setEditingId(idea.id);
    setForm({
      title: idea.title,
      description: idea.description,
      category: idea.category,
      priority: idea.priority,
      assignedTo: idea.assignedTo,
      status: idea.status,
    });
    setShowModal(true);
  };

  const saveIdea = () => {
    if (!form.title.trim()) return;
    const now = new Date().toISOString();
    if (editingId) {
      setIdeas(ideas.map((i) =>
        i.id === editingId ? { ...i, ...form, updatedAt: now } : i
      ));
    } else {
      const newIdea: Idea = {
        id: crypto.randomUUID(),
        ...form,
        createdAt: now,
        updatedAt: now,
      };
      setIdeas([...ideas, newIdea]);
    }
    setShowModal(false);
  };

  const deleteIdea = (id: string) => {
    setIdeas(ideas.filter((i) => i.id !== id));
  };

  const advanceStatus = (id: string) => {
    setIdeas(ideas.map((i) => {
      if (i.id !== id) return i;
      const next = STATUS_FLOW[i.status];
      if (!next) return i;
      return { ...i, status: next, updatedAt: new Date().toISOString() };
    }));
  };

  const convertToTask = (id: string) => {
    setConvertId(id);
    setConvertDeadline('');
  };

  const confirmConvert = () => {
    if (!convertId) return;
    setIdeas(ideas.map((i) => {
      if (i.id !== convertId) return i;
      return { ...i, status: 'Task', updatedAt: new Date().toISOString() };
    }));
    setConvertId(null);
  };

  const filtered = ideas
    .filter((i) => !filterCat || i.category === filterCat)
    .filter((i) => !filterPri || i.priority === filterPri)
    .filter((i) => !filterStatus || i.status === filterStatus)
    .sort((a, b) => {
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      return b.createdAt.localeCompare(a.createdAt);
    });

  const counts = {
    active: ideas.filter((i) => i.status !== 'Shipped').length,
    shipped: ideas.filter((i) => i.status === 'Shipped').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', margin: 0 }}>Ideas Pipeline</h2>
          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
            {counts.active} active · {counts.shipped} shipped
          </span>
        </div>
        <button
          onClick={openNew}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#0F172A', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
        >
          <Plus size={14} /> Add Idea
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value as IdeaCategory | '')}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}
        >
          <option value="">All Categories</option>
          {(['Product', 'Sales', 'Growth', 'Operations', 'Hiring', 'Other'] as IdeaCategory[]).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterPri}
          onChange={(e) => setFilterPri(e.target.value as IdeaPriority | '')}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}
        >
          <option value="">All Priorities</option>
          {(['Do Now', 'This Week', 'This Sprint', 'Backlog'] as IdeaPriority[]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as IdeaStatus | '')}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', fontSize: '0.875rem', color: '#374151', cursor: 'pointer' }}
        >
          <option value="">All Statuses</option>
          {(['Idea', 'Task', 'In Progress', 'Shipped'] as IdeaStatus[]).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(filterCat || filterPri || filterStatus) && (
          <button
            onClick={() => { setFilterCat(''); setFilterPri(''); setFilterStatus(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', fontSize: '0.875rem', color: '#6B7280', cursor: 'pointer' }}
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Ideas List */}
      {filtered.length === 0 ? (
        <div style={{ background: 'white', border: '1px dashed #E5E7EB', borderRadius: 12, padding: '3rem', textAlign: 'center' }}>
          <Lightbulb size={32} style={{ color: '#D1D5DB', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '0.875rem', color: '#9CA3AF', marginBottom: 12 }}>
            {ideas.length === 0 ? 'No ideas yet. Brain dump something.' : 'No ideas match your filters.'}
          </div>
          {ideas.length === 0 && (
            <button
              onClick={openNew}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#0F172A', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              <Plus size={14} /> Add First Idea
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((idea) => {
            const ps = PRIORITY_STYLES[idea.priority];
            const ss = STATUS_STYLES[idea.status];
            const cs = CATEGORY_STYLES[idea.category];
            const nextStatus = STATUS_FLOW[idea.status];
            return (
              <div key={idea.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#0F172A' }}>{idea.title}</span>
                    </div>
                    {idea.description && (
                      <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: '0 0 8px', lineHeight: 1.5 }}>
                        {idea.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999, background: ps.bg, color: ps.color, fontWeight: 600 }}>
                        {idea.priority}
                      </span>
                      <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999, background: ss.bg, color: ss.color }}>
                        {idea.status}
                      </span>
                      <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999, background: cs.bg, color: cs.color }}>
                        {idea.category}
                      </span>
                      {idea.assignedTo && (
                        <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>→ {idea.assignedTo}</span>
                      )}
                      <span style={{ fontSize: '0.72rem', color: '#D1D5DB' }}>{fmtTime(idea.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {idea.status === 'Idea' && (
                      <button
                        onClick={() => convertToTask(idea.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '5px 10px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
                      >
                        <CheckSquare size={12} /> Convert to Task
                      </button>
                    )}
                    {nextStatus && idea.status !== 'Idea' && (
                      <button
                        onClick={() => advanceStatus(idea.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '5px 10px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
                      >
                        <ArrowRight size={12} /> {nextStatus}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(idea)}
                      style={{ fontSize: '0.75rem', padding: '5px 10px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteIdea(idea.id)}
                      style={{ fontSize: '0.75rem', padding: '5px 8px', borderRadius: 7, border: '1px solid #FEE2E2', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontWeight: 700, color: '#0F172A', margin: 0, fontSize: '1.0625rem' }}>
                {editingId ? 'Edit Idea' : 'New Idea'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Title *</label>
                <input
                  autoFocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="What's the idea?"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#0F172A', background: '#F9FAFB', boxSizing: 'border-box', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Description / Notes</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brain dump it here…"
                  rows={4}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#0F172A', background: '#F9FAFB', boxSizing: 'border-box', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as IdeaCategory })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#374151', background: '#F9FAFB', cursor: 'pointer' }}
                  >
                    {(['Product', 'Sales', 'Growth', 'Operations', 'Hiring', 'Other'] as IdeaCategory[]).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as IdeaPriority })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#374151', background: '#F9FAFB', cursor: 'pointer' }}
                  >
                    {(['Do Now', 'This Week', 'This Sprint', 'Backlog'] as IdeaPriority[]).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Assigned to</label>
                  <select
                    value={form.assignedTo}
                    onChange={(e) => setForm({ ...form, assignedTo: e.target.value as IdeaAssignee })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#374151', background: '#F9FAFB', cursor: 'pointer' }}
                  >
                    <option value="">Unassigned</option>
                    {(['Tony', 'Forge', 'Devin', 'Owen'] as IdeaAssignee[]).filter(Boolean).map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                {editingId && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as IdeaStatus })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#374151', background: '#F9FAFB', cursor: 'pointer' }}
                    >
                      {(['Idea', 'Task', 'In Progress', 'Shipped'] as IdeaStatus[]).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', color: '#374151', cursor: 'pointer', fontSize: '0.875rem' }}
              >
                Cancel
              </button>
              <button
                onClick={saveIdea}
                disabled={!form.title.trim()}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: form.title.trim() ? '#0F172A' : '#9CA3AF', color: 'white', cursor: form.title.trim() ? 'pointer' : 'not-allowed', fontSize: '0.875rem', fontWeight: 500 }}
              >
                {editingId ? 'Save Changes' : 'Add Idea'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Task Modal */}
      {convertId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setConvertId(null)}
        >
          <div
            style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontWeight: 700, color: '#0F172A', margin: '0 0 16px' }}>Convert to Task</h3>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: '0 0 16px' }}>
              This will move the idea to &ldquo;Task&rdquo; status.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Deadline (optional)</label>
              <input
                type="date"
                value={convertDeadline}
                onChange={(e) => setConvertDeadline(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#374151', background: '#F9FAFB', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConvertId(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', color: '#374151', cursor: 'pointer', fontSize: '0.875rem' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmConvert}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0F172A', color: 'white', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
              >
                Convert to Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AGENTS TAB ──────────────────────────────────────────────────────────────

const AGENT_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  violet: { bg: '#F3F4F6', text: '#0F172A' },
  amber:  { bg: '#FEF3C7', text: '#B45309' },
  emerald:{ bg: '#ECFDF5', text: '#065F46' },
  blue:   { bg: '#EFF6FF', text: '#1D4ED8' },
  teal:   { bg: '#F0FDFA', text: '#0F766E' },
  indigo: { bg: '#EEF2FF', text: '#4338CA' },
  pink:   { bg: '#FDF2F8', text: '#BE185D' },
  cyan:   { bg: '#ECFEFF', text: '#0E7490' },
  slate:  { bg: '#F3F4F6', text: '#475569' },
};

function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [gatewayConnected, setGatewayConnected] = useState(false);
  const [soulAgent, setSoulAgent] = useState<Agent | null>(null);
  const [soulContent, setSoulContent] = useState('');
  const [soulLoading, setSoulLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/mission-control/agents')
      .then((r) => r.json())
      .then((d) => {
        setAgents(d.agents ?? []);
        setGatewayConnected(d.gatewayConnected ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openSoul = async (agent: Agent) => {
    setSoulAgent(agent);
    setSoulContent('');
    setSoulLoading(true);
    try {
      const res = await fetch(`/api/mission-control/soul?agent=${agent.id}`);
      const json = await res.json();
      setSoulContent(json.content ?? '');
    } catch { /* ignore */ }
    finally { setSoulLoading(false); }
  };

  const FEATURED = ['main', 'dev', 'gtm', 'alumni'];
  const featured = agents.filter((a) => FEATURED.includes(a.id));
  const rest = agents.filter((a) => !FEATURED.includes(a.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Gateway status banner */}
      {!gatewayConnected && !loading && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} style={{ color: '#B45309', flexShrink: 0 }} />
          <span style={{ fontSize: '0.8125rem', color: '#92400E' }}>
            Connect gateway for live status — set <code style={{ background: '#FEF3C7', padding: '1px 4px', borderRadius: 3 }}>OPENCLAW_GATEWAY_URL</code> to see real-time agent activity.
          </span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#6B7280' }}>
          <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} /> Loading agents…
        </div>
      ) : (
        <>
          {/* Featured agents */}
          <div>
            <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
              Core Agents
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {featured.map((agent) => (
                <AgentCard key={agent.id} agent={agent} onViewSoul={openSoul} />
              ))}
            </div>
          </div>

          {/* Rest */}
          {rest.length > 0 && (
            <div>
              <h2 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>
                Engineering Team
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {rest.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} onViewSoul={openSoul} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Soul Drawer */}
      {soulAgent && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}
          onClick={() => setSoulAgent(null)}
        >
          <div style={{ flex: 1 }} />
          <div
            style={{ width: '100%', maxWidth: 512, height: '100%', background: 'white', borderLeft: '1px solid #E5E7EB', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.5rem' }}>{soulAgent.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{soulAgent.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>SOUL.md</div>
                </div>
              </div>
              <button onClick={() => setSoulAgent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {soulLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6B7280' }}>
                  <Loader2 size={16} className="animate-spin" /> Loading soul…
                </div>
              ) : soulContent ? (
                <div className="prose prose-sm max-w-none" style={{ color: '#0F172A' }}>
                  <ReactMarkdown>{soulContent}</ReactMarkdown>
                </div>
              ) : (
                <div style={{ color: '#6B7280', fontSize: '0.875rem', fontStyle: 'italic' }}>No SOUL.md found for this agent.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, onViewSoul }: { agent: Agent; onViewSoul: (a: Agent) => void }) {
  const colors = AGENT_COLOR_MAP[agent.color] ?? AGENT_COLOR_MAP.slate;
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', background: colors.bg, flexShrink: 0 }}>
            {agent.emoji}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{agent.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: agent.status === 'active' ? '#34D399' : '#CBD5E1', display: 'inline-block' }} />
              <span style={{ fontSize: '0.72rem', color: agent.status === 'active' ? '#059669' : '#9CA3AF' }}>
                {agent.status === 'active' ? 'Active' : 'Idle'}
              </span>
            </div>
          </div>
        </div>
        {agent.isMain && (
          <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999, background: '#F3F4F6', color: '#0F172A', border: '1px solid #E5E7EB', fontWeight: 600 }}>
            Chief
          </span>
        )}
      </div>
      <p style={{ fontSize: '0.75rem', color: '#6B7280', lineHeight: 1.6, margin: '0 0 10px', overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 } as React.CSSProperties}>
        {agent.description}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>
          {agent.lastActive ? fmtTime(agent.lastActive) : 'Never active'}
        </div>
        <button
          onClick={() => onViewSoul(agent)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', padding: '4px 10px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}
        >
          <BookOpen size={11} /> Soul
        </button>
      </div>
    </div>
  );
}

// ─── SYSTEM TAB ───────────────────────────────────────────────────────────────

const AGENT_BADGE_STYLES: Record<string, React.CSSProperties> = {
  dev:     { background: '#EEF2FF', color: '#4338CA' },
  alumni:  { background: '#EFF6FF', color: '#1D4ED8' },
  success: { background: '#F0FDFA', color: '#0F766E' },
  gtm:     { background: '#FFFBEB', color: '#B45309' },
  main:    { background: '#F3F4F6', color: '#0F172A' },
  tony:    { background: '#F3F4F6', color: '#0F172A' },
  sales:   { background: '#ECFDF5', color: '#065F46' },
};

function cronStatusStyle(s: string | null | undefined): React.CSSProperties {
  if (s === 'success') return { background: '#ECFDF5', color: '#059669' };
  if (s === 'error')   return { background: '#FEF2F2', color: '#DC2626' };
  if (s === 'running') return { background: '#EFF6FF', color: '#2563EB' };
  return { background: '#F9FAFB', color: '#6B7280' };
}

function SystemTab() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [cronsLoading, setCronsLoading] = useState(true);
  const [cronsError, setCronsError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadCrons = useCallback(async () => {
    try {
      const res = await fetch('/api/mission-control/crons');
      const d = await res.json();
      setCrons(d.jobs ?? []);
      if (d.error) setCronsError(d.error);
      else setCronsError(null);
    } catch {
      setCronsError('Failed to load crons');
    } finally {
      setCronsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCrons();
    intervalRef.current = setInterval(loadCrons, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadCrons]);

  const triggerCron = async (jobId: string) => {
    setTriggering(jobId);
    try {
      await fetch(`/api/mission-control/crons/${jobId}/run`, { method: 'POST' });
      setTimeout(loadCrons, 2000);
    } catch { /* ignore */ }
    finally { setTriggering(null); }
  };

  const agents = [...new Set(crons.map((j) => j.agent).filter(Boolean))] as string[];
  const filtered = filterAgent ? crons.filter((j) => j.agent === filterAgent) : crons;
  const enabledCount = crons.filter((j) => j.enabled !== false).length;
  const errorCount = crons.filter((j) => j.lastStatus === 'error').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Crons Section */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', margin: 0 }}>Cron Jobs</h2>
            {!cronsLoading && !cronsError && (
              <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                {crons.length} total · {enabledCount} enabled
                {errorCount > 0 && <span style={{ color: '#EF4444', marginLeft: 4 }}>· {errorCount} errors</span>}
                <span style={{ color: '#9CA3AF', marginLeft: 4 }}>· auto-refreshes 30s</span>
              </span>
            )}
          </div>
          <button
            onClick={loadCrons}
            style={{ padding: 7, borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', color: '#6B7280', cursor: 'pointer' }}
          >
            <RefreshCw size={14} className={cronsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {cronsError ? (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <AlertCircle size={16} style={{ color: '#B45309', marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#92400E' }}>{cronsError}</div>
              <div style={{ fontSize: '0.75rem', color: '#B45309', marginTop: 4 }}>
                Set <code style={{ background: '#FEF3C7', padding: '1px 4px', borderRadius: 3 }}>OPENCLAW_GATEWAY_URL</code> and <code style={{ background: '#FEF3C7', padding: '1px 4px', borderRadius: 3 }}>OPENCLAW_GATEWAY_TOKEN</code> in your Vercel environment variables.
              </div>
            </div>
          </div>
        ) : cronsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#6B7280' }}>
            <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} /> Loading crons…
          </div>
        ) : crons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#9CA3AF', fontSize: '0.875rem' }}>No cron jobs found</div>
        ) : (
          <>
            {agents.length > 1 && (
              <div style={{ marginBottom: 10 }}>
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', fontSize: '0.875rem', color: '#374151' }}
                >
                  <option value="">All Agents</option>
                  {agents.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Agent</th>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Schedule</th>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Run</th>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      <th style={{ textAlign: 'right', padding: '10px 16px', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((job) => (
                      <tr key={job.id} style={{ borderBottom: '1px solid #F3F4F6', opacity: job.enabled === false ? 0.55 : 1 }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 500, color: '#0F172A', fontSize: '0.875rem' }}>{job.name}</div>
                          {job.lastError && job.lastStatus === 'error' && (
                            <div style={{ fontSize: '0.72rem', color: '#EF4444', marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.lastError}>
                              ↳ {job.lastError.slice(0, 60)}{job.lastError.length > 60 ? '…' : ''}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {job.agent && (
                            <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: '0.72rem', fontWeight: 500, ...(AGENT_BADGE_STYLES[job.agent.toLowerCase()] ?? { background: '#F9FAFB', color: '#374151' }) }}>
                              {job.agent}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#6B7280' }}>
                          {humanScheduleFromJob(job)}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: '0.75rem', color: '#6B7280' }}>
                          {fmtNextRun(job.nextRun)}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {job.lastStatus ? (
                            <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: '0.72rem', ...cronStatusStyle(job.lastStatus) }}>
                              {job.lastStatus}{job.consecutiveErrors && job.consecutiveErrors > 1 ? ` ×${job.consecutiveErrors}` : ''}
                            </span>
                          ) : <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => triggerCron(job.id)}
                            disabled={triggering === job.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', padding: '4px 10px', borderRadius: 7, background: '#F3F4F6', color: '#374151', border: 'none', cursor: triggering === job.id ? 'not-allowed' : 'pointer', opacity: triggering === job.id ? 0.5 : 1 }}
                          >
                            {triggering === job.id ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                            Run
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Deploy History Placeholder */}
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.75rem' }}>Deploy History</h2>
        <div style={{ background: 'white', border: '1px dashed #E5E7EB', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
          <Package size={24} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
          <div style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>Deploy history coming soon — connect Vercel webhook</div>
        </div>
      </div>

      {/* Error Log Placeholder */}
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.75rem' }}>Error Log</h2>
        <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1rem 1.25rem' }}>
          {errorCount > 0 ? (
            crons.filter((j) => j.lastStatus === 'error').map((job) => (
              <div key={job.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <AlertCircle size={14} style={{ color: '#EF4444', marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#0F172A' }}>{job.name}</div>
                  {job.lastError && <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>{job.lastError}</div>}
                  {job.lastRun && <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: 2 }}>{fmtTime(job.lastRun)}</div>}
                </div>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#059669', fontSize: '0.875rem' }}>
              <CheckCircle2 size={16} /> No errors in recent runs
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TEAM TAB ─────────────────────────────────────────────────────────────────

const DEFAULT_TEAM = [
  { id: 'owen',  name: 'Owen',  role: 'Co-Founder',        emoji: '🧠', department: 'Leadership' },
  { id: 'ford',  name: 'Ford',  role: 'Customer Success',  emoji: '📞', department: 'CS' },
  { id: 'adam',  name: 'Adam',  role: 'Sales',             emoji: '📬', department: 'Sales' },
  { id: 'devin', name: 'Devin', role: 'Engineering',       emoji: '💻', department: 'Engineering' },
  { id: 'tony',  name: 'Tony',  role: 'AI Chief of Staff', emoji: '🤙', department: 'AI' },
];

function TeamTab() {
  const [employees, setEmployees] = useState<typeof DEFAULT_TEAM>(DEFAULT_TEAM);
  const [standup, setStandupState] = useState<Record<string, Record<string, string>>>(() => loadStandup());
  const [ideas] = useState<Idea[]>(() => loadIdeas());
  const today = todayKey();

  useEffect(() => {
    fetch('/api/employees?status=active')
      .then((r) => r.json())
      .then((d) => {
        if (d.data && d.data.length > 0) {
          setEmployees(d.data.map((e: Employee) => ({
            id: e.id,
            name: e.name,
            role: e.role ?? e.department ?? 'Team',
            emoji: '👤',
            department: e.department ?? '',
          })));
        }
      })
      .catch(() => {}); // fallback to default team
  }, []);

  const setStandup = (next: Record<string, Record<string, string>>) => {
    setStandupState(next);
    saveStandup(next);
  };

  const updateNote = (memberId: string, note: string) => {
    setStandup({
      ...standup,
      [today]: { ...(standup[today] ?? {}), [memberId]: note },
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', margin: 0 }}>Team</h2>
        <span style={{ fontSize: '0.75rem', color: '#6B7280', background: '#F3F4F6', padding: '4px 10px', borderRadius: 9999 }}>
          Standup: {today}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {employees.map((member) => {
          const assigned = ideas.filter((i) => i.assignedTo === member.name && i.status !== 'Shipped');
          const noteKey = member.id.toLowerCase();
          const todayNote = standup[today]?.[noteKey] ?? '';

          return (
            <div key={member.id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', flexShrink: 0 }}>
                  {member.emoji}
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.9375rem' }}>{member.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>{member.role}</div>
                </div>
              </div>

              {/* Assigned ideas */}
              {assigned.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Working on</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {assigned.slice(0, 3).map((idea) => {
                      const ss = STATUS_STYLES[idea.status];
                      return (
                        <div key={idea.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: 9999, background: ss.bg, color: ss.color }}>{idea.status}</span>
                          <span style={{ fontSize: '0.75rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</span>
                        </div>
                      );
                    })}
                    {assigned.length > 3 && (
                      <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>+{assigned.length - 3} more</div>
                    )}
                  </div>
                </div>
              )}

              {/* Standup note */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Today&apos;s note</div>
                <textarea
                  value={todayNote}
                  onChange={(e) => updateNote(noteKey, e.target.value)}
                  placeholder="What's on the plate today?"
                  rows={2}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.8125rem', color: '#374151', background: '#F9FAFB', boxSizing: 'border-box', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
