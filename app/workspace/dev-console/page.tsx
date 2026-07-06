'use client';

import './dev-console.css';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import type { BrainAgentRunWithCost } from '@/lib/brain/dashboard';
import { fmtCostUsd } from '@/lib/brain/pricing';
import type { BrainTaskRow, BrainTaskStatus } from '@/lib/brain/tasks/types';
import { AgentRunsPanel, type AgentRunStats } from './AgentRunsPanel';
import { BrainRoomView } from './BrainRoomView';
import { GuideView } from './GuideView';
import { InsightsPanel } from './InsightsPanel';
import { ViewSwitcher, loadSavedView, saveView, type ConsoleView } from './ViewSwitcher';

const DEV_CONSOLE_EMAIL = 'devin@trailblaize.net';
const REFRESH_MS = 30_000;

interface ConnectorStatus {
  id: string;
  label: string;
  available: boolean;
  toolCount: number;
}

interface ActionRow {
  id: string;
  source: string;
  skill_name: string;
  connector_name: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

interface AutomationRow {
  id: string;
  name: string;
  kind: string;
  schedule: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

interface DashboardStats {
  activeTasks: number;
  completedToday: number;
  failedToday: number;
  toolCalls24h: number;
  toolSuccessRate24h: number;
  slackThreads: number;
  conversationsActive24h: number;
}

interface ActivityDay {
  date: string;
  toolCalls: number;
  tasksCompleted: number;
  agentRuns: number;
  costUsd: number;
}

interface DashboardData {
  stats: DashboardStats;
  agentRunStats: AgentRunStats;
  activeTasks: BrainTaskRow[];
  recentTasks: BrainTaskRow[];
  recentActions: ActionRow[];
  recentAgentRuns: BrainAgentRunWithCost[];
  automations: AutomationRow[];
  activityByDay: ActivityDay[];
  connectors: ConnectorStatus[];
  linear_read_only?: boolean;
  rate_limits?: { per_minute: number; per_hour: number };
}

const STATUS_STYLE: Record<BrainTaskStatus, { bg: string; color: string; label: string }> = {
  queued: { bg: '#F3F4F6', color: '#374151', label: 'Queued' },
  planning: { bg: '#EEF2FF', color: '#4338CA', label: 'Planning' },
  running: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Running' },
  blocked: { bg: '#FEF3C7', color: '#B45309', label: 'Blocked' },
  awaiting_approval: { bg: '#FDF4FF', color: '#7E22CE', label: 'Awaiting approval' },
  completed: { bg: '#ECFDF5', color: '#065F46', label: 'Completed' },
  failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Failed' },
  cancelled: { bg: '#F3F4F6', color: '#6B7280', label: 'Cancelled' },
};

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatusPill({ status }: { status: BrainTaskStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.queued;
  return (
    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent }: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="dev-console-kpi-item" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', flex: 1, minWidth: 140 }}>
      <div className="dev-console-kpi-label-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="dev-console-kpi-label" style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <div className="dev-console-kpi-icon" style={{ width: 28, height: 28, borderRadius: 8, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          <Icon size={14} />
        </div>
      </div>
      <div className="dev-console-kpi-value" style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="dev-console-kpi-sub" style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function ConnectorStrip({ connectors, className }: { connectors: ConnectorStatus[]; className?: string }) {
  if (connectors.length === 0) return null;
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        overflow: 'hidden',
        flex: 1,
      }}
      title="Connected integrations and available tools"
    >
      <span
        style={{
          fontSize: '0.625rem',
          fontWeight: 600,
          color: '#9CA3AF',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        Integrations
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, overflow: 'hidden' }}>
        {connectors.map(c => (
          <span
            key={c.id}
            title={`${c.label}${c.available ? ` · ${c.toolCount} tools` : ' · offline'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              flexShrink: 0,
              fontSize: '0.6875rem',
              color: c.available ? '#4B5563' : '#9CA3AF',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flexShrink: 0,
                background: c.available ? '#111827' : '#E5E7EB',
                boxShadow: c.available ? '0 0 0 2px #F3F4F6' : undefined,
              }}
            />
            <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{c.id}</span>
            {c.available && (
              <span style={{ color: '#9CA3AF', fontVariantNumeric: 'tabular-nums' }}>{c.toolCount}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function TaskRow({ task, expanded, onToggle }: { task: BrainTaskRow; expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: '1px solid #F3F4F6' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <ChevronRight
          size={14}
          style={{ marginTop: 3, flexShrink: 0, color: '#9CA3AF', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <StatusPill status={task.status} />
            {task.source === 'slack' && (
              <span style={{ fontSize: '0.625rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 3 }}>
                <MessageSquare size={10} /> slack
              </span>
            )}
            {task.linear_issue_id && (
              <span style={{ fontSize: '0.625rem', color: '#4338CA', fontWeight: 600 }}>{task.linear_issue_id}</span>
            )}
            <span style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginLeft: 'auto' }}>{fmtRelative(task.updated_at)}</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#374151', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: expanded ? undefined : 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
            {task.goal}
          </p>
          {task.cursor_pr_url && (
            <a
              href={task.cursor_pr_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6875rem', color: '#4F46E5', marginTop: 6, textDecoration: 'none' }}
            >
              <ExternalLink size={11} /> PR
            </a>
          )}
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 14px 12px 38px', fontSize: '0.75rem', color: '#6B7280' }}>
          {task.result_summary && <p style={{ margin: '0 0 8px', color: '#374151' }}>{task.result_summary}</p>}
          {task.error && <p style={{ margin: '0 0 8px', color: '#991B1B' }}>{task.error}</p>}
          {task.log?.length > 0 && (
            <div style={{ background: '#F9FAFB', borderRadius: 8, padding: '8px 10px', maxHeight: 160, overflowY: 'auto' }}>
              {task.log.slice(-8).map((entry, i) => (
                <div key={i} style={{ marginBottom: 4, fontFamily: 'ui-monospace, monospace', fontSize: '0.6875rem' }}>
                  <span style={{ color: '#9CA3AF' }}>{entry.at.slice(11, 19)}</span>{' '}
                  <span style={{ color: entry.kind === 'error' ? '#991B1B' : '#4338CA' }}>[{entry.kind}]</span>{' '}
                  {entry.message.slice(0, 120)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DevConsolePage() {
  const { profile, session, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [consoleView, setConsoleView] = useState<ConsoleView>('dashboard');

  const isDevin = profile?.email?.toLowerCase() === DEV_CONSOLE_EMAIL;

  useEffect(() => {
    setConsoleView(loadSavedView());
  }, []);

  const handleViewChange = useCallback((view: ConsoleView) => {
    setConsoleView(view);
    saveView(view);
  }, []);

  useEffect(() => {
    if (!authLoading && profile && !isDevin) {
      router.replace('/workspace');
    }
  }, [authLoading, profile, isDevin, router]);

  const authHeaders = useCallback((): Record<string, string> => {
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  }, [session]);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!session?.access_token || !isDevin) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/brain/dashboard', { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Failed to load (${res.status})`);
        return;
      }
      setData(json);
    } catch {
      setError('Network error loading dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session, isDevin, authHeaders]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const id = setInterval(() => loadDashboard(true), REFRESH_MS);
    return () => clearInterval(id);
  }, [loadDashboard]);

  if (authLoading || (profile && !isDevin)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#6B7280' }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const stats = data?.stats;
  const connectors = data?.connectors ?? [];

  return (
    <div className="dev-console" style={{ maxWidth: 1080, margin: '0 auto', padding: '0 4px 32px' }}>
      <header
        className="dev-console-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '6px 4px 14px',
          flexWrap: 'nowrap',
        }}
      >
        <div className="dev-console-header-brand dev-console-header-title-block" style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
          <h1
            style={{
              margin: 0,
              fontSize: '0.9375rem',
              fontWeight: 700,
              color: '#111827',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}
          >
            <span className="dev-console-title-full">Trailblaize Brain</span>
            <span className="dev-console-title-short">Brain</span>
          </h1>
          <div className="dev-console-header-divider" style={{ width: 1, height: 18, background: '#E5E7EB', flexShrink: 0 }} aria-hidden />
          <ConnectorStrip connectors={connectors} className="dev-console-integrations" />
          <button
            type="button"
            className="dev-console-refresh-brand"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            aria-label="Refresh dashboard"
            title="Refresh"
          >
            <RefreshCw size={15} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
        </div>

        <div className="dev-console-header-actions dev-console-header-controls" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <ViewSwitcher value={consoleView} onChange={handleViewChange} className="dev-console-view-switcher" />
          <button
            type="button"
            className="dev-console-refresh-actions"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            aria-label="Refresh dashboard"
            title="Refresh"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: '50%',
              border: '1px solid #E5E7EB',
              background: 'white',
              color: '#6B7280',
              cursor: refreshing ? 'default' : 'pointer',
              opacity: refreshing ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            <RefreshCw size={15} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '10px 14px', marginBottom: 16, borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '0.8125rem' }}>
          {error}
        </div>
      )}

      {loading && !data ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: '#9CA3AF', fontSize: '0.875rem' }}>
          <Loader2 size={18} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} /> Loading dashboard…
        </div>
      ) : data && stats ? (
        <>
          {consoleView === 'dashboard' && (
            <>
              <div className="dev-console-kpi-grid" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatCard label="Weekly spend" value={fmtCostUsd(data.agentRunStats.costUsd7d)} sub={`${fmtCostUsd(data.agentRunStats.costUsd24h)} today · est. API cost`} icon={DollarSign} accent="#059669" />
                <StatCard label="Agent runs (24h)" value={data.agentRunStats.runs24h} sub={`${data.agentRunStats.successRate24h}% success · ${data.agentRunStats.runningNow} live`} icon={Brain} accent="#4F46E5" />
                <StatCard label="Avg / run (7d)" value={data.agentRunStats.avgCostPerRun7d != null ? fmtCostUsd(data.agentRunStats.avgCostPerRun7d) : '—'} sub={data.agentRunStats.pricingLabel} icon={Clock} accent="#2563EB" />
                <StatCard label="Tool calls (24h)" value={stats.toolCalls24h} sub={`${stats.toolSuccessRate24h}% success`} icon={Wrench} accent="#7C3AED" />
              </div>

              <div className="dev-console-section-gap" style={{ marginBottom: 16 }}>
                <AgentRunsPanel runs={data.recentAgentRuns} stats={data.agentRunStats} loading={refreshing} />
              </div>

              <InsightsPanel
                activityByDay={data.activityByDay}
                automations={data.automations}
                weekSpend={data.agentRunStats.costUsd7d}
                authHeaders={authHeaders}
                onAutomationsChange={automations =>
                  setData(prev => (prev ? { ...prev, automations } : prev))
                }
              />

              <div className="dev-console-bottom-grid dev-console-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="dev-console-bottom-panel dev-console-panel" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
                  <div className="dev-console-bottom-panel-head dev-console-panel-head" style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>Orchestration tasks</span>
                    <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>{data.recentTasks.length} recent</span>
                  </div>
                  {data.recentTasks.length === 0 ? (
                    <p style={{ padding: 24, margin: 0, textAlign: 'center', fontSize: '0.8125rem', color: '#9CA3AF' }}>
                      No orchestration tasks yet. Ask Brain in Slack to start durable work.
                    </p>
                  ) : (
                    data.recentTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        expanded={expandedTaskId === task.id}
                        onToggle={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      />
                    ))
                  )}
                </div>

                <div className="dev-console-bottom-panel dev-console-panel" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
                  <div className="dev-console-bottom-panel-head dev-console-panel-head" style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>Recent tool calls</span>
                  </div>
                  <div className="dev-console-tool-list" style={{ maxHeight: 480, overflowY: 'auto' }}>
                    {data.recentActions.length === 0 ? (
                      <p style={{ padding: 24, margin: 0, textAlign: 'center', fontSize: '0.8125rem', color: '#9CA3AF' }}>
                        No tool calls logged yet.
                      </p>
                    ) : (
                      data.recentActions.map(action => (
                        <div key={action.id} className="dev-console-tool-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid #F3F4F6' }}>
                          <div className="dev-console-tool-row-icon">
                            {action.status === 'success' ? (
                              <CheckCircle2 size={14} style={{ color: '#059669', marginTop: 2, flexShrink: 0 }} />
                            ) : (
                              <XCircle size={14} style={{ color: '#DC2626', marginTop: 2, flexShrink: 0 }} />
                            )}
                          </div>
                          <div className="dev-console-tool-row-body" style={{ flex: 1, minWidth: 0 }}>
                            <div className="dev-console-tool-row-main" style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                              <span className="dev-console-tool-row-name" style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#374151' }}>
                                {action.connector_name ? `${action.connector_name}:` : ''}{action.skill_name.replace(/^linear_/, '')}
                              </span>
                              <span className="dev-console-tool-row-source" style={{ fontSize: '0.625rem', padding: '1px 6px', borderRadius: 999, background: '#F3F4F6', color: '#6B7280', flexShrink: 0 }}>{action.source}</span>
                            </div>
                            {action.error && (
                              <p className="dev-console-tool-row-error" style={{ margin: '2px 0 0', fontSize: '0.6875rem', color: '#991B1B' }}>{action.error.slice(0, 100)}</p>
                            )}
                            <span className="dev-console-tool-row-time" style={{ fontSize: '0.6875rem', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Clock size={10} /> {fmtRelative(action.created_at)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {consoleView === 'brain-room' && (
            <BrainRoomView
              agentRunStats={data.agentRunStats}
              activeTasks={stats.activeTasks}
              connectors={connectors}
              runningNow={data.agentRunStats.runningNow}
            />
          )}

          {consoleView === 'guide' && (
            <GuideView
              connectors={connectors}
              automations={data.automations}
              linearReadOnly={data.linear_read_only !== false}
              rateLimits={data.rate_limits}
            />
          )}
        </>
      ) : null}

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
