'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  HeartHandshake, Plus, Search, X, AlertTriangle, Clock,
  Settings, Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  supabase, Chapter, ONBOARDING_STEPS, CheckInFrequency,
  CHECK_IN_FREQUENCY_LABELS, HEALTH_SCORE_COLORS,
  ChapterWithOnboarding,
} from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import ConfirmModal from '@/components/ConfirmModal';
import { ArrowLeft, LayoutDashboard, CreditCard, Edit2, Trash2, Link as LinkIcon } from 'lucide-react';

// ═══════════════════════════════════════════
// STICKY NOTE COLORS (from Projects pattern)
// ═══════════════════════════════════════════

// Warm, muted palette — intentional and editorial, not neon
const NOTE_COLORS = [
  { bg: '#FDF0E0', border: '#C4874A', text: '#5C3A1E', accent: '#C4874A' },  // warm amber
  { bg: '#EAF0E8', border: '#5C7A5A', text: '#2A4229', accent: '#4A6B47' },  // warm sage
  { bg: '#E8EDF5', border: '#4A6B8A', text: '#1B2A4A', accent: '#3A5A7A' },  // warm slate blue
  { bg: '#F5EFE0', border: '#9C7B4A', text: '#4A3519', accent: '#8A6A3A' },  // warm sand
  { bg: '#EDF0E8', border: '#6B7A52', text: '#2E3A22', accent: '#5A6A43' },  // warm olive
  { bg: '#F0E8E0', border: '#8A6050', text: '#3A2418', accent: '#7A5040' },  // warm clay
  { bg: '#E6EDF2', border: '#4A6878', text: '#1A3040', accent: '#3A5868' },  // warm steel
  { bg: '#F2EDE8', border: '#7A6850', text: '#3A2E20', accent: '#6A5840' },  // warm umber
  { bg: '#E8F0EC', border: '#4A7060', text: '#1E3830', accent: '#3A6050' },  // warm teal-green
  { bg: '#F5EAE0', border: '#B07040', text: '#503018', accent: '#A06030' },  // deep amber
];

function getNoteColor(index: number) {
  return NOTE_COLORS[index % NOTE_COLORS.length];
}

// ═══════════════════════════════════════════
// TOAST TYPE
// ═══════════════════════════════════════════

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function CustomerSuccessPage() {
  const router = useRouter();

  const [chapters, setChapters] = useState<ChapterWithOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'overdue' | 'stalled'>('all');

  const [showModal, setShowModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState<ChapterWithOnboarding | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });

  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [bookingLink, setBookingLink] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const [alumniPipeline, setAlumniPipeline] = useState<Record<string, {
    total: number; have_phone: number; imessage: number; contacted: number;
    responded: number; signed_up: number; touch1_ready: number; touch2_due: number; touch3_due: number;
  }>>({});

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

  useEffect(() => { fetchChapters(); fetchBookingLink(); }, []);

  async function fetchBookingLink() {
    try {
      const r = await fetch('/api/settings?key=booking_link');
      const res = await r.json();
      if (res.data?.value) setBookingLink(res.data.value);
    } catch { /* silent */ }
  }

  async function fetchChapters() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('chapters').select('*').order('created_at', { ascending: false });
    if (error) showToast('Failed to load chapters', 'error');
    else {
      setChapters(data || []);
      (data || []).forEach(ch => fetchAlumniCount(ch.id));
    }
    setLoading(false);
  }

  async function fetchAlumniCount(chapterId: string) {
    try {
      const res = await fetch(`/api/alumni/stats?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.data) {
        setAlumniPipeline(p => ({ ...p, [chapterId]: json.data }));
      }
    } catch { /* silent */ }
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
    else { showToast('Chapter created', 'success'); resetForm(); fetchChapters(); }
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
    else { showToast('Chapter updated', 'success'); resetForm(); fetchChapters(); }
  }

  async function deleteChapter(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('chapters').delete().eq('id', id);
    if (error) showToast('Failed to delete', 'error');
    else { showToast('Chapter deleted', 'success'); fetchChapters(); }
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

  function getCompletionPercentage(chapter: ChapterWithOnboarding): number {
    const done = ONBOARDING_STEPS.filter(s => chapter[s.key as keyof ChapterWithOnboarding]).length;
    return Math.round((done / ONBOARDING_STEPS.length) * 100);
  }

  function getDaysUntilCheckIn(chapter: ChapterWithOnboarding): number | null {
    if (!chapter.next_check_in_date) return null;
    return Math.ceil((new Date(chapter.next_check_in_date).getTime() - Date.now()) / 86400000);
  }

  function getDaysSinceActivity(chapter: ChapterWithOnboarding): number | null {
    if (!chapter.last_activity) return null;
    return Math.floor((Date.now() - new Date(chapter.last_activity).getTime()) / 86400000);
  }

  // Filtering
  let filteredChapters = chapters.filter(c => {
    const q = searchQuery.toLowerCase();
    const match = c.chapter_name.toLowerCase().includes(q) ||
      (c.school || '').toLowerCase().includes(q) ||
      (c.fraternity || '').toLowerCase().includes(q);
    return match && (filterStatus === 'all' || c.status === filterStatus);
  });
  if (quickFilter === 'overdue') filteredChapters = filteredChapters.filter(c => { const d = getDaysUntilCheckIn(c); return d !== null && d < 0; });
  if (quickFilter === 'stalled') filteredChapters = filteredChapters.filter(c => { const d = getDaysSinceActivity(c); return d !== null && d >= 7; });

  // Summary stats
  const totalChapters = chapters.length;
  const activeChapters = chapters.filter(c => c.status === 'active').length;
  const onboardingChapters = chapters.filter(c => c.status === 'onboarding').length;
  const totalMRR = chapters.reduce((s, c) => s + (c.mrr || 0), 0);
  const overdueCheckIns = chapters.filter(c => { const d = getDaysUntilCheckIn(c); return d !== null && d < 0; }).length;

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus" className="module-back"><ArrowLeft size={20} /> Back to Nucleus</Link>
            <Link href="/workspace" className="module-back"><LayoutDashboard size={20} /> Workspace</Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: 'rgba(196,135,74,0.12)', color: '#C4874A' }}>
              <HeartHandshake size={24} />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Instrument Serif', 'Playfair Display', Georgia, serif", fontWeight: 400, color: '#1B2A4A' }}>Customer Success</h1>
              <p>Chapter onboarding, alumni outreach, headhunting, and success tracking.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: 160, background: '#f3f4f6', borderRadius: 16, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i*0.1}s` }} />
            ))}
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="cs-summary-bar">
              <span><strong>{totalChapters}</strong> chapters</span>
              <span className="cs-dot">·</span>
              <span style={{ color: '#10b981' }}><strong>{activeChapters}</strong> active</span>
              <span className="cs-dot">·</span>
              <span style={{ color: '#f59e0b' }}><strong>{onboardingChapters}</strong> onboarding</span>
              <span className="cs-dot">·</span>
              <span><strong>${totalMRR.toLocaleString()}</strong> MRR</span>
              {overdueCheckIns > 0 && (
                <><span className="cs-dot">·</span>
                <span style={{ color: '#ef4444' }}><strong>{overdueCheckIns}</strong> overdue check-ins</span></>
              )}
            </div>

            {/* Actions bar */}
            <div className="module-actions-bar">
              <div className="module-search">
                <Search size={18} />
                <input
                  type="text" placeholder="Search chapters…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="module-actions">
                <div className="cs-quick-filters">
                  {(['all','overdue','stalled'] as const).map(f => (
                    <button key={f} className={`cs-quick-filter ${quickFilter === f ? 'active' : ''}`} onClick={() => setQuickFilter(f)}>
                      {f === 'overdue' && <AlertTriangle size={13} />}
                      {f === 'stalled' && <Clock size={13} />}
                      {f === 'all' ? 'All' : f === 'overdue' ? 'Overdue Check-in' : 'Stalled'}
                    </button>
                  ))}
                </div>
                <select className="module-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="at_risk">At Risk</option>
                  <option value="churned">Churned</option>
                </select>
                <button className="module-filter-btn" onClick={() => setShowSettingsModal(true)} title="Settings">
                  <Settings size={18} />
                </button>
              </div>
            </div>

            {/* Sticky Note Grid */}
            {filteredChapters.length === 0 ? (
              <div className="sn__empty">
                <HeartHandshake size={48} strokeWidth={1} />
                <h3>{quickFilter !== 'all' ? 'No chapters match the filter' : 'No chapters yet'}</h3>
                <p>Add your first chapter to start tracking customer success.</p>
                {quickFilter === 'all' && filterStatus === 'all' && (
                  <button className="sn__create-btn" onClick={() => setShowModal(true)}>
                    <Plus size={16} /> Add Chapter
                  </button>
                )}
              </div>
            ) : (
              <div className="sn__grid">
                {filteredChapters.map((chapter, i) => (
                  <ChapterNoteCard
                    key={chapter.id}
                    chapter={chapter}
                    colorIndex={i}
                    pipeData={alumniPipeline[chapter.id]}
                    setupPct={getCompletionPercentage(chapter)}
                    daysUntilCheckIn={getDaysUntilCheckIn(chapter)}
                    onClick={() => router.push(`/nucleus/customer-success/${chapter.id}`)}
                  />
                ))}
                {/* Add new card */}
                <button className="sn__add-card" onClick={() => setShowModal(true)}>
                  <Plus size={28} strokeWidth={1.5} />
                  <span>Add Chapter</span>
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
            <button className="toast-dismiss" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>

      {/* Add/Edit Chapter Modal */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={resetForm}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>{editingChapter ? 'Edit Chapter' : 'Add Chapter'}</h2>
              <button className="module-modal-close" onClick={resetForm}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-row">
                <div className="module-form-group"><label>Chapter Name *</label><input type="text" value={formData.chapter_name} onChange={e => setFormData({ ...formData, chapter_name: e.target.value })} placeholder="e.g. Ole Miss Phi Delt" /></div>
                <div className="module-form-group"><label>Fraternity</label><input type="text" value={formData.fraternity} onChange={e => setFormData({ ...formData, fraternity: e.target.value })} placeholder="e.g. Phi Delta Theta" /></div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group"><label>School</label><input type="text" value={formData.school} onChange={e => setFormData({ ...formData, school: e.target.value })} placeholder="e.g. University of Mississippi" /></div>
                <div className="module-form-group"><label>MRR ($)</label><input type="number" value={formData.mrr} onChange={e => setFormData({ ...formData, mrr: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group"><label>Contact Name</label><input type="text" value={formData.contact_name} onChange={e => setFormData({ ...formData, contact_name: e.target.value })} /></div>
                <div className="module-form-group"><label>Contact Email</label><input type="email" value={formData.contact_email} onChange={e => setFormData({ ...formData, contact_email: e.target.value })} /></div>
                <div className="module-form-group"><label>Contact Phone</label><input type="tel" value={formData.contact_phone} onChange={e => setFormData({ ...formData, contact_phone: e.target.value })} /></div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group"><label>Status</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as Chapter['status'] })}><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="at_risk">At Risk</option><option value="churned">Churned</option></select></div>
                <div className="module-form-group"><label>Health</label><select value={formData.health} onChange={e => setFormData({ ...formData, health: e.target.value as Chapter['health'] })}><option value="good">Good</option><option value="warning">Warning</option><option value="critical">Critical</option></select></div>
                <div className="module-form-group"><label>Check-in Frequency</label><select value={formData.check_in_frequency} onChange={e => setFormData({ ...formData, check_in_frequency: e.target.value as CheckInFrequency })}>{Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              {/* Payment */}
              <div style={{ marginTop: 16, marginBottom: 16, padding: 16, background: '#F7F5F1', borderRadius: 2, border: '1px solid #D9D4CC' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><CreditCard size={18} style={{ color: '#C4874A' }} /><span style={{ fontWeight: 600, color: '#1B2A4A' }}>Payment Tracking</span></div>
                <div className="module-form-row">
                  <div className="module-form-group"><label>Payment Day (1–31)</label><input type="number" min="1" max="31" value={formData.payment_day || ''} onChange={e => setFormData({ ...formData, payment_day: e.target.value ? parseInt(e.target.value) : null })} placeholder="15" /></div>
                  <div className="module-form-group"><label>Payment Type</label><select value={formData.payment_type} onChange={e => setFormData({ ...formData, payment_type: e.target.value as Chapter['payment_type'] })}><option value="annual">Annual</option><option value="monthly">Monthly</option><option value="one_time">One-Time</option></select></div>
                  <div className="module-form-group"><label>Amount ($)</label><input type="number" value={formData.payment_amount} onChange={e => setFormData({ ...formData, payment_amount: parseFloat(e.target.value) || 299 })} /></div>
                </div>
                <div className="module-form-row">
                  <div className="module-form-group"><label>Start Date</label><input type="date" value={formData.payment_start_date} onChange={e => setFormData({ ...formData, payment_start_date: e.target.value })} /></div>
                  <div className="module-form-group"><label>Last Payment</label><input type="date" value={formData.last_payment_date} onChange={e => setFormData({ ...formData, last_payment_date: e.target.value })} /></div>
                  <div className="module-form-group"><label>Next Payment</label><input type="date" value={formData.next_payment_date} onChange={e => setFormData({ ...formData, next_payment_date: e.target.value })} /></div>
                </div>
              </div>
              <div className="module-form-group"><label>Next Action</label><input type="text" value={formData.next_action} onChange={e => setFormData({ ...formData, next_action: e.target.value })} /></div>
              <div className="module-form-group"><label>Alumni Channels</label><input type="text" value={formData.alumni_channels} onChange={e => setFormData({ ...formData, alumni_channels: e.target.value })} placeholder="GroupMe, Slack, Email Newsletter…" /></div>
              <div className="module-form-group"><label>Notes</label><textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={3} /></div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={resetForm}>Cancel</button>
              <button className="module-primary-btn" onClick={editingChapter ? updateChapter : createChapter} disabled={!formData.chapter_name}>{editingChapter ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowSettingsModal(false)}>
          <div className="module-modal" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header"><h2>Settings</h2><button className="module-modal-close" onClick={() => setShowSettingsModal(false)}><X size={20} /></button></div>
            <div className="module-modal-body">
              <div className="module-form-group">
                <label><LinkIcon size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} /> Demo Booking Link</label>
                <input type="url" value={bookingLink} onChange={e => setBookingLink(e.target.value)} placeholder="https://calendar.google.com/…" />
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowSettingsModal(false)}>Cancel</button>
              <button className="module-primary-btn" onClick={saveBookingLink} disabled={savingSettings}>{savingSettings ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Chapter"
        message="This will permanently delete the chapter and all onboarding progress."
        confirmText="Delete" cancelText="Cancel" variant="danger"
        onConfirm={() => deleteConfirm.id && deleteChapter(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// CHAPTER STICKY NOTE CARD
// ═══════════════════════════════════════════

interface PipeData {
  total: number; signed_up: number;
}

function ChapterNoteCard({
  chapter, colorIndex, pipeData, setupPct, daysUntilCheckIn, onClick,
}: {
  chapter: ChapterWithOnboarding;
  colorIndex: number;
  pipeData?: PipeData;
  setupPct: number;
  daysUntilCheckIn: number | null;
  onClick: () => void;
}) {
  const color = getNoteColor(colorIndex);
  const isOverdue = daysUntilCheckIn !== null && daysUntilCheckIn < 0;

  const statusColors: Record<string, { bg: string; color: string }> = {
    onboarding: { bg: '#F5EFE0', color: '#6B4A1E' },
    active:     { bg: '#EAF0E8', color: '#2A4229' },
    at_risk:    { bg: '#F5E8E0', color: '#6B2A1E' },
    churned:    { bg: '#F0EDEA', color: '#5C5449' },
  };

  const healthColors: Record<string, { bg: string; color: string }> = {
    good:     { bg: '#EAF0E8', color: '#2A4229' },
    warning:  { bg: '#F5EFE0', color: '#6B4A1E' },
    critical: { bg: '#F5E8E0', color: '#6B2A1E' },
  };

  const statusLabels: Record<string, string> = {
    onboarding: 'Onboarding', active: 'Active', at_risk: 'At Risk', churned: 'Churned',
  };

  const sc = statusColors[chapter.status] || statusColors.onboarding;
  const hc = healthColors[chapter.health] || healthColors.good;

  return (
    <div
      className="sn__note"
      style={{
        '--note-bg': color.bg,
        '--note-border': color.border,
        '--note-text': color.text,
        '--note-accent': color.accent,
        cursor: 'pointer',
      } as React.CSSProperties}
      onClick={onClick}
    >
      <div className="sn__note-fold" />

      {/* Status badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: sc.bg, color: sc.color }}>
          {statusLabels[chapter.status]}
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: hc.bg, color: hc.color }}>
          {chapter.health === 'good' ? '✓ Good' : chapter.health === 'warning' ? '⚠ Warning' : '🔴 Critical'}
        </span>
        {isOverdue && (
          <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 2, background: '#F5E8E0', color: '#6B2A1E' }}>
            ⏰ Check-in overdue
          </span>
        )}
      </div>

      {/* Chapter name */}
      <h3 className="sn__note-title" style={{ fontSize: '1.05rem', marginBottom: 4, fontFamily: "'Instrument Serif', 'Playfair Display', Georgia, serif", fontWeight: 400 }}>{chapter.chapter_name}</h3>

      {/* Subtitle */}
      <p style={{ fontSize: '0.8rem', opacity: 0.75, marginBottom: 10, lineHeight: 1.4 }}>
        {chapter.fraternity}{chapter.fraternity && chapter.school ? ' · ' : ''}{chapter.school}
      </p>

      {/* Alumni signed up */}
      {pipeData && (
        <div style={{ fontSize: '0.8rem', marginBottom: 8, display: 'flex', gap: 12 }}>
          <span><strong style={{ color: '#059669' }}>{pipeData.signed_up}</strong> signed up</span>
          <span style={{ opacity: 0.6 }}>{pipeData.total} in DB</span>
        </div>
      )}

      {/* Setup progress bar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: 4, opacity: 0.75 }}>
          <span>Setup Progress</span>
          <span>{setupPct}%</span>
        </div>
        <div style={{ height: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${setupPct}%`,
            background: '#C4874A',
            transition: 'width 0.15s ease-out',
          }} />
        </div>
      </div>
    </div>
  );
}
