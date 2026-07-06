'use client';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Loader2,
  MessageSquare,
  Monitor,
  XCircle,
  Zap,
} from 'lucide-react';
import type { BrainAgentRunRow } from '@/lib/brain/agent-runs';

export interface AgentRunStats {
  runs24h: number;
  successRate24h: number;
  avgLatencyMs24h: number | null;
  totalTokens24h: number;
  runningNow: number;
  bySurface24h: Record<string, number>;
}

type SurfaceFilter = 'all' | 'slack' | 'workspace' | 'task';

const SURFACE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  slack: { label: 'Slack', icon: MessageSquare, color: '#4338CA', bg: '#EEF2FF' },
  workspace: { label: 'Workspace', icon: Monitor, color: '#0369A1', bg: '#E0F2FE' },
  task: { label: 'Task', icon: Cpu, color: '#B45309', bg: '#FEF3C7' },
};

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTokens(input: number, output: number): string {
  const total = input + output;
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`;
  return String(total);
}

interface AgentRunsPanelProps {
  runs: BrainAgentRunRow[];
  stats: AgentRunStats;
  loading?: boolean;
}

export function AgentRunsPanel({ runs, stats, loading }: AgentRunsPanelProps) {
  const [filter, setFilter] = useState<SurfaceFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return runs;
    return runs.filter(r => r.surface === filter);
  }, [runs, filter]);

  const filters: SurfaceFilter[] = ['all', 'slack', 'workspace', 'task'];

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header + stats strip */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>Agent runs</span>
            {stats.runningNow > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#DBEAFE', color: '#1D4ED8' }}>
                <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                {stats.runningNow} live
              </span>
            )}
          </div>
          {loading && <Loader2 size={14} style={{ color: '#9CA3AF', animation: 'spin 1s linear infinite' }} />}
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <MiniStat label="24h runs" value={String(stats.runs24h)} />
          <MiniStat label="Success" value={`${stats.successRate24h}%`} />
          <MiniStat label="Avg latency" value={stats.avgLatencyMs24h != null ? fmtLatency(stats.avgLatencyMs24h) : '—'} />
          <MiniStat label="Tokens (24h)" value={stats.totalTokens24h >= 1000 ? `${(stats.totalTokens24h / 1000).toFixed(1)}k` : String(stats.totalTokens24h)} />
        </div>
      </div>

      {/* Surface filters */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderBottom: '1px solid #F3F4F6', flexWrap: 'wrap' }}>
        {filters.map(f => {
          const count = f === 'all' ? stats.runs24h : (stats.bySurface24h[f] ?? 0);
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999,
                border: active ? '1px solid #4F46E5' : '1px solid #E5E7EB',
                background: active ? '#EEF2FF' : 'white',
                color: active ? '#4338CA' : '#6B7280',
                fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {f === 'all' ? 'All' : SURFACE_META[f]?.label ?? f}
              <span style={{ opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {/* Run list */}
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <p style={{ padding: 28, margin: 0, textAlign: 'center', fontSize: '0.8125rem', color: '#9CA3AF' }}>
            No agent runs yet. Message Brain in Slack to start.
          </p>
        ) : (
          filtered.map(run => (
            <AgentRunRow
              key={run.id}
              run={run}
              expanded={expandedId === run.id}
              onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.625rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  );
}

function AgentRunRow({
  run,
  expanded,
  onToggle,
}: {
  run: BrainAgentRunRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = SURFACE_META[run.surface] ?? SURFACE_META.workspace;
  const SurfaceIcon = meta.icon;
  const isRunning = run.status === 'running';

  return (
    <div style={{ borderBottom: '1px solid #F3F4F6' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px',
          background: isRunning ? '#FAFAFF' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <ChevronRight
          size={14}
          style={{ marginTop: 3, flexShrink: 0, color: '#9CA3AF', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        />

        <div style={{ flexShrink: 0, marginTop: 1 }}>
          {isRunning ? (
            <Loader2 size={14} style={{ color: '#4F46E5', animation: 'spin 1s linear infinite' }} />
          ) : run.status === 'success' ? (
            <CheckCircle2 size={14} style={{ color: '#059669' }} />
          ) : (
            <XCircle size={14} style={{ color: '#DC2626' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.625rem', fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: meta.bg, color: meta.color }}>
              <SurfaceIcon size={10} /> {meta.label}
            </span>
            {run.model && (
              <span style={{ fontSize: '0.625rem', color: '#9CA3AF' }}>{run.model.replace('claude-', '')}</span>
            )}
            <span style={{ fontSize: '0.6875rem', color: '#9CA3AF', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Zap size={10} /> {run.tool_call_count}
              </span>
              <span>{fmtTokens(run.input_tokens, run.output_tokens)} tok</span>
              <span>{fmtLatency(run.latency_ms)}</span>
              <Clock size={10} /> {fmtRelative(run.started_at)}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#374151', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: expanded ? undefined : 1, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
            {run.user_message_preview || run.reply_preview || '(no preview)'}
          </p>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 12px 52px', fontSize: '0.75rem', color: '#6B7280' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginBottom: 8 }}>
            <Detail label="Status" value={run.status} />
            <Detail label="Iterations" value={String(run.iteration_count)} />
            <Detail label="Input tok" value={String(run.input_tokens)} />
            <Detail label="Output tok" value={String(run.output_tokens)} />
            {run.task_id && <Detail label="Task" value={run.task_id.slice(0, 8) + '…'} />}
          </div>
          {run.user_message_preview && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Prompt: </span>
              {run.user_message_preview}
            </div>
          )}
          {run.reply_preview && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: '#374151' }}>Reply: </span>
              {run.reply_preview}
            </div>
          )}
          {run.error && (
            <div style={{ color: '#991B1B', background: '#FEF2F2', padding: '6px 8px', borderRadius: 6 }}>{run.error}</div>
          )}
          {run.slack_channel && (
            <div style={{ marginTop: 6, fontSize: '0.6875rem', color: '#9CA3AF' }}>
              Slack {run.slack_channel}{run.slack_thread_ts ? ` · thread ${run.slack_thread_ts}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#F9FAFB', borderRadius: 6, padding: '6px 8px' }}>
      <div style={{ fontSize: '0.625rem', color: '#9CA3AF', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '0.75rem', color: '#374151', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
