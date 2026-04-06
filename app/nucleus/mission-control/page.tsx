'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Radar, Users, Bot, Clock, Brain, Search, Filter, RefreshCw,
  ChevronLeft, ChevronRight, LayoutGrid, Network, X, Activity,
  CheckCircle2, AlertCircle, Circle, Play, Phone, MessageSquare,
  TrendingUp, ArrowUpRight, BookOpen, FileText, Calendar,
  ToggleLeft, ToggleRight, Loader2, ChevronDown,
  ArrowLeft, LayoutDashboard,
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

// ─── Types ──────────────────────────────────────────────────────────────────

type MainTab = 'alumni' | 'agents' | 'crons' | 'memory';
type OutreachSubTab = 'alumni' | 'outreach';
type AgentViewMode = 'hierarchy' | 'grid';
type MemorySubTab = 'daily' | 'longterm';

interface AlumniContact {
  id: string;
  first_name: string;
  last_name: string;
  chapter_id: string | null;
  phone_primary: string | null;
  outreach_status: string;
  updated_at: string;
}

interface AlumniData {
  data: AlumniContact[];
  count: number;
  chapters: string[];
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
  schedule?: string;
  nextRun?: string;
  lastRun?: string;
  lastStatus?: string;
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
  violet: { bg: '#f5f3ff', text: '#6d28d9' },
  amber:  { bg: '#fffbeb', text: '#b45309' },
  emerald:{ bg: '#ecfdf5', text: '#065f46' },
  blue:   { bg: '#eff6ff', text: '#1d4ed8' },
  teal:   { bg: '#f0fdfa', text: '#0f766e' },
  indigo: { bg: '#eef2ff', text: '#4338ca' },
  pink:   { bg: '#fdf2f8', text: '#be185d' },
  cyan:   { bg: '#ecfeff', text: '#0e7490' },
  slate:  { bg: '#f8fafc', text: '#475569' },
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
    return `Daily at ${hour}:00`;
  }
  if (min !== '*' && hour !== '*' && dom === '*') {
    return `Daily at ${hour}:${min.padStart(2, '0')}`;
  }
  return cron;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { color: string; bg: string }> = {
  not_contacted:   { color: '#6b7280', bg: '#f3f4f6' },
  touch1_sent:     { color: '#1d4ed8', bg: '#dbeafe' },
  touch1_confirmed:{ color: '#b45309', bg: '#fef3c7' },
  touch2_sent:     { color: '#6d28d9', bg: '#ede9fe' },
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
  color: string; // kept for backward compat but unused
}) {
  void color;
  return (
    <div className="module-stat" style={{ flexDirection: 'row', gap: '0.75rem', alignItems: 'center' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, background: '#F0EDE8', color: '#C4874A',
      }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', color: '#8C7B6B', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <div className="module-stat-value" style={{ fontSize: '1.2rem' }}>{value}</div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MissionControlPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('alumni');
  const [outreachSub, setOutreachSub] = useState<OutreachSubTab>('alumni');

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
    { key: 'alumni',  label: 'Alumni & Outreach', icon: <Users size={15} /> },
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
            <div className="module-icon" style={{ backgroundColor: '#7c3aed15', color: '#7c3aed' }}>
              <Radar size={24} />
            </div>
            <div>
              <h1>Mission Control</h1>
              <p>Founder command center — agents, outreach, memory</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 px-6 pb-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.key
                  ? 'bg-[#F0EDE8] text-[#2D2A26]'
                  : 'text-[#8C7B6B] hover:text-[#2D2A26] hover:bg-[#F7F5F2]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/* Content */}
      <main className="module-main">

        {/* ═══ ALUMNI & OUTREACH TAB ═══ */}
        {activeTab === 'alumni' && (
          <div>
            {/* Sub-tabs */}
            <div className="flex gap-1 mb-6 bg-[#F0EDE8] rounded-xl p-1 w-fit">
              {(['alumni', 'outreach'] as OutreachSubTab[]).map((sub) => (
                <button
                  key={sub}
                  onClick={() => setOutreachSub(sub)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                    outreachSub === sub ? 'bg-white text-[#2D2A26] shadow-sm' : 'text-[#8C7B6B] hover:text-[#2D2A26]'
                  }`}
                >
                  {sub === 'alumni' ? 'Alumni Contacts' : 'Outreach Dashboard'}
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
        <div className="fixed inset-0 z-50 flex" onClick={() => setSoulAgent(null)}>
          <div className="flex-1" />
          <div
            className="w-full max-w-lg h-full bg-white border-l border-[#E8E4DC] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E4DC]">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{soulAgent.emoji}</span>
                <div>
                  <div className="font-semibold text-[#2D2A26]" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>
                    {soulAgent.name}
                  </div>
                  <div className="text-xs text-[#8C7B6B]">SOUL.md</div>
                </div>
              </div>
              <button onClick={() => setSoulAgent(null)} className="text-[#8C7B6B] hover:text-[#2D2A26]">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">
              {soulLoading ? (
                <div className="flex items-center gap-2 text-[#8C7B6B]">
                  <Loader2 size={16} className="animate-spin" /> Loading soul…
                </div>
              ) : soulContent ? (
                <div className="prose prose-sm max-w-none text-[#2D2A26]">
                  <ReactMarkdown>{soulContent}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-[#8C7B6B] text-sm italic">No SOUL.md found for this agent.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
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
    { label: 'Total', value: total, icon: <Users size={14} className="text-slate-500" />, color: 'bg-slate-50' },
    { label: 'T1 Sent', value: sc.touch1_sent ?? 0, icon: <MessageSquare size={14} className="text-blue-500" />, color: 'bg-blue-50' },
    { label: 'T2 Sent', value: sc.touch2_sent ?? 0, icon: <MessageSquare size={14} className="text-violet-500" />, color: 'bg-violet-50' },
    { label: 'T3 Sent', value: sc.touch3_sent ?? 0, icon: <MessageSquare size={14} className="text-indigo-500" />, color: 'bg-indigo-50' },
    { label: 'Confirmed', value: sc.touch1_confirmed ?? 0, icon: <CheckCircle2 size={14} className="text-amber-500" />, color: 'bg-amber-50' },
    { label: 'Signed Up', value: sc.signed_up ?? 0, icon: <TrendingUp size={14} className="text-emerald-500" />, color: 'bg-emerald-50' },
    { label: 'Declined', value: sc.declined ?? 0, icon: <X size={14} className="text-red-500" />, color: 'bg-red-50' },
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
              <option key={c} value={c}>{c}</option>
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
          <div style={{ padding: '3rem', textAlign: 'center', color: '#8C7B6B' }}>
            <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem' }} />
            <div>Loading…</div>
          </div>
        ) : (data?.data ?? []).length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#8C7B6B', fontSize: '0.875rem' }}>
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
                  <td style={{ color: '#5C5245', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {contact.chapter_id ? contact.chapter_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: '#5C5245' }}>
                    {contact.phone_primary ?? '—'}
                  </td>
                  <td>
                    <StatusBadge status={contact.outreach_status} />
                  </td>
                  <td style={{ fontSize: '0.75rem', color: '#8C7B6B' }}>
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
            padding: '0.75rem 1rem', borderTop: '1px solid #E8E4DC', background: '#FAFAF8',
          }}>
            <div style={{ fontSize: '0.75rem', color: '#8C7B6B' }}>
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
      <div className="flex items-center justify-center py-20 text-[#8C7B6B]">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading outreach data…
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
      <div className="flex justify-end">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8E4DC] text-sm text-[#8C7B6B] hover:bg-white transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Line Health */}
      <div>
        <h3 className="text-base font-semibold text-[#2D2A26] mb-3" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>Line Health</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {lines.map((line) => {
            const sentToday = line.sent_today ?? 0;
            const pct = Math.min(100, Math.round((sentToday / (line.daily_limit || 1)) * 100));
            const isActive = line.linq_status === 'active' || (!line.is_paused && line.linq_status !== 'inactive');
            return (
              <div key={line.line_number} className="bg-white border border-[#E8E4DC] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-[#2D2A26]">{line.label}</div>
                  <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                    line.is_paused ? 'bg-red-50 text-red-600' :
                    isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    <Circle size={6} fill="currentColor" />
                    {line.is_paused ? 'Paused' : isActive ? 'Active' : 'Idle'}
                  </span>
                </div>
                <div className="text-xs text-[#8C7B6B] mb-2">{sentToday} / {line.daily_limit} today</div>
                <div className="h-1.5 bg-[#F0EDE8] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-xs text-[#B0A89A] mt-1">{pct}% daily cap</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Today's Activity */}
      {stats && (
        <div>
          <h3 className="text-base font-semibold text-[#2D2A26] mb-3" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>Today&apos;s Activity</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="T1 Sent" value={stats.t1_sent} icon={<MessageSquare size={14} className="text-blue-500" />} color="bg-blue-50" />
            <StatCard label="T2 Sent" value={stats.t2_sent} icon={<MessageSquare size={14} className="text-violet-500" />} color="bg-violet-50" />
            <StatCard label="T3 Sent" value={stats.t3_sent} icon={<MessageSquare size={14} className="text-indigo-500" />} color="bg-indigo-50" />
            <StatCard label="Total Sent" value={stats.sent} icon={<TrendingUp size={14} className="text-emerald-500" />} color="bg-emerald-50" />
            <StatCard label="Failed" value={stats.failed} icon={<AlertCircle size={14} className="text-red-500" />} color="bg-red-50" />
            <StatCard label="All-Time Responses" value={stats.total_responded} icon={<MessageSquare size={14} className="text-teal-500" />} color="bg-teal-50" />
            <StatCard label="All-Time Signed Up" value={stats.total_signed_up} icon={<CheckCircle2 size={14} className="text-emerald-500" />} color="bg-emerald-50" />
          </div>
        </div>
      )}

      {/* Chapter Funnels */}
      {chapters.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-[#2D2A26] mb-3" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>Chapter Funnels</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chapters.map((ch) => (
              <div key={ch.chapter_id} className="bg-white border border-[#E8E4DC] rounded-xl p-4">
                <div className="font-semibold text-[#2D2A26] mb-3 text-sm">{ch.chapter_name}</div>
                <div className="space-y-1.5 text-xs">
                  {[
                    { label: 'Total', value: ch.total, color: 'bg-slate-200' },
                    { label: 'Has Phone', value: ch.have_phone, color: 'bg-blue-200' },
                    { label: 'iMessage', value: ch.imessage, color: 'bg-blue-300' },
                    { label: 'Contacted', value: ch.contacted, color: 'bg-amber-200' },
                    { label: 'Responded', value: ch.responded, color: 'bg-violet-200' },
                    { label: 'Signed Up', value: ch.signed_up, color: 'bg-emerald-300' },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2">
                      <div className="w-20 text-[#8C7B6B] flex-shrink-0">{row.label}</div>
                      <div className="flex-1 h-2 bg-[#F0EDE8] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.color}`}
                          style={{ width: ch.total > 0 ? `${Math.min(100, (row.value / ch.total) * 100)}%` : '0%' }}
                        />
                      </div>
                      <div className="w-8 text-right text-[#5C5245] font-medium">{row.value}</div>
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
          <h3 className="text-base font-semibold text-[#2D2A26] mb-3" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>Batch History</h3>
          <div className="bg-white border border-[#E8E4DC] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E4DC] bg-[#FAFAF8]">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide hidden md:table-cell">Chapter</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide">Contacts</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.slice(0, 20).map((batch, i) => {
                    const b = batch as Record<string, unknown>;
                    return (
                      <tr key={String(b.id ?? i)} className="border-b border-[#F0EDE8] hover:bg-[#FAFAF8]">
                        <td className="px-4 py-3 text-[#2D2A26] font-mono text-xs">{String(b.scheduled_date ?? '—')}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            b.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                            b.status === 'pending_approval' ? 'bg-amber-50 text-amber-700' :
                            b.status === 'rejected' ? 'bg-red-50 text-red-700' :
                            'bg-slate-50 text-slate-700'
                          }`}>{String(b.status ?? '—')}</span>
                        </td>
                        <td className="px-4 py-3 text-[#5C5245] hidden md:table-cell">{String(b.chapter_name ?? b.chapter_id ?? 'Multi')}</td>
                        <td className="px-4 py-3 text-[#2D2A26] tabular-nums">{String(b.total_contacts ?? '—')}</td>
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
          <h3 className="text-base font-semibold text-[#2D2A26] mb-3" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>Response Inbox</h3>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Total Responses" value={inbox.total} icon={<MessageSquare size={14} className="text-blue-500" />} color="bg-blue-50" />
            <StatCard label="Needs T2" value={inbox.needs_t2} icon={<ArrowUpRight size={14} className="text-amber-500" />} color="bg-amber-50" />
            <StatCard label="Flagged" value={inbox.flagged} icon={<AlertCircle size={14} className="text-red-500" />} color="bg-red-50" />
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
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-[#F0EDE8] rounded-xl p-1">
          <button
            onClick={() => onViewMode('hierarchy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'hierarchy' ? 'bg-white text-[#2D2A26] shadow-sm' : 'text-[#8C7B6B]'
            }`}
          >
            <Network size={14} /> Hierarchy
          </button>
          <button
            onClick={() => onViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              viewMode === 'grid' ? 'bg-white text-[#2D2A26] shadow-sm' : 'text-[#8C7B6B]'
            }`}
          >
            <LayoutGrid size={14} /> Grid
          </button>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-lg border border-[#E8E4DC] text-[#8C7B6B] hover:bg-white">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#8C7B6B]">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading agents…
        </div>
      ) : viewMode === 'hierarchy' ? (
        <div>
          {/* Main agent */}
          {mainAgent && (
            <div className="mb-4">
              <AgentCard agent={mainAgent} onViewSoul={onViewSoul} isMain />
              {/* Connector */}
              <div className="flex justify-center">
                <div className="w-px h-6 bg-[#E8E4DC]" />
              </div>
            </div>
          )}
          {/* Sub agents */}
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
    <div style={{
      background: 'white',
      border: `1px solid ${isMain ? '#c4b5fd' : '#E8E4DC'}`,
      borderRadius: 12,
      padding: '1rem',
      boxShadow: isMain ? '0 1px 4px rgba(109,40,217,0.08)' : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.25rem', background: colors.bg,
          }}>
            {agent.emoji}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#2D2A26', fontSize: '0.875rem' }}>{agent.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: agent.status === 'active' ? '#34d399' : '#cbd5e1',
                display: 'inline-block',
              }} />
              <span style={{ fontSize: '0.72rem', color: agent.status === 'active' ? '#059669' : '#8C7B6B' }}>
                {agent.status === 'active' ? 'Active' : 'Idle'}
              </span>
            </div>
          </div>
        </div>
        {isMain && (
          <span style={{
            fontSize: '0.72rem', padding: '2px 8px', borderRadius: 9999,
            background: '#f5f3ff', color: '#6d28d9', border: '1px solid #c4b5fd', fontWeight: 600,
          }}>
            Chief
          </span>
        )}
      </div>
      <p style={{ fontSize: '0.75rem', color: '#8C7B6B', lineHeight: 1.6, marginBottom: '0.75rem',
        overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical' as const, WebkitLineClamp: 2 } as React.CSSProperties}>
        {agent.description}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: '0.72rem', color: '#B0A89A' }}>
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

function CronsSection({
  jobs, loading, triggering, onTrigger, onRefresh,
}: {
  jobs: CronJob[];
  loading: boolean;
  triggering: string | null;
  onTrigger: (id: string) => void;
  onRefresh: () => void;
}) {
  const AGENT_BADGE: Record<string, string> = {
    dev: 'bg-indigo-50 text-indigo-700',
    alumni: 'bg-blue-50 text-blue-700',
    success: 'bg-teal-50 text-teal-700',
    gtm: 'bg-amber-50 text-amber-700',
    main: 'bg-violet-50 text-violet-700',
    tony: 'bg-violet-50 text-violet-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#8C7B6B]">{jobs.length} jobs · auto-refreshes every 30s</div>
        <button onClick={onRefresh} className="p-2 rounded-lg border border-[#E8E4DC] text-[#8C7B6B] hover:bg-white">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-[#8C7B6B]">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading crons…
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 text-[#8C7B6B] text-sm">No cron jobs found</div>
      ) : (
        <div className="bg-white border border-[#E8E4DC] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E4DC] bg-[#FAFAF8]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide hidden sm:table-cell">Agent</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide hidden md:table-cell">Schedule</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide hidden lg:table-cell">Next Run</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide hidden lg:table-cell">Last Run</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-[#8C7B6B] uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-[#F0EDE8] hover:bg-[#FAFAF8]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#2D2A26] text-sm">{job.name}</div>
                      {job.description && (
                        <div className="text-xs text-[#8C7B6B] mt-0.5 hidden sm:block">{job.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {job.agent && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          AGENT_BADGE[job.agent.toLowerCase()] ?? 'bg-slate-50 text-slate-700'
                        }`}>
                          {job.agent}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono text-xs text-[#5C5245]">
                        {job.schedule ? humanSchedule(job.schedule) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-[#8C7B6B]">
                      {job.nextRun ? fmtTime(job.nextRun) : '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-[#8C7B6B]">
                      {job.lastRun ? fmtTime(job.lastRun) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {job.lastStatus ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          job.lastStatus === 'success' ? 'bg-emerald-50 text-emerald-700' :
                          job.lastStatus === 'error' ? 'bg-red-50 text-red-700' :
                          job.lastStatus === 'running' ? 'bg-blue-50 text-blue-700' :
                          'bg-slate-50 text-slate-700'
                        }`}>
                          {job.lastStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-[#B0A89A]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onTrigger(job.id)}
                        disabled={triggering === job.id}
                        className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-[#F0EDE8] text-[#5C5245] hover:bg-[#E8E4DC] transition-colors disabled:opacity-50 ml-auto"
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
      )}
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
      <div className="flex gap-1 bg-[#F0EDE8] rounded-xl p-1 w-fit">
        <button
          onClick={() => onSub('daily')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            sub === 'daily' ? 'bg-white text-[#2D2A26] shadow-sm' : 'text-[#8C7B6B]'
          }`}
        >
          <Calendar size={14} /> Daily Notes
        </button>
        <button
          onClick={() => onSub('longterm')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            sub === 'longterm' ? 'bg-white text-[#2D2A26] shadow-sm' : 'text-[#8C7B6B]'
          }`}
        >
          <FileText size={14} /> Long-term Memory
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#8C7B6B]">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading memory…
        </div>
      ) : sub === 'longterm' ? (
        <div className="bg-white border border-[#E8E4DC] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-[#2D2A26] mb-4" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>
            MEMORY.md — Tony&apos;s Long-term Memory
          </h3>
          {longTermContent ? (
            <div className="prose prose-sm max-w-none text-[#2D2A26]">
              <ReactMarkdown>{longTermContent}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-[#8C7B6B] text-sm italic">Memory file is empty.</div>
          )}
        </div>
      ) : (
        <div className="flex gap-5">
          {/* Entry list */}
          <div className="w-64 flex-shrink-0 space-y-2">
            {entries.length === 0 ? (
              <div className="text-[#8C7B6B] text-sm italic px-2">No daily notes found.</div>
            ) : entries.map((entry) => (
              <button
                key={entry.date}
                onClick={() => onSelect(selected?.date === entry.date ? null : entry)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selected?.date === entry.date
                    ? 'border-violet-200 bg-violet-50'
                    : 'border-[#E8E4DC] bg-white hover:bg-[#FAFAF8]'
                }`}
              >
                <div className="font-medium text-[#2D2A26] text-sm font-mono">{entry.date}</div>
                {entry.preview && (
                  <div className="text-xs text-[#8C7B6B] mt-0.5 line-clamp-2">{entry.preview}</div>
                )}
              </button>
            ))}
          </div>

          {/* Entry content */}
          <div className="flex-1 min-w-0">
            {selected ? (
              <div className="bg-white border border-[#E8E4DC] rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#2D2A26]" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>
                    {selected.date}
                  </h3>
                  <button onClick={() => onSelect(null)} className="text-[#8C7B6B] hover:text-[#2D2A26]">
                    <X size={16} />
                  </button>
                </div>
                <div className="prose prose-sm max-w-none text-[#2D2A26]">
                  <ReactMarkdown>{selected.content}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-[#8C7B6B] text-sm italic">
                Select a date to read the notes
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
