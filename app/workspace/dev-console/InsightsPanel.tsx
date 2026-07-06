'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowLeft, CalendarClock, CheckCircle2, Clock, DollarSign, Loader2, XCircle } from 'lucide-react';
import {
  automationDisplayName,
  computeNextAutomationRun,
  formatAutomationDateTime,
  formatAutomationSchedule,
} from '@/lib/brain/automation-schedule';
import { fmtCostUsd } from '@/lib/brain/pricing';

type InsightTab = 'spend' | 'activity' | 'automations';

interface ActivityDay {
  date: string;
  toolCalls: number;
  tasksCompleted: number;
  agentRuns: number;
  costUsd: number;
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

interface InsightsPanelProps {
  activityByDay: ActivityDay[];
  automations: AutomationRow[];
  weekSpend: number;
  authHeaders?: () => Record<string, string>;
  onAutomationsChange?: (automations: AutomationRow[]) => void;
}

const TABS: { id: InsightTab; label: string; icon: React.ElementType }[] = [
  { id: 'spend', label: 'Spend', icon: DollarSign },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'automations', label: 'Automations', icon: CalendarClock },
];

interface AutomationDetail {
  next_run_at: string | null;
  last_run: {
    at: string;
    status: string;
    error: string | null;
    output_preview: string | null;
  } | null;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function SpendChart({ days }: { days: ActivityDay[] }) {
  const maxCost = Math.max(0.001, ...days.map(d => d.costUsd));
  const weekTotal = days.reduce((s, d) => s + d.costUsd, 0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#059669' }}>{fmtCostUsd(weekTotal)}</span>
        <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>estimated API cost · last 7 days</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120, padding: '0 8px' }}>
        {days.map(d => (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: d.costUsd > 0 ? '#059669' : '#D1D5DB' }}>
              {d.costUsd > 0 ? fmtCostUsd(d.costUsd) : '—'}
            </span>
            <div
              title={`${fmtCostUsd(d.costUsd)} · ${d.agentRuns} runs`}
              style={{
                width: '100%',
                maxWidth: 48,
                height: `${Math.max(6, (d.costUsd / maxCost) * 88)}px`,
                background: d.costUsd > 0 ? 'linear-gradient(180deg, #6EE7B7, #059669)' : '#F3F4F6',
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.2s ease',
              }}
            />
            <span style={{ fontSize: '0.6875rem', color: '#6B7280', fontWeight: 500 }}>
              {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityChart({ days }: { days: ActivityDay[] }) {
  const maxVal = Math.max(1, ...days.map(d => Math.max(d.toolCalls, d.agentRuns)));
  const totalRuns = days.reduce((s, d) => s + d.agentRuns, 0);
  const totalTools = days.reduce((s, d) => s + d.toolCalls, 0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4F46E5' }}>{totalRuns}</span>
          <span style={{ fontSize: '0.8125rem', color: '#6B7280', marginLeft: 8 }}>agent runs</span>
        </div>
        <div>
          <span style={{ fontSize: '1.75rem', fontWeight: 700, color: '#7C3AED' }}>{totalTools}</span>
          <span style={{ fontSize: '0.8125rem', color: '#6B7280', marginLeft: 8 }}>tool calls</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120, padding: '0 8px' }}>
        {days.map(d => (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', maxWidth: 48, justifyContent: 'center', height: 88 }}>
              <div
                title={`${d.agentRuns} agent runs`}
                style={{
                  flex: 1,
                  height: `${Math.max(4, (d.agentRuns / maxVal) * 88)}px`,
                  background: 'linear-gradient(180deg, #818CF8, #4F46E5)',
                  borderRadius: '3px 3px 0 0',
                }}
              />
              <div
                title={`${d.toolCalls} tool calls`}
                style={{
                  flex: 1,
                  height: `${Math.max(4, (d.toolCalls / maxVal) * 88)}px`,
                  background: 'linear-gradient(180deg, #C4B5FD, #7C3AED)',
                  borderRadius: '3px 3px 0 0',
                }}
              />
            </div>
            <span style={{ fontSize: '0.6875rem', color: '#6B7280', fontWeight: 500 }}>
              {new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 12, justifyContent: 'center' }}>
        <Legend color="#4F46E5" label="Agent runs" />
        <Legend color="#7C3AED" label="Tool calls" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.6875rem', color: '#6B7280' }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

function StatusBadge({ status, enabled }: { status: string | null; enabled: boolean }) {
  if (!enabled) {
    return (
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#F3F4F6', color: '#9CA3AF' }}>
        Off
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#FEE2E2', color: '#991B1B' }}>
        Failed
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#ECFDF5', color: '#065F46' }}>
        Healthy
      </span>
    );
  }
  return (
    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: '#EEF2FF', color: '#4338CA' }}>
      Active
    </span>
  );
}

function ToggleSwitch({
  enabled,
  disabled,
  onToggle,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={e => {
        e.stopPropagation();
        onToggle();
      }}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: 'none',
        padding: 2,
        cursor: disabled ? 'default' : 'pointer',
        background: enabled ? '#4F46E5' : '#D1D5DB',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.15s',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'white',
          transform: enabled ? 'translateX(18px)' : 'translateX(0)',
          transition: 'transform 0.15s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  );
}

function AutomationsView({
  automations: initial,
  authHeaders,
  onAutomationsChange,
}: {
  automations: AutomationRow[];
  authHeaders?: () => Record<string, string>;
  onAutomationsChange?: (automations: AutomationRow[]) => void;
}) {
  const [items, setItems] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AutomationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initial);
  }, [initial]);

  const selected = items.find(a => a.id === selectedId) ?? null;

  const loadDetail = useCallback(
    async (id: string) => {
      if (!authHeaders) return;
      setDetailLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/brain/automations/${id}`, { headers: authHeaders() });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Failed to load automation');
          setDetail(null);
          return;
        }
        setDetail({
          next_run_at: json.data.next_run_at,
          last_run: json.data.last_run,
        });
      } catch {
        setError('Network error loading automation');
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [authHeaders]
  );

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const toggle = useCallback(
    async (id: string, nextEnabled: boolean) => {
      if (!authHeaders) return;
      setError(null);
      setTogglingId(id);

      const prev = items;
      const optimistic = items.map(a => (a.id === id ? { ...a, enabled: nextEnabled } : a));
      setItems(optimistic);
      onAutomationsChange?.(optimistic);

      try {
        const res = await fetch(`/api/brain/automations/${id}`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: nextEnabled }),
        });
        const json = await res.json();
        if (!res.ok) {
          setItems(prev);
          onAutomationsChange?.(prev);
          setError(json.error || 'Failed to update automation');
          return;
        }
        const updated = optimistic.map(a =>
          a.id === id ? ({ ...a, ...(json.data as AutomationRow), enabled: nextEnabled }) : a
        );
        setItems(updated);
        onAutomationsChange?.(updated);
        if (selectedId === id) loadDetail(id);
      } catch {
        setItems(prev);
        onAutomationsChange?.(prev);
        setError('Network error updating automation');
      } finally {
        setTogglingId(null);
      }
    },
    [authHeaders, items, onAutomationsChange, selectedId, loadDetail]
  );

  if (items.length === 0) {
    return (
      <p style={{ margin: 0, padding: '32px 24px', textAlign: 'center', fontSize: '0.875rem', color: '#9CA3AF' }}>
        No automations configured.
      </p>
    );
  }

  if (selected) {
    const scheduleLabel = formatAutomationSchedule(selected.schedule, selected.kind, selected.config);
    const nextRunLocal = selected.enabled
      ? detail?.next_run_at ??
        computeNextAutomationRun(selected.schedule, selected.kind, selected.config, selected.enabled)?.toISOString() ??
        null
      : null;
    const isToggling = togglingId === selected.id;
    const lastRun = detail?.last_run;

    return (
      <div style={{ width: '100%', padding: '0 24px 24px' }}>
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 0 16px',
            padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: '0.8125rem', fontWeight: 500, color: '#4338CA',
          }}
        >
          <ArrowLeft size={14} /> All automations
        </button>

        {error && <ErrorBanner message={error} />}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '0 0 20px', borderBottom: '1px solid #E5E7EB' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
              {automationDisplayName(selected.name)}
            </h3>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#4B5563' }}>{scheduleLabel}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <StatusBadge status={selected.last_status} enabled={selected.enabled} />
            {isToggling ? (
              <Loader2 size={16} style={{ color: '#9CA3AF', animation: 'spin 1s linear infinite' }} />
            ) : (
              <ToggleSwitch
                enabled={selected.enabled}
                disabled={!authHeaders}
                onToggle={() => toggle(selected.id, !selected.enabled)}
              />
            )}
          </div>
        </div>

        {detailLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', color: '#9CA3AF', gap: 8 }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.875rem' }}>Loading run data…</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, paddingTop: 20 }}>
            <MetricCard
              label="Next run"
              icon={Clock}
              accent="#4338CA"
              value={
                !selected.enabled
                  ? 'Paused'
                  : nextRunLocal
                    ? formatAutomationDateTime(nextRunLocal, selected.config)
                    : '—'
              }
              sub={selected.enabled ? 'Scheduled cron tick' : 'Enable to resume'}
            />
            <MetricCard
              label="Last run"
              icon={lastRun?.status === 'failed' ? XCircle : CheckCircle2}
              accent={lastRun?.status === 'failed' ? '#DC2626' : '#059669'}
              value={lastRun ? fmtRelative(lastRun.at) : 'Never'}
              sub={
                lastRun
                  ? new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(lastRun.at))
                  : undefined
              }
            />
            <MetricCard
              label="Last result"
              icon={lastRun?.status === 'failed' ? XCircle : CheckCircle2}
              accent={lastRun?.status === 'failed' ? '#DC2626' : '#059669'}
              value={
                !lastRun
                  ? '—'
                  : lastRun.status === 'success'
                    ? 'Success'
                    : lastRun.status === 'failed'
                      ? 'Failed'
                      : lastRun.status
              }
              sub={lastRun?.error ? lastRun.error.slice(0, 80) : undefined}
            />
          </div>
        )}

        {lastRun?.output_preview && (
          <div style={{ marginTop: 20, padding: '14px 16px', background: '#F9FAFB', borderRadius: 10, border: '1px solid #E5E7EB' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Last output preview
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#374151', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {lastRun.output_preview}
            </p>
          </div>
        )}

        {lastRun?.error && (
          <div style={{ marginTop: 12, padding: '12px 14px', background: '#FEF2F2', borderRadius: 10, border: '1px solid #FECACA', fontSize: '0.8125rem', color: '#991B1B' }}>
            {lastRun.error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {error && <ErrorBanner message={error} />}

      <div
        className="dev-console-automation-head"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto 48px',
          gap: 12,
          padding: '10px 24px',
          borderBottom: '1px solid #E5E7EB',
          background: '#FAFAFA',
          fontSize: '0.625rem',
          fontWeight: 600,
          color: '#9CA3AF',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        <span>Automation</span>
        <span style={{ width: 72, textAlign: 'center' }}>Status</span>
        <span style={{ width: 36, textAlign: 'center' }}>On</span>
        <span />
      </div>

      {items.map(a => {
        const scheduleLabel = formatAutomationSchedule(a.schedule, a.kind, a.config);
        const isToggling = togglingId === a.id;

        return (
          <div
            key={a.id}
            className="dev-console-automation-row"
            onClick={() => setSelectedId(a.id)}
            onKeyDown={e => {
              if (e.key === 'Enter') setSelectedId(a.id);
            }}
            role="button"
            tabIndex={0}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto 48px',
              gap: 12,
              alignItems: 'center',
              padding: '14px 24px',
              borderBottom: '1px solid #F3F4F6',
              cursor: 'pointer',
              opacity: a.enabled ? 1 : 0.65,
              width: '100%',
              boxSizing: 'border-box',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFA'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                {automationDisplayName(a.name)}
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: 2 }}>{scheduleLabel}</div>
            </div>

            <div style={{ width: 72, display: 'flex', justifyContent: 'center' }}>
              <StatusBadge status={a.last_status} enabled={a.enabled} />
            </div>

            <div style={{ width: 36, display: 'flex', justifyContent: 'center' }}>
              {isToggling ? (
                <Loader2 size={16} style={{ color: '#9CA3AF', animation: 'spin 1s linear infinite' }} />
              ) : (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: a.enabled ? '#4338CA' : '#9CA3AF' }}>
                  {a.enabled ? 'On' : 'Off'}
                </span>
              )}
            </div>

            <div onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
              <ToggleSwitch
                enabled={a.enabled}
                disabled={isToggling || !authHeaders}
                onToggle={() => toggle(a.id, !a.enabled)}
              />
            </div>
          </div>
        );
      })}

      <p style={{ margin: 0, padding: '12px 24px', fontSize: '0.6875rem', color: '#9CA3AF' }}>
        Click a row for run details. Use the toggle to enable or disable.
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ margin: '0 24px 12px', padding: '8px 12px', borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '0.8125rem' }}>
      {message}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={14} style={{ color: accent }} />
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', lineHeight: 1.35 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function InsightsPanel({ activityByDay, automations, weekSpend, authHeaders, onAutomationsChange }: InsightsPanelProps) {
  const [tab, setTab] = useState<InsightTab>('spend');

  return (
    <div className="dev-console-insights" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
      {/* Tab bar */}
      <div className="dev-console-insights-tabs" style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #E5E7EB', padding: '0 8px' }}>
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: '0.8125rem', fontWeight: active ? 600 : 500,
                color: active ? '#4338CA' : '#6B7280',
                borderBottom: active ? '2px solid #4F46E5' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              <Icon size={15} />
              {t.label}
              {t.id === 'spend' && weekSpend > 0 && (
                <span style={{ fontSize: '0.625rem', padding: '1px 6px', borderRadius: 999, background: active ? '#EEF2FF' : '#F3F4F6', color: active ? '#4338CA' : '#9CA3AF', fontWeight: 600 }}>
                  {fmtCostUsd(weekSpend)}
                </span>
              )}
              {t.id === 'automations' && automations.length > 0 && (
                <span style={{ fontSize: '0.625rem', padding: '1px 6px', borderRadius: 999, background: active ? '#EEF2FF' : '#F3F4F6', color: active ? '#4338CA' : '#9CA3AF', fontWeight: 600 }}>
                  {automations.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content — automations tab is edge-to-edge */}
      <div className="dev-console-insights-body" style={{ padding: tab === 'automations' ? '20px 0 0' : '20px 24px', minHeight: 180 }}>
        {tab === 'spend' && <SpendChart days={activityByDay} />}
        {tab === 'activity' && <ActivityChart days={activityByDay} />}
        {tab === 'automations' && (
          <AutomationsView
            automations={automations}
            authHeaders={authHeaders}
            onAutomationsChange={onAutomationsChange}
          />
        )}
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
