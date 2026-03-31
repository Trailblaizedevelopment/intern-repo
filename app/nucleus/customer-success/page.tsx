'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  HeartHandshake, Plus, Search, X, AlertTriangle, Clock,
  Settings, Loader2, RefreshCw, ArrowLeft, LayoutDashboard,
  TrendingUp, Users, Zap, CheckCircle2, Circle, CreditCard,
  ChevronRight, Activity, Instagram, Link as LinkIcon, Edit2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  supabase, Chapter, ONBOARDING_STEPS, CheckInFrequency,
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

const TIER_CONFIG = {
  red:    { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.2)',    label: 'Needs Attention', dot: '#ef4444' },
  yellow: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.2)',   label: 'Monitoring',      dot: '#f59e0b' },
  green:  { color: '#10b981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.2)',   label: 'Healthy',         dot: '#10b981' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  onboarding: { label: 'Onboarding', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  active:     { label: 'Active',     color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  at_risk:    { label: 'At Risk',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  churned:    { label: 'Churned',    color: '#6b7280', bg: 'rgba(107,114,128,0.12)' },
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerSuccessPage() {
  const router = useRouter();

  const [chapters, setChapters] = useState<TriageChapter[]>([]);
  const [rawChapters, setRawChapters] = useState<ChapterWithOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHealth, setFilterHealth] = useState<'all' | 'red' | 'yellow' | 'green'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSchool, setFilterSchool] = useState<string>('all');

  const [showWizard, setShowWizard] = useState(false);
  const [wizardChapter, setWizardChapter] = useState<ChapterWithOnboarding | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState<ChapterWithOnboarding | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [bookingLink, setBookingLink] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });

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

  useEffect(() => { fetchTriage(); fetchBookingLink(); }, []);

  async function fetchBookingLink() {
    try {
      const r = await fetch('/api/settings?key=booking_link');
      const res = await r.json();
      if (res.data?.value) setBookingLink(res.data.value);
    } catch { /* silent */ }
  }

  async function fetchTriage(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch('/api/chapters/triage');
      const json = await res.json();
      if (json.error) {
        showToast('Failed to load chapters', 'error');
      } else {
        setChapters(json.data || []);
        setRawChapters(json.data || []);
      }
    } catch {
      showToast('Failed to load chapters', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function createChapter() {
    if (!supabase) return showToast('DB not connected', 'error');
    if (!formData.chapter_name.trim()) return showToast('Chapter name required', 'error');
    const { error } = await supabase.from('chapters').insert([{
      ...formData,
      chapter_created: true,
      onboarding_started: new Date().toISOString().split('T')[0],
      payment_start_date: formData.payment_start_date || null,
      last_payment_date: formData.last_payment_date || null,
      next_payment_date: formData.next_payment_date || null,
    }]);
    if (error) showToast(`Failed: ${error.message}`, 'error');
    else { showToast('Chapter created', 'success'); resetForm(); fetchTriage(); }
  }

  async function updateChapter() {
    if (!supabase || !editingChapter) return;
    const { error } = await supabase.from('chapters').update({
      ...formData,
      payment_start_date: formData.payment_start_date || null,
      last_payment_date: formData.last_payment_date || null,
      next_payment_date: formData.next_payment_date || null,
    }).eq('id', editingChapter.id);
    if (error) showToast(`Failed: ${error.message}`, 'error');
    else { showToast('Chapter updated', 'success'); resetForm(); fetchTriage(); }
  }

  async function deleteChapter(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('chapters').delete().eq('id', id);
    if (error) showToast('Failed to delete', 'error');
    else { showToast('Chapter deleted', 'success'); fetchTriage(); }
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

  const schools = Array.from(new Set(chapters.map(c => c.school).filter(Boolean))) as string[];

  const filtered = chapters.filter(c => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || c.chapter_name.toLowerCase().includes(q) ||
      (c.school || '').toLowerCase().includes(q) ||
      (c.fraternity || '').toLowerCase().includes(q);
    const matchHealth = filterHealth === 'all' || c.triage_tier === filterHealth;
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    const matchSchool = filterSchool === 'all' || c.school === filterSchool;
    return matchSearch && matchHealth && matchStatus && matchSchool;
  });

  const redCount    = chapters.filter(c => c.triage_tier === 'red').length;
  const yellowCount = chapters.filter(c => c.triage_tier === 'yellow').length;
  const greenCount  = chapters.filter(c => c.triage_tier === 'green').length;
  const totalMRR    = chapters.reduce((s, c) => s + (c.mrr || 0), 0);
  const totalAlumniSignedUp = chapters.reduce((s, c) => s + (c.alumni_stats?.signed_up || 0), 0);
  const needsAttention = redCount + yellowCount;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e8e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* ── Header ── */}
      <header style={{ borderBottom: '1px solid #1e1e2e', background: '#0d0d14', padding: '16px 0' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            <Link href="/nucleus" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: '0.8rem', textDecoration: 'none', transition: 'color 0.15s' }}>
              <ArrowLeft size={14} /> Nucleus
            </Link>
            <Link href="/workspace" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: '0.8rem', textDecoration: 'none' }}>
              <LayoutDashboard size={14} /> Workspace
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', flexShrink: 0 }}>
                <HeartHandshake size={22} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f0f0f8', lineHeight: 1.2, margin: 0 }}>Customer Success</h1>
                <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '2px 0 0' }}>Chapter onboarding, outreach, and health tracking</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => fetchTriage(true)}
                disabled={refreshing}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #1e1e2e', background: '#111118', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem', transition: 'all 0.15s' }}
              >
                <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #1e1e2e', background: '#111118', color: '#9ca3af', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                <Settings size={13} /> Settings
              </button>
              <button
                onClick={() => openWizard()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                <Plus size={14} /> Add Chapter
              </button>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {loading ? (
          <LoadingSkeleton />
        ) : chapters.length === 0 ? (
          <EmptyState onAdd={() => openWizard()} />
        ) : (
          <>
            {/* ── Onboarding Notifications ── */}
            <OnboardingNotifications chapters={rawChapters} onOpenWizard={(id) => openWizard(id)} />

            {/* ── Summary Stats Bar ── */}
            <SummaryStats
              total={chapters.length}
              redCount={redCount}
              yellowCount={yellowCount}
              greenCount={greenCount}
              needsAttention={needsAttention}
              totalMRR={totalMRR}
              totalAlumniSignedUp={totalAlumniSignedUp}
            />

            {/* ── Health Triage Filters ── */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {(['all', 'red', 'yellow', 'green'] as const).map(tier => (
                <button
                  key={tier}
                  onClick={() => setFilterHealth(tier)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', borderRadius: 20,
                    border: filterHealth === tier
                      ? `1px solid ${tier === 'all' ? '#4b5563' : TIER_CONFIG[tier].color}`
                      : '1px solid #1e1e2e',
                    background: filterHealth === tier
                      ? tier === 'all' ? 'rgba(75,85,99,0.15)' : TIER_CONFIG[tier].bg
                      : '#111118',
                    color: filterHealth === tier
                      ? tier === 'all' ? '#e8e8f0' : TIER_CONFIG[tier].color
                      : '#6b7280',
                    cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.15s',
                  }}
                >
                  {tier !== 'all' && (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: TIER_CONFIG[tier].dot, flexShrink: 0 }} />
                  )}
                  {tier === 'all' ? `All (${chapters.length})` :
                   tier === 'red' ? `Needs Attention (${redCount})` :
                   tier === 'yellow' ? `Monitoring (${yellowCount})` :
                   `Healthy (${greenCount})`}
                </button>
              ))}
            </div>

            {/* ── Search + Filters ── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: '1px solid #1e1e2e', background: '#111118' }}>
                <Search size={15} style={{ color: '#6b7280', flexShrink: 0 }} />
                <input
                  type="text" placeholder="Search chapters, schools, fraternities…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  style={{ background: 'none', border: 'none', outline: 'none', color: '#e8e8f0', fontSize: '0.85rem', flex: 1, minWidth: 0 }}
                />
                {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={14} /></button>}
              </div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #1e1e2e', background: '#111118', color: filterStatus !== 'all' ? '#e8e8f0' : '#6b7280', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                <option value="all">All Status</option>
                <option value="onboarding">Onboarding</option>
                <option value="active">Active</option>
                <option value="at_risk">At Risk</option>
                <option value="churned">Churned</option>
              </select>
              {schools.length > 0 && (
                <select
                  value={filterSchool}
                  onChange={e => setFilterSchool(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #1e1e2e', background: '#111118', color: filterSchool !== 'all' ? '#e8e8f0' : '#6b7280', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  <option value="all">All Schools</option>
                  {schools.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </div>

            {/* ── Chapter Cards ── */}
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#6b7280' }}>
                <Search size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
                <p style={{ margin: 0 }}>No chapters match your filters</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                {filtered.map(chapter => (
                  <ChapterTriageCard
                    key={chapter.id}
                    chapter={chapter}
                    onClick={() => router.push(`/nucleus/customer-success/${chapter.id}`)}
                    onEdit={(e) => { e.stopPropagation(); openEditModal(chapter); }}
                  />
                ))}
                <button
                  onClick={() => openWizard()}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '32px 24px', borderRadius: 12,
                    border: '2px dashed #1e1e2e', background: 'transparent',
                    color: '#4b5563', cursor: 'pointer', transition: 'all 0.15s', minHeight: 180,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#374151'; (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1e1e2e'; (e.currentTarget as HTMLButtonElement).style.color = '#4b5563'; }}
                >
                  <Plus size={24} strokeWidth={1.5} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Add Chapter</span>
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Onboarding Wizard ── */}
      {showWizard && (
        <OnboardingWizard
          chapter={wizardChapter}
          onClose={() => { setShowWizard(false); setWizardChapter(null); }}
          onComplete={() => { setShowWizard(false); setWizardChapter(null); fetchTriage(); showToast('Chapter setup complete! 🎉', 'success'); }}
        />
      )}

      {/* ── Toasts ── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', borderRadius: 8, maxWidth: 360,
            background: t.type === 'success' ? '#064e3b' : t.type === 'error' ? '#450a0a' : '#1e1e2e',
            border: `1px solid ${t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#374151'}`,
            color: '#f0f0f8', fontSize: '0.85rem', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} /></button>
          </div>
        ))}
      </div>

      {/* ── Add/Edit Modal ── */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={resetForm}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()} style={{ background: '#111118', border: '1px solid #1e1e2e', color: '#e8e8f0' }}>
            <div className="module-modal-header" style={{ borderBottom: '1px solid #1e1e2e' }}>
              <h2 style={{ color: '#f0f0f8' }}>{editingChapter ? 'Edit Chapter' : 'Add Chapter'}</h2>
              <button className="module-modal-close" onClick={resetForm}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <ChapterForm formData={formData} setFormData={setFormData} />
            </div>
            <div className="module-modal-footer" style={{ borderTop: '1px solid #1e1e2e' }}>
              <button className="module-cancel-btn" onClick={resetForm}>Cancel</button>
              <button
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                onClick={editingChapter ? updateChapter : createChapter}
                disabled={!formData.chapter_name}
              >
                {editingChapter ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Settings Modal ── */}
      {showSettingsModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowSettingsModal(false)}>
          <div className="module-modal" onClick={e => e.stopPropagation()} style={{ background: '#111118', border: '1px solid #1e1e2e', color: '#e8e8f0' }}>
            <div className="module-modal-header" style={{ borderBottom: '1px solid #1e1e2e' }}>
              <h2 style={{ color: '#f0f0f8' }}>Settings</h2>
              <button className="module-modal-close" onClick={() => setShowSettingsModal(false)}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Demo Booking Link
                </label>
                <input
                  type="url" value={bookingLink} onChange={e => setBookingLink(e.target.value)}
                  placeholder="https://calendar.google.com/…"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8, border: '1px solid #374151', background: '#0a0a0f', color: '#e8e8f0', fontSize: '0.875rem' }}
                />
              </div>
            </div>
            <div className="module-modal-footer" style={{ borderTop: '1px solid #1e1e2e' }}>
              <button className="module-cancel-btn" onClick={() => setShowSettingsModal(false)}>Cancel</button>
              <button
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                onClick={saveBookingLink} disabled={savingSettings}
              >
                {savingSettings ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Delete Confirm ── */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Chapter"
        message="This will permanently delete the chapter and all onboarding progress."
        confirmText="Delete" cancelText="Cancel" variant="danger"
        onConfirm={() => deleteConfirm.id && deleteChapter(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

function SummaryStats({ total, redCount, yellowCount, greenCount, needsAttention, totalMRR, totalAlumniSignedUp }: {
  total: number; redCount: number; yellowCount: number; greenCount: number;
  needsAttention: number; totalMRR: number; totalAlumniSignedUp: number;
}) {
  const stats = [
    { icon: <Users size={16} />, value: total, label: 'Total Chapters', color: '#6b7280' },
    { icon: <AlertTriangle size={16} />, value: needsAttention, label: 'Need Attention', color: needsAttention > 0 ? '#ef4444' : '#6b7280' },
    { icon: <CheckCircle2 size={16} />, value: greenCount, label: 'Healthy', color: '#10b981' },
    { icon: <TrendingUp size={16} />, value: `$${totalMRR.toLocaleString()}`, label: 'MRR', color: '#a78bfa' },
    { icon: <Zap size={16} />, value: totalAlumniSignedUp.toLocaleString(), label: 'Alumni Signed Up', color: '#60a5fa' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
      {stats.map((stat, i) => (
        <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: '#111118', border: '1px solid #1e1e2e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Chapter Triage Card ──────────────────────────────────────────────────────

function ChapterTriageCard({ chapter, onClick, onEdit }: {
  chapter: TriageChapter;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
}) {
  const tier = TIER_CONFIG[chapter.triage_tier];
  const status = STATUS_CONFIG[chapter.status] || STATUS_CONFIG.onboarding;
  const stats = chapter.alumni_stats;

  const coveragePct = stats?.outreach_coverage_pct ?? 0;
  const signedUp = stats?.signed_up ?? 0;
  const total = stats?.total ?? 0;

  return (
    <div
      onClick={onClick}
      style={{
        background: '#111118',
        border: `1px solid #1e1e2e`,
        borderRadius: 12,
        padding: '16px',
        cursor: 'pointer',
        transition: 'all 0.15s',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        animation: 'fadeIn 0.2s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = tier.color;
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 20px ${tier.color}20`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = '#1e1e2e';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
      }}
    >
      {/* Top accent line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: tier.color, borderRadius: '12px 12px 0 0' }} />

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, paddingTop: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#f0f0f8', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {chapter.chapter_name}
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[chapter.fraternity, chapter.school].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {/* Health score badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 20,
            background: tier.bg, border: `1px solid ${tier.border}`,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: tier.color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: tier.color }}>{chapter.health_score}</span>
          </div>
          <button
            onClick={onEdit}
            style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 6, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#9ca3af')}
            onMouseLeave={e => (e.currentTarget.style.color = '#4b5563')}
          >
            <Edit2 size={13} />
          </button>
        </div>
      </div>

      {/* Status + payment */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: status.bg, color: status.color,
        }}>
          {status.label}
        </span>
        {chapter.next_payment_date && (
          <PaymentBadge nextPaymentDate={chapter.next_payment_date} paymentAmount={chapter.payment_amount} />
        )}
        {chapter.instagram_flyer_posted && (
          <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: 20, background: 'rgba(236,72,153,0.12)', color: '#f472b6', fontWeight: 600 }}>
            <Instagram size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />Flyer ✓
          </span>
        )}
      </div>

      {/* Alumni stats row */}
      {total > 0 && (
        <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem' }}>
          <div>
            <span style={{ color: '#10b981', fontWeight: 700 }}>{signedUp}</span>
            <span style={{ color: '#6b7280' }}> / {total} signed up</span>
          </div>
          {coveragePct > 0 && (
            <div>
              <span style={{
                color: coveragePct >= 50 ? '#10b981' : coveragePct >= 25 ? '#f59e0b' : '#ef4444',
                fontWeight: 700,
              }}>
                {coveragePct}%
              </span>
              <span style={{ color: '#6b7280' }}> outreach</span>
            </div>
          )}
        </div>
      )}

      {/* Outreach coverage bar */}
      {total > 0 && (
        <div>
          <div style={{ height: 3, background: '#1e1e2e', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: `${Math.min(100, coveragePct)}%`,
              background: coveragePct >= 50 ? '#10b981' : coveragePct >= 25 ? '#f59e0b' : '#ef4444',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Last activity */}
      {chapter.days_since_last_activity !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: chapter.days_since_last_activity > 14 ? '#ef4444' : '#6b7280' }}>
          <Activity size={11} />
          {chapter.days_since_last_activity === 0 ? 'Activity today' :
           chapter.days_since_last_activity === 1 ? 'Active yesterday' :
           `${chapter.days_since_last_activity}d since last activity`}
        </div>
      )}

      {/* Next action CTA */}
      {chapter.next_required_action && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 10px', borderRadius: 8,
          background: chapter.triage_tier === 'red' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${chapter.triage_tier === 'red' ? 'rgba(239,68,68,0.15)' : '#1e1e2e'}`,
          marginTop: 4,
        }}>
          <span style={{ fontSize: '0.75rem', color: chapter.triage_tier === 'red' ? '#fca5a5' : '#9ca3af', flex: 1, lineHeight: 1.4 }}>
            {chapter.next_required_action}
          </span>
          <ChevronRight size={13} style={{ color: '#4b5563', flexShrink: 0 }} />
        </div>
      )}
    </div>
  );
}

// ─── Payment Badge ────────────────────────────────────────────────────────────

function PaymentBadge({ nextPaymentDate, paymentAmount }: { nextPaymentDate: string; paymentAmount?: number }) {
  const daysUntil = Math.ceil((new Date(nextPaymentDate).getTime() - Date.now()) / 86400000);
  const isOverdue = daysUntil < 0;
  const isDueSoon = daysUntil >= 0 && daysUntil <= 7;

  if (!isOverdue && !isDueSoon) return null;

  return (
    <span style={{
      fontSize: '0.68rem', padding: '2px 7px', borderRadius: 20,
      background: isOverdue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
      color: isOverdue ? '#ef4444' : '#f59e0b',
      fontWeight: 600,
    }}>
      <CreditCard size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
      {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `Due in ${daysUntil}d`}
    </span>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{ height: 72, borderRadius: 10, background: '#111118', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
      {/* Card skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{ height: 220, borderRadius: 12, background: '#111118', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', marginBottom: 20 }}>
        <HeartHandshake size={30} strokeWidth={1.5} />
      </div>
      <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f0f0f8', margin: '0 0 8px' }}>No chapters yet</h3>
      <p style={{ color: '#6b7280', margin: '0 0 24px', maxWidth: 360, lineHeight: 1.6 }}>
        Add your first chapter to start tracking onboarding, outreach, and health scores.
      </p>
      <button
        onClick={onAdd}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}
      >
        <Plus size={16} /> Add First Chapter
      </button>
    </div>
  );
}

// ─── Chapter Form (shared between add/edit) ───────────────────────────────────

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

function ChapterForm({ formData, setFormData }: { formData: FormState; setFormData: React.Dispatch<React.SetStateAction<FormState>> }) {
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px',
    borderRadius: 8, border: '1px solid #374151', background: '#0a0a0f',
    color: '#e8e8f0', fontSize: '0.85rem',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600,
    color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em',
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
            <option value="onboarding">Onboarding</option><option value="active">Active</option>
            <option value="at_risk">At Risk</option><option value="churned">Churned</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Check-in Frequency</label>
          <select style={inputStyle} value={formData.check_in_frequency} onChange={e => setFormData(p => ({ ...p, check_in_frequency: e.target.value as CheckInFrequency }))}>
            {Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div style={{ padding: '12px', background: '#0a0a0f', borderRadius: 8, border: '1px solid #1e1e2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <CreditCard size={14} style={{ color: '#a78bfa' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment</span>
        </div>
        <div className="module-form-row">
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={formData.payment_type} onChange={e => setFormData(p => ({ ...p, payment_type: e.target.value as Chapter['payment_type'] }))}>
              <option value="annual">Annual</option><option value="monthly">Monthly</option><option value="one_time">One-Time</option>
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
