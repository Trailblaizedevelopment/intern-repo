'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  HeartHandshake, Plus, Search, X, AlertTriangle,
  Settings, RefreshCw, Activity, Edit2,
  CreditCard, BadgeCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  supabase, Chapter, CheckInFrequency,
  CHECK_IN_FREQUENCY_LABELS, ChapterWithOnboarding,
} from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import ConfirmModal from '@/components/ConfirmModal';
import OnboardingWizard from './OnboardingWizard';
import OnboardingNotifications from './OnboardingNotifications';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AlumniStats {
  chapter_id: string;
  total: number;
  have_phone: number;
  contacted_with_phone: number;
  signed_up: number;
  outreach_coverage_pct: number;
}

interface TriageChapter extends ChapterWithOnboarding {
  health_score: number;
  triage_tier: 'red' | 'yellow' | 'green';
  days_since_last_activity: number | null;
  onboarding_completion_pct: number | null;
  next_required_action: string | null;
  alumni_stats: AlumniStats;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_ORDER = { red: 0, yellow: 1, green: 2 };

const TIER_CONFIG = {
  red:    { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Needs Attention' },
  yellow: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'At Risk' },
  green:  { color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', label: 'Healthy' },
};

const CS_UI = {
  border: '#e5e7eb',
  surface: '#ffffff',
  surfaceMuted: '#f9fafb',
  pageBg: '#f9fafb',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textSubtle: '#9ca3af',
  blue: '#2563eb',
  blueDark: '#1d4ed8',
  blueBg: '#eff6ff',
  ink: '#0F172A',
};

const NEUTRAL_BADGE = { color: '#374151', bg: '#f9fafb', border: '#e5e7eb' };

const TOOLBAR_CONTROL_HEIGHT = 34;

const TOOLBAR_BUTTON: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 12px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  borderRadius: '9999px',
  border: `1px solid ${CS_UI.border}`,
  background: '#fff',
  color: CS_UI.textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const TOOLBAR_SEARCH: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 12px',
  borderRadius: '9999px',
  border: `1px solid ${CS_UI.border}`,
  background: '#fff',
  flex: 1,
  minWidth: 0,
};

const CHAPTER_LIST_COLUMNS = 'minmax(0, 1.35fr) 88px 116px 52px 64px 64px 88px 36px';

const LIST_PILL: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 9999,
  justifySelf: 'start',
  whiteSpace: 'nowrap',
};
const CHAPTER_CARDS_PAGE_SIZE = 12;

const STATUS_CONFIG: Record<string, { label: string }> = {
  onboarding: { label: 'Onboarding' },
  active:     { label: 'Active' },
  at_risk:    { label: 'At Risk' },
  churned:    { label: 'Churned' },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerSuccessPage() {
  const router = useRouter();

  const [chapters, setChapters] = useState<TriageChapter[]>([]);
  const [rawChapters, setRawChapters] = useState<ChapterWithOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHealth, setFilterHealth] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list');
  const [chapterCardPage, setChapterCardPage] = useState(1);

  const [showWizard, setShowWizard] = useState(false);
  const [wizardChapter, setWizardChapter] = useState<ChapterWithOnboarding | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState<ChapterWithOnboarding | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [bookingLink, setBookingLink] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });

  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [formData, setFormData] = useState({
    chapter_name: '', school: '', fraternity: '', contact_name: '',
    contact_email: '', contact_phone: '', status: 'onboarding' as Chapter['status'],
    health: 'good' as Chapter['health'], mrr: 0, next_action: '', notes: '',
    alumni_channels: '', payment_day: null as number | null,
    payment_type: 'annual' as Chapter['payment_type'], payment_amount: 299,
    payment_start_date: '', last_payment_date: '', next_payment_date: '',
    check_in_frequency: 'biweekly' as CheckInFrequency,
  });

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  useEffect(() => {
    fetchTriage();
    fetchBookingLink();
    autoRefreshRef.current = setInterval(() => fetchTriage(true), 60_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchBookingLink() {
    try {
      const r = await fetch('/api/settings?key=booking_link');
      const res = await r.json();
      if (res.data?.value) setBookingLink(res.data.value);
    } catch { /* silent */ }
  }

  async function fetchTriage(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else { setLoading(true); setError(null); }

    try {
      const res = await fetch('/api/chapters/triage');
      const json = await res.json();
      if (json.error) {
        setError('Failed to load chapters. Check your connection and try again.');
        showToast('Failed to load chapters', 'error');
      } else {
        const sorted = (json.data || []).sort(
          (a: TriageChapter, b: TriageChapter) => TIER_ORDER[a.triage_tier] - TIER_ORDER[b.triage_tier]
        );
        setChapters(sorted);
        setRawChapters(sorted);
        setError(null);
      }
    } catch {
      setError('Network error. Failed to load chapters.');
      showToast('Failed to load chapters', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function createChapter() {
    if (!formData.chapter_name.trim()) return showToast('Chapter name required', 'error');
    try {
      const res = await fetch('/api/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          chapter_created: true,
          onboarding_started: new Date().toISOString().split('T')[0],
          payment_start_date: formData.payment_start_date || null,
          last_payment_date: formData.last_payment_date || null,
          next_payment_date: formData.next_payment_date || null,
        }),
      });
      const json = await res.json();
      if (json.error) showToast(`Failed: ${json.error.message || json.error}`, 'error');
      else { showToast('Chapter created', 'success'); resetForm(); fetchTriage(); }
    } catch { showToast('Failed to create chapter', 'error'); }
  }

  async function updateChapter() {
    if (!editingChapter) return;
    try {
      const res = await fetch(`/api/chapters/${editingChapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          payment_start_date: formData.payment_start_date || null,
          last_payment_date: formData.last_payment_date || null,
          next_payment_date: formData.next_payment_date || null,
        }),
      });
      const json = await res.json();
      if (json.error) showToast(`Failed: ${json.error.message || json.error}`, 'error');
      else { showToast('Chapter updated', 'success'); resetForm(); fetchTriage(); }
    } catch { showToast('Failed to update chapter', 'error'); }
  }

  async function deleteChapter(id: string) {
    try {
      const res = await fetch(`/api/chapters/${id}`, {
        method: 'DELETE',
        headers: { 'x-confirm-delete': 'CONFIRMED' },
      });
      const json = await res.json();
      if (!res.ok || json.error) showToast('Failed to delete', 'error');
      else { showToast('Chapter deleted', 'success'); fetchTriage(); }
    } catch { showToast('Failed to delete chapter', 'error'); }
    setDeleteConfirm({ show: false, id: null });
  }

  async function saveBookingLink() {
    setSavingSettings(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'booking_link', value: bookingLink }),
      });
      const res = await r.json();
      if (res.error) showToast(res.error.message, 'error');
      else { showToast('Booking link saved!', 'success'); setShowSettingsModal(false); }
    } catch { showToast('Failed to save', 'error'); }
    finally { setSavingSettings(false); }
  }

  function resetForm() {
    setFormData({
      chapter_name: '', school: '', fraternity: '', contact_name: '',
      contact_email: '', contact_phone: '', status: 'onboarding', health: 'good',
      mrr: 0, next_action: '', notes: '', alumni_channels: '',
      payment_day: null, payment_type: 'annual', payment_amount: 299,
      payment_start_date: '', last_payment_date: '', next_payment_date: '',
      check_in_frequency: 'biweekly',
    });
    setEditingChapter(null);
    setShowModal(false);
  }

  function openEditModal(chapter: ChapterWithOnboarding) {
    setEditingChapter(chapter);
    setFormData({
      chapter_name: chapter.chapter_name, school: chapter.school || '',
      fraternity: chapter.fraternity || '', contact_name: chapter.contact_name || '',
      contact_email: chapter.contact_email || '', contact_phone: chapter.contact_phone || '',
      status: chapter.status, health: chapter.health, mrr: chapter.mrr || 0,
      next_action: chapter.next_action || '', notes: chapter.notes || '',
      alumni_channels: chapter.alumni_channels || '', payment_day: chapter.payment_day,
      payment_type: chapter.payment_type || 'annual', payment_amount: chapter.payment_amount || 299,
      payment_start_date: chapter.payment_start_date || '', last_payment_date: chapter.last_payment_date || '',
      next_payment_date: chapter.next_payment_date || '', check_in_frequency: chapter.check_in_frequency || 'biweekly',
    });
    setShowModal(true);
  }

  function openWizard(chapterId?: string) {
    if (chapterId) {
      const ch = rawChapters.find(c => c.id === chapterId) || null;
      setWizardChapter(ch);
    } else {
      setWizardChapter(null);
    }
    setShowWizard(true);
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const filtered = chapters.filter(c => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || c.chapter_name.toLowerCase().includes(q) ||
      (c.school || '').toLowerCase().includes(q) ||
      (c.fraternity || '').toLowerCase().includes(q);
    const matchHealth = filterHealth === 'all' || c.triage_tier === filterHealth;
    return matchSearch && matchHealth;
  });

  const redCount    = chapters.filter(c => c.triage_tier === 'red').length;
  const yellowCount = chapters.filter(c => c.triage_tier === 'yellow').length;
  const greenCount  = chapters.filter(c => c.triage_tier === 'green').length;
  const needsAttention = redCount;
  const totalAlumniSignedUp = chapters.reduce((s, c) => s + (c.alumni_stats?.signed_up || 0), 0);

  const totalCardPages = Math.max(1, Math.ceil(filtered.length / CHAPTER_CARDS_PAGE_SIZE));
  const safeCardPage = Math.min(chapterCardPage, totalCardPages);
  const paginatedChapters = filtered.slice(
    (safeCardPage - 1) * CHAPTER_CARDS_PAGE_SIZE,
    safeCardPage * CHAPTER_CARDS_PAGE_SIZE,
  );

  useEffect(() => {
    setChapterCardPage(1);
  }, [searchQuery, filterHealth]);

  useEffect(() => {
    if (chapterCardPage > totalCardPages) setChapterCardPage(totalCardPages);
  }, [chapterCardPage, totalCardPages]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: CS_UI.pageBg, color: CS_UI.text, fontFamily: 'inherit' }}>

      <header style={{ borderBottom: `1px solid ${CS_UI.border}`, background: 'rgba(249,250,251,0.95)', backdropFilter: 'blur(8px)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: CS_UI.text, lineHeight: 1.2, margin: 0 }}>
                Customer Success
              </h1>
              <p style={{ color: CS_UI.textMuted, fontSize: '0.8125rem', margin: '4px 0 0' }}>
                {loading ? 'Loading chapters…' : `${chapters.length} chapter${chapters.length !== 1 ? 's' : ''} · ${needsAttention > 0 ? `${needsAttention} need${needsAttention !== 1 ? '' : 's'} attention` : 'all healthy'} · auto-refreshes every 60s`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fetchTriage(true)}
                disabled={refreshing}
                style={{ ...TOOLBAR_BUTTON, opacity: refreshing ? 0.7 : 1 }}
              >
                <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button type="button" onClick={() => setShowSettingsModal(true)} style={TOOLBAR_BUTTON}>
                <Settings size={13} /> Settings
              </button>
              <button
                type="button"
                onClick={() => openWizard()}
                style={{ ...TOOLBAR_BUTTON, border: 'none', background: CS_UI.ink, color: '#fff' }}
              >
                <Plus size={14} /> Add Chapter
              </button>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px 32px' }}>

        {/* ── Loading State ─────────────────────────────────────────────────── */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchTriage()} />
        ) : chapters.length === 0 ? (
          <EmptyState onAdd={() => openWizard()} />
        ) : (
          <>
            {/* Onboarding Notifications */}
            <OnboardingNotifications chapters={rawChapters} onOpenWizard={(id) => openWizard(id)} />

            {/* ── Stats Bar ──────────────────────────────────────────────────── */}
            <div style={{
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'center',
              width: '100%',
              paddingBottom: 16,
              marginBottom: 16,
              borderBottom: `1px solid ${CS_UI.border}`,
            }}>
              {[
                { label: 'Total Chapters', value: chapters.length },
                { label: 'Needs Attention', value: needsAttention },
                { label: 'Healthy', value: greenCount },
                { label: 'Alumni Signed Up', value: totalAlumniSignedUp.toLocaleString() },
              ].map((stat, index) => (
                <React.Fragment key={stat.label}>
                  {index > 0 && (
                    <div aria-hidden style={{ width: 1, alignSelf: 'stretch', margin: '4px 0', background: CS_UI.border, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: '1 1 0', padding: '0 16px', minWidth: 0, textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CS_UI.textSubtle }}>
                      {stat.label}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: '1.375rem', fontWeight: 700, color: CS_UI.text, fontVariantNumeric: 'tabular-nums' }}>
                      {stat.value}
                    </p>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* ── Filter Row ─────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ ...TOOLBAR_SEARCH, flex: '1 1 220px' }}>
                <Search size={15} color={CS_UI.textSubtle} />
                <input
                  type="text"
                  placeholder="Search chapters, schools…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: CS_UI.text, fontSize: '0.8125rem', fontFamily: 'inherit', minWidth: 0 }}
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: CS_UI.textSubtle, cursor: 'pointer', padding: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  { key: 'all' as const, label: `All (${chapters.length})` },
                  { key: 'red' as const, label: `Needs Attention (${redCount})` },
                  { key: 'yellow' as const, label: `At Risk (${yellowCount})` },
                  { key: 'green' as const, label: `Healthy (${greenCount})` },
                ]).map(pill => (
                  <button
                    key={pill.key}
                    type="button"
                    onClick={() => setFilterHealth(pill.key)}
                    style={{
                      ...TOOLBAR_BUTTON,
                      border: `1px solid ${filterHealth === pill.key ? CS_UI.blue : CS_UI.border}`,
                      background: filterHealth === pill.key ? CS_UI.blueBg : '#fff',
                      color: filterHealth === pill.key ? CS_UI.blueDark : CS_UI.textSecondary,
                      fontWeight: filterHealth === pill.key ? 600 : 500,
                    }}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.75rem', color: CS_UI.textSubtle }}>
                  {filtered.length} shown
                </span>
                <div style={{ display: 'flex', background: CS_UI.surfaceMuted, borderRadius: 9999, padding: 2, border: `1px solid ${CS_UI.border}` }}>
                  {(['list', 'cards'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 9999,
                        border: 'none',
                        background: viewMode === mode ? '#fff' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: viewMode === mode ? CS_UI.text : CS_UI.textMuted,
                        fontFamily: 'inherit',
                        boxShadow: viewMode === mode ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      }}
                    >
                      {mode === 'list' ? 'List' : 'Cards'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: CS_UI.textMuted }}>
                <Search size={28} style={{ marginBottom: 12, opacity: 0.35, color: CS_UI.textSubtle }} />
                <p style={{ margin: 0 }}>No chapters match your filters</p>
              </div>
            ) : viewMode === 'list' ? (
              <div style={{ border: `1px solid ${CS_UI.border}`, borderRadius: 12, background: CS_UI.surface, overflow: 'hidden' }}>
                <div
                  role="row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: CHAPTER_LIST_COLUMNS,
                    gap: 10,
                    alignItems: 'center',
                    padding: '10px 16px',
                    borderBottom: `1px solid ${CS_UI.border}`,
                    background: CS_UI.surfaceMuted,
                  }}
                >
                  {['Chapter', 'Status', 'Health', 'Score', 'Contacted', 'Signups', 'Activity', ''].map(label => (
                    <span
                      key={label || 'actions'}
                      role="columnheader"
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: CS_UI.textSubtle,
                        textAlign: label && !['Chapter', 'Status', 'Health', ''].includes(label) ? 'right' : 'left',
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div style={{ maxHeight: 'min(68vh, 720px)', overflowY: 'auto' }}>
                  {filtered.map((chapter, index) => (
                    <ChapterListRow
                      key={chapter.id}
                      chapter={chapter}
                      isLast={index === filtered.length - 1}
                      onOpen={() => router.push(`/nucleus/customer-success/${chapter.id}`)}
                      onEdit={(e) => { e.stopPropagation(); openEditModal(chapter); }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                  {paginatedChapters.map(chapter => (
                    <ChapterTriageCard
                      key={chapter.id}
                      chapter={chapter}
                      onOpen={() => router.push(`/nucleus/customer-success/${chapter.id}`)}
                      onEdit={(e) => { e.stopPropagation(); openEditModal(chapter); }}
                    />
                  ))}
                </div>
                <ChapterPaginationFooter
                  page={safeCardPage}
                  pageSize={CHAPTER_CARDS_PAGE_SIZE}
                  totalCount={filtered.length}
                  onPageChange={setChapterCardPage}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Onboarding Wizard ─────────────────────────────────────────────────── */}
      {showWizard && (
        <OnboardingWizard
          chapter={wizardChapter}
          onClose={() => { setShowWizard(false); setWizardChapter(null); }}
          onComplete={() => {
            setShowWizard(false);
            setWizardChapter(null);
            fetchTriage();
            showToast('Chapter setup complete! 🎉', 'success');
          }}
        />
      )}

      {/* ── Toasts ────────────────────────────────────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 8, maxWidth: 360,
            background: t.type === 'success' ? '#f0fdf4' : t.type === 'error' ? '#fef2f2' : '#ffffff',
            border: `1px solid ${t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#e5e7eb'}`,
            color: '#111827', fontSize: '0.85rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            animation: 'fadeIn 0.2s ease',
          }}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
              style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={resetForm}>
          <div
            className="module-modal module-modal-large"
            onClick={e => e.stopPropagation()}
            style={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827' }}
          >
            <div className="module-modal-header" style={{ borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ color: '#111827' }}>{editingChapter ? 'Edit Chapter' : 'Add Chapter'}</h2>
              <button className="module-modal-close" onClick={resetForm}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <ChapterForm formData={formData} setFormData={setFormData} />
            </div>
            <div className="module-modal-footer" style={{ borderTop: '1px solid #e5e7eb' }}>
              <button className="module-cancel-btn" onClick={resetForm}>Cancel</button>
              <button
                style={{ padding: '8px 20px', borderRadius: 9999, border: 'none', background: CS_UI.ink, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                onClick={editingChapter ? updateChapter : createChapter}
                disabled={!formData.chapter_name}
              >
                {editingChapter ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Settings Modal ────────────────────────────────────────────────────── */}
      {showSettingsModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowSettingsModal(false)}>
          <div
            className="module-modal"
            onClick={e => e.stopPropagation()}
            style={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827' }}
          >
            <div className="module-modal-header" style={{ borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ color: '#111827' }}>Settings</h2>
              <button className="module-modal-close" onClick={() => setShowSettingsModal(false)}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Demo Booking Link
                </label>
                <input
                  type="url" value={bookingLink}
                  onChange={e => setBookingLink(e.target.value)}
                  placeholder="https://calendar.google.com/…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                />
              </div>
            </div>
            <div className="module-modal-footer" style={{ borderTop: '1px solid #e5e7eb' }}>
              <button className="module-cancel-btn" onClick={() => setShowSettingsModal(false)}>Cancel</button>
              <button
                style={{ padding: '8px 20px', borderRadius: 9999, border: 'none', background: CS_UI.ink, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                onClick={saveBookingLink} disabled={savingSettings}
              >
                {savingSettings ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Delete Confirm ────────────────────────────────────────────────────── */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Chapter"
        message="This will permanently delete the chapter and all onboarding progress."
        confirmText="Delete" cancelText="Cancel" variant="danger"
        onConfirm={() => deleteConfirm.id && deleteChapter(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />

      <style>{`
        @keyframes spin    { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function ChapterPaginationFooter({
  page, pageSize, totalCount, onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.8125rem', color: CS_UI.textMuted }}>Showing {start}–{end} of {totalCount}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} style={{ ...TOOLBAR_BUTTON, opacity: page <= 1 ? 0.6 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>
          Previous
        </button>
        <span style={{ fontSize: '0.8125rem', color: CS_UI.textMuted, minWidth: 88, textAlign: 'center' }}>Page {page} of {totalPages}</span>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} style={{ ...TOOLBAR_BUTTON, opacity: page >= totalPages ? 0.6 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Chapter List Row ─────────────────────────────────────────────────────────

function ChapterListRow({
  chapter, isLast, onOpen, onEdit,
}: {
  chapter: TriageChapter;
  isLast: boolean;
  onOpen: () => void;
  onEdit: (e: React.MouseEvent) => void;
}) {
  const tier = TIER_CONFIG[chapter.triage_tier];
  const status = STATUS_CONFIG[chapter.status] || STATUS_CONFIG.onboarding;
  const stats = chapter.alumni_stats;
  const coveragePct = stats?.outreach_coverage_pct ?? 0;
  const signedUp = stats?.signed_up ?? 0;
  const activityLabel = chapter.days_since_last_activity === null
    ? '—'
    : chapter.days_since_last_activity === 0
      ? 'Today'
      : chapter.days_since_last_activity === 1
        ? '1d ago'
        : `${chapter.days_since_last_activity}d ago`;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: 'grid',
        gridTemplateColumns: CHAPTER_LIST_COLUMNS,
        gap: 10,
        alignItems: 'center',
        width: '100%',
        padding: '10px 16px',
        border: 'none',
        borderBottom: isLast ? 'none' : `1px solid ${CS_UI.border}`,
        background: CS_UI.surface,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ minWidth: 0, borderLeft: `3px solid ${tier.color}`, paddingLeft: 10 }}>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: CS_UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {chapter.chapter_name}
        </div>
        <div style={{ fontSize: '0.72rem', color: CS_UI.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[chapter.fraternity, chapter.school].filter(Boolean).join(' · ')}
        </div>
        {chapter.next_required_action && (
          <div style={{ fontSize: '0.72rem', color: CS_UI.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chapter.next_required_action}
          </div>
        )}
      </div>
      <span style={{ ...LIST_PILL, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
        {status.label}
      </span>
      <span style={{ ...LIST_PILL, color: tier.color, background: tier.bg, border: `1px solid ${tier.border}` }}>
        {tier.label}
      </span>
      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: CS_UI.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {chapter.health_score}
      </span>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: CS_UI.textSecondary, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {stats?.total ? `${coveragePct}%` : '—'}
      </span>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: CS_UI.textSecondary, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {signedUp || '—'}
      </span>
      <span style={{ fontSize: '0.75rem', color: chapter.days_since_last_activity !== null && chapter.days_since_last_activity > 14 ? '#dc2626' : CS_UI.textSubtle, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {activityLabel}
      </span>
      <span
        role="presentation"
        onClick={onEdit}
        style={{ color: CS_UI.textSubtle, padding: 4, cursor: 'pointer', justifySelf: 'end' }}
      >
        <Edit2 size={13} />
      </span>
    </button>
  );
}

// ─── Chapter Triage Card ──────────────────────────────────────────────────────

function ChapterTriageCard({ chapter, onOpen, onEdit }: {
  chapter: TriageChapter;
  onOpen: () => void;
  onEdit: (e: React.MouseEvent) => void;
}) {
  const tier = TIER_CONFIG[chapter.triage_tier];
  const status = STATUS_CONFIG[chapter.status] || STATUS_CONFIG.onboarding;
  const stats = chapter.alumni_stats;

  const coveragePct = stats?.outreach_coverage_pct ?? 0;
  const signedUp    = stats?.signed_up ?? 0;
  const total       = stats?.total ?? 0;

  return (
    <div
      style={{
        background: CS_UI.surface,
        border: `1px solid ${CS_UI.border}`,
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
      }}
      onClick={onOpen}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = '#d1d5db';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = CS_UI.border;
        el.style.boxShadow = 'none';
      }}
    >
      <div style={{ width: 3, flexShrink: 0, background: tier.color, alignSelf: 'stretch' }} />

      <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: CS_UI.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chapter.chapter_name}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: CS_UI.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[chapter.fraternity, chapter.school].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 9999, color: tier.color, background: tier.bg, border: `1px solid ${tier.border}` }}>
              {chapter.health_score}
            </span>
            <button
              type="button"
              onClick={onEdit}
              style={{ background: 'none', border: 'none', color: CS_UI.textSubtle, cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6 }}
            >
              <Edit2 size={13} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
            {status.label}
          </span>
          {chapter.onboarding_completed && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
              <BadgeCheck size={10} />
              Setup Complete
            </span>
          )}
          {chapter.next_payment_date && <PaymentBadge nextPaymentDate={chapter.next_payment_date} />}
        </div>

        <div style={{ display: 'flex', gap: 12, fontSize: '0.75rem', flexWrap: 'wrap', color: CS_UI.textMuted }}>
          {total > 0 && (
            <>
              <span><strong style={{ color: CS_UI.textSecondary }}>{coveragePct}%</strong> contacted</span>
              <span><strong style={{ color: CS_UI.textSecondary }}>{signedUp}</strong> signups</span>
            </>
          )}
          {chapter.days_since_last_activity !== null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: chapter.days_since_last_activity > 14 ? '#dc2626' : CS_UI.textMuted }}>
              <Activity size={11} />
              {chapter.days_since_last_activity === 0 ? 'today' : chapter.days_since_last_activity === 1 ? '1d ago' : `${chapter.days_since_last_activity}d ago`}
            </span>
          )}
        </div>

        {chapter.next_required_action && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: CS_UI.textMuted, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chapter.next_required_action}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Payment Badge ────────────────────────────────────────────────────────────

function PaymentBadge({ nextPaymentDate }: { nextPaymentDate: string }) {
  const daysUntil = Math.ceil((new Date(nextPaymentDate).getTime() - Date.now()) / 86_400_000);
  const isOverdue = daysUntil < 0;
  const isDueSoon = daysUntil >= 0 && daysUntil <= 7;

  if (!isOverdue && !isDueSoon) return null;

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: '0.68rem', padding: '2px 8px', borderRadius: 9999,
      background: isOverdue ? '#fef2f2' : '#fffbeb',
      color: isOverdue ? '#dc2626' : '#d97706',
      border: `1px solid ${isOverdue ? '#fecaca' : '#fde68a'}`,
      fontWeight: 600,
    }}>
      <CreditCard size={10} />
      {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `Due in ${daysUntil}d`}
    </span>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ height: 72, borderRadius: 12, background: CS_UI.surface, border: `1px solid ${CS_UI.border}`, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ height: 34, borderRadius: 9999, background: CS_UI.surface, border: `1px solid ${CS_UI.border}`, animation: 'pulse 1.5s ease-in-out infinite' }} />
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} style={{ height: 56, borderRadius: 12, background: CS_UI.surface, border: `1px solid ${CS_UI.border}`, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: '#fef2f2', border: '1px solid #fecaca',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#dc2626', marginBottom: 20,
      }}>
        <AlertTriangle size={26} strokeWidth={1.5} />
      </div>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: CS_UI.text, margin: '0 0 8px' }}>Something went wrong</h3>
      <p style={{ color: CS_UI.textMuted, margin: '0 0 24px', maxWidth: 360, lineHeight: 1.6, fontSize: '0.88rem' }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        style={{ ...TOOLBAR_BUTTON, padding: '0 18px' }}
      >
        <RefreshCw size={15} /> Try Again
      </button>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: CS_UI.surfaceMuted,
        border: `1px solid ${CS_UI.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: CS_UI.textMuted, marginBottom: 20,
      }}>
        <HeartHandshake size={30} strokeWidth={1.5} />
      </div>
      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: CS_UI.text, margin: '0 0 8px' }}>No chapters yet</h3>
      <p style={{ color: CS_UI.textMuted, margin: '0 0 24px', maxWidth: 360, lineHeight: 1.6 }}>
        Add your first chapter to start tracking onboarding, outreach, and health scores.
      </p>
      <button
        type="button"
        onClick={onAdd}
        style={{ ...TOOLBAR_BUTTON, border: 'none', background: CS_UI.ink, color: '#fff', padding: '0 18px' }}
      >
        <Plus size={16} /> Add First Chapter
      </button>
    </div>
  );
}

// ─── Chapter Form ─────────────────────────────────────────────────────────────

interface FormState {
  chapter_name: string; school: string; fraternity: string;
  contact_name: string; contact_email: string; contact_phone: string;
  status: Chapter['status']; health: Chapter['health']; mrr: number;
  next_action: string; notes: string; alumni_channels: string;
  payment_day: number | null; payment_type: Chapter['payment_type'];
  payment_amount: number; payment_start_date: string;
  last_payment_date: string; next_payment_date: string;
  check_in_frequency: CheckInFrequency;
}

function ChapterForm({ formData, setFormData }: {
  formData: FormState;
  setFormData: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px',
    borderRadius: 8, border: '1px solid #e5e7eb',
    background: '#ffffff', color: '#111827', fontSize: '0.85rem',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600,
    color: '#9ca3af', marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: '0.04em',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="module-form-row">
        <div><label style={labelStyle}>Chapter Name *</label><input style={inputStyle} type="text" value={formData.chapter_name} onChange={e => setFormData(p => ({ ...p, chapter_name: e.target.value }))} /></div>
        <div><label style={labelStyle}>Fraternity</label><input style={inputStyle} type="text" value={formData.fraternity} onChange={e => setFormData(p => ({ ...p, fraternity: e.target.value }))} /></div>
      </div>
      <div className="module-form-row">
        <div><label style={labelStyle}>School</label><input style={inputStyle} type="text" value={formData.school} onChange={e => setFormData(p => ({ ...p, school: e.target.value }))} /></div>
        <div><label style={labelStyle}>MRR ($)</label><input style={inputStyle} type="number" value={formData.mrr} onChange={e => setFormData(p => ({ ...p, mrr: parseFloat(e.target.value) || 0 }))} /></div>
      </div>
      <div className="module-form-row">
        <div><label style={labelStyle}>Contact Name</label><input style={inputStyle} type="text" value={formData.contact_name} onChange={e => setFormData(p => ({ ...p, contact_name: e.target.value }))} /></div>
        <div><label style={labelStyle}>Contact Email</label><input style={inputStyle} type="email" value={formData.contact_email} onChange={e => setFormData(p => ({ ...p, contact_email: e.target.value }))} /></div>
      </div>
      <div className="module-form-row">
        <div>
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value as Chapter['status'] }))}>
            <option value="onboarding">Onboarding</option>
            <option value="active">Active</option>
            <option value="at_risk">At Risk</option>
            <option value="churned">Churned</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Check-in Frequency</label>
          <select style={inputStyle} value={formData.check_in_frequency} onChange={e => setFormData(p => ({ ...p, check_in_frequency: e.target.value as CheckInFrequency }))}>
            {Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Payment section */}
      <div style={{ padding: '12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <CreditCard size={14} style={{ color: '#a78bfa' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment</span>
        </div>
        <div className="module-form-row">
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={formData.payment_type} onChange={e => setFormData(p => ({ ...p, payment_type: e.target.value as Chapter['payment_type'] }))}>
              <option value="annual">Annual</option>
              <option value="monthly">Monthly</option>
              <option value="one_time">One-Time</option>
            </select>
          </div>
          <div><label style={labelStyle}>Amount ($)</label><input style={inputStyle} type="number" value={formData.payment_amount} onChange={e => setFormData(p => ({ ...p, payment_amount: parseFloat(e.target.value) || 299 }))} /></div>
        </div>
        <div className="module-form-row">
          <div><label style={labelStyle}>Start Date</label><input style={inputStyle} type="date" value={formData.payment_start_date} onChange={e => setFormData(p => ({ ...p, payment_start_date: e.target.value }))} /></div>
          <div><label style={labelStyle}>Next Payment</label><input style={inputStyle} type="date" value={formData.next_payment_date} onChange={e => setFormData(p => ({ ...p, next_payment_date: e.target.value }))} /></div>
        </div>
      </div>

      <div><label style={labelStyle}>Next Action</label><input style={inputStyle} type="text" value={formData.next_action} onChange={e => setFormData(p => ({ ...p, next_action: e.target.value }))} /></div>
      <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, resize: 'vertical' }} value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={3} /></div>
    </div>
  );
}
