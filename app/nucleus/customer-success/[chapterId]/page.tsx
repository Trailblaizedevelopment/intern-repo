'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Edit2, Copy, X, Loader2,
  CreditCard, Eye, AlertTriangle, Clock,
  Instagram, BadgeCheck, FileText,
} from 'lucide-react';
import OnboardingWizard from '../OnboardingWizard';
import { useRouter, useParams } from 'next/navigation';
import {
  Chapter, ChapterWithOnboarding,
  CheckInFrequency as CIF, CHECK_IN_FREQUENCY_LABELS,
  ONBOARDING_STEPS,
} from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import SalesTab from './SalesTab';
import SetUpTab from './SetUpTab';
import AlumniOutreachTab from './AlumniOutreachTab';
import AlumniTab from './AlumniTab';
import MergedOutreachTab from './MergedOutreachTab';
import SuccessTab from './SuccessTab';
import AnalyticsTab from './AnalyticsTab';
import ActivityLogTab from './ActivityLogTab';
import EmailOutreachTab from '../EmailOutreachTab';
import {
  CS_UI, TIER_CONFIG, NEUTRAL_BADGE,
  TOOLBAR_BUTTON, TOOLBAR_BUTTON_PRIMARY, DETAIL_PILL, CS_CARD,
} from '../cs-ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

type DashTab = 'setup' | 'outreach' | 'alumni' | 'alumni_unified' | 'email' | 'success' | 'sales' | 'analytics' | 'activity';

interface SubmissionData {
  chapter: {
    id: string; chapter_name: string; school: string; fraternity: string;
    estimated_alumni?: number; alumni_list_url?: string;
  };
  executives: { full_name: string; position: string; email: string }[];
  outreach_channels: {
    channel_type: string;
    facebook_url?: string;
    facebook_member_count?: number;
    email_platform?: string;
    email_subscriber_count?: number;
    instagram_handle?: string;
    instagram_follower_count?: number;
    linkedin_url?: string;
    linkedin_member_count?: number;
    website_url?: string;
    description?: string;
  }[];
  submitted_at: string | null;
}

interface AlumniStats {
  total: number;
  have_phone: number;
  signed_up: number;
  outreach_coverage_pct: number;
  contacted: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXEC_POSITION_LABELS: Record<string, string> = {
  president: 'President', vp: 'Vice President', treasurer: 'Treasurer',
  secretary: 'Secretary', alumni_chair: 'Alumni Chair', risk_chair: 'Risk Chair',
  recruitment_chair: 'Recruitment Chair', social_chair: 'Social Chair', other: 'Other',
};

const OUTREACH_CHANNEL_LABELS: Record<string, string> = {
  facebook_group: 'Facebook Group', linkedin_group: 'LinkedIn Group',
  groupme: 'GroupMe', slack: 'Slack', discord: 'Discord',
  email_newsletter: 'Email Newsletter', website: 'Website', other: 'Other',
  instagram: 'Instagram', chapter_website: 'Chapter Website',
};

const TABS: { id: DashTab; label: string; icon?: string }[] = [
  { id: 'setup',         label: 'Setup' },
  { id: 'outreach',      label: 'Outreach' },
  { id: 'alumni_unified', label: 'Alumni View' },
  { id: 'alumni',        label: 'Alumni Data' },
  { id: 'email',         label: 'Email' },
  { id: 'success',       label: 'Success' },
  { id: 'sales',         label: 'Sales' },
  { id: 'analytics',     label: 'Analytics' },
  { id: 'activity',      label: 'Activity' },
];

function computeHealthScore(chapter: ChapterWithOnboarding, stats?: AlumniStats): { score: number; tier: 'red' | 'yellow' | 'green' } {
  let score = 0;
  const now = Date.now();

  // Payment (30 pts)
  if (chapter.next_payment_date) {
    const payDue = new Date(chapter.next_payment_date).getTime();
    if (payDue > now) score += 30;
    else if ((now - payDue) < 7 * 86400000) score += 15;
  } else if (chapter.status === 'active') {
    score += 15;
  }

  // Onboarding (20 pts)
  if (chapter.onboarding_completed) score += 20;

  // Outreach coverage (20 pts)
  const cov = stats?.outreach_coverage_pct ?? 0;
  if (cov >= 50) score += 20;
  else if (cov >= 25) score += 10;
  else if (cov > 0) score += 5;

  // Check-in recency (15 pts)
  if (chapter.last_check_in_date) {
    const daysSince = Math.floor((now - new Date(chapter.last_check_in_date).getTime()) / 86400000);
    if (daysSince <= 14) score += 15;
    else if (daysSince <= 30) score += 8;
    else if (daysSince <= 60) score += 3;
  }

  // Signups (15 pts)
  const signups = stats?.signed_up ?? 0;
  if (signups >= 10) score += 15;
  else if (signups > 0) score += 10;

  // Instagram flyer (5 pts)
  if (chapter.instagram_flyer_posted) score += 5;

  score = Math.max(0, Math.min(100, score));
  const tier: 'red' | 'yellow' | 'green' = score < 40 ? 'red' : score < 70 ? 'yellow' : 'green';
  return { score, tier };
}

// TIER_CONFIG imported from cs-ui

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChapterDashboardPage() {
  const router = useRouter();
  const params = useParams();
  const chapterId = params?.chapterId as string;

  const [chapter, setChapter] = useState<ChapterWithOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashTab>('setup');
  const [showEditModal, setShowEditModal] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alumniStats, setAlumniStats] = useState<AlumniStats | null>(null);

  // Submission viewer
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [loadingSubmission, setLoadingSubmission] = useState(false);

  // Wizard
  const [showWizard, setShowWizard] = useState(false);

  // Delete
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
    if (!chapterId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/chapters/${chapterId}`);
      const json = await res.json();
      if (!res.ok || !json.data) { showToast('Failed to load chapter', 'error'); setLoading(false); return; }
      setChapter(json.data as ChapterWithOnboarding);
    } catch {
      showToast('Failed to load chapter', 'error');
    } finally {
      setLoading(false);
    }
  }, [chapterId, showToast]);

  const fetchAlumniStats = useCallback(async () => {
    if (!chapterId) return;
    try {
      const res = await fetch(`/api/alumni/stats?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.data) setAlumniStats(json.data);
    } catch { /* silent */ }
  }, [chapterId]);

  useEffect(() => { fetchChapter(); fetchAlumniStats(); }, [fetchChapter, fetchAlumniStats]);

  // Auto-load submission when chapter has one
  useEffect(() => {
    if (chapter?.onboarding_submitted_at && !submission && !loadingSubmission) {
      viewSubmission();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id, chapter?.onboarding_submitted_at]);

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
    if (!chapter) return;
    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
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
      if (!res.ok) { showToast(`Failed: ${json.error || 'Unknown error'}`, 'error'); return; }
      showToast('Chapter updated', 'success');
      setShowEditModal(false);
      fetchChapter();
    } catch (err) {
      showToast(`Failed: ${String(err)}`, 'error');
    }
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
        method: 'DELETE', headers: { 'x-confirm-delete': 'CONFIRMED' },
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error ?? 'Delete failed', 'error'); setDeleting(false); return; }
      showToast(`"${json.deleted}" has been permanently deleted.`, 'info');
      router.push('/nucleus/customer-success');
    } catch { showToast('Delete failed', 'error'); setDeleting(false); }
  }

  async function viewSubmission() {
    if (!chapter) return;
    setLoadingSubmission(true);
    setShowSubmissionModal(true);
    try {
      const res = await fetch(`/api/onboarding/submission/${chapter.id}`);
      const json = await res.json();
      if (json.error) { showToast(json.error.message || 'Failed to load submission', 'error'); setShowSubmissionModal(false); }
      else setSubmission(json.data);
    } catch { showToast('Failed to load submission', 'error'); setShowSubmissionModal(false); }
    finally { setLoadingSubmission(false); }
  }

  // ─── Derived ──────────────────────────────────────────────────────────────

  const { score: healthScore, tier: healthTier } = chapter
    ? computeHealthScore(chapter, alumniStats ?? undefined)
    : { score: 0, tier: 'yellow' as const };

  const tierCfg = TIER_CONFIG[healthTier];

  const onboardingPct = chapter
    ? Math.round((ONBOARDING_STEPS.filter(s => chapter[s.key as keyof ChapterWithOnboarding]).length / ONBOARDING_STEPS.length) * 100)
    : 0;

  const statusConfig: Record<string, { label: string }> = {
    onboarding: { label: 'Onboarding' },
    active: { label: 'Active' },
    at_risk: { label: 'At Risk' },
    churned: { label: 'Churned' },
  };

  // ─── Loading / Error States ───────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: CS_UI.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: CS_UI.textMuted }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.875rem' }}>Loading chapter…</span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!chapter) {
    return (
      <div style={{ minHeight: '100vh', background: CS_UI.pageBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: CS_UI.text }}>
        <AlertTriangle size={40} style={{ color: CS_UI.danger }} />
        <h2 style={{ margin: 0 }}>Chapter not found</h2>
        <button
          type="button"
          onClick={() => router.push('/nucleus/customer-success')}
          style={TOOLBAR_BUTTON}
        >
          Back to Customer Success
        </button>
      </div>
    );
  }

  const sc = statusConfig[chapter.status] || statusConfig.onboarding;

  // Payment alert calculation
  const paymentAlertInfo = (() => {
    if (!chapter.next_payment_date) return null;
    const daysUntil = Math.ceil((new Date(chapter.next_payment_date).getTime() - Date.now()) / 86400000);
    if (daysUntil < 0) return { type: 'overdue' as const, days: Math.abs(daysUntil) };
    if (daysUntil <= 7) return { type: 'due_soon' as const, days: daysUntil };
    return null;
  })();

  return (
    <div style={{ minHeight: '100vh', background: CS_UI.pageBg, color: CS_UI.text, fontFamily: 'inherit' }}>
      {/* ── Payment Alert Banner ── */}
      {paymentAlertInfo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 24px',
          background: paymentAlertInfo.type === 'overdue' ? '#fef2f2' : '#fffbeb',
          borderBottom: `1px solid ${paymentAlertInfo.type === 'overdue' ? '#fecaca' : '#fde68a'}`,
          color: paymentAlertInfo.type === 'overdue' ? '#991b1b' : '#92400e',
          fontSize: '0.82rem', fontWeight: 600,
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          {paymentAlertInfo.type === 'overdue'
            ? `Payment overdue by ${paymentAlertInfo.days} day${paymentAlertInfo.days !== 1 ? 's' : ''} — was due ${new Date(chapter.next_payment_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : `Payment due in ${paymentAlertInfo.days} day${paymentAlertInfo.days !== 1 ? 's' : ''} — ${new Date(chapter.next_payment_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
          }
          {chapter.payment_amount ? (
            <span style={{ opacity: 0.75, fontWeight: 400 }}>
              {' '}· ${chapter.payment_amount.toLocaleString()}
            </span>
          ) : null}
        </div>
      )}
      <header style={{ background: 'rgba(249,250,251,0.95)', borderBottom: `1px solid ${CS_UI.border}`, backdropFilter: 'blur(8px)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '14px 24px' }}>
          <button
            type="button"
            onClick={() => router.push('/nucleus/customer-success')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: CS_UI.textMuted, fontSize: '0.8125rem', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px', fontFamily: 'inherit' }}
          >
            <ArrowLeft size={13} /> Customer Success
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: tierCfg.bg, border: `1px solid ${tierCfg.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 800, color: tierCfg.color, lineHeight: 1 }}>{healthScore}</span>
                <span style={{ fontSize: '0.45rem', color: tierCfg.color, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em' }}>score</span>
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: CS_UI.text, lineHeight: 1.2 }}>
                    {chapter.chapter_name}
                  </h1>
                  <span style={{ ...DETAIL_PILL, color: tierCfg.color, background: tierCfg.bg, border: `1px solid ${tierCfg.border}` }}>
                    {tierCfg.label}
                  </span>
                  <span style={{ ...DETAIL_PILL, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
                    {sc.label}
                  </span>
                  {chapter.contract_status && chapter.contract_status !== 'not_sent' && (() => {
                    const CONTRACT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
                      sent: { label: 'Contract Sent', color: CS_UI.warning, bg: '#fffbeb', border: '#fde68a' },
                      signed: { label: 'Contract Signed', color: CS_UI.success, bg: '#ecfdf5', border: '#6ee7b7' },
                      declined: { label: 'Contract Declined', color: CS_UI.danger, bg: '#fef2f2', border: '#fecaca' },
                      voided: { label: 'Contract Voided', color: CS_UI.textMuted, bg: NEUTRAL_BADGE.bg, border: NEUTRAL_BADGE.border },
                    };
                    const cfg = CONTRACT_STATUS_CONFIG[chapter.contract_status];
                    if (!cfg) return null;
                    return (
                      <span style={{ ...DETAIL_PILL, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                        <FileText size={10} />
                        {cfg.label}
                      </span>
                    );
                  })()}
                  {chapter.onboarding_completed && (
                    <span style={{ ...DETAIL_PILL, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
                      <BadgeCheck size={11} />
                      Setup Complete
                    </span>
                  )}
                </div>
                <p style={{ margin: '4px 0 0', color: CS_UI.textMuted, fontSize: '0.8125rem' }}>
                  {[chapter.fraternity, chapter.school].filter(Boolean).join(' · ')}
                </p>

                <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', fontSize: '0.75rem', color: CS_UI.textMuted }}>
                  {alumniStats && alumniStats.total > 0 && (
                    <>
                      <span><strong style={{ color: CS_UI.textSecondary }}>{alumniStats.total}</strong> alumni</span>
                      <span><strong style={{ color: CS_UI.textSecondary }}>{alumniStats.signed_up}</strong> signed up</span>
                      <span style={{ color: alumniStats.outreach_coverage_pct >= 50 ? CS_UI.success : alumniStats.outreach_coverage_pct >= 25 ? CS_UI.warning : CS_UI.danger }}>
                        <strong>{alumniStats.outreach_coverage_pct}%</strong> outreach
                      </span>
                    </>
                  )}
                  {chapter.last_check_in_date && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} />
                      Last check-in: {new Date(chapter.last_check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {chapter.mrr ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CreditCard size={11} />
                      <strong style={{ color: CS_UI.textSecondary }}>${chapter.mrr}/mo</strong>
                    </span>
                  ) : null}
                  {chapter.instagram_flyer_posted && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Instagram size={11} />
                      Flyer posted
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={viewSubmission}
                style={{
                  ...TOOLBAR_BUTTON,
                  ...(chapter?.onboarding_submitted_at
                    ? { border: `1px solid ${CS_UI.blue}`, background: CS_UI.blueBg, color: CS_UI.blueDark, fontWeight: 600 }
                    : {}),
                }}
              >
                <Eye size={13} /> {chapter?.onboarding_submitted_at ? 'View Submission' : 'Submission'}
              </button>
              <button type="button" onClick={() => setShowEditModal(true)} style={TOOLBAR_BUTTON}>
                <Edit2 size={13} /> Edit
              </button>
              <button type="button" onClick={generateOnboardingLink} style={TOOLBAR_BUTTON_PRIMARY}>
                <Copy size={13} /> Onboarding Link
              </button>
            </div>
          </div>

          {!chapter.onboarding_completed && (
            <div style={{ ...CS_CARD, marginTop: 14, padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.6875rem', color: CS_UI.textSubtle, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Setup Progress</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: CS_UI.textSecondary }}>{onboardingPct}%</span>
              </div>
              <div style={{ height: 4, background: CS_UI.border, borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 9999,
                  width: `${onboardingPct}%`,
                  background: onboardingPct >= 75 ? CS_UI.success : onboardingPct >= 40 ? CS_UI.warning : CS_UI.danger,
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          )}
        </div>

        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderTop: `1px solid ${CS_UI.border}`, scrollbarWidth: 'none', paddingTop: 2 }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 14px',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? `2px solid ${CS_UI.blue}` : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: activeTab === tab.id ? 600 : 500,
                  color: activeTab === tab.id ? CS_UI.blueDark : CS_UI.textMuted,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  fontFamily: 'inherit',
                  marginBottom: -1,
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Tab Content ── */}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px 32px' }}>
        {activeTab === 'setup' && (
          <>
            <SetUpTab chapter={chapter} onUpdate={fetchChapter} showToast={showToast} onOpenWizard={() => setShowWizard(true)} />
            {chapter.onboarding_submitted_at && submission && (
              <div style={{ maxWidth: 720, marginTop: 24 }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CS_UI.textSubtle, marginBottom: 12 }}>Onboarding Submission</div>
                <SubmissionView submission={submission} />
              </div>
            )}
            {chapter.onboarding_submitted_at && !submission && (
              <div style={{ maxWidth: 720, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={viewSubmission}
                  style={{ ...TOOLBAR_BUTTON, width: '100%', border: `1px solid ${CS_UI.blue}`, background: CS_UI.blueBg, color: CS_UI.blueDark, fontWeight: 600, height: 40, borderRadius: 12 }}
                >
                  <Eye size={16} /> Load Onboarding Submission (received {new Date(chapter.onboarding_submitted_at).toLocaleDateString()})
                </button>
              </div>
            )}
          </>
        )}
        {activeTab === 'outreach' && (
          <MergedOutreachTab chapter={chapter} showToast={showToast} onUpdate={fetchChapter} />
        )}
        {activeTab === 'alumni_unified' && (
          <AlumniTab chapter={chapter} showToast={showToast} />
        )}
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
        {activeTab === 'analytics' && (
          <AnalyticsTab chapter={chapter} showToast={showToast} />
        )}
        {activeTab === 'activity' && (
          <ActivityLogTab chapter={chapter} showToast={showToast} />
        )}
      </main>

      {/* ── Onboarding Wizard ── */}
      {showWizard && chapter && (
        <OnboardingWizard
          chapter={chapter}
          onClose={() => setShowWizard(false)}
          onComplete={() => { setShowWizard(false); fetchChapter(); fetchAlumniStats(); showToast('Chapter setup complete! 🎉', 'success'); }}
        />
      )}

      {/* ── Toasts ── */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 8, maxWidth: 360,
            background: t.type === 'success' ? '#f0fdf4' : t.type === 'error' ? '#fef2f2' : '#ffffff',
            border: `1px solid ${t.type === 'success' ? '#16a34a' : t.type === 'error' ? '#ef4444' : '#e5e7eb'}`,
            color: '#111827', fontSize: '0.85rem', boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
          }}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={13} /></button>
          </div>
        ))}
      </div>

      {/* ── Edit Modal ── */}
      {showEditModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowEditModal(false)}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827' }}>
            <div className="module-modal-header" style={{ borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ color: '#111827' }}>Edit Chapter</h2>
              <button className="module-modal-close" onClick={() => setShowEditModal(false)}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <EditChapterForm formData={formData} setFormData={setFormData} />

              {/* Danger Zone */}
              <div style={{ marginTop: 24, borderTop: '1px solid rgba(239,68,68,0.2)', paddingTop: 16 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Danger Zone</div>
                <button
                  onClick={() => { setShowEditModal(false); setDeleteConfirmName(''); setShowDeleteModal(true); }}
                  style={{ padding: '6px 14px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  Delete this chapter…
                </button>
              </div>
            </div>
            <div className="module-modal-footer" style={{ borderTop: '1px solid #e5e7eb' }}>
              <button className="module-cancel-btn" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button
                style={{ ...TOOLBAR_BUTTON_PRIMARY, padding: '8px 20px', height: 'auto', borderRadius: 9999 }}
                onClick={updateChapter} disabled={!formData.chapter_name}
              >
                Update
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Submission Modal ── */}
      {showSubmissionModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => { setShowSubmissionModal(false); setSubmission(null); }}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()} style={{ background: '#ffffff', border: '1px solid #e5e7eb', color: '#111827' }}>
            <div className="module-modal-header" style={{ borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ color: '#111827' }}>Onboarding Submission</h2>
              <button className="module-modal-close" onClick={() => { setShowSubmissionModal(false); setSubmission(null); }}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              {loadingSubmission ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0', color: '#6b7280' }}>
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
                </div>
              ) : submission ? (
                <SubmissionView submission={submission} />
              ) : (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '20px 0' }}>No submission found for this chapter.</p>
              )}
            </div>
            <div className="module-modal-footer" style={{ borderTop: '1px solid #e5e7eb' }}>
              <button className="module-cancel-btn" onClick={() => { setShowSubmissionModal(false); setSubmission(null); }}>Close</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Delete Modal ── */}
      {showDeleteModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => { setShowDeleteModal(false); setDeleteConfirmName(''); }}>
          <div className="module-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, background: '#ffffff', border: '1px solid #e5e7eb', borderTop: '4px solid #ef4444', color: '#111827' }}>
            <div className="module-modal-header" style={{ borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
              <h2 style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={18} /> Delete Chapter
              </h2>
              <button className="module-modal-close" onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(''); }}><X size={20} /></button>
            </div>
            <div className="module-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: '0.875rem', color: '#fca5a5', lineHeight: 1.6 }}>
                <strong>This cannot be undone.</strong> This will permanently remove all alumni contacts, outreach history, conversations, tasks, and campaigns for this chapter.
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                  Type <strong style={{ fontFamily: 'monospace', background: '#e5e7eb', padding: '1px 6px', borderRadius: 4, color: '#111827' }}>{chapter.chapter_name}</strong> to confirm:
                </label>
                <input
                  type="text" value={deleteConfirmName} onChange={e => setDeleteConfirmName(e.target.value)}
                  placeholder={chapter.chapter_name} autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: `1.5px solid ${deleteConfirmName === chapter.chapter_name ? '#ef4444' : '#e5e7eb'}`, background: '#ffffff', color: '#111827', fontSize: '0.875rem' }}
                />
              </div>
            </div>
            <div className="module-modal-footer" style={{ borderTop: '1px solid rgba(239,68,68,0.15)' }}>
              <button className="module-cancel-btn" onClick={() => { setShowDeleteModal(false); setDeleteConfirmName(''); }} disabled={deleting}>Cancel</button>
              <button
                onClick={deleteChapter}
                disabled={deleteConfirmName !== chapter.chapter_name || deleting}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: deleteConfirmName === chapter.chapter_name ? '#ef4444' : '#6b7280',
                  color: '#fff', cursor: deleteConfirmName === chapter.chapter_name && !deleting ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {deleting ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Deleting…</> : '🗑 Delete Forever'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #ffffff; }
        ::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
      `}</style>
    </div>
  );
}

// ─── Edit Form ────────────────────────────────────────────────────────────────

interface EditFormState {
  chapter_name: string; school: string; fraternity: string;
  contact_name: string; contact_email: string; contact_phone: string;
  status: Chapter['status']; health: Chapter['health']; mrr: number;
  next_action: string; notes: string; alumni_channels: string;
  payment_day: number | null; payment_type: Chapter['payment_type'];
  payment_amount: number; payment_start_date: string;
  last_payment_date: string; next_payment_date: string;
  check_in_frequency: CIF;
}

function EditChapterForm({ formData, setFormData }: { formData: EditFormState; setFormData: React.Dispatch<React.SetStateAction<EditFormState>> }) {
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#ffffff', color: '#111827', fontSize: '0.85rem' };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };
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
          <select style={inputStyle} value={formData.check_in_frequency} onChange={e => setFormData(p => ({ ...p, check_in_frequency: e.target.value as CIF }))}>
            {Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div style={{ padding: '12px', background: '#ffffff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <CreditCard size={14} style={{ color: '#a78bfa' }} />
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Payment</span>
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
          <div><label style={labelStyle}>Last Payment</label><input style={inputStyle} type="date" value={formData.last_payment_date} onChange={e => setFormData(p => ({ ...p, last_payment_date: e.target.value }))} /></div>
          <div><label style={labelStyle}>Next Payment</label><input style={inputStyle} type="date" value={formData.next_payment_date} onChange={e => setFormData(p => ({ ...p, next_payment_date: e.target.value }))} /></div>
        </div>
      </div>
      <div><label style={labelStyle}>Next Action</label><input style={inputStyle} type="text" value={formData.next_action} onChange={e => setFormData(p => ({ ...p, next_action: e.target.value }))} /></div>
      <div><label style={labelStyle}>Notes</label><textarea style={{ ...inputStyle, resize: 'vertical' }} value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={3} /></div>
    </div>
  );
}

// ─── Submission View ──────────────────────────────────────────────────────────

function SubmissionView({ submission }: { submission: SubmissionData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: '#ffffff', borderRadius: 10, padding: '14px 18px', border: '1px solid #e5e7eb' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8, color: '#111827' }}>{submission.chapter.chapter_name}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.85rem', color: '#9ca3af' }}>
          {submission.chapter.school && <div><span style={{ color: '#6b7280' }}>School:</span> {submission.chapter.school}</div>}
          {submission.chapter.estimated_alumni && <div><span style={{ color: '#6b7280' }}>Est. Alumni:</span> {submission.chapter.estimated_alumni}</div>}
          {submission.submitted_at && <div><span style={{ color: '#6b7280' }}>Submitted:</span> {new Date(submission.submitted_at).toLocaleDateString()}</div>}
        </div>
        {submission.chapter.alumni_list_url && (
          <div style={{ marginTop: 10 }}>
            <a href={submission.chapter.alumni_list_url} target="_blank" rel="noopener noreferrer" style={{ color: CS_UI.blueDark, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
              📎 Download Alumni List
            </a>
          </div>
        )}
      </div>
      {submission.outreach_channels.length > 0 && (
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 10 }}>Outreach Channels</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {submission.outreach_channels.map((ch, i) => {
              const label = OUTREACH_CHANNEL_LABELS[ch.channel_type] || ch.channel_type;
              const details: string[] = [];
              if (ch.facebook_member_count) details.push(`${ch.facebook_member_count} members`);
              if (ch.email_subscriber_count) details.push(`${ch.email_subscriber_count} subscribers`);
              if (ch.instagram_follower_count) details.push(`${ch.instagram_follower_count} followers`);
              if (ch.linkedin_member_count) details.push(`${ch.linkedin_member_count} members`);
              if (ch.email_platform) details.push(ch.email_platform);
              if (ch.description) details.push(ch.description);
              const url = ch.facebook_url || ch.linkedin_url || ch.website_url || (ch.instagram_handle ? `https://instagram.com/${ch.instagram_handle.replace('@','')}` : null);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#ffffff', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 600, flex: 1, color: '#111827' }}>{label}</div>
                  {details.length > 0 && <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>{details.join(' · ')}</div>}
                  {url && <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', fontSize: '0.78rem', textDecoration: 'none' }}>↗</a>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {submission.executives.length > 0 && (
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: 10 }}>Executive Board</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {submission.executives.map((exec, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#ffffff', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 600, flex: 1, color: '#111827' }}>{exec.full_name}</div>
                <div style={{ color: '#6b7280', fontSize: '0.78rem' }}>{EXEC_POSITION_LABELS[exec.position] || exec.position}</div>
                <div style={{ color: '#60a5fa', fontSize: '0.78rem' }}>{exec.email}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
