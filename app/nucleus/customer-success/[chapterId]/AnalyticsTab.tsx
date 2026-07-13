'use client';

import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Users, MessageSquare, BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';
import { CS_UI, TOOLBAR_BUTTON, CS_CARD } from '../cs-ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeeklySignup { week: string; signups: number }
interface FunnelStage { stage: string; value: number; fill: string }
interface WeeklyResponseRate { week: string; sent: number; responses: number; rate: number }

interface AnalyticsData {
  weekly_signups: WeeklySignup[];
  outreach_funnel: FunnelStage[];
  weekly_response_rate: WeeklyResponseRate[];
}

interface AnalyticsTabProps {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div style={{ ...CS_CARD, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8, flexShrink: 0,
        background: CS_UI.surfaceMuted, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: CS_UI.textMuted,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: CS_UI.textSubtle, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: CS_UI.text, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: '0.75rem', color: CS_UI.textSubtle, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Chart section wrapper ────────────────────────────────────────────────────

function ChartSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ ...CS_CARD, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ color: CS_UI.textSubtle }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: CS_UI.text }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

const tooltipStyle = {
  contentStyle: {
    background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10,
    fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  cursor: { fill: 'rgba(37,99,235,0.06)' },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsTab({ chapter, showToast }: AnalyticsTabProps) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/analytics`);
      const json = await res.json();
      if (json.error) {
        showToast(`Analytics error: ${json.error.message}`, 'error');
      } else {
        setData(json.data);
      }
    } catch {
      showToast('Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAnalytics(); }, [chapter.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, gap: 10, color: '#6b7280' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.88rem' }}>Loading analytics…</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 12, color: '#9ca3af' }}>
        <BarChart3 size={40} style={{ opacity: 0.3 }} />
        <p style={{ margin: 0, fontSize: '0.88rem' }}>No analytics data available.</p>
        <button type="button" onClick={fetchAnalytics} style={TOOLBAR_BUTTON}>
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  // ─── Derived stats ──────────────────────────────────────────────────────────
  const totalSignups12w = data.weekly_signups.reduce((s, w) => s + w.signups, 0);
  const peakSignupWeek = data.weekly_signups.reduce((best, w) => w.signups > best.signups ? w : best, { week: '—', signups: 0 });

  const funnelTotal = data.outreach_funnel[0]?.value ?? 0;
  const funnelSignedUp = data.outreach_funnel[4]?.value ?? 0;
  const conversionRate = funnelTotal > 0 ? Math.round((funnelSignedUp / funnelTotal) * 100) : 0;

  const avgResponseRate = (() => {
    const validWeeks = data.weekly_response_rate.filter((w) => w.sent > 0);
    if (!validWeeks.length) return 0;
    const sum = validWeeks.reduce((s, w) => s + w.rate, 0);
    return Math.round(sum / validWeeks.length);
  })();

  const totalSent12w = data.weekly_response_rate.reduce((s, w) => s + w.sent, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: CS_UI.text }}>Chapter Analytics</h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: CS_UI.textSubtle }}>Last 12 weeks · {chapter.chapter_name}</p>
        </div>
        <button type="button" onClick={fetchAnalytics} style={TOOLBAR_BUTTON}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard
          label="Signups (12w)"
          value={totalSignups12w}
          sub={`Peak: ${peakSignupWeek.week} (${peakSignupWeek.signups})`}
          icon={<Users size={18} />}
        />
        <StatCard
          label="Conversion Rate"
          value={`${conversionRate}%`}
          sub={`${funnelSignedUp} of ${funnelTotal} alumni`}
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          label="Avg Response Rate"
          value={`${avgResponseRate}%`}
          sub="Across active weeks"
          icon={<MessageSquare size={18} />}
        />
        <StatCard
          label="Messages Sent (12w)"
          value={totalSent12w.toLocaleString()}
          sub="All touches combined"
          icon={<BarChart3 size={18} />}
        />
      </div>

      {/* Weekly Signups Chart */}
      <ChartSection title="Weekly Signups" icon={<TrendingUp size={15} />}>
        {totalSignups12w === 0 ? (
          <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: '0.85rem' }}>
            No signups recorded in the last 12 weeks.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.weekly_signups} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={{ stroke: '#e5e7eb' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(v: number | undefined) => [v ?? 0, 'Signups']}
              />
              <Area
                type="monotone"
                dataKey="signups"
                stroke="#2563eb"
                strokeWidth={2}
                fill="url(#signupGrad)"
                dot={{ fill: '#2563eb', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartSection>

      {/* Two-column: Funnel + Response Rate */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>

        {/* Outreach Funnel */}
        <ChartSection title="Outreach Funnel" icon={<Users size={15} />}>
          {funnelTotal === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: '0.85rem' }}>
              No alumni contacts yet.
            </div>
          ) : (
            <>
              {data.outreach_funnel.map((stage, i) => {
                const pct = funnelTotal > 0 ? Math.round((stage.value / funnelTotal) * 100) : 0;
                const prevValue = i > 0 ? data.outreach_funnel[i - 1].value : stage.value;
                const dropPct = prevValue > 0 && i > 0 ? Math.round(((prevValue - stage.value) / prevValue) * 100) : null;
                return (
                  <div key={stage.stage} style={{ marginBottom: i < data.outreach_funnel.length - 1 ? 12 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: stage.fill, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 500 }}>{stage.stage}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {dropPct !== null && dropPct > 0 && (
                          <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 500 }}>
                            −{dropPct}%
                          </span>
                        )}
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', minWidth: 32, textAlign: 'right' }}>
                          {stage.value.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af', minWidth: 32, textAlign: 'right' }}>
                          {pct}%
                        </span>
                      </div>
                    </div>
                    <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        background: stage.fill,
                        width: `${pct}%`,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </ChartSection>

        {/* Weekly Response Rate */}
        <ChartSection title="Weekly Response Rate" icon={<MessageSquare size={15} />}>
          {totalSent12w === 0 ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: '0.85rem' }}>
              No messages sent in the last 12 weeks.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.weekly_response_rate} margin={{ top: 4, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number | undefined, name: string | undefined) => {
                    const val = v ?? 0;
                    const key = name ?? '';
                    if (key === 'rate') return [`${val}%`, 'Response Rate'] as [string, string];
                    return [val, key === 'sent' ? 'Messages Sent' : 'Responses'] as [number, string];
                  }}
                />
                <Bar dataKey="sent" name="sent" fill="#e0e7ff" radius={[3, 3, 0, 0]} />
                <Bar dataKey="responses" name="responses" fill="#a78bfa" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {totalSent12w > 0 && (
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: '#e0e7ff' }} />
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Sent</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: '#a78bfa' }} />
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Responded</span>
              </div>
            </div>
          )}
        </ChartSection>
      </div>
    </div>
  );
}
