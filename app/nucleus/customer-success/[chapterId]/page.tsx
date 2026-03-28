'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, HeartHandshake, Edit2, Copy, X, Loader2,
  CreditCard, Eye,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import {
  supabase, Chapter, ChapterWithOnboarding,
  CheckInFrequency as CIF, CHECK_IN_FREQUENCY_LABELS,
  HEALTH_SCORE_COLORS,
} from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import SalesTab from './SalesTab';
import SetUpTab from './SetUpTab';
import AlumniOutreachTab from './AlumniOutreachTab';
import AlumniTab from './AlumniTab';
import MergedOutreachTab from './MergedOutreachTab';
import SuccessTab from './SuccessTab';
import EmailOutreachTab from '../EmailOutreachTab';
import EmailTemplatesTab from '../EmailTemplatesTab';
// EmailTemplatesTab is now embedded inside EmailOutreachTab — kept for direct import if needed

const EXECUTIVE_POSITION_LABELS: Record<string, string> = {
  president: 'President', vp: 'Vice President', treasurer: 'Treasurer',
  secretary: 'Secretary', alumni_chair: 'Alumni Chair', risk_chair: 'Risk Chair',
  recruitment_chair: 'Recruitment Chair', social_chair: 'Social Chair', other: 'Other',
};
const OUTREACH_CHANNEL_LABELS: Record<string, string> = {
  facebook_group: 'Facebook Group', linkedin_group: 'LinkedIn Group',
  groupme: 'GroupMe', slack: 'Slack', discord: 'Discord',
  email_newsletter: 'Email Newsletter', website: 'Website', other: 'Other',
};

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

type DashTab = 'setup' | 'outreach' | 'alumni' | 'alumni_unified' | 'conversations' | 'email' | 'linqoutreach' | 'emailtemplates' | 'success' | 'sales';

interface SubmissionData {
  chapter: {
    id: string;
    chapter_name: string;
    school: string;
    fraternity: string;
    estimated_alumni?: number;
    alumni_list_url?: string;
  };
  executives: { full_name: string; position: string; email: string }[];
  outreach_channels: { channel_type: string; facebook_member_count?: number; email_subscriber_count?: number; linkedin_member_count?: number; description?: string }[];
  submitted_at: string | null;
}

export default function ChapterDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<ChapterWithOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashTab>('setup');
  const [showEditModal, setShowEditModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Submission viewer
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);

  // Delete chapter flow
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    chapter_name: '', school: '', fraternity: '', contact_name: '',
    contact_email: '', contact_phone: '', status: 'onboarding' as Chapter['status'],
    health: 'good' as Chapter['health'], mrr: 0, next_action: '', notes: '',
    alumni_channels: '', payment_day: null as number | null,
    payment_type: 'annual' as Chapter['payment_type'], payment_amount: 299,
    payment_start_date: '', last_payment_date: '', next_payment_date: '',
    check_in_frequency: 'biweekly' as CIF,
  });

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now().toString();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  const fetchChapter = useCallback(async () => {
    if (!supabase || !chapterId) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .eq('id', chapterId)
      .single();
    if (error || !data) {
      showToast('Failed to load chapter', 'error');
      setLoading(false);
      return;
    }
    setChapter(data as ChapterWithOnboarding);
    setLoading(false);
  }, [chapterId, showToast]);

  useEffect(() => { fetchChapter(); }, [fetchChapter]);

  useEffect(() => {
    if (!chapter) return;
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
  }, [chapter]);

  async function updateChapter() {
    if (!supabase || !chapter) return;
    const { error } = await supabase.from('chapters').update({
      ...formData,
      payment_start_date: formData.payment_start_date || null,
      last_payment_date: formData.last_payment_date || null,
      next_payment_date: formData.next_payment_date || null,
    }).eq('id', chapter.id);
    if (error) showToast(`Failed: ${error.message}`, 'error');
    else { showToast('Chapter updated', 'success'); setShowEditModal(false); fetchChapter(); }
  }

  async function generateOnboardingLink() {
    if (!chapter) return;
    try {
      const r = await fetch('/api/onboarding/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapter.id, regenerate: !!chapter.onboarding_token }),
      });
      const res = await r.json();
      if (res.error) return showToast(res.error.message, 'error');
      const link = `${window.location.origin}/onboard/${res.data.token}`;
      await navigator.clipboard.writeText(link);
      showToast('Onboarding link copied!', 'success');
      fetchChapter();
    } catch { showToast('Failed to generate link', 'error'); }
  }

  async function deleteChapter() {
    if (!chapter || deleteConfirmName !== chapter.chapter_name) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'DELETE',
        headers: { 'x-confirm-delete': 'CONFIRMED' },
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Delete failed', 'error');
        setDeleting(false);
        return;
      }
      showToast(`"${json.deleted}" has been permanently deleted.`, 'info');
      router.push('/nucleus/customer-success');
    } catch {
      showToast('Delete failed', 'error');
      setDeleting(false);
    }
  }

  async function viewSubmission() {
    if (!chapter) return;
    setLoadingSubmission(true);
    setShowSubmissionModal(true);
    try {
      const res = await fetch(`/api/onboarding/submission/${chapter.id}`);
      const json = await res.json();
      if (json.error) {
        showToast(json.error.message || 'Failed to load submission', 'error');
        setShowSubmissionModal(false);
      } else {
        setSubmission(json.data);
      }
    } catch {
      showToast('Failed to load submission', 'error');
      setShowSubmissionModal(false);
    } finally {
      setLoadingSubmission(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12 }}>
        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading chapter…</span>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Chapter not found</h2>
        <button onClick={() => router.push('/nucleus/customer-success')} style={{ marginTop: 16, padding: '8px 20px', cursor: 'pointer' }}>
          Back to Customer Success
        </button>
      </div>
    );
  }

  const statusLabels: Record<Chapter['status'], string> = {
    onboarding: 'Onboarding', active: 'Active', at_risk: 'At Risk', churned: 'Churned',
  };

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

  const sc = statusColors[chapter.status] || statusColors.onboarding;
  const hc = healthColors[chapter.health] || healthColors.good;

  const TABS: { id: DashTab; label: string }[] = [
    { id: 'setup', label: '🚀 Set Up' },
    { id: 'outreach', label: '📤 Outreach' },
    { id: 'alumni_unified', label: '🎓 Alumni View' },
    { id: 'alumni', label: '👥 Alumni Data' },
    { id: 'email', label: '📧 Email Outreach' },
    // emailtemplates is now merged into the email tab — removed as standalone
    { id: 'success', label: '✅ Success' },
    { id: 'sales', label: '💰 Sales' },
  ];

  return (
    <div className="module-page">
      {/* Header */}
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <button
              className="module-back"
              onClick={() => router.push('/nucleus/customer-success')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#5C5449', fontSize: '0.875rem', transition: 'color 0.15s ease-out' }}
            >
              <ArrowLeft size={18} /> Customer Success
            </button>
          </div>
          <div className="module-title-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="module-icon" style={{ backgroundColor: 'rgba(196,135,74,0.12)', color: '#C4874A' }}>
                <HeartHandshake size={22} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', lineHeight: 1.2, fontFamily: "'Instrument Serif', 'Playfair Display', Georgia, serif", fontWeight: 400, color: '#1B2A4A' }}>{chapter.chapter_name}</h1>
                <p style={{ color: '#5C5449', marginTop: 2 }}>
                  {chapter.fraternity}{chapter.fraternity && chapter.school ? ' · ' : ''}{chapter.school}
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color }}>
                {statusLabels[chapter.status]}
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: hc.bg, color: hc.color }}>
                {chapter.health === 'good' ? '✓ Good' : chapter.health === 'warning' ? '⚠ Warning' : '🔴 Critical'}
              </span>
              <button
                onClick={viewSubmission}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 2, border: '1px solid #D9D4CC', background: '#F7F5F1', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#5C5449', transition: 'border-color 0.15s ease-out' }}
              >
                <Eye size={13} /> View Submission
              </button>
              <button
                onClick={() => setShowEditModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 2, border: '1px solid #D9D4CC', background: '#F7F5F1', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#5C5449', transition: 'border-color 0.15s ease-out' }}
              >
                <Edit2 size={13} /> Edit
              </button>
              <button
                onClick={generateOnboardingLink}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 2, border: 'none', background: '#1B2A4A', color: '#F7F5F1', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'background 0.15s ease-out' }}
              >
                <Copy size={13} /> Onboarding Link
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid #D9D4CC', paddingBottom: 0, overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #1B2A4A' : '2px solid transparent',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? '#1B2A4A' : '#5C5449',
                marginBottom: -1,
                transition: 'color 0.15s ease-out, border-color 0.15s ease-out',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'setup' && (
          <SetUpTab chapter={chapter} onUpdate={fetchChapter} showToast={showToast} />
        )}
        {/* Merged Outreach tab: stats + conversations + contact list */}
        {activeTab === 'outreach' && (
          <MergedOutreachTab chapter={chapter} showToast={showToast} onUpdate={fetchChapter} />
        )}
        {/* Unified alumni view: merged internal + external platform data */}
        {activeTab === 'alumni_unified' && (
          <AlumniTab chapter={chapter} showToast={showToast} />
        )}
        {/* Legacy alumni data tab — kept for CSV import and pipeline detail */}
        {activeTab === 'alumni' && (
          <AlumniOutreachTab chapter={chapter} showToast={showToast} onUpdate={fetchChapter} />
        )}
        {activeTab === 'email' && (
          <EmailOutreachTab showToast={showToast} />
        )}
        {activeTab === 'success' && (
          <SuccessTab chapter={chapter} onUpdate={fetchChapter} showToast={showToast} />
        )}
        {activeTab === 'sales' && (
          <SalesTab chapter={chapter} onUpdate={fetchChapter} showToast={showToast} />
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

      {/* Edit Modal */}
      {showEditModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowEditModal(false)}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>Edit Chapter</h2>
              <button className="module-modal-close" onClick={() => setShowEditModal(false)}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-row">
                <div className="module-form-group"><label>Chapter Name *</label><input type="text" value={formData.chapter_name} onChange={e => setFormData({ ...formData, chapter_name: e.target.value })} /></div>
                <div className="module-form-group"><label>Fraternity</label><input type="text" value={formData.fraternity} onChange={e => setFormData({ ...formData, fraternity: e.target.value })} /></div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group"><label>School</label><input type="text" value={formData.school} onChange={e => setFormData({ ...formData, school: e.target.value })} /></div>
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
                <div className="module-form-group"><label>Check-in Frequency</label><select value={formData.check_in_frequency} onChange={e => setFormData({ ...formData, check_in_frequency: e.target.value as CIF })}>{Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              <div style={{ marginTop: 16, marginBottom: 16, padding: 16, background: '#F7F5F1', borderRadius: 2, border: '1px solid #D9D4CC' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><CreditCard size={18} style={{ color: '#C4874A' }} /><span style={{ fontWeight: 600, color: '#1B2A4A' }}>Payment Tracking</span></div>
                <div className="module-form-row">
                  <div className="module-form-group"><label>Payment Day</label><input type="number" min="1" max="31" value={formData.payment_day || ''} onChange={e => setFormData({ ...formData, payment_day: e.target.value ? parseInt(e.target.value) : null })} /></div>
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
              <div className="module-form-group"><label>Alumni Channels</label><input type="text" value={formData.alumni_channels} onChange={e => setFormData({ ...formData, alumni_channels: e.target.value })} /></div>
              <div className="module-form-group"><label>Notes</label><textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={3} /></div>

              {/* ── Danger Zone ── */}
              <div style={{ marginTop: 28, borderTop: '1px solid #fca5a5', paddingTop: 16 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Danger Zone
                </div>
                <button
                  onClick={() => { setShowEditModal(false); setDeleteConfirmName(''); setShowDeleteModal(true); }}
                  style={{
                    padding: '6px 14px', borderRadius: 2,
                    background: 'transparent', border: '1px solid #fca5a5',
                    color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                  }}
                >
                  Delete this chapter…
                </button>
                <span style={{ marginLeft: 10, fontSize: '0.75rem', color: '#9ca3af' }}>
                  Permanently removes all data. Cannot be undone.
                </span>
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="module-primary-btn" onClick={updateChapter} disabled={!formData.chapter_name}>Update</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Submission Viewer Modal */}
      {showSubmissionModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => { setShowSubmissionModal(false); setSubmission(null); }}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>Onboarding Submission</h2>
              <button className="module-modal-close" onClick={() => { setShowSubmissionModal(false); setSubmission(null); }}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              {loadingSubmission ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#6b7280' }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  Loading submission…
                </div>
              ) : submission ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Chapter info */}
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>{submission.chapter.chapter_name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.85rem', color: '#374151' }}>
                      {submission.chapter.school && <div><span style={{ color: '#6b7280' }}>School:</span> {submission.chapter.school}</div>}
                      {submission.chapter.fraternity && <div><span style={{ color: '#6b7280' }}>Fraternity:</span> {submission.chapter.fraternity}</div>}
                      {submission.chapter.estimated_alumni && <div><span style={{ color: '#6b7280' }}>Est. Alumni:</span> {submission.chapter.estimated_alumni}</div>}
                      {submission.submitted_at && <div><span style={{ color: '#6b7280' }}>Submitted:</span> {new Date(submission.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>}
                    </div>
                    {submission.chapter.alumni_list_url && (
                      <div style={{ marginTop: 10 }}>
                        <a href={submission.chapter.alumni_list_url} target="_blank" rel="noopener noreferrer" style={{ color: '#C4874A', fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
                          📎 Download Alumni List
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Exec board */}
                  {submission.executives.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 10 }}>Executive Board</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {submission.executives.map((exec, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, fontSize: '0.85rem' }}>
                            <div style={{ fontWeight: 600, flex: 1 }}>{exec.full_name}</div>
                            <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>{EXECUTIVE_POSITION_LABELS[exec.position] || exec.position}</div>
                            <div style={{ color: '#2563eb', fontSize: '0.8rem' }}>{exec.email}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Outreach channels */}
                  {submission.outreach_channels.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 10 }}>Outreach Channels</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {submission.outreach_channels.map((ch, i) => {
                          const memberCount = ch.facebook_member_count || ch.email_subscriber_count || ch.linkedin_member_count;
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, fontSize: '0.85rem' }}>
                              <div style={{ fontWeight: 600, flex: 1 }}>{OUTREACH_CHANNEL_LABELS[ch.channel_type] || ch.channel_type}</div>
                              {memberCount && <div style={{ color: '#6b7280' }}>{memberCount.toLocaleString()} members</div>}
                              {ch.description && <div style={{ color: '#9ca3af', fontSize: '0.78rem' }}>{ch.description}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {submission.executives.length === 0 && submission.outreach_channels.length === 0 && (
                    <p style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '20px 0' }}>
                      No detailed submission data available yet.
                    </p>
                  )}
                </div>
              ) : (
                <p style={{ color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center', padding: '20px 0' }}>
                  No submission found for this chapter.
                </p>
              )}
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => { setShowSubmissionModal(false); setSubmission(null); }}>Close</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Delete Chapter Modal ── */}
      {showDeleteModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => { setShowDeleteModal(false); setDeleteConfirmName(''); }}>
          <div
            className="module-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 480, borderTop: '4px solid #dc2626' }}
          >
            <div className="module-modal-header" style={{ borderBottom: '1px solid #fee2e2' }}>
              <h2 style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚠ Delete Chapter
              </h2>
              <button
                className="module-modal-close"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(''); }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 16px', fontSize: '0.875rem', color: '#991b1b', lineHeight: 1.6 }}>
                <strong>This action is permanent and cannot be undone.</strong> Deleting this chapter will permanently remove:
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  <li>All alumni contacts &amp; outreach history</li>
                  <li>All Linq conversations</li>
                  <li>All tasks &amp; check-ins</li>
                  <li>All email campaigns &amp; templates for this chapter</li>
                  <li>All members, matches, and notes</li>
                </ul>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                  Type <strong style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{chapter.chapter_name}</strong> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={e => setDeleteConfirmName(e.target.value)}
                  placeholder={chapter.chapter_name}
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '9px 12px', border: '1.5px solid #fca5a5',
                    borderRadius: 6, fontSize: '0.875rem', outline: 'none',
                    fontFamily: 'inherit',
                    borderColor: deleteConfirmName === chapter.chapter_name ? '#dc2626' : '#fca5a5',
                  }}
                />
              </div>
            </div>
            <div className="module-modal-footer" style={{ borderTop: '1px solid #fee2e2' }}>
              <button
                className="module-cancel-btn"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(''); }}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={deleteChapter}
                disabled={deleteConfirmName !== chapter.chapter_name || deleting}
                style={{
                  padding: '8px 20px', borderRadius: 2, border: 'none',
                  background: deleteConfirmName === chapter.chapter_name ? '#dc2626' : '#fca5a5',
                  color: '#fff', cursor: deleteConfirmName === chapter.chapter_name && !deleting ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.15s',
                }}
              >
                {deleting ? (
                  <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</>
                ) : (
                  <>🗑 Delete Forever</>
                )}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
