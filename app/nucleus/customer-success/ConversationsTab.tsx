'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  MessageSquare, RefreshCw, CheckCheck, Flag,
  Loader2, Send, User, ChevronLeft, AlertTriangle, Search,
} from 'lucide-react';
import { INTERNAL_AUTH_HEADER } from '@/lib/internal-auth';

// ── Constants ──────────────────────────────────────────────────────────────

const AUTH = INTERNAL_AUTH_HEADER;
const API = '/api/conversations';

const LINES: { phone: string; label: string; color: { bg: string; text: string } }[] = [
  { phone: '+16462101111', label: 'Owen',   color: { bg: '#dbeafe', text: '#1d4ed8' } },
  { phone: '+16462178274', label: 'Adam',   color: { bg: '#d1fae5', text: '#065f46' } },
  { phone: '+16462442696', label: 'Ford',   color: { bg: '#ede9fe', text: '#7c3aed' } },
  { phone: '+14044239427', label: 'Line 4', color: { bg: '#fef3c7', text: '#b45309' } },
  { phone: '+14045428435', label: 'Line 5', color: { bg: '#fee2e2', text: '#991b1b' } },
  { phone: '+19725590427', label: 'Line 6', color: { bg: '#f0fdf4', text: '#166534' } },
  { phone: '+19725590438', label: 'Line 7', color: { bg: '#fdf4ff', text: '#7e22ce' } },
  { phone: '+15042234218', label: 'Line 8', color: { bg: '#fff7ed', text: '#c2410c' } },
  { phone: '+15042236050', label: 'Line 9', color: { bg: '#f0f9ff', text: '#0369a1' } },
];

const LINQ_LINE_PHONES = new Set(LINES.map(l => l.phone));

// ── Types ──────────────────────────────────────────────────────────────────

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

type FilterKey = 'all' | 'needs_reply' | 'touch1' | 'confirmed' | 'touch2' | 'handled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'needs_reply', label: 'Needs Reply' },
  { key: 'touch1',      label: 'T1 Pending' },
  { key: 'confirmed',   label: 'T1 Confirmed' },
  { key: 'touch2',      label: 'T2 Sent' },
  { key: 'handled',     label: 'Handled' },
];

const OUTREACH_META: Record<string, { bg: string; text: string; label: string }> = {
  touch1_confirmed: { bg: '#fef3c7', text: '#b45309',  label: 'T1 Confirmed' },
  touch1_sent:      { bg: '#dbeafe', text: '#1d4ed8',  label: 'T1 Sent' },
  touch2_sent:      { bg: '#fef9c3', text: '#854d0e',  label: 'T2 Sent' },
  touch3_sent:      { bg: '#fee2e2', text: '#991b1b',  label: 'T3 Sent' },
  signed_up:        { bg: '#d1fae5', text: '#065f46',  label: 'Signed Up' },
  no_response:      { bg: '#f3f4f6', text: '#6b7280',  label: 'No Response' },
  pitched:          { bg: '#dbeafe', text: '#1d4ed8',  label: 'Pitched' },
};

// ── Client-side filter ────────────────────────────────────────────────────

/**
 * Applies the tab filter on top of whatever the server already returned.
 * This ensures tabs work even if server-side filtering is incomplete.
 */
function applyClientFilter(convs: LinqConversation[], filter: FilterKey): LinqConversation[] {
  switch (filter) {
    case 'all':
      return convs;

    case 'needs_reply':
      return convs.filter(
        c => c.has_unread_reply || c.last_message_direction === 'inbound'
      );

    case 'touch1':
      // T1 Pending: touch1 sent but not yet confirmed — still active
      return convs.filter(
        c =>
          c.status === 'active' &&
          (
            c.outreach_status === 'touch1_sent' ||
            c.touch_stage === 'T1'
          )
      );

    case 'confirmed':
      // T1 Confirmed
      return convs.filter(
        c =>
          c.outreach_status === 'touch1_confirmed' ||
          c.touch_stage === 'confirmed'
      );

    case 'touch2':
      // T2 Sent
      return convs.filter(
        c =>
          c.status === 'active' &&
          (
            c.outreach_status === 'touch2_sent' ||
            c.touch_stage === 'T2'
          )
      );

    case 'handled':
      return convs.filter(
        c => c.status === 'handled' || c.status === 'archived'
      );

    default:
      return convs;
  }
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

// ── ConvRow ────────────────────────────────────────────────────────────────

interface ConvRowProps {
  conv: LinqConversation;
  isSelected: boolean;
  onClick: () => void;
}

function ConvRow({ conv, isSelected, onClick }: ConvRowProps) {
  const [hovered, setHovered] = useState(false);
  const line = lineFor(conv.line_phone);
  const preview = (conv.last_message_text ?? '').slice(0, 80) +
    ((conv.last_message_text?.length ?? 0) > 80 ? '…' : '');
  const outreachMeta = conv.outreach_status ? OUTREACH_META[conv.outreach_status] : null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 14px',
        cursor: 'pointer',
        borderBottom: '1px solid #E5E7EB',
        background: isSelected ? '#EFF6FF' : hovered ? '#F9FAFB' : '#fff',
        borderLeft: `3px solid ${conv.has_unread_reply ? '#10B981' : isSelected ? '#0F172A' : 'transparent'}`,
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
          background: line ? line.color.bg : '#E9EAF0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.8rem', fontWeight: 700,
          color: line ? line.color.text : '#64748B',
          position: 'relative',
        }}>
          {conv.contact_name ? initials(conv.contact_name) : <User size={14} />}
          {conv.has_unread_reply && (
            <div style={{
              position: 'absolute', top: -2, right: -2,
              width: 10, height: 10, borderRadius: '50%',
              background: '#10B981', border: '2px solid #fff',
            }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: name + timestamp */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <span style={{
              fontWeight: conv.has_unread_reply ? 700 : 600,
              fontSize: '0.875rem', color: '#111827',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {conv.contact_name ?? conv.contact_phone ?? 'Unknown'}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#9CA3AF', flexShrink: 0 }}>
              {formatTime(conv.last_message_at)}
            </span>
          </div>

          {/* Row 1b: chapter name */}
          {conv.chapter_name && (
            <div style={{
              fontSize: '0.72rem', color: '#6B7280', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {conv.chapter_name}
            </div>
          )}

          {/* Row 2: message preview */}
          <div style={{
            marginTop: 2, fontSize: '0.75rem', color: '#9CA3AF',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {preview
              ? <>{conv.last_message_direction === 'inbound' ? '' : '→ '}{preview}</>
              : <span style={{ fontStyle: 'italic' }}>No messages yet</span>
            }
          </div>

          {/* Row 3: status badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
            {outreachMeta && (
              <span style={{
                background: outreachMeta.bg, color: outreachMeta.text,
                fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10,
              }}>
                {outreachMeta.label}
              </span>
            )}
            {line && (
              <span style={{
                background: line.color.bg, color: line.color.text,
                fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10,
              }}>
                {line.label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MessageBubble ──────────────────────────────────────────────────────────

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
      alignItems: isOutbound ? 'flex-end' : 'flex-start',
      marginBottom: 10,
    }}>
      <div style={{
        maxWidth: '70%', padding: '10px 14px',
        borderRadius: isOutbound ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isOutbound ? '#0F172A' : '#F3F4F6',
        color: isOutbound ? '#fff' : '#111827',
        fontSize: '0.875rem', lineHeight: 1.5,
        wordBreak: 'break-word',
      }}>
        {text || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>(media / attachment)</span>}
      </div>
      <span style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: 3, padding: '0 4px' }}>
        {time}
      </span>
    </div>
  );
}

// ── ReplyBox ───────────────────────────────────────────────────────────────

interface ReplyBoxProps {
  convId: string;
  linqChatId: string | null;
  onSent: (text: string) => void;
  onError: (msg: string) => void;
}

function ReplyBox({ convId, linqChatId, onSent, onError }: ReplyBoxProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

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
      else { setText(''); onSent(msg); }
    } catch (err) {
      onError(String(err));
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(text.trim()) && Boolean(linqChatId) && !sending;

  return (
    <div style={{
      padding: '12px 14px', borderTop: '1px solid #E5E7EB',
      background: '#fff', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend(); }}
          placeholder={linqChatId ? 'Type a reply… (⌘↵ to send)' : 'No Linq chat — cannot reply'}
          disabled={!linqChatId || sending}
          rows={2}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 10,
            border: '1.5px solid #E5E7EB', fontSize: '0.875rem',
            lineHeight: '1.5', resize: 'none', outline: 'none',
            fontFamily: 'inherit', color: '#111827',
            background: !linqChatId ? '#F9FAFB' : '#fff',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            padding: '10px 14px', borderRadius: 10, border: 'none',
            background: canSend ? '#0F172A' : '#E5E7EB',
            color: canSend ? '#fff' : '#9CA3AF',
            cursor: canSend ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 5,
            fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.15s',
            flexShrink: 0,
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

// ── ThreadPanel ────────────────────────────────────────────────────────────

interface ThreadPanelProps {
  conv: LinqConversation;
  messages: LinqMessage[];
  loadingMsgs: boolean;
  handling: boolean;
  flagging: boolean;
  isMobile: boolean;
  chapterJoinLink: string | null;
  onBack: () => void;
  onMarkHandled: () => void;
  onFlag: () => void;
  onReplySent: (text: string) => void;
  onReplyError: (msg: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

function ThreadPanel({
  conv, messages, loadingMsgs, handling, flagging, isMobile, chapterJoinLink,
  onBack, onMarkHandled, onFlag, onReplySent, onReplyError, messagesEndRef,
}: ThreadPanelProps) {
  const line = lineFor(conv.line_phone);
  const outreachMeta = conv.outreach_status ? OUTREACH_META[conv.outreach_status] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #E5E7EB', background: '#fff',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 10, flexShrink: 0,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isMobile && (
              <button
                onClick={onBack}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 0, display: 'flex' }}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>
              {conv.contact_name ?? conv.contact_phone ?? 'Unknown'}
              {conv.grad_year && (
                <span style={{ fontWeight: 400, fontSize: '0.8rem', color: '#9CA3AF', marginLeft: 5 }}>
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
            {conv.status === 'handled' && (
              <span style={{
                background: '#D1FAE5', color: '#065F46',
                fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10,
              }}>
                ✓ Handled
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.73rem', color: '#6B7280', marginTop: 3 }}>
            {conv.contact_phone && <span style={{ fontFamily: 'monospace' }}>{conv.contact_phone}</span>}
            {conv.chapter_name && <span> · {conv.chapter_name}</span>}
            {line && <span> · via {line.label}</span>}
          </div>
          {chapterJoinLink && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>Join link:</span>
              <a
                href={chapterJoinLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.7rem', color: '#2563EB', fontFamily: 'monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: 240, display: 'inline-block',
                }}
              >{chapterJoinLink}</a>
              <button
                onClick={() => navigator.clipboard.writeText(chapterJoinLink)}
                style={{
                  padding: '1px 7px', borderRadius: 5, border: '1px solid #E5E7EB',
                  background: '#F9FAFB', color: '#374151', fontSize: '0.65rem',
                  cursor: 'pointer', fontWeight: 500, flexShrink: 0,
                }}
              >Copy</button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onFlag}
            disabled={flagging}
            title={conv.status === 'flagged' ? 'Unflag' : 'Flag'}
            style={{
              padding: '5px 10px', borderRadius: 7,
              border: `1px solid ${conv.status === 'flagged' ? '#FCD34D' : '#E5E7EB'}`,
              background: conv.status === 'flagged' ? '#FEF3C7' : '#fff',
              color: conv.status === 'flagged' ? '#D97706' : '#6B7280',
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
          {conv.status !== 'handled' ? (
            <button
              onClick={onMarkHandled}
              disabled={handling}
              style={{
                padding: '5px 10px', borderRadius: 7,
                border: '1px solid #BBF7D0',
                background: '#F0FDF4', color: '#16A34A',
                cursor: handling ? 'default' : 'pointer',
                fontSize: '0.73rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {handling
                ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                : <CheckCheck size={11} />}
              Done
            </button>
          ) : (
            <button
              disabled
              style={{
                padding: '5px 10px', borderRadius: 7,
                border: '1px solid #D1FAE5',
                background: '#F0FDF4', color: '#9CA3AF',
                cursor: 'default',
                fontSize: '0.73rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <CheckCheck size={11} />
              Done
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', background: '#F9FAFB', minHeight: 0 }}>
        {!conv.linq_chat_id ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, color: '#9CA3AF' }}>
            <AlertTriangle size={24} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '0.8rem' }}>No Linq chat ID — message history unavailable</span>
          </div>
        ) : loadingMsgs ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF', gap: 8 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.8rem' }}>Loading thread…</span>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '0.8rem', marginTop: 40 }}>
            No messages yet
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

// ── EmptyRight ─────────────────────────────────────────────────────────────

function EmptyRight() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#9CA3AF', flexDirection: 'column', gap: 10, background: '#F9FAFB',
    }}>
      <MessageSquare size={32} style={{ opacity: 0.2 }} />
      <span style={{ fontSize: '0.875rem' }}>Select a conversation</span>
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
  const [filter, setFilter] = useState<FilterKey>('all');
  const [convs, setConvs] = useState<LinqConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [selectedConv, setSelectedConv] = useState<LinqConversation | null>(null);
  const [messages, setMessages] = useState<LinqMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [chapterJoinLink, setChapterJoinLink] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [handling, setHandling] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [search, setSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Suppress unused variable warning for initialChapterName
  void initialChapterName;

  const LIMIT = 50;

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768); }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Debounce search input
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [search]);

  // ── Load conversations ──────────────────────────────────────────────────

  const loadConvs = useCallback(async (currentFilter: FilterKey, currentPage: number) => {
    setLoadingConvs(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(LIMIT),
        status: 'all',
      });
      if (initialChapterId) params.set('chapter_id', initialChapterId);
      if (currentFilter !== 'all') params.set('category', currentFilter);

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
  }, [initialChapterId]);

  // ── Silent background refresh (no loading flash, preserves selection) ──

  const loadConvsSilent = useCallback(async (
    currentFilter: FilterKey,
    currentPage: number,
    keepSelectedId?: string,
  ) => {
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(LIMIT),
        status: 'all',
      });
      if (initialChapterId) params.set('chapter_id', initialChapterId);
      if (currentFilter !== 'all') params.set('category', currentFilter);

      const res = await fetch(`${API}?${params}`, { headers: { Authorization: AUTH } });
      if (!res.ok) return;
      const json = await res.json();
      const newConvs: LinqConversation[] = json.data ?? [];
      setConvs(newConvs);
      setTotal(json.total ?? 0);
      if (keepSelectedId) {
        const fresh = newConvs.find(c => c.id === keepSelectedId);
        if (fresh) setSelectedConv(fresh);
      }
    } catch {
      // silent — don't surface errors from background refresh
    }
  }, [initialChapterId]);

  useEffect(() => {
    loadConvs(filter, 1);
    setPage(1);
    setSelectedConv(null);
  }, [filter, loadConvs]);

  // ── Load messages on conversation select ───────────────────────────────

  useEffect(() => {
    if (!selectedConv) { setMessages([]); setChapterJoinLink(null); return; }
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

    if (selectedConv.chapter_id) {
      fetch(`/api/chapters/${selectedConv.chapter_id}`, { headers: { Authorization: AUTH } })
        .then(r => r.json())
        .then(json => setChapterJoinLink(json?.data?.alumni_join_link ?? null))
        .catch(() => setChapterJoinLink(null));
    } else {
      setChapterJoinLink(null);
    }
  }, [selectedConv?.id]);

  // Scroll to bottom on message load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  // ── Handlers ──────────────────────────────────────────────────────────

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
        loadConvs(filter, page);
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
        showToast('Marked as handled ✓', 'success');
        // Update in-place: keep conversation selected, just update status badge
        const updated = { ...selectedConv, status: 'handled' as const };
        setSelectedConv(updated);
        setConvs(prev => prev.map(c => c.id === selectedConv.id ? updated : c));
        // Background refresh after 1.5s
        setTimeout(() => loadConvsSilent(filter, page, selectedConv.id), 1500);
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
      const newStatus = selectedConv.status === 'flagged' ? 'active' : 'flagged';
      const res = await fetch(`${API}/${selectedConv.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? 'Failed', 'error');
      } else {
        showToast(newStatus === 'flagged' ? 'Flagged' : 'Unflagged', 'info');
        setSelectedConv(prev => prev ? { ...prev, status: newStatus as LinqConversation['status'] } : null);
        loadConvs(filter, page);
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setFlagging(false);
    }
  }

  function handleReplySent(sentText: string) {
    showToast('Reply sent ✓', 'success');
    const now = new Date().toISOString();
    if (selectedConv) {
      // Update in-place: don't reload the whole list
      const updated: LinqConversation = {
        ...selectedConv,
        last_message_at: now,
        last_message_direction: 'outbound',
        has_unread_reply: false,
        last_message_text: sentText,
      };
      setSelectedConv(updated);
      setConvs(prev => prev.map(c => c.id === selectedConv.id ? updated : c));
      // Reload thread messages
      setLoadingMsgs(true);
      fetch(`${API}/${selectedConv.id}/messages`, { headers: { Authorization: AUTH } })
        .then(r => r.json())
        .then(json => setMessages(json.data ?? []))
        .finally(() => setLoadingMsgs(false));
      // Background refresh after 2s (non-disruptive)
      const currentSelectedId = selectedConv.id;
      setTimeout(() => loadConvsSilent(filter, page, currentSelectedId), 2000);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────

  // Client-side filter on top of server results
  const filterPassedConvs = applyClientFilter(convs, filter);

  // Client-side search filter (debounced)
  const filteredConvs = debouncedSearch
    ? filterPassedConvs.filter(c => {
        const q = debouncedSearch.toLowerCase();
        return (
          (c.contact_name ?? '').toLowerCase().includes(q) ||
          (c.contact_phone ?? '').toLowerCase().includes(q) ||
          (c.chapter_name ?? '').toLowerCase().includes(q) ||
          (c.last_message_text ?? '').toLowerCase().includes(q)
        );
      })
    : filterPassedConvs;

  // Live count badges per filter (client-side, from full convs array)
  const counts = Object.fromEntries(
    FILTERS.map(f => [f.key, applyClientFilter(convs, f.key).length])
  ) as Record<FilterKey, number>;

  const totalPages = Math.ceil(total / LIMIT);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 220px)',
    minHeight: 520,
    maxHeight: '90vh',
    overflow: 'hidden',
    background: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: 12,
  };

  // Error banner
  const errorBanner = error ? (
    <div style={{
      padding: '8px 16px', background: '#FEE2E2', color: '#991B1B',
      fontSize: '0.8rem', borderBottom: '1px solid #FCA5A5', flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <AlertTriangle size={14} />
      {error}
      <button
        onClick={() => setError(null)}
        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', padding: 0 }}
      >✕</button>
    </div>
  ) : null;

  // Filter + sync bar
  const filterBar = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
      borderBottom: '1px solid #E5E7EB', background: '#fff',
      flexShrink: 0, overflowX: 'auto',
    }}>
      <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'nowrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '5px 10px', borderRadius: 999, fontSize: '0.75rem', cursor: 'pointer',
              border: filter === f.key ? '1px solid #0F172A' : '1px solid #E5E7EB',
              background: filter === f.key ? '#0F172A' : '#fff',
              color: filter === f.key ? '#fff' : '#6B7280',
              fontWeight: filter === f.key ? 600 : 400,
              whiteSpace: 'nowrap', transition: 'all 0.1s',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 16, height: 16, borderRadius: 999,
                background: filter === f.key ? 'rgba(255,255,255,0.25)' : '#F3F4F6',
                color: filter === f.key ? '#fff' : '#374151',
                fontSize: '0.65rem', fontWeight: 700, padding: '0 4px',
              }}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>
      <button
        onClick={handleSync}
        disabled={syncing}
        style={{
          padding: '5px 10px', borderRadius: 7, border: '1px solid #E5E7EB',
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
  );

  // Search bar
  const searchBar = (
    <div style={{
      padding: '8px 14px', borderBottom: '1px solid #E5E7EB', background: '#fff', flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 10px',
      }}>
        <Search size={13} style={{ color: '#9CA3AF', flexShrink: 0 }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, phone, chapter…"
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: '0.8rem', color: '#111827', fontFamily: 'inherit',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, fontSize: '0.75rem' }}
          >✕</button>
        )}
      </div>
    </div>
  );

  // Conversation list panel
  const convListPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {filterBar}
      {searchBar}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loadingConvs ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9CA3AF', gap: 8 }}>
            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.8rem' }}>Loading…</span>
          </div>
        ) : filteredConvs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: '#9CA3AF', gap: 10 }}>
            <MessageSquare size={28} style={{ opacity: 0.2 }} />
            <span style={{ fontSize: '0.8rem' }}>{debouncedSearch ? 'No results' : 'No conversations'}</span>
          </div>
        ) : (
          filteredConvs.map(c => (
            <ConvRow
              key={c.id}
              conv={c}
              isSelected={selectedConv?.id === c.id}
              onClick={() => setSelectedConv(c)}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 0', borderTop: '1px solid #E5E7EB', flexShrink: 0, background: '#fff',
        }}>
          <button
            disabled={page === 1}
            onClick={() => { const p = page - 1; setPage(p); loadConvs(filter, p); }}
            style={{
              padding: '3px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff',
              cursor: page > 1 ? 'pointer' : 'default',
              color: page > 1 ? '#374151' : '#D1D5DB', fontSize: '0.73rem',
            }}
          >← Prev</button>
          <span style={{ fontSize: '0.73rem', color: '#6B7280' }}>{page} / {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => { const p = page + 1; setPage(p); loadConvs(filter, p); }}
            style={{
              padding: '3px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff',
              cursor: page < totalPages ? 'pointer' : 'default',
              color: page < totalPages ? '#374151' : '#D1D5DB', fontSize: '0.73rem',
            }}
          >Next →</button>
        </div>
      )}
    </div>
  );

  // Thread panel
  const threadPanel = selectedConv ? (
    <ThreadPanel
      conv={selectedConv}
      messages={messages}
      loadingMsgs={loadingMsgs}
      handling={handling}
      flagging={flagging}
      isMobile={isMobile}
      chapterJoinLink={chapterJoinLink}
      onBack={() => setSelectedConv(null)}
      onMarkHandled={handleMarkHandled}
      onFlag={handleFlag}
      onReplySent={handleReplySent}
      onReplyError={msg => setError(msg)}
      messagesEndRef={messagesEndRef as React.RefObject<HTMLDivElement>}
    />
  ) : null;

  // ── Mobile layout: single panel ────────────────────────────────────────
  if (isMobile) {
    if (selectedConv && threadPanel) {
      return (
        <div style={containerStyle}>
          {errorBanner}
          {threadPanel}
        </div>
      );
    }
    return (
      <div style={containerStyle}>
        {errorBanner}
        {convListPanel}
      </div>
    );
  }

  // ── Desktop layout: two-panel ──────────────────────────────────────────
  return (
    <div style={containerStyle}>
      {errorBanner}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Left: conversation list (380px fixed) */}
        <div style={{
          width: 380, flexShrink: 0,
          borderRight: '1px solid #E5E7EB',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          background: '#fff',
        }}>
          {convListPanel}
        </div>

        {/* Right: thread */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, background: '#fff' }}>
          {selectedConv && threadPanel ? threadPanel : <EmptyRight />}
        </div>
      </div>
    </div>
  );
}
