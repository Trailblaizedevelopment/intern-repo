'use client';

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
import { InsightsPanel } from './InsightsPanel';

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
  schedule: string | null;
  enabled: boolean;
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
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
          <Icon size={14} />
        </div>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 4 }}>{sub}</div>}
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

  const isDevin = profile?.email?.toLowerCase() === DEV_CONSOLE_EMAIL;

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
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 4px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '4px 4px 16px', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white' }}>
            <Brain size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>Trailblaize Brain</h1>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>
              Agent ops dashboard · chat lives in Slack
              {data?.linear_read_only === false ? ' · Linear write mode' : ' · Linear read-only'}
              {data?.rate_limits ? ` · ${data.rate_limits.per_minute}/min cap` : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {connectors.map(c => (
            <span
              key={c.id}
              title={`${c.label} — ${c.toolCount} tools`}
              style={{
                fontSize: '0.6875rem', fontWeight: 600, padding: '3px 8px', borderRadius: 999,
                background: c.available ? '#ECFDF5' : '#F3F4F6',
                color: c.available ? '#065F46' : '#9CA3AF',
              }}
            >
              {c.id} {c.available ? `(${c.toolCount})` : 'off'}
            </span>
          ))}
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
              border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: '0.8125rem',
              fontWeight: 500, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.7 : 1,
            }}
          >
            <RefreshCw size={14} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
            Refresh
          </button>
        </div>
      </div>

      {/* Slack banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 16, borderRadius: 10, background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
        <MessageSquare size={16} style={{ color: '#4338CA', flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#3730A3', lineHeight: 1.45 }}>
          Brain runs in Slack — @mention the bot or reply in a thread. This page is read-only: agent runs, tool calls, and task orchestration.
        </p>
      </div>

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
          {/* KPI row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <StatCard label="Weekly spend" value={fmtCostUsd(data.agentRunStats.costUsd7d)} sub={`${fmtCostUsd(data.agentRunStats.costUsd24h)} today · est. API cost`} icon={DollarSign} accent="#059669" />
            <StatCard label="Agent runs (24h)" value={data.agentRunStats.runs24h} sub={`${data.agentRunStats.successRate24h}% success · ${data.agentRunStats.runningNow} live`} icon={Brain} accent="#4F46E5" />
            <StatCard label="Avg / run (7d)" value={data.agentRunStats.avgCostPerRun7d != null ? fmtCostUsd(data.agentRunStats.avgCostPerRun7d) : '—'} sub={data.agentRunStats.pricingLabel} icon={Clock} accent="#2563EB" />
            <StatCard label="Tool calls (24h)" value={stats.toolCalls24h} sub={`${stats.toolSuccessRate24h}% success`} icon={Wrench} accent="#7C3AED" />
          </div>

          {/* Agent runs panel — primary view */}
          <div style={{ marginBottom: 16 }}>
            <AgentRunsPanel runs={data.recentAgentRuns} stats={data.agentRunStats} loading={refreshing} />
          </div>

          <InsightsPanel
            activityByDay={data.activityByDay}
            automations={data.automations}
            weekSpend={data.agentRunStats.costUsd7d}
          />

          {/* Main grid: tasks + activity feed */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Active & recent tasks */}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

            {/* Tool audit trail */}
            <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>Recent tool calls</span>
              </div>
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {data.recentActions.length === 0 ? (
                  <p style={{ padding: 24, margin: 0, textAlign: 'center', fontSize: '0.8125rem', color: '#9CA3AF' }}>
                    No tool calls logged yet.
                  </p>
                ) : (
                  data.recentActions.map(action => (
                    <div key={action.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: '1px solid #F3F4F6' }}>
                      {action.status === 'success' ? (
                        <CheckCircle2 size={14} style={{ color: '#059669', marginTop: 2, flexShrink: 0 }} />
                      ) : (
                        <XCircle size={14} style={{ color: '#DC2626', marginTop: 2, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#374151' }}>
                            {action.connector_name ? `${action.connector_name}:` : ''}{action.skill_name.replace(/^linear_/, '')}
                          </span>
                          <span style={{ fontSize: '0.625rem', padding: '1px 6px', borderRadius: 999, background: '#F3F4F6', color: '#6B7280' }}>{action.source}</span>
                        </div>
                        {action.error && (
                          <p style={{ margin: '2px 0 0', fontSize: '0.6875rem', color: '#991B1B' }}>{action.error.slice(0, 100)}</p>
                        )}
                      </div>
                      <span style={{ fontSize: '0.6875rem', color: '#9CA3AF', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={10} /> {fmtRelative(action.created_at)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
