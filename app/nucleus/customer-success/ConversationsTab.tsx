'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  MessageSquare, Search, RefreshCw, CheckCheck, Flag, FlagOff,
  Loader2, Send, User, ChevronLeft, X, AlertTriangle, ArrowRight,
  Clock, RotateCcw,
} from 'lucide-react';

const AUTH = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const LINE_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: '#ede9fe', text: '#7c3aed', border: '#c4b5fd' },
  2: { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  3: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  touch1_confirmed: { bg: '#fef3c7', text: '#b45309', label: 'Confirmed' },
  pitched:          { bg: '#dbeafe', text: '#1d4ed8', label: 'Pitched' },
  touch1_sent:      { bg: '#f3f4f6', text: '#6b7280', label: 'T1 Sent' },
  touch2_sent:      { bg: '#fef9c3', text: '#854d0e', label: 'T2 Sent' },
  touch3_sent:      { bg: '#fee2e2', text: '#991b1b', label: 'T3 Sent' },
};

const LINQ_LINE_PHONES = new Set(['+16462408056', '+16462668785', '+16462442696']);

type ConvContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  contact_name: string;
  phone_primary: string | null;
  outreach_status: string;
  assigned_line: number | null;
  line_label: string | null;
  linq_chat_id: string | null;
  chapter_id: string;
  chapter_name: string;
  grad_year: number | null;
  touch1_sent_at: string | null;
  touch2_sent_at: string | null;
  touch3_sent_at: string | null;
  last_response_at: string | null;
  last_response_text: string | null;
  flagged: boolean;
  flagged_reason: string | null;
  handled_at: string | null;
};

type LinqMessage = {
  id: string;
  chat_id: string;
  from: string;
  parts: { type: string; value: string }[];
  created_at: string;
};

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ConversationsTab({ showToast }: Props) {
  const [tab, setTab] = useState<'active' | 'unanswered'>('active');
  const [contacts, setContacts] = useState<ConvContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [lineFilter, setLineFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ConvContact | null>(null);
  const [messages, setMessages] = useState<LinqMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [handling, setHandling] = useState<string | null>(null);
  const [pitching, setPitching] = useState<string | null>(null);
  const [flagging, setFlagging] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const LIMIT = 50;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [tab, lineFilter, debouncedSearch]);

  // Load contacts
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        mode: tab,
        page: String(page),
        limit: String(LIMIT),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (lineFilter !== 'all') params.set('line', lineFilter);

      const res = await fetch(`/api/outreach/conversations/list?${params}`, {
        headers: { Authorization: AUTH },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setContacts(json.data || []);
      setTotal(json.total || 0);
    } catch (e) {
      showToast(`Failed to load conversations: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, page, debouncedSearch, lineFilter, showToast]);

  useEffect(() => { load(); }, [load]);

  // Load messages for selected contact
  useEffect(() => {
    if (!selected?.linq_chat_id) { setMessages([]); return; }
    setLoadingMsgs(true);
    fetch(`/api/linq/messages?chat_id=${encodeURIComponent(selected.linq_chat_id)}&limit=100`)
      .then(r => r.json())
      .then(json => {
        const sorted = (json.data || []).sort(
          (a: LinqMessage, b: LinqMessage) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setMessages(sorted);
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingMsgs(false));
  }, [selected?.linq_chat_id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Sync ──────────────────────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/outreach/conversations/sync', {
        method: 'POST',
        headers: { Authorization: AUTH },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const msg = json.detected > 0
        ? `Found ${json.detected} new response${json.detected > 1 ? 's' : ''} (scanned ${json.scanned})`
        : `No new responses (scanned ${json.scanned})`;
      showToast(msg, json.detected > 0 ? 'success' : 'info');
      if (json.detected > 0) load();
    } catch (e) {
      showToast(`Sync failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setSyncing(false);
    }
  }

  // ── Send Pitch ─────────────────────────────────────────────────────────────
  async function handleSendPitch(contact: ConvContact) {
    setPitching(contact.id);
    try {
      const res = await fetch('/api/outreach/conversations/send-pitch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ contact_id: contact.id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed');
      showToast('Pitch sent — contact moved to Pitched', 'success');
      // Update locally
      setContacts(prev => prev.map(c =>
        c.id === contact.id ? { ...c, outreach_status: 'pitched' } : c
      ));
      if (selected?.id === contact.id)
        setSelected(s => s ? { ...s, outreach_status: 'pitched' } : s);
    } catch (e) {
      showToast(`Failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setPitching(null);
    }
  }

  // ── Mark Handled ───────────────────────────────────────────────────────────
  async function handleMarkHandled(contact: ConvContact) {
    setHandling(contact.id);
    try {
      const res = await fetch('/api/outreach/conversations/responses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || json.error);
      setHandledIds(prev => new Set([...prev, contact.id]));
      if (selected?.id === contact.id) setSelected(null);
      showToast('Marked handled', 'success');
    } catch (e) {
      showToast(`Failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setHandling(null);
    }
  }

  // ── Flag ───────────────────────────────────────────────────────────────────
  async function handleFlag(unflag = false) {
    if (!selected) return;
    setFlagging(true);
    try {
      const res = await fetch('/api/outreach/conversations/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: selected.id, flagged: !unflag, reason: flagReason }),
      });
      if (!res.ok) throw new Error('Flag failed');
      const newFlagged = !unflag;
      setContacts(prev => prev.map(c =>
        c.id === selected.id ? { ...c, flagged: newFlagged, flagged_reason: flagReason || null } : c
      ));
      setSelected(s => s ? { ...s, flagged: newFlagged, flagged_reason: flagReason || null } : s);
      setShowFlagModal(false);
      setFlagReason('');
      showToast(unflag ? 'Unflagged' : 'Flagged for review', 'success');
    } catch (e) {
      showToast(`Failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setFlagging(false);
    }
  }

  // ── Send Reply ─────────────────────────────────────────────────────────────
  async function handleSendReply() {
    if (!selected?.linq_chat_id || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch('/api/outreach/conversations/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: AUTH },
        body: JSON.stringify({ contact_id: selected.id, message: replyText.trim() }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Failed');
      setReplyText('');
      // Reload messages
      const msgRes = await fetch(`/api/linq/messages?chat_id=${encodeURIComponent(selected.linq_chat_id)}&limit=100`);
      const msgJson = await msgRes.json();
      const sorted = (msgJson.data || []).sort(
        (a: LinqMessage, b: LinqMessage) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      setMessages(sorted);
    } catch (e) {
      showToast(`Reply failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setSendingReply(false);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function formatTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffH = Math.floor((now.getTime() - d.getTime()) / 3600000);
    const diffD = Math.floor(diffH / 24);
    if (diffH < 1) return `${Math.floor((now.getTime() - d.getTime()) / 60000)}m ago`;
    if (diffH < 24) return `${diffH}h ago`;
    if (diffD === 1) return 'Yesterday';
    if (diffD < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function daysSince(iso: string | null): number {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  const displayed = contacts.filter(c => !handledIds.has(c.id));
  const activeCount = tab === 'active' ? total : null;
  const unansweredCount = tab === 'unanswered' ? total : null;

  // ── Conversation row ───────────────────────────────────────────────────────
  function ConvRow({ c }: { c: ConvContact }) {
    const isSelected = selected?.id === c.id;
    const lineClr = c.assigned_line ? LINE_COLORS[c.assigned_line] : null;
    const statusClr = STATUS_COLORS[c.outreach_status];
    const isRecent = c.last_response_at
      ? daysSince(c.last_response_at) < 1
      : false;

    return (
      <div
        onClick={() => setSelected(c)}
        style={{
          padding: '10px 14px',
          cursor: 'pointer',
          borderBottom: '1px solid #f0f0f0',
          borderLeft: isSelected ? '3px solid #2563eb'
            : c.flagged ? '3px solid #f59e0b'
            : '3px solid transparent',
          background: isSelected ? '#eff6ff'
            : c.flagged ? '#fffbeb'
            : '#fafafa',
          transition: 'background 0.1s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: c.flagged ? '#fef3c7' : lineClr ? lineClr.bg : '#e9eaf0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.78rem', fontWeight: 700,
            color: c.flagged ? '#d97706' : lineClr ? lineClr.text : '#64748b',
          }}>
            {c.contact_name !== 'Unknown'
              ? c.contact_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
              : <User size={14} />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Row 1: name + time */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
              <span style={{
                fontWeight: isRecent ? 700 : 600, fontSize: '0.8375rem', color: '#111827',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              }}>
                {c.contact_name}
                {c.grad_year && (
                  <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 4, fontSize: '0.75rem' }}>
                    &apos;{String(c.grad_year).slice(-2)}
                  </span>
                )}
              </span>
              <span style={{ fontSize: '0.7rem', color: isRecent ? '#dc2626' : '#9ca3af', fontWeight: isRecent ? 700 : 400, flexShrink: 0 }}>
                {tab === 'active' && c.last_response_at ? formatTime(c.last_response_at) : c.touch1_sent_at ? formatTime(c.touch1_sent_at) : ''}
              </span>
            </div>

            {/* Row 2: chapter + badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <span style={{ fontSize: '0.73rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {c.chapter_name}
              </span>
              {statusClr && (
                <span style={{ background: statusClr.bg, color: statusClr.text, fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>
                  {statusClr.label}
                </span>
              )}
              {lineClr && c.line_label && (
                <span style={{ background: lineClr.bg, color: lineClr.text, fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>
                  {c.line_label}
                </span>
              )}
              {c.flagged && <Flag size={10} style={{ color: '#d97706', flexShrink: 0 }} />}
            </div>

            {/* Row 3: last message preview */}
            {tab === 'active' && c.last_response_text && (
              <div style={{ marginTop: 2, fontSize: '0.73rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.last_response_text.slice(0, 65)}{c.last_response_text.length > 65 ? '…' : ''}
              </div>
            )}

            {/* Row 3 unanswered: time since T1 */}
            {tab === 'unanswered' && c.touch1_sent_at && (
              <div style={{ marginTop: 2, fontSize: '0.73rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={10} />
                {daysSince(c.touch1_sent_at)}d since T1
                {c.touch2_sent_at && <span style={{ marginLeft: 4 }}>· {daysSince(c.touch2_sent_at)}d since T2</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Message bubble ─────────────────────────────────────────────────────────
  function MessageBubble({ msg }: { msg: LinqMessage }) {
    const isOutbound = LINQ_LINE_PHONES.has(msg.from);
    const text = msg.parts.filter(p => p.type === 'text').map(p => p.value).join(' ');
    const time = new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: isOutbound ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
        <div style={{
          maxWidth: '75%', padding: '8px 12px', borderRadius: isOutbound ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: isOutbound ? '#2563eb' : '#f3f4f6',
          color: isOutbound ? '#fff' : '#111827',
          fontSize: '0.8375rem', lineHeight: 1.45,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}>
          {text || <span style={{ opacity: 0.6, fontStyle: 'italic' }}>(media)</span>}
        </div>
        <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: 2, padding: '0 4px' }}>{time}</span>
      </div>
    );
  }

  // ── Thread panel ───────────────────────────────────────────────────────────
  function ThreadPanel() {
    if (!selected) {
      return (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexDirection: 'column', gap: 10, background: '#fafafa' }}>
          <MessageSquare size={32} style={{ opacity: 0.2 }} />
          <span style={{ fontSize: '0.875rem' }}>Select a conversation</span>
        </div>
      );
    }

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Contact header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 0, display: 'flex' }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>{selected.contact_name}</span>
              {selected.grad_year && <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>&apos;{String(selected.grad_year).slice(-2)}</span>}
              {STATUS_COLORS[selected.outreach_status] && (
                <span style={{ background: STATUS_COLORS[selected.outreach_status].bg, color: STATUS_COLORS[selected.outreach_status].text, fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 10 }}>
                  {STATUS_COLORS[selected.outreach_status].label}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 3, paddingLeft: 24, fontSize: '0.73rem', color: '#6b7280' }}>
              <span>{selected.chapter_name}</span>
              {selected.line_label && <span>· {selected.line_label} line</span>}
              {selected.phone_primary && <span>· {selected.phone_primary}</span>}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {selected.outreach_status === 'touch1_confirmed' && (
              <button
                onClick={() => handleSendPitch(selected)}
                disabled={pitching === selected.id}
                style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid #a5b4fc', background: '#eef2ff', color: '#4f46e5', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {pitching === selected.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />}
                Send Pitch
              </button>
            )}
            <button
              onClick={() => selected.flagged ? handleFlag(true) : setShowFlagModal(true)}
              disabled={flagging}
              style={{ padding: '5px 11px', borderRadius: 7, border: `1px solid ${selected.flagged ? '#fbbf24' : '#e5e7eb'}`, background: selected.flagged ? '#fef3c7' : '#fff', color: selected.flagged ? '#d97706' : '#6b7280', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {selected.flagged ? <><FlagOff size={11} /> Unflag</> : <><Flag size={11} /> Flag</>}
            </button>
            <button
              onClick={() => handleMarkHandled(selected)}
              disabled={handling === selected.id}
              style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              {handling === selected.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCheck size={11} />}
              Handled
            </button>
          </div>
        </div>

        {/* Message thread */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', background: '#fff' }}>
          {!selected.linq_chat_id ? (
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
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem', marginTop: 40 }}>No messages loaded</div>
          ) : (
            <>
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Reply bar */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid #e5e7eb', background: '#fafafa', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendReply(); }}
              placeholder="Type a reply… (⌘+Enter to send)"
              rows={2}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8375rem', resize: 'none', outline: 'none', fontFamily: 'inherit', background: '#fff' }}
            />
            <button
              onClick={handleSendReply}
              disabled={!replyText.trim() || sendingReply || !selected.linq_chat_id}
              style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: replyText.trim() ? '#2563eb' : '#e5e7eb', color: replyText.trim() ? '#fff' : '#9ca3af', cursor: replyText.trim() ? 'pointer' : 'default', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, height: 58 }}
            >
              {sendingReply ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', minHeight: 640 }}>

      {/* ── Top bar ── */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fff', flexShrink: 0 }}>

        {/* Pill tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { id: 'active' as const, label: 'Active Conversations' },
            { id: 'unanswered' as const, label: 'No Reply' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelected(null); }}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontWeight: tab === t.id ? 700 : 500, fontSize: '0.8rem',
                background: tab === t.id ? (t.id === 'active' ? '#2563eb' : '#6b7280') : '#f3f4f6',
                color: tab === t.id ? '#fff' : '#6b7280',
                transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {t.label}
              {!loading && (
                <span style={{
                  background: tab === t.id ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
                  color: tab === t.id ? '#fff' : '#374151',
                  fontSize: '0.68rem', fontWeight: 700, padding: '0 6px', borderRadius: 10,
                }}>
                  {tab === t.id ? total : '…'}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '4px 10px', flex: 1, minWidth: 160, maxWidth: 280 }}>
          <Search size={13} style={{ color: '#9ca3af', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, chapter…"
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8rem', color: '#111827', width: '100%' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex' }}><X size={12} /></button>}
        </div>

        {/* Line filter pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', '1', '2', '3'] as const).map(l => {
            const num = parseInt(l as string);
            const clr = LINE_COLORS[num];
            const lbl = l === 'all' ? 'All' : ['Owen', 'Adam', 'Ford'][num - 1];
            const active = lineFilter === l;
            return (
              <button key={l} onClick={() => setLineFilter(l)} style={{
                padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: '0.73rem', fontWeight: 500,
                background: active ? (l === 'all' ? '#111827' : clr.bg) : '#f3f4f6',
                color: active ? (l === 'all' ? '#fff' : clr.text) : '#6b7280',
              }}>
                {lbl}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {/* Sync button — detect new responses from Linq */}
          {tab === 'unanswered' && (
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Scan Linq for new replies and update contact statuses"
              style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.73rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {syncing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={12} />}
              Sync Responses
            </button>
          )}
          <button onClick={load} title="Refresh" style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* ── Two-panel body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

        {/* Left: list panel */}
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #e5e7eb', overflowY: 'auto', background: '#fafafa', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: '#9ca3af', gap: 8, fontSize: '0.8rem' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, color: '#9ca3af', gap: 10 }}>
              <MessageSquare size={28} style={{ opacity: 0.2 }} />
              <span style={{ fontSize: '0.8rem' }}>
                {tab === 'active' ? 'No active conversations' : 'No unanswered contacts'}
              </span>
              {tab === 'unanswered' && (
                <button onClick={handleSync} disabled={syncing} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.73rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RotateCcw size={12} /> Sync from Linq
                </button>
              )}
            </div>
          ) : (
            <>
              {displayed.map(c => <ConvRow key={c.id} c={c} />)}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid #f0f0f0' }}>
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page > 1 ? 'pointer' : 'default', color: page > 1 ? '#374151' : '#d1d5db', fontSize: '0.73rem' }}>← Prev</button>
                  <span style={{ fontSize: '0.73rem', color: '#6b7280' }}>{page} / {totalPages}</span>
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: page < totalPages ? 'pointer' : 'default', color: page < totalPages ? '#374151' : '#d1d5db', fontSize: '0.73rem' }}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: thread panel */}
        <ThreadPanel />
      </div>

      {/* ── Flag modal ── */}
      {showFlagModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Flag for review</span>
              <button onClick={() => setShowFlagModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={16} /></button>
            </div>
            <textarea
              value={flagReason}
              onChange={e => setFlagReason(e.target.value)}
              placeholder="Reason (optional — legal threat, sensitive, deceased, etc.)"
              rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8rem', resize: 'none', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => setShowFlagModal(false)} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', color: '#6b7280' }}>Cancel</button>
              <button onClick={() => handleFlag(false)} disabled={flagging} style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {flagging ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Flag size={13} />}
                Flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
