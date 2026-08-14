'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  LayoutDashboard,
  MessageCircle,
  Search,
  Flag,
  Send,
  X,
  User,
  Loader2,
  List,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import ModalOverlay from '@/components/ModalOverlay';
import {
  SCOUT_LINES,
  getLineLabel,
  getLineColor,
  ScoutConversation,
  ScoutProfile,
} from '../mock-data';

type LineFilter = 'all' | '+16462101111' | '+16462668785' | '+16462442696';
type StatusFilter = 'all' | 'unread' | 'flagged';

interface Thread {
  phone_number: string;
  messages: ScoutConversation[];
  lastMessage: ScoutConversation;
  profile: ScoutProfile | null;
  unreadCount: number;
  isFlagged: boolean;
  linqLine: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Yesterday`;
  const diff = now.getTime() - d.getTime();
  if (diff < 7 * 86400000) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ConversationsFeed() {
  const [conversations, setConversations] = useState<ScoutConversation[]>([]);
  const [profiles, setProfiles] = useState<ScoutProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [lineFilter, setLineFilter] = useState<LineFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyLine, setReplyLine] = useState<string>(SCOUT_LINES[0].phone);
  const [sending, setSending] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagTargetId, setFlagTargetId] = useState<string | null>(null);
  const [showTurns, setShowTurns] = useState(false);
  const [turns, setTurns] = useState<Array<{
    id: string;
    inbound_text: string | null;
    tool_calls: Array<{ name?: string }>;
    validation: { ok?: boolean; reasons?: string[]; skip_reason?: string } | null;
    sent_text: string | null;
    latency_ms: number | null;
    dry_run: boolean;
    created_at: string;
  }>>([]);
  const [turnsLoading, setTurnsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [convoRes, profileRes] = await Promise.all([
        fetch('/api/scout/conversations?limit=500'),
        fetch('/api/scout/profiles?limit=200'),
      ]);
      const convoJson = await convoRes.json();
      const profileJson = await profileRes.json();
      if (convoJson.data) setConversations(convoJson.data);
      if (profileJson.data) setProfiles(profileJson.data);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Supabase Realtime: live inbound messages
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key);
    const channel = supabase
      .channel('scout-conversations-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scout_conversations' },
        (payload) => {
          const newMsg = payload.new as ScoutConversation;
          setConversations(prev => {
            if (prev.some(c => c.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const threads = useMemo(() => {
    const grouped = new Map<string, ScoutConversation[]>();
    for (const msg of conversations) {
      const existing = grouped.get(msg.phone_number) || [];
      existing.push(msg);
      grouped.set(msg.phone_number, existing);
    }

    const result: Thread[] = [];
    for (const [phone, msgs] of grouped) {
      const sorted = msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const lastMessage = sorted[sorted.length - 1];
      const profile = profiles.find((p) => p.phone_number === phone) || null;
      result.push({
        phone_number: phone,
        messages: sorted,
        lastMessage,
        profile,
        unreadCount: msgs.filter((m) => !m.read && m.direction === 'inbound').length,
        isFlagged: msgs.some((m) => m.flagged),
        linqLine: lastMessage.linq_line,
      });
    }

    return result.sort(
      (a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );
  }, [conversations, profiles]);

  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      if (lineFilter !== 'all' && t.linqLine !== lineFilter) return false;
      if (statusFilter === 'unread' && t.unreadCount === 0) return false;
      if (statusFilter === 'flagged' && !t.isFlagged) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = t.profile?.name.toLowerCase().includes(q);
        const phoneMatch = t.phone_number.includes(q);
        const msgMatch = t.messages.some((m) => m.message_body.toLowerCase().includes(q));
        if (!nameMatch && !phoneMatch && !msgMatch) return false;
      }
      return true;
    });
  }, [threads, lineFilter, statusFilter, searchQuery]);

  const activeThread = useMemo(
    () => threads.find((t) => t.phone_number === selectedThread) || null,
    [threads, selectedThread]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages.length]);

  useEffect(() => {
    const profileId = activeThread?.profile?.id;
    if (!showTurns || !profileId) {
      setTurns([]);
      return;
    }
    let cancelled = false;
    setTurnsLoading(true);
    fetch(`/api/scout/turns?profile_id=${profileId}&limit=20`)
      .then(r => r.json())
      .then(json => {
        if (!cancelled && json.data) setTurns(json.data);
      })
      .catch(err => console.error('Failed to fetch turn logs:', err))
      .finally(() => {
        if (!cancelled) setTurnsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showTurns, activeThread?.profile?.id]);

  async function handleSendReply() {
    if (!replyText.trim() || !selectedThread || sending) return;
    setSending(true);
    try {
      const chatId = activeThread?.messages[0]?.linq_chat_id;
      const res = await fetch('/api/scout/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId || undefined,
          to_phone: chatId ? undefined : selectedThread,
          message: replyText.trim(),
          from_phone: replyLine,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setConversations(prev => [...prev, json.data]);
      }
      setReplyText('');
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSending(false);
    }
  }

  async function handleMarkRead(phone: string) {
    const unreadMsgs = conversations.filter(c => c.phone_number === phone && !c.read && c.direction === 'inbound');
    setConversations(prev => prev.map(c => c.phone_number === phone ? { ...c, read: true } : c));
    for (const msg of unreadMsgs) {
      fetch('/api/scout/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: msg.id, read: true }),
      }).catch(() => {});
    }
  }

  function handleFlag(messageId: string) {
    setFlagTargetId(messageId);
    setFlagReason('');
    setShowFlagModal(true);
  }

  async function confirmFlag() {
    if (!flagTargetId) return;
    try {
      await fetch('/api/scout/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: flagTargetId, flagged: true, flag_reason: flagReason || 'Flagged by admin' }),
      });
      setConversations(prev =>
        prev.map(c => c.id === flagTargetId ? { ...c, flagged: true, flag_reason: flagReason || 'Flagged by admin' } : c)
      );
    } catch (err) {
      console.error('Failed to flag:', err);
    }
    setShowFlagModal(false);
    setFlagTargetId(null);
    setFlagReason('');
  }

  if (loading) {
    return (
      <div className="module-page">
        <div className="module-empty-state">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus/scout" className="module-back">
              <ArrowLeft size={20} />
              Back to Scout
            </Link>
            <Link href="/workspace" className="module-back">
              <LayoutDashboard size={20} />
              Workspace
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#3b82f615', color: '#3b82f6' }}>
              <MessageCircle size={24} />
            </div>
            <div>
              <h1>Conversations</h1>
              <p>{threads.length} threads across {SCOUT_LINES.length} lines</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        <div className="module-actions-bar">
          <div className="module-search">
            <Search size={18} />
            <input type="text" placeholder="Search conversations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <div className="module-actions">
            <select className="applications-filter-select" value={lineFilter} onChange={(e) => setLineFilter(e.target.value as LineFilter)}>
              <option value="all">All Lines</option>
              {SCOUT_LINES.map((line) => (<option key={line.phone} value={line.phone}>{line.label}</option>))}
            </select>
            <select className="applications-filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              <option value="all">All Status</option>
              <option value="unread">Unread</option>
              <option value="flagged">Flagged</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: selectedThread ? (showTurns ? '320px 1fr 300px' : '360px 1fr') : '1fr', gap: '0', background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', height: 'calc(100vh - 320px)', minHeight: '500px' }}>
          {/* Thread List */}
          <div style={{ borderRight: selectedThread ? '1px solid #e5e7eb' : 'none', overflowY: 'auto' }}>
            {filteredThreads.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af' }}>
                <MessageCircle size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                <p style={{ fontSize: '0.875rem' }}>No conversations yet. Add profiles and start messaging.</p>
              </div>
            ) : (
              filteredThreads.map((thread) => (
                <div
                  key={thread.phone_number}
                  onClick={() => { setSelectedThread(thread.phone_number); handleMarkRead(thread.phone_number); }}
                  style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: selectedThread === thread.phone_number ? '#f0f9ff' : 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                      {thread.profile?.name.charAt(0) || <User size={16} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: thread.unreadCount > 0 ? 700 : 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {thread.profile?.name || thread.phone_number}
                        </span>
                        {thread.isFlagged && <Flag size={12} style={{ color: '#ef4444', flexShrink: 0 }} />}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                        {thread.lastMessage.direction === 'outbound' && <span style={{ color: '#9ca3af' }}>You: </span>}
                        {thread.lastMessage.message_body}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>{formatTime(thread.lastMessage.created_at)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getLineColor(thread.linqLine) }} title={getLineLabel(thread.linqLine)} />
                        {thread.unreadCount > 0 && (
                          <span style={{ background: '#3b82f6', color: 'white', borderRadius: '10px', fontSize: '0.625rem', fontWeight: 700, padding: '1px 6px', minWidth: '16px', textAlign: 'center' }}>
                            {thread.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Message Detail Pane */}
          {selectedThread && activeThread && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '12px', background: '#fafafa' }}>
                <button onClick={() => setSelectedThread(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px', display: 'flex' }}>
                  <ArrowLeft size={18} />
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
                      {activeThread.profile?.name || activeThread.phone_number}
                    </span>
                    {activeThread.profile && (
                      <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: activeThread.profile.opt_in_status === 'opted_in' ? '#d1fae5' : activeThread.profile.opt_in_status === 'pending' ? '#fef3c7' : '#f3f4f6', color: activeThread.profile.opt_in_status === 'opted_in' ? '#065f46' : activeThread.profile.opt_in_status === 'pending' ? '#92400e' : '#6b7280' }}>
                        {activeThread.profile.opt_in_status}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {activeThread.phone_number}
                    {activeThread.profile && ` · ${activeThread.profile.university || ''} · ${activeThread.profile.chapter || ''}`}
                  </div>
                </div>
                {activeThread.profile && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowTurns(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e5e7eb', background: showTurns ? '#eff6ff' : 'white', fontSize: '0.75rem', color: '#374151', fontWeight: 500, cursor: 'pointer' }}
                    >
                      <List size={12} /> Turns
                    </button>
                    <Link href="/nucleus/scout/profiles" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e5e7eb', background: 'white', fontSize: '0.75rem', color: '#374151', textDecoration: 'none', fontWeight: 500 }}>
                      <User size={12} /> Profile
                    </Link>
                  </>
                )}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                {activeThread.messages.map((msg) => (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
                    <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: msg.direction === 'outbound' ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: msg.direction === 'outbound' ? '#1e40af' : '#f3f4f6', color: msg.direction === 'outbound' ? 'white' : '#111827', fontSize: '0.875rem', lineHeight: '1.5', position: 'relative', border: msg.flagged ? '2px solid #ef4444' : 'none' }}>
                      {msg.message_body}
                      {msg.flagged && (
                        <div style={{ position: 'absolute', top: '-8px', right: msg.direction === 'outbound' ? '-8px' : 'auto', left: msg.direction === 'inbound' ? '-8px' : 'auto' }}>
                          <Flag size={12} style={{ color: '#ef4444' }} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.6875rem', color: '#9ca3af' }}>
                      <span>{formatTime(msg.created_at)}</span>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: getLineColor(msg.linq_line) }} />
                      <span>{getLineLabel(msg.linq_line)}</span>
                      {!msg.flagged && msg.direction === 'inbound' && (
                        <button onClick={() => handleFlag(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '2px', display: 'flex' }} title="Flag this message">
                          <Flag size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb', background: '#fafafa' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <select value={replyLine} onChange={(e) => setReplyLine(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.75rem', fontWeight: 500, color: '#374151', background: 'white', cursor: 'pointer' }}>
                    {SCOUT_LINES.map((line) => (<option key={line.phone} value={line.phone}>{line.label}</option>))}
                  </select>
                  <div style={{ flex: 1 }}>
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a reply..."
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.875rem', resize: 'none', minHeight: '40px', maxHeight: '100px', fontFamily: 'inherit' }}
                      rows={1}
                    />
                  </div>
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || sending}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', border: 'none', background: replyText.trim() && !sending ? '#1e40af' : '#e5e7eb', color: replyText.trim() && !sending ? 'white' : '#9ca3af', cursor: replyText.trim() && !sending ? 'pointer' : 'default', flexShrink: 0 }}
                  >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}
          {selectedThread && showTurns && (
            <div style={{ borderLeft: '1px solid #e5e7eb', overflowY: 'auto', background: '#fafafa', padding: '12px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '10px' }}>
                Turn logs
              </div>
              {turnsLoading && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Loading…</div>
              )}
              {!turnsLoading && turns.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>No planner turns yet.</div>
              )}
              {turns.map(turn => {
                const names = Array.isArray(turn.tool_calls)
                  ? turn.tool_calls.map(t => t.name).filter(Boolean).join(', ')
                  : '';
                const ok = turn.validation?.ok;
                return (
                  <div key={turn.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', marginBottom: '8px', fontSize: '0.75rem' }}>
                    <div style={{ color: '#9ca3af', marginBottom: '6px' }}>
                      {new Date(turn.created_at).toLocaleString()}
                      {turn.latency_ms != null ? ` · ${turn.latency_ms}ms` : ''}
                      {turn.dry_run ? ' · dry-run' : ''}
                    </div>
                    {turn.inbound_text && (
                      <div style={{ marginBottom: '6px' }}>
                        <span style={{ color: '#6b7280' }}>In: </span>
                        {turn.inbound_text.slice(0, 180)}
                      </div>
                    )}
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ color: '#6b7280' }}>Tools: </span>
                      {names || '—'}
                    </div>
                    <div style={{ marginBottom: '6px' }}>
                      <span style={{ color: '#6b7280' }}>Validation: </span>
                      <span style={{ color: ok ? '#065f46' : '#991b1b' }}>
                        {ok ? 'ok' : (turn.validation?.skip_reason || (turn.validation?.reasons || []).join(', ') || 'n/a')}
                      </span>
                    </div>
                    {!turn.sent_text && (turn.validation?.skip_reason || (turn.validation?.reasons || []).length > 0) && (
                      <div style={{ marginBottom: '6px' }}>
                        <span style={{ color: '#6b7280' }}>Skip: </span>
                        {turn.validation?.skip_reason || (turn.validation?.reasons || []).join(', ')}
                      </div>
                    )}
                    <div>
                      <span style={{ color: '#6b7280' }}>Sent: </span>
                      {turn.sent_text || '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {showFlagModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowFlagModal(false)}>
          <div className="module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>Flag Message</h2>
              <button className="module-modal-close" onClick={() => setShowFlagModal(false)}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-group">
                <label>Reason (optional)</label>
                <textarea value={flagReason} onChange={(e) => setFlagReason(e.target.value)} placeholder="Why is this message being flagged?" rows={3} style={{ resize: 'vertical', width: '100%' }} />
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowFlagModal(false)}>Cancel</button>
              <button className="module-primary-btn" onClick={confirmFlag} style={{ background: '#ef4444' }}><Flag size={14} /> Flag Message</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
