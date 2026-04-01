'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare, Mail, Users, Phone, CheckCircle, XCircle, Clock,
  RefreshCw, Plus, Edit2, Trash2, Eye, X, ChevronDown, Search,
  Loader2, AlertCircle, Smartphone, Check, Inbox,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';

// ─────────────────────────── Types ────────────────────────────────────────

interface AlumniContact {
  id: string;
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  chapter_id: string;
  outreach_status: string;
  is_imessage: boolean | null;
  assigned_line: number | null;
  touch1_sent_at: string | null;
  touch2_sent_at: string | null;
  touch3_sent_at: string | null;
  last_response_at: string | null;
  response_text: string | null;
  response_classification: string | null;
  signed_up_at: string | null;
  flagged?: boolean | null;
}

interface OutreachBatch {
  id: string;
  scheduled_date: string;
  status: string;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  contacts?: BatchContact[];
}

interface BatchContact {
  id: string;
  batch_id: string;
  contact_id: string | null;
  name: string | null;
  phone: string | null;
  chapter: string | null;
  touch_number: number | null;
  linq_line: number | null;
  message_preview: string | null;
  status: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subject_line: string | null;
  html_content: string;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface Chapter {
  id: string;
  chapter_name: string;
}

// ─────────────────────────── Constants ─────────────────────────────────────

const LINES = [
  { number: 1, label: 'Owen',  phone: '+16462101111', color: { bg: '#ede9fe', text: '#7c3aed' } },
  { number: 2, label: 'Adam',  phone: '+16462668785', color: { bg: '#dbeafe', text: '#1d4ed8' } },
  { number: 3, label: 'Ford',  phone: '+16462442696', color: { bg: '#d1fae5', text: '#065f46' } },
] as const;

const TEMPLATE_CATEGORIES = [
  { id: 'onboarding',   label: 'Onboarding',   color: '#10b981' },
  { id: 'follow-up',    label: 'Follow-Up',    color: '#f59e0b' },
  { id: 'nurture',      label: 'Nurture',      color: '#8b5cf6' },
  { id: 'announcement', label: 'Announcement', color: '#3b82f6' },
] as const;

// ─────────────────────────── Helpers ───────────────────────────────────────

function getContactStatusBadge(c: AlumniContact) {
  if (c.outreach_status === 'signed_up' || c.signed_up_at)
    return { emoji: '✅', label: 'Signed Up',     bg: '#d1fae5', text: '#065f46' };
  if (c.outreach_status === 'opted_out')
    return { emoji: '🔴', label: 'Opted Out',     bg: '#fee2e2', text: '#991b1b' };
  if (c.last_response_at) {
    const hrs = (Date.now() - new Date(c.last_response_at).getTime()) / 3600000;
    if (hrs < 48)
      return { emoji: '🟢', label: 'New Reply',   bg: '#d1fae5', text: '#065f46' };
    return   { emoji: '🟡', label: 'Replied',     bg: '#fef3c7', text: '#92400e' };
  }
  if (c.touch1_sent_at)
    return { emoji: '🟡', label: 'Awaiting',      bg: '#fef3c7', text: '#92400e' };
  return   { emoji: '⚪', label: 'Not Contacted', bg: '#f3f4f6', text: '#374151' };
}

type TouchStage = 'not_sent' | 'touch1_sent' | 'touch1_confirmed' | 'touch2_sent' | 'touch3_sent';

function getTouchStage(c: AlumniContact): TouchStage {
  if (!c.touch1_sent_at) return 'not_sent';
  if (!c.touch2_sent_at)
    return c.response_classification === 'confirmed' ? 'touch1_confirmed' : 'touch1_sent';
  if (!c.touch3_sent_at) return 'touch2_sent';
  return 'touch3_sent';
}

const STAGE_LABELS: Record<TouchStage, { label: string; color: string; bg: string }> = {
  not_sent:        { label: 'Not Sent',     color: '#6b7280', bg: '#f3f4f6' },
  touch1_sent:     { label: 'Touch 1 →',   color: '#7c3aed', bg: '#ede9fe' },
  touch1_confirmed:{ label: 'Confirmed ✓', color: '#059669', bg: '#d1fae5' },
  touch2_sent:     { label: 'Touch 2 →',   color: '#d97706', bg: '#fef3c7' },
  touch3_sent:     { label: 'Touch 3 →',   color: '#2563eb', bg: '#dbeafe' },
};

// ─────────────────────────── Component ────────────────────────────────────

export default function OutreachPage() {
  const [activeTab, setActiveTab] = useState<'imessage' | 'email'>('imessage');

  /* ── iMessage state ── */
  const [chapters, setChapters]             = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>('all');
  const [contacts, setContacts]             = useState<AlumniContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [touchFilter, setTouchFilter]       = useState<string>('all');
  const [contactSearch, setContactSearch]   = useState('');

  /* ── Batch state ── */
  const [batches, setBatches]               = useState<OutreachBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [expandedBatch, setExpandedBatch]   = useState<string | null>(null);
  const [batchLoading, setBatchLoading]     = useState<Record<string, boolean>>({});

  /* ── Email template state ── */
  const [templates, setTemplates]           = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm]     = useState({
    name: '', description: '', category: 'onboarding',
    subject_line: '', html_content: '', tags: '',
  });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<string | null>(null);

  /* ── Toast ── */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  /* ═══════════════════════════════ Data Loading ════════════════════════════ */

  useEffect(() => {
    async function loadChapters() {
      if (!supabase) return;
      const { data } = await supabase
        .from('chapters').select('id, chapter_name').order('chapter_name');
      if (data) setChapters(data);
    }
    loadChapters();
  }, []);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res  = await fetch('/api/outreach/batches?status=pending_approval&limit=20');
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setBatches(json.data || []);
    } catch {
      showToast('Failed to load batches', 'error');
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'imessage') loadBatches();
  }, [activeTab, loadBatches]);

  const loadContacts = useCallback(async () => {
    if (selectedChapter === 'all') { setContacts([]); return; }
    setLoadingContacts(true);
    try {
      const res  = await fetch(`/api/alumni-contacts?chapter_id=${selectedChapter}&limit=500`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setContacts(json.data?.contacts || []);
    } catch {
      showToast('Failed to load contacts', 'error');
    } finally {
      setLoadingContacts(false);
    }
  }, [selectedChapter]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res  = await fetch('/api/email-templates');
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setTemplates(json.data || []);
    } catch {
      showToast('Failed to load templates', 'error');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'email') loadTemplates();
  }, [activeTab, loadTemplates]);

  /* ═══════════════════════════════ Batch Actions ═══════════════════════════ */

  async function loadBatchContacts(batchId: string) {
    try {
      const res  = await fetch(`/api/outreach/batches/${batchId}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setBatches(prev =>
        prev.map(b => b.id === batchId ? { ...b, contacts: json.data.contacts } : b)
      );
    } catch {
      showToast('Failed to load batch contacts', 'error');
    }
  }

  async function approveBatch(batchId: string) {
    setBatchLoading(p => ({ ...p, [batchId]: true }));
    try {
      const res  = await fetch(`/api/outreach/batches/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      showToast('Batch approved — alumni agent will send messages', 'success');
      loadBatches();
    } catch (e) {
      showToast(`Approve failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBatchLoading(p => ({ ...p, [batchId]: false }));
    }
  }

  async function rejectBatch(batchId: string) {
    setBatchLoading(p => ({ ...p, [batchId]: true }));
    try {
      const res  = await fetch(`/api/outreach/batches/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      showToast('Batch rejected', 'info');
      loadBatches();
    } catch (e) {
      showToast(`Reject failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setBatchLoading(p => ({ ...p, [batchId]: false }));
    }
  }

  async function updateBatchContact(batchId: string, contactId: string, status: 'approved' | 'rejected') {
    try {
      const action = status === 'approved' ? 'approve_contact' : 'reject_contact';
      const res  = await fetch(`/api/outreach/batches/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, batch_contact_id: contactId }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      setBatches(prev =>
        prev.map(b => b.id === batchId ? {
          ...b,
          contacts: b.contacts?.map(c => c.id === contactId ? { ...c, status } : c),
        } : b)
      );
    } catch {
      showToast(`Failed to update contact`, 'error');
    }
  }

  /* ═══════════════════════════════ Template CRUD ═══════════════════════════ */

  async function saveTemplate() {
    if (!templateForm.name.trim() || !templateForm.html_content.trim()) {
      showToast('Name and HTML content are required', 'error');
      return;
    }
    setSavingTemplate(true);
    try {
      const url    = editingTemplate ? `/api/email-templates/${editingTemplate.id}` : '/api/email-templates';
      const method = editingTemplate ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:         templateForm.name.trim(),
          description:  templateForm.description.trim() || null,
          category:     templateForm.category,
          subject_line: templateForm.subject_line.trim() || null,
          html_content: templateForm.html_content,
          tags: templateForm.tags
            ? templateForm.tags.split(',').map(t => t.trim()).filter(Boolean)
            : [],
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      showToast(editingTemplate ? 'Template updated' : 'Template created', 'success');
      closeTemplateModal();
      loadTemplates();
    } catch (e) {
      showToast(`Failed to save: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate(id: string) {
    setDeletingTemplate(id);
    try {
      const res  = await fetch(`/api/email-templates/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      showToast('Template deleted', 'success');
      setTemplates(p => p.filter(t => t.id !== id));
      if (previewTemplate?.id === id) setPreviewTemplate(null);
    } catch {
      showToast('Failed to delete', 'error');
    } finally {
      setDeletingTemplate(null);
    }
  }

  function openEditTemplate(t: EmailTemplate) {
    setEditingTemplate(t);
    setTemplateForm({
      name:         t.name,
      description:  t.description || '',
      category:     t.category,
      subject_line: t.subject_line || '',
      html_content: t.html_content,
      tags:         (t.tags || []).join(', '),
    });
    setShowTemplateModal(true);
  }

  function closeTemplateModal() {
    setShowTemplateModal(false);
    setEditingTemplate(null);
    setTemplateForm({ name: '', description: '', category: 'onboarding', subject_line: '', html_content: '', tags: '' });
  }

  /* ═══════════════════════════════ Derived State ═══════════════════════════ */

  const filteredContacts = contacts.filter(c => {
    if (touchFilter !== 'all' && getTouchStage(c) !== touchFilter) return false;
    if (contactSearch) {
      const q    = contactSearch.toLowerCase();
      const name = `${c.first_name} ${c.last_name}`.toLowerCase();
      if (!name.includes(q) && !(c.phone_primary || '').includes(q)) return false;
    }
    return true;
  });

  const stats = {
    total:     contacts.length,
    contacted: contacts.filter(c => c.touch1_sent_at).length,
    awaiting:  contacts.filter(c => c.touch1_sent_at && !c.last_response_at && c.outreach_status !== 'signed_up' && c.outreach_status !== 'opted_out').length,
    replied:   contacts.filter(c => c.last_response_at).length,
    signedUp:  contacts.filter(c => c.outreach_status === 'signed_up' || !!c.signed_up_at).length,
    optedOut:  contacts.filter(c => c.outreach_status === 'opted_out').length,
  };

  /* ═══════════════════════════════ Render ═════════════════════════════════ */

  return (
    <div className="ws-page">

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: 'linear-gradient(135deg, #10b981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MessageSquare size={24} style={{ color: '#fff' }} />
        </div>
        <div>
          <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1.2 }}>
            Outreach
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
            iMessage campaigns · email templates · batch approvals
          </p>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #f3f4f6', paddingBottom: 0 }}>
        {([
          { id: 'imessage', label: 'iMessage Outreach', icon: <Smartphone size={14} /> },
          { id: 'email',    label: 'Email Templates',   icon: <Mail size={14} />       },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #10b981' : '2px solid transparent',
              background: 'none', cursor: 'pointer', fontSize: '0.875rem',
              fontWeight: activeTab === tab.id ? 600 : 400,
              color:  activeTab === tab.id ? '#10b981' : '#6b7280',
              marginBottom: -2, transition: 'all 0.15s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════ iMessage Tab ════════════════════════════════ */}
      {activeTab === 'imessage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Line legend */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 500 }}>Sending Lines:</span>
            {LINES.map(l => (
              <span key={l.number} style={{
                background: l.color.bg, color: l.color.text,
                padding: '3px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
              }}>
                Line {l.number} — {l.label} · {l.phone}
              </span>
            ))}
          </div>

          {/* ── Batch Approval Queue ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Inbox size={17} style={{ color: '#fff' }} />
                </div>
                <div>
                  <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                    Batch Approval Queue
                    {batches.length > 0 && (
                      <span style={{ marginLeft: 8, background: '#fef3c7', color: '#d97706', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                        {batches.length} pending
                      </span>
                    )}
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                    Review daily outreach batches before the alumni agent sends them
                  </p>
                </div>
              </div>
              <button
                onClick={loadBatches}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: '#6b7280' }}
              >
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {loadingBatches ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#9ca3af', gap: 8, fontSize: '0.875rem' }}>
                <Loader2 size={16} className="animate-spin" /> Loading batches…
              </div>
            ) : batches.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '36px', textAlign: 'center' }}>
                <CheckCircle size={32} style={{ color: '#d1fae5', marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>No pending batches — all clear ✓</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {batches.map(batch => {
                  const isExpanded = expandedBatch === batch.id;
                  return (
                    <div key={batch.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                      {/* Batch header row */}
                      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>
                              {new Date(batch.scheduled_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            <span style={{ background: '#fef3c7', color: '#d97706', fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>
                              Pending Approval
                            </span>
                            {batch.created_by && (
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>by {batch.created_by}</span>
                            )}
                          </div>
                          {batch.notes && (
                            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{batch.notes}</p>
                          )}
                        </div>

                        {/* View contacts toggle */}
                        <button
                          onClick={() => {
                            const opening = !isExpanded;
                            setExpandedBatch(opening ? batch.id : null);
                            if (opening && !batch.contacts) loadBatchContacts(batch.id);
                          }}
                          style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                        >
                          <ChevronDown size={13} style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                          {batch.contacts ? `${batch.contacts.length} contacts` : 'View'}
                        </button>

                        {/* Reject */}
                        <button
                          onClick={() => rejectBatch(batch.id)}
                          disabled={batchLoading[batch.id]}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', border: '1px solid #fca5a5', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: '#dc2626', fontWeight: 500, flexShrink: 0 }}
                        >
                          <XCircle size={14} /> Reject All
                        </button>

                        {/* Approve all */}
                        <button
                          onClick={() => approveBatch(batch.id)}
                          disabled={batchLoading[batch.id]}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 16px', border: 'none', borderRadius: 8, background: batchLoading[batch.id] ? '#d1d5db' : '#10b981', cursor: batchLoading[batch.id] ? 'not-allowed' : 'pointer', fontSize: '0.8rem', color: '#fff', fontWeight: 600, flexShrink: 0 }}
                        >
                          {batchLoading[batch.id]
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Check size={14} />
                          }
                          Approve All
                        </button>
                      </div>

                      {/* Expanded contacts list */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #f3f4f6', maxHeight: 420, overflowY: 'auto' }}>
                          {!batch.contacts ? (
                            <div style={{ padding: 28, textAlign: 'center', color: '#9ca3af' }}>
                              <Loader2 size={16} className="animate-spin" />
                            </div>
                          ) : batch.contacts.length === 0 ? (
                            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                              No contacts in this batch
                            </div>
                          ) : (
                            <>
                              {/* Contacts header */}
                              <div style={{ padding: '8px 16px', background: '#fafafa', borderBottom: '1px solid #f3f4f6', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 12 }}>
                                {['Contact', 'Chapter', 'Touch / Line', 'Action'].map(h => (
                                  <span key={h} style={{ fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                                ))}
                              </div>

                              {batch.contacts.map(bc => {
                                const lineInfo = LINES.find(l => l.number === bc.linq_line);
                                const isApproved = bc.status === 'approved';
                                const isRejected = bc.status === 'rejected';
                                return (
                                  <div key={bc.id} style={{
                                    padding: '10px 16px',
                                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto',
                                    gap: 12, alignItems: 'center',
                                    borderBottom: '1px solid #f9fafb',
                                    background: isApproved ? '#f0fdf4' : isRejected ? '#fef2f2' : '#fff',
                                  }}>
                                    <div>
                                      <div style={{ fontWeight: 500, fontSize: '0.8375rem', color: '#111827' }}>{bc.name || 'Unknown'}</div>
                                      {bc.phone && <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{bc.phone}</div>}
                                      {bc.message_preview && (
                                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', fontStyle: 'italic', marginTop: 2 }}>
                                          &ldquo;{bc.message_preview.slice(0, 70)}{bc.message_preview.length > 70 ? '…' : ''}&rdquo;
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>{bc.chapter || '—'}</div>
                                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                                      {bc.touch_number && (
                                        <span style={{ background: '#ede9fe', color: '#7c3aed', padding: '1px 7px', borderRadius: 10, fontSize: '0.68rem', fontWeight: 600 }}>
                                          T{bc.touch_number}
                                        </span>
                                      )}
                                      {lineInfo && (
                                        <span style={{ background: lineInfo.color.bg, color: lineInfo.color.text, padding: '1px 7px', borderRadius: 10, fontSize: '0.68rem', fontWeight: 600 }}>
                                          {lineInfo.label}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                                      {isApproved ? (
                                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                          <CheckCircle size={12} /> Approved
                                        </span>
                                      ) : isRejected ? (
                                        <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                                          <XCircle size={12} /> Skipped
                                        </span>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => updateBatchContact(batch.id, bc.id, 'rejected')}
                                            style={{ padding: '3px 9px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.72rem', color: '#dc2626' }}
                                          >
                                            Skip
                                          </button>
                                          <button
                                            onClick={() => updateBatchContact(batch.id, bc.id, 'approved')}
                                            style={{ padding: '3px 9px', border: 'none', borderRadius: 6, background: '#10b981', cursor: 'pointer', fontSize: '0.72rem', color: '#fff', fontWeight: 600 }}
                                          >
                                            ✓ Keep
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Contact Queue ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Users size={17} style={{ color: '#fff' }} />
              </div>
              <div>
                <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Contact Queue
                </h2>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                  Per-chapter alumni contacts by touch stage
                </p>
              </div>
            </div>

            {/* Filters row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={selectedChapter}
                onChange={e => setSelectedChapter(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: '0.8rem', color: '#374151', cursor: 'pointer', outline: 'none' }}
              >
                <option value="all">Select Chapter…</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.chapter_name}</option>)}
              </select>

              <select
                value={touchFilter}
                onChange={e => setTouchFilter(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', fontSize: '0.8rem', color: '#374151', cursor: 'pointer', outline: 'none' }}
              >
                <option value="all">All Stages</option>
                <option value="not_sent">Not Yet Sent</option>
                <option value="touch1_sent">Touch 1 Sent</option>
                <option value="touch1_confirmed">Touch 1 Confirmed</option>
                <option value="touch2_sent">Touch 2 Sent</option>
                <option value="touch3_sent">Touch 3 Sent</option>
              </select>

              <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                  placeholder="Search name or phone…"
                  style={{ width: '100%', padding: '7px 10px 7px 28px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.8rem', outline: 'none', background: '#fff', color: '#111827', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Stats chips */}
            {selectedChapter !== 'all' && contacts.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {[
                  { label: 'Total',     value: stats.total,     color: '#374151', bg: '#f3f4f6' },
                  { label: 'Contacted', value: stats.contacted, color: '#7c3aed', bg: '#ede9fe' },
                  { label: 'Awaiting',  value: stats.awaiting,  color: '#d97706', bg: '#fef3c7' },
                  { label: 'Replied',   value: stats.replied,   color: '#2563eb', bg: '#dbeafe' },
                  { label: 'Signed Up', value: stats.signedUp,  color: '#059669', bg: '#d1fae5' },
                  { label: 'Opted Out', value: stats.optedOut,  color: '#dc2626', bg: '#fee2e2' },
                ].map(s => (
                  <div key={s.label} style={{ background: s.bg, color: s.color, padding: '5px 12px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{s.value}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 500 }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Contact list body */}
            {selectedChapter === 'all' ? (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '48px', textAlign: 'center' }}>
                <Users size={36} style={{ color: '#e5e7eb', marginBottom: 12 }} />
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', fontWeight: 500 }}>Select a chapter to view contacts</p>
              </div>
            ) : loadingContacts ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#9ca3af', gap: 8, fontSize: '0.875rem' }}>
                <Loader2 size={16} className="animate-spin" /> Loading contacts…
              </div>
            ) : filteredContacts.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '48px', textAlign: 'center' }}>
                <Search size={32} style={{ color: '#e5e7eb', marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>No contacts match these filters</p>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{
                  padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6',
                  display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1fr 1.2fr', gap: 12,
                }}>
                  {['Contact / Phone', 'Stage', 'Line', 'Status'].map(h => (
                    <span key={h} style={{ fontSize: '0.68rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</span>
                  ))}
                </div>

                {/* Scrollable rows */}
                <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                  {filteredContacts.map(contact => {
                    const badge     = getContactStatusBadge(contact);
                    const stage     = getTouchStage(contact);
                    const stageInfo = STAGE_LABELS[stage];
                    const lineInfo  = contact.assigned_line ? LINES.find(l => l.number === contact.assigned_line) : null;
                    return (
                      <div key={contact.id} style={{
                        padding: '10px 16px',
                        display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1fr 1.2fr',
                        gap: 12, alignItems: 'center',
                        borderBottom: '1px solid #f9fafb',
                        background: contact.flagged ? '#fffbeb' : '#fff',
                      }}>
                        {/* Name / phone */}
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.8375rem', color: '#111827' }}>
                            {contact.first_name} {contact.last_name}
                          </div>
                          {contact.phone_primary && (
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                              <Phone size={10} /> {contact.phone_primary}
                              {contact.is_imessage && (
                                <span style={{ color: '#059669', fontSize: '0.65rem', fontWeight: 700, background: '#d1fae5', padding: '0 5px', borderRadius: 8 }}>iMsg</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Stage badge */}
                        <div>
                          <span style={{ background: stageInfo.bg, color: stageInfo.color, padding: '2px 9px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 600 }}>
                            {stageInfo.label}
                          </span>
                        </div>

                        {/* Assigned line */}
                        <div>
                          {lineInfo
                            ? <span style={{ background: lineInfo.color.bg, color: lineInfo.color.text, padding: '2px 9px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 600 }}>{lineInfo.label}</span>
                            : <span style={{ color: '#d1d5db', fontSize: '0.75rem' }}>—</span>
                          }
                        </div>

                        {/* Status badge */}
                        <div>
                          <span style={{ background: badge.bg, color: badge.text, padding: '2px 9px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 600 }}>
                            {badge.emoji} {badge.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer count */}
                <div style={{ padding: '8px 16px', background: '#f9fafb', borderTop: '1px solid #f3f4f6', fontSize: '0.72rem', color: '#9ca3af' }}>
                  Showing {filteredContacts.length} of {contacts.length} contacts
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ════════════════════════ Email Templates Tab ═════════════════════════ */}
      {activeTab === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Templates header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Mail size={17} style={{ color: '#fff' }} />
              </div>
              <div>
                <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Email Templates
                </h2>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
                  {templates.length} template{templates.length !== 1 ? 's' : ''} · HTML editor with live preview
                </p>
              </div>
            </div>
            <button
              onClick={() => { closeTemplateModal(); setShowTemplateModal(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 8, background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
            >
              <Plus size={15} /> New Template
            </button>
          </div>

          {/* Template cards */}
          {loadingTemplates ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: '#9ca3af', gap: 8, fontSize: '0.875rem' }}>
              <Loader2 size={16} className="animate-spin" /> Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '56px', textAlign: 'center' }}>
              <Mail size={40} style={{ color: '#e5e7eb', marginBottom: 12 }} />
              <p style={{ margin: '0 0 4px', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>No templates yet</p>
              <p style={{ margin: '0 0 16px', fontSize: '0.875rem', color: '#9ca3af' }}>Create your first HTML email template</p>
              <button
                onClick={() => { closeTemplateModal(); setShowTemplateModal(true); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', border: 'none', borderRadius: 8, background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
              >
                <Plus size={14} /> Create Template
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {templates.map(t => {
                const cat = TEMPLATE_CATEGORIES.find(c => c.id === t.category);
                const isPreviewing = previewTemplate?.id === t.id;
                return (
                  <div key={t.id}>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Icon */}
                      <div style={{ width: 38, height: 38, borderRadius: 9, background: cat ? `${cat.color}18` : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Mail size={18} style={{ color: cat?.color || '#6b7280' }} />
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111827' }}>{t.name}</span>
                          {cat && (
                            <span style={{ background: `${cat.color}18`, color: cat.color, padding: '2px 8px', borderRadius: 10, fontSize: '0.68rem', fontWeight: 700 }}>
                              {cat.label}
                            </span>
                          )}
                          {t.tags && t.tags.length > 0 && t.tags.map(tag => (
                            <span key={tag} style={{ background: '#f3f4f6', color: '#6b7280', padding: '1px 7px', borderRadius: 10, fontSize: '0.65rem', fontWeight: 500 }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                        {t.subject_line && (
                          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                            <span style={{ fontWeight: 500 }}>Subject:</span> {t.subject_line}
                          </div>
                        )}
                        {t.description && (
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 1 }}>{t.description}</div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: '#d1d5db', marginTop: 2 }}>
                          Created {new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {t.updated_at !== t.created_at && ` · Updated ${new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => setPreviewTemplate(isPreviewing ? null : t)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 11px', border: `1px solid ${isPreviewing ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: 8, background: isPreviewing ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: '0.75rem', color: isPreviewing ? '#3b82f6' : '#6b7280', fontWeight: 500 }}
                        >
                          <Eye size={13} /> {isPreviewing ? 'Hide' : 'Preview'}
                        </button>
                        <button
                          onClick={() => openEditTemplate(t)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 11px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                        <button
                          onClick={() => deleteTemplate(t.id)}
                          disabled={deletingTemplate === t.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 11px', border: '1px solid #fca5a5', borderRadius: 8, background: '#fff', cursor: deletingTemplate === t.id ? 'not-allowed' : 'pointer', fontSize: '0.75rem', color: '#dc2626', fontWeight: 500 }}
                        >
                          {deletingTemplate === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </div>

                    {/* Inline preview */}
                    {isPreviewing && (
                      <div style={{ border: '1px solid #bfdbfe', borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden', background: '#eff6ff' }}>
                        <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#dbeafe' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e40af' }}>
                            Preview — {t.name}
                          </span>
                          <button onClick={() => setPreviewTemplate(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#60a5fa' }}>
                            <X size={14} />
                          </button>
                        </div>
                        <iframe
                          srcDoc={t.html_content}
                          style={{ width: '100%', height: 480, border: 'none', display: 'block' }}
                          title={`Preview: ${t.name}`}
                          sandbox="allow-same-origin"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════ Template Modal ══════════════════════════════ */}
      {showTemplateModal && (
        <ModalOverlay className="module-modal-overlay" onClose={closeTemplateModal}>
          <div
            className="module-modal"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 820, width: '95vw' }}
          >
            <div className="module-modal-header">
              <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>
                {editingTemplate ? 'Edit Template' : 'New Email Template'}
              </h2>
              <button className="module-modal-close" onClick={closeTemplateModal}>
                <X size={20} />
              </button>
            </div>

            <div className="module-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Template Name *</label>
                  <input
                    type="text"
                    value={templateForm.name}
                    onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Welcome Email"
                  />
                </div>
                <div className="module-form-group">
                  <label>Category</label>
                  <select value={templateForm.category} onChange={e => setTemplateForm(p => ({ ...p, category: e.target.value }))}>
                    {TEMPLATE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="module-form-group">
                <label>Subject Line</label>
                <input
                  type="text"
                  value={templateForm.subject_line}
                  onChange={e => setTemplateForm(p => ({ ...p, subject_line: e.target.value }))}
                  placeholder="e.g. Welcome to Trailblaize!"
                />
              </div>

              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Description <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                  <input
                    type="text"
                    value={templateForm.description}
                    onChange={e => setTemplateForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="When to use this template"
                  />
                </div>
                <div className="module-form-group">
                  <label>Tags <span style={{ fontWeight: 400, color: '#9ca3af' }}>(comma-separated)</span></label>
                  <input
                    type="text"
                    value={templateForm.tags}
                    onChange={e => setTemplateForm(p => ({ ...p, tags: e.target.value }))}
                    placeholder="alumni, onboarding, chapter"
                  />
                </div>
              </div>

              <div className="module-form-group">
                <label>HTML Content *</label>
                <textarea
                  value={templateForm.html_content}
                  onChange={e => setTemplateForm(p => ({ ...p, html_content: e.target.value }))}
                  rows={16}
                  placeholder={'<!DOCTYPE html>\n<html>\n  <body>\n    <p>Hello {{first_name}},</p>\n    ...\n  </body>\n</html>'}
                  style={{ fontFamily: 'SF Mono, Monaco, Inconsolata, monospace', fontSize: '0.78rem', lineHeight: 1.65 }}
                />
                <span style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4, display: 'block' }}>
                  Use {'{{variable}}'} syntax for merge tags — e.g. {'{{first_name}}'}, {'{{chapter_name}}'}
                </span>
              </div>

              {/* Live preview strip */}
              {templateForm.html_content.trim() && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Live Preview
                  </label>
                  <iframe
                    srcDoc={templateForm.html_content}
                    style={{ width: '100%', height: 280, border: '1px solid #e5e7eb', borderRadius: 8, display: 'block' }}
                    title="Live Preview"
                    sandbox="allow-same-origin"
                  />
                </div>
              )}
            </div>

            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={closeTemplateModal}>Cancel</button>
              <button
                className="module-primary-btn"
                onClick={saveTemplate}
                disabled={savingTemplate || !templateForm.name.trim() || !templateForm.html_content.trim()}
              >
                {savingTemplate
                  ? <><Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />Saving…</>
                  : editingTemplate ? 'Update Template' : 'Create Template'
                }
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ════════════════════════ Toast ═══════════════════════════════════════ */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 'calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px) + 24px)', right: 24, zIndex: 9999,
          background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#059669' : '#374151',
          color: '#fff', padding: '10px 18px', borderRadius: 10,
          fontSize: '0.875rem', fontWeight: 500,
          boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'error'
            ? <AlertCircle size={15} />
            : toast.type === 'success'
            ? <CheckCircle size={15} />
            : <Clock size={15} />
          }
          {toast.message}
        </div>
      )}
    </div>
  );
}