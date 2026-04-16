'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  Voicemail,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  CheckSquare,
  Square,
  Tag,
  X,
  Zap,
  ArrowLeft,
  LayoutDashboard,
  User,
  Calendar,
  Clock,
} from 'lucide-react';
import Link from 'next/link';
import { AlumniContact, Chapter } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

type CallOutcome = 'answered' | 'voicemail' | 'no_answer' | 'declined';

interface LogPanel {
  contactId: string;
  outcome: CallOutcome | null;
  notes: string;
  tags: string[];
  tagInput: string;
  followUp: boolean;
  followUpDate: string;
  saving: boolean;
}

interface ContactWithCall extends AlumniContact {
  callStatus?: CallOutcome | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<CallOutcome, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  answered:   { label: 'Answered',   color: '#15803d', bg: '#dcfce7', icon: <PhoneCall size={14} /> },
  voicemail:  { label: 'Voicemail',  color: '#b45309', bg: '#fef3c7', icon: <Voicemail size={14} /> },
  no_answer:  { label: 'No Answer',  color: '#6b7280', bg: '#f3f4f6', icon: <PhoneMissed size={14} /> },
  declined:   { label: 'Declined',   color: '#b91c1c', bg: '#fee2e2', icon: <PhoneOff size={14} /> },
};

const STATUS_MAP: Record<CallOutcome, string> = {
  answered:  'responded',
  voicemail: 'touch2_sent',
  no_answer: 'touch1_sent',
  declined:  'opted_out',
};

const SUGGESTED_TAGS = [
  'construction', 'finance', 'tech', 'real estate', 'healthcare', 'law',
  'sales', 'marketing', 'consulting', 'hiring', 'open to connect',
  'Dallas', 'Houston', 'NYC', 'Chicago', 'Austin', 'Atlanta',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCallStatus(contact: AlumniContact): CallOutcome | null {
  if (!contact.response_text) return null;
  const lower = contact.response_text.toLowerCase();
  if (lower.startsWith('[answered]')) return 'answered';
  if (lower.startsWith('[voicemail]')) return 'voicemail';
  if (lower.startsWith('[no_answer]')) return 'no_answer';
  if (lower.startsWith('[declined]')) return 'declined';
  // Fall back: if they have a response, treat as answered
  if (contact.outreach_status === 'responded') return 'answered';
  return null;
}

function getStatusBadge(contact: AlumniContact) {
  const status = getCallStatus(contact);
  if (!status) {
    return { label: 'Not Called', color: '#6b7280', bg: '#f3f4f6' };
  }
  return {
    label: OUTCOME_CONFIG[status].label,
    color: OUTCOME_CONFIG[status].color,
    bg: OUTCOME_CONFIG[status].bg,
  };
}

function parseNotesPreview(responseText: string | null): string {
  if (!responseText) return '';
  // Strip leading [outcome] tag
  return responseText.replace(/^\[[a-z_]+\]\s*/i, '');
}

function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  }
  return phone;
}

function sortContacts(contacts: AlumniContact[]): AlumniContact[] {
  return [...contacts].sort((a, b) => {
    const aContacted = !!getCallStatus(a);
    const bContacted = !!getCallStatus(b);
    // Uncontacted first
    if (aContacted !== bContacted) return aContacted ? 1 : -1;
    // Then by grad year DESC
    const aYear = a.grad_year || a.year || 0;
    const bYear = b.grad_year || b.year || 0;
    return bYear - aYear;
  });
}

function emptyPanel(contactId: string): LogPanel {
  return {
    contactId,
    outcome: null,
    notes: '',
    tags: [],
    tagInput: '',
    followUp: false,
    followUpDate: '',
    saving: false,
  };
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ConnectsCenter() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [contacts, setContacts] = useState<AlumniContact[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [openPanel, setOpenPanel] = useState<string | null>(null);
  const [panel, setPanel] = useState<LogPanel | null>(null);

  // ── Fetch chapters ──
  useEffect(() => {
    async function load() {
      setLoadingChapters(true);
      try {
        const res = await fetch('/api/chapters?status=active');
        const data = await res.json();
        setChapters(data.data || data || []);
      } catch (e) {
        console.error('Failed to load chapters', e);
      }
      setLoadingChapters(false);
    }
    load();
  }, []);

  // ── Fetch contacts when chapter changes ──
  const loadContacts = useCallback(async (chapterId: string) => {
    if (!chapterId) return;
    setLoadingContacts(true);
    try {
      const res = await fetch(
        `/api/alumni-contacts?chapter_id=${chapterId}&outreach_status=signed_up&limit=100`
      );
      const data = await res.json();
      const raw: AlumniContact[] = data.data || data || [];
      setContacts(sortContacts(raw));
    } catch (e) {
      console.error('Failed to load contacts', e);
    }
    setLoadingContacts(false);
  }, []);

  useEffect(() => {
    if (selectedChapterId) {
      setOpenPanel(null);
      setPanel(null);
      loadContacts(selectedChapterId);
    }
  }, [selectedChapterId, loadContacts]);

  // ── Panel control ──
  function togglePanel(contactId: string) {
    if (openPanel === contactId) {
      setOpenPanel(null);
      setPanel(null);
    } else {
      setOpenPanel(contactId);
      setPanel(emptyPanel(contactId));
    }
  }

  function updatePanel(updates: Partial<LogPanel>) {
    setPanel(prev => prev ? { ...prev, ...updates } : prev);
  }

  function addTag(tag: string) {
    if (!panel || !tag.trim()) return;
    const trimmed = tag.trim().toLowerCase();
    if (!panel.tags.includes(trimmed)) {
      updatePanel({ tags: [...panel.tags, trimmed], tagInput: '' });
    } else {
      updatePanel({ tagInput: '' });
    }
  }

  function removeTag(tag: string) {
    if (!panel) return;
    updatePanel({ tags: panel.tags.filter(t => t !== tag) });
  }

  // ── Save log ──
  async function saveLog(contactId: string) {
    if (!panel || !panel.outcome) return;
    updatePanel({ saving: true });

    const outcomeTag = `[${panel.outcome}]`;
    const tagsStr = panel.tags.length ? `\nTags: ${panel.tags.join(', ')}` : '';
    const followUpStr = panel.followUp && panel.followUpDate ? `\nFollow-up: ${panel.followUpDate}` : '';
    const responseText = `${outcomeTag} ${panel.notes}${tagsStr}${followUpStr}`.trim();

    try {
      const res = await fetch(`/api/alumni-contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outreach_status: STATUS_MAP[panel.outcome],
          response_text: responseText,
        }),
      });
      const result = await res.json();
      if (result.error) {
        console.error('Save failed', result.error);
        alert(`Failed to save: ${result.error.message || result.error}`);
        updatePanel({ saving: false });
        return;
      }
      // Update contact in state
      setContacts(prev =>
        sortContacts(
          prev.map(c =>
            c.id === contactId
              ? { ...c, outreach_status: STATUS_MAP[panel!.outcome!] as AlumniContact['outreach_status'], response_text: responseText }
              : c
          )
        )
      );
      setOpenPanel(null);
      setPanel(null);
    } catch (e) {
      console.error(e);
      alert('Network error, please try again.');
      updatePanel({ saving: false });
    }
  }

  // ── Derived data ──
  const selectedChapter = chapters.find(c => c.id === selectedChapterId);
  const answeredContacts = contacts.filter(c => getCallStatus(c) === 'answered');
  const notCalledCount = contacts.filter(c => !getCallStatus(c)).length;
  const calledCount = contacts.filter(c => !!getCallStatus(c)).length;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="module-page">
      {/* Header */}
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/workspace" className="module-back">
              <LayoutDashboard size={20} />
              Back to Workspace
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <Phone size={24} />
            </div>
            <div>
              <h1>Connects Center</h1>
              <p>Daily alumni call queue — log outcomes, build relationship intel.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">

        {/* ── Section 1: Chapter Selector + Queue ── */}
        <section style={{ marginBottom: '2rem' }}>

          {/* Chapter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 280px', maxWidth: 400 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
                Select Chapter
              </label>
              {loadingChapters ? (
                <div style={{ height: 42, background: '#f3f4f6', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
              ) : (
                <select
                  className="applications-filter-select"
                  value={selectedChapterId}
                  onChange={e => setSelectedChapterId(e.target.value)}
                  style={{ width: '100%', height: 42, fontSize: '0.9375rem' }}
                >
                  <option value="">— Choose a chapter —</option>
                  {chapters.map(ch => (
                    <option key={ch.id} value={ch.id}>
                      {ch.fraternity} – {ch.school}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedChapterId && (
              <button
                className="module-filter-btn"
                onClick={() => loadContacts(selectedChapterId)}
                style={{ marginTop: '1.25rem' }}
              >
                <RefreshCw size={15} />
                Refresh
              </button>
            )}
          </div>

          {/* Stats row (shown once chapter selected) */}
          {selectedChapterId && !loadingContacts && contacts.length > 0 && (
            <div className="module-stats-row" style={{ marginBottom: '1.5rem' }}>
              <div className="module-stat">
                <span className="module-stat-value">{contacts.length}</span>
                <span className="module-stat-label">In Queue</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value" style={{ color: '#6b7280' }}>{notCalledCount}</span>
                <span className="module-stat-label">Not Called</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value" style={{ color: '#2563eb' }}>{calledCount}</span>
                <span className="module-stat-label">Logged</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value" style={{ color: '#15803d' }}>{answeredContacts.length}</span>
                <span className="module-stat-label">Answered</span>
              </div>
            </div>
          )}

          {/* Queue */}
          {!selectedChapterId ? (
            <div className="module-empty-state" style={{ marginTop: '3rem' }}>
              <Phone size={48} />
              <h3>Select a chapter to begin</h3>
              <p>Choose a chapter above to load the call queue.</p>
            </div>
          ) : loadingContacts ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} style={{ height: 88, background: '#f3f4f6', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <div className="module-empty-state">
              <User size={48} />
              <h3>No signed-up alumni found</h3>
              <p>This chapter doesn't have any alumni who've signed up on the platform yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {contacts.map(contact => {
                const badge = getStatusBadge(contact);
                const callStatus = getCallStatus(contact);
                const notesPreview = parseNotesPreview(contact.response_text);
                const phone = contact.phone_primary || contact.phone_secondary;
                const name = `${contact.first_name} ${contact.last_name}`;
                const year = contact.grad_year || contact.year;
                const isPanelOpen = openPanel === contact.id;

                return (
                  <div key={contact.id}>
                    {/* Queue Card */}
                    <div style={{
                      background: '#ffffff',
                      border: `1px solid ${callStatus ? '#e5e7eb' : '#d1d5db'}`,
                      borderRadius: 12,
                      padding: '0.875rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                      boxShadow: callStatus ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                      opacity: callStatus === 'declined' ? 0.7 : 1,
                    }}>
                      {/* Name + meta */}
                      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>{name}</span>
                          {year && (
                            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>'{String(year).slice(-2)}</span>
                          )}
                          {/* Status badge */}
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                            padding: '2px 8px', borderRadius: 9999,
                            fontSize: '0.7rem', fontWeight: 600,
                            color: badge.color, background: badge.bg,
                          }}>
                            {badge.label}
                          </span>
                        </div>
                        {/* Industry / location */}
                        {(contact.location_city || notesPreview) && (
                          <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {contact.location_city && <span>{contact.location_city}</span>}
                            {contact.location_city && notesPreview && <span style={{ margin: '0 4px' }}>·</span>}
                            {notesPreview && <span>{notesPreview}</span>}
                          </div>
                        )}
                        {contact.major && (
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.0625rem' }}>
                            {contact.major}
                          </div>
                        )}
                      </div>

                      {/* Phone */}
                      <div style={{ fontSize: '0.8125rem', color: '#374151', whiteSpace: 'nowrap' }}>
                        {phone ? formatPhone(phone) : <span style={{ color: '#d1d5db' }}>No phone</span>}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                        {phone && (
                          <a
                            href={`tel:${phone}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              padding: '0.375rem 0.75rem', borderRadius: 8,
                              background: '#2563eb', color: '#fff',
                              fontSize: '0.8125rem', fontWeight: 600,
                              textDecoration: 'none',
                            }}
                          >
                            <Phone size={14} />
                            Call
                          </a>
                        )}
                        <button
                          onClick={() => togglePanel(contact.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '0.375rem 0.75rem', borderRadius: 8,
                            background: isPanelOpen ? '#f3f4f6' : '#fff',
                            border: '1px solid #e5e7eb',
                            color: '#374151',
                            fontSize: '0.8125rem', fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {isPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          Log Call
                        </button>
                      </div>
                    </div>

                    {/* Inline Log Panel */}
                    {isPanelOpen && panel && (
                      <div style={{
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderTop: 'none',
                        borderRadius: '0 0 12px 12px',
                        padding: '1.25rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                      }}>

                        {/* Outcome pills */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Outcome
                          </label>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {(Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map(o => (
                              <button
                                key={o}
                                onClick={() => updatePanel({ outcome: panel.outcome === o ? null : o })}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                                  padding: '0.375rem 0.875rem', borderRadius: 9999,
                                  border: panel.outcome === o ? `2px solid ${OUTCOME_CONFIG[o].color}` : '1.5px solid #e5e7eb',
                                  background: panel.outcome === o ? OUTCOME_CONFIG[o].bg : '#fff',
                                  color: panel.outcome === o ? OUTCOME_CONFIG[o].color : '#6b7280',
                                  fontSize: '0.8125rem', fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                {OUTCOME_CONFIG[o].icon}
                                {OUTCOME_CONFIG[o].label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Notes */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Notes
                          </label>
                          <textarea
                            value={panel.notes}
                            onChange={e => updatePanel({ notes: e.target.value })}
                            placeholder="Industry, location, hiring status, family info, interests — anything useful for headhunting..."
                            rows={3}
                            style={{
                              width: '100%', padding: '0.625rem 0.75rem',
                              border: '1px solid #e5e7eb', borderRadius: 8,
                              fontSize: '0.875rem', color: '#111827',
                              background: '#fff', resize: 'vertical', outline: 'none',
                              fontFamily: 'inherit',
                            }}
                          />
                        </div>

                        {/* Tags */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Headhunting Tags
                          </label>
                          {/* Active tags */}
                          {panel.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                              {panel.tags.map(t => (
                                <span key={t} style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  padding: '3px 8px', borderRadius: 9999,
                                  background: '#dbeafe', color: '#1d4ed8',
                                  fontSize: '0.75rem', fontWeight: 600,
                                }}>
                                  {t}
                                  <button onClick={() => removeTag(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#1d4ed8', display: 'flex' }}>
                                    <X size={11} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          {/* Tag input */}
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              value={panel.tagInput}
                              onChange={e => updatePanel({ tagInput: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ',') {
                                  e.preventDefault();
                                  addTag(panel.tagInput);
                                }
                              }}
                              placeholder="Type and press Enter..."
                              style={{
                                padding: '0.375rem 0.625rem',
                                border: '1px solid #e5e7eb', borderRadius: 8,
                                fontSize: '0.8125rem', outline: 'none',
                                background: '#fff', width: 180,
                              }}
                            />
                            {/* Suggested tags */}
                            {SUGGESTED_TAGS.filter(t => !panel.tags.includes(t) && (!panel.tagInput || t.includes(panel.tagInput.toLowerCase()))).slice(0, 6).map(t => (
                              <button
                                key={t}
                                onClick={() => addTag(t)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                                  padding: '3px 8px', borderRadius: 9999,
                                  background: '#f3f4f6', color: '#6b7280',
                                  border: '1px dashed #d1d5db',
                                  fontSize: '0.73rem', fontWeight: 500,
                                  cursor: 'pointer',
                                }}
                              >
                                <Tag size={10} />
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Follow-up */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => updatePanel({ followUp: !panel.followUp })}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: panel.followUp ? '#2563eb' : '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: 0 }}
                          >
                            {panel.followUp ? <CheckSquare size={16} /> : <Square size={16} />}
                            Follow-up needed
                          </button>
                          {panel.followUp && (
                            <input
                              type="date"
                              value={panel.followUpDate}
                              onChange={e => updatePanel({ followUpDate: e.target.value })}
                              style={{
                                padding: '0.3rem 0.5rem',
                                border: '1px solid #e5e7eb', borderRadius: 8,
                                fontSize: '0.8125rem', outline: 'none', background: '#fff',
                              }}
                            />
                          )}
                        </div>

                        {/* Save / Cancel */}
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                          <button
                            onClick={() => { setOpenPanel(null); setPanel(null); }}
                            style={{
                              padding: '0.5rem 1rem', borderRadius: 8,
                              border: '1px solid #e5e7eb', background: '#fff',
                              color: '#374151', fontSize: '0.875rem', fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveLog(contact.id)}
                            disabled={!panel.outcome || panel.saving}
                            style={{
                              padding: '0.5rem 1.25rem', borderRadius: 8,
                              background: !panel.outcome || panel.saving ? '#e5e7eb' : '#111827',
                              color: !panel.outcome || panel.saving ? '#9ca3af' : '#fff',
                              fontSize: '0.875rem', fontWeight: 600,
                              border: 'none', cursor: !panel.outcome || panel.saving ? 'not-allowed' : 'pointer',
                              display: 'flex', alignItems: 'center', gap: '6px',
                            }}
                          >
                            {panel.saving ? (
                              <>
                                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                Saving...
                              </>
                            ) : 'Save Log'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section 3: Intel Board ── */}
        {answeredContacts.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} style={{ color: '#15803d' }} />
              </div>
              <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#111827' }}>
                Intel Board
              </h2>
              <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                — {answeredContacts.length} answered contact{answeredContacts.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {answeredContacts.map(contact => {
                const notes = parseNotesPreview(contact.response_text);
                const name = `${contact.first_name} ${contact.last_name}`;
                const year = contact.grad_year || contact.year;
                const isHighlight = notes.toLowerCase().includes('hir') || notes.toLowerCase().includes('open to connect');

                return (
                  <div key={contact.id} style={{
                    background: '#fff',
                    border: `1px solid ${isHighlight ? '#bbf7d0' : '#e5e7eb'}`,
                    borderRadius: 12,
                    padding: '0.875rem 1rem',
                    boxShadow: isHighlight ? '0 0 0 2px #d1fae5' : 'none',
                    position: 'relative',
                  }}>
                    {isHighlight && (
                      <span style={{
                        position: 'absolute', top: 10, right: 10,
                        background: '#dcfce7', color: '#15803d',
                        fontSize: '0.65rem', fontWeight: 700,
                        padding: '2px 7px', borderRadius: 9999,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        Hot Lead
                      </span>
                    )}
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.9375rem', marginBottom: '0.125rem' }}>
                      {name}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                      {year && <span>'{String(year).slice(-2)}</span>}
                      {contact.major && <span>· {contact.major}</span>}
                      {contact.location_city && <span>· {contact.location_city}</span>}
                    </div>
                    {notes && (
                      <p style={{
                        fontSize: '0.8125rem', color: '#374151',
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {notes}
                      </p>
                    )}
                    {contact.updated_at && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '0.5rem', fontSize: '0.7rem', color: '#d1d5db' }}>
                        <Clock size={10} />
                        {new Date(contact.updated_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
