'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  HeartHandshake, Plus, Search, X, AlertTriangle, Clock,
  Send, Mail, Settings, Loader2,
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
import LinqOutreachTab from './LinqOutreachTab';
import EmailTemplatesTab from './EmailTemplatesTab';
import { ArrowLeft, LayoutDashboard, CreditCard, Edit2, Trash2, Link as LinkIcon } from 'lucide-react';

// ═══════════════════════════════════════════
// STICKY NOTE COLORS (from Projects pattern)
// ═══════════════════════════════════════════

const NOTE_COLORS = [
  { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', accent: '#D97706' },  // amber
  { bg: '#DBEAFE', border: '#3B82F6', text: '#1E3A5F', accent: '#2563EB' },  // blue
  { bg: '#D1FAE5', border: '#10B981', text: '#065F46', accent: '#059669' },  // emerald
  { bg: '#FCE7F3', border: '#EC4899', text: '#831843', accent: '#DB2777' },  // pink
  { bg: '#EDE9FE', border: '#8B5CF6', text: '#4C1D95', accent: '#7C3AED' },  // violet
  { bg: '#FEE2E2', border: '#EF4444', text: '#7F1D1D', accent: '#DC2626' },  // red
  { bg: '#E0F2FE', border: '#0EA5E9', text: '#0C4A6E', accent: '#0284C7' },  // sky
  { bg: '#F3E8FF', border: '#A855F7', text: '#581C87', accent: '#9333EA' },  // purple
  { bg: '#CCFBF1', border: '#14B8A6', text: '#134E4A', accent: '#0D9488' },  // teal
  { bg: '#FFF7ED', border: '#F97316', text: '#7C2D12', accent: '#EA580C' },  // orange
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
  const [moduleView, setModuleView] = useState<'chapters' | 'outreach' | 'templates'>('chapters');

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
            <div className="module-icon" style={{ backgroundColor: '#ec489915', color: '#ec4899' }}>
              <HeartHandshake size={24} />
            </div>
            <div>
              <h1>Customer Success</h1>
              <p>Chapter onboarding, alumni outreach, headhunting, and success tracking.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* Module-level navigation */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #f3f4f6', paddingBottom: 0 }}>
          {([
            { id: 'chapters', label: 'Chapters', icon: <HeartHandshake size={14} /> },
            { id: 'outreach', label: 'Linq Outreach', icon: <Send size={14} /> },
            { id: 'templates', label: 'Email Templates', icon: <Mail size={14} /> },
          ] as const).map(view => (
            <button
              key={view.id}
              onClick={() => setModuleView(view.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px',
                border: 'none',
                borderBottom: moduleView === view.id ? '2px solid #ec4899' : '2px solid transparent',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: moduleView === view.id ? 600 : 400,
                color: moduleView === view.id ? '#ec4899' : '#6b7280',
                marginBottom: -2,
                transition: 'all 0.15s',
              }}
            >
              {view.icon} {view.label}
            </button>
          ))}
        </div>

        {moduleView === 'outreach' ? (
          <LinqOutreachTab showToast={showToast} />
        ) : moduleView === 'templates' ? (
          <EmailTemplatesTab showToast={showToast} />
        ) : loading ? (
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
              <div style={{ marginTop: 16, marginBottom: 16, padding: 16, background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><CreditCard size={18} style={{ color: '#8b5cf6' }} /><span style={{ fontWeight: 600, color: '#6b21a8' }}>Payment Tracking</span></div>
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
    onboarding: { bg: '#fef3c7', color: '#92400e' },
    active:     { bg: '#d1fae5', color: '#065f46' },
    at_risk:    { bg: '#fee2e2', color: '#991b1b' },
    churned:    { bg: '#f3f4f6', color: '#374151' },
  };

  const healthColors: Record<string, { bg: string; color: string }> = {
    good:     { bg: '#d1fae5', color: '#065f46' },
    warning:  { bg: '#fef3c7', color: '#92400e' },
    critical: { bg: '#fee2e2', color: '#991b1b' },
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
          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#fee2e2', color: '#991b1b' }}>
            ⏰ Check-in overdue
          </span>
        )}
      </div>

      {/* Chapter name */}
      <h3 className="sn__note-title" style={{ fontSize: '1.05rem', marginBottom: 4 }}>{chapter.chapter_name}</h3>

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
        <div style={{ height: 5, background: 'rgba(0,0,0,0.1)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${setupPct}%`,
            background: setupPct >= 75 ? '#10b981' : setupPct >= 50 ? '#f59e0b' : '#f97316',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    </div>
  );
}
