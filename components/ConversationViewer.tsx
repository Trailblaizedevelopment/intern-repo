'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Send, RefreshCw, User, AlertTriangle, CheckCircle2, MessageCircle } from 'lucide-react';
import { AlumniContact, OUTREACH_STATUS_CONFIG, OutreachStatus, SENDING_LINES } from '@/lib/supabase';

interface Message {
  id: string;
  conversation_id: string;
  direction: 'outbound' | 'inbound';
  body: string;
  sent_at: string;
  delivery_status: string;
  service: string;
  sender_line: string;
}

interface ConversationViewerProps {
  contact: AlumniContact;
  onClose: () => void;
  onStatusChange?: (contactId: string, status: OutreachStatus) => void;
  onRefresh?: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  if (diff < 7 * 86400000) return d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + time;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
}

export default function ConversationViewer({ contact, onClose, onStatusChange, onRefresh }: ConversationViewerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lineName = contact.assigned_line
    ? SENDING_LINES.find(l => l.number === contact.assigned_line)?.label || '?'
    : 'Unassigned';

  useEffect(() => {
    fetchMessages();
  }, [contact.id]);

  useEffect(() => {
    // Scroll to bottom when messages load
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchMessages() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/outreach/conversations?contact_id=${contact.id}`);
      const json = await res.json();
      if (json.data?.messages) {
        // Sort chronologically
        const sorted = [...json.data.messages].sort(
          (a: Message, b: Message) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        );
        setMessages(sorted);
      } else if (json.error) {
        setError(json.error.message);
      }
    } catch {
      setError('Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendReply() {
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/outreach/send-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id, message: replyText.trim() }),
      });
      const json = await res.json();
      if (json.data?.success) {
        setReplyText('');
        // Refresh messages after a short delay to let the API propagate
        setTimeout(fetchMessages, 1000);
      } else {
        setError(json.error?.message || 'Failed to send reply');
      }
    } catch {
      setError('Network error sending reply');
    } finally {
      setSending(false);
    }
  }

  async function handleStatusUpdate(newStatus: OutreachStatus) {
    try {
      await fetch('/api/alumni', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [contact.id], updates: { outreach_status: newStatus } }),
      });
      onStatusChange?.(contact.id, newStatus);
    } catch {
      setError('Failed to update status');
    }
  }

  const statusCfg = OUTREACH_STATUS_CONFIG[contact.outreach_status];
  const hasConvo = contact.provider_conversation_id || contact.linq_chat_id;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#fff', borderLeft: '1px solid #e5e7eb',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
        display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%', background: '#ede9fe',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={18} style={{ color: '#7c3aed' }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                {contact.first_name} {contact.last_name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {contact.phone_primary || 'No phone'} · Line: {lineName}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
            color: '#9ca3af', borderRadius: '4px',
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Status + quick actions */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            padding: '3px 10px', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600,
            color: statusCfg.color, backgroundColor: statusCfg.bg,
          }}>
            {statusCfg.label}
          </span>
          {contact.response_classification && (
            <span style={{
              padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
              color: '#6b7280', backgroundColor: '#f3f4f6',
            }}>
              {contact.response_classification}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            <button
              onClick={() => handleStatusUpdate('wrong_number')}
              title="Mark as Wrong Number"
              style={{
                padding: '4px 8px', borderRadius: '6px', border: '1px solid #fecaca',
                background: '#fff', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600,
                color: '#dc2626',
              }}
            >
              Wrong #
            </button>
            <button
              onClick={() => handleStatusUpdate('opted_out')}
              title="Mark as Opted Out"
              style={{
                padding: '4px 8px', borderRadius: '6px', border: '1px solid #e5e7eb',
                background: '#fff', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600,
                color: '#6b7280',
              }}
            >
              Opt Out
            </button>
            <button
              onClick={() => handleStatusUpdate('signed_up')}
              title="Mark as Signed Up"
              style={{
                padding: '4px 8px', borderRadius: '6px', border: '1px solid #bbf7d0',
                background: '#fff', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 600,
                color: '#16a34a',
              }}
            >
              Signed Up
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: '8px',
          background: '#f9fafb',
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginRight: '8px' }} />
            Loading messages...
          </div>
        ) : !hasConvo ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', textAlign: 'center', gap: '8px' }}>
            <MessageCircle size={32} />
            <div style={{ fontSize: '0.875rem' }}>No conversation yet</div>
            <div style={{ fontSize: '0.75rem' }}>Send a Touch 1 to start the conversation</div>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', textAlign: 'center', gap: '8px' }}>
            <MessageCircle size={32} />
            <div style={{ fontSize: '0.875rem' }}>No messages found</div>
            <button onClick={fetchMessages} style={{
              padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280',
            }}>
              <RefreshCw size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
              Retry
            </button>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isOutbound = msg.direction === 'outbound';
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: isOutbound ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: isOutbound ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isOutbound ? '#3b82f6' : '#fff',
                    color: isOutbound ? '#fff' : '#1f2937',
                    border: isOutbound ? 'none' : '1px solid #e5e7eb',
                    fontSize: '0.8125rem',
                    lineHeight: 1.5,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  }}>
                    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.body}</div>
                    <div style={{
                      fontSize: '0.65rem', marginTop: '4px',
                      color: isOutbound ? 'rgba(255,255,255,0.7)' : '#9ca3af',
                      textAlign: isOutbound ? 'right' : 'left',
                    }}>
                      {formatTime(msg.sent_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '8px 16px', background: '#fef2f2', borderTop: '1px solid #fecaca',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#dc2626',
        }}>
          <AlertTriangle size={14} />
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Reply input */}
      {hasConvo && (
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #e5e7eb',
          display: 'flex', gap: '8px', alignItems: 'flex-end', flexShrink: 0,
        }}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendReply();
              }
            }}
            placeholder="Type a reply..."
            rows={1}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '20px',
              border: '1px solid #d1d5db', fontSize: '0.8125rem', resize: 'none',
              lineHeight: 1.4, maxHeight: '80px', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSendReply}
            disabled={!replyText.trim() || sending}
            style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: replyText.trim() ? '#3b82f6' : '#e5e7eb',
              border: 'none', cursor: replyText.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'background 0.15s ease',
            }}
          >
            {sending ? (
              <RefreshCw size={16} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} />
            ) : (
              <Send size={16} style={{ color: replyText.trim() ? '#fff' : '#9ca3af' }} />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
