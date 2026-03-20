'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  MessageSquare, Search, RefreshCw, CheckCheck, Flag, FlagOff,
  Loader2, Send, User, ChevronLeft, X, AlertTriangle,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────

const AUTH = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';
const API = '/api/conversations';
const LIMIT = 50;
const DEBOUNCE_MS = 350;

const LINQ_LINE_PHONES = new Set(['+16462101111', '+16462668785', '+16462442696']);

const LINES: { phone: string; label: string; color: { bg: string; text: string } }[] = [
  { phone: '+16462101111', label: 'Owen', color: { bg: '#ede9fe', text: '#7c3aed' } },
  { phone: '+16462668785', label: 'Adam', color: { bg: '#dbeafe', text: '#1d4ed8' } },
  { phone: '+16462442696', label: 'Ford', color: { bg: '#d1fae5', text: '#065f46' } },
];

const STATUS_META: Record<string, { bg: string; text: string; label: string }> = {
  touch1_confirmed: { bg: '#fef3c7', text: '#b45309',  label: 'Confirmed' },
  pitched:          { bg: '#dbeafe', text: '#1d4ed8',  label: 'Pitched' },
  touch1_sent:      { bg: '#f3f4f6', text: '#6b7280',  label: 'T1 Sent' },
  touch2_sent:      { bg: '#fef9c3', text: '#854d0e',  label: 'T2 Sent' },
  touch3_sent:      { bg: '#fee2e2', text: '#991b1b',  label: 'T3 Sent' },
  no_response:      { bg: '#f3f4f6', text: '#6b7280',  label: 'No Response' },
  signed_up:        { bg: '#d1fae5', text: '#065f46',  label: 'Signed Up' },
};

type Tab = 'active' | 'handled' | 'flagged';

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
  status: 'active' | 'handled' | 'flagged' | 'archived';
  flagged_reason: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  has_unread_reply: boolean;
  is_urgent: boolean;
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
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3_600_000);
  const diffD = Math.floor(diffH / 24);
  if (diffH < 1) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return 'Yesterday';
  if (diffD < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map(n => n[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function lineFor(phone: string) {
  return LINES.find(l => l.phone === phone) ?? null;
}

// ── MODULE-LEVEL sub-components ────────────────────────────────────────────

// ConvRow
interface ConvRowProps {
  conv: LinqConversation;
  isSelected: boolean;
  onClick: () => void;
}

function ConvRow({ conv, isSelected, onClick }: ConvRowProps) {
  const line = lineFor(conv.line_phone);
  const statusMeta = conv.outreach_status ? STATUS_META[conv.outreach_status] : null;
  const preview = (conv.last_message_text ?? '').slice(0, 60) +
    ((conv.last_message_text?.length ?? 0) > 60 ? '…' : '');

  const borderColor = conv.is_urgent
    ? '#f59e0b'
    : conv.has_unread_reply
      ? '#2563eb'
      : isSelected
        ? '#2563eb'
        : conv.status === 'flagged'
          ? '#f59e0b'
          : 'transparent';

  const bg = isSelected
    ? '#eff6ff'
    : conv.is_urgent
      ? '#fffbeb'
      : conv.status === 'flagged'
        ? '#fffbeb'
        : '#fafafa';

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        cursor: 'pointer',
        borderLeft: `3px solid ${borderColor}`,
        borderBottom: '1px solid #f0f0f0',
        background: bg,
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
          {conv.contact_name
            ? initials(conv.contact_name)
            : <User size={14} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: name + timestamp */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <span style={{
              fontWeight: conv.has_unread_reply ? 700 : 600,
              fontSize: '0.8375rem', color: '#111827',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {conv.contact_name ?? conv.contact_phone ?? 'Unknown'}
            </span>
            <span style={{ fontSize: '0.7rem', color: conv.is_urgent ? '#dc2626' : '#9ca3af', fontWeight: conv.is_urgent ? 700 : 400, flexShrink: 0 }}>
              {formatTime(conv.last_message_at)}
            </span>
          </div>

          {/* Row 2: chapter + badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <span style={{ fontSize: '0.73rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {conv.chapter_name ?? '—'}
            </span>
            {/* Line badge */}
            {line && (
              <span style={{ background: line.color.bg, color: line.color.text, fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>
                {line.label}
              </span>
            )}
            {/* Status badge */}
            {statusMeta && (
              <span style={{ background: statusMeta.bg, color: statusMeta.text, fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>
                {statusMeta.label}
              </span>
            )}
            {/* Unread blue dot */}
            {conv.has_unread_reply && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', flexShrink: 0, display: 'block' }} />
            )}
            {/* Urgent icon */}
            {conv.is_urgent && <AlertTriangle size={10} style={{ color: '#f59e0b', flexShrink: 0 }} />}
          </div>

          {/* Row 3: message preview */}
          {preview && (
            <div style={{ marginTop: 2, fontSize: '0.73rem', color: '#9ca3af', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {conv.last_message_direction === 'inbound' ? '← ' : '→ '}{preview}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// MessageBubble
interface MessageBubbleProps {
  msg: LinqMessage;
}

function MessageBubble({ msg }: MessageBubbleProps) {
  const isOutbound = msg.is_from_me || LINQ_LINE_PHONES.has(msg.from);
  const text = msg.parts
    .filter(p => p.type === 'text')
    .map(p => p.value)
    .join(' ');
  const time = new Date(msg.created_at).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isOutbound ? 'flex-end' : 'flex-start',
      marginBottom: 8,
    }}>
      <div style={{
        maxWidth: '75%',
        padding: '8px 12px',
        borderRadius: isOutbound ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        background: isOutbound ? '#2563eb' : '#f3f4f6',
        color: isOutbound ? '#fff' : '#111827',
        fontSize: '0.8375rem',
        lineHeight: 1.45,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        wordBreak: 'break-word',
      }}>
        {text || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>(media)</span>}
      </div>
      <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2, padding: '0 4px' }}>
        {time}
      </span>
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
      if (!res.ok) {
        onError(json.error ?? 'Send failed');
      } else {
        setText('');
        onSent();
      }
    } catch (err) {
      onError(String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      padding: '12px 14px',
      borderTop: '2px solid #e5e7eb',
      background: '#fff',
      flexShrink: 0,
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
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1.5px solid #d1d5db',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            color: '#111827',
            background: !linqChatId ? '#f9fafb' : '#fff',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || !linqChatId || sending}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: 'none',
            background: text.trim() && linqChatId && !sending ? '#2563eb' : '#e5e7eb',
            color: text.trim() && linqChatId && !sending ? '#fff' : '#9ca3af',
            cursor: text.trim() && linqChatId && !sending ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontWeight: 600,
            fontSize: '0.8rem',
            transition: 'all 0.15s',
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

// ThreadPanel
interface ThreadPanelProps {
  conv: LinqConversation | null;
  messages: LinqMessage[];
  loadingMsgs: boolean;
  handling: boolean;
  flagging: boolean;
  onBack: () => void;
  onMarkHandled: () => void;
  onFlag: () => void;
  onUnflag: () => void;
  onReplySent: () => void;
  onReplyError: (msg: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

function ThreadPanel({
  conv,
  messages,
  loadingMsgs,
  handling,
  flagging,
  onBack,
  onMarkHandled,
  onFlag,
  onUnflag,
  onReplySent,
  onReplyError,
  messagesEndRef,
}: ThreadPanelProps) {
  if (!conv) {
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

  const line = lineFor(conv.line_phone);
  const statusMeta = conv.outreach_status ? STATUS_META[conv.outreach_status] : null;

  // Stage-aware action label
  function stageActionLabel(): string {
    switch (conv?.outreach_status) {
      case 'touch1_confirmed': return 'Send Pitch';
      case 'pitched': return 'Follow-up';
      case 'touch2_sent':
      case 'touch3_sent': return 'No Response';
      default: return '';
    }
  }
  const stageLabel = stageActionLabel();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 10, flexShrink: 0,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Back button (always visible for mobile UX; desktop it just deselects) */}
            <button
              onClick={onBack}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex' }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>
              {conv.contact_name ?? conv.contact_phone ?? 'Unknown'}
            </span>
            {statusMeta && (
              <span style={{ background: statusMeta.bg, color: statusMeta.text, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10 }}>
                {statusMeta.label}
              </span>
            )}
            {line && (
              <span style={{ background: line.color.bg, color: line.color.text, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10 }}>
                {line.label}
              </span>
            )}
            {conv.is_urgent && (
              <span style={{ background: '#fef3c7', color: '#d97706', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                ⚠ 48h+ urgent
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3, paddingLeft: 24, fontSize: '0.73rem', color: '#6b7280', flexWrap: 'wrap' }}>
            {conv.chapter_name && <span>{conv.chapter_name}</span>}
            {conv.touch_stage && <span>· {conv.touch_stage}</span>}
            {conv.contact_phone && <span>· {conv.contact_phone}</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Stage-aware */}
          {stageLabel && (
            <button
              style={{
                padding: '5px 11px', borderRadius: 7,
                border: '1px solid #a5b4fc', background: '#eef2ff', color: '#4f46e5',
                cursor: 'pointer', fontSize: '0.73rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {stageLabel}
            </button>
          )}

          {/* Flag / Unflag */}
          <button
            onClick={conv.status === 'flagged' ? onUnflag : onFlag}
            disabled={flagging}
            style={{
              padding: '5px 11px', borderRadius: 7,
              border: `1px solid ${conv.status === 'flagged' ? '#fbbf24' : '#e5e7eb'}`,
              background: conv.status === 'flagged' ? '#fef3c7' : '#fff',
              color: conv.status === 'flagged' ? '#d97706' : '#6b7280',
              cursor: 'pointer', fontSize: '0.73rem', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {flagging
              ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
              : conv.status === 'flagged'
                ? <><FlagOff size={11} /> Unflag</>
                : <><Flag size={11} /> Flag</>}
          </button>

          {/* Mark Handled */}
          {conv.status !== 'handled' && (
            <button
              onClick={onMarkHandled}
              disabled={handling}
              style={{
                padding: '5px 11px', borderRadius: 7,
                border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a',
                cursor: 'pointer', fontSize: '0.73rem', fontWeight: 600,
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

      {/* Reply box */}
      <ReplyBox
        convId={conv.id}
        linqChatId={conv.linq_chat_id}
        onSent={onReplySent}
        onError={onReplyError}
      />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ConversationsTab({ showToast }: Props) {
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lineFilter, setLineFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const [convs, setConvs] = useState<LinqConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [counts, setCounts] = useState<Record<Tab, number>>({ active: 0, handled: 0, flagged: 0 });

  const [selected, setSelected] = useState<LinqConversation | null>(null);
  const [messages, setMessages] = useState<LinqMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const [handling, setHandling] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [isMobile, setIsMobile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mobile detection ──────────────────────────────────────────────────
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768); }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── Search debounce ───────────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, DEBOUNCE_MS);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [search]);

  // ── Load conversations ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        status: tab,
        line: lineFilter,
        search: debouncedSearch,
        page: String(page),
        limit: String(LIMIT),
      });
      const res = await fetch(`${API}?${params}`, { headers: { Authorization: AUTH } });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error ?? 'Failed to load conversations');
        return;
      }
      setConvs(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setLoading(false);
    }
  }, [tab, lineFilter, debouncedSearch, page]);

  // Load tab counts (non-blocking, best-effort)
  const loadCounts = useCallback(async () => {
    const tabs: Tab[] = ['active', 'handled', 'flagged'];
    const results = await Promise.allSettled(
      tabs.map(async t => {
        const params = new URLSearchParams({ status: t, limit: '1' });
        const res = await fetch(`${API}?${params}`, { headers: { Authorization: AUTH } });
        if (!res.ok) return [t, 0] as [Tab, number];
        const json = await res.json();
        return [t, json.total ?? 0] as [Tab, number];
      })
    );
    const next: Record<Tab, number> = { active: 0, handled: 0, flagged: 0 };
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const [t, count] = r.value;
        next[t] = count;
      }
    }
    setCounts(next);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Auto-sync on mount (non-blocking)
  useEffect(() => {
    fetch(`${API}/sync`, { method: 'POST', headers: { Authorization: AUTH } }).catch(() => {});
    loadCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load messages when selection changes ──────────────────────────────
  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    setMessages([]);
    setLoadingMsgs(true);
    fetch(`${API}/${selected.id}/messages`, { headers: { Authorization: AUTH } })
      .then(r => r.json())
      .then(json => {
        if (json.error) showToast(json.error, 'error');
        else setMessages(json.data ?? []);
      })
      .catch(err => showToast(String(err), 'error'))
      .finally(() => setLoadingMsgs(false));
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages]);

  // ── Sync ──────────────────────────────────────────────────────────────
  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API}/sync`, { method: 'POST', headers: { Authorization: AUTH } });
      const json = await res.json();
      if (!res.ok) showToast(json.error ?? 'Sync failed', 'error');
      else {
        showToast(`Synced ${json.data?.processed ?? 0} conversations`, 'success');
        load();
        loadCounts();
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setSyncing(false);
    }
  }

  // ── Mark handled ──────────────────────────────────────────────────────
  async function handleMarkHandled() {
    if (!selected || handling) return;
    setHandling(true);
    try {
      const res = await fetch(`${API}/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ status: 'handled' }),
      });
      const json = await res.json();
      if (!res.ok) showToast(json.error ?? 'Failed', 'error');
      else {
        showToast('Marked as handled', 'success');
        setSelected(null);
        load();
        loadCounts();
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setHandling(false);
    }
  }

  // ── Flag ──────────────────────────────────────────────────────────────
  async function handleFlag() {
    if (!selected || flagging) return;
    const reason = window.prompt('Flag reason (optional):') ?? '';
    setFlagging(true);
    try {
      const res = await fetch(`${API}/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ status: 'flagged', flagged_reason: reason.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) showToast(json.error ?? 'Failed', 'error');
      else {
        showToast('Flagged for review', 'info');
        setSelected(null);
        load();
        loadCounts();
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setFlagging(false);
    }
  }

  // ── Unflag ────────────────────────────────────────────────────────────
  async function handleUnflag() {
    if (!selected || flagging) return;
    setFlagging(true);
    try {
      const res = await fetch(`${API}/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ status: 'active', flagged_reason: null }),
      });
      const json = await res.json();
      if (!res.ok) showToast(json.error ?? 'Failed', 'error');
      else {
        showToast('Unflagged', 'success');
        // Update selected in-place
        setSelected(prev => prev ? { ...prev, status: 'active', flagged_reason: null } : null);
        load();
        loadCounts();
      }
    } catch (err) {
      showToast(String(err), 'error');
    } finally {
      setFlagging(false);
    }
  }

  // ── Reply sent callback ────────────────────────────────────────────────
  function handleReplySent() {
    showToast('Reply sent', 'success');
    // Reload messages
    if (selected) {
      setLoadingMsgs(true);
      fetch(`${API}/${selected.id}/messages`, { headers: { Authorization: AUTH } })
        .then(r => r.json())
        .then(json => { setMessages(json.data ?? []); })
        .finally(() => setLoadingMsgs(false));
    }
  }

  // ── Tab change ────────────────────────────────────────────────────────
  function changeTab(t: Tab) {
    setTab(t);
    setPage(1);
    setSelected(null);
  }

  const totalPages = Math.ceil(total / LIMIT);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      height: isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 220px)',
      minHeight: 520, maxHeight: '90vh',
    }}>

      {/* ── Top bar ── */}
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: '#fff', flexShrink: 0,
      }}>
        {/* Tab pills */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['active', 'handled', 'flagged'] as Tab[]).map(t => {
            const colors: Record<Tab, string> = {
              active: '#2563eb',
              handled: '#16a34a',
              flagged: '#d97706',
            };
            return (
              <button
                key={t}
                onClick={() => changeTab(t)}
                style={{
                  padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontWeight: tab === t ? 700 : 500, fontSize: '0.8rem', textTransform: 'capitalize',
                  background: tab === t ? colors[t] : '#f3f4f6',
                  color: tab === t ? '#fff' : '#6b7280',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {t}
                <span style={{
                  background: tab === t ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                  color: tab === t ? '#fff' : '#374151',
                  fontSize: '0.68rem', fontWeight: 700, padding: '0 6px', borderRadius: 10,
                }}>
                  {counts[t]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
          padding: '4px 10px', flex: 1, minWidth: 140, maxWidth: 280,
        }}>
          <Search size={13} style={{ color: '#9ca3af', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, chapter…"
            style={{
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: '0.8rem', color: '#111827', width: '100%',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex' }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Line filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => { setLineFilter('all'); setPage(1); }}
            style={{
              padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: '0.73rem', fontWeight: 500,
              background: lineFilter === 'all' ? '#111827' : '#f3f4f6',
              color: lineFilter === 'all' ? '#fff' : '#6b7280',
            }}
          >
            All
          </button>
          {LINES.map(l => (
            <button
              key={l.phone}
              onClick={() => { setLineFilter(l.phone); setPage(1); }}
              style={{
                padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: '0.73rem', fontWeight: 500,
                background: lineFilter === l.phone ? l.color.bg : '#f3f4f6',
                color: lineFilter === l.phone ? l.color.text : '#6b7280',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb',
              background: '#fff', color: '#374151', cursor: 'pointer',
              fontSize: '0.73rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            {syncing
              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={12} />}
            Sync
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {loadError && (
        <div style={{
          padding: '8px 18px', background: '#fee2e2', color: '#991b1b',
          fontSize: '0.8rem', borderBottom: '1px solid #fca5a5', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={14} />
          {loadError}
          <button
            onClick={() => setLoadError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Two-panel body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* Left panel — list */}
        <div style={{
          width: isMobile ? '100%' : 340,
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          overflowY: 'auto',
          background: '#fafafa',
          display: isMobile && selected ? 'none' : 'flex',
          flexDirection: 'column',
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', gap: 8, fontSize: '0.8rem' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
            </div>
          ) : convs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: '#9ca3af', gap: 10 }}>
              <MessageSquare size={28} style={{ opacity: 0.2 }} />
              <span style={{ fontSize: '0.8rem' }}>No {tab} conversations</span>
              <button
                onClick={handleSync}
                disabled={syncing}
                style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.73rem', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <RefreshCw size={12} /> Sync from Linq
              </button>
            </div>
          ) : (
            <>
              {convs.map(c => (
                <ConvRow
                  key={c.id}
                  conv={c}
                  isSelected={selected?.id === c.id}
                  onClick={() => setSelected(c)}
                />
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page > 1 ? 'pointer' : 'default', color: page > 1 ? '#374151' : '#d1d5db', fontSize: '0.73rem' }}
                  >
                    ← Prev
                  </button>
                  <span style={{ fontSize: '0.73rem', color: '#6b7280' }}>{page} / {totalPages}</span>
                  <button
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                    style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page < totalPages ? 'pointer' : 'default', color: page < totalPages ? '#374151' : '#d1d5db', fontSize: '0.73rem' }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right panel — thread */}
        <div style={{
          display: isMobile && !selected ? 'none' : 'flex',
          flex: 1, flexDirection: 'column', overflow: 'hidden', minHeight: 0,
        }}>
          <ThreadPanel
            conv={selected}
            messages={messages}
            loadingMsgs={loadingMsgs}
            handling={handling}
            flagging={flagging}
            onBack={() => setSelected(null)}
            onMarkHandled={handleMarkHandled}
            onFlag={handleFlag}
            onUnflag={handleUnflag}
            onReplySent={handleReplySent}
            onReplyError={msg => showToast(msg, 'error')}
            messagesEndRef={messagesEndRef}
          />
        </div>
      </div>
    </div>
  );
}
