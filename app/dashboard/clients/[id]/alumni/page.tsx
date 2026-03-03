'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Upload, Download, Search, X, Trash2, ChevronLeft, ChevronRight,
  Users, Phone, Mail, UserCheck, FileSpreadsheet, AlertCircle, CheckCircle2,
  ChevronDown, Filter, Send, Zap, MessageSquare, RefreshCw, MessageCircle,
  Activity,
} from 'lucide-react';
import {
  supabase,
  AlumniContact,
  OutreachStatus,
  OUTREACH_STATUS_CONFIG,
  ChapterWithOnboarding,
  SENDING_LINES,
} from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';
import ConversationViewer from '@/components/ConversationViewer';

type SortField = 'first_name' | 'last_name' | 'phone_primary' | 'email' | 'year' | 'outreach_status' | 'created_at' | 'assigned_line' | 'touch1_sent_at' | 'last_response_at';
type SortDir = 'asc' | 'desc';

interface LineTodayStat { number: number; label: string; daily_limit: number; sent_today: number; }
interface AlumniStats {
  total: number; have_phone: number; have_email: number; contacted: number;
  imessage: number; sms: number; unverified: number; responded: number; signed_up: number;
  touch1_ready: number; touch2_due: number; touch3_due: number; responses_to_check: number;
  line_today: LineTodayStat[];
}
interface ImportResult { imported: number; skipped: number; duplicates: number; dual_phone_count: number; queue_assigned: number; errors: { row: number; message: string }[]; }

const LINE_COLORS: Record<number, string> = { 1: '#3b82f6', 2: '#16a34a', 3: '#f59e0b' };
const LINE_LABELS: Record<number, string> = { 1: 'O', 2: 'A', 3: 'F' };

const CLASSIFICATION_COLORS: Record<string, { color: string; bg: string }> = {
  confirmed: { color: '#16a34a', bg: '#dcfce7' },
  wrong_number: { color: '#dc2626', bg: '#fee2e2' },
  question: { color: '#2563eb', bg: '#dbeafe' },
  declined: { color: '#6b7280', bg: '#f3f4f6' },
  signed_up: { color: '#059669', bg: '#d1fae5' },
  no_response: { color: '#9ca3af', bg: '#f3f4f6' },
};

function formatPhone(e164: string | null): string {
  if (!e164) return '—';
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return e164;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: OutreachStatus }) {
  const cfg = OUTREACH_STATUS_CONFIG[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

function TouchDots({ contact }: { contact: AlumniContact }) {
  const dots = [
    { sent: !!contact.touch1_sent_at, key: 1 },
    { sent: !!contact.touch2_sent_at, key: 2 },
    { sent: !!contact.touch3_sent_at, key: 3 },
  ];
  const hasResponse = !!contact.last_response_at;
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {dots.map(d => (
        <div
          key={d.key}
          title={`Touch ${d.key}${d.sent ? ' — Sent' : ' — Not sent'}`}
          style={{
            width: '8px', height: '8px', borderRadius: '50%',
            backgroundColor: d.sent ? (hasResponse && d.key === dots.filter(x => x.sent).length ? '#2563eb' : '#16a34a') : '#d1d5db',
            transition: 'background-color 0.15s ease',
          }}
        />
      ))}
    </div>
  );
}

function LineCapacityBar({ line }: { line: LineTodayStat }) {
  const pct = Math.min((line.sent_today / line.daily_limit) * 100, 100);
  const barColor = pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#16a34a';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', width: '36px', flexShrink: 0 }}>{line.label}</span>
      <div style={{ flex: 1, height: '4px', background: '#e5e7eb', borderRadius: '2px', overflow: 'hidden', minWidth: '60px' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '2px', transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: '0.7rem', color: '#6b7280', width: '52px', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>{line.sent_today}/{line.daily_limit}</span>
    </div>
  );
}

export default function AlumniPage() {
  const params = useParams();
  const chapterId = params.id as string;

  const [chapter, setChapter] = useState<ChapterWithOnboarding | null>(null);
  const [contacts, setContacts] = useState<AlumniContact[]>([]);
  const emptyStats: AlumniStats = { total: 0, have_phone: 0, have_email: 0, contacted: 0, imessage: 0, sms: 0, unverified: 0, responded: 0, signed_up: 0, touch1_ready: 0, touch2_due: 0, touch3_due: 0, responses_to_check: 0, line_today: [] };
  const [stats, setStats] = useState<AlumniStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [imessageFilter, setImessageFilter] = useState<'all' | 'imessage' | 'sms' | 'unverified'>('all');
  const [lineFilter, setLineFilter] = useState('all');
  const [touchFilter, setTouchFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<string[][] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<OutreachStatus>('not_contacted');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Verify iMessage
  const [verifying, setVerifying] = useState(false);
  const [verifyConfirm, setVerifyConfirm] = useState(false);

  // Send Batch modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTouch, setSendTouch] = useState<1 | 2 | 3>(1);
  const [sendSchool, setSendSchool] = useState('');
  const [sendFraternity, setSendFraternity] = useState('');
  const [sendSignupLink, setSendSignupLink] = useState('');
  const [sendSenderName, setSendSenderName] = useState('Owen');
  const [sendBatchSize, setSendBatchSize] = useState(50);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; per_line: { line: number; label: string; sent: number; remaining: number }[]; errors: { contact_id: string; message: string }[] } | null>(null);

  // Poll responses
  const [polling, setPolling] = useState(false);

  // Conversation viewer
  const [selectedContact, setSelectedContact] = useState<AlumniContact | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Activity feed
  const [activityOpen, setActivityOpen] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('alumni_activity_open') === 'true';
    return false;
  });
  const [activityItems, setActivityItems] = useState<AlumniContact[]>([]);

  const limit = 25;
  const totalPages = Math.ceil(total / limit);

  // ── Data Fetching ──

  const fetchChapter = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('chapters').select('*').eq('id', chapterId).single();
    if (data) setChapter(data);
  }, [chapterId]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/alumni/stats?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.data) setStats(json.data);
    } catch (err) { console.error('Failed to fetch stats:', err); }
  }, [chapterId]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ chapter_id: chapterId, page: String(page), limit: String(limit), sort_by: sortBy, sort_dir: sortDir });
      if (search) p.set('search', search);
      if (filterStatus !== 'all') p.set('status', filterStatus);
      if (imessageFilter !== 'all') p.set('imessage_filter', imessageFilter);
      if (lineFilter !== 'all') p.set('line_filter', lineFilter);
      if (touchFilter !== 'all') p.set('touch_filter', touchFilter);
      const res = await fetch(`/api/alumni?${p}`);
      const json = await res.json();
      if (json.data) { setContacts(json.data.contacts); setTotal(json.data.total); }
    } catch (err) { console.error('Failed to fetch contacts:', err); }
    finally { setLoading(false); }
  }, [chapterId, page, search, filterStatus, imessageFilter, lineFilter, touchFilter, sortBy, sortDir]);

  const fetchActivity = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('alumni_contacts')
      .select('*')
      .eq('chapter_id', chapterId)
      .or('touch1_sent_at.not.is.null,touch2_sent_at.not.is.null,touch3_sent_at.not.is.null,last_response_at.not.is.null')
      .order('updated_at', { ascending: false })
      .limit(20);
    if (data) setActivityItems(data);
  }, [chapterId]);

  useEffect(() => { fetchChapter(); fetchStats(); }, [fetchChapter, fetchStats]);
  useEffect(() => { fetchContacts(); }, [fetchContacts]);
  useEffect(() => { setPage(1); }, [search, filterStatus, imessageFilter, lineFilter, touchFilter]);
  useEffect(() => {
    if (activityOpen) fetchActivity();
  }, [activityOpen, fetchActivity]);

  // ── Actions ──

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  }

  async function handleVerifyIMessage() {
    setVerifyConfirm(false);
    setVerifying(true);
    try {
      const res = await fetch('/api/outreach/verify-imessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
      const json = await res.json();
      if (json.data) {
        showToast(`Verified ${json.data.total_checked} contacts: ${json.data.imessage} iMessage, ${json.data.sms} SMS${json.data.errors > 0 ? `, ${json.data.errors} errors` : ''}`);
        fetchContacts(); fetchStats();
      } else {
        showToast(json.error?.message || 'Verification failed', 'error');
      }
    } catch { showToast('Network error during verification', 'error'); }
    finally { setVerifying(false); }
  }

  async function handleSendBatch() {
    setSending(true);
    try {
      const res = await fetch('/api/outreach/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, touch: sendTouch, sender_name: sendSenderName, school: sendSchool, fraternity: sendFraternity, signup_link: sendSignupLink, batch_size: sendBatchSize }),
      });
      const json = await res.json();
      if (json.data) {
        setSendResult(json.data);
        const lb = json.data.per_line.filter((l: { sent: number }) => l.sent > 0).map((l: { label: string; sent: number }) => `${l.label}: ${l.sent}`).join(', ');
        showToast(`Sent ${json.data.sent} Touch ${sendTouch} messages${lb ? ` (${lb})` : ''}`);
        fetchContacts(); fetchStats();
      } else {
        showToast(json.error?.message || 'Send failed', 'error');
      }
    } catch { showToast('Network error during send', 'error'); }
    finally { setSending(false); }
  }

  async function handlePollResponses() {
    setPolling(true);
    try {
      const res = await fetch('/api/outreach/poll-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId }),
      });
      const json = await res.json();
      if (json.data) {
        const cls = Object.entries(json.data.by_classification || {}).map(([k, v]) => `${v} ${k}`).join(', ');
        showToast(`Checked ${json.data.polled} conversations: ${json.data.new_responses} new responses${cls ? ` (${cls})` : ''}`);
        fetchContacts(); fetchStats();
        if (activityOpen) fetchActivity();
      } else {
        showToast(json.error?.message || 'Poll failed', 'error');
      }
    } catch { showToast('Network error during poll', 'error'); }
    finally { setPolling(false); }
  }

  // ── CSV ──

  function handleFileSelect(file: File) {
    setImportFile(file); setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lns = text.split('\n').filter(l => l.trim());
      const preview = lns.slice(0, 6).map(line => {
        const cells: string[] = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (inQ) { if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
          else { if (ch === '"') inQ = true; else if (ch === ',') { cells.push(cur.trim()); cur = ''; } else if (ch === '\r') continue; else cur += ch; }
        }
        cells.push(cur.trim()); return cells;
      });
      setImportPreview(preview);
    };
    reader.readAsText(file);
  }

  async function doImport() {
    if (!importFile) return; setImporting(true);
    try {
      const fd = new FormData(); fd.append('file', importFile); fd.append('chapter_id', chapterId);
      const res = await fetch('/api/alumni/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (json.data) { setImportResult(json.data); fetchContacts(); fetchStats(); }
      else if (json.error) setImportResult({ imported: 0, skipped: 0, duplicates: 0, dual_phone_count: 0, queue_assigned: 0, errors: [{ row: 0, message: json.error.message }] });
    } catch { setImportResult({ imported: 0, skipped: 0, duplicates: 0, dual_phone_count: 0, queue_assigned: 0, errors: [{ row: 0, message: 'Network error' }] }); }
    finally { setImporting(false); }
  }

  function resetImportModal() { setShowImportModal(false); setImportFile(null); setImportPreview(null); setImportResult(null); setDragOver(false); }

  // ── Bulk ──

  function toggleSelectAll() { setSelected(selected.size === contacts.length ? new Set() : new Set(contacts.map(c => c.id))); }
  function toggleSelect(id: string) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function bulkUpdateStatus() {
    try { await fetch('/api/alumni', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selected), updates: { outreach_status: bulkStatus } }) }); setSelected(new Set()); setShowStatusModal(false); fetchContacts(); fetchStats(); } catch (err) { console.error('Bulk update failed:', err); }
  }
  async function bulkDelete() {
    try { await fetch('/api/alumni', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selected) }) }); setSelected(new Set()); setDeleteConfirm(false); fetchContacts(); fetchStats(); } catch (err) { console.error('Bulk delete failed:', err); }
  }

  function exportCSV() {
    const toExport = selected.size > 0 ? contacts.filter(c => selected.has(c.id)) : contacts;
    const header = 'First Name,Last Name,Phone,Phone 2,Email,Year,Status,Line,Date Added';
    const rows = toExport.map(c => [c.first_name, c.last_name, c.phone_primary || '', c.phone_secondary || '', c.email || '', c.year || '', c.outreach_status, c.assigned_line || '', formatDate(c.created_at)].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `alumni-${chapter?.chapter_name || chapterId}-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function handleSort(field: SortField) { if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortBy(field); setSortDir('asc'); } }

  function toggleActivity() {
    const next = !activityOpen;
    setActivityOpen(next);
    localStorage.setItem('alumni_activity_open', String(next));
  }

  function getActivityEvent(c: AlumniContact): { time: string; text: string } | null {
    const times = [
      c.last_response_at ? { t: c.last_response_at, type: 'response' } : null,
      c.touch3_sent_at ? { t: c.touch3_sent_at, type: 'touch3' } : null,
      c.touch2_sent_at ? { t: c.touch2_sent_at, type: 'touch2' } : null,
      c.touch1_sent_at ? { t: c.touch1_sent_at, type: 'touch1' } : null,
    ].filter(Boolean) as { t: string; type: string }[];
    if (times.length === 0) return null;
    const latest = times[0];
    const name = `${c.first_name} ${c.last_name}`;
    const lineLabel = c.assigned_line ? SENDING_LINES.find(l => l.number === c.assigned_line)?.label : null;
    if (latest.type === 'response') {
      const cls = c.response_classification || 'responded';
      const snippet = c.response_text ? `"${c.response_text.slice(0, 60)}${c.response_text.length > 60 ? '...' : ''}"` : '';
      return { time: latest.t, text: `${name} responded: ${snippet} → ${cls}` };
    }
    const touchNum = latest.type === 'touch1' ? 1 : latest.type === 'touch2' ? 2 : 3;
    return { time: latest.t, text: `${name} — Touch ${touchNum} sent${lineLabel ? ` (${lineLabel})` : ''}` };
  }

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th onClick={() => handleSort(field)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        {children}
        {sortBy === field && <ChevronDown size={14} style={{ transform: sortDir === 'asc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />}
      </span>
    </th>
  );

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <Link href="/nucleus/customer-success" className="module-back"><ArrowLeft size={20} /> Back to Customer Success</Link>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}><Users size={24} /></div>
            <div>
              <h1>Alumni Contacts</h1>
              <p>{chapter?.chapter_name || 'Loading...'}{chapter?.school ? ` — ${chapter.school}` : ''}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* ═══════ SECTION 1: Stats Bar ═══════ */}
        <div className="module-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="module-stat"><span className="module-stat-value">{stats.total}</span><span className="module-stat-label"><Users size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Total Alumni</span></div>
          <div className="module-stat"><span className="module-stat-value" style={{ color: '#8b5cf6' }}>{stats.have_phone}</span><span className="module-stat-label"><Phone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Have Phone</span></div>
          <div className="module-stat"><span className="module-stat-value" style={{ color: '#16a34a' }}>{stats.imessage}</span><span className="module-stat-label"><MessageSquare size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />iMessage</span></div>
          <div className="module-stat"><span className="module-stat-value" style={{ color: '#6b7280' }}>{stats.sms}</span><span className="module-stat-label"><Phone size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />SMS</span></div>
        </div>
        <div className="module-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: '-8px' }}>
          <div className="module-stat"><span className="module-stat-value" style={{ color: '#d97706' }}>{stats.unverified}</span><span className="module-stat-label"><AlertCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Unverified</span></div>
          <div className="module-stat"><span className="module-stat-value" style={{ color: '#10b981' }}>{stats.contacted}</span><span className="module-stat-label"><UserCheck size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Contacted</span></div>
          <div className="module-stat"><span className="module-stat-value" style={{ color: '#2563eb' }}>{stats.responded}</span><span className="module-stat-label"><MessageCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Responded</span></div>
          <div className="module-stat"><span className="module-stat-value" style={{ color: '#16a34a' }}>{stats.signed_up}</span><span className="module-stat-label"><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Signed Up</span></div>
        </div>

        {/* ═══════ SECTION 2: Outreach Control Panel ═══════ */}
        <div style={{
          display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: '20px', alignItems: 'center',
          padding: '14px 20px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px',
          marginBottom: '20px',
        }}>
          {/* Left: Line Capacity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Lines Today</span>
            {(stats.line_today || []).map(line => (
              <LineCapacityBar key={line.number} line={line} />
            ))}
            {(!stats.line_today || stats.line_today.length === 0) && (
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No data</span>
            )}
          </div>

          {/* Center: Ready to Send Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' }}>
            <div style={{ fontSize: '0.8125rem', color: '#374151' }}>
              <span style={{ fontWeight: 700, color: '#8b5cf6' }}>{stats.touch1_ready}</span>
              <span style={{ color: '#6b7280' }}> iMessage contacts ready for </span>
              <span style={{ fontWeight: 600 }}>Touch 1</span>
            </div>
            {(stats.touch2_due > 0 || stats.touch3_due > 0) && (
              <div style={{ fontSize: '0.8125rem', color: '#374151' }}>
                <span style={{ fontWeight: 700, color: '#d97706' }}>{stats.touch2_due + stats.touch3_due}</span>
                <span style={{ color: '#6b7280' }}> follow-ups due </span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  (T2: {stats.touch2_due}, T3: {stats.touch3_due})
                </span>
              </div>
            )}
            {stats.responses_to_check > 0 && (
              <div style={{ fontSize: '0.8125rem', color: '#374151' }}>
                <span style={{ fontWeight: 700, color: '#2563eb' }}>{stats.responses_to_check}</span>
                <span style={{ color: '#6b7280' }}> responses to check</span>
              </div>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <button
              onClick={() => setVerifyConfirm(true)}
              disabled={verifying || stats.unverified === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
                border: '1px solid #fde68a', borderRadius: '8px', background: '#fffbeb',
                color: '#d97706', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                opacity: (verifying || stats.unverified === 0) ? 0.5 : 1, whiteSpace: 'nowrap',
              }}
            >
              {verifying ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={13} />}
              Verify iMessage ({stats.unverified})
            </button>
            <button
              onClick={() => { setSendSchool(chapter?.school || ''); setSendFraternity(chapter?.fraternity || ''); setSendResult(null); setShowSendModal(true); }}
              disabled={sending}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
                border: '1px solid #c4b5fd', borderRadius: '8px', background: '#f5f3ff',
                color: '#7c3aed', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                opacity: sending ? 0.5 : 1, whiteSpace: 'nowrap',
              }}
            >
              <Send size={13} /> Send Next Batch
            </button>
            <button
              onClick={handlePollResponses}
              disabled={polling}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px',
                border: '1px solid #bfdbfe', borderRadius: '8px', background: '#eff6ff',
                color: '#2563eb', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                opacity: polling ? 0.5 : 1, whiteSpace: 'nowrap',
              }}
            >
              {polling ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <MessageCircle size={13} />}
              Check Responses
            </button>
          </div>
        </div>

        {/* ═══════ SECTION 3: Filters + Table + Conversation ═══════ */}
        <div style={{ display: 'flex', gap: '0', minHeight: selectedContact ? '600px' : 'auto' }}>
        <div style={{ flex: selectedContact ? '0 0 65%' : '1 1 100%', minWidth: 0, transition: 'flex 0.2s ease' }}>
        <div className="module-actions-bar">
          <div className="module-search">
            <Search size={18} />
            <input type="text" placeholder="Search by name, email, phone..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9ca3af' }}><X size={16} /></button>}
          </div>
          <div className="module-actions">
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <Filter size={16} style={{ color: '#6b7280' }} />
              <select className="module-filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                {Object.entries(OUTREACH_STATUS_CONFIG).map(([key, cfg]) => (<option key={key} value={key}>{cfg.label}</option>))}
              </select>
              <select className="module-filter-select" value={imessageFilter} onChange={(e) => setImessageFilter(e.target.value as typeof imessageFilter)}>
                <option value="all">All Numbers</option>
                <option value="imessage">iMessage Only</option>
                <option value="sms">SMS Only</option>
                <option value="unverified">Unverified Only</option>
              </select>
              <select className="module-filter-select" value={lineFilter} onChange={(e) => setLineFilter(e.target.value)}>
                <option value="all">All Lines</option>
                {SENDING_LINES.map(l => <option key={l.number} value={String(l.number)}>{l.label}</option>)}
              </select>
              <select className="module-filter-select" value={touchFilter} onChange={(e) => setTouchFilter(e.target.value)}>
                <option value="all">All Touches</option>
                <option value="needs_touch1">Needs Touch 1</option>
                <option value="needs_touch2">Needs Touch 2</option>
                <option value="needs_touch3">Needs Touch 3</option>
                <option value="complete">Complete</option>
                <option value="no_response">No Response</option>
              </select>
            </div>
            {selected.size > 0 && (
              <>
                <button className="module-filter-btn" onClick={() => setShowStatusModal(true)}>Update Status ({selected.size})</button>
                <button className="module-filter-btn" onClick={exportCSV}><Download size={16} /> Export ({selected.size})</button>
                <button className="module-filter-btn" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={() => setDeleteConfirm(true)}><Trash2 size={16} /> Delete ({selected.size})</button>
              </>
            )}
            {selected.size === 0 && <button className="module-filter-btn" onClick={exportCSV} disabled={contacts.length === 0}><Download size={16} /> Export CSV</button>}
            <button className="module-primary-btn" onClick={() => setShowImportModal(true)}><Upload size={18} /> Import CSV</button>
          </div>
        </div>

        {loading ? <div className="module-loading">Loading alumni contacts...</div>
        : contacts.length === 0 && !search && filterStatus === 'all' && imessageFilter === 'all' && lineFilter === 'all' && touchFilter === 'all' ? (
          <div className="module-empty-state"><FileSpreadsheet size={48} /><h3>No alumni contacts yet</h3><p>Import a CSV file to get started with alumni outreach.</p><button className="module-primary-btn" style={{ marginTop: '16px' }} onClick={() => setShowImportModal(true)}><Upload size={18} /> Import CSV</button></div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="module-table">
                <thead><tr>
                  <th style={{ width: '40px' }}><input type="checkbox" checked={contacts.length > 0 && selected.size === contacts.length} onChange={toggleSelectAll} /></th>
                  <SortHeader field="first_name">Name</SortHeader>
                  <SortHeader field="phone_primary">Phone</SortHeader>
                  <th style={{ whiteSpace: 'nowrap', width: '44px' }}>Type</th>
                  <SortHeader field="assigned_line">Line</SortHeader>
                  <SortHeader field="email">Email</SortHeader>
                  <SortHeader field="year">Year</SortHeader>
                  <SortHeader field="outreach_status">Status</SortHeader>
                  <SortHeader field="touch1_sent_at">Touches</SortHeader>
                  <SortHeader field="last_response_at">Last Response</SortHeader>
                  <th style={{ width: '44px' }}></th>
                </tr></thead>
                <tbody>
                  {contacts.map(contact => (
                    <tr key={contact.id} style={{ background: selected.has(contact.id) ? '#f0f4ff' : undefined }}>
                      <td><input type="checkbox" checked={selected.has(contact.id)} onChange={() => toggleSelect(contact.id)} /></td>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{contact.first_name} {contact.last_name}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{formatPhone(contact.phone_primary)}</td>
                      <td>
                        {contact.is_imessage === true && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, color: '#16a34a', backgroundColor: '#dcfce7' }}>iMsg</span>}
                        {contact.is_imessage === false && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', backgroundColor: '#f3f4f6' }}>SMS</span>}
                        {contact.is_imessage === null && contact.phone_primary && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, color: '#d97706', backgroundColor: '#fef3c7' }}>?</span>}
                      </td>
                      <td>
                        {contact.assigned_line ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: '22px', height: '22px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700,
                            color: '#fff', backgroundColor: LINE_COLORS[contact.assigned_line] || '#6b7280',
                          }}>
                            {LINE_LABELS[contact.assigned_line] || contact.assigned_line}
                          </span>
                        ) : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email || '—'}</td>
                      <td style={{ color: '#6b7280', fontSize: '0.85rem' }}>{contact.year || '—'}</td>
                      <td><StatusBadge status={contact.outreach_status} /></td>
                      <td><TouchDots contact={contact} /></td>
                      <td>
                        {contact.response_classification ? (
                          <span
                            title={contact.response_text || ''}
                            style={{
                              display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: '4px',
                              fontSize: '0.7rem', fontWeight: 600, cursor: contact.response_text ? 'help' : 'default',
                              color: CLASSIFICATION_COLORS[contact.response_classification]?.color || '#6b7280',
                              backgroundColor: CLASSIFICATION_COLORS[contact.response_classification]?.bg || '#f3f4f6',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {contact.response_classification}
                          </span>
                        ) : <span style={{ color: '#d1d5db', fontSize: '0.85rem' }}>—</span>}
                      </td>
                      <td>
                        <button
                          onClick={() => setSelectedContact(contact)}
                          title="View conversation"
                          style={{
                            background: selectedContact?.id === contact.id ? '#ede9fe' : 'none',
                            border: '1px solid transparent',
                            borderRadius: '6px', cursor: 'pointer', padding: '4px 6px',
                            color: (contact.provider_conversation_id || contact.linq_chat_id) ? '#7c3aed' : '#d1d5db',
                          }}
                        >
                          <MessageSquare size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '12px 16px', background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Showing {((page-1)*limit)+1}–{Math.min(page*limit, total)} of {total}</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="module-filter-btn" disabled={page<=1} onClick={() => setPage(p => p-1)}><ChevronLeft size={16} /> Prev</button>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Page {page} of {totalPages}</span>
                  <button className="module-filter-btn" disabled={page>=totalPages} onClick={() => setPage(p => p+1)}>Next <ChevronRight size={16} /></button>
                </div>
              </div>
            )}
            {contacts.length === 0 && (search || filterStatus !== 'all' || imessageFilter !== 'all' || lineFilter !== 'all' || touchFilter !== 'all') && (
              <div className="module-empty-state" style={{ padding: '48px' }}><Search size={36} /><h3>No results found</h3><p>Try adjusting your search or filter criteria.</p></div>
            )}
          </>
        )}

        </div>{/* end table column */}

        {/* Conversation Viewer Side Panel */}
        {selectedContact && (
          <div style={{ flex: '0 0 35%', minWidth: '340px', maxWidth: '440px', borderRadius: '0 12px 12px 0', overflow: 'hidden', border: '1px solid #e5e7eb', borderLeft: 'none' }}>
            <ConversationViewer
              contact={selectedContact}
              onClose={() => setSelectedContact(null)}
              onStatusChange={(id, status) => {
                fetchContacts();
                fetchStats();
                // Update selected contact status locally
                setSelectedContact(prev => prev ? { ...prev, outreach_status: status } : null);
              }}
              onRefresh={() => { fetchContacts(); fetchStats(); }}
            />
          </div>
        )}
        </div>{/* end split layout */}

        {/* ═══════ SECTION 4: Activity Feed ═══════ */}
        <div style={{ marginTop: '24px' }}>
          <button
            onClick={toggleActivity}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
              cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: '#374151',
              width: '100%', justifyContent: 'space-between',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={16} style={{ color: '#8b5cf6' }} /> Recent Activity
            </span>
            <ChevronDown size={16} style={{ color: '#9ca3af', transform: activityOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </button>
          {activityOpen && (
            <div style={{ padding: '16px 20px', background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
              {activityItems.length === 0 ? (
                <p style={{ fontSize: '0.8125rem', color: '#9ca3af', padding: '12px 0' }}>No outreach activity yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activityItems.map(c => {
                    const ev = getActivityEvent(c);
                    if (!ev) return null;
                    const isResponse = ev.text.includes('responded');
                    return (
                      <div key={c.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', minWidth: '60px', paddingTop: '2px', whiteSpace: 'nowrap' }}>
                          {timeAgo(ev.time)}
                        </span>
                        <span style={{ fontSize: '0.8125rem', color: '#374151', lineHeight: 1.4 }}>
                          {isResponse && <MessageCircle size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px', color: '#2563eb' }} />}
                          {!isResponse && <Send size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px', color: '#8b5cf6' }} />}
                          {ev.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ═══════ MODALS ═══════ */}

      {/* Import Modal */}
      {showImportModal && (
        <ModalOverlay className="module-modal-overlay" onClose={resetImportModal}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header"><h2>Import Alumni CSV</h2><button className="module-modal-close" onClick={resetImportModal}><X size={20} /></button></div>
            <div className="module-modal-body">
              {!importResult ? (
                <>
                  <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f && (f.name.endsWith('.csv') || f.type === 'text/csv')) handleFileSelect(f); }} onClick={() => fileInputRef.current?.click()} style={{ border: `2px dashed ${dragOver ? '#8b5cf6' : '#d1d5db'}`, borderRadius: '12px', padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#f5f3ff' : '#fafafa', transition: 'all 0.2s ease', marginBottom: '16px' }}>
                    <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
                    <Upload size={32} style={{ color: '#8b5cf6', marginBottom: '12px' }} />
                    <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>{importFile ? importFile.name : 'Drop your CSV file here'}</p>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : 'or click to browse'}</p>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '16px' }}>
                    Columns: First Name, Last Name, Phone (or Phone 1 / Phone 2), Email, Year. Two numbers in one cell (comma/semicolon separated) will be split automatically.
                  </p>
                  {importPreview && importPreview.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>Preview (first {Math.min(importPreview.length - 1, 5)} rows)</h4>
                      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <table className="module-table" style={{ margin: 0 }}><thead><tr>{importPreview[0].map((h, i) => <th key={i} style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                          <tbody>{importPreview.slice(1).map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci} style={{ fontSize: '0.8125rem' }}>{cell}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '24px', padding: '24px', borderRadius: '12px', background: importResult.imported > 0 ? '#f0fdf4' : '#fef2f2' }}>
                    {importResult.imported > 0 ? <CheckCircle2 size={40} style={{ color: '#16a34a', marginBottom: '8px' }} /> : <AlertCircle size={40} style={{ color: '#dc2626', marginBottom: '8px' }} />}
                    <h3 style={{ fontSize: '1.125rem', marginBottom: '4px' }}>{importResult.imported > 0 ? 'Import Complete' : 'Import Failed'}</h3>
                    {importResult.queue_assigned > 0 && (
                      <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{importResult.queue_assigned} contacts auto-assigned to sending lines</p>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ textAlign: 'center', padding: '12px', background: '#f0fdf4', borderRadius: '8px' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{importResult.imported}</div><div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Imported</div></div>
                    <div style={{ textAlign: 'center', padding: '12px', background: '#fef3c7', borderRadius: '8px' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>{importResult.duplicates}</div><div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Duplicates</div></div>
                    <div style={{ textAlign: 'center', padding: '12px', background: '#fee2e2', borderRadius: '8px' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{importResult.skipped}</div><div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Skipped</div></div>
                    <div style={{ textAlign: 'center', padding: '12px', background: '#ede9fe', borderRadius: '8px' }}><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8b5cf6' }}>{importResult.dual_phone_count}</div><div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Dual Phone</div></div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '12px', background: '#fef2f2', borderRadius: '8px', fontSize: '0.8125rem' }}>
                      <strong style={{ display: 'block', marginBottom: '8px' }}>Errors:</strong>
                      {importResult.errors.slice(0, 20).map((err, i) => <div key={i} style={{ color: '#991b1b', marginBottom: '4px' }}>{err.row > 0 ? `Row ${err.row}: ` : ''}{err.message}</div>)}
                      {importResult.errors.length > 20 && <div style={{ color: '#6b7280', marginTop: '8px' }}>...and {importResult.errors.length - 20} more</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={resetImportModal}>{importResult ? 'Close' : 'Cancel'}</button>
              {!importResult && <button className="module-primary-btn" onClick={doImport} disabled={!importFile || importing}>{importing ? 'Importing...' : 'Import'}</button>}
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Bulk Status Modal */}
      {showStatusModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowStatusModal(false)}>
          <div className="module-modal" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header"><h2>Update Status</h2><button className="module-modal-close" onClick={() => setShowStatusModal(false)}><X size={20} /></button></div>
            <div className="module-modal-body">
              <p style={{ marginBottom: '16px', color: '#6b7280' }}>Update status for {selected.size} selected contact{selected.size > 1 ? 's' : ''}.</p>
              <div className="module-form-group"><label>New Status</label>
                <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value as OutreachStatus)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', background: 'white' }}>
                  {Object.entries(OUTREACH_STATUS_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                </select>
              </div>
            </div>
            <div className="module-modal-footer"><button className="module-cancel-btn" onClick={() => setShowStatusModal(false)}>Cancel</button><button className="module-primary-btn" onClick={bulkUpdateStatus}>Update {selected.size} Contact{selected.size > 1 ? 's' : ''}</button></div>
          </div>
        </ModalOverlay>
      )}

      <ConfirmModal isOpen={deleteConfirm} title="Delete Contacts" message={`Are you sure you want to delete ${selected.size} selected contact${selected.size > 1 ? 's' : ''}? This cannot be undone.`} confirmText="Delete" cancelText="Cancel" variant="danger" onConfirm={bulkDelete} onCancel={() => setDeleteConfirm(false)} />

      <ConfirmModal
        isOpen={verifyConfirm}
        title="Verify iMessage Eligibility"
        message={`This will check ${stats.unverified} unverified phone numbers for iMessage eligibility via Linq. Continue?`}
        confirmText="Verify"
        cancelText="Cancel"
        variant="default"
        onConfirm={handleVerifyIMessage}
        onCancel={() => setVerifyConfirm(false)}
      />

      {/* Send Batch Modal */}
      {showSendModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowSendModal(false)}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>Send Next Batch</h2>
              <button className="module-modal-close" onClick={() => setShowSendModal(false)}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              {sendResult ? (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <CheckCircle2 size={40} style={{ color: '#16a34a', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '1.125rem', marginBottom: '8px' }}>Sent {sendResult.sent} Touch {sendTouch} Messages</h3>
                  {sendResult.per_line.filter(l => l.sent > 0).length > 0 && (
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px' }}>
                      {sendResult.per_line.filter(l => l.sent > 0).map(l => (
                        <div key={l.line} style={{ padding: '12px 16px', background: '#f0fdf4', borderRadius: '8px', textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#16a34a' }}>{l.sent}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{l.label} ({l.remaining} left)</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {sendResult.errors.length > 0 && (
                    <div style={{ marginTop: '16px', padding: '12px', background: '#fef2f2', borderRadius: '8px', fontSize: '0.8125rem', textAlign: 'left', maxHeight: '150px', overflowY: 'auto' }}>
                      <strong>{sendResult.errors.length} errors:</strong>
                      {sendResult.errors.slice(0, 10).map((e, i) => <div key={i} style={{ color: '#991b1b', marginTop: '4px' }}>{e.message}</div>)}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="module-form-group">
                    <label>Touch Number</label>
                    <select value={sendTouch} onChange={e => setSendTouch(Number(e.target.value) as 1 | 2 | 3)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', background: 'white' }}>
                      <option value={1}>Touch 1 — Verify ({stats.touch1_ready} ready)</option>
                      <option value={2}>Touch 2 — Pitch + Link ({stats.touch2_due} due)</option>
                      <option value={3}>Touch 3 — Check-in ({stats.touch3_due} due)</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="module-form-group">
                      <label>School</label>
                      <input type="text" value={sendSchool} onChange={e => setSendSchool(e.target.value)} placeholder="e.g. University of Alabama" style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem' }} />
                    </div>
                    <div className="module-form-group">
                      <label>Fraternity</label>
                      <input type="text" value={sendFraternity} onChange={e => setSendFraternity(e.target.value)} placeholder="e.g. Phi Delta Theta" style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem' }} />
                    </div>
                  </div>
                  {sendTouch === 2 && (
                    <div className="module-form-group">
                      <label>Signup Link</label>
                      <input type="text" value={sendSignupLink} onChange={e => setSendSignupLink(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem' }} />
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="module-form-group">
                      <label>Sender Name</label>
                      <select value={sendSenderName} onChange={e => setSendSenderName(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', background: 'white' }}>
                        {SENDING_LINES.map(l => <option key={l.number} value={l.label}>{l.label}</option>)}
                      </select>
                    </div>
                    <div className="module-form-group">
                      <label>Batch Size</label>
                      <input type="number" value={sendBatchSize} onChange={e => setSendBatchSize(Number(e.target.value))} min={1} max={150} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem' }} />
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Message Preview:</div>
                    <div style={{ fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.5 }}>
                      {sendTouch === 1 && `Hey is this {first_name} {last_name}? My name is ${sendSenderName}, and I am checking to verify your phone number for the ${sendSchool || '{school}'} ${sendFraternity || '{fraternity}'} alumni list.`}
                      {sendTouch === 2 && `Hey {first_name}, following up — we partnered with ${sendSchool || '{school}'} ${sendFraternity || '{fraternity}'} to launch Trailblaize, a free platform that connects actives and alumni. Here's the signup link if you're interested: ${sendSignupLink || '{signup_link}'}`}
                      {sendTouch === 3 && `Hey {first_name}, just checking back in — did you get a chance to sign up? Happy to answer any questions.`}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowSendModal(false)}>{sendResult ? 'Close' : 'Cancel'}</button>
              {!sendResult && (
                <button className="module-primary-btn" onClick={handleSendBatch} disabled={sending || (sendTouch <= 2 && (!sendSchool || !sendFraternity)) || (sendTouch === 2 && !sendSignupLink)}>
                  {sending ? 'Sending...' : `Send Touch ${sendTouch}`}
                </button>
              )}
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 10000,
          padding: '14px 20px', borderRadius: '10px', maxWidth: '440px',
          background: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: toast.type === 'success' ? '#166534' : '#991b1b',
          fontSize: '0.875rem', fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {toast.message}
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', marginLeft: 'auto', color: 'inherit' }}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}
