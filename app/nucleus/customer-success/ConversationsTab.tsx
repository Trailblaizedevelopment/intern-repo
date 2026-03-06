'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, Search, RefreshCw, Flag, FlagOff, Send, X,
  Phone, User, Loader2, AlertTriangle,
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────────────

const LINES = [
  { number: 1, label: 'Owen', phone: '+16462408056' },
  { number: 2, label: 'Adam', phone: '+16462668785' },
  { number: 3, label: 'Ford', phone: '+16462442696' },
] as const;

const LINE_PHONES = new Set<string>(LINES.map(l => l.phone));

const LINE_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: '#ede9fe', text: '#7c3aed' },
  2: { bg: '#dbeafe', text: '#1d4ed8' },
  3: { bg: '#d1fae5', text: '#065f46' },
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface Conversation {
  chat_id: string;
  line_number: number;
  line_label: string;
  phone: string | null;
  service: string | null;
  contact_id: string | null;
  contact_name: string | null;
  chapter_id: string | null;
  chapter_name: string | null;
  flagged: boolean;
  flagged_reason: string | null;
  last_response_text: string | null;
  last_response_at: string | null;
  updated_at: string;
  is_archived: boolean;
}

interface LinqMessage {
  id: string;
  chat_id: string;
  from: string;
  parts: { type: string; value: string }[];
  created_at: string;
}

interface ConversationsTabProps {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// ─── Helper functions ───────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function messageText(msg: LinqMessage): string {
  return msg.parts.filter(p => p.type === 'text').map(p => p.value).join(' ');
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ConversationsTab({ showToast }: ConversationsTabProps) {
  // Sub-tabs
  const [subTab, setSubTab] = useState<'all' | 'flagged'>('all');

  // Conversation list state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lineFilter, setLineFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected conversation + messages
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<LinqMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [showConfirmSend, setShowConfirmSend] = useState(false);

  // Flag state
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagging, setFlagging] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (lineFilter !== 'all') params.set('line', lineFilter);
      if (searchQuery) params.set('search', searchQuery);
      // Always fetch all; sub-tab filtering is client-side for snappy toggling
      const res = await fetch(`/api/linq/conversations?${params}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || json.error);
      setConversations(json.data || []);
    } catch (e) {
      showToast(`Failed to load conversations: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [lineFilter, searchQuery, showToast]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (chatId: string) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      const res = await fetch(`/api/linq/messages?chat_id=${encodeURIComponent(chatId)}&limit=60`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || json.error);
      setMessages(json.data || []);
    } catch (e) {
      showToast('Failed to load messages', 'error');
    } finally {
      setLoadingMessages(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (selected) fetchMessages(selected.chat_id);
  }, [selected?.chat_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!selected || !replyText.trim()) return;
    setSendingReply(true);
    setShowConfirmSend(false);
    try {
      const res = await fetch('/api/linq/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: selected.chat_id, message: replyText.trim() }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      showToast('Message sent', 'success');
      setReplyText('');
      fetchMessages(selected.chat_id);
    } catch (e) {
      showToast(`Failed to send: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setSendingReply(false);
    }
  }

  async function handleFlag(unflag = false) {
    if (!selected?.contact_id) {
      showToast('No contact record linked to this conversation — cannot flag', 'error');
      return;
    }
    setFlagging(true);
    try {
      const res = await fetch('/api/linq/flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: selected.contact_id,
          flagged: !unflag,
          flagged_reason: unflag ? null : (flagReason.trim() || null),
        }),
      });
      const json = await res.json();
      if (json.error) {
        if (json.schema_required) {
          showToast('⚠️ Schema migration required — ask Tony to add flagged columns to alumni_contacts', 'error');
        } else {
          throw new Error(json.error);
        }
        return;
      }
      const label = unflag ? 'Conversation unflagged' : 'Flagged for Owen review';
      showToast(label, 'success');
      setShowFlagModal(false);
      setFlagReason('');

      // Update local state optimistically
      const updated: Conversation = {
        ...selected,
        flagged: !unflag,
        flagged_reason: unflag ? null : (flagReason.trim() || null),
      };
      setSelected(updated);
      setConversations(prev =>
        prev.map(c => c.chat_id === selected.chat_id ? updated : c)
      );
    } catch (e) {
      showToast(`Flag failed: ${e instanceof Error ? e.message : e}`, 'error');
    } finally {
      setFlagging(false);
    }
  }

  // ── Filtered display list ─────────────────────────────────────────────────

  const displayed = conversations
    .filter(c => {
      if (subTab === 'flagged' && !c.flagged) return false;
      return true;
    })
    .sort((a, b) => {
      // In the All sub-tab, float flagged to top; within groups sort by recency
      if (subTab === 'all') {
        if (a.flagged && !b.flagged) return -1;
        if (!a.flagged && b.flagged) return 1;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  const flaggedCount = conversations.filter(c => c.flagged).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 240px)',
        minHeight: 520,
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {/* ══ Left panel: conversation list ══════════════════════════════════ */}
      <div
        style={{
          width: 340,
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafafa',
        }}
      >
        {/* Sub-tab toggle */}
        <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid #f0f0f0' }}>
          <div
            style={{
              display: 'flex',
              background: '#f3f4f6',
              borderRadius: 8,
              padding: 3,
              gap: 3,
            }}
          >
            {(['all', 'flagged'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSubTab(tab)}
                style={{
                  flex: 1,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  background: subTab === tab ? '#fff' : 'transparent',
                  color:
                    subTab === tab
                      ? tab === 'flagged' ? '#d97706' : '#111827'
                      : '#6b7280',
                  boxShadow: subTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {tab === 'flagged' && <Flag size={12} />}
                {tab === 'all' ? 'All' : 'Flagged'}
                {tab === 'flagged' && flaggedCount > 0 && (
                  <span
                    style={{
                      background: '#fef3c7',
                      color: '#d97706',
                      borderRadius: 10,
                      padding: '0 5px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      minWidth: 16,
                      textAlign: 'center',
                    }}
                  >
                    {flaggedCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 10px 6px' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: 9,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
                pointerEvents: 'none',
              }}
            />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Name, phone, or chapter…"
              style={{
                width: '100%',
                padding: '6px 8px 6px 28px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: '0.8rem',
                outline: 'none',
                background: '#fff',
                boxSizing: 'border-box',
                color: '#111827',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 7,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#9ca3af',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Line filter pills */}
        <div style={{ padding: '0 10px 8px', display: 'flex', gap: 4, alignItems: 'center' }}>
          {(['all', '1', '2', '3'] as const).map(l => {
            const active = lineFilter === l;
            const lineNum = parseInt(l as string);
            const colors = LINE_COLORS[lineNum] || { bg: '#f3f4f6', text: '#6b7280' };
            const lbl = l === 'all' ? 'All' : LINES.find(x => x.number === lineNum)?.label;
            return (
              <button
                key={l}
                onClick={() => setLineFilter(l)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 20,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  background: active
                    ? l === 'all' ? '#111827' : colors.bg
                    : '#f3f4f6',
                  color: active
                    ? l === 'all' ? '#fff' : colors.text
                    : '#6b7280',
                  transition: 'all 0.15s',
                }}
              >
                {lbl}
              </button>
            );
          })}
          <button
            onClick={fetchConversations}
            title="Refresh"
            style={{
              marginLeft: 'auto',
              padding: '3px 7px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: '#fff',
              cursor: 'pointer',
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={11} />
          </button>
        </div>

        {/* ── List ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 140,
                color: '#9ca3af',
                gap: 8,
                fontSize: '0.875rem',
              }}
            >
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : displayed.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: 160,
                color: '#9ca3af',
                gap: 8,
              }}
            >
              {subTab === 'flagged' ? (
                <Flag size={28} style={{ opacity: 0.3 }} />
              ) : (
                <MessageSquare size={28} style={{ opacity: 0.3 }} />
              )}
              <p style={{ margin: 0, fontSize: '0.875rem' }}>
                {subTab === 'flagged' ? 'No flagged conversations' : 'No conversations found'}
              </p>
            </div>
          ) : (
            displayed.map(conv => {
              const isSelected = selected?.chat_id === conv.chat_id;
              const lineColors = LINE_COLORS[conv.line_number] || { bg: '#f3f4f6', text: '#6b7280' };

              return (
                <div
                  key={conv.chat_id}
                  onClick={() => setSelected(conv)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0',
                    borderLeft: isSelected
                      ? '3px solid #3b82f6'
                      : conv.flagged
                      ? '3px solid #f59e0b'
                      : '3px solid transparent',
                    background: isSelected
                      ? '#eff6ff'
                      : conv.flagged
                      ? '#fffbeb'
                      : '#fafafa',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    {/* Avatar */}
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: conv.flagged ? '#fef3c7' : '#e9eaf0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: conv.flagged ? '#d97706' : '#64748b',
                      }}
                    >
                      {conv.contact_name ? (
                        getInitials(conv.contact_name)
                      ) : (
                        <Phone size={14} />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Row 1: name + timestamp */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 6,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: '0.8375rem',
                            color: '#111827',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1,
                          }}
                        >
                          {conv.contact_name || conv.phone || 'Unknown'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            color: '#9ca3af',
                            flexShrink: 0,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatTime(conv.updated_at)}
                        </span>
                      </div>

                      {/* Row 2: chapter + line badge + flag icon */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          marginTop: 2,
                        }}
                      >
                        {conv.chapter_name && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              color: '#6b7280',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              flex: 1,
                            }}
                          >
                            {conv.chapter_name}
                          </span>
                        )}
                        <span
                          style={{
                            background: lineColors.bg,
                            color: lineColors.text,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '1px 6px',
                            borderRadius: 10,
                            flexShrink: 0,
                          }}
                        >
                          {conv.line_label}
                        </span>
                        {conv.flagged && (
                          <Flag size={11} style={{ color: '#d97706', flexShrink: 0 }} />
                        )}
                      </div>

                      {/* Row 3 (Flagged sub-tab only): flag reason */}
                      {subTab === 'flagged' && conv.flagged_reason && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: '0.72rem',
                            color: '#b45309',
                            background: '#fef3c7',
                            borderRadius: 4,
                            padding: '2px 6px',
                            display: 'inline-block',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conv.flagged_reason}
                        </div>
                      )}

                      {/* Row 3 (All sub-tab): last response snippet */}
                      {subTab === 'all' && conv.last_response_text && (
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: '0.75rem',
                            color: '#9ca3af',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {conv.last_response_text.slice(0, 60)}
                          {conv.last_response_text.length > 60 ? '…' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer count */}
        {!loading && displayed.length > 0 && (
          <div
            style={{
              padding: '6px 12px',
              borderTop: '1px solid #f0f0f0',
              fontSize: '0.75rem',
              color: '#9ca3af',
              background: '#fafafa',
            }}
          >
            {displayed.length} conversation{displayed.length !== 1 ? 's' : ''}
            {subTab === 'flagged' && ' flagged'}
          </div>
        )}
      </div>

      {/* ══ Right panel: conversation detail ════════════════════════════════ */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: '#fff',
        }}
      >
        {!selected ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              gap: 12,
            }}
          >
            <MessageSquare size={44} style={{ opacity: 0.25 }} />
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              Select a conversation to view the thread
            </p>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: '#fafafa',
                flexShrink: 0,
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: selected.flagged ? '#fef3c7' : '#e9eaf0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: selected.flagged ? '#d97706' : '#374151',
                }}
              >
                {selected.contact_name ? getInitials(selected.contact_name) : <User size={18} />}
              </div>

              {/* Contact info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '0.9375rem',
                    color: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  {selected.contact_name || selected.phone || 'Unknown Contact'}
                  {selected.flagged && (
                    <span
                      style={{
                        background: '#fef3c7',
                        color: '#d97706',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 10,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Flag size={10} /> Flagged
                    </span>
                  )}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 2,
                    flexWrap: 'wrap',
                  }}
                >
                  {selected.phone && selected.contact_name && (
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{selected.phone}</span>
                  )}
                  {selected.chapter_name && (
                    <>
                      {(selected.phone && selected.contact_name) && (
                        <span style={{ color: '#d1d5db' }}>·</span>
                      )}
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{selected.chapter_name}</span>
                    </>
                  )}
                  <span
                    style={{
                      background: LINE_COLORS[selected.line_number]?.bg || '#f3f4f6',
                      color: LINE_COLORS[selected.line_number]?.text || '#374151',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '1px 8px',
                      borderRadius: 10,
                    }}
                  >
                    {selected.line_label}
                  </span>
                </div>
                {selected.flagged && selected.flagged_reason && (
                  <div style={{ marginTop: 3, fontSize: '0.8rem', color: '#d97706' }}>
                    Reason: {selected.flagged_reason}
                  </div>
                )}
              </div>

              {/* Flag / Unflag button */}
              <button
                onClick={() => (selected.flagged ? handleFlag(true) : setShowFlagModal(true))}
                disabled={flagging || !selected.contact_id}
                title={
                  !selected.contact_id
                    ? 'No contact record — cannot flag unknown number'
                    : undefined
                }
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: `1px solid ${selected.flagged ? '#fbbf24' : '#e5e7eb'}`,
                  background: selected.flagged ? '#fef3c7' : '#fff',
                  color: selected.flagged ? '#d97706' : '#6b7280',
                  cursor: flagging || !selected.contact_id ? 'not-allowed' : 'pointer',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0,
                  opacity: !selected.contact_id ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {flagging ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : selected.flagged ? (
                  <FlagOff size={14} />
                ) : (
                  <Flag size={14} />
                )}
                {selected.flagged ? 'Unflag' : 'Flag for Review'}
              </button>
            </div>

            {/* Messages thread */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {loadingMessages ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#9ca3af',
                    gap: 8,
                  }}
                >
                  <Loader2 size={18} className="animate-spin" /> Loading messages…
                </div>
              ) : messages.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#9ca3af',
                    fontSize: '0.875rem',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <MessageSquare size={28} style={{ opacity: 0.3 }} />
                  No messages in this thread yet.
                </div>
              ) : (
                messages.map(msg => {
                  const isOutbound = LINE_PHONES.has(msg.from);
                  const text = messageText(msg);
                  const senderLine = LINES.find(l => l.phone === msg.from);
                  if (!text) return null;

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        flexDirection: isOutbound ? 'row-reverse' : 'row',
                        alignItems: 'flex-end',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '72%',
                          padding: '10px 14px',
                          borderRadius: isOutbound
                            ? '18px 4px 18px 18px'
                            : '4px 18px 18px 18px',
                          background: isOutbound ? '#1e293b' : '#f3f4f6',
                          color: isOutbound ? '#f8fafc' : '#111827',
                          fontSize: '0.875rem',
                          lineHeight: 1.55,
                        }}
                      >
                        <div>{text}</div>
                        <div
                          style={{
                            fontSize: '0.68rem',
                            color: isOutbound ? 'rgba(248,250,252,0.45)' : '#9ca3af',
                            marginTop: 5,
                            textAlign: isOutbound ? 'right' : 'left',
                          }}
                        >
                          {new Date(msg.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                          {isOutbound && senderLine && ` · ${senderLine.label}`}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply area */}
            <div
              style={{
                padding: '10px 16px 12px',
                borderTop: '1px solid #e5e7eb',
                background: '#fafafa',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  ref={replyRef}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={`Reply via ${selected.line_label}'s line…`}
                  rows={2}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (replyText.trim()) setShowConfirmSend(true);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 10,
                    resize: 'none',
                    fontSize: '0.875rem',
                    outline: 'none',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    background: '#fff',
                    color: '#111827',
                  }}
                />
                <button
                  onClick={() => replyText.trim() && setShowConfirmSend(true)}
                  disabled={!replyText.trim() || sendingReply}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 10,
                    border: 'none',
                    background: replyText.trim() && !sendingReply ? '#1e293b' : '#e5e7eb',
                    color: replyText.trim() && !sendingReply ? '#fff' : '#9ca3af',
                    cursor: replyText.trim() && !sendingReply ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                >
                  {sendingReply ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  Send
                </button>
              </div>
              <p style={{ margin: '5px 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>
                No emojis · Shift+Enter for new line · Enter to confirm send
              </p>
            </div>
          </>
        )}
      </div>

      {/* ══ Confirm send modal ═══════════════════════════════════════════════ */}
      {showConfirmSend && selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowConfirmSend(false)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: '24px 28px',
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#f0f9ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#3b82f6',
                }}
              >
                <Send size={16} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                Confirm Send
              </h3>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: '#4b5563' }}>
              Send to{' '}
              <strong>{selected.contact_name || selected.phone}</strong> via{' '}
              <strong>{selected.line_label}&apos;s line</strong>?
            </p>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 18,
                fontSize: '0.875rem',
                color: '#374151',
                fontStyle: 'italic',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              &ldquo;{replyText.trim()}&rdquo;
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirmSend(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  color: '#374151',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sendingReply}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#1e293b',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {sendingReply ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                Send Message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Flag modal ═══════════════════════════════════════════════════════ */}
      {showFlagModal && selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => { setShowFlagModal(false); setFlagReason(''); }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: '24px 28px',
              maxWidth: 420,
              width: '90%',
              boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#fef3c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#d97706',
                }}
              >
                <Flag size={16} />
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                Flag for Review
              </h3>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '0.875rem', color: '#4b5563' }}>
              Flag <strong>{selected.contact_name || selected.phone}</strong> so Owen or the team
              can follow up.
            </p>
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: '#374151',
                  marginBottom: 6,
                }}
              >
                Reason <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                value={flagReason}
                onChange={e => setFlagReason(e.target.value)}
                placeholder="e.g. Interested — needs follow-up call"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleFlag()}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: '0.875rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: '#111827',
                }}
              />
            </div>
            {!selected.contact_id && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '8px 12px',
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: '0.8125rem',
                  color: '#9a3412',
                }}
              >
                <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                No alumni_contacts record linked. Schema migration required to enable flagging.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowFlagModal(false); setFlagReason(''); }}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  color: '#374151',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleFlag()}
                disabled={flagging}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#d97706',
                  color: '#fff',
                  cursor: flagging ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {flagging ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Flag size={14} />
                )}
                Flag Conversation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
