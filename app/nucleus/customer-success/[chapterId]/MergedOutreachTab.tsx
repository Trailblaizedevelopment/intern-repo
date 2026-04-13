'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Phone, Smartphone, RefreshCw, Loader2,
  MessageSquare, ChevronDown, ChevronRight, Zap,
  CheckCircle2, Clock, XCircle, Send, Eye, EyeOff, ChevronUp,
} from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';
import ConversationsTab from '../ConversationsTab';
import { INTERNAL_AUTH_HEADER } from '@/lib/internal-auth';

const AUTH = INTERNAL_AUTH_HEADER;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlumniStats {
  total: number;
  have_phone: number;
  imessage: number;
  contacted: number;
  responded: number;
  signed_up: number;
  touch1_ready: number;
  touch2_due: number;
  touch3_due: number;
  outreach_coverage_pct?: number;
  outreach_contacted_with_phone?: number;
}

interface BatchSummary {
  id: string;
  status: string;
  scheduled_date: string;
  total_contacts: number | null;
  chapter_id: string | null;
  touch_breakdown: {
    t1?: { total: number };
    t2?: { total: number };
    t3?: { total: number };
  } | null;
  notes?: string | null;
}

interface PreviewContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  year: number | null;
}

interface BatchPreview {
  t1: { contacts: PreviewContact[]; total: number; cap: number; max_cap: number; sent_today: number; daily_max: number };
  t2: { contacts: PreviewContact[]; total: number };
  t3: { contacts: PreviewContact[]; total: number };
  lines: { active: number; t1_cap_total: number; sent_today: number };
  batch_total_cap: number;
  has_join_link: boolean;
  warnings: string[];
}

interface AlumniContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_primary: string | null;
  outreach_status: string;
  touch1_sent_at: string | null;
  touch2_sent_at: string | null;
  touch3_sent_at: string | null;
  last_response_at: string | null;
}

const OUTREACH_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  not_contacted:  { label: 'Not Contacted', color: '#6b7280', bg: '#f3f4f6' },
  touch1_sent:    { label: 'T1 Sent',        color: '#1d4ed8', bg: '#dbeafe' },
  touch1_confirmed: { label: 'Confirmed',     color: '#b45309', bg: '#fef3c7' },
  touch2_sent:    { label: 'T2 Sent',        color: '#854d0e', bg: '#fef9c3' },
  touch3_sent:    { label: 'T3 Sent',        color: '#991b1b', bg: '#fee2e2' },
  no_response:    { label: 'No Response',    color: '#6b7280', bg: '#f3f4f6' },
  pitched:        { label: 'Pitched',        color: '#1d4ed8', bg: '#dbeafe' },
  signed_up:      { label: 'Signed Up ✓',   color: '#065f46', bg: '#d1fae5' },
  wrong_number:   { label: 'Wrong #',        color: '#9ca3af', bg: '#f3f4f6' },
  opted_out:      { label: 'Opted Out',      color: '#9ca3af', bg: '#f3f4f6' },
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface MergedOutreachTabProps {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onUpdate: () => void;
}

// ── Sub-section: Outreach Stats ────────────────────────────────────────────────

function OutreachStatsSection({
  chapterId,
  chapterName,
  fraternity,
  school,
  showToast,
}: {
  chapterId: string;
  chapterName: string;
  fraternity: string;
  school: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [stats, setStats] = useState<AlumniStats | null>(null);
  const [batch, setBatch] = useState<BatchSummary | null>(null);
  const [batchHistory, setBatchHistory] = useState<BatchSummary[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingBatch, setLoadingBatch] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [approving, setApproving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [liveProgress, setLiveProgress] = useState<{ sent: number; total: number; failed: number; pct: number } | null>(null);
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [t1Limit, setT1Limit] = useState<number | null>(null);
  const [expandedBatchContacts, setExpandedBatchContacts] = useState(false);
  const [batchContacts, setBatchContacts] = useState<(PreviewContact & { touch: 'T1' | 'T2' | 'T3' })[]>([]);
  const [loadingBatchContacts, setLoadingBatchContacts] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const executingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/alumni/stats?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.data) setStats(json.data);
    } catch {
      showToast('Failed to load stats', 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [chapterId, showToast]);

  const fetchBatch = useCallback(async () => {
    setLoadingBatch(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/outreach/batches?chapter_id=${chapterId}&date=${today}&limit=1`);
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        setBatch(json.data[0]);
      } else {
        setBatch(null);
      }
    } catch {
      setBatch(null);
    } finally {
      setLoadingBatch(false);
    }
  }, [chapterId]);

  const fetchBatchHistory = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/outreach/batches?chapter_id=${chapterId}&limit=6`);
      const json = await res.json();
      if (json.data) {
        // Exclude today's active batch (already shown in the pending batch row)
        const history = (json.data as BatchSummary[]).filter(
          b => b.scheduled_date < today || b.status === 'completed' || b.status === 'rejected'
        ).slice(0, 5);
        setBatchHistory(history);
      }
    } catch {
      // silently ignore
    }
  }, [chapterId]);

  useEffect(() => {
    fetchStats();
    fetchBatch();
    fetchBatchHistory();
  }, [fetchStats, fetchBatch, fetchBatchHistory]);

  // Auto-refresh every 30s while a batch is executing
  useEffect(() => {
    if (batch?.status === 'executing' || batch?.status === 'sending') {
      if (!executingIntervalRef.current) {
        executingIntervalRef.current = setInterval(() => {
          fetchBatch();
        }, 30_000);
      }
    } else {
      if (executingIntervalRef.current) {
        clearInterval(executingIntervalRef.current);
        executingIntervalRef.current = null;
      }
    }
    return () => {
      if (executingIntervalRef.current) {
        clearInterval(executingIntervalRef.current);
        executingIntervalRef.current = null;
      }
    };
  }, [batch?.status, fetchBatch]);

  async function handleApproveBatch() {
    if (!batch) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/outreach/batches/${batch.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Approval failed', 'error');
      } else {
        showToast('Batch approved — ready to execute', 'success');
        setBatch(prev => prev ? { ...prev, status: 'approved' } : prev);
      }
    } catch {
      showToast('Failed to approve batch', 'error');
    } finally {
      setApproving(false);
    }
  }

  async function handleExecuteBatch() {
    if (!batch) return;
    setExecuting(true);
    setLiveProgress({ sent: 0, total: batch.total_contacts ?? 0, failed: 0, pct: 0 });
    showToast('Executing batch — this may take a few minutes…', 'info');

    // Start polling progress every 3s
    const batchId = batch.id;
    if (progressPollRef.current) clearInterval(progressPollRef.current);
    progressPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/outreach/batches/${batchId}/progress`);
        if (res.ok) {
          const json = await res.json();
          if (json.progress) setLiveProgress(json.progress);
          // Stop polling when batch is no longer executing
          if (json.status !== 'executing' && json.status !== 'sending') {
            if (progressPollRef.current) { clearInterval(progressPollRef.current); progressPollRef.current = null; }
          }
        }
      } catch { /* non-fatal */ }
    }, 3000);

    try {
      const res = await fetch(`/api/outreach/batches/${batchId}/execute`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Execution failed', 'error');
      } else {
        const sent = json.data?.sent ?? 0;
        const sms = json.data?.sent_to_sms ?? 0;
        showToast(`✓ Batch complete — ${sent} sent${sms > 0 ? `, ${sms} SMS skipped` : ''}`, 'success');
        await fetchBatch();
        // Final progress snapshot
        if (json.data) {
          setLiveProgress({ sent: json.data.sent ?? 0, total: batch.total_contacts ?? json.data.sent ?? 0, failed: json.data.failed ?? 0, pct: 100 });
        }
      }
    } catch {
      showToast('Batch execution failed', 'error');
    } finally {
      if (progressPollRef.current) { clearInterval(progressPollRef.current); progressPollRef.current = null; }
      setExecuting(false);
    }
  }

  async function fetchPreview(limit?: number) {
    setLoadingPreview(true);
    try {
      const params = new URLSearchParams({ chapter_id: chapterId });
      if (limit != null) params.set('t1_limit', String(limit));
      const res = await fetch(`/api/outreach/preview-chapter?${params}`);
      const json = await res.json();
      if (json.error) { showToast(json.error, 'error'); return; }
      setPreview(json);
      if (t1Limit === null) setT1Limit(json.t1.max_cap);
      setShowPreview(true);
    } catch {
      showToast('Failed to load preview', 'error');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function loadBatchContacts(batchId: string, notes: string) {
    setLoadingBatchContacts(true);
    try {
      let ids: { t1: string[]; t2: string[]; t3: string[] } = { t1: [], t2: [], t3: [] };
      try {
        const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
        if (parsed?.contact_ids) ids = parsed.contact_ids;
      } catch { /* no contact_ids */ }
      const allIds = [...ids.t1, ...ids.t2, ...ids.t3];
      if (allIds.length === 0) { setBatchContacts([]); setLoadingBatchContacts(false); return; }
      const res = await fetch(`/api/outreach/batch-contacts?ids=${allIds.slice(0, 200).join(',')}`);
      const json = await res.json();
      const idToTouch: Record<string, 'T1' | 'T2' | 'T3'> = {};
      ids.t1.forEach((id: string) => { idToTouch[id] = 'T1'; });
      ids.t2.forEach((id: string) => { idToTouch[id] = 'T2'; });
      ids.t3.forEach((id: string) => { idToTouch[id] = 'T3'; });
      setBatchContacts((json.data || []).map((c: PreviewContact) => ({ ...c, touch: idToTouch[c.id] ?? 'T1' })));
    } catch {
      setBatchContacts([]);
    } finally {
      setLoadingBatchContacts(false);
    }
  }

  async function compileBatch() {
    setCompiling(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/outreach/compile-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, date: today, t1_limit: t1Limit ?? undefined, force: true }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, 'error');
      } else if (json.total === 0) {
        showToast(json.message || 'No eligible contacts found.', 'info');
      } else if (json.existing) {
        showToast('Batch loaded — approve and execute below.', 'info');
        setBatch(json.batch);
      } else {
        showToast(`✓ Compiled batch: ${json.batch?.total_contacts} contacts`, 'success');
        setBatch(json.batch);
        setShowPreview(false);
      }
    } catch {
      showToast('Failed to compile batch', 'error');
    } finally {
      setCompiling(false);
    }
  }

  const pct = stats?.outreach_coverage_pct ?? 0;
  const pctColor = pct > 50 ? '#059669' : pct >= 25 ? '#d97706' : '#dc2626';

  return (
    <section style={{ marginBottom: 24 }}>
      {/* Section Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {expanded ? <ChevronDown size={16} style={{ color: '#5C5449' }} /> : <ChevronRight size={16} style={{ color: '#5C5449' }} />}
          <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: '1rem', color: '#1B2A4A', margin: 0 }}>
            Outreach Overview — {chapterName}
          </h3>
        </div>
        <button
          onClick={e => { e.stopPropagation(); fetchStats(); fetchBatch(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5C5449', padding: 4 }}
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {expanded && (
        <>
          {/* Coverage stat + compile button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            {stats && !loadingStats ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 3,
                background: pct > 50 ? 'rgba(5,150,105,0.08)' : pct >= 25 ? 'rgba(217,119,6,0.08)' : 'rgba(220,38,38,0.08)',
                border: `1px solid ${pctColor}22`,
              }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: pctColor }}>{pct}%</span>
                <span style={{ fontSize: '0.82rem', color: '#5C5449' }}>
                  outreach coverage ({(stats.outreach_contacted_with_phone ?? 0).toLocaleString()} / {stats.have_phone.toLocaleString()} with phone)
                </span>
              </div>
            ) : loadingStats ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: '0.85rem' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading stats…
              </div>
            ) : null}

            <button
              onClick={() => { if (showPreview) { setShowPreview(false); setPreview(null); } else { fetchPreview(t1Limit ?? undefined); } }}
              disabled={compiling}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', border: 'none', borderRadius: 2,
                background: compiling ? '#9ca3af' : '#1B2A4A', color: '#F7F5F1',
                cursor: compiling ? 'not-allowed' : 'pointer',
                fontSize: '0.82rem', fontWeight: 600, transition: 'background 0.15s ease-out',
              }}
            >
              {loadingPreview || compiling ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={13} />}
              {compiling ? 'Compiling…' : loadingPreview ? 'Loading…' : showPreview ? 'Hide Preview' : 'Preview Batch'}
            </button>
          </div>

          {/* Stats grid */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 14 }}>
              {[
                { label: 'Total Alumni', value: stats.total, icon: <Users size={16} />, color: '#1B2A4A' },
                { label: 'Have Phone', value: stats.have_phone, icon: <Phone size={16} />, color: '#5C5449' },
                { label: 'Mobile', value: stats.imessage, icon: <Smartphone size={16} />, color: '#2A4229' },
                { label: 'Contacted', value: stats.contacted, icon: <MessageSquare size={16} />, color: '#3A5A7A' },
                { label: 'Signed Up', value: stats.signed_up, icon: <CheckCircle2 size={16} />, color: '#059669' },
              ].map(s => (
                <div key={s.label} style={{ background: '#F7F5F1', borderRadius: 2, padding: '10px 12px', border: '1px solid #D9D4CC', textAlign: 'center' }}>
                  <div style={{ color: s.color, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{s.icon}</div>
                  <div style={{ fontSize: '1.1rem', fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, color: s.color }}>{s.value.toLocaleString()}</div>
                  <div style={{ fontSize: '0.7rem', color: '#5C5449', marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Touch queue badges */}
          {stats && (stats.touch1_ready > 0 || stats.touch2_due > 0 || stats.touch3_due > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {stats.touch1_ready > 0 && (
                <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px', borderRadius: 2, background: '#FDF0E0', color: '#6B4A1E' }}>
                  {stats.touch1_ready} ready for T1
                </span>
              )}
              {stats.touch2_due > 0 && (
                <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px', borderRadius: 2, background: '#F5EFE0', color: '#8A5A20' }}>
                  {stats.touch2_due} due T2
                </span>
              )}
              {stats.touch3_due > 0 && (
                <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '3px 10px', borderRadius: 2, background: '#E8EDF5', color: '#1B2A4A' }}>
                  {stats.touch3_due} due T3
                </span>
              )}
            </div>
          )}

          {/* Preview Panel */}
          {showPreview && preview && (
            <div style={{ border: '1px solid #D9D4CC', borderRadius: 8, overflow: 'hidden', marginTop: 8 }}>
              {/* Preview header */}
              <div style={{ background: '#F5F0EB', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1B2A4A' }}>
                  Batch Preview — {(preview.t1.total + preview.t2.total + preview.t3.total)} contacts total
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '0.75rem', color: '#5C5449' }}>
                    T1: {preview.t1.total} · T2: {preview.t2.total} · T3: {preview.t3.total}
                  </span>
                </div>
              </div>

              {/* Warnings */}
              {preview.warnings && preview.warnings.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#FEF3C7', borderBottom: '1px solid #FDE68A' }}>
                  {preview.warnings.map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.78rem', color: '#92400E', marginBottom: i < preview.warnings.length - 1 ? 6 : 0 }}>
                      <span style={{ flexShrink: 0 }}>⚠️</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* T1 limit slider */}
              <div style={{ padding: '12px 14px', borderBottom: '1px solid #ede8e2', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1B2A4A', flexShrink: 0 }}>
                    T1 sends today:
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={Math.min(preview.t1.max_cap, preview.batch_total_cap ?? 30)}
                    value={t1Limit ?? Math.min(preview.t1.max_cap, preview.batch_total_cap ?? 30)}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      setT1Limit(v);
                      fetchPreview(v);
                    }}
                    style={{ flex: 1, accentColor: '#C4874A' }}
                  />
                  <input
                    type="number"
                    min={0}
                    max={Math.min(preview.t1.max_cap, preview.batch_total_cap ?? 30)}
                    value={t1Limit ?? Math.min(preview.t1.max_cap, preview.batch_total_cap ?? 30)}
                    onChange={e => {
                      const v = Math.min(parseInt(e.target.value) || 0, preview.t1.max_cap);
                      setT1Limit(v);
                    }}
                    onBlur={() => fetchPreview(t1Limit ?? undefined)}
                    style={{
                      width: 52, padding: '3px 6px', borderRadius: 6,
                      border: '1px solid #D9D4CC', fontSize: '0.82rem',
                      textAlign: 'center', color: '#1B2A4A',
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0 }}>/ {Math.min(preview.t1.max_cap, preview.batch_total_cap ?? 30)} max today</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                  {preview.lines.active} active lines · {preview.t1.sent_today ?? 0} sent today across all chapters · {preview.t1.max_cap} remaining
                </div>
              </div>

              {/* T1 message preview */}
              {preview.t1.contacts.length > 0 && (() => {
                const firstContact = preview.t1.contacts[0];
                const firstName = firstContact.first_name || 'Alumni';
                const previewMsg = `Hey ${firstName}, is this you? Just verifying we have the right number for the ${fraternity} alumni list at ${school}.`;
                return (
                  <div style={{ padding: '10px 14px', background: '#F0F5FF', borderBottom: '1px solid #DBE5F5', borderTop: '1px solid #DBE5F5' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1B2A4A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>T1 Message Preview</div>
                    <div style={{
                      background: '#fff', border: '1px solid #C7D7F0', borderRadius: 8,
                      padding: '8px 12px', fontSize: '0.83rem', color: '#1B2A4A', lineHeight: 1.5,
                      fontStyle: 'italic', position: 'relative',
                    }}>
                      <span style={{ display: 'inline-block', marginBottom: 2, fontSize: '0.7rem', fontStyle: 'normal', fontWeight: 600, color: '#5C5449' }}>Sent from your Linq line &rarr;</span>
                      <br />
                      &ldquo;{previewMsg}&rdquo;
                    </div>
                    <div style={{ marginTop: 5, fontSize: '0.7rem', color: '#6b7280' }}>
                      Name filled in from first contact on your T1 list: <strong>{firstName}</strong>
                    </div>
                  </div>
                );
              })()}

              {/* Contact list — T1 */}
              {preview.t1.contacts.length > 0 && (
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  <div style={{ padding: '6px 14px', background: '#F9F7F4', fontSize: '0.7rem', fontWeight: 700, color: '#5C5449', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ede8e2' }}>
                    T1 — New Outreach ({preview.t1.total})
                  </div>
                  {preview.t1.contacts.map((c, i) => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 14px', borderBottom: i < preview.t1.contacts.length - 1 ? '1px solid #f5f0eb' : 'none',
                      fontSize: '0.8rem', color: '#1B2A4A', background: '#fff',
                    }}>
                      <span>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</span>
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{c.year ? `'${String(c.year).slice(-2)}` : '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* T2 contacts */}
              {preview.t2.contacts.length > 0 && (
                <div style={{ maxHeight: 160, overflowY: 'auto' }}>
                  <div style={{ padding: '6px 14px', background: '#F9F7F4', fontSize: '0.7rem', fontWeight: 700, color: '#5C5449', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #ede8e2' }}>
                    T2 — Follow-up ({preview.t2.total})
                  </div>
                  {preview.t2.contacts.map((c, i) => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 14px', borderBottom: i < preview.t2.contacts.length - 1 ? '1px solid #f5f0eb' : 'none',
                      fontSize: '0.8rem', color: '#1B2A4A', background: '#fff',
                    }}>
                      <span>{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</span>
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{c.year ? `'${String(c.year).slice(-2)}` : '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Compile button */}
              <div style={{ padding: '10px 14px', background: '#F5F0EB', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={() => { setShowPreview(false); setPreview(null); }}
                  style={{
                    padding: '6px 14px', borderRadius: 7, border: '1px solid #D9D4CC',
                    background: '#fff', color: '#5C5449', fontSize: '0.82rem', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={compileBatch}
                  disabled={compiling}
                  style={{
                    padding: '6px 16px', borderRadius: 7, border: 'none',
                    background: compiling ? '#9ca3af' : '#1B2A4A', color: '#fff',
                    fontSize: '0.82rem', fontWeight: 600, cursor: compiling ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {compiling
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Compiling…</>
                    : <><Zap size={13} /> Compile {(preview.t1.total + preview.t2.total + preview.t3.total)} contacts</>}
                </button>
              </div>
            </div>
          )}

          {/* Pending batch */}
          {!loadingBatch && batch && (() => {
            // Parse sent/remaining from batch notes for executing batches
            let batchSent = 0;
            let batchRemaining: number | null = null;
            try {
              const notesObj = typeof batch.notes === 'string' ? JSON.parse(batch.notes) : batch.notes;
              if (notesObj?.sent != null) batchSent = notesObj.sent;
              if (notesObj?.remaining != null) batchRemaining = notesObj.remaining;
            } catch { /* ignore */ }
            const total = batch.total_contacts ?? 0;
            const progressPct = total > 0 ? Math.round((batchSent / total) * 100) : 0;

            return (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                padding: '10px 14px', borderRadius: 2,
                background: batch.status === 'pending_approval' ? '#FEF3C7' :
                            batch.status === 'approved' ? '#D1FAE5' :
                            batch.status === 'executing' ? '#DBEAFE' :
                            batch.status === 'sending' ? '#DBEAFE' : '#F3F4F6',
                border: '1px solid #D9D4CC',
                fontSize: '0.82rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {batch.status === 'pending_approval' && <Clock size={14} style={{ color: '#B45309' }} />}
                  {batch.status === 'approved' && <CheckCircle2 size={14} style={{ color: '#065F46' }} />}
                  {batch.status === 'executing' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#1D4ED8' }} />}
                  {batch.status === 'sending' && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#1D4ED8' }} />}
                  {batch.status === 'completed' && <CheckCircle2 size={14} style={{ color: '#6B7280' }} />}
                  <span style={{ color: '#1B2A4A' }}>
                    <strong>Today&apos;s batch:</strong>{' '}
                    {total} contacts · {batch.status.replace(/_/g, ' ')}
                    {batch.touch_breakdown && (
                      <span style={{ color: '#5C5449' }}>
                        {' '}· T1: {batch.touch_breakdown.t1?.total ?? 0},
                        T2: {batch.touch_breakdown.t2?.total ?? 0},
                        T3: {batch.touch_breakdown.t3?.total ?? 0}
                      </span>
                    )}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {batch.status === 'pending_approval' && (
                      <button
                        onClick={handleApproveBatch}
                        disabled={approving}
                        style={{
                          padding: '4px 12px', borderRadius: 6, border: 'none',
                          background: approving ? '#9ca3af' : '#1B2A4A', color: '#fff',
                          fontSize: '0.75rem', fontWeight: 600, cursor: approving ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {approving
                          ? <><Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> Approving…</>
                          : <><CheckCircle2 size={11} /> Approve</>}
                      </button>
                    )}
                    {batch.status === 'approved' && !executing && (
                      <button
                        onClick={handleExecuteBatch}
                        disabled={executing}
                        style={{
                          padding: '4px 12px', borderRadius: 6, border: 'none',
                          background: '#C4874A', color: '#fff',
                          fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Send size={11} /> Execute
                      </button>
                    )}
                    {(batch.status === 'completed' || batch.status === 'sending') && (
                      <a
                        href="/nucleus/customer-success"
                        style={{ color: '#C4874A', fontWeight: 600, fontSize: '0.78rem', textDecoration: 'none' }}
                      >
                        View details →
                      </a>
                    )}
                  </div>
                </div>

                {/* Live progress bar while executing (shown as soon as Execute is clicked) */}
                {executing && liveProgress && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#1D4ED8' }}>
                      <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                        Sending {liveProgress.sent} / {liveProgress.total}…
                      </span>
                      {liveProgress.failed > 0 && (
                        <span style={{ color: '#ef4444', fontSize: '0.7rem' }}>{liveProgress.failed} failed</span>
                      )}
                    </div>
                    <div style={{ height: 6, background: '#BFDBFE', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${liveProgress.pct}%`,
                        background: '#2563EB',
                        borderRadius: 3,
                        transition: 'width 0.3s ease-out',
                      }} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6B7280' }}>
                      Live progress — updates every 3 seconds
                    </div>
                  </div>
                )}

                {/* Progress bar for executing batches (not triggered from this session) */}
                {!executing && batch.status === 'executing' && total > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#1D4ED8' }}>
                      <span style={{ fontWeight: 600 }}>In Progress — {batchSent} / {total} sent ({progressPct}%)</span>
                      {batchRemaining !== null && batchRemaining > 0 && (
                        <span style={{ color: '#6B7280' }}>{batchRemaining} remaining</span>
                      )}
                    </div>
                    <div style={{ height: 6, background: '#BFDBFE', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        background: '#2563EB',
                        borderRadius: 3,
                        transition: 'width 0.3s ease-out',
                      }} />
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6B7280' }}>
                      Sending in progress — 25 contacts per run, every 30 min
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Batch History */}
          {batchHistory.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => setHistoryExpanded(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  color: '#5C5449', fontSize: '0.8rem', fontWeight: 500,
                }}
              >
                {historyExpanded
                  ? <ChevronUp size={13} style={{ color: '#9ca3af' }} />
                  : <ChevronRight size={13} style={{ color: '#9ca3af' }} />}
                Batch history ({batchHistory.length})
              </button>
              {historyExpanded && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {batchHistory.map(h => {
                    const statusColor =
                      h.status === 'completed' ? '#065f46' :
                      h.status === 'rejected'  ? '#9ca3af' :
                      h.status === 'executing' ? '#1d4ed8' :
                      h.status === 'sending'   ? '#1d4ed8' : '#6b7280';
                    const statusBg =
                      h.status === 'completed' ? '#d1fae5' :
                      h.status === 'rejected'  ? '#f3f4f6' :
                      h.status === 'executing' ? '#dbeafe' :
                      h.status === 'sending'   ? '#dbeafe' : '#f3f4f6';
                    return (
                      <div
                        key={h.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 12px', borderRadius: 2,
                          border: '1px solid #EDE9E4', background: '#FAFAF8',
                          fontSize: '0.79rem',
                        }}
                      >
                        <span style={{ color: '#5C5449', fontWeight: 500, minWidth: 70 }}>
                          {new Date(h.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        <span style={{ color: '#1B2A4A' }}>
                          {h.total_contacts ?? 0} contacts
                          {h.touch_breakdown && (
                            <span style={{ color: '#9ca3af' }}>
                              {' '}· T1: {h.touch_breakdown.t1?.total ?? 0}, T2: {h.touch_breakdown.t2?.total ?? 0}, T3: {h.touch_breakdown.t3?.total ?? 0}
                            </span>
                          )}
                        </span>
                        <span style={{
                          marginLeft: 'auto', padding: '2px 8px', borderRadius: 3,
                          fontSize: '0.71rem', fontWeight: 600,
                          background: statusBg, color: statusColor,
                        }}>
                          {h.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Sub-section: Contact List ──────────────────────────────────────────────────

function ContactListSection({
  chapterId,
  showToast,
}: {
  chapterId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [contacts, setContacts] = useState<AlumniContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const PAGE_SIZE = 50;

  const fetchContacts = useCallback(async (reset = false) => {
    setLoading(true);
    const offset = reset ? 0 : page * PAGE_SIZE;
    try {
      const params = new URLSearchParams({
        chapter_id: chapterId,
        limit: String(PAGE_SIZE),
        offset: String(offset),
        sort: 'outreach_status',
        sort_dir: 'asc',
      });
      if (statusFilter !== 'all') {
        params.set('outreach_status', statusFilter);
      }

      const res = await fetch(`/api/alumni-contacts?${params}`, { headers: { Authorization: AUTH } });
      const json = await res.json();
      if (!res.ok || json.error) {
        showToast('Failed to load contacts: ' + (json.error?.message ?? 'Unknown error'), 'error');
        return;
      }
      const results = (json.data?.contacts ?? []) as AlumniContact[];
      if (reset) {
        setContacts(results);
        setPage(0);
      } else {
        setContacts(prev => [...prev, ...results]);
      }
      setHasMore(results.length === PAGE_SIZE);
    } catch (err) {
      showToast('Failed to load contacts', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [chapterId, page, statusFilter, showToast]);

  useEffect(() => {
    if (expanded) fetchContacts(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, statusFilter, expanded]);

  const STATUS_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'not_contacted', label: 'Not Contacted' },
    { value: 'touch1_sent', label: 'T1 Sent' },
    { value: 'touch1_confirmed', label: 'Confirmed' },
    { value: 'touch2_sent', label: 'T2 Sent' },
    { value: 'touch3_sent', label: 'T3 Sent' },
    { value: 'no_response', label: 'No Response' },
    { value: 'signed_up', label: 'Signed Up' },
  ];

  return (
    <section style={{ marginBottom: 24 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {expanded ? <ChevronDown size={16} style={{ color: '#5C5449' }} /> : <ChevronRight size={16} style={{ color: '#5C5449' }} />}
          <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: '1rem', color: '#1B2A4A', margin: 0 }}>
            Contact List
          </h3>
        </div>
      </div>

      {expanded && (
        <>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                style={{
                  padding: '4px 12px', borderRadius: 2, fontSize: '0.78rem',
                  border: statusFilter === f.value ? '1px solid #1B2A4A' : '1px solid #D9D4CC',
                  background: statusFilter === f.value ? '#1B2A4A' : '#F7F5F1',
                  color: statusFilter === f.value ? '#F7F5F1' : '#5C5449',
                  cursor: 'pointer', fontWeight: statusFilter === f.value ? 600 : 400,
                  transition: 'all 0.1s ease-out',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Contact rows */}
          {loading && contacts.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', padding: '20px 0', fontSize: '0.85rem' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading contacts…
            </div>
          ) : contacts.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '12px 0' }}>No contacts found.</div>
          ) : (
            <div style={{ border: '1px solid #D9D4CC', borderRadius: 2, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#F7F5F1', borderBottom: '1px solid #D9D4CC' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5C5449' }}>Name</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5C5449' }}>Phone</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5C5449' }}>Status</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#5C5449' }}>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => {
                    const meta = OUTREACH_STATUS_META[c.outreach_status] || OUTREACH_STATUS_META.not_contacted;
                    const lastActivity = c.last_response_at || c.touch3_sent_at || c.touch2_sent_at || c.touch1_sent_at;
                    return (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: i < contacts.length - 1 ? '1px solid #EDE9E4' : 'none',
                          transition: 'background 0.1s ease-out',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F7F5F1')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '8px 12px', color: '#1B2A4A', fontWeight: 500 }}>
                          {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#5C5449', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                          {c.phone_primary || '—'}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 3, fontSize: '0.72rem',
                            fontWeight: 600, background: meta.bg, color: meta.color,
                          }}>
                            {meta.label}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: '0.75rem' }}>
                          {lastActivity
                            ? new Date(lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {hasMore && (
                <div style={{ padding: '10px 12px', borderTop: '1px solid #D9D4CC', textAlign: 'center' }}>
                  <button
                    onClick={() => { setPage(p => p + 1); fetchContacts(); }}
                    disabled={loading}
                    style={{ padding: '6px 16px', border: '1px solid #D9D4CC', borderRadius: 2, background: '#F7F5F1', cursor: 'pointer', fontSize: '0.82rem', color: '#5C5449' }}
                  >
                    {loading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MergedOutreachTab({ chapter, showToast, onUpdate }: MergedOutreachTabProps) {
  const [activeSection, setActiveSection] = useState<'conversations' | 'contacts'>('conversations');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Outreach Stats — always visible at top */}
      <OutreachStatsSection
        chapterId={chapter.id}
        chapterName={chapter.chapter_name}
        fraternity={chapter.fraternity}
        school={chapter.school}
        showToast={showToast}
      />

      {/* Section Switcher */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid #D9D4CC', paddingBottom: 0 }}>
        {([
          { id: 'conversations', label: '💬 Conversations', icon: <MessageSquare size={14} /> },
          { id: 'contacts', label: '👥 Contact List', icon: <Users size={14} /> },
        ] as const).map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              padding: '8px 16px', border: 'none',
              borderBottom: activeSection === s.id ? '2px solid #1B2A4A' : '2px solid transparent',
              background: 'none', cursor: 'pointer',
              fontSize: '0.85rem', fontWeight: activeSection === s.id ? 600 : 400,
              color: activeSection === s.id ? '#1B2A4A' : '#5C5449',
              marginBottom: -1, transition: 'all 0.15s ease-out',
              whiteSpace: 'nowrap',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Conversations — Linq message history */}
      {activeSection === 'conversations' && (
        <ConversationsTab
          showToast={showToast}
          initialChapterId={chapter.id}
          initialChapterName={chapter.chapter_name}
        />
      )}

      {/* Contact List — filterable by outreach status */}
      {activeSection === 'contacts' && (
        <ContactListSection
          chapterId={chapter.id}
          showToast={showToast}
        />
      )}
    </div>
  );
}
