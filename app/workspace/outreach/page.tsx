'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Send, RefreshCw, Loader2, AlertCircle, TrendingUp,
} from 'lucide-react';
import ConversationsTab from '@/app/nucleus/customer-success/ConversationsTab';
import { useUserRole } from '@/app/workspace/hooks/useUserRole';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChapterPipelineRow {
  chapter_id: string;
  chapter_name: string;
  fraternity: string | null;
  school: string | null;
  total: number;
  sent: number;
  replied: number;
  linked: number;
  signed_up: number;
  status: 'not_started' | 'active' | 'done';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ChapterPipelineRow['status'] }) {
  const cfg = {
    not_started: { label: 'Not Started', bg: '#f3f4f6', color: '#6b7280' },
    active:      { label: 'Active',      bg: '#dbeafe', color: '#1d4ed8' },
    done:        { label: 'Done',        bg: '#d1fae5', color: '#065f46' },
  }[status];

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 9999,
      fontSize: '0.68rem',
      fontWeight: 700,
      background: cfg.bg,
      color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

function Pct({ num, den }: { num: number; den: number }) {
  if (den === 0) return <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>;
  const p = Math.round((num / den) * 100);
  return (
    <span style={{ color: '#374151', fontSize: '0.8rem' }}>
      {num}{' '}
      <span style={{ color: '#9ca3af', fontSize: '0.7rem' }}>({p}%)</span>
    </span>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: '#f3f4f6', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#0F172A', borderRadius: 9999, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.7rem', color: '#9ca3af', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

// ── Space Pipeline Section ────────────────────────────────────────────────────

function SpacePipeline() {
  const [rows, setRows]       = useState<ChapterPipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [sort, setSort]       = useState<{ key: keyof ChapterPipelineRow; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' });
  const [search, setSearch]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/outreach/pipeline-summary');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to load');
      setRows(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sort + filter
  const filtered = rows
    .filter(r => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.chapter_name?.toLowerCase().includes(q) ||
        r.fraternity?.toLowerCase().includes(q) ||
        r.school?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sort.key] ?? '';
      const bv = b[sort.key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return sort.dir === 'asc' ? av - bv : bv - av;
      }
      return sort.dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  const maxTotal = Math.max(...rows.map(r => r.total), 1);

  function toggleSort(key: keyof ChapterPipelineRow) {
    setSort(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  }

  function SortBtn({ col }: { col: keyof ChapterPipelineRow }) {
    const active = sort.key === col;
    return (
      <button
        onClick={() => toggleSort(col)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: active ? '#0F172A' : '#9ca3af', fontSize: '0.68rem', fontWeight: active ? 700 : 600,
          letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 3,
          fontFamily: 'inherit',
        }}
      >
        {col.replace(/_/g, ' ')}
        {active && <span style={{ fontSize: '0.6rem' }}>{sort.dir === 'desc' ? '▼' : '▲'}</span>}
      </button>
    );
  }

  // Summary stats
  const totalContacts  = rows.reduce((s, r) => s + r.total, 0);
  const totalSent      = rows.reduce((s, r) => s + r.sent, 0);
  const totalReplied   = rows.reduce((s, r) => s + r.replied, 0);
  const totalSignedUp  = rows.reduce((s, r) => s + r.signed_up, 0);
  const activeChapters = rows.filter(r => r.status === 'active').length;
  const doneChapters   = rows.filter(r => r.status === 'done').length;

  return (
    <section>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #0F172A, #1e293b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={20} style={{ color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Space Pipeline
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
              {rows.length} chapters · {totalContacts.toLocaleString()} total contacts
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search chapters…"
            style={{
              padding: '6px 12px', border: '1px solid #E5E7EB', borderRadius: 8,
              fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit', width: 180,
            }}
          />
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', border: '1px solid #E5E7EB', borderRadius: 8,
              background: '#fff', color: '#374151', cursor: loading ? 'default' : 'pointer',
              fontSize: '0.78rem', fontWeight: 500,
            }}
          >
            {loading
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Summary stat chips */}
      {!loading && rows.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Chapters',    value: rows.length,                bg: '#f3f4f6', color: '#374151' },
            { label: 'Active',      value: activeChapters,             bg: '#dbeafe', color: '#1d4ed8' },
            { label: 'Done',        value: doneChapters,               bg: '#d1fae5', color: '#065f46' },
            { label: 'Contacts',    value: totalContacts.toLocaleString(), bg: '#f3f4f6', color: '#374151' },
            { label: 'Sent',        value: totalSent.toLocaleString(), bg: '#ede9fe', color: '#7c3aed' },
            { label: 'Replied',     value: totalReplied.toLocaleString(), bg: '#fef3c7', color: '#b45309' },
            { label: 'Signed Up',   value: totalSignedUp.toLocaleString(), bg: '#d1fae5', color: '#065f46' },
          ].map(chip => (
            <div key={chip.label} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 9999,
              background: chip.bg, color: chip.color,
            }}>
              <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{chip.value}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 500 }}>{chip.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          background: '#fee2e2', borderRadius: 8, marginBottom: 12,
          color: '#991b1b', fontSize: '0.8rem',
        }}>
          <AlertCircle size={14} />
          {error}
          <button onClick={load} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', textDecoration: 'underline', fontSize: '0.78rem', fontFamily: 'inherit' }}>
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 1.1fr 1.4fr',
          gap: 12,
          padding: '10px 16px',
          background: '#f9fafb',
          borderBottom: '1px solid #f3f4f6',
          alignItems: 'center',
        }}>
          <SortBtn col="chapter_name" />
          <SortBtn col="total" />
          <SortBtn col="sent" />
          <SortBtn col="replied" />
          <SortBtn col="linked" />
          <SortBtn col="signed_up" />
          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Progress
          </span>
          <SortBtn col="status" />
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', gap: 8 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '0.8rem' }}>Loading pipeline…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 120, color: '#d1d5db', gap: 8 }}>
              <TrendingUp size={28} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '0.8rem' }}>No chapters found</span>
            </div>
          ) : (
            filtered.map((row, idx) => (
              <div
                key={row.chapter_id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr 1.1fr 1.4fr',
                  gap: 12,
                  padding: '10px 16px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid #f9fafb' : 'none',
                  alignItems: 'center',
                  background: row.status === 'done' ? '#f0fdf410' : '#fff',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = row.status === 'done' ? '#f0fdf410' : '#fff'; }}
              >
                {/* Chapter name */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827', lineHeight: 1.3 }}>
                    {row.fraternity
                      ? <><span style={{ color: '#374151' }}>{row.fraternity}</span>{row.school ? <span style={{ color: '#9ca3af', fontWeight: 400 }}> · {row.school}</span> : null}</>
                      : row.chapter_name
                    }
                  </div>
                  {row.fraternity && (
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 1 }}>{row.chapter_name}</div>
                  )}
                </div>

                {/* Contacts */}
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                  {row.total.toLocaleString()}
                </div>

                {/* Sent */}
                <Pct num={row.sent} den={row.total} />

                {/* Replied */}
                <Pct num={row.replied} den={row.total} />

                {/* Linked */}
                <Pct num={row.linked} den={row.total} />

                {/* Signed Up */}
                <Pct num={row.signed_up} den={row.total} />

                {/* Progress bar */}
                <MiniBar value={row.sent} max={maxTotal} />

                {/* Status */}
                <StatusBadge status={row.status} />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {!loading && filtered.length > 0 && (
          <div style={{ padding: '8px 16px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', fontSize: '0.7rem', color: '#9ca3af' }}>
            Showing {filtered.length} of {rows.length} chapters
          </div>
        )}
      </div>
    </section>
  );
}

// ── Toast helper ──────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const ToastEl = toast ? (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px) + 24px)',
      right: 24,
      zIndex: 9999,
      background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#059669' : '#374151',
      color: '#fff',
      padding: '10px 18px',
      borderRadius: 10,
      fontSize: '0.875rem',
      fontWeight: 500,
      boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      {toast.type === 'error'
        ? <AlertCircle size={15} />
        : toast.type === 'success'
        ? <span>✓</span>
        : <span>ℹ</span>}
      {toast.message}
    </div>
  ) : null;

  return { showToast, ToastEl };
}

// ── Access Gate ───────────────────────────────────────────────────────────────

function AccessDenied() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: '#9ca3af', gap: 12,
    }}>
      <AlertCircle size={40} style={{ opacity: 0.3 }} />
      <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#374151', margin: 0 }}>Access Restricted</h2>
      <p style={{ fontSize: '0.875rem', margin: 0 }}>This page is available to founders and GTM team members only.</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OutreachWorkspacePage() {
  const { role, workspaceRole, loading } = useUserRole();
  const { showToast, ToastEl }           = useToast();

  // Access gate: founder (covers gtm via getWorkspaceRole) or explicit gtm
  const allowed = workspaceRole === 'founder' || role === 'gtm';

  if (loading) {
    return (
      <div className="ws-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} />
      </div>
    );
  }

  if (!allowed) {
    return <div className="ws-page"><AccessDenied /></div>;
  }

  return (
    <div className="ws-page">
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, #0F172A, #374151)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Send size={22} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{
            fontFamily: 'Inter, sans-serif', fontSize: '1.5rem', fontWeight: 700,
            color: '#111827', margin: 0, lineHeight: 1.2,
          }}>
            Outreach
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
            Space pipeline · global inbox · reply directly
          </p>
        </div>
      </div>

      {/* ── Section 1: Space Pipeline ── */}
      <SpacePipeline />

      {/* ── Divider ── */}
      <div style={{ height: 1, background: '#E5E7EB' }} />

      {/* ── Section 2: Conversation Inbox ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Send size={18} style={{ color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Conversation Inbox
            </h2>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
              All Linq conversations across every chapter and line
            </p>
          </div>
        </div>

        {/* Global ConversationsTab — no initialChapterId = shows all chapters */}
        <ConversationsTab showToast={showToast} />
      </section>

      {ToastEl}
    </div>
  );
}
