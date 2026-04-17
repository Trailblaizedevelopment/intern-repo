'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Plus, Send, Eye, BarChart2, Users, ChevronRight,
  Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Loader2, ArrowLeft, MousePointer, Inbox, Trash2, Calendar,
  TrendingUp, Copy, Check,
} from 'lucide-react';
import EmailTemplatesTab from './EmailTemplatesTab';
import { EmailCampaignEditorV2 } from './EmailCampaignEditorV2';
/* ─── Types ─── */

interface Campaign {
  id: string;
  chapter_id: string;
  chapter_name: string;
  touch_number: 1 | 2 | 3;
  subject_line: string;
  template_html: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  scheduled_at: string | null;
  sent_at: string | null;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  unsubscribed_count: number;
  failed_count: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  next_touch_eligible_at: string | null;
  next_touch_due: boolean;
  created_at: string;
}

interface EmailSend {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  first_clicked_at: string | null;
  bounced_at: string | null;
  unsubscribed_at: string | null;
}

interface Chapter { id: string; chapter_name: string; }
interface Template { id: string; touch_number?: number; template_text?: string; html_content?: string; subject_line?: string; name?: string; }

interface EmailOutreachTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

/* ─── Constants ─── */

const TOUCH_CONFIG = {
  1: { label: 'Touch 1 — Initial', color: '#7c3aed', bg: '#ede9fe', days: null },
  2: { label: 'Touch 2 — Follow-up', color: '#d97706', bg: '#fef3c7', days: 5 },
  3: { label: 'Touch 3 — Final', color: '#2563eb', bg: '#dbeafe', days: 8 },
} as const;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:     { label: 'Draft',     color: '#6b7280', bg: '#f3f4f6',  icon: <Clock size={12} /> },
  scheduled: { label: 'Scheduled', color: '#d97706', bg: '#fef3c7',  icon: <Calendar size={12} /> },
  sending:   { label: 'Sending…',  color: '#2563eb', bg: '#dbeafe',  icon: <Loader2 size={12} /> },
  sent:      { label: 'Sent',      color: '#059669', bg: '#f0fdf4',  icon: <CheckCircle2 size={12} /> },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: '#fef2f2',  icon: <XCircle size={12} /> },
  paused:    { label: 'Paused',    color: '#f59e0b', bg: '#fffbeb',  icon: <AlertTriangle size={12} /> },
};

/* ─── Helpers ─── */

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function fmtNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ─── Main component ─── */

export default function EmailOutreachTab({ showToast }: EmailOutreachTabProps) {
  const [emailSection, setEmailSection] = useState<'campaigns' | 'templates'>('campaigns');
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendsFilter, setSendsFilter] = useState('');


  // Per-touch form state — each touch number keeps its own data
  const [touchForms, setTouchForms] = useState<Record<number, { subject_line: string; template_html: string; scheduled_at: string }>>({
    1: { subject_line: '', template_html: '', scheduled_at: '' },
    2: { subject_line: '', template_html: '', scheduled_at: '' },
    3: { subject_line: '', template_html: '', scheduled_at: '' },
  });

  const [activeTouch, setActiveTouch] = useState<1|2|3>(1);
  // Derived form for backwards compat with existing code
  const form = { touch_number: activeTouch, ...touchForms[activeTouch] };
  function setForm(updater: ((f: typeof form) => Partial<typeof form>) | Partial<typeof form>) {
    const updates = typeof updater === 'function' ? updater(form) : updater;
    setTouchForms(prev => ({
      ...prev,
      [activeTouch]: { ...prev[activeTouch], ...updates },
    }));
    if (updates.touch_number && updates.touch_number !== activeTouch) {
      setActiveTouch(updates.touch_number as 1|2|3);
    }
  }
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);

  /* ─── Data fetching ─── */

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedChapter
        ? `/api/email-outreach/campaigns?chapter_id=${selectedChapter}`
        : `/api/email-outreach/campaigns`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.error) setCampaigns(json.data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [selectedChapter]);

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch('/api/chapters');
      const json = await res.json();
      if (!json.error) setChapters(json.data || []);
    } catch { /* silent */ }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/email-templates`);
      const json = await res.json();
      if (!json.error) setTemplates(json.data || []);
    } catch { /* silent */ }
  }, []);

  const fetchCampaignDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/email-outreach/campaigns/${id}`);
      const json = await res.json();
      if (!json.error) {
        setSelectedCampaign(json.data.campaign);
        setSends(json.data.sends || []);
      }
    } catch { /* silent */ }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { fetchCampaigns(); fetchChapters(); fetchTemplates(); }, [fetchCampaigns, fetchChapters, fetchTemplates]);

  /* ─── Actions ─── */

  async function createCampaign() {
    // Require at minimum T1 subject + content
    if (!selectedChapter) { showToast('Select a chapter first', 'error'); return; }
    const t1 = touchForms[1];
    if (!t1.subject_line || !t1.template_html) {
      showToast('T1 subject and content are required', 'error'); return;
    }
    setSaving(true);
    try {
      // Create all filled touches as a sequence in parallel
      const touches = [1, 2, 3].filter(t => touchForms[t].subject_line && touchForms[t].template_html);
      const results = await Promise.all(
        touches.map(t =>
          fetch('/api/email-outreach/campaigns', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chapter_id: selectedChapter,
              touch_number: t,
              subject_line: touchForms[t].subject_line,
              template_html: touchForms[t].template_html,
              scheduled_at: touchForms[t].scheduled_at || null,
            }),
          }).then(r => r.json())
        )
      );
      const errors = results.filter(r => r.error);
      if (errors.length > 0) { showToast(errors[0].error, 'error'); return; }
      showToast(`${touches.length}-touch campaign created (T${touches.join(', T')})`, 'success');
      setView('list');
      setTouchForms({ 1: { subject_line: '', template_html: '', scheduled_at: '' }, 2: { subject_line: '', template_html: '', scheduled_at: '' }, 3: { subject_line: '', template_html: '', scheduled_at: '' } });
      setActiveTouch(1);
      fetchCampaigns();
    } catch { showToast('Failed to create campaign', 'error'); }
    finally { setSaving(false); }
  }

  async function sendCampaign(campaignId: string) {
    if (!confirm('Send this campaign now? This will email all eligible contacts.')) return;
    setSending(true);
    try {
      const res = await fetch(`/api/email-outreach/campaigns/${campaignId}/send`, { method: 'POST' });
      const json = await res.json();
      if (json.error) { showToast(json.error, 'error'); return; }
      const d = json.data;
      showToast(`Sent to ${d.sent} contacts${d.failed ? ` (${d.failed} failed)` : ''}`, 'success');
      fetchCampaigns();
      if (selectedCampaign?.id === campaignId) fetchCampaignDetail(campaignId);
    } catch { showToast('Send failed', 'error'); }
    finally { setSending(false); }
  }

  async function cancelCampaign(campaignId: string) {
    if (!confirm('Cancel this campaign?')) return;
    await fetch(`/api/email-outreach/campaigns/${campaignId}`, { method: 'DELETE' });
    showToast('Campaign cancelled', 'info');
    fetchCampaigns();
    if (view === 'detail') setView('list');
  }

  function loadTemplate(touch: number) {
    // Email templates don't have touch_number — just load the first/best available
    const t = templates[0];
    if (t) {
      setForm(f => ({
        ...f,
        template_html: t.html_content || t.template_text || '',
        subject_line: t.subject_line || f.subject_line,
      }));
      showToast(`Template "${t.name || 'Untitled'}" loaded`, 'success');
    } else {
      showToast('No email templates saved yet — create one in the Email Templates tab first', 'info');
    }
  }

  /* ─── Section switcher (Campaigns vs Templates) ─── */
  const sectionSwitcher = (
    <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
      {([
        { id: 'campaigns' as const, label: '📤 Campaigns' },
        { id: 'templates' as const, label: '📨 Templates' },
      ]).map(s => (
        <button
          key={s.id}
          onClick={() => setEmailSection(s.id)}
          style={{
            padding: '8px 16px', border: 'none',
            borderBottom: emailSection === s.id ? '2px solid #2563eb' : '2px solid transparent',
            background: 'none', cursor: 'pointer',
            fontSize: '0.85rem', fontWeight: emailSection === s.id ? 600 : 400,
            color: emailSection === s.id ? '#2563eb' : '#6b7280',
            marginBottom: -1, transition: 'all 0.15s ease-out',
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );

  /* ─── Templates section ─── */
  if (emailSection === 'templates') {
    return (
      <div>
        {sectionSwitcher}
        <EmailTemplatesTab showToast={showToast} />
      </div>
    );
  }

  /* ─── Render: Campaign list ─── */

  if (view === 'list') {
    const grouped = {
      active: campaigns.filter(c => ['draft', 'scheduled', 'sending'].includes(c.status)),
      sent:   campaigns.filter(c => c.status === 'sent'),
      other:  campaigns.filter(c => ['cancelled', 'paused'].includes(c.status)),
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {sectionSwitcher}
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #2563eb, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Mail size={16} />
              </div>
              Email Outreach
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
              3-touch email cadence: T1 → T2 (5 days) → T3 (8 days after T2)
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={selectedChapter}
              onChange={e => setSelectedChapter(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.875rem', color: '#374151', background: '#fff', cursor: 'pointer' }}
            >
              <option value="">All chapters</option>
              {chapters.map(c => <option key={c.id} value={c.id}>{c.chapter_name}</option>)}
            </select>
            <button
              onClick={() => { if (!selectedChapter) { showToast('Select a chapter first', 'info'); return; } setView('create'); }}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> New Campaign
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', padding: 20 }}>
            <Loader2 size={18} className="animate-spin" />
            <span style={{ fontSize: '0.875rem' }}>Loading campaigns…</span>
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', background: '#f9fafb', borderRadius: 14, border: '1px solid #e5e7eb' }}>
            <Mail size={36} style={{ margin: '0 auto 12px', display: 'block', color: '#d1d5db' }} />
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#374151' }}>No campaigns yet</p>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#9ca3af' }}>Select a chapter and create your first email campaign</p>
          </div>
        ) : (
          <>
            {/* Active campaigns */}
            {grouped.active.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active</span>
                {grouped.active.map(c => <CampaignCard key={c.id} campaign={c} onOpen={() => { setSelectedCampaign(c); fetchCampaignDetail(c.id); setView('detail'); }} onSend={() => sendCampaign(c.id)} onCancel={() => cancelCampaign(c.id)} sending={sending} />)}
              </div>
            )}
            {/* Sent campaigns */}
            {grouped.sent.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sent</span>
                {grouped.sent.map(c => <CampaignCard key={c.id} campaign={c} onOpen={() => { setSelectedCampaign(c); fetchCampaignDetail(c.id); setView('detail'); }} onSend={() => sendCampaign(c.id)} onCancel={() => cancelCampaign(c.id)} sending={sending} />)}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  /* ─── Render: Create campaign ─── */

  if (view === 'create') {
    const chapterName = chapters.find(c => c.id === selectedChapter)?.chapter_name || '';
    const touchCfg = TOUCH_CONFIG[form.touch_number as 1 | 2 | 3];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setView('list')} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8125rem', color: '#374151' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>New Email Campaign</h2>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>{chapterName}</p>
          </div>
        </div>

        <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Touch selector */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 8 }}>Touch Number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {([1, 2, 3] as const).map(t => {
                  const cfg = TOUCH_CONFIG[t];
                  const selected = form.touch_number === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setActiveTouch(t)}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `2px solid ${selected ? cfg.color : '#e5e7eb'}`, background: selected ? cfg.bg : '#fff', color: selected ? cfg.color : '#6b7280', cursor: 'pointer', fontWeight: selected ? 700 : 500, fontSize: '0.8125rem', transition: 'all 0.15s' }}
                    >
                      <div style={{ fontWeight: 700 }}>T{t}</div>
                      <div style={{ fontSize: '0.7rem', marginTop: 2 }}>{cfg.days ? `${cfg.days}d after T${t - 1}` : 'First touch'}</div>
                    </button>
                  );
                })}
              </div>
              {templates.find(t => t.touch_number === form.touch_number) && (
                <button
                  onClick={() => loadTemplate(form.touch_number)}
                  style={{ marginTop: 8, padding: '5px 12px', borderRadius: 7, border: '1px solid #dbeafe', background: '#eff6ff', color: '#2563eb', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Copy size={12} /> Load saved template for T{form.touch_number}
                </button>
              )}
            </div>

            {/* Subject */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 6 }}>Subject Line *</label>
              <input
                type="text"
                value={form.subject_line}
                onChange={e => setForm(f => ({ ...f, subject_line: e.target.value }))}
                placeholder="e.g. Join the {chapter} alumni network on Trailblaize"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none' }}
              />
              <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>Variables: {'{first_name}'}, {'{last_name}'}, {'{chapter}'}</p>
            </div>

            {/* Body — dual-mode editor */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 8 }}>Email Body *</label>
              <EmailCampaignEditorV2
                value={form.template_html}
                onChange={html => setForm(f => ({ ...f, template_html: html }))}
                chapterName={chapterName}
              />
              <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>
                Visual mode for easy editing · HTML mode for full control with live preview
                {' · '}Variables: {'{first_name}'}, {'{last_name}'}, {'{chapter}'}
              </p>
            </div>

            {/* Schedule (optional) */}
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 6 }}>
                Schedule <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#9ca3af' }}>(optional — leave blank to send manually)</span>
              </label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
                style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button onClick={() => setView('list')} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>Cancel</button>
              <button
                onClick={createCampaign}
                disabled={saving || !touchForms[1].subject_line || !touchForms[1].template_html}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? '#9ca3af' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : `Create ${[1,2,3].filter(t=>touchForms[t].subject_line&&touchForms[t].template_html).length}-Touch Campaign`}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Render: Campaign detail ─── */

  if (view === 'detail' && selectedCampaign) {
    const c = selectedCampaign;
    const statusCfg = STATUS_CONFIG[c.status];

    const filteredSends = sends.filter(s =>
      !sendsFilter || s.status === sendsFilter || s.email.includes(sendsFilter) || `${s.first_name} ${s.last_name}`.toLowerCase().includes(sendsFilter.toLowerCase())
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => { setView('list'); fetchCampaigns(); }} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8125rem', color: '#374151' }}>
            <ArrowLeft size={14} /> Back
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>{c.subject_line}</span>
              <span style={{ padding: '2px 8px', borderRadius: 20, background: TOUCH_CONFIG[c.touch_number].bg, color: TOUCH_CONFIG[c.touch_number].color, fontSize: '0.7rem', fontWeight: 700 }}>
                {TOUCH_CONFIG[c.touch_number].label}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: statusCfg.bg, color: statusCfg.color, fontSize: '0.7rem', fontWeight: 700 }}>
                {statusCfg.icon} {statusCfg.label}
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>{c.chapter_name} · Created {fmtDate(c.created_at)}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {c.status !== 'sent' && c.status !== 'cancelled' && (
              <button
                onClick={() => sendCampaign(c.id)}
                disabled={sending}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: sending ? '#9ca3af' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', cursor: sending ? 'not-allowed' : 'pointer', fontSize: '0.8125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                {c.status === 'draft' ? 'Send Now' : 'Resend Failed'}
              </button>
            )}
            {['draft', 'scheduled'].includes(c.status) && (
              <button onClick={() => cancelCampaign(c.id)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Trash2 size={13} /> Cancel
              </button>
            )}
          </div>
        </div>

        {/* Stats grid — Mailchimp-style */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {[
            { icon: <Users size={16} />, label: 'Sent', value: fmtNum(c.sent_count), color: '#374151' },
            { icon: <CheckCircle2 size={16} />, label: 'Delivered', value: fmtNum(c.delivered_count), color: '#059669' },
            { icon: <Eye size={16} />, label: 'Opens', value: `${c.open_rate}%`, sub: `${c.opened_count} contacts`, color: '#2563eb' },
            { icon: <MousePointer size={16} />, label: 'Clicks', value: `${c.click_rate}%`, sub: `${c.clicked_count} contacts`, color: '#7c3aed' },
            { icon: <AlertTriangle size={16} />, label: 'Bounced', value: `${c.bounce_rate}%`, sub: `${c.bounced_count} contacts`, color: c.bounced_count > 0 ? '#d97706' : '#9ca3af' },
            { icon: <XCircle size={16} />, label: 'Unsubs', value: String(c.unsubscribed_count), color: c.unsubscribed_count > 0 ? '#ef4444' : '#9ca3af' },
          ].map(stat => (
            <div key={stat.label} style={{ padding: '12px 14px', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: stat.color, marginBottom: 4 }}>
                {stat.icon}
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9ca3af' }}>{stat.label}</span>
              </div>
              <div style={{ fontSize: '1.375rem', fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              {stat.sub && <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>{stat.sub}</div>}
            </div>
          ))}
        </div>

        {/* Next touch callout */}
        {c.status === 'sent' && c.touch_number < 3 && c.next_touch_eligible_at && (
          <div style={{ padding: '12px 16px', borderRadius: 12, border: `1px solid ${c.next_touch_due ? '#bbf7d0' : '#e5e7eb'}`, background: c.next_touch_due ? '#f0fdf4' : '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {c.next_touch_due ? <CheckCircle2 size={18} style={{ color: '#16a34a' }} /> : <Clock size={18} style={{ color: '#6b7280' }} />}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: c.next_touch_due ? '#166534' : '#374151' }}>
                  {c.next_touch_due ? `Touch ${c.touch_number + 1} is ready to send` : `Touch ${c.touch_number + 1} eligible ${fmtDate(c.next_touch_eligible_at)}`}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  {TOUCH_CONFIG[c.touch_number].days === null ? '' : `${TOUCH_CONFIG[(c.touch_number + 1) as 2 | 3].days} days after this campaign`}
                </div>
              </div>
            </div>
            {c.next_touch_due && (
              <button
                onClick={() => { setForm(f => ({ ...f, touch_number: (c.touch_number + 1) as 1 | 2 | 3 })); setSelectedChapter(c.chapter_id); setView('create'); loadTemplate((c.touch_number + 1) as 1 | 2 | 3); }}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={13} /> Create T{c.touch_number + 1}
              </button>
            )}
          </div>
        )}

        {/* Contacts table */}
        {detailLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', padding: 16 }}><Loader2 size={16} className="animate-spin" /><span style={{ fontSize: '0.875rem' }}>Loading contacts…</span></div>
        ) : (
          <div style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', flex: 1 }}>Contacts ({sends.length})</span>
              <input
                type="text"
                value={sendsFilter}
                onChange={e => setSendsFilter(e.target.value)}
                placeholder="Filter by name, email, or status…"
                style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.8125rem', width: 220, outline: 'none' }}
              />
              <button onClick={() => fetchCampaignDetail(c.id)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#374151' }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Contact', 'Email', 'Status', 'Sent', 'Opened', 'Clicked'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSends.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>No contacts found</td></tr>
                  ) : filteredSends.map((s, i) => {
                    const sCfg = STATUS_CONFIG[s.status] || STATUS_CONFIG.draft;
                    return (
                      <tr key={s.id} style={{ borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>{s.first_name} {s.last_name}</td>
                        <td style={{ padding: '9px 12px', color: '#6b7280' }}>{s.email}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: sCfg.bg, color: sCfg.color, fontSize: '0.7rem', fontWeight: 700 }}>
                            {sCfg.icon} {sCfg.label}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', color: '#9ca3af', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{s.sent_at ? fmtDate(s.sent_at) : '—'}</td>
                        <td style={{ padding: '9px 12px' }}>{s.opened_at ? <span style={{ color: '#2563eb', fontSize: '0.75rem' }}>✓ {fmtDate(s.opened_at)}</span> : <span style={{ color: '#d1d5db' }}>—</span>}</td>
                        <td style={{ padding: '9px 12px' }}>{s.first_clicked_at ? <span style={{ color: '#7c3aed', fontSize: '0.75rem' }}>✓ {fmtDate(s.first_clicked_at)}</span> : <span style={{ color: '#d1d5db' }}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/* ─── Campaign card sub-component ─── */

function CampaignCard({ campaign: c, onOpen, onSend, onCancel, sending }: {
  campaign: Campaign;
  onOpen: () => void;
  onSend: () => void;
  onCancel: () => void;
  sending: boolean;
}) {
  const statusCfg = STATUS_CONFIG[c.status];
  const touchCfg  = TOUCH_CONFIG[c.touch_number];

  return (
    <div
      style={{ borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onClick={onOpen}
    >
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {/* Touch badge */}
        <div style={{ width: 40, height: 40, borderRadius: 10, background: touchCfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: touchCfg.color }}>T{c.touch_number}</span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{c.subject_line}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 20, background: statusCfg.bg, color: statusCfg.color, fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
              {statusCfg.icon} {statusCfg.label}
            </span>
            {c.next_touch_due && (
              <span style={{ padding: '2px 7px', borderRadius: 20, background: '#f0fdf4', color: '#16a34a', fontSize: '0.7rem', fontWeight: 700 }}>
                T{c.touch_number + 1} ready
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>{c.chapter_name}</span>
            {c.sent_count > 0 && (
              <>
                <span style={{ color: '#374151' }}>{c.sent_count} sent</span>
                <span style={{ color: '#2563eb' }}>📬 {c.open_rate}% opens</span>
                <span style={{ color: '#7c3aed' }}>🖱 {c.click_rate}% clicks</span>
              </>
            )}
            {c.status === 'sent' && c.sent_at && <span>Sent {new Date(c.sent_at).toLocaleDateString()}</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {c.status === 'draft' && (
            <button
              onClick={onSend}
              disabled={sending}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', cursor: sending ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send
            </button>
          )}
          <ChevronRight size={18} style={{ color: '#d1d5db', alignSelf: 'center' }} />
        </div>
      </div>

      {/* Progress bar for sent campaigns */}
      {c.status === 'sent' && c.sent_count > 0 && (
        <div style={{ height: 3, background: '#f3f4f6' }}>
          <div style={{ height: '100%', width: `${c.open_rate}%`, background: 'linear-gradient(90deg, #2563eb, #7c3aed)', borderRadius: 3, transition: 'width 0.5s' }} />
        </div>
      )}
    </div>
  );
}
