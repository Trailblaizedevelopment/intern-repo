'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Radar, Users, Bot, Clock, Brain, Search, Filter, RefreshCw,
  ChevronLeft, ChevronRight, LayoutGrid, Network, X, Activity,
  CheckCircle2, AlertCircle, Circle, Play, Phone, MessageSquare,
  TrendingUp, ArrowUpRight, BookOpen, FileText, Calendar,
  ToggleLeft, ToggleRight, Loader2, ChevronDown,
  ArrowLeft, LayoutDashboard, Home, Building2, DollarSign,
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

// ─── Error Boundary ────────────────────────────────────────────────────────

interface ErrorBoundaryState { hasError: boolean; error: string | null }

class MissionControlErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return { hasError: true, error: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown, info: unknown) {
    console.error('[MissionControl] runtime crash:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#991b1b' }}>
          <AlertCircle size={32} style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ marginBottom: '0.5rem' }}>Mission Control crashed</h2>
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

type MainTab = 'home' | 'alumni' | 'agents' | 'crons' | 'memory';
type OutreachSubTab = 'alumni' | 'outreach';
type AgentViewMode = 'hierarchy' | 'grid';
type MemorySubTab = 'daily' | 'longterm';

interface AlumniContact {
  id: string;
  first_name: string;
  last_name: string;
  chapter_id: string | null;
  chapter?: { id: string; chapter_name: string; fraternity: string | null; school: string | null } | null;
  phone_primary: string | null;
  outreach_status: string;
  updated_at: string;
}

interface AlumniData {
  data: AlumniContact[];
  count: number;
  chapters: Array<{ id: string; chapter_name: string; fraternity: string | null; school: string | null }>;
  statusCounts: Record<string, number>;
  page: number;
  limit: number;
}

interface ChapterFunnel {
  chapter_id: string;
  chapter_name: string;
  total: number;
  have_phone: number;
  contacted: number;
  responded: number;
  signed_up: number;
  imessage: number;
}

interface OutreachData {
  lines: Array<{
    line_number: number;
    label: string;
    daily_limit: number;
    is_paused: boolean;
    linq_status?: string;
    sent_today?: number;
  }>;
  chapters: ChapterFunnel[];
  batches: Array<Record<string, unknown>>;
  today_stats: {
    t1_sent: number;
    t2_sent: number;
    t3_sent: number;
    sent: number;
    failed: number;
    total_signed_up: number;
    total_responded: number;
  };
  inbox: { total: number; flagged: number; needs_t2: number };
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
}

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

interface MemoryEntry {
  date: string;
  filename: string;
  preview: string;
  content: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  not_contacted: 'Not Contacted',
  touch1_sent: 'T1 Sent',
  touch1_confirmed: 'T1 Confirmed',
  touch2_sent: 'T2 Sent',
  touch3_sent: 'T3 Sent',
  responded: 'Responded',
  signed_up: 'Signed Up',
  declined: 'Declined',
  unsubscribed: 'Unsub',
};

const AGENT_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  violet: { bg: '#F3F4F6', text: '#0F172A' },
  amber:  { bg: '#F3F4F6', text: '#0F172A' },
  emerald:{ bg: '#ecfdf5', text: '#065f46' },
  blue:   { bg: '#eff6ff', text: '#1d4ed8' },
  teal:   { bg: '#f0fdfa', text: '#0f766e' },
  indigo: { bg: '#eef2ff', text: '#4338ca' },
  pink:   { bg: '#fdf2f8', text: '#be185d' },
  cyan:   { bg: '#ecfeff', text: '#0e7490' },
  slate:  { bg: '#F3F4F6', text: '#475569' },
};

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
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

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  not_contacted:   { color: '#6b7280', bg: '#f3f4f6' },
  touch1_sent:     { color: '#1d4ed8', bg: '#dbeafe' },
  touch1_confirmed:{ color: '#b45309', bg: '#fef3c7' },
  touch2_sent:     { color: '#0F172A', bg: '#F3F4F6' },
  touch3_sent:     { color: '#4338ca', bg: '#e0e7ff' },
  responded:       { color: '#065f46', bg: '#d1fae5' },
  signed_up:       { color: '#064e3b', bg: '#a7f3d0' },
  declined:        { color: '#991b1b', bg: '#fee2e2' },
  unsubscribed:    { color: '#7f1d1d', bg: '#fecaca' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '9999px',
      fontSize: '0.72rem',
      fontWeight: 600,
      color: s.color,
      backgroundColor: s.bg,
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}) {
  void color;
  return (
    <div className="module-stat" style={{ flexDirection: 'row', gap: '0.75rem', alignItems: 'center' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, background: '#F3F4F6', color: '#6B7280',
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div className="module-stat-value" style={{ fontSize: '1.2rem' }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function MissionControlInner() {
  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [outreachSub, setOutreachSub] = useState<OutreachSubTab>('outreach');

  // Alumni
  const [alumniData, setAlumniData] = useState<AlumniData | null>(null);
  const [alumniLoading, setAlumniLoading] = useState(false);
  const [alumniPage, setAlumniPage] = useState(1);
  const [alumniSearch, setAlumniSearch] = useState('');
  const [alumniChapter, setAlumniChapter] = useState('');
  const [alumniStatus, setAlumniStatus] = useState('');

  // Outreach
  const [outreachData, setOutreachData] = useState<OutreachData | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);

  // Agents
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentView, setAgentView] = useState<AgentViewMode>('hierarchy');
  const [soulAgent, setSoulAgent] = useState<Agent | null>(null);
  const [soulContent, setSoulContent] = useState('');
  const [soulLoading, setSoulLoading] = useState(false);

  // Crons
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [cronsLoading, setCronsLoading] = useState(false);
  const [triggeringCron, setTriggeringCron] = useState<string | null>(null);
  const cronIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Memory
  const [memorySub, setMemorySub] = useState<MemorySubTab>('daily');
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<MemoryEntry | null>(null);
  const [longTermContent, setLongTermContent] = useState('');
  const [memoryLoading, setMemoryLoading] = useState(false);

  // ─── Loaders ──────────────────────────────────────────────────────────────

  const loadAlumni = useCallback(async (page = 1) => {
    setAlumniLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (alumniSearch) params.set('search', alumniSearch);
      if (alumniChapter) params.set('chapter', alumniChapter);
      if (alumniStatus) params.set('status', alumniStatus);
      const res = await fetch(`/api/mission-control/alumni?${params}`);
      const json = await res.json();
      setAlumniData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setAlumniLoading(false);
    }
  }, [alumniSearch, alumniChapter, alumniStatus]);

  const loadOutreach = useCallback(async () => {
    setOutreachLoading(true);
    try {
      const res = await fetch('/api/mission-control/outreach');
      const json = await res.json();
      setOutreachData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setOutreachLoading(false);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    setAgentsLoading(true);
    try {
      const res = await fetch('/api/mission-control/agents');
      const json = await res.json();
      setAgents(json.agents ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const loadCrons = useCallback(async () => {
    setCronsLoading(true);
    try {
      const res = await fetch('/api/mission-control/crons');
      const json = await res.json();
      setCrons(json.jobs ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setCronsLoading(false);
    }
  }, []);

  const loadMemory = useCallback(async () => {
    setMemoryLoading(true);
    try {
      if (memorySub === 'daily') {
        const res = await fetch('/api/mission-control/memory');
        const json = await res.json();
        setMemoryEntries(json.entries ?? []);
      } else {
        const res = await fetch('/api/mission-control/memory?type=longterm');
        const json = await res.json();
        setLongTermContent(json.content ?? '');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setMemoryLoading(false);
    }
  }, [memorySub]);

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeTab === 'alumni') { loadAlumni(alumniPage); }
  }, [activeTab, alumniPage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'alumni' && outreachSub === 'outreach') loadOutreach();
  }, [activeTab, outreachSub]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'agents') loadAgents();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'crons') {
      loadCrons();
      cronIntervalRef.current = setInterval(loadCrons, 30_000);
    }
    return () => {
      if (cronIntervalRef.current) clearInterval(cronIntervalRef.current);
    };
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'memory') loadMemory();
  }, [activeTab, memorySub]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Soul drawer ──────────────────────────────────────────────────────────

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

  // ─── Cron trigger ─────────────────────────────────────────────────────────

  const triggerCron = async (jobId: string) => {
    setTriggeringCron(jobId);
    try {
      await fetch(`/api/mission-control/crons/${jobId}/run`, { method: 'POST' });
      setTimeout(loadCrons, 2000);
    } catch { /* ignore */ }
    finally { setTriggeringCron(null); }
  };

  // ─── Alumni search debounce ───────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setAlumniPage(1); loadAlumni(1); }, 400);
    return () => clearTimeout(t);
  }, [alumniSearch, alumniChapter, alumniStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const TABS: { key: MainTab; label: string; icon: React.ReactNode }[] = [
    { key: 'home',    label: 'Home',               icon: <Home size={15} /> },
    { key: 'alumni',  label: 'Alumni & Outreach',  icon: <Users size={15} /> },
    { key: 'agents',  label: 'Agents',             icon: <Bot size={15} /> },
    { key: 'crons',   label: 'Crons',              icon: <Clock size={15} /> },
    { key: 'memory',  label: 'Memory',             icon: <Brain size={15} /> },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

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
              <p>Founder command center — agents, outreach, memory</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 20, padding: '0 24px 4px' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px',
                fontSize: '0.875rem', fontWeight: 500,
                background: 'none', cursor: 'pointer',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: activeTab === t.key ? '2px solid #0F172A' : '2px solid transparent',
                color: activeTab === t.key ? '#0F172A' : '#6B7280',
                transition: 'color 0.15s, border-color 0.15s',
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

        {/* ═══ HOME TAB ═══ */}
        {activeTab === 'home' && (
          <HomeTab />
        )}

        {/* ═══ ALUMNI & OUTREACH TAB ═══ */}
        {activeTab === 'alumni' && (
          <div>
            {/* Sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#F3F4F6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
              {(['outreach', 'alumni'] as OutreachSubTab[]).map((sub) => (
                <button
                  key={sub}
                  onClick={() => setOutreachSub(sub)}
                  style={{
                    padding: '8px 20px', borderRadius: 8,
                    fontSize: '0.875rem', fontWeight: 500,
                    border: 'none', cursor: 'pointer',
                    background: outreachSub === sub ? 'white' : 'transparent',
                    color: outreachSub === sub ? '#0F172A' : '#6B7280',
                    transition: 'all 0.15s',
                  }}
                >
                  {sub === 'outreach' ? 'Outreach Dashboard' : 'Alumni Contacts'}
                </button>
              ))}
            </div>

            {outreachSub === 'alumni' && (
              <AlumniSection
                data={alumniData}
                loading={alumniLoading}
                page={alumniPage}
                search={alumniSearch}
                chapter={alumniChapter}
                status={alumniStatus}
                onSearch={setAlumniSearch}
                onChapter={setAlumniChapter}
                onStatus={setAlumniStatus}
                onPageChange={(p) => { setAlumniPage(p); loadAlumni(p); }}
              />
            )}

            {outreachSub === 'outreach' && (
              <OutreachSection
                data={outreachData}
                loading={outreachLoading}
                onRefresh={loadOutreach}
              />
            )}
          </div>
        )}

        {/* ═══ AGENTS TAB ═══ */}
        {activeTab === 'agents' && (
          <AgentsSection
            agents={agents}
            loading={agentsLoading}
            viewMode={agentView}
            onViewMode={setAgentView}
            onViewSoul={openSoul}
            onRefresh={loadAgents}
          />
        )}

        {/* ═══ CRONS TAB ═══ */}
        {activeTab === 'crons' && (
          <CronsSection
            jobs={crons}
            loading={cronsLoading}
            triggering={triggeringCron}
            onTrigger={triggerCron}
            onRefresh={loadCrons}
          />
        )}

        {/* ═══ MEMORY TAB ═══ */}
        {activeTab === 'memory' && (
          <MemorySection
            sub={memorySub}
            onSub={setMemorySub}
            entries={memoryEntries}
            selected={selectedEntry}
            onSelect={setSelectedEntry}
            longTermContent={longTermContent}
            loading={memoryLoading}
          />
        )}
      </main>

      {/* Soul Drawer */}
      {soulAgent && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}
          onClick={() => setSoulAgent(null)}
        >
          <div style={{ flex: 1 }} />
          <div
            style={{
              width: '100%', maxWidth: 512, height: '100%',
              background: 'white', borderLeft: '1px solid #E5E7EB',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.5rem' }}>{soulAgent.emoji}</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{soulAgent.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>SOUL.md</div>
                </div>
              </div>
              <button
                onClick={() => setSoulAgent(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}
              >
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

export default function MissionControlPage() {
  return (
    <MissionControlErrorBoundary>
      <MissionControlInner />
    </MissionControlErrorBoundary>
  );
}

// ─── Alumni Section ──────────────────────────────────────────────────────────

function AlumniSection({
  data, loading, page, search, chapter, status,
  onSearch, onChapter, onStatus, onPageChange,
}: {
  data: AlumniData | null;
  loading: boolean;
  page: number;
  search: string;
  chapter: string;
  status: string;
  onSearch: (v: string) => void;
  onChapter: (v: string) => void;
  onStatus: (v: string) => void;
  onPageChange: (p: number) => void;
}) {
  const sc = data?.statusCounts ?? {};
  const total = Object.values(sc).reduce((a, b) => a + b, 0);

  const stats = [
    { label: 'Total',     value: total,                   icon: <Users size={14} style={{ color: '#6B7280' }} />,    color: '' },
    { label: 'T1 Sent',   value: sc.touch1_sent ?? 0,     icon: <MessageSquare size={14} style={{ color: '#1D4ED8' }} />, color: '' },
    { label: 'T2 Sent',   value: sc.touch2_sent ?? 0,     icon: <MessageSquare size={14} style={{ color: '#0F172A' }} />, color: '' },
    { label: 'T3 Sent',   value: sc.touch3_sent ?? 0,     icon: <MessageSquare size={14} style={{ color: '#4338CA' }} />, color: '' },
    { label: 'Confirmed', value: sc.touch1_confirmed ?? 0, icon: <CheckCircle2 size={14} style={{ color: '#B45309' }} />, color: '' },
    { label: 'Signed Up', value: sc.signed_up ?? 0,       icon: <TrendingUp size={14} style={{ color: '#10B981' }} />,   color: '' },
    { label: 'Declined',  value: sc.declined ?? 0,        icon: <X size={14} style={{ color: '#EF4444' }} />,           color: '' },
  ];

  const totalPages = Math.ceil((data?.count ?? 0) / (data?.limit ?? 50));

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} color={s.color} />
        ))}
      </div>

      {/* Filters */}
      <div className="module-actions-bar">
        <div className="module-search">
          <Search size={14} />
          <input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          {search && (
            <button className="module-search-clear" onClick={() => onSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>
        <div className="module-actions">
          <select
            className="applications-filter-select"
            value={chapter}
            onChange={(e) => onChapter(e.target.value)}
          >
            <option value="">All Chapters</option>
            {(data?.chapters ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.chapter_name}</option>
            ))}
          </select>
          <select
            className="applications-filter-select"
            value={status}
            onChange={(e) => onStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {Object.keys(STATUS_LABELS).map((k) => (
              <option key={k} value={k}>{STATUS_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="module-table-container">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
            <div>Loading…</div>
          </div>
        ) : (data?.data ?? []).length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#6B7280', fontSize: '0.875rem' }}>
            No contacts found
          </div>
        ) : (
          <table className="module-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Chapter ID</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((contact) => (
                <tr key={contact.id}>
                  <td className="module-table-name">
                    {contact.first_name} {contact.last_name}
                  </td>
                  <td style={{ color: '#6B7280', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {contact.chapter?.chapter_name ?? (contact.chapter_id ? contact.chapter_id.slice(0, 8) + '…' : '—')}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: '#6B7280' }}>
                    {contact.phone_primary ?? '—'}
                  </td>
                  <td>
                    <StatusBadge status={contact.outreach_status} />
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                    {fmtTime(contact.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.75rem 1rem', borderTop: '1px solid #E5E7EB', background: '#F9FAFB',
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
              {(data?.count ?? 0).toLocaleString()} contacts · Page {page} of {totalPages}
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                className="module-filter-btn"
                style={{ padding: '0.375rem' }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="module-filter-btn"
                style={{ padding: '0.375rem' }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Outreach Section ────────────────────────────────────────────────────────

function OutreachSection({
  data, loading, onRefresh,
}: {
  data: OutreachData | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#6B7280' }}>
        <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} /> Loading outreach data…
      </div>
    );
  }

  const lines = data?.lines ?? [];
  const stats = data?.today_stats;
  const chapters = data?.chapters ?? [];
  const batches = data?.batches ?? [];
  const inbox = data?.inbox;

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onRefresh}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            border: '1px solid #E5E7EB', background: 'white',
            fontSize: '0.875rem', color: '#6B7280', cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Line Health */}
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>Line Health</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {lines.map((line) => {
            const sentToday = line.sent_today ?? 0;
            const pct = Math.min(100, Math.round((sentToday / (line.daily_limit || 1)) * 100));
            const isActive = line.linq_status === 'active' || (!line.is_paused && line.linq_status !== 'inactive');
            const statusBg = line.is_paused ? '#FEF2F2' : isActive ? '#ECFDF5' : '#FFFBEB';
            const statusColor = line.is_paused ? '#DC2626' : isActive ? '#059669' : '#B45309';
            const statusLabel = line.is_paused ? 'Paused' : isActive ? 'Active' : 'Idle';
            return (
              <div key={line.line_number} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{line.label}</div>
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: '0.75rem', padding: '2px 8px', borderRadius: 9999,
                    background: statusBg, color: statusColor,
                  }}>
                    <Circle size={6} fill="currentColor" />
                    {statusLabel}
                  </span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280', marginBottom: 8 }}>{sentToday} / {line.daily_limit} today</div>
                <div style={{ height: 6, background: '#F3F4F6', borderRadius: 9999, overflow: 'hidden' }}>
                  <div
                    style={{ height: '100%', borderRadius: 9999, background: '#10B981', width: `${pct}%`, transition: 'width 0.3s' }}
                  />
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 4 }}>{pct}% daily cap</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's Activity */}
      {stats && (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>Today&apos;s Activity</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="T1 Sent"           value={stats.t1_sent}          icon={<MessageSquare size={14} style={{ color: '#1D4ED8' }} />} color="" />
            <StatCard label="T2 Sent"           value={stats.t2_sent}          icon={<MessageSquare size={14} style={{ color: '#0F172A' }} />} color="" />
            <StatCard label="T3 Sent"           value={stats.t3_sent}          icon={<MessageSquare size={14} style={{ color: '#4338CA' }} />} color="" />
            <StatCard label="Total Sent"        value={stats.sent}             icon={<TrendingUp size={14} style={{ color: '#10B981' }} />}    color="" />
            <StatCard label="Failed"            value={stats.failed}           icon={<AlertCircle size={14} style={{ color: '#EF4444' }} />}   color="" />
            <StatCard label="All-Time Responses" value={stats.total_responded} icon={<MessageSquare size={14} style={{ color: '#0F766E' }} />} color="" />
            <StatCard label="All-Time Signed Up" value={stats.total_signed_up} icon={<CheckCircle2 size={14} style={{ color: '#10B981' }} />} color="" />
          </div>
        </div>
      )}

      {/* Chapter Funnels */}
      {chapters.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>Chapter Funnels</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chapters.map((ch) => (
              <div key={ch.chapter_id} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 12, fontSize: '0.875rem' }}>{ch.chapter_name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Total',     value: ch.total,      barColor: '#CBD5E1' },
                    { label: 'Has Phone', value: ch.have_phone, barColor: '#93C5FD' },
                    { label: 'iMessage',  value: ch.imessage,   barColor: '#60A5FA' },
                    { label: 'Contacted', value: ch.contacted,  barColor: '#FCD34D' },
                    { label: 'Responded', value: ch.responded,  barColor: '#E5E7EB' },
                    { label: 'Signed Up', value: ch.signed_up,  barColor: '#6EE7B7' },
                  ].map((row) => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem' }}>
                      <div style={{ width: 80, color: '#6B7280', flexShrink: 0 }}>{row.label}</div>
                      <div style={{ flex: 1, height: 8, background: '#F3F4F6', borderRadius: 9999, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%', borderRadius: 9999, background: row.barColor,
                            width: ch.total > 0 ? `${Math.min(100, (row.value / ch.total) * 100)}%` : '0%',
                          }}
                        />
                      </div>
                      <div style={{ width: 32, textAlign: 'right', color: '#6B7280', fontWeight: 500 }}>{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch History */}
      {batches.length > 0 && (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>Batch History</h3>
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="hidden md:table-cell">Chapter</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contacts</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 20).map((batch, i) => {
                    const b = batch as Record<string, unknown>;
                    const batchStatus = String(b.status ?? '');
                    const statusStyle: React.CSSProperties =
                      batchStatus === 'completed'        ? { background: '#ECFDF5', color: '#059669' } :
                      batchStatus === 'pending_approval' ? { background: '#FFFBEB', color: '#B45309' } :
                      batchStatus === 'rejected'         ? { background: '#FEF2F2', color: '#DC2626' } :
                                                           { background: '#F9FAFB', color: '#374151' };
                    return (
                      <tr key={String(b.id ?? i)} style={{ borderBottom: '1px solid #F3F4F6' }}>
                        <td style={{ padding: '12px 16px', color: '#0F172A', fontFamily: 'monospace', fontSize: '0.75rem' }}>{String(b.scheduled_date ?? '—')}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: '0.75rem', ...statusStyle }}>{batchStatus || '—'}</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: '#6B7280' }} className="hidden md:table-cell">{String(b.chapter_name ?? b.chapter_id ?? 'Multi')}</td>
                        <td style={{ padding: '12px 16px', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{String(b.total_contacts ?? '—')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Response Inbox Summary */}
      {inbox && (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: 12 }}>Response Inbox</h3>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Responses" value={inbox.total}    icon={<MessageSquare size={14} style={{ color: '#1D4ED8' }} />} color="" />
            <StatCard label="Needs T2"        value={inbox.needs_t2} icon={<ArrowUpRight size={14} style={{ color: '#B45309' }} />}   color="" />
            <StatCard label="Flagged"         value={inbox.flagged}  icon={<AlertCircle size={14} style={{ color: '#EF4444' }} />}   color="" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Agents Section ──────────────────────────────────────────────────────────

function AgentsSection({
  agents, loading, viewMode, onViewMode, onViewSoul, onRefresh,
}: {
  agents: Agent[];
  loading: boolean;
  viewMode: AgentViewMode;
  onViewMode: (m: AgentViewMode) => void;
  onViewSoul: (a: Agent) => void;
  onRefresh: () => void;
}) {
  const mainAgent = agents.find((a) => a.isMain || a.id === 'main');
  const subAgents = agents.filter((a) => !a.isMain && a.id !== 'main');

  return (
    <div className="space-y-5">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 2, background: '#F3F4F6', borderRadius: 12, padding: 4 }}>
          <button
            onClick={() => onViewMode('hierarchy')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              fontSize: '0.875rem', fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: viewMode === 'hierarchy' ? 'white' : 'transparent',
              color: viewMode === 'hierarchy' ? '#0F172A' : '#6B7280',
              transition: 'all 0.15s',
            }}
          >
            <Network size={14} /> Hierarchy
          </button>
          <button
            onClick={() => onViewMode('grid')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              fontSize: '0.875rem', fontWeight: 500,
              border: 'none', cursor: 'pointer',
              background: viewMode === 'grid' ? 'white' : 'transparent',
              color: viewMode === 'grid' ? '#0F172A' : '#6B7280',
              transition: 'all 0.15s',
            }}
          >
            <LayoutGrid size={14} /> Grid
          </button>
        </div>
        <button
          onClick={onRefresh}
          style={{
            padding: 8, borderRadius: 8,
            border: '1px solid #E5E7EB', background: 'white',
            color: '#6B7280', cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#6B7280' }}>
          <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} /> Loading agents…
        </div>
      ) : viewMode === 'hierarchy' ? (
        <div>
          {mainAgent && (
            <div style={{ marginBottom: 16 }}>
              <AgentCard agent={mainAgent} onViewSoul={onViewSoul} isMain />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: 1, height: 24, background: '#E5E7EB' }} />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subAgents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onViewSoul={onViewSoul} />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onViewSoul={onViewSoul} isMain={agent.isMain} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, onViewSoul, isMain }: {
  agent: Agent;
  onViewSoul: (a: Agent) => void;
  isMain?: boolean;
}) {
  const colors = AGENT_COLOR_MAP[agent.color] ?? AGENT_COLOR_MAP.slate;
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.25rem', background: colors.bg,
          }}>
            {agent.emoji}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '0.875rem' }}>{agent.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: agent.status === 'active' ? '#34d399' : '#CBD5E1',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: '0.72rem', color: agent.status === 'active' ? '#059669' : '#6B7280' }}>
                {agent.status === 'active' ? 'Active' : 'Idle'}
              </span>
            </div>
          </div>
        </div>
        {isMain && (
          <span style={{
            fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999,
            background: '#F3F4F6', color: '#0F172A', border: '1px solid #E5E7EB', fontWeight: 600,
          }}>
            Chief
          </span>
        )}
      </div>
      <p style={{
        fontSize: '0.75rem', color: '#6B7280', lineHeight: 1.6, marginBottom: 12,
        overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical' as const, WebkitLineClamp: 2,
      } as React.CSSProperties}>
        {agent.description}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>
          {agent.lastActive ? fmtTime(agent.lastActive) : 'Never active'}
        </div>
        <button
          onClick={() => onViewSoul(agent)}
          className="module-filter-btn"
          style={{ fontSize: '0.72rem', padding: '4px 10px' }}
        >
          <BookOpen size={11} /> View Soul
        </button>
      </div>
    </div>
  );
}

// ─── Crons Section ───────────────────────────────────────────────────────────

type CronsView = 'list' | 'schedule';

// Agent badge styles (inline)
const AGENT_BADGE_STYLES: Record<string, React.CSSProperties> = {
  dev:     { background: '#EEF2FF', color: '#4338CA' },
  alumni:  { background: '#EFF6FF', color: '#1D4ED8' },
  success: { background: '#F0FDFA', color: '#0F766E' },
  gtm:     { background: '#FFFBEB', color: '#B45309' },
  main:    { background: '#F3F4F6', color: '#0F172A' },
  tony:    { background: '#F3F4F6', color: '#0F172A' },
  sales:   { background: '#ECFDF5', color: '#065F46' },
};

const DEFAULT_AGENT_STYLE: React.CSSProperties = { background: '#F9FAFB', color: '#374151' };

// Kind badge styles (inline)
const KIND_BADGE_STYLES: Record<string, React.CSSProperties> = {
  cron:  { background: '#F9FAFB', color: '#4B5563' },
  every: { background: '#EFF6FF', color: '#2563EB' },
  at:    { background: '#FFFBEB', color: '#B45309' },
};

function statusBadgeStyle(s: string | null | undefined): React.CSSProperties {
  if (s === 'success') return { background: '#ECFDF5', color: '#059669' };
  if (s === 'error')   return { background: '#FEF2F2', color: '#DC2626' };
  if (s === 'running') return { background: '#EFF6FF', color: '#2563EB' };
  if (s === 'idle')    return { background: '#F9FAFB', color: '#6B7280' };
  return { background: '#F9FAFB', color: '#374151' };
}

function CronsSection({
  jobs, loading, triggering, onTrigger, onRefresh,
}: {
  jobs: CronJob[];
  loading: boolean;
  triggering: string | null;
  onTrigger: (id: string) => void;
  onRefresh: () => void;
}) {
  const [view, setView] = React.useState<CronsView>('list');
  const [filterAgent, setFilterAgent] = React.useState('');

  const agents = [...new Set(jobs.map((j) => j.agent).filter(Boolean))] as string[];
  const filtered = filterAgent ? jobs.filter((j) => j.agent === filterAgent) : jobs;

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const upcoming = [...jobs]
    .filter((j) => j.nextRun && new Date(j.nextRun).getTime() > now && new Date(j.nextRun).getTime() < now + weekMs)
    .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime());

  const enabledCount = jobs.filter((j) => j.enabled !== false).length;
  const disabledCount = jobs.length - enabledCount;
  const errorCount = jobs.filter((j) => j.lastStatus === 'error').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: '0.875rem', color: '#6B7280' }}>
            {jobs.length} jobs
            {enabledCount > 0 && <span style={{ marginLeft: 4, color: '#059669' }}>· {enabledCount} enabled</span>}
            {disabledCount > 0 && <span style={{ marginLeft: 4, color: '#6B7280' }}>· {disabledCount} disabled</span>}
            {errorCount > 0 && <span style={{ marginLeft: 4, color: '#EF4444' }}>· {errorCount} errors</span>}
            <span style={{ marginLeft: 4 }}>· auto-refreshes 30s</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 2, background: '#F3F4F6', borderRadius: 8, padding: 2 }}>
            <button
              onClick={() => setView('list')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 6,
                fontSize: '0.75rem', fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: view === 'list' ? 'white' : 'transparent',
                color: view === 'list' ? '#0F172A' : '#6B7280',
                transition: 'all 0.15s',
              }}
            >
              <Activity size={12} /> All Jobs
            </button>
            <button
              onClick={() => setView('schedule')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 6,
                fontSize: '0.75rem', fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: view === 'schedule' ? 'white' : 'transparent',
                color: view === 'schedule' ? '#0F172A' : '#6B7280',
                transition: 'all 0.15s',
              }}
            >
              <Calendar size={12} /> Daily Schedule
            </button>
          </div>
          <button
            onClick={onRefresh}
            style={{
              padding: 8, borderRadius: 8,
              border: '1px solid #E5E7EB', background: 'white',
              color: '#6B7280', cursor: 'pointer',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && jobs.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#6B7280' }}>
          <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} /> Loading crons…
        </div>
      ) : jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#6B7280', fontSize: '0.875rem' }}>No cron jobs found</div>
      ) : view === 'schedule' ? (
        /* Daily Schedule View */
        <div className="space-y-3">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}>Coming Up — Next 7 Days</h3>
          {upcoming.length === 0 ? (
            <div style={{ color: '#6B7280', fontSize: '0.875rem', fontStyle: 'italic', padding: '32px 0', textAlign: 'center' }}>
              No upcoming runs in the next 7 days
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((job) => {
                const nextDate = new Date(job.nextRun!);
                const isToday = nextDate.toDateString() === new Date().toDateString();
                const isTomorrow = nextDate.toDateString() === new Date(now + 86400000).toDateString();
                const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : nextDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const timeLabel = nextDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago' });
                return (
                  <div key={job.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'white', border: '1px solid #E5E7EB', borderRadius: 12,
                    padding: '12px 16px',
                  }}>
                    <div style={{ width: 96, flexShrink: 0 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: isToday ? '#0F172A' : '#6B7280' }}>{dayLabel}</div>
                      <div style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#0F172A' }}>{timeLabel}</div>
                    </div>
                    <div style={{ width: 1, height: 40, background: '#E5E7EB', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: '#0F172A', fontSize: '0.875rem' }}>{job.name}</div>
                      {job.description && (
                        <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.description}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {job.agent && (
                        <span style={{
                          padding: '2px 8px', borderRadius: 9999,
                          fontSize: '0.75rem', fontWeight: 500,
                          ...(AGENT_BADGE_STYLES[job.agent.toLowerCase()] ?? DEFAULT_AGENT_STYLE),
                        }} className="hidden sm:inline">{job.agent}</span>
                      )}
                      {job.lastStatus && (
                        <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: '0.75rem', ...statusBadgeStyle(job.lastStatus) }}>
                          {job.lastStatus}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* All Jobs List View */
        <div>
          {agents.length > 1 && (
            <div style={{ marginBottom: 12 }}>
              <select
                className="applications-filter-select"
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
              >
                <option value="">All Agents</option>
                {agents.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
            <div className="overflow-x-auto">
              <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="hidden sm:table-cell">Agent</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="hidden md:table-cell">Schedule</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="hidden lg:table-cell">Next Run</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }} className="hidden lg:table-cell">Last Run</th>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((job) => (
                    <tr key={job.id} style={{ borderBottom: '1px solid #F3F4F6', opacity: job.enabled === false ? 0.6 : 1 }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontWeight: 500, color: '#0F172A', fontSize: '0.875rem' }}>{job.name}</div>
                          {job.enabled === false && (
                            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', background: '#F3F4F6', color: '#6B7280', fontWeight: 500 }}>disabled</span>
                          )}
                          {job.scheduleKind && job.scheduleKind !== 'cron' && (
                            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 500, ...(KIND_BADGE_STYLES[job.scheduleKind] ?? KIND_BADGE_STYLES.cron) }}>
                              {job.scheduleKind === 'at' ? 'one-time' : job.scheduleKind}
                            </span>
                          )}
                        </div>
                        {job.description && (
                          <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="hidden sm:block">{job.description}</div>
                        )}
                        {job.lastError && job.lastStatus === 'error' && (
                          <div style={{ fontSize: '0.75rem', color: '#EF4444', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }} className="hidden sm:block" title={job.lastError}>
                            ↳ {job.lastError.slice(0, 80)}{job.lastError.length > 80 ? '…' : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }} className="hidden sm:table-cell">
                        {job.agent && (
                          <span style={{
                            padding: '2px 8px', borderRadius: 9999,
                            fontSize: '0.75rem', fontWeight: 500,
                            ...(AGENT_BADGE_STYLES[job.agent.toLowerCase()] ?? DEFAULT_AGENT_STYLE),
                          }}>
                            {job.agent}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }} className="hidden md:table-cell">
                        <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                          {humanScheduleFromJob(job)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }} className="hidden lg:table-cell">
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 500,
                          color: job.nextRun && new Date(job.nextRun).getTime() - now < 3600000 ? '#0F172A' : '#6B7280',
                        }}>
                          {fmtNextRun(job.nextRun)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.75rem', color: '#6B7280' }} className="hidden lg:table-cell">
                        {job.lastRun ? fmtTime(job.lastRun) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {job.lastStatus ? (
                          <span style={{ padding: '2px 8px', borderRadius: 9999, fontSize: '0.75rem', ...statusBadgeStyle(job.lastStatus) }}>
                            {job.lastStatus}
                            {job.consecutiveErrors && job.consecutiveErrors > 1 ? ` ×${job.consecutiveErrors}` : ''}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => onTrigger(job.id)}
                          disabled={triggering === job.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: '0.75rem', padding: '4px 10px', borderRadius: 8,
                            background: '#F3F4F6', color: '#6B7280',
                            border: 'none', cursor: triggering === job.id ? 'not-allowed' : 'pointer',
                            opacity: triggering === job.id ? 0.5 : 1,
                            marginLeft: 'auto', transition: 'background 0.15s',
                          }}
                        >
                          {triggering === job.id ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Play size={11} />
                          )}
                          Run
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Home Tab ───────────────────────────────────────────────────────────────

interface PipelineStats {
  mrr: number;
  mrrGoal?: number;
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
    organization?: {
      name: string | null;
      school?: { name: string | null } | null;
    } | null;
  }>;
}

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  outreach: 'Outreach',
  demo_booked: 'Demo Booked',
  first_demo: 'First Demo',
  second_call: 'Decision Call',
  proposal: 'Proposal',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  hold_off: 'Hold Off',
};

const STAGE_BADGE: Record<string, { bg: string; color: string }> = {
  prospect:    { bg: '#F3F4F6', color: '#6B7280' },
  outreach:    { bg: '#EFF6FF', color: '#1D4ED8' },
  demo_booked: { bg: '#F5F3FF', color: '#6D28D9' },
  first_demo:  { bg: '#EDE9FE', color: '#5B21B6' },
  second_call: { bg: '#FEF3C7', color: '#B45309' },
  proposal:    { bg: '#ECFDF5', color: '#065F46' },
  closed_won:  { bg: '#D1FAE5', color: '#064E3B' },
  closed_lost: { bg: '#FEE2E2', color: '#991B1B' },
  hold_off:    { bg: '#F3F4F6', color: '#6B7280' },
};

const REP_NAMES: Record<string, string> = {
  owen: 'Owen',
  ford: 'Ford',
  adam: 'Adam',
};

const TEAM: Array<{ name: string; role: string; focus: string; emoji: string }> = [
  { name: 'Owen',  role: 'Co-Founder',        focus: 'Sales & strategy',          emoji: '🧠' },
  { name: 'Ford',  role: 'CS',                focus: 'Alumni calls & onboarding', emoji: '📞' },
  { name: 'Adam',  role: 'Sales',             focus: 'Outreach & lead gen',       emoji: '📬' },
  { name: 'Tony',  role: 'AI Chief of Staff', focus: 'Everything else',           emoji: '🤙' },
];

function HomeTab() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [cronsLoading, setCronsLoading] = useState(true);
  const [cronsError, setCronsError] = useState<string | null>(null);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

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
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const now = Date.now();
  const upcoming = [...crons]
    .filter((j) => j.nextRun && new Date(j.nextRun).getTime() > now)
    .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())
    .slice(0, 5);

  const INACTIVE = ['closed_lost', 'hold_off'];
  const recentDeals = (stats?.recentDeals ?? [])
    .filter((d) => !INACTIVE.includes(d.stage))
    .sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    })
    .slice(0, 5);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

      {/* ─── Left: Today's Schedule ─── */}
      <div className="space-y-4">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', margin: 0 }}>Today&apos;s Schedule</h2>

        {cronsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6B7280', fontSize: '0.875rem', padding: '16px 0' }}>
            <Loader2 size={14} className="animate-spin" /> Loading schedule…
          </div>
        ) : cronsError ? (
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#6B7280', fontStyle: 'italic' }}>{cronsError}</div>
          </div>
        ) : upcoming.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#6B7280', fontStyle: 'italic' }}>No upcoming jobs in the next 24h.</div>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.map((job) => {
              const nextDate = new Date(job.nextRun!);
              const isToday = nextDate.toDateString() === new Date().toDateString();
              const timeLabel = nextDate.toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago',
              });
              const dayLabel = isToday ? '' : nextDate.toLocaleDateString('en-US', { weekday: 'short' }) + ' ';
              return (
                <div
                  key={job.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 16px' }}
                >
                  <div style={{ width: 72, flexShrink: 0 }}>
                    <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{dayLabel || 'Today'}</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', fontFamily: 'monospace' }}>{timeLabel}</div>
                  </div>
                  <div style={{ width: 1, height: 32, background: '#E5E7EB', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.name}</div>
                    {job.agent && (
                      <div style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: 2 }}>{job.agent}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Team Activity */}
        <div style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', margin: '0 0 12px' }}>Team Activity</h2>
          <div className="space-y-2">
            {TEAM.map((member) => (
              <div
                key={member.name}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 16px' }}
              >
                <span style={{ fontSize: '1.25rem', width: 32, textAlign: 'center', flexShrink: 0 }}>{member.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>{member.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#6B7280' }}>{member.focus}</div>
                </div>
                <span style={{
                  fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999,
                  background: '#F3F4F6', color: '#6B7280', fontWeight: 500, flexShrink: 0,
                }}>{member.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Right: Office View ─── */}
      <div className="space-y-4">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', margin: 0 }}>Office View</h2>

        {statsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6B7280', fontSize: '0.875rem', padding: '16px 0' }}>
            <Loader2 size={14} className="animate-spin" /> Loading pipeline…
          </div>
        ) : stats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500, marginBottom: 4 }}>MRR</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0F172A' }}>${stats.mrr.toLocaleString()}</div>
              </div>
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500, marginBottom: 4 }}>Demos (7d)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0F172A' }}>{stats.demosNext7}</div>
              </div>
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500, marginBottom: 4 }}>Schools</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0F172A' }}>{stats.schoolsInConversation}</div>
              </div>
            </div>

            {/* Deals in motion */}
            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', margin: '0 0 8px' }}>Deals in Motion</h3>
              {recentDeals.length === 0 ? (
                <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
                  <div style={{ fontSize: '0.875rem', color: '#6B7280', fontStyle: 'italic' }}>No active deals</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentDeals.map((deal) => {
                    const stageBadge = STAGE_BADGE[deal.stage] ?? { bg: '#F3F4F6', color: '#6B7280' };
                    const stageLabel = STAGE_LABELS[deal.stage] ?? deal.stage;
                    const orgName = deal.organization?.name ?? '—';
                    const schoolName = deal.organization?.school?.name ?? null;
                    const rep = deal.assigned_to ? (REP_NAMES[deal.assigned_to.toLowerCase()] ?? deal.assigned_to) : null;
                    return (
                      <div
                        key={deal.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 16px' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: '0.875rem', color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orgName}</div>
                          {schoolName && (
                            <div style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: 1 }}>{schoolName}</div>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{
                            fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999,
                            background: stageBadge.bg, color: stageBadge.color, fontWeight: 600,
                          }}>{stageLabel}</span>
                          {rep && (
                            <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{rep}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pipeline health summary */}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', margin: '0 0 12px' }}>Pipeline Health</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Clients closed',        value: stats.closedDealCount },
                  { label: 'Demos booked (7d)',      value: stats.demosNext7 },
                  { label: 'Decision calls (7d)',    value: stats.decisionsNext7 },
                  { label: 'Schools in conversation',value: stats.schoolsInConversation },
                ].map((row) => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                    <span style={{ color: '#6B7280' }}>{row.label}</span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: '0.875rem', color: '#6B7280', fontStyle: 'italic' }}>Pipeline data unavailable.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Memory Section ──────────────────────────────────────────────────────────

function MemorySection({
  sub, onSub, entries, selected, onSelect, longTermContent, loading,
}: {
  sub: MemorySubTab;
  onSub: (s: MemorySubTab) => void;
  entries: MemoryEntry[];
  selected: MemoryEntry | null;
  onSelect: (e: MemoryEntry | null) => void;
  longTermContent: string;
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        <button
          onClick={() => onSub('daily')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            fontSize: '0.875rem', fontWeight: 500,
            border: 'none', cursor: 'pointer',
            background: sub === 'daily' ? 'white' : 'transparent',
            color: sub === 'daily' ? '#0F172A' : '#6B7280',
            transition: 'all 0.15s',
          }}
        >
          <Calendar size={14} /> Daily Notes
        </button>
        <button
          onClick={() => onSub('longterm')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8,
            fontSize: '0.875rem', fontWeight: 500,
            border: 'none', cursor: 'pointer',
            background: sub === 'longterm' ? 'white' : 'transparent',
            color: sub === 'longterm' ? '#0F172A' : '#6B7280',
            transition: 'all 0.15s',
          }}
        >
          <FileText size={14} /> Long-term Memory
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#6B7280' }}>
          <Loader2 size={20} className="animate-spin" style={{ marginRight: 8 }} /> Loading memory…
        </div>
      ) : sub === 'longterm' ? (
        <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0F172A', marginBottom: 16 }}>
            MEMORY.md — Tony&apos;s Long-term Memory
          </h3>
          {longTermContent ? (
            <div className="prose prose-sm max-w-none" style={{ color: '#0F172A' }}>
              <ReactMarkdown>{longTermContent}</ReactMarkdown>
            </div>
          ) : (
            <div style={{ color: '#6B7280', fontSize: '0.875rem', fontStyle: 'italic' }}>Memory file is empty.</div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>
          {/* Entry list */}
          <div style={{ width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entries.length === 0 ? (
              <div style={{ color: '#6B7280', fontSize: '0.875rem', fontStyle: 'italic', padding: '0 8px' }}>No daily notes found.</div>
            ) : entries.map((entry) => {
              const isSelected = selected?.date === entry.date;
              return (
                <button
                  key={entry.date}
                  onClick={() => onSelect(isSelected ? null : entry)}
                  style={{
                    width: '100%', textAlign: 'left', padding: 12, borderRadius: 12,
                    border: isSelected ? '1px solid #0F172A' : '1px solid #E5E7EB',
                    background: isSelected ? '#F3F4F6' : 'white',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 500, color: '#0F172A', fontSize: '0.875rem', fontFamily: 'monospace' }}>{entry.date}</div>
                  {entry.preview && (
                    <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>{entry.preview}</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Entry content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {selected ? (
              <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontWeight: 600, color: '#0F172A', margin: 0 }}>{selected.date}</h3>
                  <button
                    onClick={() => onSelect(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="prose prose-sm max-w-none" style={{ color: '#0F172A' }}>
                  <ReactMarkdown>{selected.content ?? ''}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: '#6B7280', fontSize: '0.875rem', fontStyle: 'italic' }}>
                Select a date to read the notes
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
