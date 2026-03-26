'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, HeartHandshake, Edit2, Copy, X, Loader2,
  CreditCard,
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
import SuccessTab from './SuccessTab';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

type DashTab = 'sales' | 'setup' | 'alumni' | 'success';

export default function ChapterDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<ChapterWithOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashTab>('sales');
  const [showEditModal, setShowEditModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const sc = statusColors[chapter.status] || statusColors.onboarding;
  const hc = healthColors[chapter.health] || healthColors.good;

  const TABS: { id: DashTab; label: string }[] = [
    { id: 'sales', label: '💰 Sales' },
    { id: 'setup', label: '🚀 Set Up' },
    { id: 'alumni', label: '👥 Alumni Outreach' },
    { id: 'success', label: '✅ Success' },
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: '0.875rem' }}
            >
              <ArrowLeft size={18} /> Customer Success
            </button>
          </div>
          <div className="module-title-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="module-icon" style={{ backgroundColor: '#ec489915', color: '#ec4899' }}>
                <HeartHandshake size={22} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.4rem', lineHeight: 1.2 }}>{chapter.chapter_name}</h1>
                <p style={{ color: '#6b7280', marginTop: 2 }}>
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
                onClick={() => setShowEditModal(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }}
              >
                <Edit2 size={13} /> Edit
              </button>
              <button
                onClick={generateOnboardingLink}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: '#ec4899', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                <Copy size={13} /> Onboarding Link
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #f3f4f6', paddingBottom: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #ec4899' : '2px solid transparent',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: activeTab === tab.id ? 700 : 400,
                color: activeTab === tab.id ? '#ec4899' : '#6b7280',
                marginBottom: -2,
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'sales' && (
          <SalesTab chapter={chapter} onUpdate={fetchChapter} showToast={showToast} />
        )}
        {activeTab === 'setup' && (
          <SetUpTab chapter={chapter} onUpdate={fetchChapter} showToast={showToast} />
        )}
        {activeTab === 'alumni' && (
          <AlumniOutreachTab chapter={chapter} showToast={showToast} />
        )}
        {activeTab === 'success' && (
          <SuccessTab chapter={chapter} onUpdate={fetchChapter} showToast={showToast} />
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
              <div style={{ marginTop: 16, marginBottom: 16, padding: 16, background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><CreditCard size={18} style={{ color: '#8b5cf6' }} /><span style={{ fontWeight: 600, color: '#6b21a8' }}>Payment Tracking</span></div>
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
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="module-primary-btn" onClick={updateChapter} disabled={!formData.chapter_name}>Update</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
