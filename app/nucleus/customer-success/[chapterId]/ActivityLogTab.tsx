'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Send, CreditCard, HeartHandshake, RefreshCw, Loader2,
  Activity, CheckCircle2, Clock,
} from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityEventKind =
  | 'batch_compiled'
  | 'batch_approved'
  | 'batch_executed'
  | 'payment_received'
  | 'check_in';

interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  title: string;
  detail?: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

interface ActivityLogTabProps {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// ─── Event config ─────────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  ActivityEventKind,
  { icon: React.ReactNode; color: string; bg: string; border: string }
> = {
  batch_compiled: {
    icon: <Clock size={14} />,
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.1)',
    border: 'rgba(245,158,11,0.2)',
  },
  batch_approved: {
    icon: <CheckCircle2 size={14} />,
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.1)',
    border: 'rgba(96,165,250,0.2)',
  },
  batch_executed: {
    icon: <Send size={14} />,
    color: '#10b981',
    bg: 'rgba(16,185,129,0.1)',
    border: 'rgba(16,185,129,0.2)',
  },
  payment_received: {
    icon: <CreditCard size={14} />,
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.1)',
    border: 'rgba(167,139,250,0.2)',
  },
  check_in: {
    icon: <HeartHandshake size={14} />,
    color: '#34d399',
    bg: 'rgba(52,211,153,0.1)',
    border: 'rgba(52,211,153,0.2)',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: diffDays > 365 ? 'numeric' : undefined });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Group events by date label
function groupByDate(events: ActivityEvent[]): { label: string; events: ActivityEvent[] }[] {
  const groups: Map<string, ActivityEvent[]> = new Map();
  for (const e of events) {
    const label = formatTimestamp(e.timestamp);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(e);
  }
  return Array.from(groups.entries()).map(([label, evts]) => ({ label, events: evts }));
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ event, isLast }: { event: ActivityEvent; isLast: boolean }) {
  const cfg = EVENT_CONFIG[event.kind];
  return (
    <div style={{ display: 'flex', gap: 14, position: 'relative' }}>
      {/* Timeline line */}
      {!isLast && (
        <div style={{
          position: 'absolute',
          left: 15,
          top: 32,
          bottom: -12,
          width: 1,
          background: '#e5e7eb',
        }} />
      )}

      {/* Icon dot */}
      <div style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        flexShrink: 0,
        background: cfg.bg,
        border: `1.5px solid ${cfg.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: cfg.color,
        zIndex: 1,
      }}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        paddingBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
            {event.title}
          </span>
          <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
            {formatTime(event.timestamp)}
          </span>
        </div>
        {event.detail && (
          <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.5 }}>
            {event.detail}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ActivityLogTab({ chapter, showToast }: ActivityLogTabProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/activity?limit=100`);
      const json = await res.json();
      if (json.error) {
        showToast(`Activity log error: ${json.error.message}`, 'error');
      } else {
        setEvents(json.data ?? []);
      }
    } catch {
      showToast('Failed to load activity log', 'error');
    } finally {
      setLoading(false);
    }
  }, [chapter.id, showToast]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, gap: 10, color: '#6b7280' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.88rem' }}>Loading activity…</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 12, color: '#9ca3af' }}>
        <Activity size={40} style={{ opacity: 0.25 }} />
        <p style={{ margin: 0, fontSize: '0.88rem' }}>No activity recorded for this chapter yet.</p>
        <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.7 }}>
          Activity appears as batches are compiled, payments are received, and check-ins are logged.
        </p>
        <button
          onClick={fetchActivity}
          style={{ marginTop: 4, padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#ffffff', cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const groups = groupByDate(events);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Activity Log</h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
            {events.length} event{events.length !== 1 ? 's' : ''} · {chapter.chapter_name}
          </p>
        </div>
        <button
          onClick={fetchActivity}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#ffffff', cursor: 'pointer', fontSize: '0.78rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, flexWrap: 'wrap',
        padding: '10px 14px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
      }}>
        {(Object.entries(EVENT_CONFIG) as [ActivityEventKind, typeof EVENT_CONFIG[ActivityEventKind]][]).map(([kind, cfg]) => {
          const label: Record<ActivityEventKind, string> = {
            batch_compiled: 'Batch compiled',
            batch_approved: 'Batch approved',
            batch_executed: 'Batch executed',
            payment_received: 'Payment received',
            check_in: 'Check-in',
          };
          return (
            <div key={kind} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: cfg.bg, border: `1.5px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cfg.color, flexShrink: 0 }}>
                {cfg.icon}
              </div>
              <span style={{ fontSize: '0.73rem', color: '#6b7280' }}>{label[kind]}</span>
            </div>
          );
        })}
      </div>

      {/* Timeline */}
      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }}>
        {groups.map((group) => (
          <div key={group.label} style={{ marginBottom: 24 }}>
            {/* Date header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 16,
            }}>
              <span style={{
                fontSize: '0.72rem', fontWeight: 700,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                {group.label}
              </span>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>

            {/* Events */}
            <div>
              {group.events.map((ev, i) => (
                <EventRow
                  key={ev.id}
                  event={ev}
                  isLast={i === group.events.length - 1 && group === groups[groups.length - 1]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
