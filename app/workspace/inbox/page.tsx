'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Employee } from '@/lib/supabase';
import { useGoogleIntegration } from '../hooks/useGoogleIntegration';
import { isAutomatedEmail } from '@/lib/email-classify';
import type { GmailMessage } from '../hooks/useGoogleIntegration';
import {
  Inbox,
  Search,
  Mail,
  Reply,
  X,
  ExternalLink,
  RefreshCw,
  Link2,
  AlertCircle,
  Loader2,
  Check,
  MessageCircle,
  Inbox as InboxIcon,
  Bot,
  Trash2,
  ArrowRight,
} from 'lucide-react';

const STORAGE_MOVED = 'inbox_moved_threads';
const STORAGE_DISMISSED = 'inbox_dismissed_threads';

function getMovedThreads(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const s = localStorage.getItem(STORAGE_MOVED);
    return new Set(s ? JSON.parse(s) : []);
  } catch {
    return new Set();
  }
}

function setMovedThreads(threadIds: Set<string>) {
  localStorage.setItem(STORAGE_MOVED, JSON.stringify([...threadIds]));
}

function getDismissedThreads(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const s = localStorage.getItem(STORAGE_DISMISSED);
    return new Set(s ? JSON.parse(s) : []);
  } catch {
    return new Set();
  }
}

function setDismissedThreads(threadIds: Set<string>) {
  localStorage.setItem(STORAGE_DISMISSED, JSON.stringify([...threadIds]));
}

export default function InboxPage() {
  const { user } = useAuth();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'conversations' | 'new' | 'automated'>('conversations');

  // Selection state
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Array<GmailMessage & { body: string; to: string }>>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  // localStorage state (persisted)
  const [movedThreads, setMovedThreadsState] = useState<Set<string>>(new Set());
  const [dismissedThreads, setDismissedThreadsState] = useState<Set<string>>(new Set());

  const google = useGoogleIntegration(currentEmployee?.id);

  const fetchEmployee = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`/api/employees?email=${encodeURIComponent(user.email ?? '')}`);
      const { data } = await res.json();
      if (data && data.length > 0) {
        setCurrentEmployee(data[0]);
      } else {
        // fallback to first active employee
        const fallbackRes = await fetch('/api/employees?status=active');
        const fallbackJson = await fallbackRes.json();
        if (fallbackJson.data && fallbackJson.data.length > 0) setCurrentEmployee(fallbackJson.data[0]);
      }
    } catch (err) {
      console.error('Error fetching employee:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  useEffect(() => {
    setMovedThreadsState(getMovedThreads());
    setDismissedThreadsState(getDismissedThreads());
  }, []);

  const moveToConversations = useCallback((threadId: string) => {
    const next = new Set(movedThreads);
    next.add(threadId);
    setMovedThreadsState(next);
    setMovedThreads(next);
    setActiveTab('conversations');
    setSelectedThreadId(threadId);
  }, [movedThreads]);

  const dismissFromNew = useCallback((threadId: string) => {
    const next = new Set(dismissedThreads);
    next.add(threadId);
    setDismissedThreadsState(next);
    setDismissedThreads(next);
    setSelectedEmailId(null);
  }, [dismissedThreads]);

  // Group emails by thread - latest message per thread
  const threadsByThreadId = useMemo(() => {
    const map = new Map<string, GmailMessage>();
    for (const e of google.emails) {
      const existing = map.get(e.threadId);
      if (!existing || new Date(e.date) > new Date(existing.date)) {
        map.set(e.threadId, e);
      }
    }
    return map;
  }, [google.emails]);

  // Classify and split
  // Conversations = ALL human email threads (your existing inbox)
  // New = human threads needing triage (not yet moved or dismissed)
  // Automated = verification codes, notifications, etc.
  const { conversationThreads, newThreads, automatedThreads } = useMemo(() => {
    const moved = movedThreads;
    const dismissed = dismissedThreads;
    const conv: GmailMessage[] = [];
    const newList: GmailMessage[] = [];
    const auto: GmailMessage[] = [];

    threadsByThreadId.forEach((latest, threadId) => {
      const automated = isAutomatedEmail(latest);
      if (automated) {
        auto.push(latest);
      } else {
        conv.push(latest); // All human threads go to Conversations
        if (!moved.has(threadId) && !dismissed.has(threadId)) {
          newList.push(latest); // New = needs triage (move or dismiss)
        }
      }
    });

    conv.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    newList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    auto.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      conversationThreads: conv,
      newThreads: newList,
      automatedThreads: auto,
    };
  }, [threadsByThreadId, movedThreads, dismissedThreads]);

  const filterBySearch = useCallback(
    (list: GmailMessage[]) => {
      if (!searchQuery) return list;
      const q = searchQuery.toLowerCase();
      return list.filter(
        (e) =>
          e.subject.toLowerCase().includes(q) ||
          e.from.toLowerCase().includes(q) ||
          e.snippet.toLowerCase().includes(q)
      );
    },
    [searchQuery]
  );

  const filteredConversations = filterBySearch(conversationThreads);
  const filteredNew = filterBySearch(newThreads);
  const filteredAutomated = filterBySearch(automatedThreads);

  const selectedConversation = selectedThreadId
    ? conversationThreads.find((t) => t.threadId === selectedThreadId)
    : null;
  const selectedNewEmail = selectedEmailId ? google.emails.find((e) => e.id === selectedEmailId) : null;
  const selectedAutomatedEmail = selectedEmailId && activeTab === 'automated'
    ? google.emails.find((e) => e.id === selectedEmailId)
    : null;

  const openThread = useCallback(
    async (threadId: string) => {
      setSelectedThreadId(threadId);
      setSelectedEmailId(null);
      setThreadLoading(true);
      const messages = await google.fetchThread(threadId);
      setThreadMessages(messages || []);
      setThreadLoading(false);
    },
    [google.fetchThread]
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getAvatarColor = (email: string) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'];
    let hash = 0;
    for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);

  const isOurEmail = (fromEmail: string) =>
    currentEmployee?.email && fromEmail.toLowerCase().includes(currentEmployee.email.toLowerCase());

  if (loading) {
    return (
      <div className="ws-loading">
        <div className="ws-loading-spinner" />
        <p>Loading inbox...</p>
      </div>
    );
  }

  return (
    <div className="ws-gmail-page">
      <header className="ws-gmail-header">
        <div className="ws-gmail-header-left">
          <h1>
            <Mail size={24} />
            Inbox
          </h1>
          {google.status?.connected && google.unreadCount > 0 && (
            <span className="ws-gmail-unread-badge">{google.unreadCount}</span>
          )}
        </div>
        <div className="ws-gmail-header-right">
          {google.status?.connected && (
            <>
              <a href="https://mail.google.com/mail/?view=cm&fs=1" target="_blank" rel="noopener noreferrer" className="ws-gmail-compose-btn">
                <ExternalLink size={18} />
                Compose
              </a>
              <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer" className="ws-gmail-open-btn">
                <ExternalLink size={16} />
                Open Gmail
              </a>
            </>
          )}
        </div>
      </header>

      {!google.status?.connected ? (
        <div className="ws-gmail-connect-container">
          <div className="ws-gmail-connect-card">
            <div className="ws-gmail-connect-icon">
              <svg width="64" height="64" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"
                />
              </svg>
            </div>
            <h2>Connect Your Gmail</h2>
            <p>Read and manage your inbox directly from Trailblaize. Reply and compose in Gmail.</p>
            <ul className="ws-gmail-features">
              <li><Check size={16} /> Read and manage your inbox</li>
              <li><Check size={16} /> Quick reply via Gmail redirect</li>
              <li><Check size={16} /> Secure OAuth 2.0 connection</li>
              <li><Check size={16} /> Real-time sync with Gmail</li>
            </ul>
            <button className="ws-gmail-connect-main-btn" onClick={google.connect}>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      ) : google.error ? (
        <div className="ws-gmail-connect-container">
          <div className="ws-gmail-connect-card ws-gmail-error-card">
            <AlertCircle size={48} className="ws-gmail-error-icon" />
            <h2>Connection Error</h2>
            <p>{google.error}</p>
            <button className="ws-gmail-connect-main-btn" onClick={google.connect}>
              <Link2 size={18} />
              Reconnect Gmail
            </button>
          </div>
        </div>
      ) : (
        <div className="ws-gmail-interface">
          {/* Tabs */}
          <nav className="ws-inbox-tabs" role="tablist" aria-label="Inbox categories">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'conversations'}
              className={`ws-inbox-tab ${activeTab === 'conversations' ? 'active' : ''}`}
              onClick={() => { setActiveTab('conversations'); setSelectedThreadId(null); setSelectedEmailId(null); }}
            >
              <MessageCircle size={18} aria-hidden />
              <span>Conversations</span>
              <span className="ws-inbox-tab-count">{filteredConversations.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'new'}
              className={`ws-inbox-tab ${activeTab === 'new' ? 'active' : ''}`}
              onClick={() => { setActiveTab('new'); setSelectedThreadId(null); setSelectedEmailId(null); }}
            >
              <InboxIcon size={18} aria-hidden />
              <span>New</span>
              <span className="ws-inbox-tab-count">{filteredNew.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'automated'}
              className={`ws-inbox-tab ${activeTab === 'automated' ? 'active' : ''}`}
              onClick={() => { setActiveTab('automated'); setSelectedThreadId(null); setSelectedEmailId(null); }}
            >
              <Bot size={18} aria-hidden />
              <span>Automated</span>
              <span className="ws-inbox-tab-count">{filteredAutomated.length}</span>
            </button>
          </nav>

          <div className="ws-gmail-toolbar">
            <div className="ws-gmail-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="ws-gmail-toolbar-actions">
              <span className="ws-gmail-count-label">
                {google.unreadCount} unread
              </span>
              <button
                className={`ws-gmail-refresh-btn ${google.gmailLoading ? 'loading' : ''}`}
                onClick={google.fetchEmails}
                disabled={google.gmailLoading}
              >
                <RefreshCw size={16} className={google.gmailLoading ? 'spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          <div className="ws-gmail-content">
            {/* List panel */}
            <div className={`ws-gmail-list ${selectedThreadId || selectedEmailId ? 'has-selection' : ''}`}>
              {google.gmailLoading && google.emails.length === 0 ? (
                <div className="ws-gmail-loading-state">
                  <Loader2 size={32} className="spin" />
                  <p>Loading emails...</p>
                </div>
              ) : (
                <>
                  {activeTab === 'conversations' && (
                    filteredConversations.length === 0 ? (
                      <div className="ws-gmail-empty-state">
                        <MessageCircle size={48} />
                        <h3>No conversations yet</h3>
                        <p>Your human email threads will appear here</p>
                      </div>
                    ) : (
                      filteredConversations.map((email) => (
                        <div
                          key={email.threadId}
                          className={`ws-gmail-list-item ${selectedThreadId === email.threadId ? 'selected' : ''} ${email.isUnread ? 'unread' : ''}`}
                          onClick={() => openThread(email.threadId)}
                        >
                          <div className="ws-gmail-list-avatar" style={{ backgroundColor: getAvatarColor(email.fromEmail) }}>
                            {getInitials(email.from)}
                          </div>
                          <div className="ws-gmail-list-content">
                            <div className="ws-gmail-list-header">
                              <span className="ws-gmail-list-from">{email.from}</span>
                              <span className="ws-gmail-list-date">{formatDate(email.date)}</span>
                            </div>
                            <span className="ws-gmail-list-subject">{email.subject || '(No subject)'}</span>
                            <span className="ws-gmail-list-snippet">{email.snippet}</span>
                          </div>
                          {email.isUnread && <div className="ws-gmail-unread-dot" />}
                        </div>
                      ))
                    )
                  )}
                  {activeTab === 'new' && (
                    filteredNew.length === 0 ? (
                      <div className="ws-gmail-empty-state">
                        <InboxIcon size={48} />
                        <h3>No new emails</h3>
                        <p>Human emails will appear here. Move to Conversations or dismiss.</p>
                      </div>
                    ) : (
                      filteredNew.map((email) => (
                        <div
                          key={email.id}
                          className={`ws-gmail-list-item ${selectedEmailId === email.id ? 'selected' : ''} ${email.isUnread ? 'unread' : ''}`}
                          onClick={() => { setSelectedEmailId(email.id); setSelectedThreadId(null); }}
                        >
                          <div className="ws-gmail-list-avatar" style={{ backgroundColor: getAvatarColor(email.fromEmail) }}>
                            {getInitials(email.from)}
                          </div>
                          <div className="ws-gmail-list-content">
                            <div className="ws-gmail-list-header">
                              <span className="ws-gmail-list-from">{email.from}</span>
                              <span className="ws-gmail-list-date">{formatDate(email.date)}</span>
                            </div>
                            <span className="ws-gmail-list-subject">{email.subject || '(No subject)'}</span>
                            <span className="ws-gmail-list-snippet">{email.snippet}</span>
                          </div>
                          {email.isUnread && <div className="ws-gmail-unread-dot" />}
                        </div>
                      ))
                    )
                  )}
                  {activeTab === 'automated' && (
                    filteredAutomated.length === 0 ? (
                      <div className="ws-gmail-empty-state">
                        <Bot size={48} />
                        <h3>No automated emails</h3>
                        <p>Verification codes, notifications, and promotions go here</p>
                      </div>
                    ) : (
                      filteredAutomated.map((email) => (
                        <div
                          key={email.id}
                          className={`ws-gmail-list-item ${selectedEmailId === email.id ? 'selected' : ''} ${email.isUnread ? 'unread' : ''}`}
                          onClick={() => { setSelectedEmailId(email.id); setSelectedThreadId(null); }}
                        >
                          <div className="ws-gmail-list-avatar ws-gmail-list-avatar-auto" style={{ backgroundColor: '#94a3b8' }}>
                            <Bot size={14} />
                          </div>
                          <div className="ws-gmail-list-content">
                            <div className="ws-gmail-list-header">
                              <span className="ws-gmail-list-from">{email.from}</span>
                              <span className="ws-gmail-list-date">{formatDate(email.date)}</span>
                            </div>
                            <span className="ws-gmail-list-subject">{email.subject || '(No subject)'}</span>
                            <span className="ws-gmail-list-snippet">{email.snippet}</span>
                          </div>
                          {email.isUnread && <div className="ws-gmail-unread-dot" />}
                        </div>
                      ))
                    )
                  )}
                </>
              )}
            </div>

            {/* Detail panel - Conversations: chat style */}
            {activeTab === 'conversations' && selectedThreadId && (
              <div className="ws-gmail-detail ws-gmail-detail-chat">
                <div className="ws-gmail-detail-header">
                  <button className="ws-gmail-back-btn" onClick={() => { setSelectedThreadId(null); setThreadMessages([]); }}>
                    <X size={18} />
                  </button>
                  <span className="ws-gmail-detail-title">
                    {selectedConversation?.subject || '(No subject)'}
                  </span>
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${selectedThreadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ws-gmail-detail-action"
                    title="Open in Gmail"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
                <div className="ws-gmail-chat-messages">
                  {threadLoading ? (
                    <div className="ws-gmail-chat-loading">
                      <Loader2 size={24} className="spin" />
                      <p>Loading thread...</p>
                    </div>
                  ) : (
                    threadMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`ws-gmail-chat-bubble ${isOurEmail(msg.fromEmail) ? 'ours' : 'theirs'}`}
                      >
                        {!isOurEmail(msg.fromEmail) && (
                          <div className="ws-gmail-chat-avatar" style={{ backgroundColor: getAvatarColor(msg.fromEmail) }}>
                            {getInitials(msg.from)}
                          </div>
                        )}
                        <div className="ws-gmail-chat-bubble-content">
                          <div className="ws-gmail-chat-meta">
                            <span className="ws-gmail-chat-from">{msg.from}</span>
                            <span className="ws-gmail-chat-date">{new Date(msg.date).toLocaleString()}</span>
                          </div>
                          <div className="ws-gmail-chat-body">
                            {(msg.body || msg.snippet)?.replace(/<[^>]+>/g, ' ').slice(0, 800)}
                            {(msg.body || msg.snippet)?.length > 800 && '...'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="ws-gmail-detail-footer">
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${selectedThreadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ws-gmail-reply-btn"
                  >
                    <Reply size={16} />
                    Reply in Gmail
                  </a>
                </div>
              </div>
            )}

            {/* Detail panel - New: single email + Move / Delete */}
            {activeTab === 'new' && selectedNewEmail && (
              <div className="ws-gmail-detail">
                <div className="ws-gmail-detail-header">
                  <button className="ws-gmail-back-btn" onClick={() => setSelectedEmailId(null)}>
                    <X size={18} />
                  </button>
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${selectedNewEmail.threadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ws-gmail-detail-action"
                    title="Open in Gmail"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
                <div className="ws-gmail-detail-content">
                  <h2 className="ws-gmail-detail-subject">{selectedNewEmail.subject || '(No subject)'}</h2>
                  <div className="ws-gmail-detail-meta">
                    <div
                      className="ws-gmail-detail-avatar"
                      style={{ backgroundColor: getAvatarColor(selectedNewEmail.fromEmail) }}
                    >
                      {getInitials(selectedNewEmail.from)}
                    </div>
                    <div className="ws-gmail-detail-sender">
                      <span className="ws-gmail-detail-name">{selectedNewEmail.from}</span>
                      <span className="ws-gmail-detail-email">{selectedNewEmail.fromEmail}</span>
                    </div>
                    <span className="ws-gmail-detail-date">{new Date(selectedNewEmail.date).toLocaleString()}</span>
                  </div>
                  <div className="ws-gmail-detail-body">
                    <p>{selectedNewEmail.snippet}</p>
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${selectedNewEmail.threadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ws-gmail-read-more"
                    >
                      Read full email in Gmail
                      <ExternalLink size={14} />
                    </a>
                  </div>
                  <div className="ws-gmail-detail-footer ws-gmail-detail-footer-actions">
                    <button
                      className="ws-gmail-move-btn"
                      onClick={() => {
                        moveToConversations(selectedNewEmail.threadId);
                        setSelectedEmailId(null);
                      }}
                    >
                      <ArrowRight size={16} />
                      Move to Conversations
                    </button>
                    <button
                      className="ws-gmail-delete-btn"
                      onClick={() => dismissFromNew(selectedNewEmail.threadId)}
                    >
                      <Trash2 size={16} />
                      Dismiss
                    </button>
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${selectedNewEmail.threadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ws-gmail-reply-btn"
                      onClick={() => moveToConversations(selectedNewEmail.threadId)}
                    >
                      <Reply size={16} />
                      Reply in Gmail
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Detail panel - Automated: read-only */}
            {activeTab === 'automated' && selectedAutomatedEmail && (
              <div className="ws-gmail-detail">
                <div className="ws-gmail-detail-header">
                  <button className="ws-gmail-back-btn" onClick={() => setSelectedEmailId(null)}>
                    <X size={18} />
                  </button>
                  <a
                    href={`https://mail.google.com/mail/u/0/#inbox/${selectedAutomatedEmail.threadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ws-gmail-detail-action"
                    title="Open in Gmail"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
                <div className="ws-gmail-detail-content">
                  <h2 className="ws-gmail-detail-subject">{selectedAutomatedEmail.subject || '(No subject)'}</h2>
                  <div className="ws-gmail-detail-meta">
                    <div className="ws-gmail-detail-avatar ws-gmail-detail-avatar-auto">
                      <Bot size={18} />
                    </div>
                    <div className="ws-gmail-detail-sender">
                      <span className="ws-gmail-detail-name">{selectedAutomatedEmail.from}</span>
                      <span className="ws-gmail-detail-email">{selectedAutomatedEmail.fromEmail}</span>
                    </div>
                    <span className="ws-gmail-detail-date">{new Date(selectedAutomatedEmail.date).toLocaleString()}</span>
                  </div>
                  <div className="ws-gmail-detail-body">
                    <p>{selectedAutomatedEmail.snippet}</p>
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${selectedAutomatedEmail.threadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ws-gmail-read-more"
                    >
                      Read full email in Gmail
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
