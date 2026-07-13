'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Phone, RefreshCw, Loader2,
  MessageSquare, CheckCircle2, CheckCheck,
  XCircle, Send, ChevronRight, X,
  BarChart2,
} from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';
import ConversationsTab from '../ConversationsTab';
import { INTERNAL_AUTH_HEADER } from '@/lib/internal-auth';

const AUTH = INTERNAL_AUTH_HEADER;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlumniContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_primary: string | null;
  outreach_status: string;
  touch1_sent_at: string | null;
  touch1_confirmed_at?: string | null;
  touch2_sent_at: string | null;
  touch3_sent_at: string | null;
  last_response_at: string | null;
  year?: number | null;
  city?: string | null;
  state?: string | null;
  linq_line?: string | null;
  signed_up_at?: string | null;
  notes?: string | null;
  is_flagged?: boolean | null;
}

interface AlumniStats {
  total: number;
  have_phone: number;
  contacted: number;
  responded: number;
  signed_up: number;
  touch1_ready: number;
  touch2_due: number;
}

// ── Brand constants ────────────────────────────────────────────────────────────

const C = {
  bg: '#F9FAFB',
  card: '#FFFFFF',
  border: '#E5E7EB',
  primary: '#0F172A',
  heading: '#111827',
  body: '#6B7280',
  success: '#059669',
  warning: '#F59E0B',
  danger: '#EF4444',
  radius: '12px',
};

// ── Status meta ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  not_contacted:    { label: 'Not Contacted',  color: '#6B7280', bg: '#F3F4F6', border: '#D1D5DB' },
  touch1_sent:      { label: 'T1 Sent',        color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
  touch1_confirmed: { label: 'T1 Confirmed',   color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
  touch2_sent:      { label: 'T2 Sent',        color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
  touch3_sent:      { label: 'T3 Sent',        color: '#C2410C', bg: '#FFEDD5', border: '#FDBA74' },
  no_response:      { label: 'No Response',    color: '#6B7280', bg: '#F3F4F6', border: '#D1D5DB' },
  pitched:          { label: 'Pitched',        color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
  signed_up:        { label: 'Signed Up',      color: '#065F46', bg: '#D1FAE5', border: '#6EE7B7' },
  wrong_number:     { label: 'Wrong Number',   color: '#9CA3AF', bg: '#F3F4F6', border: '#D1D5DB' },
  opted_out:        { label: 'Opted Out',      color: '#9CA3AF', bg: '#F3F4F6', border: '#D1D5DB' },
  declined:         { label: 'Declined',       color: '#991B1B', bg: '#FEE2E2', border: '#FCA5A5' },
};

const STATUS_FILTERS = [
  { value: 'all',              label: 'All' },
  { value: 'not_contacted',    label: 'Not Contacted' },
  { value: 'touch1_sent',      label: 'T1 Sent' },
  { value: 'touch1_confirmed', label: 'T1 Confirmed' },
  { value: 'touch2_sent',      label: 'T2 Sent' },
  { value: 'touch3_sent',      label: 'T3 Sent' },
  { value: 'signed_up',        label: 'Signed Up' },
  { value: 'declined',         label: 'Declined' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function fullName(c: { first_name: string | null; last_name: string | null }): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
}

// ── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.not_contacted;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.border}`,
      whiteSpace: 'nowrap',
    }}>
      {status === 'signed_up' && <CheckCheck size={10} />}
      {meta.label}
    </span>
  );
}

// ── Action Button for a given status ──────────────────────────────────────────

type TouchType = 'T1' | 'T2' | 'T3';

function getNextTouch(status: string): TouchType | null {
  if (status === 'not_contacted') return 'T1';
  if (status === 'touch1_sent' || status === 'touch1_confirmed') return 'T2';
  if (status === 'touch2_sent') return 'T3';
  return null;
}

const TOUCH_BUTTON_STYLES: Record<TouchType, { bg: string; border: string; color: string }> = {
  T1: { bg: '#10B981', border: '#059669', color: '#FFFFFF' },
  T2: { bg: '#F59E0B', border: '#D97706', color: '#FFFFFF' },
  T3: { bg: '#F97316', border: '#EA580C', color: '#FFFFFF' },
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface MergedOutreachTabProps {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onUpdate: () => void;
}

// ── Confirmation Modal ─────────────────────────────────────────────────────────

interface ConfirmModalProps {
  contact: AlumniContact;
  touch: TouchType;
  chapter: ChapterWithOnboarding;
  onConfirm: () => void;
  onCancel: () => void;
  sending: boolean;
}

function ConfirmModal({ contact, touch, chapter, onConfirm, onCancel, sending }: ConfirmModalProps) {
  const firstName = contact.first_name || 'this contact';
  const school = chapter.school || 'your school';
  const fraternity = chapter.fraternity || 'your fraternity';

  let messagePreview = '';
  if (touch === 'T1') {
    messagePreview = `Hey ${firstName}, this is Ford from Trailblaize. I'm reaching out to verify your phone number on the ${school} ${fraternity} alumni list. Do I have the right number?`;
  } else if (touch === 'T2') {
    messagePreview = `Hey ${firstName}, just following up - we're building out the ${fraternity} alumni network at ${school}. Here's the link if you're interested: [join link]`;
  } else {
    messagePreview = `Hey ${firstName}, last one from us. If you ever want to connect with other ${fraternity} guys, we're at trailblaize.net. No pressure.`;
  }

  const touchStyle = TOUCH_BUTTON_STYLES[touch];

  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 1001, background: C.card, borderRadius: C.radius,
        border: `1px solid ${C.border}`, padding: 28, width: 420, maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.heading, marginBottom: 6 }}>
          Send {touch} to {fullName(contact)}?
        </div>
        <div style={{ fontSize: 13, color: C.body, marginBottom: 16 }}>
          {contact.phone_primary}
        </div>

        {/* Message preview */}
        <div style={{
          padding: '12px 14px', borderRadius: 8,
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          fontSize: 13, color: C.heading, lineHeight: 1.6,
          marginBottom: 20, fontStyle: 'italic',
        }}>
          &ldquo;{messagePreview}&rdquo;
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={sending}
            style={{
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${C.border}`, background: C.card, color: C.heading,
              fontSize: 14, fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={sending}
            style={{
              padding: '10px 20px', borderRadius: 8, cursor: sending ? 'default' : 'pointer',
              border: `1px solid ${touchStyle.border}`,
              background: sending ? C.body : touchStyle.bg,
              color: touchStyle.color,
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {sending
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
              : <><Send size={14} /> Send {touch}</>
            }
          </button>
        </div>
      </div>
    </>
  );
}

// ── Bulk Confirm Modal ─────────────────────────────────────────────────────────

function BulkConfirmModal({
  count,
  touch,
  onConfirm,
  onCancel,
  sending,
  capacity,
}: {
  count: number;
  touch: TouchType;
  onConfirm: () => void;
  onCancel: () => void;
  sending: boolean;
  capacity?: { this_run: number; sendable_today: number; not_touched_today: number; eligible: number } | null;
}) {
  const touchStyle = TOUCH_BUTTON_STYLES[touch];
  return (
    <>
      <div
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 1001, background: C.card, borderRadius: C.radius,
        border: `1px solid ${C.border}`, padding: 28, width: 400, maxWidth: '90vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.heading, marginBottom: 8 }}>
          Send {touch} — {capacity ? capacity.this_run : count} contacts this run
        </div>
        <div style={{ fontSize: 14, color: C.body, marginBottom: capacity?.not_touched_today ? 12 : 20, lineHeight: 1.6 }}>
          This run will send <strong>{capacity ? capacity.this_run : count}</strong> messages with 1-second gaps (~{Math.ceil((capacity ? capacity.this_run : count) / 60)} min).
          {capacity && capacity.sendable_today > capacity.this_run && (
            <> {capacity.sendable_today - capacity.this_run} more can send today in subsequent runs.</>
          )}
        </div>
        {capacity && capacity.not_touched_today > 0 && (
          <div style={{
            fontSize: 13, color: '#92400E', background: '#FFFBEB',
            border: '1px solid #FDE68A', borderRadius: 8,
            padding: '10px 14px', marginBottom: 20, lineHeight: 1.5,
          }}>
            ⚠️ <strong>{capacity.not_touched_today} contacts won&apos;t be touched today</strong> — daily line limit ({capacity.sendable_today} of {capacity.eligible}). They&apos;ll be available tomorrow.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={sending}
            style={{
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${C.border}`, background: C.card, color: C.heading,
              fontSize: 14, fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={sending}
            style={{
              padding: '10px 20px', borderRadius: 8, cursor: sending ? 'default' : 'pointer',
              border: `1px solid ${touchStyle.border}`,
              background: sending ? C.body : touchStyle.bg,
              color: touchStyle.color,
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {sending
              ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sending...</>
              : <><Send size={14} /> Confirm — Send {capacity ? capacity.this_run : count}</>
            }
          </button>
        </div>
      </div>
    </>
  );
}

// ── Slide-Out Contact Panel ────────────────────────────────────────────────────

function ContactPanel({
  contact,
  chapter,
  onClose,
  onSend,
  showToast,
}: {
  contact: AlumniContact;
  chapter: ChapterWithOnboarding;
  onClose: () => void;
  onSend: (contact: AlumniContact, touch: TouchType) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const timeline = [
    { label: 'T1 Sent',      date: contact.touch1_sent_at },
    { label: 'T1 Confirmed', date: contact.touch1_confirmed_at },
    { label: 'T2 Sent',      date: contact.touch2_sent_at },
    { label: 'T3 Sent',      date: contact.touch3_sent_at },
    { label: 'Signed Up',    date: contact.signed_up_at },
  ].filter(t => t.date);

  const location = [contact.city, contact.state].filter(Boolean).join(', ');
  const nextTouch = getNextTouch(contact.outreach_status);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0,
      width: 400, maxWidth: '100vw',
      background: C.card, borderLeft: `1px solid ${C.border}`,
      zIndex: 1000, overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: C.card, zIndex: 1,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.heading }}>{fullName(contact)}</div>
          <div style={{ fontSize: 12, color: C.body, marginTop: 2 }}>
            {contact.year ? `Class of '${String(contact.year).slice(-2)}` : ''}
            {contact.year && location ? ' · ' : ''}
            {location}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.body, padding: 4 }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Contact info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.body, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Info</div>
          {contact.phone_primary && (
            <a
              href={`tel:${contact.phone_primary}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.primary, fontSize: 14, textDecoration: 'none', fontWeight: 500 }}
            >
              <Phone size={14} />
              {contact.phone_primary}
            </a>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={contact.outreach_status} />
            {contact.linq_line && (
              <span style={{
                padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 500,
                background: '#F3F4F6', color: C.body, border: `1px solid ${C.border}`,
              }}>
                {contact.linq_line}
              </span>
            )}
          </div>
        </div>

        {/* Timeline */}
        {timeline.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.body, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outreach Timeline</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {timeline.map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.success, flexShrink: 0 }} />
                    {i < timeline.length - 1 && (
                      <div style={{ width: 1, height: 24, background: C.border, marginTop: 2 }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.heading }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: C.body }}>
                      {t.date ? new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last response */}
        {contact.last_response_at && (
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: '#F0FDF4', border: `1px solid #BBF7D0`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#065F46', marginBottom: 2 }}>Last Response</div>
            <div style={{ fontSize: 12, color: '#047857' }}>
              {new Date(contact.last_response_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        )}

        {/* Notes */}
        {contact.notes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.body, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</div>
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: C.bg, border: `1px solid ${C.border}`,
              fontSize: 13, color: C.heading, lineHeight: 1.5,
            }}>
              {contact.notes}
            </div>
          </div>
        )}

        {/* Action button */}
        {nextTouch && contact.outreach_status !== 'signed_up' && contact.outreach_status !== 'declined' && contact.outreach_status !== 'opted_out' && (
          <div style={{ marginTop: 'auto' }}>
            <button
              onClick={() => onSend(contact, nextTouch)}
              style={{
                width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px 20px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${TOUCH_BUTTON_STYLES[nextTouch].border}`,
                background: TOUCH_BUTTON_STYLES[nextTouch].bg,
                color: TOUCH_BUTTON_STYLES[nextTouch].color,
                fontSize: 14, fontWeight: 700, minHeight: 44,
              }}
            >
              <Send size={14} /> Send {nextTouch}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 1: Contacts ────────────────────────────────────────────────────────────

function ContactsTab({
  chapter,
  showToast,
}: {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const chapterId = chapter.id;
  const [contacts, setContacts] = useState<AlumniContact[]>([]);
  const [totalNotContacted, setTotalNotContacted] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedContact, setSelectedContact] = useState<AlumniContact | null>(null);

  // Modal state
  const [pendingSend, setPendingSend] = useState<{ contact: AlumniContact; touch: TouchType } | null>(null);
  const [sending, setSending] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkLimit, setBulkLimit] = useState<number | undefined>(undefined);
  const [capacity, setCapacity] = useState<{
    this_run: number;
    sendable_today: number;
    not_touched_today: number;
    eligible: number;
  } | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        chapter_id: chapterId,
        limit: '500',
        offset: '0',
        sort: 'outreach_status',
        sort_dir: 'asc',
        has_phone: 'true',
      });
      if (statusFilter !== 'all') params.set('outreach_status', statusFilter);

      const res = await fetch(`/api/alumni-contacts?${params}`, { headers: { Authorization: AUTH } });
      const json = await res.json();
      if (!res.ok || json.error) {
        showToast('Failed to load contacts', 'error');
        return;
      }
      setContacts((json.data?.contacts ?? []) as AlumniContact[]);

      // If filtering by not_contacted, use the API's exact total count (not the page size).
      // Otherwise compute from the loaded list.
      if (!statusFilter || statusFilter === 'all' || statusFilter === 'not_contacted') {
        // Fetch true not-contacted total separately (unaffected by current status filter)
        const countParams = new URLSearchParams({
          chapter_id: chapterId,
          outreach_status: 'not_contacted',
          has_phone: 'true',
          limit: '1',
          offset: '0',
        });
        const countRes = await fetch(`/api/alumni-contacts?${countParams}`, { headers: { Authorization: AUTH } });
        const countJson = await countRes.json().catch(() => ({}));
        setTotalNotContacted(countJson?.data?.total ?? 0);
      }
    } catch {
      showToast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
  }, [chapterId, statusFilter, showToast]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Fetch daily send capacity so the button shows accurate numbers
  useEffect(() => {
    if (!chapterId) return;
    fetch(`/api/outreach/send-bulk?chapter_id=${chapterId}&touch=T1`, { headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(json => {
        if (!json.error) setCapacity(json);
      })
      .catch(() => {});
  }, [chapterId, totalNotContacted]);

  const notContactedCount = totalNotContacted || contacts.filter(c => c.outreach_status === 'not_contacted').length;

  async function handleSendConfirm() {
    if (!pendingSend) return;
    setSending(true);
    try {
      const res = await fetch('/api/outreach/send-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: pendingSend.contact.id, touch: pendingSend.touch }),
      });
      const json = await res.json();
      if (json.success) {
        showToast(`${pendingSend.touch} sent to ${fullName(pendingSend.contact)}`, 'success');
        setPendingSend(null);
        setSelectedContact(null);
        await fetchContacts();
      } else {
        showToast(json.error || 'Send failed', 'error');
      }
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setSending(false);
    }
  }

  async function handleBulkSend() {
    setBulkSending(true);
    try {
      const res = await fetch('/api/outreach/send-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, touch: 'T1', limit: bulkLimit ?? notContactedCount }),
      });
      const json = await res.json();
      if (json.success) {
        const remaining = json.remaining ?? 0;
        const msg = remaining > 0
          ? `Sent T1 to ${json.sent} contacts. ${remaining} remaining — run again to continue.`
          : `Sent T1 to ${json.sent} contacts${json.failed > 0 ? ` (${json.failed} failed)` : ' ✓'}`;
        showToast(msg, json.failed > 0 || remaining > 0 ? 'info' : 'success');
        setBulkConfirm(false);
        await fetchContacts();
      } else if (json.daily_cap_hit) {
        showToast('Daily limit reached across all lines (45/line). Resume tomorrow.', 'error');
        setBulkConfirm(false);
      } else {
        showToast(json.error || 'Bulk send failed', 'error');
      }
    } catch (e) {
      showToast(String(e), 'error');
    } finally {
      setBulkSending(false);
    }
  }

  function openSendModal(contact: AlumniContact, touch: TouchType) {
    setPendingSend({ contact, touch });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Card container */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden',
      }}>
        {/* Header with bulk action */}
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.heading }}>
            Alumni with Phone Numbers
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {notContactedCount > 0 && (<>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <button
                  onClick={() => { setBulkLimit(undefined); setBulkConfirm(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${TOUCH_BUTTON_STYLES.T1.border}`,
                    background: TOUCH_BUTTON_STYLES.T1.bg,
                    color: TOUCH_BUTTON_STYLES.T1.color,
                    fontSize: 13, fontWeight: 600, minHeight: 36,
                  }}
                >
                  <Send size={13} />
                  {capacity
                    ? `Send T1 (${capacity.this_run} this run)`
                    : `Send T1 (${notContactedCount})`
                  }
                </button>
                {capacity && capacity.eligible > 0 && (
                  <span style={{ fontSize: 11, color: '#6B7280', textAlign: 'right', lineHeight: 1.4 }}>
                    {capacity.sendable_today} of {capacity.eligible} send today
                    {capacity.not_touched_today > 0 && (
                      <> &middot; <span style={{ color: '#F59E0B', fontWeight: 600 }}>{capacity.not_touched_today} won&apos;t be touched today</span></>
                    )}
                  </span>
                )}
              </div>
              {[25, 50, 200, 250].map(n => (
                <button
                  key={n}
                  disabled={notContactedCount === 0}
                  onClick={() => { setBulkLimit(n); setBulkConfirm(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px', borderRadius: 8, cursor: notContactedCount === 0 ? 'default' : 'pointer',
                    border: `1px solid ${C.border}`,
                    background: C.card,
                    color: notContactedCount === 0 ? '#9CA3AF' : C.heading,
                    fontSize: 12, fontWeight: 600, minHeight: 32,
                    opacity: notContactedCount === 0 ? 0.5 : 1,
                  }}
                >
                  {Math.min(n, notContactedCount)}
                </button>
              ))}
            </>)}
            <button
              onClick={fetchContacts}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.body, padding: 4 }}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{
          padding: '12px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', gap: 6, flexWrap: 'wrap', overflowX: 'auto',
        }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              style={{
                padding: '5px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                border: statusFilter === f.value ? `1px solid ${C.primary}` : `1px solid ${C.border}`,
                background: statusFilter === f.value ? C.primary : C.card,
                color: statusFilter === f.value ? '#FFFFFF' : C.body,
                fontWeight: statusFilter === f.value ? 600 : 400,
                transition: 'all 0.1s',
                whiteSpace: 'nowrap', minHeight: 32,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Contact cards */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '32px 20px', color: C.body, fontSize: 14 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Loading contacts...
          </div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: C.body, fontSize: 14 }}>
            <Users size={32} style={{ margin: '0 auto 12px', color: C.border, display: 'block' }} />
            No contacts found.
          </div>
        ) : (
          <div>
            {contacts.map((contact, i) => {
              const nextTouch = getNextTouch(contact.outreach_status);
              const lastTouch = contact.last_response_at || contact.touch3_sent_at || contact.touch2_sent_at || contact.touch1_sent_at;

              return (
                <div
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  style={{
                    padding: '14px 20px',
                    borderBottom: i < contacts.length - 1 ? `1px solid ${C.border}` : 'none',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  {/* Name + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.heading }}>
                        {fullName(contact)}
                      </span>
                      {contact.year && (
                        <span style={{ fontSize: 11, color: C.body }}>
                          &apos;{String(contact.year).slice(-2)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: C.body, fontFamily: 'monospace' }}>
                        {contact.phone_primary}
                      </span>
                      {lastTouch && (
                        <span style={{ fontSize: 11, color: C.body }}>
                          · {relativeDate(lastTouch)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <StatusBadge status={contact.outreach_status} />

                  {/* Action button or checkmark */}
                  {contact.outreach_status === 'signed_up' ? (
                    <CheckCircle2 size={18} style={{ color: C.success, flexShrink: 0 }} />
                  ) : contact.outreach_status === 'declined' || contact.outreach_status === 'opted_out' ? (
                    <XCircle size={18} style={{ color: C.danger, flexShrink: 0 }} />
                  ) : nextTouch ? (
                    <button
                      onClick={e => { e.stopPropagation(); openSendModal(contact, nextTouch); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${TOUCH_BUTTON_STYLES[nextTouch].border}`,
                        background: TOUCH_BUTTON_STYLES[nextTouch].bg,
                        color: TOUCH_BUTTON_STYLES[nextTouch].color,
                        fontSize: 12, fontWeight: 600, flexShrink: 0, minHeight: 32,
                      }}
                    >
                      <Send size={11} /> {nextTouch}
                    </button>
                  ) : (
                    <ChevronRight size={16} style={{ color: C.body, flexShrink: 0 }} />
                  )}

                  {/* Chevron for non-action items */}
                  {(contact.outreach_status === 'signed_up' || contact.outreach_status === 'declined' || contact.outreach_status === 'opted_out' || !nextTouch) && contact.outreach_status !== 'signed_up' && contact.outreach_status !== 'declined' && contact.outreach_status !== 'opted_out' && (
                    <ChevronRight size={16} style={{ color: C.body, flexShrink: 0 }} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Slide-out panel overlay */}
      {selectedContact && (
        <>
          <div
            onClick={() => setSelectedContact(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 999,
            }}
          />
          <ContactPanel
            contact={selectedContact}
            chapter={chapter}
            onClose={() => setSelectedContact(null)}
            onSend={(contact, touch) => {
              setSelectedContact(null);
              openSendModal(contact, touch);
            }}
            showToast={showToast}
          />
        </>
      )}

      {/* Single send confirmation */}
      {pendingSend && (
        <ConfirmModal
          contact={pendingSend.contact}
          touch={pendingSend.touch}
          chapter={chapter}
          onConfirm={handleSendConfirm}
          onCancel={() => { if (!sending) setPendingSend(null); }}
          sending={sending}
        />
      )}

      {/* Bulk confirmation */}
      {bulkConfirm && (
        <BulkConfirmModal
          count={notContactedCount}
          touch="T1"
          onConfirm={handleBulkSend}
          onCancel={() => { if (!bulkSending) setBulkConfirm(false); }}
          sending={bulkSending}
          capacity={capacity}
        />
      )}
    </div>
  );
}

// ── Tab 3: Stats ───────────────────────────────────────────────────────────────

function StatsTab({
  chapter,
  showToast,
}: {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const chapterId = chapter.id;
  const [stats, setStats] = useState<AlumniStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/alumni/stats?chapter_id=${chapterId}`);
        const json = await res.json();
        if (json.data) setStats(json.data);
      } catch {
        showToast('Failed to load stats', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [chapterId, showToast]);

  const responseRate = stats && stats.responded > 0 && stats.contacted > 0
    ? Math.round((stats.responded / stats.contacted) * 100)
    : 0;

  const statCards = [
    { label: 'Total with Phone', value: stats?.have_phone ?? 0, icon: <Phone size={18} />, accent: null },
    { label: 'Not Contacted',    value: stats?.touch1_ready ?? 0, icon: <Users size={18} />, accent: null },
    { label: 'T1 Sent',         value: (stats?.contacted ?? 0), icon: <MessageSquare size={18} />, accent: '#1D4ED8' },
    { label: 'T1 Confirmed',    value: stats?.responded ?? 0, icon: <CheckCheck size={18} />, accent: '#065F46' },
    { label: 'T2 Sent',         value: stats?.touch2_due ?? 0, icon: <Send size={18} />, accent: '#B45309' },
    { label: 'Signed Up',       value: stats?.signed_up ?? 0, icon: <CheckCircle2 size={18} />, accent: C.success },
    { label: 'Response Rate',   value: responseRate, suffix: '%', icon: <BarChart2 size={18} />, accent: responseRate >= 30 ? C.success : C.warning },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
      {statCards.map(s => (
        <div key={s.label} style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: C.radius,
          padding: '20px', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: C.body }}>{s.label}</span>
            <span style={{ color: s.accent ?? C.body }}>{s.icon}</span>
          </div>
          {loading ? (
            <div style={{ height: 32, background: '#F3F4F6', borderRadius: 6 }} />
          ) : (
            <span style={{ fontSize: 28, fontWeight: 700, color: s.accent ?? C.heading, lineHeight: 1 }}>
              {s.value.toLocaleString()}{s.suffix ?? ''}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type MainTab = 'contacts' | 'conversations' | 'stats';

export default function MergedOutreachTab({ chapter, showToast, onUpdate }: MergedOutreachTabProps) {
  const [activeTab, setActiveTab] = useState<MainTab>('contacts');

  const tabs: { id: MainTab; label: string; icon: React.ReactNode }[] = [
    { id: 'contacts',      label: 'Contacts',      icon: <Users size={14} /> },
    { id: 'conversations', label: 'Conversations', icon: <MessageSquare size={14} /> },
    { id: 'stats',         label: 'Stats',         icon: <BarChart2 size={14} /> },
  ];

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: C.bg, minHeight: '100%' }}>

      {/* Tab bar */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${C.border}`,
        marginBottom: 24, overflowX: 'auto',
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', border: 'none', background: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: activeTab === t.id ? `2px solid ${C.primary}` : '2px solid transparent',
              color: activeTab === t.id ? C.primary : C.body,
              fontSize: 14, fontWeight: activeTab === t.id ? 600 : 400,
              marginBottom: -1, transition: 'all 0.1s',
              minHeight: 44,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'contacts' && (
        <ContactsTab
          chapter={chapter}
          showToast={showToast}
        />
      )}

      {activeTab === 'conversations' && (
        <ConversationsTab
          showToast={showToast}
          initialChapterId={chapter.id}
          initialChapterName={chapter.chapter_name}
        />
      )}

      {activeTab === 'stats' && (
        <StatsTab
          chapter={chapter}
          showToast={showToast}
        />
      )}
    </div>
  );
}
