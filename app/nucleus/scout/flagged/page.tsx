'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  LayoutDashboard,
  AlertTriangle,
  Flag,
  CheckCircle2,
  Send,
  Ban,
  X,
  Loader2,
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import {
  ScoutConversation,
  getLineLabel,
  getLineColor,
} from '../mock-data';

interface FlaggedProfile {
  id: string;
  name: string;
  phone_number: string;
  opt_in_status: string;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function FlaggedQueuePage() {
  const [conversations, setConversations] = useState<ScoutConversation[]>([]);
  const [allConversations, setAllConversations] = useState<ScoutConversation[]>([]);
  const [profiles, setProfiles] = useState<FlaggedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [blockConfirm, setBlockConfirm] = useState<{ show: boolean; phone: string | null }>({ show: false, phone: null });

  useEffect(() => {
    async function fetchData() {
      try {
        const [flaggedRes, allRes, profileRes] = await Promise.all([
          fetch('/api/scout/conversations?flagged=true&limit=200'),
          fetch('/api/scout/conversations?limit=500'),
          fetch('/api/scout/profiles?limit=200'),
        ]);
        const flaggedJson = await flaggedRes.json();
        const allJson = await allRes.json();
        const profileJson = await profileRes.json();
        if (flaggedJson.data) setConversations(flaggedJson.data);
        if (allJson.data) setAllConversations(allJson.data);
        if (profileJson.data) setProfiles(profileJson.data);
      } catch (err) {
        console.error('Failed to fetch flagged data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const flaggedMessages = useMemo(() => {
    return conversations.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [conversations]);

  const uniqueFlagged = useMemo(() => {
    const seen = new Set<string>();
    return flaggedMessages.filter((msg) => {
      if (seen.has(msg.phone_number)) return false;
      seen.add(msg.phone_number);
      return true;
    });
  }, [flaggedMessages]);

  function getThreadContext(flaggedMsg: ScoutConversation): ScoutConversation[] {
    const thread = allConversations
      .filter(c => c.phone_number === flaggedMsg.phone_number)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const idx = thread.findIndex(c => c.id === flaggedMsg.id);
    // Wider context window around the flagged message
    const start = Math.max(0, idx - 5);
    const end = Math.min(thread.length, idx + 4);
    return thread.slice(start, end);
  }

  async function handleResolve(messageId: string) {
    try {
      await fetch('/api/scout/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: messageId, flagged: false, flag_reason: null }),
      });
      setConversations(prev => prev.filter(c => c.id !== messageId));
    } catch (err) {
      console.error('Failed to resolve:', err);
    }
  }

  async function handleReply(phone: string) {
    if (!replyText.trim()) return;
    try {
      const res = await fetch('/api/scout/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_phone: phone, message: replyText.trim(), from_phone: '+16462101111' }),
      });
      const json = await res.json();
      if (json.data) {
        setAllConversations(prev => [...prev, json.data]);
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
    }
    setReplyText('');
    setReplyingTo(null);
  }

  async function handleBlock(phone: string) {
    try {
      const profile = profiles.find(p => p.phone_number === phone);
      if (profile) {
        await fetch('/api/scout/profiles', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: profile.id, opt_in_status: 'opted_out' }),
        });
      }
      // Resolve all flagged messages for this phone
      const flaggedForPhone = conversations.filter(c => c.phone_number === phone);
      for (const msg of flaggedForPhone) {
        await fetch('/api/scout/conversations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: msg.id, flagged: false, flag_reason: null }),
        });
      }
      setConversations(prev => prev.filter(c => c.phone_number !== phone));
    } catch (err) {
      console.error('Failed to block:', err);
    }
    setBlockConfirm({ show: false, phone: null });
  }

  if (loading) {
    return (
      <div className="module-page">
        <div className="module-empty-state">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading flagged queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus/scout" className="module-back"><ArrowLeft size={20} /> Back to Scout</Link>
            <Link href="/workspace" className="module-back"><LayoutDashboard size={20} /> Workspace</Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#ef444415', color: '#ef4444' }}><AlertTriangle size={24} /></div>
            <div>
              <h1>Flagged Queue</h1>
              <p>{uniqueFlagged.length} flagged conversation{uniqueFlagged.length !== 1 ? 's' : ''} requiring attention</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {uniqueFlagged.length === 0 ? (
          <div className="module-empty-state">
            <CheckCircle2 size={48} style={{ color: '#10b981' }} />
            <h3>All clear</h3>
            <p>No flagged conversations at this time.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {uniqueFlagged.map((flaggedMsg) => {
              const profile = profiles.find(p => p.phone_number === flaggedMsg.phone_number);
              const context = getThreadContext(flaggedMsg);

              return (
                <div key={flaggedMsg.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 20px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Flag size={14} style={{ color: '#ef4444' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#991b1b' }}>
                      {flaggedMsg.flag_reason || 'Flagged by admin'}
                    </span>
                  </div>

                  <div style={{ padding: '12px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>
                      {profile?.name.charAt(0) || '?'}
                    </div>
                    <div>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                        {profile?.name || flaggedMsg.phone_number}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#6b7280' }}>
                        <span>{flaggedMsg.phone_number}</span>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: getLineColor(flaggedMsg.linq_line) }} />
                        <span>{getLineLabel(flaggedMsg.linq_line)}&apos;s line</span>
                        {profile && (
                          <>
                            <span>·</span>
                            <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: 600, background: profile.opt_in_status === 'opted_in' ? '#d1fae5' : profile.opt_in_status === 'pending' ? '#fef3c7' : '#f3f4f6', color: profile.opt_in_status === 'opted_in' ? '#065f46' : profile.opt_in_status === 'pending' ? '#92400e' : '#6b7280' }}>
                              {profile.opt_in_status.replace('_', ' ')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '16px 20px' }}>
                    {context.map((msg) => (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
                        <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: msg.direction === 'outbound' ? '10px 10px 2px 10px' : '10px 10px 10px 2px', background: msg.id === flaggedMsg.id ? '#fef2f2' : msg.direction === 'outbound' ? '#1e40af' : '#f3f4f6', color: msg.id === flaggedMsg.id ? '#991b1b' : msg.direction === 'outbound' ? 'white' : '#111827', fontSize: '0.8125rem', lineHeight: '1.4', border: msg.id === flaggedMsg.id ? '1px solid #fecaca' : 'none' }}>
                          {msg.message_body}
                        </div>
                        <span style={{ fontSize: '0.625rem', color: '#9ca3af', marginTop: '2px' }}>
                          {formatTime(msg.created_at)} · {msg.direction}
                        </span>
                      </div>
                    ))}
                  </div>

                  {replyingTo === flaggedMsg.phone_number && (
                    <div style={{ padding: '0 20px 12px', display: 'flex', gap: '8px' }}>
                      <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Type a reply..." onKeyDown={(e) => { if (e.key === 'Enter') handleReply(flaggedMsg.phone_number); }} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.8125rem', fontFamily: 'inherit' }} autoFocus />
                      <button onClick={() => handleReply(flaggedMsg.phone_number)} disabled={!replyText.trim()} style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#1e40af', color: 'white', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Send</button>
                      <button onClick={() => { setReplyingTo(null); setReplyText(''); }} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e5e7eb', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={14} /></button>
                    </div>
                  )}

                  <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '8px', background: '#fafafa' }}>
                    <button onClick={() => handleResolve(flaggedMsg.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <CheckCircle2 size={14} /> Resolve
                    </button>
                    <button onClick={() => { setReplyingTo(flaggedMsg.phone_number); setReplyText(''); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'white', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Send size={14} /> Reply
                    </button>
                    <button onClick={() => setBlockConfirm({ show: true, phone: flaggedMsg.phone_number })} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'white', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <Ban size={14} /> Block
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <ConfirmModal
        isOpen={blockConfirm.show}
        title="Block Contact"
        message="Are you sure you want to block this contact? They will be opted out and will no longer receive messages from Scout."
        confirmText="Block"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => blockConfirm.phone && handleBlock(blockConfirm.phone)}
        onCancel={() => setBlockConfirm({ show: false, phone: null })}
      />
    </div>
  );
}
