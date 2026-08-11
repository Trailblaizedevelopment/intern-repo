'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  LayoutDashboard,
  GitPullRequest,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Clock,
  Check,
  Loader2,
} from 'lucide-react';

type TabType = 'pending' | 'history';

interface IntroProfile {
  id: string;
  name: string;
  phone_number: string;
  university: string | null;
  chapter: string | null;
  career_interest: string | null;
}

interface Introduction {
  id: string;
  requester: IntroProfile;
  target: IntroProfile;
  reason: string;
  status: 'suggested' | 'pending_approval' | 'sent' | 'accepted' | 'declined';
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  suggested: { bg: '#fef3c7', color: '#92400e', label: 'Suggested' },
  pending_approval: { bg: '#dbeafe', color: '#1e40af', label: 'Pending Approval' },
  sent: { bg: '#d1fae5', color: '#065f46', label: 'Sent' },
  accepted: { bg: '#d1fae5', color: '#065f46', label: 'Accepted' },
  declined: { bg: '#fee2e2', color: '#991b1b', label: 'Declined' },
};

export default function IntroductionsPage() {
  const [introductions, setIntroductions] = useState<Introduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('pending');

  useEffect(() => {
    async function fetchIntros() {
      try {
        const res = await fetch('/api/scout/introductions');
        const json = await res.json();
        if (json.data) setIntroductions(json.data);
      } catch (err) {
        console.error('Failed to fetch introductions:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchIntros();
  }, []);

  const pendingIntros = useMemo(
    () => introductions.filter((i) => i.status === 'suggested' || i.status === 'pending_approval'),
    [introductions]
  );

  const historyIntros = useMemo(
    () => introductions.filter((i) => i.status === 'sent' || i.status === 'accepted' || i.status === 'declined'),
    [introductions]
  );

  async function handleApprove(id: string) {
    try {
      const res = await fetch('/api/scout/introductions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'sent' }),
      });
      const json = await res.json();
      if (json.data) {
        setIntroductions(prev => prev.map(i => i.id === id ? json.data : i));
      }
    } catch (err) {
      console.error('Failed to approve:', err);
    }
  }

  async function handleDecline(id: string) {
    try {
      const res = await fetch('/api/scout/introductions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'declined' }),
      });
      const json = await res.json();
      if (json.data) {
        setIntroductions(prev => prev.map(i => i.id === id ? json.data : i));
      }
    } catch (err) {
      console.error('Failed to decline:', err);
    }
  }

  const tabStyle = (tab: TabType): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, background: activeTab === tab ? '#0F172A' : 'transparent', color: activeTab === tab ? 'white' : '#6B7280', transition: 'all 0.15s ease',
  });

  function IntroCard({ intro, showActions }: { intro: Introduction; showActions: boolean }) {
    const style = STATUS_STYLES[intro.status];
    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 600, color: '#1d4ed8', flexShrink: 0 }}>
                {intro.requester.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{intro.requester.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{intro.requester.university || ''} · {intro.requester.career_interest || ''}</div>
              </div>
            </div>
          </div>
          <ArrowRight size={16} style={{ color: '#d1d5db', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: 600, color: '#166534', flexShrink: 0 }}>
                {intro.target.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{intro.target.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{intro.target.university || ''} · {intro.target.career_interest || ''}</div>
              </div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: '0.8125rem', color: '#374151', margin: '0 0 12px', lineHeight: '1.5', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px', padding: '10px 12px' }}>
          {intro.reason}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '0.6875rem', fontWeight: 600, background: style.bg, color: style.color }}>{style.label}</span>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{formatDate(intro.created_at)}</span>
          </div>
          {showActions && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => handleApprove(intro.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <CheckCircle2 size={14} /> Approve
              </button>
              <button onClick={() => handleDecline(intro.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'white', color: '#EF4444', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <XCircle size={14} /> Decline
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="module-page">
        <div className="module-empty-state">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading introductions...</p>
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
            <div className="module-icon" style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}><GitPullRequest size={24} /></div>
            <div>
              <h1>Intro Queue</h1>
              <p>Review and approve suggested introductions between members.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        <div className="module-stats-row">
          <div className="module-stat">
            <span className="module-stat-value">{pendingIntros.length}</span>
            <span className="module-stat-label">Pending</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#10b981' }}>{introductions.filter(i => i.status === 'sent' || i.status === 'accepted').length}</span>
            <span className="module-stat-label">Sent/Accepted</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#ef4444' }}>{introductions.filter(i => i.status === 'declined').length}</span>
            <span className="module-stat-label">Declined</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px', padding: '4px', background: '#F3F4F6', borderRadius: '10px', width: 'fit-content', marginBottom: '20px' }}>
          <button style={tabStyle('pending')} onClick={() => setActiveTab('pending')}>
            <Clock size={15} /> Pending
            {pendingIntros.length > 0 && <span style={{ background: '#3b82f6', color: 'white', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', marginLeft: '2px' }}>{pendingIntros.length}</span>}
          </button>
          <button style={tabStyle('history')} onClick={() => setActiveTab('history')}><Check size={15} /> History</button>
        </div>

        {activeTab === 'pending' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {pendingIntros.length === 0 ? (
              <div className="module-empty-state"><GitPullRequest size={48} /><h3>No pending introductions</h3><p>All introduction requests have been reviewed.</p></div>
            ) : (
              pendingIntros.map(intro => <IntroCard key={intro.id} intro={intro} showActions={true} />)
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {historyIntros.length === 0 ? (
              <div className="module-empty-state"><GitPullRequest size={48} /><h3>No introduction history yet</h3><p>Approved and declined introductions will appear here.</p></div>
            ) : (
              historyIntros.map(intro => <IntroCard key={intro.id} intro={intro} showActions={false} />)
            )}
          </div>
        )}
      </main>
    </div>
  );
}
