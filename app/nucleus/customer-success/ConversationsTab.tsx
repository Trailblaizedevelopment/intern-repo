'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  MessageSquare, RefreshCw, CheckCheck, Flag,
  Loader2, Send, User, ArrowLeft, ChevronLeft, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ── Constants ──────────────────────────────────────────────────────────────

const AUTH = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';
const API = '/api/conversations';
const LIMIT = 50;

// Owen=blue, Adam=green, Ford=purple (per spec)
const LINES: { phone: string; label: string; color: { bg: string; text: string } }[] = [
  { phone: '+16462101111', label: 'Owen', color: { bg: '#dbeafe', text: '#1d4ed8' } },
  { phone: '+16462668785', label: 'Adam', color: { bg: '#d1fae5', text: '#065f46' } },
  { phone: '+16462442696', label: 'Ford', color: { bg: '#ede9fe', text: '#7c3aed' } },
];

const LINQ_LINE_PHONES = new Set(LINES.map(l => l.phone));

const OUTREACH_META: Record<string, { bg: string; text: string; label: string }> = {
  touch1_confirmed: { bg: '#fef3c7', text: '#b45309', label: 'Confirmed' },
  pitched:          { bg: '#dbeafe', text: '#1d4ed8', label: 'Pitched' },
  touch1_sent:      { bg: '#f3f4f6', text: '#6b7280', label: 'T1 Sent' },
  touch2_sent:      { bg: '#fef9c3', text: '#854d0e', label: 'T2 Sent' },
  touch3_sent:      { bg: '#fee2e2', text: '#991b1b', label: 'T3 Sent' },
  no_response:      { bg: '#f3f4f6', text: '#6b7280', label: 'No Response' },
  signed_up:        { bg: '#d1fae5', text: '#065f46', label: 'Signed Up' },
};

type Tab = 'active' | 'flagged' | 'unresponsive' | 'handled';

const TAB_META: Record<Tab, { label: string; color: string }> = {
  active:       { label: 'Active',       color: '#2563eb' },
  flagged:      { label: 'Flagged',      color: '#d97706' },
  unresponsive: { label: 'Unresponsive', color: '#6b7280' },
  handled:      { label: 'Handled',      color: '#16a34a' },
};

type ConvCategory = 'needs_reply' | 'flagged' | 'touch1' | 'touch2' | 'touch3' | 'signed_up' | 'confirmed' | 'no_response' | 'handled' | 'all';

const CATEGORY_META: { key: ConvCategory; icon: string; label: string }[] = [
  { key: 'needs_reply',  icon: '🔴', label: 'Needs Reply' },
  { key: 'flagged',      icon: '🟡', label: 'Flagged' },
  { key: 'touch1',       icon: '📬', label: 'Touch 1 Pending' },
  { key: 'touch2',       icon: '📩', label: 'Touch 2 Pending' },
  { key: 'touch3',       icon: '📫', label: 'Touch 3 Pending' },
  { key: 'signed_up',    icon: '✅', label: 'Signed Up' },
  { key: 'confirmed',    icon: '🤝', label: 'Confirmed' },
  { key: 'no_response',  icon: '📭', label: 'No Response' },
  { key: 'handled',      icon: '☑️', label: 'Handled' },
  { key: 'all',          icon: '📋', label: 'All' },
];

// ── Types ──────────────────────────────────────────────────────────────────

interface ChapterEntry {
  chapter_id: string | null;
  chapter_name: string | null;
  counts: { active: number; flagged: number; unresponsive: number };
}

interface ChapterApiRow {
  chapter_id: string | null;
  chapter_name: string | null;
  count: number;
}

export interface LinqConversation {
  id: string;
  linq_chat_id: string;
  contact_id: string | null;
  line_phone: string;
  line_label: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  chapter_id: string | null;
  chapter_name: string | null;
  outreach_status: string | null;
  touch_stage: string | null;
  status: 'active' | 'handled' | 'flagged' | 'unresponsive' | 'archived';
  flagged_reason: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  has_unread_reply: boolean;
  is_urgent: boolean;
  grad_year?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinqMessage {
  id: string;
  chat_id: string;
  from: string;
  is_from_me: boolean;
  parts: { type: string; value: string }[];
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffH / 24);
  if (diffH < 1) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function lineFor(phone: string) {
  return LINES.find(l => l.phone === phone) ?? null;
}

function stageLabelFor(touch_stage: string | null): string | null {
  switch (touch_stage) {
    case 'T1': return 'Send Pitch';
    case 'T2': return 'Follow Up';
    case 'T3': return 'No Response';
    default: return null;
  }
}

// ── MODULE-LEVEL Sub-components ────────────────────────────────────────────

// ChapterRow
interface ChapterRowProps {
  entry: ChapterEntry;
  activeTab: Tab;
  onClick: () => void;
}

function ChapterRow({ entry, activeTab, onClick }: ChapterRowProps) {
  const name = entry.chapter_name ?? '(No Chapter)';
  const { active, flagged, unresponsive } = entry.counts;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid #f0f0f0',
        background: hovered ? '#f9fafb' : '#fff',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', marginBottom: 4 }}>
        {name}
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{
          color: activeTab === 'active' ? '#2563eb' : '#6b7280',
          fontWeight: activeTab === 'active' ? 700 : 400,
        }}>
          Active ({active})
        </span>
        <span style={{ color: '#d1d5db' }}>·</span>
        <span style={{
          color: activeTab === 'flagged' ? '#d97706' : '#6b7280',
          fontWeight: activeTab === 'flagged' ? 700 : 400,
        }}>
          Flagged ({flagged})
        </span>
        <span style={{ color: '#d1d5db' }}>·</span>
        <span style={{
          color: activeTab === 'unresponsive' ? '#374151' : '#6b7280',
          fontWeight: activeTab === 'unresponsive' ? 700 : 400,
        }}>
          Unresponsive ({unresponsive})
        </span>
      </div>
    </div>
  );
}

// ConvRow
interface ConvRowProps {
  conv: LinqConversation;
  isSelected: boolean;
  onClick: () => void;
}

function ConvRow({ conv, isSelected, onClick }: ConvRowProps) {
  const line = lineFor(conv.line_phone);
  const preview = (conv.last_message_text ?? '').slice(0, 60) +
    ((conv.last_message_text?.length ?? 0) > 60 ? '…' : '');

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        cursor: 'pointer',
        borderLeft: `3px solid ${conv.has_unread_reply ? '#2563eb' : isSelected ? '#2563eb' : 'transparent'}`,
        borderBottom: '1px solid #f0f0f0',
        background: isSelected ? '#eff6ff' : '#fafafa',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        {/* Avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: line ? line.color.bg : '#e9eaf0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.78rem', fontWeight: 700,
          color: line ? line.color.text : '#64748b',
        }}>
          {conv.contact_name ? initials(conv.contact_name) : <User size={14} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: name + grad year + timestamp */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: conv.has_unread_reply ? 700 : 600, fontSize: '0.8375rem', color: '#111827' }}>
                {conv.contact_name ?? conv.contact_phone ?? 'Unknown'}
              </span>
              {conv.grad_year && (
                <span style={{ marginLeft: 4, fontSize: '0.72rem', color: '#9ca3af' }}>&apos;{conv.grad_year}</span>
              )}
            </div>
            <span style={{ fontSize: '0.7rem', color: '#9ca3af', flexShrink: 0 }}>
              {formatTime(conv.last_message_at)}
            </span>
          </div>

          {/* Row 2: message preview */}
          {preview ? (
            <div style={{ marginTop: 2, fontSize: '0.73rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conv.last_message_direction === 'inbound' ? '← ' : '→ '}{preview}
            </div>
          ) : null}

          {/* Row 3: line badge + unread dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            {line && (
              <span style={{
                background: line.color.bg, color: line.color.text,
                fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10, flexShrink: 0,
              }}>
                {line.label}
              </span>
            )}
            {conv.has_unread_reply && (
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#2563eb',
                flexShrink: 0, display: 'inline-block',
              }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// MessageBubble
interface MessageBubbleProps { msg: LinqMessage; }

function MessageBubble({ msg }: MessageBubbleProps) {
  const isOutbound = msg.is_from_me || LINQ_LINE_PHONES.has(msg.from);
  const text = msg.parts.filter(p => p.type === 'text').map(p => p.value).join(' ');
  const time = new Date(msg.created_at).toLocaleString('en-US', {
    hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric',
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isOutbound ? 'flex-end' : 'flex-start', marginBottom: 8,
    }}>
      <div style={{
        maxWidth: '75%', padding: '8px 12px',
        borderRadius: isOutbound ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isOutbound ? '#2563eb' : '#f3f4f6',
        color: isOutbound ? '#fff' : '#111827',
        fontSize: '0.8375rem', lineHeight: 1.45,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)', wordBreak: 'break-word',
      }}>
        {text || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>(media)</span>}
      </div>
      <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2, padding: '0 4px' }}>{time}</span>
    </div>
  );
}

// ReplyBox — owns its own text state
interface ReplyBoxProps {
  convId: string;
  linqChatId: string | null;
  onSent: () => void;
  onError: (msg: string) => void;
}

function ReplyBox({ convId, linqChatId, onSent, onError }: ReplyBoxProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  // Reset on conversation change
  useEffect(() => { setText(''); }, [convId]);

  async function handleSend() {
    const msg = text.trim();
    if (!msg || !linqChatId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/${convId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ message: msg }),
      });
      const json = await res.json();
      if (!res.ok) onError(json.error ?? 'Send failed');
      else { setText(''); onSent(); }
    } catch (err) {
      onError(String(err));
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(text.trim()) && Boolean(linqChatId) && !sending;

  return (
    <div style={{ padding: '12px 14px', borderTop: '2px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
          placeholder={linqChatId ? 'Type a reply… (⌘↵ to send)' : 'No Linq chat — cannot reply'}
          disabled={!linqChatId || sending}
          rows={2}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10, border: '1.5px solid #d1d5db',
            fontSize: '0.875rem', lineHeight: '1.5', resize: 'none', outline: 'none',
            fontFamily: 'inherit', color: '#111827', background: !linqChatId ? '#f9fafb' : '#fff',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            padding: '10px 14px', borderRadius: 10, border: 'none',
            background: canSend ? '#2563eb' : '#e5e7eb',
            color: canSend ? '#fff' : '#9ca3af',
            cursor: canSend ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 5,
            fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.15s',
          }}
        >
          {sending
            ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            : <Send size={14} />}
          Send
        </button>
      </div>
    </div>
  );
}

// ── AlumniContactsList — renders alumni_contacts for status-based categories ──

interface AlumniContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_primary: string | null;
  outreach_status: string;
  touch1_sent_at: string | null;
  touch2_sent_at: string | null;
  touch3_sent_at: string | null;
  last_response_at: string | null;
}

const ALUMNI_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  touch1_sent:      { label: 'Touch 1 Sent',  color: '#1d4ed8', bg: '#dbeafe' },
  touch2_sent:      { label: 'Touch 2 Sent',  color: '#854d0e', bg: '#fef9c3' },
  touch3_sent:      { label: 'Touch 3 Sent',  color: '#991b1b', bg: '#fee2e2' },
  signed_up:        { label: 'Signed Up ✓',   color: '#065f46', bg: '#d1fae5' },
  touch1_confirmed: { label: 'Confirmed',      color: '#b45309', bg: '#fef3c7' },
  declined:         { label: 'Handled',        color: '#374151', bg: '#f3f4f6' },
};

// Map category key to outreach_status values to query
function getStatusesForCategory(cat: ConvCategory): string[] | null {
  switch (cat) {
    case 'touch1':    return ['touch1_sent'];
    case 'touch2':    return ['touch2_sent'];
    case 'touch3':    return ['touch3_sent'];
    case 'signed_up': return ['signed_up'];
    case 'confirmed': return ['touch1_confirmed'];
    case 'handled':   return ['declined'];
    default:          return null;
  }
}

interface AlumniContactsListProps {
  chapterId: string;
  category: ConvCategory;
  search: string;
}

function AlumniContactsList({ chapterId, category, search }: AlumniContactsListProps) {
  const [contacts, setContacts] = useState<AlumniContactRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const statuses = getStatusesForCategory(category);
    if (!statuses) { setLoading(false); return; }

    setLoading(true);
    let query = supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, phone_primary, outreach_status, touch1_sent_at, touch2_sent_at, touch3_sent_at, last_response_at')
      .eq('chapter_id', chapterId)
      .in('outreach_status', statuses)
      .order('created_at', { ascending: false })
      .limit(200);

    // Apply search filter
    if (search.trim()) {
      query = query.or(`first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%,phone_primary.ilike.%${search.trim()}%`);
    }

    query.then(({ data, error }) => {
      if (!error && data) setContacts(data as AlumniContactRow[]);
      setLoading(false);
    });
  }, [chapterId, category, search]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', gap: 8 }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.8rem' }}>Loading…</span>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: '#9ca3af', gap: 10 }}>
        <MessageSquare size={28} style={{ opacity: 0.2 }} />
        <span style={{ fontSize: '0.8rem' }}>No contacts found</span>
      </div>
    );
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {contacts.map((c, i) => {
        const meta = ALUMNI_STATUS_META[c.outreach_status] || { label: c.outreach_status, color: '#6b7280', bg: '#f3f4f6' };
        const lastTouch = c.last_response_at || c.touch3_sent_at || c.touch2_sent_at || c.touch1_sent_at;
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—';
        return (
          <div
            key={c.id}
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid #f0f0f0',
              background: '#fafafa',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: '#e9eaf0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.78rem', fontWeight: 700, color: '#64748b',
              }}>
                <User size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8375rem', color: '#111827' }}>{name}</span>
                  {lastTouch && (
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', flexShrink: 0 }}>
                      {new Date(lastTouch).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 2, fontSize: '0.73rem', color: '#9ca3af', fontFamily: 'monospace' }}>
                  {c.phone_primary || 'No phone'}
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{
                    background: meta.bg, color: meta.color,
                    fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10,
                  }}>
                    {meta.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ChapterListPanel — STATE 1
interface ChapterListPanelProps {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  chapters: ChapterEntry[];
  loading: boolean;
  syncing: boolean;
  onSync: () => void;
  onChapterClick: (entry: ChapterEntry) => void;
}

function ChapterListPanel({
  tab, onTabChange, chapters, loading, syncing, onSync, onChapterClick,
}: ChapterListPanelProps) {
  const TABS: Tab[] = ['active', 'flagged', 'unresponsive', 'handled'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header: tabs + sync */}
      {/* Tab bar — matches top-level module nav style */}
      <div style={{
        borderBottom: '1px solid #e5e7eb',
        background: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 12 }}>
          {/* Primary tab navigation */}
          <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => onTabChange(t)}
                style={{
                  padding: '11px 16px',
                  border: 'none',
                  borderBottom: tab === t ? `2px solid ${TAB_META[t].color}` : '2px solid transparent',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontWeight: tab === t ? 600 : 400,
                  fontSize: '0.8125rem',
                  color: tab === t ? TAB_META[t].color : '#6b7280',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s, border-color 0.15s',
                  marginBottom: -1,
                }}
              >
                {TAB_META[t].label}
              </button>
            ))}
          </div>
          {/* Sync button — right-aligned, compact */}
          <button
            onClick={onSync}
            disabled={syncing}
            style={{
              padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb',
              background: '#fff', color: '#374151', cursor: syncing ? 'default' : 'pointer',
              fontSize: '0.73rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
              flexShrink: 0,
            }}
          >
            {syncing
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />}
            Sync
          </button>
        </div>
      </div>

      {/* Chapter list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', gap: 8 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.8rem' }}>Loading chapters…</span>
          </div>
        ) : chapters.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: '#9ca3af', gap: 10 }}>
            <MessageSquare size={28} style={{ opacity: 0.2 }} />
            <span style={{ fontSize: '0.8rem' }}>No chapters found</span>
          </div>
        ) : (
          chapters.map((entry, i) => (
            <ChapterRow
              key={entry.chapter_id ?? `__none__${i}`}
              entry={entry}
              activeTab={tab}
              onClick={() => onChapterClick(entry)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ConvListPanel — STATE 2
interface ConvListPanelProps {
  chapterName: string | null;
  tab: Tab;
  convs: LinqConversation[];
  total: number;
  page: number;
  loading: boolean;
  selectedConvId: string | null;
  onBack: () => void;
  onConvClick: (conv: LinqConversation) => void;
  onPageChange: (p: number) => void;
  hideBackButton?: boolean;
}

function ConvListPanel({
  chapterName, tab, convs, total, page, loading, selectedConvId,
  onBack, onConvClick, onPageChange, hideBackButton,
}: ConvListPanelProps) {
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #e5e7eb', background: '#fff',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        {!hideBackButton && (
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex' }}
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chapterName ?? '(No Chapter)'}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
            {TAB_META[tab].label} · {total} conversation{total !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', gap: 8 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.8rem' }}>Loading…</span>
          </div>
        ) : convs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: '#9ca3af', gap: 10 }}>
            <MessageSquare size={28} style={{ opacity: 0.2 }} />
            <span style={{ fontSize: '0.8rem' }}>No {TAB_META[tab].label.toLowerCase()} conversations</span>
          </div>
        ) : (
          convs.map(c => (
            <ConvRow
              key={c.id}
              conv={c}
              isSelected={selectedConvId === c.id}
              onClick={() => onConvClick(c)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 0', borderTop: '1px solid #f0f0f0', flexShrink: 0,
        }}>
          <button
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            style={{
              padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff',
              cursor: page > 1 ? 'pointer' : 'default',
              color: page > 1 ? '#374151' : '#d1d5db', fontSize: '0.73rem',
            }}
          >← Prev</button>
          <span style={{ fontSize: '0.73rem', color: '#6b7280' }}>{page} / {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            style={{
              padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff',
              cursor: page < totalPages ? 'pointer' : 'default',
              color: page < totalPages ? '#374151' : '#d1d5db', fontSize: '0.73rem',
            }}
          >Next →</button>
        </div>
      )}
    </div>
  );
}

// ThreadPanel — STATE 3
interface ThreadPanelProps {
  conv: LinqConversation;
  messages: LinqMessage[];
  loadingMsgs: boolean;
  handling: boolean;
  flagging: boolean;
  isMobile: boolean;
  onBack: () => void;
  onMarkHandled: () => void;
  onFlag: () => void;
  onReplySent: () => void;
  onReplyError: (msg: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

function ThreadPanel({
  conv, messages, loadingMsgs, handling, flagging, isMobile,
  onBack, onMarkHandled, onFlag, onReplySent, onReplyError, messagesEndRef,
}: ThreadPanelProps) {
  const line = lineFor(conv.line_phone);
  const outreachMeta = conv.outreach_status ? OUTREACH_META[conv.outreach_status] : null;
  const stage = stageLabelFor(conv.touch_stage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 10, flexShrink: 0,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isMobile && (
              <button
                onClick={onBack}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex' }}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>
              {conv.contact_name ?? conv.contact_phone ?? 'Unknown'}
              {conv.grad_year && (
                <span style={{ fontWeight: 400, fontSize: '0.8rem', color: '#9ca3af', marginLeft: 5 }}>
                  &apos;{conv.grad_year}
                </span>
              )}
            </span>
            {outreachMeta && (
              <span style={{
                background: outreachMeta.bg, color: outreachMeta.text,
                fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              }}>
                {outreachMeta.label}
              </span>
            )}
            {line && (
              <span style={{
                background: line.color.bg, color: line.color.text,
                fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              }}>
                {line.label}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.73rem', color: '#6b7280', marginTop: 3 }}>
            {conv.chapter_name && <span>{conv.chapter_name}</span>}
            {line && (
              <span style={{ marginLeft: conv.chapter_name ? 8 : 0 }}>
                {conv.chapter_name ? '· ' : ''}Sending via {line.label} · {conv.line_phone}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {stage && (
            <button style={{
              padding: '5px 11px', borderRadius: 7, border: '1px solid #a5b4fc',
              background: '#eef2ff', color: '#4f46e5', cursor: 'pointer',
              fontSize: '0.73rem', fontWeight: 600,
            }}>
              {stage}
            </button>
          )}
          <button
            onClick={onFlag}
            disabled={flagging}
            style={{
              padding: '5px 11px', borderRadius: 7,
              border: `1px solid ${conv.status === 'flagged' ? '#fbbf24' : '#e5e7eb'}`,
              background: conv.status === 'flagged' ? '#fef3c7' : '#fff',
              color: conv.status === 'flagged' ? '#d97706' : '#6b7280',
              cursor: flagging ? 'default' : 'pointer',
              fontSize: '0.73rem', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {flagging
              ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
              : <Flag size={11} />}
            Flag
          </button>
          {conv.status !== 'handled' && (
            <button
              onClick={onMarkHandled}
              disabled={handling}
              style={{
                padding: '5px 11px', borderRadius: 7, border: '1px solid #bbf7d0',
                background: '#f0fdf4', color: '#16a34a',
                cursor: handling ? 'default' : 'pointer',
                fontSize: '0.73rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {handling
                ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                : <CheckCheck size={11} />}
              Mark Handled
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', background: '#fff', minHeight: 0 }}>
        {!conv.linq_chat_id ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, color: '#9ca3af' }}>
            <AlertTriangle size={24} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '0.8rem' }}>No Linq chat ID — message history unavailable</span>
          </div>
        ) : loadingMsgs ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', gap: 8 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.8rem' }}>Loading thread…</span>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem', marginTop: 40 }}>
            No messages in this conversation
          </div>
        ) : (
          <>
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <ReplyBox
        convId={conv.id}
        linqChatId={conv.linq_chat_id}
        onSent={onReplySent}
        onError={onReplyError}
      />
    </div>
  );
}

// EmptyRight — placeholder when no conversation is selected (desktop STATE 1/2)
function EmptyRight() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#9ca3af', flexDirection: 'column', gap: 10, background: '#fafafa',
    }}>
      <MessageSquare size={32} style={{ opacity: 0.2 }} />
      <span style={{ fontSize: '0.875rem' }}>Select a conversation</span>
    </div>
  );
}

// CategorySidebar — triage nav for chapter-embedded mode
interface CategorySidebarProps {
  chapterName: string | null;
  selectedCategory: ConvCategory;
  counts: Record<ConvCategory, number>;
  onSelect: (cat: ConvCategory) => void;
}

function CategorySidebar({ chapterName, selectedCategory, counts, onSelect }: CategorySidebarProps) {
  return (
    <div style={{
      width: 200, flexShrink: 0, background: '#1B2A4A',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
      borderRight: '1px solid rgba(255,255,255,0.08)',
    }}>
      {/* Chapter header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{
          fontFamily: "'Instrument Serif', serif",
          fontWeight: 700, fontSize: '0.9rem', color: '#fff',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {chapterName ?? 'Chapter'}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
          {counts.all} total conversation{counts.all !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Category items */}
      <div style={{ flex: 1, paddingTop: 6, paddingBottom: 8 }}>
        {CATEGORY_META.map(({ key, icon, label }) => {
          const isActive = selectedCategory === key;
          return (
            <CategoryItem
              key={key}
              icon={icon}
              label={label}
              count={counts[key]}
              isActive={isActive}
              onClick={() => onSelect(key)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface CategoryItemProps {
  icon: string;
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}

function CategoryItem({ icon, label, count, isActive, onClick }: CategoryItemProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '9px 14px 9px 13px',
        cursor: 'pointer',
        borderLeft: isActive ? '3px solid #C4874A' : '3px solid transparent',
        background: isActive
          ? 'rgba(196,135,74,0.25)'
          : hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{icon}</span>
        <span style={{
          fontSize: '0.775rem',
          fontWeight: isActive ? 700 : 400,
          color: '#fff',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>
      {count > 0 && (
        <span style={{
          fontSize: '0.68rem', fontWeight: 600,
          color: '#C4874A',
          background: 'rgba(196,135,74,0.18)',
          padding: '1px 6px', borderRadius: 10, flexShrink: 0, marginLeft: 4,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  initialChapterId?: string | null;
  initialChapterName?: string | null;
}

export default function ConversationsTab({ showToast, initialChapterId, initialChapterName }: Props) {
  // Navigation state
  const [tab, setTab] = useState<Tab>('active');
  const [selectedChapter, setSelectedChapter] = useState<{ id: string | null; name: string | null } | null>(null);
  const [selectedConv, setSelectedConv] = useState<LinqConversation | null>(null);

  // Category triage (only used when initialChapterId is set)
  const [selectedCategory, setSelectedCategory] = useState<ConvCategory>('needs_reply');
  const [categoryCounts, setCategoryCounts] = useState<Record<ConvCategory, number>>({
    needs_reply: 0, flagged: 0, touch1: 0, touch2: 0, touch3: 0,
    signed_up: 0, confirmed: 0, no_response: 0, handled: 0, all: 0,
  });
  const [categorySearch, setCategorySearch] = useState('');

  // Chapter data
  const [chapterEntries, setChapterEntries] = useState<ChapterEntry[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);

  // Conv list
  const [convs, setConvs] = useState<LinqConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingConvs, setLoadingConvs] = useState(false);

  // Messages
  const [messages, setMessages] = useState<LinqMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // Action states
  const [syncing, setSyncing] = useState(false);
  const [handling, setHandling] = useState(false);
  const [flagging, setFlagging] = useState(false);

  // UI
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mobile detection
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768); }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // If initialChapterId is provided, skip chapter selection and load that chapter's convs directly
  useEffect(() => {
    if (initialChapterId) {
      setSelectedChapter({ id: initialChapterId, name: initialChapterName ?? null });
      loadConvs(initialChapterId, tab, 1, selectedCategory, categorySearch);
      fetchCategoryCounts(initialChapterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialChapterId]);

  // ── Data fetchers ────────────────────────────────────────────────────────

  const loadChapterSummaries = useCallback(async () => {
    setLoadingChapters(true);
    setError(null);
    try {
      const [activeRes, flaggedRes, unrespRes] = await Promise.all([
        fetch(`${API}?mode=chapters_summary&status=active`, { headers: { Authorization: AUTH } }).then(r => r.json()),
        fetch(`${API}?mode=chapters_summary&status=flagged`, { headers: { Authorization: AUTH } }).then(r => r.json()),
        fetch(`${API}?mode=chapters_summary&status=unresponsive`, { headers: { Authorization: AUTH } }).then(r => r.json()),
      ]);

      const map = new Map<string, ChapterEntry>();

      function processTab(rows: ChapterApiRow[], tabKey: 'active' | 'flagged' | 'unresponsive') {
        for (const c of (rows || [])) {
          const key = c.chapter_id ?? '__none__';
          const existing = map.get(key);
          if (!existing) {
            map.set(key, {
              chapter_id: c.chapter_id,
              chapter_name: c.chapter_name,
              counts: { active: 0, flagged: 0, unresponsive: 0 },
            });
          }
          map.get(key)!.counts[tabKey] = c.count;
        }
      }

      processTab(activeRes.chapters, 'active');
      processTab(flaggedRes.chapters, 'flagged');
      processTab(unrespRes.chapters, 'unresponsive');

      const entries = [...map.values()].sort((a, b) => {
        const totalA = a.counts.active + a.counts.flagged + a.counts.unresponsive;
        const totalB = b.counts.active + b.counts.flagged + b.counts.unresponsive;
        return totalB - totalA;
      });

      setChapterEntries(entries);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingChapters(false);
    }
  }, []);

  const loadConvs = useCallback(async (
    chapterId: string | null,
    currentTab: Tab,
    currentPage: number,
    category?: ConvCategory,
    search?: string,
  ) => {
    setLoadingConvs(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(LIMIT),
      });
      if (chapterId) params.set('chapter_id', chapterId);

      if (category && category !== 'all') {
        params.set('category', category);
      } else if (!category) {
        params.set('status', currentTab);
      }
      // category=all → no status or category param → API returns all

      if (search && search.trim()) {
        params.set('search', search.trim());
      }

      const res = await fetch(`${API}?${params}`, { headers: { Authorization: AUTH } });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load conversations');
        return;
      }
      setConvs(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoadingConvs(false);
    }
  }, []);

  const fetchCategoryCounts = useCallback(async (chapterId: string) => {
    try {
      // Fetch linq_conversations counts
      const res = await fetch(`${API}?mode=category_counts&chapter_id=${chapterId}`, {
        headers: { Authorization: AUTH },
      });
      const json = await res.json();
      const linqCounts: Record<ConvCategory, number> = res.ok && json.counts
        ? json.counts
        : { needs_reply: 0, flagged: 0, touch1: 0, touch2: 0, touch3: 0, signed_up: 0, confirmed: 0, no_response: 0, handled: 0, all: 0 };

      // Fetch alumni_contacts counts for status-based categories
      if (supabase) {
        const { data: alumniRows } = await supabase
          .from('alumni_contacts')
          .select('outreach_status')
          .eq('chapter_id', chapterId);

        if (alumniRows) {
          const touch1Count  = alumniRows.filter(r => r.outreach_status === 'touch1_sent').length;
          const touch2Count  = alumniRows.filter(r => r.outreach_status === 'touch2_sent').length;
          const touch3Count  = alumniRows.filter(r => r.outreach_status === 'touch3_sent').length;
          const signedUpCount = alumniRows.filter(r => r.outreach_status === 'signed_up').length;
          const confirmedCount = alumniRows.filter(r => r.outreach_status === 'touch1_confirmed').length;
          const handledCount = alumniRows.filter(r => r.outreach_status === 'declined').length;

          setCategoryCounts({
            ...linqCounts,
            touch1: touch1Count,
            touch2: touch2Count,
            touch3: touch3Count,
            signed_up: signedUpCount,
            confirmed: confirmedCount,
            handled: handledCount || linqCounts.handled,
          });
          return;
        }
      }

      setCategoryCounts(linqCounts);
    } catch {
      // silently fail — counts are non-critical
    }
  }, []);

  // On mount: load chapters + background sync
  useEffect(() => {
    loadChapterSummaries();
    fetch(`${API}/sync`, { method: 'POST', headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(json => { if (json.data?.processed) loadChapterSummaries(); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On tab change: reload chapter summaries + reload convs if a chapter is selected (global mode only)
  useEffect(() => {
    if (!initialChapterId) {
      loadChapterSummaries();
      if (selectedChapter !== null) {
        setPage(1);
        setSelectedConv(null);
        loadConvs(selectedChapter.id, tab, 1);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // On chapter or page change: reload convs
  useEffect(() => {
    if (selectedChapter !== null) {
      if (initialChapterId) {
        loadConvs(selectedChapter.id, tab, page, selectedCategory, categorySearch);
      } else {
        loadConvs(selectedChapter.id, tab, page);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChapter, page]);

  // Load messages on conversation select
  useEffect(() => {
    if (!selectedConv) { setMessages([]); return; }
    setMessages([]);
    setLoadingMsgs(true);
    fetch(`${API}/${selectedConv.id}/messages`, { headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(json => {
        if (json.error) setError(json.error);
        else setMessages(json.data ?? []);
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoadingMsgs(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv?.id]);

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleTabChange(t: Tab) {
    setTab(t);
    setSelectedConv(null);
  }

  function handleCategoryChange(cat: ConvCategory) {
    setSelectedCategory(cat);
    setSelectedConv(null);
    setPage(1);
    setCategorySearch('');
    if (selectedChapter) {
      loadConvs(selectedChapter.id, tab, 1, cat, '');
    }
  }

  function handleCategorySearch(search: string) {
    setCategorySearch(search);
    setPage(1);
    setSelectedConv(null);
    if (selectedChapter) {
      loadConvs(selectedChapter.id, tab, 1, selectedCategory, search);
    }
  }

  function handleChapterClick(entry: ChapterEntry) {
    setSelectedChapter({ id: entry.chapter_id, name: entry.chapter_name });
    setSelectedConv(null);
    setPage(1);
    loadConvs(entry.chapter_id, tab, 1);
  }

  function handleBackToChapters() {
    setSelectedChapter(null);
    setSelectedConv(null);
    setConvs([]);
    setTotal(0);
  }

  function handleBackToConvs() {
    setSelectedConv(null);
  }

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API}/sync`, { method: 'POST', headers: { Authorization: AUTH } });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Sync failed', 'error');
      } else {
        showToast(`Synced ${json.data?.processed ?? 0} conversations`, 'success');
        if (initialChapterId) {
          fetchCategoryCounts(initialChapterId);
          if (selectedChapter !== null) loadConvs(selectedChapter.id, tab, page, selectedCategory, categorySearch);
        } else {
          loadChapterSummaries();
          if (selectedChapter !== null) loadConvs(selectedChapter.id, tab, page);
        }
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setSyncing(false);
    }
  }

  async function handleMarkHandled() {
    if (!selectedConv || handling) return;
    setHandling(true);
    try {
      const res = await fetch(`${API}/${selectedConv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ status: 'handled' }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Failed', 'error');
      } else {
        showToast('Marked as handled', 'success');
        setSelectedConv(null);
        if (initialChapterId) {
          fetchCategoryCounts(initialChapterId);
          if (selectedChapter !== null) loadConvs(selectedChapter.id, tab, page, selectedCategory, categorySearch);
        } else {
          loadChapterSummaries();
          if (selectedChapter !== null) loadConvs(selectedChapter.id, tab, page);
        }
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setHandling(false);
    }
  }

  async function handleFlag() {
    if (!selectedConv || flagging) return;
    setFlagging(true);
    try {
      const res = await fetch(`${API}/${selectedConv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ status: 'flagged' }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Failed', 'error');
      } else {
        showToast('Flagged', 'info');
        setSelectedConv(prev => prev ? { ...prev, status: 'flagged' } : null);
        if (initialChapterId) {
          fetchCategoryCounts(initialChapterId);
          if (selectedChapter !== null) loadConvs(selectedChapter.id, tab, page, selectedCategory, categorySearch);
        } else {
          loadChapterSummaries();
          if (selectedChapter !== null) loadConvs(selectedChapter.id, tab, page);
        }
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setFlagging(false);
    }
  }

  function handleReplySent() {
    showToast('Reply sent', 'success');
    if (selectedConv) {
      setLoadingMsgs(true);
      fetch(`${API}/${selectedConv.id}/messages`, { headers: { Authorization: AUTH } })
        .then(r => r.json())
        .then(json => { setMessages(json.data ?? []); })
        .finally(() => setLoadingMsgs(false));
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 220px)',
    minHeight: 520,
    maxHeight: '90vh',
    overflow: 'hidden',
  };

  const errorBanner = error ? (
    <div style={{
      padding: '8px 18px', background: '#fee2e2', color: '#991b1b',
      fontSize: '0.8rem', borderBottom: '1px solid #fca5a5', flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <AlertTriangle size={14} />
      {error}
      <button
        onClick={() => setError(null)}
        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', padding: 0 }}
      >
        ✕
      </button>
    </div>
  ) : null;

  // ── Embedded chapter triage workspace (initialChapterId is set) ────────────
  // Categories that pull from alumni_contacts instead of linq_conversations
  const isAlumniCategory = (cat: ConvCategory) =>
    ['touch1', 'touch2', 'touch3', 'signed_up', 'confirmed', 'handled'].includes(cat);

  if (initialChapterId && selectedChapter) {
    const convListContent = (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Search bar */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', flexShrink: 0, background: '#fff' }}>
          <input
            type="text"
            value={categorySearch}
            onChange={e => handleCategorySearch(e.target.value)}
            placeholder={isAlumniCategory(selectedCategory) ? 'Search contacts…' : 'Search conversations…'}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 12px', borderRadius: 8,
              border: '1.5px solid #e5e7eb', fontSize: '0.8125rem',
              outline: 'none', fontFamily: 'inherit', color: '#111827',
            }}
          />
        </div>

        {/* Alumni contacts list for status-based categories */}
        {isAlumniCategory(selectedCategory) ? (
          <AlumniContactsList
            chapterId={selectedChapter.id ?? ''}
            category={selectedCategory}
            search={categorySearch}
          />
        ) : (
        /* Conv list */
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConvs ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', gap: 8 }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '0.8rem' }}>Loading…</span>
            </div>
          ) : convs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: '#9ca3af', gap: 10 }}>
              <MessageSquare size={28} style={{ opacity: 0.2 }} />
              <span style={{ fontSize: '0.8rem' }}>No conversations</span>
            </div>
          ) : (
            convs.map(c => (
              <ConvRow
                key={c.id}
                conv={c}
                isSelected={selectedConv?.id === c.id}
                onClick={() => setSelectedConv(c)}
              />
            ))
          )}
        </div>
        )}

        {/* Pagination — only for linq conversation categories */}
        {!isAlumniCategory(selectedCategory) && Math.ceil(total / LIMIT) > 1 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 0', borderTop: '1px solid #f0f0f0', flexShrink: 0,
          }}>
            <button
              disabled={page === 1}
              onClick={() => { setPage(p => p - 1); loadConvs(selectedChapter.id, tab, page - 1, selectedCategory, categorySearch); }}
              style={{
                padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff',
                cursor: page > 1 ? 'pointer' : 'default',
                color: page > 1 ? '#374151' : '#d1d5db', fontSize: '0.73rem',
              }}
            >← Prev</button>
            <span style={{ fontSize: '0.73rem', color: '#6b7280' }}>{page} / {Math.ceil(total / LIMIT)}</span>
            <button
              disabled={page === Math.ceil(total / LIMIT)}
              onClick={() => { setPage(p => p + 1); loadConvs(selectedChapter.id, tab, page + 1, selectedCategory, categorySearch); }}
              style={{
                padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff',
                cursor: page < Math.ceil(total / LIMIT) ? 'pointer' : 'default',
                color: page < Math.ceil(total / LIMIT) ? '#374151' : '#d1d5db', fontSize: '0.73rem',
              }}
            >Next →</button>
          </div>
        )}
      </div>
    );

    const threadPanelEmbedded = selectedConv ? (
      <ThreadPanel
        conv={selectedConv}
        messages={messages}
        loadingMsgs={loadingMsgs}
        handling={handling}
        flagging={flagging}
        isMobile={isMobile}
        onBack={() => setSelectedConv(null)}
        onMarkHandled={handleMarkHandled}
        onFlag={handleFlag}
        onReplySent={handleReplySent}
        onReplyError={msg => setError(msg)}
        messagesEndRef={messagesEndRef as React.RefObject<HTMLDivElement>}
      />
    ) : null;

    // Mobile: single panel at a time
    if (isMobile) {
      if (selectedConv && threadPanelEmbedded) {
        return (
          <div style={containerStyle}>
            {errorBanner}
            {threadPanelEmbedded}
          </div>
        );
      }
      return (
        <div style={containerStyle}>
          {errorBanner}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <CategorySidebar
              chapterName={selectedChapter.name}
              selectedCategory={selectedCategory}
              counts={categoryCounts}
              onSelect={handleCategoryChange}
            />
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {convListContent}
            </div>
          </div>
        </div>
      );
    }

    // Desktop: sidebar + conv list + thread panel
    return (
      <div style={containerStyle}>
        {errorBanner}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Category sidebar */}
          <CategorySidebar
            chapterName={selectedChapter.name}
            selectedCategory={selectedCategory}
            counts={categoryCounts}
            onSelect={handleCategoryChange}
          />

          {/* Conv list — fixed width */}
          <div style={{
            width: 300, flexShrink: 0, borderRight: '1px solid #e5e7eb',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            {convListContent}
          </div>

          {/* Thread panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {selectedConv && threadPanelEmbedded ? threadPanelEmbedded : <EmptyRight />}
          </div>
        </div>
      </div>
    );
  }

  // ── Global mode (no initialChapterId) ──────────────────────────────────────

  const chapterListPanel = (
    <ChapterListPanel
      tab={tab}
      onTabChange={handleTabChange}
      chapters={chapterEntries}
      loading={loadingChapters}
      syncing={syncing}
      onSync={handleSync}
      onChapterClick={handleChapterClick}
    />
  );

  const convListPanel = selectedChapter ? (
    <ConvListPanel
      chapterName={selectedChapter.name}
      tab={tab}
      convs={convs}
      total={total}
      page={page}
      loading={loadingConvs}
      selectedConvId={selectedConv?.id ?? null}
      onBack={handleBackToChapters}
      onConvClick={setSelectedConv}
      onPageChange={p => setPage(p)}
      hideBackButton={false}
    />
  ) : null;

  const threadPanel = selectedConv ? (
    <ThreadPanel
      conv={selectedConv}
      messages={messages}
      loadingMsgs={loadingMsgs}
      handling={handling}
      flagging={flagging}
      isMobile={isMobile}
      onBack={handleBackToConvs}
      onMarkHandled={handleMarkHandled}
      onFlag={handleFlag}
      onReplySent={handleReplySent}
      onReplyError={msg => setError(msg)}
      messagesEndRef={messagesEndRef as React.RefObject<HTMLDivElement>}
    />
  ) : null;

  // ── Mobile: one panel at a time ────────────────────────────────────────────
  if (isMobile) {
    if (selectedConv && threadPanel) {
      return (
        <div style={containerStyle}>
          {errorBanner}
          {threadPanel}
        </div>
      );
    }
    if (selectedChapter && convListPanel) {
      return (
        <div style={containerStyle}>
          {errorBanner}
          {convListPanel}
        </div>
      );
    }
    return (
      <div style={containerStyle}>
        {errorBanner}
        {chapterListPanel}
      </div>
    );
  }

  // ── Desktop: two-panel layout ──────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      {errorBanner}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Left panel: 40% */}
        <div style={{
          width: '40%', flexShrink: 0, borderRight: '1px solid #e5e7eb',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          {selectedChapter ? convListPanel : chapterListPanel}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {selectedConv && threadPanel ? threadPanel : <EmptyRight />}
        </div>
      </div>
    </div>
  );
}
