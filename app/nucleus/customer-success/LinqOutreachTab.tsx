'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Send, Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Users, Building2, Zap, MessageSquare, ChevronDown, ChevronRight,
  Ban, Loader2, TrendingUp, PauseCircle, PlayCircle, Phone,
  Edit2, Save, X as XIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/* ─── Types ─── */

interface TouchBreakdown {
  touch1?: number;
  touch2?: number;
  touch3?: number;
}

interface ChapterBreakdown {
  chapter_id: string;
  chapter_name: string;
  count: number;
}

interface LineBreakdown {
  line_label: string;
  line_phone: string;
  count: number;
}

interface SampleMessage {
  contact_name: string;
  chapter_name: string;
  touch_number: number;
  message_preview: string;
}

interface BatchResults {
  sent?: number;
  failed?: number;
  errors?: string[];
}

interface OutreachBatch {
  id: string;
  created_at: string;
  scheduled_date: string;
  status: 'pending_approval' | 'approved' | 'sending' | 'rejected' | 'completed' | 'cancelled';
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  total_contacts: number | null;
  chapters: ChapterBreakdown[] | null;
  lines: LineBreakdown[] | null;
  touch_breakdown: TouchBreakdown | null;
  sample_messages: SampleMessage[] | null;
  results: BatchResults | null;
  notes: string | null;
}

/* ─── Status config ─── */

const STATUS_CONFIG: Record<OutreachBatch['status'], {
  label: string;
  bg: string;
  color: string;
  icon: React.ReactNode;
}> = {
  pending_approval: {
    label: 'Pending Approval',
    bg: '#fffbeb',
    color: '#d97706',
    icon: <Clock size={13} />,
  },
  approved: {
    label: 'Approved',
    bg: '#f0fdf4',
    color: '#16a34a',
    icon: <CheckCircle2 size={13} />,
  },
  rejected: {
    label: 'Rejected',
    bg: '#fef2f2',
    color: '#dc2626',
    icon: <XCircle size={13} />,
  },
  sending: {
    label: 'Sending…',
    bg: '#eff6ff',
    color: '#2563eb',
    icon: <Clock size={13} />,
  },
  completed: {
    label: 'Completed',
    bg: '#eff6ff',
    color: '#2563eb',
    icon: <CheckCircle2 size={13} />,
  },
  cancelled: {
    label: 'Cancelled',
    bg: '#f9fafb',
    color: '#6b7280',
    icon: <Ban size={13} />,
  },
};

/* ─── Props ─── */

interface LinqOutreachTabProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/* ═══════════════════════════════════════════════════ COMPONENT ═ */

interface LinqLineConfig {
  line_number: number;
  label: string;
  line_phone: string;
  daily_limit: number;
  is_paused: boolean;
  pause_reason: string | null;
}

interface LinqTemplate {
  id: string;
  chapter_id: string;
  touch_number: number;
  template_text: string;
  subject_line?: string;
  is_active: boolean;
  is_default?: boolean;
}

interface ChapterOutreachSummary {
  chapter_id: string;
  chapter_name: string;
  total: number;
  have_phone: number;
  imessage: number;
  contacted: number;
  responded: number;
  signed_up: number;
  touch1_ready: number;
  touch2_due: number;
  touch3_due: number;
}

export default function LinqOutreachTab({ showToast }: LinqOutreachTabProps) {
  const { profile } = useAuth();
  const [batches, setBatches] = useState<OutreachBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [chapterStats, setChapterStats] = useState<ChapterOutreachSummary[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [lines, setLines] = useState<LinqLineConfig[]>([]);
  const [linesLoading, setLinesLoading] = useState(true);
  const [pausingLine, setPausingLine] = useState<string | null>(null);
  const [showPauseReason, setShowPauseReason] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  // ── Linq Message Templates section ──
  const [linqTemplatesExpanded, setLinqTemplatesExpanded] = useState(false);
  const [linqTemplateChapter, setLinqTemplateChapter] = useState<string>('');
  const [linqTemplates, setLinqTemplates] = useState<LinqTemplate[]>([]);
  const [linqTemplatesLoading, setLinqTemplatesLoading] = useState(false);
  const [linqEditingTouch, setLinqEditingTouch] = useState<number | null>(null);
  const [linqEditorContent, setLinqEditorContent] = useState('');
  const [linqEditorSubject, setLinqEditorSubject] = useState('');
  const [linqSaving, setLinqSaving] = useState(false);

  /* ─── Data fetching ─── */

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/batches?limit=50');
      const json = await res.json();
      if (json.error) showToast(json.error, 'error');
      else setBatches(json.data || []);
    } catch {
      showToast('Failed to load outreach batches', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchChapterStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/alumni/stats');
      const json = await res.json();
      if (!json.error && json.data) setChapterStats(json.data);
    } catch {
      // silent — stats are supplemental
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchLines = useCallback(async () => {
    setLinesLoading(true);
    try {
      const res = await fetch('/api/linq/lines');
      const json = await res.json();
      if (!json.error && json.data) setLines(json.data);
    } catch {
      // silent
    } finally {
      setLinesLoading(false);
    }
  }, []);

  const fetchLinqTemplates = useCallback(async (chapterId: string) => {
    if (!chapterId) return;
    setLinqTemplatesLoading(true);
    try {
      const res = await fetch(`/api/outreach/templates?chapter_id=${chapterId}`);
      const json = await res.json();
      if (!json.error) setLinqTemplates(json.data?.templates || []);
    } catch { /* silent */ } finally {
      setLinqTemplatesLoading(false);
    }
  }, []);

  useEffect(() => { fetchBatches(); fetchChapterStats(); fetchLines(); }, [fetchBatches, fetchChapterStats, fetchLines]);

  useEffect(() => {
    if (linqTemplateChapter) fetchLinqTemplates(linqTemplateChapter);
  }, [linqTemplateChapter, fetchLinqTemplates]);

  async function togglePause(line: LinqLineConfig) {
    if (!line.is_paused && !showPauseReason) {
      setShowPauseReason(line.line_phone);
      setPauseReason('');
      return;
    }
    setPausingLine(line.line_phone);
    setShowPauseReason(null);
    try {
      const res = await fetch('/api/linq/lines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_phone: line.line_phone,
          is_paused: !line.is_paused,
          pause_reason: pauseReason.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(`Failed to update line: ${json.error}`, 'error');
      } else {
        showToast(line.is_paused ? `${line.label}'s line resumed` : `${line.label}'s line paused — quota redistributed`, 'success');
        setPauseReason('');
        fetchLines();
      }
    } catch {
      showToast('Failed to update line status', 'error');
    } finally {
      setPausingLine(null);
    }
  }

  /* ─── Actions ─── */

  async function approveBatch(batchId: string) {
    setActionLoading(batchId + ':approve');
    try {
      const approverName = profile?.name || 'Employee';
      const approveRes = await fetch(`/api/outreach/batches/${batchId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: approverName }),
      });
      const approveJson = await approveRes.json();
      if (approveJson.error) { showToast(approveJson.error, 'error'); return; }

      showToast('✅ Approved — executing sends now…', 'success');
      setBatches(prev => prev.map(b => b.id === batchId ? { ...b, ...approveJson.data } : b));

      // Immediately trigger execution
      const execRes = await fetch(`/api/outreach/batches/${batchId}/execute`, { method: 'POST' });
      const execJson = await execRes.json();
      if (execJson.error) {
        showToast(`Approved but execute failed: ${execJson.error}`, 'error');
      } else {
        const d = execJson.data;
        showToast(`🚀 Sent ${d.sent} messages${d.failed ? ` · ${d.failed} failed` : ''}${d.skipped ? ` · ${d.skipped} SMS skipped` : ''}`, 'success');
        fetchBatches();
      }
    } catch {
      showToast('Failed to approve batch', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function executeBatch(batchId: string) {
    if (!confirm('Execute this approved batch now? This will send Linq messages. Do NOT run twice.')) return;
    setActionLoading(batchId + ':execute');
    try {
      const res = await fetch(`/api/outreach/batches/${batchId}/execute`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { showToast(`Execute failed: ${json.error}`, 'error'); return; }
      const d = json.data;
      showToast(`🚀 Sent ${d.sent} messages${d.failed ? ` · ${d.failed} failed` : ''}${d.skipped ? ` · ${d.skipped} SMS skipped` : ''}`, 'success');
      fetchBatches();
    } catch {
      showToast('Execute failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectBatch(batchId: string) {
    setActionLoading(batchId + ':reject');
    try {
      const res = await fetch(`/api/outreach/batches/${batchId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: rejectNotes || undefined }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, 'error');
      } else {
        showToast('Batch rejected.', 'info');
        setShowRejectInput(null);
        setRejectNotes('');
        setBatches(prev => prev.map(b =>
          b.id === batchId ? { ...b, ...json.data } : b
        ));
      }
    } catch {
      showToast('Failed to reject batch', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  /* ─── Linq template helpers ─── */

  const LINQ_TOUCH_CONFIG: Record<number, { label: string; color: string; bg: string }> = {
    1: { label: 'Touch 1 — Verify',    color: '#7c3aed', bg: '#ede9fe' },
    2: { label: 'Touch 2 — Pitch',     color: '#d97706', bg: '#fef3c7' },
    3: { label: 'Touch 3 — Follow-up', color: '#2563eb', bg: '#dbeafe' },
  };

  function openLinqEditor(touch: number) {
    const existing = linqTemplates.find(t => t.touch_number === touch);
    setLinqEditorContent(existing?.template_text || '');
    setLinqEditorSubject(existing?.subject_line || '');
    setLinqEditingTouch(touch);
  }

  async function saveLinqTemplate() {
    if (!linqTemplateChapter || linqEditingTouch === null) return;
    setLinqSaving(true);
    try {
      const res = await fetch('/api/outreach/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: linqTemplateChapter,
          touch_number: linqEditingTouch,
          template_text: linqEditorContent,
          subject_line: linqEditorSubject.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error.message || 'Failed to save template', 'error');
      } else {
        showToast('Template saved', 'success');
        setLinqEditingTouch(null);
        fetchLinqTemplates(linqTemplateChapter);
      }
    } catch {
      showToast('Failed to save template', 'error');
    } finally {
      setLinqSaving(false);
    }
  }

  /* ─── Derived data ─── */

  const today = new Date().toISOString().split('T')[0];
  const todayBatch = batches.find(b => b.scheduled_date === today && b.status === 'pending_approval');
  const pendingBatches = batches.filter(b => b.status === 'pending_approval' && b.scheduled_date !== today);
  const historyBatches = batches.filter(b => b.status !== 'pending_approval');

  /* ─── Helpers ─── */

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function formatTs(ts: string | null) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  }

  function touchLabel(num: number) {
    return num === 1 ? 'Touch 1' : num === 2 ? 'Touch 2' : 'Touch 3';
  }

  function touchColor(num: number) {
    return num === 1 ? '#8b5cf6' : num === 2 ? '#d97706' : '#2563eb';
  }

  /* ─── Sub-components ─── */

  function BatchCard({ batch, featured = false }: { batch: OutreachBatch; featured?: boolean }) {
    const cfg = STATUS_CONFIG[batch.status];
    const isPending = batch.status === 'pending_approval';
    const isExpanded = expandedHistory === batch.id || featured;
    const isApproving = actionLoading === batch.id + ':approve';
    const isRejecting = actionLoading === batch.id + ':reject';
    const showingRejectInput = showRejectInput === batch.id;

    return (
      <div
        style={{
          borderRadius: 14,
          border: featured ? '2px solid #f59e0b' : '1px solid #e5e7eb',
          background: featured ? '#fffdf0' : '#fff',
          overflow: 'hidden',
          boxShadow: featured
            ? '0 4px 24px rgba(245,158,11,0.12)'
            : '0 1px 4px rgba(0,0,0,0.04)',
          transition: 'box-shadow 0.15s',
        }}
      >
        {/* Card header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 18px',
            cursor: !featured ? 'pointer' : 'default',
            borderBottom: isExpanded ? '1px solid #f3f4f6' : 'none',
          }}
          onClick={!featured ? () => setExpandedHistory(isExpanded ? null : batch.id) : undefined}
        >
          {/* Icon */}
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: featured
              ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
              : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <Send size={18} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>
                {formatDate(batch.scheduled_date)}
              </span>
              {featured && (
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em',
                  padding: '2px 8px', borderRadius: 20,
                  background: '#f59e0b', color: '#fff',
                  textTransform: 'uppercase',
                }}>
                  Today
                </span>
              )}
              {/* Status badge */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: '0.75rem', fontWeight: 600,
                padding: '2px 8px', borderRadius: 20,
                background: cfg.bg, color: cfg.color,
              }}>
                {cfg.icon} {cfg.label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 3, flexWrap: 'wrap' }}>
              {batch.total_contacts != null && (
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={12} /> {batch.total_contacts.toLocaleString()} contacts
                </span>
              )}
              {batch.touch_breakdown && (
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Zap size={12} />
                  {Object.entries(batch.touch_breakdown)
                    .filter(([, v]) => (v as number) > 0)
                    .map(([k, v]) => `${k.replace('touch', 'T')}:${v}`)
                    .join(' · ')}
                </span>
              )}
              {batch.approved_by && (
                <span style={{ fontSize: '0.8125rem', color: '#059669' }}>
                  ✓ Approved by {batch.approved_by}
                </span>
              )}
            </div>
          </div>

          {!featured && (
            <div style={{ color: '#9ca3af', flexShrink: 0 }}>
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
          )}
        </div>

        {/* Expanded body */}
        {isExpanded && (
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Stats row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 10,
            }}>
              {[
                { icon: <Users size={15} />, label: 'Total Contacts', value: batch.total_contacts ?? '—', color: '#374151' },
                { icon: <Zap size={15} />, label: 'Touch 1', value: batch.touch_breakdown?.touch1 ?? 0, color: '#8b5cf6' },
                { icon: <Zap size={15} />, label: 'Touch 2', value: batch.touch_breakdown?.touch2 ?? 0, color: '#d97706' },
                { icon: <Zap size={15} />, label: 'Touch 3', value: batch.touch_breakdown?.touch3 ?? 0, color: '#2563eb' },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: '#f9fafb', borderRadius: 10, padding: '10px 12px',
                  border: '1px solid #f3f4f6',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: stat.color, marginBottom: 2 }}>
                    {stat.icon}
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {stat.label}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.25rem', color: stat.color }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Chapter breakdown */}
            {batch.chapters && batch.chapters.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Building2 size={14} style={{ color: '#8b5cf6' }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151' }}>
                    Chapters ({batch.chapters.length})
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {batch.chapters.map(ch => (
                    <span key={ch.chapter_id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20,
                      background: '#ede9fe', color: '#6d28d9', fontWeight: 500,
                    }}>
                      {ch.chapter_name}
                      <span style={{ fontWeight: 700, color: '#4c1d95' }}>{ch.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Line breakdown */}
            {batch.lines && batch.lines.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Zap size={14} style={{ color: '#d97706' }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151' }}>
                    Lines
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {batch.lines.map((line, idx) => (
                    <span key={idx} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20,
                      background: '#fef3c7', color: '#92400e', fontWeight: 500,
                    }}>
                      {line.line_label}
                      <span style={{ fontWeight: 700 }}>{line.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sample messages */}
            {batch.sample_messages && batch.sample_messages.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <MessageSquare size={14} style={{ color: '#2563eb' }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151' }}>
                    Sample Messages
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {batch.sample_messages.slice(0, 3).map((msg, idx) => (
                    <div key={idx} style={{
                      background: '#f0f9ff', border: '1px solid #bae6fd',
                      borderRadius: 10, padding: '10px 14px',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 6, flexWrap: 'wrap',
                      }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#0c4a6e' }}>
                          {msg.contact_name}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          · {msg.chapter_name}
                        </span>
                        <span style={{
                          fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px',
                          borderRadius: 20, background: touchColor(msg.touch_number) + '1a',
                          color: touchColor(msg.touch_number),
                        }}>
                          {touchLabel(msg.touch_number)}
                        </span>
                      </div>
                      <p style={{
                        margin: 0, fontSize: '0.8125rem', color: '#374151',
                        lineHeight: 1.5, fontStyle: 'italic',
                      }}>
                        &ldquo;{msg.message_preview}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results (post-execution) */}
            {batch.results && (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: 10, padding: '12px 16px',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#14532d', marginBottom: 6 }}>
                  Execution Results
                </div>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {batch.results.sent != null && (
                    <span style={{ fontSize: '0.8125rem', color: '#16a34a' }}>
                      ✓ {batch.results.sent} sent
                    </span>
                  )}
                  {batch.results.failed != null && batch.results.failed > 0 && (
                    <span style={{ fontSize: '0.8125rem', color: '#dc2626' }}>
                      ✗ {batch.results.failed} failed
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Approved-by / timestamps (non-pending) */}
            {!isPending && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.8rem', color: '#9ca3af' }}>
                {batch.approved_by && <span>Approved by <strong>{batch.approved_by}</strong> · {formatTs(batch.approved_at)}</span>}
                {batch.executed_at && <span>Executed {formatTs(batch.executed_at)}</span>}
              </div>
            )}

            {/* Chapter + Touch breakdown (parsed from notes JSON) */}
            {batch.notes && (() => {
              try {
                const n = typeof batch.notes === 'string' ? JSON.parse(batch.notes) : batch.notes;
                const chapters: { chapter_name: string; total: number; by_touch: Record<string, number> }[] = n?.chapters || [];
                const tb = n?.touch_breakdown || {};
                if (!chapters.length) return null;
                return (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Batch Breakdown</div>
                    {/* Touch summary row */}
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                      {tb.total_selected != null && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Total: {tb.total_selected}</span>}
                      {tb.touch1_new_outreach > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#dbeafe', fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8' }}>T1 New: {tb.touch1_new_outreach}</span>}
                      {tb.touch2_follow_up > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#fef3c7', fontSize: '0.75rem', fontWeight: 700, color: '#b45309' }}>T2 Follow-up: {tb.touch2_follow_up}</span>}
                      {tb.touch3_final > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#fce7f3', fontSize: '0.75rem', fontWeight: 700, color: '#9d174d' }}>T3 Final: {tb.touch3_final}</span>}
                    </div>
                    {/* Per-chapter rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {chapters.map((ch) => (
                        <div key={ch.chapter_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: '0.8125rem' }}>
                          <span style={{ fontWeight: 700, color: '#111827' }}>{ch.chapter_name}</span>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            {Object.entries(ch.by_touch || {}).map(([touch, count]) => (
                              <span key={touch} style={{ padding: '2px 8px', borderRadius: 12, background: touch.includes('touch1') ? '#dbeafe' : touch.includes('touch2') ? '#fef3c7' : touch.includes('touch3') ? '#fce7f3' : '#f3f4f6', color: touch.includes('touch1') ? '#1d4ed8' : touch.includes('touch2') ? '#b45309' : touch.includes('touch3') ? '#9d174d' : '#374151', fontSize: '0.7rem', fontWeight: 700 }}>
                                {touch === 'touch1_sent' ? 'T2 follow-up' : touch === 'not_contacted' ? 'T1 new' : touch === 'touch2_sent' ? 'T3 final' : touch}: {count as number}
                              </span>
                            ))}
                            <span style={{ fontWeight: 700, color: '#6b7280', fontSize: '0.75rem' }}>{ch.total} total</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}

            {/* Approve / Reject buttons for pending batches */}
            {isPending && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => approveBatch(batch.id)}
                    disabled={!!actionLoading}
                    style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px 24px', borderRadius: 10, border: 'none',
                      background: isApproving ? '#86efac' : 'linear-gradient(135deg, #16a34a, #22c55e)',
                      color: '#fff', fontWeight: 700, fontSize: '0.9375rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      opacity: actionLoading && !isApproving ? 0.6 : 1,
                      boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isApproving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={18} />}
                    {isApproving ? 'Approving…' : 'Approve Outreach'}
                  </button>

                  <button
                    onClick={() => {
                      if (showingRejectInput) {
                        rejectBatch(batch.id);
                      } else {
                        setShowRejectInput(batch.id);
                      }
                    }}
                    disabled={!!actionLoading}
                    style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px 24px', borderRadius: 10, border: 'none',
                      background: isRejecting ? '#fca5a5' : showingRejectInput ? '#dc2626' : 'linear-gradient(135deg, #dc2626, #ef4444)',
                      color: '#fff', fontWeight: 700, fontSize: '0.9375rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      opacity: actionLoading && !isRejecting ? 0.6 : 1,
                      boxShadow: '0 2px 8px rgba(220,38,38,0.2)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {isRejecting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={18} />}
                    {isRejecting ? 'Rejecting…' : showingRejectInput ? 'Confirm Reject' : 'Reject'}
                  </button>
                </div>

                {/* Reject reason input */}
                {showingRejectInput && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={rejectNotes}
                      onChange={e => setRejectNotes(e.target.value)}
                      placeholder="Reason for rejection (optional)"
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        border: '1px solid #fca5a5', fontSize: '0.875rem',
                        background: '#fff5f5', outline: 'none',
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => { setShowRejectInput(null); setRejectNotes(''); }}
                      style={{
                        padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
                        background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#6b7280',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Sending state — in-flight indicator */}
            {batch.status === 'sending' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #3b82f6', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1d4ed8' }}>Sends in progress — do not refresh</div>
              </div>
            )}

            {/* Approved state — execute runs automatically on approval, no manual button needed */}
            {batch.status === 'approved' && batch.approved_by && !batch.executed_at && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: '#fef3c7', border: '1px solid #fcd34d' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#78350f', fontSize: '0.875rem' }}>
                    ✅ Approved by {batch.approved_by} — sends executing automatically
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: 2 }}>
                    {formatTs(batch.approved_at)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ─── Main render ─── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
            }}>
              <Send size={16} />
            </div>
            Linq Outreach
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            Review and approve daily alumni outreach batches before they're sent.
          </p>
        </div>
        <button
          onClick={fetchBatches}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            border: '1px solid #e5e7eb', background: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '0.8125rem', color: '#374151',
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* ── Lines panel ── */}
      <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={15} style={{ color: '#6b7280' }} />
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>Sending Lines</span>
          </div>
          {lines.filter(l => l.is_paused).length > 0 && (
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#d97706', background: '#fef3c7', padding: '2px 10px', borderRadius: 20 }}>
              {lines.filter(l => l.is_paused).length} paused — quota redistributed
            </span>
          )}
        </div>
        {linesLoading ? (
          <div style={{ padding: '14px 18px', color: '#9ca3af', fontSize: '0.8125rem' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {lines.map((line, i) => {
              const activeLines = lines.filter(l => !l.is_paused);
              const totalPool = lines.reduce((s, l) => s + l.daily_limit, 0);
              const effectiveLimit = line.is_paused ? 0 : Math.min(Math.floor(totalPool / activeLines.length), 50);
              const isToggling = pausingLine === line.line_phone;
              const showingReason = showPauseReason === line.line_phone;

              return (
                <div key={line.line_phone} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Line indicator */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: line.is_paused ? '#f3f4f6' : ['#ede9fe', '#dbeafe', '#d1fae5'][i],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700,
                      color: line.is_paused ? '#9ca3af' : ['#7c3aed', '#1d4ed8', '#065f46'][i],
                    }}>
                      {line.label[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: line.is_paused ? '#9ca3af' : '#111827' }}>
                          {line.label}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{line.line_phone}</span>
                        {line.is_paused ? (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: '#fef2f2', color: '#dc2626' }}>
                            ⏸ Paused
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a' }}>
                            ● Active
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                        {line.is_paused
                          ? (line.pause_reason ? `Reason: ${line.pause_reason}` : 'Quota redistributed to active lines')
                          : `${effectiveLimit} contacts/day${effectiveLimit !== line.daily_limit ? ` (redistributed from ${line.daily_limit})` : ''}`
                        }
                      </div>
                    </div>
                    <button
                      onClick={() => togglePause(line)}
                      disabled={isToggling}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: `1px solid ${line.is_paused ? '#bbf7d0' : '#fecaca'}`,
                        background: line.is_paused ? '#f0fdf4' : '#fef2f2',
                        color: line.is_paused ? '#16a34a' : '#dc2626',
                        cursor: isToggling ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 6,
                        flexShrink: 0, transition: 'all 0.15s',
                      }}
                    >
                      {isToggling
                        ? <Loader2 size={13} className="animate-spin" />
                        : line.is_paused
                          ? <><PlayCircle size={13} /> Resume</>
                          : <><PauseCircle size={13} /> Pause</>
                      }
                    </button>
                  </div>
                  {showingReason && (
                    <div style={{ padding: '0 18px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={pauseReason}
                        onChange={e => setPauseReason(e.target.value)}
                        placeholder={`Reason for pausing ${line.label}'s line (optional)`}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') togglePause(line); if (e.key === 'Escape') { setShowPauseReason(null); setPauseReason(''); } }}
                        style={{
                          flex: 1, padding: '7px 12px', border: '1px solid #fecaca',
                          borderRadius: 8, fontSize: '0.8125rem', outline: 'none',
                          background: '#fff', color: '#111827',
                        }}
                      />
                      <button
                        onClick={() => togglePause(line)}
                        style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Confirm Pause
                      </button>
                      <button
                        onClick={() => { setShowPauseReason(null); setPauseReason(''); }}
                        style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Chapter outreach summary table */}
      {chapterStats.length > 0 && (
        <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={15} style={{ color: '#8b5cf6' }} />
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>Chapter Outreach Overview</span>
          </div>
          {statsLoading ? (
            <div style={{ padding: '16px 18px', color: '#9ca3af', fontSize: '0.8125rem' }}>Loading stats…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Chapter', 'Alumni', 'iMessage', 'Contacted', 'Responded', 'Signed Up', 'Conv %', 'Queue'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Chapter' ? 'left' : 'center', fontWeight: 600, color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chapterStats.map((ch, i) => {
                    const convPct = ch.contacted > 0 ? Math.round((ch.signed_up / ch.contacted) * 100) : 0;
                    const queue = (ch.touch1_ready || 0) + (ch.touch2_due || 0) + (ch.touch3_due || 0);
                    return (
                      <tr key={ch.chapter_id} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>{ch.chapter_name}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', color: '#374151' }}>{ch.total.toLocaleString()}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>{(ch.imessage || 0).toLocaleString()}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', color: '#d97706', fontWeight: 600 }}>{ch.contacted.toLocaleString()}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{ch.responded.toLocaleString()}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center', color: '#059669', fontWeight: 700 }}>{ch.signed_up.toLocaleString()}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 20, background: convPct >= 10 ? '#f0fdf4' : '#fff7ed', color: convPct >= 10 ? '#16a34a' : '#d97706', fontWeight: 700, fontSize: '0.75rem' }}>
                            {convPct}%
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          {queue > 0 ? (
                            <span style={{ padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#92400e', fontWeight: 600, fontSize: '0.75rem' }}>
                              {queue} pending
                            </span>
                          ) : (
                            <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading ? (
        /* Loading skeleton */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: 72, borderRadius: 12, background: '#f3f4f6',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.1}s`,
            }} />
          ))}
        </div>
      ) : (
        <>
          {/* ── Today's pending batch (featured) ── */}
          {todayBatch ? (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 12,
              }}>
                <AlertTriangle size={16} style={{ color: '#d97706' }} />
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#92400e' }}>
                  Needs Approval — Today&apos;s Outreach
                </span>
              </div>
              <BatchCard batch={todayBatch} featured />
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 18px', borderRadius: 12,
              background: '#f0fdf4', border: '1px solid #bbf7d0',
            }}>
              <CheckCircle2 size={20} style={{ color: '#16a34a' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#14532d' }}>
                  No pending outreach for today
                </div>
                <div style={{ fontSize: '0.8rem', color: '#16a34a' }}>
                  Batches appear here when the outreach agent queues them for review.
                </div>
              </div>
            </div>
          )}

          {/* ── Other pending batches ── */}
          {pendingBatches.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                Other Pending ({pendingBatches.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingBatches.map(batch => (
                  <BatchCard key={batch.id} batch={batch} />
                ))}
              </div>
            </div>
          )}

          {/* ── History ── */}
          {historyBatches.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151', marginBottom: 10 }}>
                History
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {historyBatches.map(batch => (
                  <BatchCard key={batch.id} batch={batch} />
                ))}
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {batches.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '48px 24px',
              border: '2px dashed #e5e7eb', borderRadius: 14,
              color: '#9ca3af',
            }}>
              <Send size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
              <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 600, color: '#6b7280' }}>
                No outreach batches yet
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                When the outreach agent prepares a batch for sending, it will appear here for approval.
              </p>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          ── Linq Message Templates (collapsible, bottom) ──
          ══════════════════════════════════════════════════ */}
      <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>

        {/* Section toggle header */}
        <button
          onClick={() => setLinqTemplatesExpanded(prev => !prev)}
          style={{
            width: '100%', padding: '13px 18px',
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: linqTemplatesExpanded ? '1px solid #f3f4f6' : 'none',
            textAlign: 'left',
          }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: 'linear-gradient(135deg, #ec4899, #db2777)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            <MessageSquare size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>
              Linq Message Templates
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 8 }}>
              Touch 1 / 2 / 3 SMS scripts per chapter
            </span>
          </div>
          {linqTemplatesExpanded
            ? <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
            : <ChevronRight size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
          }
        </button>

        {linqTemplatesExpanded && (
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Chapter selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                Chapter:
              </label>
              <select
                value={linqTemplateChapter}
                onChange={e => { setLinqTemplateChapter(e.target.value); setLinqEditingTouch(null); }}
                style={{
                  padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb',
                  background: '#fff', fontSize: '0.875rem', color: '#111827',
                  cursor: 'pointer', minWidth: 200,
                }}
              >
                <option value="">Select chapter…</option>
                {chapterStats.map(ch => (
                  <option key={ch.chapter_id} value={ch.chapter_id}>{ch.chapter_name}</option>
                ))}
              </select>
            </div>

            {!linqTemplateChapter ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '0.8125rem', background: '#f9fafb', borderRadius: 10 }}>
                Select a chapter to view or edit its Linq SMS templates.
              </div>
            ) : linqTemplatesLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: '0.8125rem', padding: '8px 0' }}>
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                Loading templates…
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3].map(touch => {
                  const cfg = LINQ_TOUCH_CONFIG[touch];
                  const template = linqTemplates.find(t => t.touch_number === touch);
                  const isEditing = linqEditingTouch === touch;

                  return (
                    <div
                      key={touch}
                      style={{
                        borderRadius: 10,
                        border: isEditing ? `1.5px solid ${cfg.color}40` : '1px solid #f3f4f6',
                        background: isEditing ? cfg.bg + '30' : '#f9fafb',
                        overflow: 'hidden',
                      }}
                    >
                      {/* Touch header */}
                      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          padding: '2px 9px', borderRadius: 20,
                          background: cfg.bg, color: cfg.color,
                          fontWeight: 700, fontSize: '0.7rem', flexShrink: 0,
                        }}>
                          {cfg.label}
                        </span>
                        {template && !template.is_default && (
                          <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600, background: '#f0fdf4', padding: '1px 7px', borderRadius: 20 }}>
                            Custom
                          </span>
                        )}
                        {template?.is_default && (
                          <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 600, background: '#f3f4f6', padding: '1px 7px', borderRadius: 20 }}>
                            Default
                          </span>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          {!isEditing && (
                            <button
                              onClick={() => openLinqEditor(touch)}
                              style={{
                                padding: '4px 10px', borderRadius: 7,
                                border: '1px solid #e5e7eb', background: '#fff',
                                color: '#374151', cursor: 'pointer',
                                fontSize: '0.7rem', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <Edit2 size={11} /> {template ? 'Edit' : 'Create'}
                            </button>
                          )}
                          {isEditing && (
                            <button
                              onClick={() => setLinqEditingTouch(null)}
                              style={{
                                padding: '4px 10px', borderRadius: 7,
                                border: '1px solid #fecaca', background: '#fef2f2',
                                color: '#dc2626', cursor: 'pointer',
                                fontSize: '0.7rem', fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <XIcon size={11} /> Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Preview of existing template text (not editing) */}
                      {!isEditing && template && (
                        <div style={{ padding: '0 14px 10px' }}>
                          <p style={{
                            margin: 0, fontSize: '0.8rem', color: '#374151',
                            lineHeight: 1.5, fontStyle: 'italic',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>
                            &ldquo;{template.template_text?.slice(0, 180)}{(template.template_text?.length || 0) > 180 ? '…' : ''}&rdquo;
                          </p>
                        </div>
                      )}

                      {/* Editor */}
                      {isEditing && (
                        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {/* Subject line (optional) */}
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Subject <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                            </label>
                            <input
                              type="text"
                              value={linqEditorSubject}
                              onChange={e => setLinqEditorSubject(e.target.value)}
                              placeholder="Subject line (if applicable)"
                              style={{
                                width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb',
                                borderRadius: 7, fontSize: '0.8125rem', color: '#111827',
                                outline: 'none', boxSizing: 'border-box', background: '#fff',
                              }}
                            />
                          </div>

                          {/* Message body */}
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Message Body
                            </label>
                            <textarea
                              value={linqEditorContent}
                              onChange={e => setLinqEditorContent(e.target.value)}
                              rows={6}
                              spellCheck={false}
                              placeholder="Hey {first_name}, this is {sender_name}…"
                              style={{
                                width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb',
                                borderRadius: 7, fontSize: '0.8125rem', color: '#111827',
                                fontFamily: 'inherit', boxSizing: 'border-box',
                                resize: 'vertical', outline: 'none', lineHeight: 1.5,
                                background: '#fff',
                              }}
                            />
                          </div>

                          {/* Save */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              onClick={saveLinqTemplate}
                              disabled={linqSaving || !linqEditorContent.trim()}
                              style={{
                                padding: '7px 16px', borderRadius: 8, border: 'none',
                                background: linqSaving || !linqEditorContent.trim() ? '#9ca3af' : `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                                color: '#fff', cursor: linqSaving || !linqEditorContent.trim() ? 'not-allowed' : 'pointer',
                                fontSize: '0.8125rem', fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: 6,
                              }}
                            >
                              {linqSaving
                                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                                : <><Save size={13} /> Save Template</>
                              }
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </div>
  );
}
