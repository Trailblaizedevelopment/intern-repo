'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { Brain, Loader2, Plus, Send, Wrench, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const DEV_CONSOLE_EMAIL = 'devin@trailblaize.net';
const CONVERSATION_KEY = 'brain-conversation-id';

interface DisplayMessage {
  role: 'user' | 'assistant';
  text: string;
  tools?: Array<{ name: string; connector?: string; ok: boolean }>;
}

interface ConnectorStatus {
  id: string;
  label: string;
  kind: string;
  available: boolean;
  toolCount: number;
}

interface ConnectorsMeta {
  linear_read_only?: boolean;
  rate_limits?: { per_minute: number; per_hour: number };
}

const SUGGESTIONS = [
  'What tickets are due this week?',
  "What's assigned to me right now?",
  'Search Linear for open bugs',
  'Create a Linear ticket: test Brain write mode — low priority, Trailblaize team',
];

export default function DevConsolePage() {
  const { profile, session, loading: authLoading } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
  const [connectorsMeta, setConnectorsMeta] = useState<ConnectorsMeta>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isDevin = profile?.email?.toLowerCase() === DEV_CONSOLE_EMAIL;

  // Server enforces access on every request; this is just UX routing.
  useEffect(() => {
    if (!authLoading && profile && !isDevin) {
      router.replace('/workspace');
    }
  }, [authLoading, profile, isDevin, router]);

  const authHeaders = useCallback((): Record<string, string> => {
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
      : { 'Content-Type': 'application/json' };
  }, [session]);

  // Restore the previous conversation on mount
  useEffect(() => {
    if (!session?.access_token || !isDevin) return;
    let cancelled = false;

    (async () => {
      try {
        const savedId = localStorage.getItem(CONVERSATION_KEY);
        const qs = savedId ? `?conversation_id=${encodeURIComponent(savedId)}` : '';
        const res = await fetch(`/api/brain/chat${qs}`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.conversation_id) {
          setConversationId(data.conversation_id);
          localStorage.setItem(CONVERSATION_KEY, data.conversation_id);
          setMessages(data.messages || []);
        }
      } catch {
        // Fresh chat is fine
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, isDevin, authHeaders]);

  // Load connector status
  useEffect(() => {
    if (!session?.access_token || !isDevin) return;
    fetch('/api/brain/connectors', { headers: authHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.connectors) setConnectors(data.connectors);
        if (data) {
          setConnectorsMeta({
            linear_read_only: data.linear_read_only,
            rate_limits: data.rate_limits,
          });
        }
      })
      .catch(() => {});
  }, [session, isDevin, authHeaders]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;

      setError(null);
      setInput('');
      setSending(true);
      setMessages(prev => [...prev, { role: 'user', text: message }]);

      try {
        const res = await fetch('/api/brain/chat', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ message, conversation_id: conversationId }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || `Request failed (${res.status})`);
          return;
        }

        setConversationId(data.conversation_id);
        localStorage.setItem(CONVERSATION_KEY, data.conversation_id);
        setMessages(data.messages || []);
      } catch {
        setError('Network error — check your connection and try again.');
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [sending, conversationId, authHeaders]
  );

  const newChat = () => {
    setConversationId(null);
    localStorage.removeItem(CONVERSATION_KEY);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  if (authLoading || (profile && !isDevin)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#6B7280' }}>
        <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white',
            }}
          >
            <Brain size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>Trailblaize Brain</h1>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#6B7280' }}>
              Linear MCP — {connectorsMeta.linear_read_only === false ? 'write mode' : 'read-only'}
              {connectorsMeta.rate_limits
                ? ` · ${connectorsMeta.rate_limits.per_minute}/min cap`
                : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {connectors.map(c => (
            <span
              key={c.id}
              title={`${c.label} — ${c.toolCount} tools`}
              style={{
                fontSize: '0.6875rem', fontWeight: 600, padding: '3px 8px', borderRadius: 999,
                background: c.available ? '#ECFDF5' : '#F3F4F6',
                color: c.available ? '#065F46' : '#9CA3AF',
              }}
            >
              {c.id} {c.available ? `(${c.toolCount})` : 'off'}
            </span>
          ))}
          <button
          onClick={newChat}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
            border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: '0.8125rem',
            fontWeight: 500, cursor: 'pointer',
          }}
        >
          <Plus size={15} /> New chat
        </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 14,
          background: '#FAFAFA', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        {restoring ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9CA3AF', fontSize: '0.85rem' }}>
            <Loader2 size={16} style={{ marginRight: 8, animation: 'spin 1s linear infinite' }} /> Loading conversation…
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16 }}>
            <p style={{ color: '#6B7280', fontSize: '0.9rem', margin: 0 }}>
              Ask about the ticket board — due dates, assignments, priorities.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 520 }}>
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    padding: '8px 14px', borderRadius: 999, border: '1px solid #E5E7EB', background: 'white',
                    color: '#374151', fontSize: '0.8125rem', cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) =>
            msg.role === 'user' ? (
              <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
                <div
                  style={{
                    background: '#4F46E5', color: 'white', padding: '10px 14px', borderRadius: '14px 14px 4px 14px',
                    fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '85%' }}>
                {msg.tools && msg.tools.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    {msg.tools.map((t, j) => (
                      <span
                        key={j}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
                          fontSize: '0.6875rem', fontWeight: 500,
                          background: t.ok ? '#EEF2FF' : '#FEE2E2', color: t.ok ? '#4338CA' : '#991B1B',
                        }}
                      >
                        <Wrench size={10} /> {t.connector ? `${t.connector}:` : ''}{t.name.replace(/^linear_/, '')}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className="brain-md"
                  style={{
                    background: 'white', border: '1px solid #E5E7EB', padding: '10px 14px',
                    borderRadius: '14px 14px 14px 4px', fontSize: '0.875rem', lineHeight: 1.55, color: '#1F2937',
                  }}
                >
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              </div>
            )
          )
        )}

        {sending && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: '#6B7280', fontSize: '0.8125rem', padding: '4px 6px' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Thinking…
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '9px 12px', borderRadius: 10,
            background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '0.8125rem',
          }}
        >
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-end' }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask about tickets… (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{
            flex: 1, resize: 'none', padding: '11px 14px', borderRadius: 12, border: '1px solid #E5E7EB',
            fontSize: '0.875rem', fontFamily: 'inherit', lineHeight: 1.4, outline: 'none', background: 'white',
            minHeight: 44, maxHeight: 130,
          }}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44,
            borderRadius: 12, border: 'none', cursor: sending || !input.trim() ? 'default' : 'pointer',
            background: sending || !input.trim() ? '#E5E7EB' : '#4F46E5',
            color: sending || !input.trim() ? '#9CA3AF' : 'white', flexShrink: 0,
          }}
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </form>

      <style jsx global>{`
        .brain-md p { margin: 0 0 8px; }
        .brain-md p:last-child { margin-bottom: 0; }
        .brain-md ul, .brain-md ol { margin: 4px 0 8px; padding-left: 20px; }
        .brain-md li { margin-bottom: 3px; }
        .brain-md code {
          background: #F3F4F6; padding: 1px 5px; border-radius: 4px;
          font-size: 0.8125rem; font-family: ui-monospace, monospace;
        }
        .brain-md h1, .brain-md h2, .brain-md h3 { font-size: 0.9375rem; margin: 10px 0 6px; }
        .brain-md table { border-collapse: collapse; margin: 6px 0; font-size: 0.8125rem; }
        .brain-md th, .brain-md td { border: 1px solid #E5E7EB; padding: 4px 8px; text-align: left; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
