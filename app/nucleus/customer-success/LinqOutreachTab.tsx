'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Send, Clock, CheckCircle2, XCircle, RefreshCw,
  Users, Building2, Zap, MessageSquare, ChevronDown, ChevronRight,
  Ban, Loader2, TrendingUp, PauseCircle, PlayCircle, Phone,
  Edit2, Save, X as XIcon, Sparkles, ChevronUp,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

/* ─── Types ─── */

interface TouchBreakdownLegacy {
  touch1?: number;
  touch2?: number;
  touch3?: number;
}

interface TouchBreakdownRich {
  t1?: { total: number; by_chapter: Record<string, number>; by_year?: Record<string, number> };
  t2?: { total: number; by_chapter: Record<string, number> };
  t3?: { total: number; by_chapter: Record<string, number> };
}

type TouchBreakdown = TouchBreakdownLegacy | TouchBreakdownRich;

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

interface LineSummary {
  active: number;
  owen: { phone: string; status: string; t1_cap: number };
  adam: { phone: string; status: string; t1_cap: number };
  ford: { phone: string; status: string; t1_cap: number };
}

interface SampleMessage {
  contact_name: string;
  chapter_name: string;
  touch_number: number;
  message_preview: string;
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
  lines: LineBreakdown[] | LineSummary | null;
  touch_breakdown: TouchBreakdown | null;
  sample_messages: SampleMessage[] | null;
  results: { sent?: number; failed?: number; errors?: string[] } | null;
  notes: string | null;
}

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
  sms?: number;
  contacted: number;
  responded: number;
  signed_up: number;
  touch1_ready: number;
  touch2_due: number;
  touch3_due: number;
}

/* ─── Status config ─── */

const STATUS_CONFIG: Record<OutreachBatch['status'], {
  label: string; bg: string; color: string; icon: React.ReactNode;
}> = {
  pending_approval: { label: 'Pending Approval', bg: '#fffbeb', color: '#d97706', icon: <Clock size={13} /> },
  approved:         { label: 'Approved',          bg: '#f0fdf4', color: '#16a34a', icon: <CheckCircle2 size={13} /> },
  rejected:         { label: 'Rejected',           bg: '#fef2f2', color: '#dc2626', icon: <XCircle size={13} /> },
  sending:          { label: 'Sending…',           bg: '#eff6ff', color: '#2563eb', icon: <Clock size={13} /> },
  completed:        { label: 'Completed',          bg: '#eff6ff', color: '#2563eb', icon: <CheckCircle2 size={13} /> },
  cancelled:        { label: 'Cancelled',          bg: '#f9fafb', color: '#6b7280', icon: <Ban size={13} /> },
};

/* ─── Helpers ─── */

function getTouchCounts(tb: TouchBreakdown | null): { t1: number; t2: number; t3: number } {
  if (!tb) return { t1: 0, t2: 0, t3: 0 };
  const t = tb as Record<string, unknown>;
  // New rich format: { t1: { total: N }, ... }
  if (t.t1 && typeof t.t1 === 'object' && 't1' in t) {
    const rich = tb as TouchBreakdownRich;
    return {
      t1: rich.t1?.total || 0,
      t2: rich.t2?.total || 0,
      t3: rich.t3?.total || 0,
    };
  }
  // Legacy format: { touch1: N, ... }
  const leg = tb as TouchBreakdownLegacy;
  return { t1: leg.touch1 || 0, t2: leg.touch2 || 0, t3: leg.touch3 || 0 };
}

function isLineSummary(lines: OutreachBatch['lines']): lines is LineSummary {
  return !!lines && 'active' in (lines as object);
}

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

function touchColor(num: number) {
  return num === 1 ? '#8b5cf6' : num === 2 ? '#d97706' : '#2563eb';
}

/* ─── Props ─── */

interface LinqOutreachTabProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/* ═══════════════════════════════════════════════════ COMPONENT ═ */

export default function LinqOutreachTab({ showToast }: LinqOutreachTabProps) {
  const { profile } = useAuth();

  // ── Batches ──
  const [batches, setBatches] = useState<OutreachBatch[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Chapter stats ──
  const [chapterStats, setChapterStats] = useState<ChapterOutreachSummary[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Lines ──
  const [lines, setLines] = useState<LinqLineConfig[]>([]);
  const [linesLoading, setLinesLoading] = useState(true);
  const [pausingLine, setPausingLine] = useState<string | null>(null);
  const [showPauseReason, setShowPauseReason] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('');

  // ── Compile ──
  const [compiling, setCompiling] = useState(false);

  // ── Actions ──
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  // ── Batch contact preview expand state: { [batchId]: { t1: bool, t2: bool, t3: bool } }
  const [contactsExpanded, setContactsExpanded] = useState<Record<string, { t1: boolean; t2: boolean; t3: boolean }>>({});

  // ── Templates ──
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
    } catch { /* silent */ } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchLines = useCallback(async () => {
    setLinesLoading(true);
    try {
      const res = await fetch('/api/linq/lines');
      const json = await res.json();
      if (!json.error && json.data) setLines(json.data);
    } catch { /* silent */ } finally {
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

  useEffect(() => {
    fetchBatches();
    fetchChapterStats();
    fetchLines();
  }, [fetchBatches, fetchChapterStats, fetchLines]);

  useEffect(() => {
    if (linqTemplateChapter) fetchLinqTemplates(linqTemplateChapter);
  }, [linqTemplateChapter, fetchLinqTemplates]);

  /* ─── Compile ─── */

  async function compileOutreach() {
    setCompiling(true);
    try {
      const res = await fetch('/api/outreach/compile', { method: 'POST' });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, 'error');
      } else if (json.total === 0) {
        showToast(json.message || 'No eligible contacts found.', 'info');
      } else if (json.existing && (json.batch?.status === 'pending_approval' || json.batch?.status === 'approved')) {
        showToast('A batch is already awaiting approval.', 'info');
        await fetchBatches();
      } else {
        showToast(`✅ Compiled ${json.batch?.total_contacts || 0} contacts for today.`, 'success');
        await fetchBatches();
      }
    } catch {
      showToast('Failed to compile outreach', 'error');
    } finally {
      setCompiling(false);
    }
  }

  /* ─── Line toggle ─── */

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
        showToast(
          line.is_paused
            ? `${line.label}'s line resumed`
            : `${line.label}'s line paused — quota redistributed`,
          'success',
        );
        setPauseReason('');
        fetchLines();
      }
    } catch {
      showToast('Failed to update line status', 'error');
    } finally {
      setPausingLine(null);
    }
  }

  /* ─── Batch actions ─── */

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

      const execRes = await fetch(`/api/outreach/batches/${batchId}/execute`, { method: 'POST' });
      const execJson = await execRes.json();
      if (execJson.error) {
        showToast(`Approved but execute failed: ${execJson.error}`, 'error');
      } else {
        const d = execJson.data;
        showToast(
          `🚀 Sent ${d.sent} messages${d.failed ? ` · ${d.failed} failed` : ''}${d.skipped ? ` · ${d.skipped} SMS skipped` : ''}`,
          'success',
        );
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
      showToast(
        `🚀 Sent ${d.sent} messages${d.failed ? ` · ${d.failed} failed` : ''}${d.skipped ? ` · ${d.skipped} SMS skipped` : ''}`,
        'success',
      );
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
        setBatches(prev => prev.map(b => b.id === batchId ? { ...b, ...json.data } : b));
      }
    } catch {
      showToast('Failed to reject batch', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  /* ─── Template helpers ─── */

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
  const todayBatch = batches.find(b => b.scheduled_date === today);
  const historyBatches = batches.filter(b => b.scheduled_date !== today);
  const isTodayCompleted = todayBatch?.status === 'completed';

  /* ─── SMS % color ─── */
  function smsColor(pct: number) {
    if (pct < 20) return { color: '#16a34a', bg: '#f0fdf4' };
    if (pct < 40) return { color: '#d97706', bg: '#fffbeb' };
    return { color: '#dc2626', bg: '#fef2f2' };
  }

  /* ═══════════════════════════════════════════════
     SUB-COMPONENT: ContactPreviewList
     ══════════════════════════════════════════════ */

  function ContactPreviewList({ ids }: { ids: string[] }) {
    const [contacts, setContacts] = React.useState<{ id: string; first_name: string | null; last_name: string | null; year: number | null }[] | null>(null);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
      if (!ids.length) return;
      setLoading(true);
      fetch(`/api/outreach/batch-contacts?ids=${ids.slice(0, 200).join(',')}`)
        .then(r => r.json())
        .then(json => setContacts(json.data || []))
        .catch(() => setContacts([]))
        .finally(() => setLoading(false));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) {
      return (
        <div style={{ padding: '8px 0', fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading contacts…
        </div>
      );
    }

    if (!contacts || contacts.length === 0) {
      return <div style={{ padding: '6px 0', fontSize: '0.75rem', color: '#9ca3af' }}>No contacts found.</div>;
    }

    const MAX_SHOWN = 200;
    const shown = contacts.slice(0, MAX_SHOWN);
    const overflow = ids.length > MAX_SHOWN ? ids.length - MAX_SHOWN : 0;

    const formatted = shown.map(c => {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
      const yr = c.year ? `'${String(c.year).slice(-2)}` : null;
      return yr ? `${name} ${yr}` : name;
    });

    return (
      <div style={{ marginTop: 8 }}>
        <div style={{
          fontSize: '0.75rem', color: '#374151', lineHeight: 1.6,
          maxHeight: 120, overflowY: 'auto',
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.6)',
          borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.06)',
        }}>
          {formatted.join(', ')}
          {overflow > 0 && (
            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}> (+{overflow} more)</span>
          )}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════
     SUB-COMPONENT: Rich Touch Breakdown
     ══════════════════════════════════════════════ */

  function RichTouchPanel({ batch }: { batch: OutreachBatch }) {
    const tb = batch.touch_breakdown;
    if (!tb) return null;

    // Determine if this is new rich format
    const isRich = 't1' in (tb as object);
    if (!isRich) return null;

    const rich = tb as TouchBreakdownRich;

    // Lines summary (new format)
    const lineSumm = isLineSummary(batch.lines) ? batch.lines as LineSummary : null;

    // Contact IDs from batch notes for expandable preview
    const batchNotes = (() => {
      try {
        return typeof batch.notes === 'string' ? JSON.parse(batch.notes) : batch.notes;
      } catch { return null; }
    })();
    const contactIds: { t1: string[]; t2: string[]; t3: string[] } = {
      t1: batchNotes?.contact_ids?.t1 || [],
      t2: batchNotes?.contact_ids?.t2 || [],
      t3: batchNotes?.contact_ids?.t3 || [],
    };

    const expanded = contactsExpanded[batch.id] || { t1: false, t2: false, t3: false };
    const toggleExpand = (touch: 't1' | 't2' | 't3') => {
      setContactsExpanded(prev => ({
        ...prev,
        [batch.id]: { ...expanded, [touch]: !expanded[touch] },
      }));
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* T1 */}
        {rich.t1 && rich.t1.total > 0 && (
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#6d28d9', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={13} />
              Touch 1 — New Outreach
              <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '1rem', color: '#4c1d95' }}>
                {rich.t1.total}
              </span>
            </div>
            {/* By chapter */}
            {Object.keys(rich.t1.by_chapter).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: rich.t1.by_year ? 8 : 0 }}>
                {Object.entries(rich.t1.by_chapter).map(([ch, n]) => (
                  <span key={ch} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9', fontWeight: 600 }}>
                    {ch}: {n}
                  </span>
                ))}
              </div>
            )}
            {/* By decade */}
            {rich.t1.by_year && Object.keys(rich.t1.by_year).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {Object.entries(rich.t1.by_year)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([decade, n]) => (
                    <span key={decade} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: '#ddd6fe', color: '#4c1d95', fontWeight: 500 }}>
                      {decade}: {n}
                    </span>
                  ))}
              </div>
            )}
            {/* Expandable contact list */}
            {contactIds.t1.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => toggleExpand('t1')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {expanded.t1 ? <><ChevronUp size={11} /> Hide contacts</> : <><ChevronDown size={11} /> View {contactIds.t1.length} contacts</>}
                </button>
                {expanded.t1 && <ContactPreviewList ids={contactIds.t1} />}
              </div>
            )}
          </div>
        )}

        {/* T2 */}
        {rich.t2 && rich.t2.total > 0 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#b45309', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={13} />
              Touch 2 — Follow-up
              <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '1rem', color: '#78350f' }}>
                {rich.t2.total}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {Object.entries(rich.t2.by_chapter).map(([ch, n]) => (
                <span key={ch} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#b45309', fontWeight: 600 }}>
                  {ch}: {n}
                </span>
              ))}
            </div>
            {/* Expandable contact list */}
            {contactIds.t2.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => toggleExpand('t2')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#b45309', fontWeight: 600, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {expanded.t2 ? <><ChevronUp size={11} /> Hide contacts</> : <><ChevronDown size={11} /> View {contactIds.t2.length} contacts</>}
                </button>
                {expanded.t2 && <ContactPreviewList ids={contactIds.t2} />}
              </div>
            )}
          </div>
        )}

        {/* T3 */}
        {rich.t3 && rich.t3.total > 0 && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#1d4ed8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={13} />
              Touch 3 — Final Follow-up
              <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: '1rem', color: '#1e3a8a' }}>
                {rich.t3.total}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {Object.entries(rich.t3.by_chapter).map(([ch, n]) => (
                <span key={ch} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>
                  {ch}: {n}
                </span>
              ))}
            </div>
            {/* Expandable contact list */}
            {contactIds.t3.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => toggleExpand('t3')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 600, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {expanded.t3 ? <><ChevronUp size={11} /> Hide contacts</> : <><ChevronDown size={11} /> View {contactIds.t3.length} contacts</>}
                </button>
                {expanded.t3 && <ContactPreviewList ids={contactIds.t3} />}
              </div>
            )}
          </div>
        )}

        {/* Lines being used */}
        {lineSumm && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Sending Lines
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['owen', 'adam', 'ford'] as const).map(key => {
                const l = lineSumm[key];
                const active = l.status === 'active';
                return (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 20,
                    background: active ? '#f0fdf4' : '#f9fafb',
                    border: `1px solid ${active ? '#bbf7d0' : '#e5e7eb'}`,
                  }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: active ? '#14532d' : '#9ca3af', textTransform: 'capitalize' }}>
                      {key}
                    </span>
                    <span>{active ? '✅' : '⏸️'}</span>
                    {active && <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>cap: {l.t1_cap}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════
     SUB-COMPONENT: BatchCard
     ══════════════════════════════════════════════ */

  function BatchCard({ batch, featured = false }: { batch: OutreachBatch; featured?: boolean }) {
    const cfg = STATUS_CONFIG[batch.status];
    const isPending = batch.status === 'pending_approval';
    const isExpanded = expandedHistory === batch.id || featured;
    const isApproving = actionLoading === batch.id + ':approve';
    const isRejecting = actionLoading === batch.id + ':reject';
    const showingRejectInput = showRejectInput === batch.id;
    const counts = getTouchCounts(batch.touch_breakdown);
    const isRichFormat = batch.touch_breakdown && 't1' in (batch.touch_breakdown as object);

    return (
      <div style={{
        borderRadius: 14,
        border: featured ? '2px solid #f59e0b' : '1px solid #e5e7eb',
        background: featured ? '#fffdf0' : '#fff',
        overflow: 'hidden',
        boxShadow: featured ? '0 4px 24px rgba(245,158,11,0.12)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
            cursor: !featured ? 'pointer' : 'default',
            borderBottom: isExpanded ? '1px solid #f3f4f6' : 'none',
          }}
          onClick={!featured ? () => setExpandedHistory(isExpanded ? null : batch.id) : undefined}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: featured ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
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
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#f59e0b', color: '#fff', textTransform: 'uppercase' }}>
                  Today
                </span>
              )}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>
                {cfg.icon} {cfg.label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 3, flexWrap: 'wrap' }}>
              {batch.total_contacts != null && (
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={12} /> {batch.total_contacts.toLocaleString()} contacts
                </span>
              )}
              <span style={{ fontSize: '0.8125rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Zap size={12} />
                {[counts.t1 > 0 && `T1:${counts.t1}`, counts.t2 > 0 && `T2:${counts.t2}`, counts.t3 > 0 && `T3:${counts.t3}`].filter(Boolean).join(' · ') || '—'}
              </span>
              {batch.approved_by && (
                <span style={{ fontSize: '0.8125rem', color: '#059669' }}>✓ {batch.approved_by}</span>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {[
                { label: 'Total',   value: batch.total_contacts ?? '—', color: '#374151' },
                { label: 'Touch 1', value: counts.t1, color: '#8b5cf6' },
                { label: 'Touch 2', value: counts.t2, color: '#d97706' },
                { label: 'Touch 3', value: counts.t3, color: '#2563eb' },
              ].map(stat => (
                <div key={stat.label} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 12px', border: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                    {stat.label}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.25rem', color: stat.color }}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Rich breakdown panel (new format) */}
            {isRichFormat && <RichTouchPanel batch={batch} />}

            {/* Legacy chapter breakdown */}
            {!isRichFormat && batch.chapters && batch.chapters.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Building2 size={14} style={{ color: '#8b5cf6' }} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151' }}>Chapters</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {batch.chapters.map(ch => (
                    <span key={ch.chapter_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9', fontWeight: 500 }}>
                      {ch.chapter_name} <span style={{ fontWeight: 700 }}>{ch.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy notes breakdown */}
            {!isRichFormat && batch.notes && (() => {
              try {
                const n = typeof batch.notes === 'string' ? JSON.parse(batch.notes) : batch.notes;
                const chapters: { chapter_name: string; total: number; by_touch: Record<string, number> }[] = n?.chapters || [];
                const tb = n?.touch_breakdown || {};
                if (!chapters.length) return null;
                return (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Batch Breakdown</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      {tb.total_selected != null && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#f3f4f6', fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>Total: {tb.total_selected}</span>}
                      {tb.touch1_new_outreach > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#dbeafe', fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8' }}>T1: {tb.touch1_new_outreach}</span>}
                      {tb.touch2_follow_up > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#fef3c7', fontSize: '0.75rem', fontWeight: 700, color: '#b45309' }}>T2: {tb.touch2_follow_up}</span>}
                      {tb.touch3_final > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, background: '#fce7f3', fontSize: '0.75rem', fontWeight: 700, color: '#9d174d' }}>T3: {tb.touch3_final}</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {chapters.map(ch => (
                        <div key={ch.chapter_name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#f9fafb', borderRadius: 8, fontSize: '0.8125rem' }}>
                          <span style={{ fontWeight: 700, color: '#111827' }}>{ch.chapter_name}</span>
                          <span style={{ fontWeight: 600, color: '#6b7280' }}>{ch.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}

            {/* Execution results */}
            {batch.status === 'completed' && (() => {
              try {
                const n = typeof batch.notes === 'string' ? JSON.parse(batch.notes || '{}') : (batch.notes || {});
                const sent = n.sent ?? batch.results?.sent;
                const failed = n.failed ?? batch.results?.failed;
                const sentToSms = n.sent_to_sms;
                const t1sent = n.t1_sent;
                const t2t3sent = n.t2t3_sent;
                if (sent == null) return null;
                return (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#14532d', marginBottom: 8 }}>Execution Results</div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#16a34a', fontWeight: 600 }}>✓ {sent} sent</span>
                      {t1sent != null && <span style={{ fontSize: '0.8125rem', color: '#8b5cf6' }}>T1: {t1sent}</span>}
                      {t2t3sent != null && <span style={{ fontSize: '0.8125rem', color: '#d97706' }}>T2/T3: {t2t3sent}</span>}
                      {sentToSms != null && sentToSms > 0 && <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>SMS: {sentToSms}</span>}
                      {failed != null && failed > 0 && <span style={{ fontSize: '0.8125rem', color: '#dc2626' }}>✗ {failed} failed</span>}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}

            {/* Timestamps */}
            {!isPending && (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.8rem', color: '#9ca3af' }}>
                {batch.approved_by && <span>Approved by <strong>{batch.approved_by}</strong> · {formatTs(batch.approved_at)}</span>}
                {batch.executed_at && <span>Executed {formatTs(batch.executed_at)}</span>}
              </div>
            )}

            {/* Approve/Reject buttons */}
            {isPending && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => approveBatch(batch.id)}
                    disabled={!!actionLoading}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px 24px', borderRadius: 10, border: 'none',
                      background: isApproving ? '#86efac' : 'linear-gradient(135deg, #16a34a, #22c55e)',
                      color: '#fff', fontWeight: 700, fontSize: '0.9375rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      opacity: actionLoading && !isApproving ? 0.6 : 1,
                      boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
                    }}
                  >
                    {isApproving ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={18} />}
                    {isApproving ? 'Approving…' : 'Approve & Run'}
                  </button>

                  <button
                    onClick={() => showingRejectInput ? rejectBatch(batch.id) : setShowRejectInput(batch.id)}
                    disabled={!!actionLoading}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px 24px', borderRadius: 10, border: 'none',
                      background: isRejecting ? '#fca5a5' : 'linear-gradient(135deg, #dc2626, #ef4444)',
                      color: '#fff', fontWeight: 700, fontSize: '0.9375rem',
                      cursor: actionLoading ? 'not-allowed' : 'pointer',
                      opacity: actionLoading && !isRejecting ? 0.6 : 1,
                      boxShadow: '0 2px 8px rgba(220,38,38,0.2)',
                    }}
                  >
                    {isRejecting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={18} />}
                    {isRejecting ? 'Rejecting…' : showingRejectInput ? 'Confirm Reject' : 'Reject'}
                  </button>
                </div>

                {showingRejectInput && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={rejectNotes}
                      onChange={e => setRejectNotes(e.target.value)}
                      placeholder="Reason for rejection (optional)"
                      autoFocus
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: 8,
                        border: '1px solid #fca5a5', fontSize: '0.875rem',
                        background: '#fff5f5', outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => { setShowRejectInput(null); setRejectNotes(''); }}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#6b7280' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Approved — run now button */}
            {batch.status === 'approved' && !batch.executed_at && (
              <button
                onClick={() => executeBatch(batch.id)}
                disabled={!!actionLoading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '11px 20px', borderRadius: 10, border: 'none',
                  background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                  color: '#fff', fontWeight: 700, fontSize: '0.9375rem',
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                }}
              >
                <Send size={16} />
                Run Now
              </button>
            )}

            {/* Sending state */}
            {batch.status === 'sending' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #3b82f6', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1d4ed8' }}>Sends in progress — do not refresh</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /* ─── Main render ─── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Send size={16} />
            </div>
            Linq Outreach
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            Compile, approve, and send daily alumni outreach batches.
          </p>
        </div>
        <button
          onClick={() => { fetchBatches(); fetchChapterStats(); fetchLines(); }}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', color: '#374151' }}
        >
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 1 — Chapter Stats Cards
          ═══════════════════════════════════════════════ */}
      <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={15} style={{ color: '#8b5cf6' }} />
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>Chapter Stats</span>
          </div>
          <button
            onClick={fetchChapterStats}
            disabled={statsLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: statsLoading ? 'not-allowed' : 'pointer', fontSize: '0.75rem', color: '#374151' }}
          >
            <RefreshCw size={12} style={{ animation: statsLoading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        {statsLoading ? (
          <div style={{ padding: '16px 18px', color: '#9ca3af', fontSize: '0.8125rem' }}>Loading stats…</div>
        ) : chapterStats.length === 0 ? (
          <div style={{ padding: '16px 18px', color: '#9ca3af', fontSize: '0.8125rem' }}>No chapter data.</div>
        ) : (
          <div style={{
            display: 'flex', gap: 12,
            padding: '14px 18px',
            overflowX: chapterStats.length > 3 ? 'auto' : 'visible',
            flexWrap: chapterStats.length > 3 ? 'nowrap' : 'wrap',
          }}>
            {chapterStats.map(ch => {
              const smsPct = (ch.imessage + (ch.sms || 0)) > 0
                ? Math.round(((ch.sms || 0) / (ch.imessage + (ch.sms || 0))) * 100)
                : 0;
              const { color: smsC, bg: smsBg } = smsColor(smsPct);
              const convPct = ch.contacted > 0 ? Math.round((ch.signed_up / ch.contacted) * 100) : 0;

              return (
                <div
                  key={ch.chapter_id}
                  style={{
                    flex: '0 0 auto',
                    minWidth: 180, maxWidth: 240,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: '#fafafa',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', marginBottom: 10 }}>
                    {ch.chapter_name}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { label: 'Alumni',     value: ch.total.toLocaleString(),       color: '#374151' },
                      { label: 'Phones',     value: ch.have_phone.toLocaleString(),   color: '#374151' },
                      { label: 'Contacted',  value: ch.contacted.toLocaleString(),    color: '#d97706' },
                      { label: 'Responded',  value: ch.responded.toLocaleString(),    color: '#2563eb' },
                      { label: 'Signed Up',  value: ch.signed_up.toLocaleString(),    color: '#16a34a' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                        <span style={{ color: '#6b7280' }}>{row.label}</span>
                        <span style={{ fontWeight: 600, color: row.color }}>{row.value}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginTop: 4, paddingTop: 6, borderTop: '1px solid #f3f4f6' }}>
                      <span style={{ color: '#6b7280' }}>% SMS</span>
                      <span style={{ fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: smsBg, color: smsC }}>
                        {smsPct}%
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ color: '#6b7280' }}>Conv %</span>
                      <span style={{ fontWeight: 600, color: convPct >= 10 ? '#16a34a' : '#d97706' }}>{convPct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 2 — Linq Lines
          ═══════════════════════════════════════════════ */}
      <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Phone size={15} style={{ color: '#6b7280' }} />
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>Sending Lines</span>
          </div>
          {lines.filter(l => l.is_paused).length > 0 && (
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#d97706', background: '#fef3c7', padding: '2px 10px', borderRadius: 20 }}>
              {lines.filter(l => l.is_paused).length} paused
            </span>
          )}
        </div>

        {linesLoading ? (
          <div style={{ padding: '14px 18px', color: '#9ca3af', fontSize: '0.8125rem' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {lines.map((line, i) => {
              const activeLines = lines.filter(l => !l.is_paused);
              const totalPool = lines.reduce((s, l) => s + l.daily_limit, 0);
              const effectiveLimit = line.is_paused ? 0 : (activeLines.length > 0 ? Math.min(Math.floor(totalPool / activeLines.length), 50) : 0);
              const isToggling = pausingLine === line.line_phone;
              const showingReason = showPauseReason === line.line_phone;
              const lineColors = [['#ede9fe', '#7c3aed'], ['#dbeafe', '#1d4ed8'], ['#d1fae5', '#065f46']];

              return (
                <div key={line.line_phone} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: line.is_paused ? '#f3f4f6' : lineColors[i][0],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 700,
                      color: line.is_paused ? '#9ca3af' : lineColors[i][1],
                    }}>
                      {line.label[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: line.is_paused ? '#9ca3af' : '#111827' }}>{line.label}</span>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{line.line_phone}</span>
                        {line.is_paused ? (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: '#fef2f2', color: '#dc2626' }}>⏸ Paused</span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a' }}>● Active</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>
                        {line.is_paused
                          ? (line.pause_reason ? `Reason: ${line.pause_reason}` : 'Quota redistributed to active lines')
                          : `Cap: ${effectiveLimit}/day · Limit: ${line.daily_limit}`}
                      </div>
                    </div>
                    <button
                      onClick={() => togglePause(line)}
                      disabled={isToggling}
                      style={{
                        padding: '6px 14px', borderRadius: 8,
                        border: `1px solid ${line.is_paused ? '#bbf7d0' : '#fecaca'}`,
                        background: line.is_paused ? '#f0fdf4' : '#fef2f2',
                        color: line.is_paused ? '#16a34a' : '#dc2626',
                        cursor: isToggling ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem', fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                      }}
                    >
                      {isToggling
                        ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
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
                        onKeyDown={e => {
                          if (e.key === 'Enter') togglePause(line);
                          if (e.key === 'Escape') { setShowPauseReason(null); setPauseReason(''); }
                        }}
                        style={{ flex: 1, padding: '7px 12px', border: '1px solid #fecaca', borderRadius: 8, fontSize: '0.8125rem', outline: 'none' }}
                      />
                      <button onClick={() => togglePause(line)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                        Confirm Pause
                      </button>
                      <button onClick={() => { setShowPauseReason(null); setPauseReason(''); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>
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

      {/* ═══════════════════════════════════════════════
          SECTION 3 — Today's Outreach
          ═══════════════════════════════════════════════ */}
      <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={15} style={{ color: '#f59e0b' }} />
          <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>Today&apos;s Outreach</span>
          {todayBatch && (
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: STATUS_CONFIG[todayBatch.status].bg, color: STATUS_CONFIG[todayBatch.status].color }}>
              {STATUS_CONFIG[todayBatch.status].label}
            </span>
          )}
        </div>

        <div style={{ padding: '16px 18px' }}>
          {loading ? (
            <div style={{ height: 60, borderRadius: 10, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Show batch card when one exists */}
              {todayBatch && <BatchCard batch={todayBatch} featured />}

              {/* Compile button: shown when no batch, or batch is rejected/completed */}
              {/* Only show compile button when no batch OR batch was rejected. Hide for completed — today's batch already ran. */}
              {(!todayBatch || todayBatch.status === 'rejected') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: todayBatch ? '4px 0' : '20px 0' }}>
                  {!todayBatch && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#374151', marginBottom: 4 }}>
                        No outreach compiled for today
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>
                        Click below to compile a fresh batch from eligible contacts.
                      </div>
                    </div>
                  )}
                  <button
                    onClick={compileOutreach}
                    disabled={compiling}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '12px 28px', borderRadius: 10, border: 'none',
                      background: compiling ? '#fde68a' : 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                      color: compiling ? '#78350f' : '#fff', fontWeight: 700, fontSize: '0.9375rem',
                      cursor: compiling ? 'not-allowed' : 'pointer',
                      boxShadow: compiling ? 'none' : '0 2px 10px rgba(245,158,11,0.3)',
                    }}
                  >
                    {compiling ? (
                      <>
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        Tony is compiling…
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} />
                        {todayBatch ? 'Compile New Batch' : 'Compile Today\'s Outreach'}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          SECTION 4 — Past Jobs
          ═══════════════════════════════════════════════ */}
      {historyBatches.length > 0 && (
        <div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={14} style={{ color: '#6b7280' }} />
            Past Jobs ({historyBatches.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historyBatches.map(batch => (
              <BatchCard key={batch.id} batch={batch} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {batches.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '48px 24px', border: '2px dashed #e5e7eb', borderRadius: 14, color: '#9ca3af' }}>
          <Send size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 600, color: '#6b7280' }}>No outreach batches yet</h3>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            Compile your first batch above to get started.
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          Linq Message Templates (collapsible, bottom)
          ═══════════════════════════════════════════════ */}
      <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
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
          <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: 'linear-gradient(135deg, #ec4899, #db2777)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <MessageSquare size={14} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>Linq Message Templates</span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 8 }}>Touch 1 / 2 / 3 SMS scripts per chapter</span>
          </div>
          {linqTemplatesExpanded
            ? <ChevronDown size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
            : <ChevronRight size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
          }
        </button>

        {linqTemplatesExpanded && (
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', flexShrink: 0 }}>Chapter:</label>
              <select
                value={linqTemplateChapter}
                onChange={e => { setLinqTemplateChapter(e.target.value); setLinqEditingTouch(null); }}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.875rem', color: '#111827', cursor: 'pointer', minWidth: 200 }}
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
                    <div key={touch} style={{ borderRadius: 10, border: isEditing ? `1.5px solid ${cfg.color}40` : '1px solid #f3f4f6', background: isEditing ? cfg.bg + '30' : '#f9fafb', overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ padding: '2px 9px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.7rem', flexShrink: 0 }}>
                          {cfg.label}
                        </span>
                        {template && !template.is_default && (
                          <span style={{ fontSize: '0.65rem', color: '#059669', fontWeight: 600, background: '#f0fdf4', padding: '1px 7px', borderRadius: 20 }}>Custom</span>
                        )}
                        {template?.is_default && (
                          <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 600, background: '#f3f4f6', padding: '1px 7px', borderRadius: 20 }}>Default</span>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          {!isEditing && (
                            <button onClick={() => openLinqEditor(touch)} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Edit2 size={11} /> {template ? 'Edit' : 'Create'}
                            </button>
                          )}
                          {isEditing && (
                            <button onClick={() => setLinqEditingTouch(null)} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <XIcon size={11} /> Cancel
                            </button>
                          )}
                        </div>
                      </div>

                      {!isEditing && template && (
                        <div style={{ padding: '0 14px 10px' }}>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: '#374151', lineHeight: 1.5, fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            &ldquo;{template.template_text?.slice(0, 180)}{(template.template_text?.length || 0) > 180 ? '…' : ''}&rdquo;
                          </p>
                        </div>
                      )}

                      {isEditing && (
                        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Subject <span style={{ color: '#9ca3af', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                            </label>
                            <input type="text" value={linqEditorSubject} onChange={e => setLinqEditorSubject(e.target.value)} placeholder="Subject line" style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: '0.8125rem', outline: 'none', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Message Body
                            </label>
                            <textarea value={linqEditorContent} onChange={e => setLinqEditorContent(e.target.value)} rows={6} spellCheck={false} placeholder="Hey {first_name}, this is {sender_name}…" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: '0.8125rem', fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', outline: 'none', lineHeight: 1.5 }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={saveLinqTemplate} disabled={linqSaving || !linqEditorContent.trim()} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: linqSaving || !linqEditorContent.trim() ? '#9ca3af' : `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`, color: '#fff', cursor: linqSaving || !linqEditorContent.trim() ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {linqSaving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Save size={13} /> Save Template</>}
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
