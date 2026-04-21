'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Users, Phone, RefreshCw, Loader2,
  MessageSquare, Zap, CheckCircle2, Clock,
  XCircle, Send, Eye, ChevronRight, Flag,
  AlertTriangle, X, CheckCheck, RotateCcw,
} from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';
import ConversationsTab from '../ConversationsTab';
import { INTERNAL_AUTH_HEADER } from '@/lib/internal-auth';

const AUTH = INTERNAL_AUTH_HEADER;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlumniStats {
  total: number;
  have_phone: number;
  imessage: number;
  contacted: number;
  responded: number;
  signed_up: number;
  touch1_ready: number;
  touch2_due: number;
  touch3_due: number;
  outreach_coverage_pct?: number;
  outreach_contacted_with_phone?: number;
}

interface BatchSummary {
  id: string;
  status: string;
  scheduled_date: string;
  total_contacts: number | null;
  chapter_id: string | null;
  touch_breakdown: {
    t1?: { total: number };
    t2?: { total: number };
    t3?: { total: number };
  } | null;
  notes?: string | null;
}

interface PreviewContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  year: number | null;
}

interface BatchPreview {
  t1: { contacts: PreviewContact[]; total: number; cap: number; max_cap: number; sent_today: number; daily_max: number };
  t2: { contacts: PreviewContact[]; total: number };
  t3: { contacts: PreviewContact[]; total: number };
  lines: { active: number; t1_cap_total: number; sent_today: number };
  batch_total_cap: number;
  has_join_link: boolean;
  warnings: string[];
}

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

// ── Brand constants ────────────────────────────────────────────────────────────

const C = {
  bg: '#F9FAFB',
  card: '#FFFFFF',
  border: '#E5E7EB',
  primary: '#0F172A',
  heading: '#111827',
  body: '#6B7280',
  success: '#10B981',
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
  { value: 'not_contacted',   label: 'Not Contacted' },
  { value: 'touch1_sent',     label: 'T1 Sent' },
  { value: 'touch1_confirmed',label: 'T1 Confirmed' },
  { value: 'touch2_sent',     label: 'T2 Sent' },
  { value: 'touch3_sent',     label: 'T3 Sent' },
  { value: 'signed_up',       label: 'Signed Up' },
  { value: 'declined',        label: 'Declined' },
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

// ── Props ──────────────────────────────────────────────────────────────────────

interface MergedOutreachTabProps {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onUpdate: () => void;
}

// ── Slide-Out Contact Panel ────────────────────────────────────────────────────

function ContactPanel({
  contact,
  onClose,
  showToast,
}: {
  contact: AlumniContact;
  onClose: () => void;
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

        {/* Action buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.body, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${C.border}`, background: C.card, color: C.heading,
              fontSize: 13, fontWeight: 500, minHeight: 44,
            }}>
              <Flag size={13} /> Flag
            </button>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid #FCA5A5`, background: '#FEF2F2', color: '#991B1B',
              fontSize: 13, fontWeight: 500, minHeight: 44,
            }}>
              <XCircle size={13} /> Mark Declined
            </button>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${C.border}`, background: C.card, color: C.heading,
              fontSize: 13, fontWeight: 500, minHeight: 44,
            }}>
              <RotateCcw size={13} /> Resend
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab 1: Outreach ────────────────────────────────────────────────────────────

function OutreachTab({
  chapterId,
  showToast,
}: {
  chapterId: string;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [stats, setStats] = useState<AlumniStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [contacts, setContacts] = useState<AlumniContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedContact, setSelectedContact] = useState<AlumniContact | null>(null);
  const PAGE_SIZE = 50;

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/alumni/stats?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.data) setStats(json.data);
    } catch {
      showToast('Failed to load stats', 'error');
    } finally {
      setLoadingStats(false);
    }
  }, [chapterId, showToast]);

  const fetchContacts = useCallback(async (reset = false) => {
    setLoadingContacts(true);
    const offset = reset ? 0 : page * PAGE_SIZE;
    try {
      const params = new URLSearchParams({
        chapter_id: chapterId,
        limit: String(PAGE_SIZE),
        offset: String(offset),
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
      const results = (json.data?.contacts ?? []) as AlumniContact[];
      if (reset) {
        setContacts(results);
        setPage(0);
      } else {
        setContacts(prev => [...prev, ...results]);
      }
      setHasMore(results.length === PAGE_SIZE);
    } catch {
      showToast('Failed to load contacts', 'error');
    } finally {
      setLoadingContacts(false);
    }
  }, [chapterId, page, statusFilter, showToast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchContacts(true); }, [chapterId, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const responseRate = stats && stats.contacted > 0
    ? Math.round((stats.responded / stats.contacted) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Total w/ Phone', value: stats?.have_phone ?? 0, icon: <Phone size={16} /> },
          { label: 'Contacted',      value: stats?.contacted ?? 0,  icon: <MessageSquare size={16} /> },
          { label: 'Replied',        value: stats?.responded ?? 0,  icon: <CheckCheck size={16} />, pct: responseRate },
          { label: 'Signed Up',      value: stats?.signed_up ?? 0,  icon: <CheckCircle2 size={16} />, accent: C.success },
        ].map(s => (
          <div key={s.label} style={{
            background: C.card, border: `1px solid ${C.border}`, borderRadius: C.radius,
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: C.body }}>{s.label}</span>
              <span style={{ color: s.accent ?? C.body }}>{s.icon}</span>
            </div>
            {loadingStats ? (
              <div style={{ height: 28, background: '#F3F4F6', borderRadius: 6, width: '60%' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 700, color: s.accent ?? C.heading }}>
                  {s.value.toLocaleString()}
                </span>
                {'pct' in s && s.pct !== undefined && (
                  <span style={{ fontSize: 12, color: C.body }}>{s.pct}%</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Touch queue badges */}
      {stats && (stats.touch1_ready > 0 || stats.touch2_due > 0 || stats.touch3_due > 0) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stats.touch1_ready > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #93C5FD',
            }}>
              {stats.touch1_ready} ready for T1
            </span>
          )}
          {stats.touch2_due > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D',
            }}>
              {stats.touch2_due} due T2
            </span>
          )}
          {stats.touch3_due > 0 && (
            <span style={{
              padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
              background: '#FFEDD5', color: '#C2410C', border: '1px solid #FDBA74',
            }}>
              {stats.touch3_due} due T3
            </span>
          )}
        </div>
      )}

      {/* Contact list */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden',
      }}>
        {/* List header */}
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.heading }}>
            Contacts with Phone Numbers
          </span>
          <button
            onClick={() => fetchContacts(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.body, padding: 4 }}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
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

        {/* Table */}
        {loadingContacts && contacts.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '32px 20px', color: C.body, fontSize: 14 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Loading contacts...
          </div>
        ) : contacts.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: C.body, fontSize: 14 }}>
            No contacts found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                  {['Name', 'Phone', 'Class', 'Status', 'Last Touch', 'Line'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 500, color: C.body, fontSize: 12 }}>
                      {h}
                    </th>
                  ))}
                  <th style={{ padding: '10px 16px', width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => {
                  const lastTouch = c.last_response_at || c.touch3_sent_at || c.touch2_sent_at || c.touch1_sent_at;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedContact(c)}
                      style={{
                        borderBottom: i < contacts.length - 1 ? `1px solid ${C.border}` : 'none',
                        cursor: 'pointer', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: C.heading }}>
                        {fullName(c)}
                      </td>
                      <td style={{ padding: '12px 16px', color: C.body, fontFamily: 'monospace', fontSize: 12 }}>
                        {c.phone_primary || '--'}
                      </td>
                      <td style={{ padding: '12px 16px', color: C.body }}>
                        {c.year ? `'${String(c.year).slice(-2)}` : '--'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={c.outreach_status} />
                      </td>
                      <td style={{ padding: '12px 16px', color: C.body, fontSize: 12 }}>
                        {relativeDate(lastTouch) || '--'}
                      </td>
                      <td style={{ padding: '12px 16px', color: C.body, fontSize: 11 }}>
                        {c.linq_line || '--'}
                      </td>
                      <td style={{ padding: '12px 16px', color: C.body }}>
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {hasMore && (
              <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                <button
                  onClick={() => { setPage(p => p + 1); fetchContacts(); }}
                  disabled={loadingContacts}
                  style={{
                    padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${C.border}`, background: C.card, color: C.heading,
                    fontSize: 13, fontWeight: 500,
                  }}
                >
                  {loadingContacts ? 'Loading...' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slide-out panel */}
      {selectedContact && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setSelectedContact(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 999,
            }}
          />
          <ContactPanel
            contact={selectedContact}
            onClose={() => setSelectedContact(null)}
            showToast={showToast}
          />
        </>
      )}
    </div>
  );
}

// ── Tab 2: Compile & Send ──────────────────────────────────────────────────────

type CompileStep = 'idle' | 'preview' | 'compiled' | 'executing' | 'done';

function CompileTab({
  chapter,
  showToast,
}: {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const chapterId = chapter.id;
  const fraternity = chapter.fraternity;
  const school = chapter.school;

  const [step, setStep] = useState<CompileStep>('idle');
  const [t1Limit, setT1Limit] = useState(30);
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [batch, setBatch] = useState<BatchSummary | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [approving, setApproving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [liveProgress, setLiveProgress] = useState<{ sent: number; total: number; failed: number; pct: number } | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: number; sms: number } | null>(null);
  const [batchContacts, setBatchContacts] = useState<(PreviewContact & { touch: 'T1' | 'T2' | 'T3' })[]>([]);
  const [batchHistory, setBatchHistory] = useState<BatchSummary[]>([]);
  const progressPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const executingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBatch = useCallback(async () => {
    setLoadingBatch(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/outreach/batches?chapter_id=${chapterId}&date=${today}&limit=1`);
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        setBatch(json.data[0]);
        setStep('compiled');
      } else {
        setBatch(null);
      }
    } catch {
      setBatch(null);
    } finally {
      setLoadingBatch(false);
    }
  }, [chapterId]);

  const fetchBatchHistory = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/outreach/batches?chapter_id=${chapterId}&limit=6`);
      const json = await res.json();
      if (json.data) {
        const history = (json.data as BatchSummary[]).filter(
          b => b.scheduled_date < today || b.status === 'completed' || b.status === 'rejected'
        ).slice(0, 5);
        setBatchHistory(history);
      }
    } catch { /* silent */ }
  }, [chapterId]);

  useEffect(() => {
    fetchBatch();
    fetchBatchHistory();
  }, [fetchBatch, fetchBatchHistory]);

  // Auto-refresh while executing
  useEffect(() => {
    if (batch?.status === 'executing' || batch?.status === 'sending') {
      if (!executingIntervalRef.current) {
        executingIntervalRef.current = setInterval(() => { fetchBatch(); }, 30_000);
      }
    } else {
      if (executingIntervalRef.current) {
        clearInterval(executingIntervalRef.current);
        executingIntervalRef.current = null;
      }
    }
    return () => {
      if (executingIntervalRef.current) { clearInterval(executingIntervalRef.current); executingIntervalRef.current = null; }
    };
  }, [batch?.status, fetchBatch]);

  async function fetchPreview(limit?: number) {
    setLoadingPreview(true);
    try {
      const params = new URLSearchParams({ chapter_id: chapterId });
      if (limit != null) params.set('t1_limit', String(limit));
      const res = await fetch(`/api/outreach/preview-chapter?${params}`);
      const json = await res.json();
      if (json.error) { showToast(json.error, 'error'); return; }
      setPreview(json);
      const maxCap = json.t1.max_cap ?? 30;
      setT1Limit(l => l === 30 ? Math.min(30, maxCap) : l);
      setStep('preview');
    } catch {
      showToast('Failed to load preview', 'error');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function loadBatchContacts(b: BatchSummary) {
    if (!b.notes) return;
    try {
      let ids: { t1: string[]; t2: string[]; t3: string[] } = { t1: [], t2: [], t3: [] };
      try {
        const parsed = typeof b.notes === 'string' ? JSON.parse(b.notes) : b.notes;
        if (parsed?.contact_ids) ids = parsed.contact_ids;
      } catch { /* no contact_ids */ }
      const allIds = [...ids.t1, ...ids.t2, ...ids.t3];
      if (allIds.length === 0) return;
      const res = await fetch(`/api/outreach/batch-contacts?ids=${allIds.slice(0, 200).join(',')}`);
      const json = await res.json();
      const idToTouch: Record<string, 'T1' | 'T2' | 'T3'> = {};
      ids.t1.forEach((id: string) => { idToTouch[id] = 'T1'; });
      ids.t2.forEach((id: string) => { idToTouch[id] = 'T2'; });
      ids.t3.forEach((id: string) => { idToTouch[id] = 'T3'; });
      setBatchContacts((json.data || []).map((c: PreviewContact) => ({ ...c, touch: idToTouch[c.id] ?? 'T1' })));
    } catch { /* silent */ }
  }

  async function compileBatch() {
    setCompiling(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/outreach/compile-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, date: today, t1_limit: t1Limit, force: true }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error, 'error');
      } else if (json.total === 0) {
        showToast(json.message || 'No eligible contacts found.', 'info');
      } else {
        const msg = json.existing ? 'Batch loaded - approve and execute below.' : `Compiled batch: ${json.batch?.total_contacts} contacts`;
        showToast(msg, 'success');
        setBatch(json.batch);
        setStep('compiled');
        setPreview(null);
        if (json.batch) loadBatchContacts(json.batch);
      }
    } catch {
      showToast('Failed to compile batch', 'error');
    } finally {
      setCompiling(false);
    }
  }

  async function handleApproveBatch() {
    if (!batch) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/outreach/batches/${batch.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Approval failed', 'error');
      } else {
        showToast('Batch approved - ready to execute', 'success');
        setBatch(prev => prev ? { ...prev, status: 'approved' } : prev);
      }
    } catch {
      showToast('Failed to approve batch', 'error');
    } finally {
      setApproving(false);
    }
  }

  async function handleExecuteBatch() {
    if (!batch) return;
    setShowConfirm(false);
    setExecuting(true);
    setStep('executing');
    setLiveProgress({ sent: 0, total: batch.total_contacts ?? 0, failed: 0, pct: 0 });
    showToast('Executing batch - this may take a few minutes...', 'info');

    const batchId = batch.id;
    if (progressPollRef.current) clearInterval(progressPollRef.current);
    progressPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/outreach/batches/${batchId}/progress`);
        if (res.ok) {
          const json = await res.json();
          if (json.progress) setLiveProgress(json.progress);
          if (json.status !== 'executing' && json.status !== 'sending') {
            if (progressPollRef.current) { clearInterval(progressPollRef.current); progressPollRef.current = null; }
          }
        }
      } catch { /* non-fatal */ }
    }, 3000);

    try {
      const res = await fetch(`/api/outreach/batches/${batchId}/execute`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Execution failed', 'error');
        setStep('compiled');
      } else {
        const sent = json.data?.sent ?? 0;
        const failed = json.data?.failed ?? 0;
        const sms = json.data?.sent_to_sms ?? 0;
        showToast(`Batch complete - ${sent} sent`, 'success');
        setResult({ sent, failed, sms });
        setStep('done');
        await fetchBatch();
        if (json.data) {
          setLiveProgress({ sent: json.data.sent ?? 0, total: batch.total_contacts ?? json.data.sent ?? 0, failed: json.data.failed ?? 0, pct: 100 });
        }
      }
    } catch {
      showToast('Batch execution failed', 'error');
      setStep('compiled');
    } finally {
      if (progressPollRef.current) { clearInterval(progressPollRef.current); progressPollRef.current = null; }
      setExecuting(false);
    }
  }

  // Step indicators
  const steps = [
    { num: 1, label: 'Set T1 count' },
    { num: 2, label: 'Preview batch' },
    { num: 3, label: 'Compile' },
    { num: 4, label: 'Execute' },
  ];
  const currentStep = step === 'idle' ? 1 : step === 'preview' ? 2 : step === 'compiled' ? 3 : 4;

  const previewTotal = preview ? preview.t1.total + preview.t2.total + preview.t3.total : 0;
  const batchTotal = batch?.total_contacts ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>

      {/* Step progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {steps.map((s, i) => (
          <React.Fragment key={s.num}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                background: currentStep > s.num ? C.success : currentStep === s.num ? C.primary : C.bg,
                color: currentStep >= s.num ? '#FFFFFF' : C.body,
                border: currentStep < s.num ? `1px solid ${C.border}` : 'none',
              }}>
                {currentStep > s.num ? <CheckCircle2 size={14} /> : s.num}
              </div>
              <span style={{
                fontSize: 12, fontWeight: currentStep === s.num ? 600 : 400,
                color: currentStep === s.num ? C.heading : C.body,
                display: 'none',
              }}
                className="step-label"
              >{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 1, background: currentStep > s.num ? C.success : C.border, margin: '0 8px' }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1+2: T1 Slider + Preview */}
      {(step === 'idle' || step === 'preview') && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.heading }}>New outreach messages to send</div>
            <div style={{ fontSize: 13, color: C.body, marginTop: 2 }}>Set how many new T1 contacts to text today</div>
          </div>

          <div style={{ padding: 20 }}>
            {/* Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <input
                type="range"
                min={0}
                max={preview?.t1.max_cap ?? 90}
                value={t1Limit}
                onChange={e => setT1Limit(parseInt(e.target.value))}
                onMouseUp={() => { if (step === 'preview') fetchPreview(t1Limit); }}
                onTouchEnd={() => { if (step === 'preview') fetchPreview(t1Limit); }}
                style={{ flex: 1, accentColor: C.primary, height: 6 }}
              />
              <input
                type="number"
                min={0}
                max={preview?.t1.max_cap ?? 90}
                value={t1Limit}
                onChange={e => setT1Limit(Math.max(0, parseInt(e.target.value) || 0))}
                onBlur={() => { if (step === 'preview') fetchPreview(t1Limit); }}
                style={{
                  width: 64, padding: '6px 10px', borderRadius: 8,
                  border: `1px solid ${C.border}`, fontSize: 14,
                  textAlign: 'center', color: C.heading, fontWeight: 600,
                }}
              />
            </div>
            {preview && (
              <div style={{ fontSize: 12, color: C.body, marginBottom: 4 }}>
                {preview.lines.active} active lines &middot; {preview.t1.sent_today} sent today &middot; {preview.t1.max_cap} remaining capacity
              </div>
            )}

            {/* Warnings */}
            {preview?.warnings && preview.warnings.length > 0 && (
              <div style={{
                marginTop: 12, padding: 12, borderRadius: 8,
                background: '#FFFBEB', border: '1px solid #FCD34D',
              }}>
                {preview.warnings.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#92400E', marginBottom: i < preview.warnings.length - 1 ? 6 : 0 }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Preview button */}
            <button
              onClick={() => fetchPreview(t1Limit)}
              disabled={loadingPreview}
              style={{
                marginTop: 16, display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 8, cursor: loadingPreview ? 'default' : 'pointer',
                border: `1px solid ${C.border}`, background: C.card, color: C.heading,
                fontSize: 14, fontWeight: 500,
              }}
            >
              {loadingPreview ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Eye size={14} />}
              {loadingPreview ? 'Loading preview...' : 'Preview Batch'}
            </button>
          </div>

          {/* Preview results */}
          {step === 'preview' && preview && (
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              {/* Batch breakdown */}
              <div style={{
                padding: '14px 20px', background: C.bg,
                display: 'flex', gap: 20, flexWrap: 'wrap',
              }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: C.heading, fontSize: 20 }}>{previewTotal}</span>
                  <span style={{ color: C.body, marginLeft: 4 }}>total contacts</span>
                </div>
                {[
                  { label: 'T1 New', count: preview.t1.total, color: '#1D4ED8' },
                  { label: 'T2 Follow-up', count: preview.t2.total, color: '#B45309' },
                  { label: 'T3 Final', count: preview.t3.total, color: '#C2410C' },
                ].map(t => t.count > 0 && (
                  <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <span style={{ color: C.heading, fontWeight: 600 }}>{t.count}</span>
                    <span style={{ color: C.body }}>{t.label}</span>
                  </div>
                ))}
              </div>

              {/* T1 message preview */}
              {preview.t1.contacts.length > 0 && (() => {
                const first = preview.t1.contacts[0];
                const firstName = first.first_name || 'Alumni';
                const msg = `Hey ${firstName}, is this you? Just verifying we have the right number for the ${fraternity} alumni list at ${school}.`;
                return (
                  <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.body, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>T1 Message Preview</div>
                    <div style={{
                      padding: 12, borderRadius: 8,
                      background: '#EFF6FF', border: '1px solid #BFDBFE',
                      fontSize: 13, color: C.heading, lineHeight: 1.6,
                      fontStyle: 'italic',
                    }}>
                      "{msg}"
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: C.body }}>
                      Name filled from first T1 contact: <strong>{firstName}</strong>
                    </div>
                  </div>
                );
              })()}

              {/* Contact list preview */}
              {preview.t1.contacts.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.border}`, maxHeight: 240, overflowY: 'auto' }}>
                  <div style={{
                    padding: '8px 20px', background: C.bg, fontSize: 11, fontWeight: 600,
                    color: C.body, textTransform: 'uppercase', letterSpacing: '0.05em',
                    position: 'sticky', top: 0, borderBottom: `1px solid ${C.border}`,
                  }}>
                    T1 Contacts ({preview.t1.total})
                  </div>
                  {preview.t1.contacts.map((c, i) => (
                    <div key={c.id} style={{
                      padding: '8px 20px', borderBottom: i < preview.t1.contacts.length - 1 ? `1px solid ${C.border}` : 'none',
                      display: 'flex', justifyContent: 'space-between', fontSize: 13,
                    }}>
                      <span style={{ color: C.heading, fontWeight: 500 }}>{fullName(c)}</span>
                      <span style={{ color: C.body }}>{c.year ? `'${String(c.year).slice(-2)}` : '--'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Compile button */}
              <div style={{ padding: '14px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  onClick={() => { setStep('idle'); setPreview(null); }}
                  style={{
                    padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${C.border}`, background: C.card, color: C.heading,
                    fontSize: 14, fontWeight: 500,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={compileBatch}
                  disabled={compiling || previewTotal === 0}
                  style={{
                    padding: '10px 20px', borderRadius: 8, cursor: compiling ? 'default' : 'pointer',
                    border: 'none', background: compiling ? C.body : C.primary, color: '#FFFFFF',
                    fontSize: 14, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  {compiling
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Compiling...</>
                    : <><Zap size={14} /> Compile {previewTotal} contacts</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Compiled batch ready */}
      {(step === 'compiled' || step === 'executing' || step === 'done') && batch && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden',
        }}>
          {/* Batch header */}
          <div style={{
            padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.heading }}>
                Today's Batch - {batchTotal} contacts
              </div>
              <div style={{ fontSize: 12, color: C.body, marginTop: 2, display: 'flex', gap: 10 }}>
                {batch.touch_breakdown?.t1?.total ? <span>T1: {batch.touch_breakdown.t1.total}</span> : null}
                {batch.touch_breakdown?.t2?.total ? <span>T2: {batch.touch_breakdown.t2.total}</span> : null}
                {batch.touch_breakdown?.t3?.total ? <span>T3: {batch.touch_breakdown.t3.total}</span> : null}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {batch.status === 'pending_approval' && (
                <span style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D',
                }}>
                  Pending Approval
                </span>
              )}
              {batch.status === 'approved' && (
                <span style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7',
                }}>
                  Approved
                </span>
              )}
              {(batch.status === 'executing' || batch.status === 'sending') && (
                <span style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: '#DBEAFE', color: '#1D4ED8', border: '1px solid #93C5FD',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  Executing
                </span>
              )}
              {batch.status === 'completed' && (
                <span style={{
                  padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7',
                }}>
                  Completed
                </span>
              )}
              <button
                onClick={() => { setStep('idle'); setBatch(null); setPreview(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.body, padding: 4 }}
                title="Start over"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          {/* Contact list from batch */}
          {batchContacts.length > 0 && (
            <div style={{ borderBottom: `1px solid ${C.border}`, maxHeight: 280, overflowY: 'auto' }}>
              <div style={{
                padding: '8px 20px', background: C.bg, fontSize: 11, fontWeight: 600,
                color: C.body, textTransform: 'uppercase', letterSpacing: '0.05em',
                position: 'sticky', top: 0, borderBottom: `1px solid ${C.border}`,
              }}>
                Who will be texted
              </div>
              {batchContacts.map((c, i) => {
                const touchColor = c.touch === 'T1' ? '#1D4ED8' : c.touch === 'T2' ? '#B45309' : '#C2410C';
                const touchBg   = c.touch === 'T1' ? '#DBEAFE' : c.touch === 'T2' ? '#FEF3C7' : '#FFEDD5';
                return (
                  <div key={c.id} style={{
                    padding: '8px 20px', borderBottom: i < batchContacts.length - 1 ? `1px solid ${C.border}` : 'none',
                    display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
                  }}>
                    <span style={{ flex: 1, color: C.heading, fontWeight: 500 }}>{fullName(c)}</span>
                    <span style={{ color: C.body }}>{c.year ? `'${String(c.year).slice(-2)}` : ''}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: touchBg, color: touchColor,
                    }}>
                      {c.touch}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Progress bar (executing) */}
          {(step === 'executing' || batch.status === 'executing' || batch.status === 'sending') && liveProgress && (
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, color: C.heading, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color: '#1D4ED8' }} />
                  Sending {liveProgress.sent} / {liveProgress.total}
                </span>
                {liveProgress.failed > 0 && (
                  <span style={{ color: C.danger, fontSize: 12 }}>{liveProgress.failed} failed</span>
                )}
              </div>
              <div style={{ height: 8, background: '#BFDBFE', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${liveProgress.pct}%`,
                  background: '#2563EB', borderRadius: 4, transition: 'width 0.3s ease-out',
                }} />
              </div>
              <div style={{ fontSize: 11, color: C.body, marginTop: 6 }}>
                Updates every 3 seconds
              </div>
            </div>
          )}

          {/* Results (done) */}
          {step === 'done' && result && (
            <div style={{ padding: '20px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{
                padding: 16, borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0',
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#065F46', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} /> Batch Complete
                </div>
                <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
                  <div><span style={{ fontWeight: 700, fontSize: 20, color: C.heading }}>{result.sent}</span> <span style={{ color: C.body }}>sent</span></div>
                  {result.failed > 0 && <div><span style={{ fontWeight: 700, fontSize: 20, color: C.danger }}>{result.failed}</span> <span style={{ color: C.body }}>failed</span></div>}
                  {result.sms > 0 && <div><span style={{ fontWeight: 700, fontSize: 20, color: C.body }}>{result.sms}</span> <span style={{ color: C.body }}>SMS skipped</span></div>}
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ padding: '16px 20px' }}>
            {batch.status === 'pending_approval' && (
              <button
                onClick={handleApproveBatch}
                disabled={approving}
                style={{
                  width: '100%', padding: '12px 24px', borderRadius: 8,
                  border: 'none', background: approving ? C.body : C.primary, color: '#FFFFFF',
                  fontSize: 15, fontWeight: 600, cursor: approving ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  minHeight: 44,
                }}
              >
                {approving
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Approving...</>
                  : <><CheckCircle2 size={16} /> Approve Batch</>}
              </button>
            )}

            {batch.status === 'approved' && !executing && (
              <button
                onClick={() => setShowConfirm(true)}
                style={{
                  width: '100%', padding: '12px 24px', borderRadius: 8,
                  border: 'none', background: C.success, color: '#FFFFFF',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  minHeight: 44,
                }}
              >
                <Send size={16} /> Send {batchTotal} Messages
              </button>
            )}

            {batch.status === 'completed' && step !== 'done' && (
              <div style={{ fontSize: 13, color: C.body, textAlign: 'center' }}>
                Batch completed. Start a new one tomorrow.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch history */}
      {batchHistory.length > 0 && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: C.radius, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.heading }}>Batch History</span>
          </div>
          {batchHistory.map((h, i) => {
            const statusColor =
              h.status === 'completed' ? '#065F46' :
              h.status === 'rejected'  ? '#9CA3AF' :
              h.status === 'executing' || h.status === 'sending' ? '#1D4ED8' : C.body;
            const statusBg =
              h.status === 'completed' ? '#D1FAE5' :
              h.status === 'rejected'  ? '#F3F4F6' :
              h.status === 'executing' || h.status === 'sending' ? '#DBEAFE' : '#F3F4F6';
            return (
              <div key={h.id} style={{
                padding: '12px 20px',
                borderBottom: i < batchHistory.length - 1 ? `1px solid ${C.border}` : 'none',
                display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
              }}>
                <span style={{ color: C.body, minWidth: 64 }}>
                  {new Date(h.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span style={{ color: C.heading, flex: 1 }}>
                  {h.total_contacts ?? 0} contacts
                  {h.touch_breakdown && (
                    <span style={{ color: C.body, marginLeft: 6 }}>
                      T1: {h.touch_breakdown.t1?.total ?? 0}, T2: {h.touch_breakdown.t2?.total ?? 0}, T3: {h.touch_breakdown.t3?.total ?? 0}
                    </span>
                  )}
                </span>
                <span style={{
                  padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                  background: statusBg, color: statusColor,
                }}>
                  {h.status.replace(/_/g, ' ')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Loading state */}
      {loadingBatch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.body, fontSize: 13 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          Checking for existing batch...
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && batch && (
        <>
          <div
            onClick={() => setShowConfirm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 1001, background: C.card, borderRadius: C.radius,
            border: `1px solid ${C.border}`, padding: 28, width: 380, maxWidth: '90vw',
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.heading, marginBottom: 8 }}>
              Confirm Batch Send
            </div>
            <div style={{ fontSize: 14, color: C.body, marginBottom: 20, lineHeight: 1.6 }}>
              You're about to send <strong>{batchTotal} messages</strong> to alumni contacts for {chapter.chapter_name}. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${C.border}`, background: C.card, color: C.heading,
                  fontSize: 14, fontWeight: 500,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteBatch}
                style={{
                  padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                  border: 'none', background: C.success, color: '#FFFFFF',
                  fontSize: 14, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Send size={14} /> Send {batchTotal} Messages
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type MainTab = 'outreach' | 'compile' | 'conversations';

export default function MergedOutreachTab({ chapter, showToast, onUpdate }: MergedOutreachTabProps) {
  const [activeTab, setActiveTab] = useState<MainTab>('outreach');

  const tabs: { id: MainTab; label: string; icon: React.ReactNode }[] = [
    { id: 'outreach',       label: 'Outreach',       icon: <Users size={14} /> },
    { id: 'compile',        label: 'Compile & Send', icon: <Send size={14} /> },
    { id: 'conversations',  label: 'Conversations',  icon: <MessageSquare size={14} /> },
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
      {activeTab === 'outreach' && (
        <OutreachTab
          chapterId={chapter.id}
          showToast={showToast}
        />
      )}

      {activeTab === 'compile' && (
        <CompileTab
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
    </div>
  );
}
