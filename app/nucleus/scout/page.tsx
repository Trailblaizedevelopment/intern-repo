'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  LayoutDashboard,
  MessageCircle,
  Users,
  GitPullRequest,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { SCOUT_LINES, getLineColor } from './mock-data';

interface ScoutStats {
  messages_today: Record<string, number>;
  messages_today_total: number;
  active_convos: number;
  response_rate: number;
  opt_out_count: number;
  total_profiles: number;
  flagged_count: number;
  pending_intros: number;
  unread_count: number;
}

export default function ScoutDashboard() {
  const [stats, setStats] = useState<ScoutStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/scout/stats');
        const json = await res.json();
        if (json.data) setStats(json.data);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="module-page">
        <div className="module-empty-state">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading Scout dashboard...</p>
        </div>
      </div>
    );
  }

  const optOutRate = stats && stats.total_profiles > 0
    ? Math.round((stats.opt_out_count / stats.total_profiles) * 100)
    : 0;

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus" className="module-back">
              <ArrowLeft size={20} />
              Back to Nucleus
            </Link>
            <Link href="/workspace" className="module-back">
              <LayoutDashboard size={20} />
              Back to Workspace
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#3b82f615', color: '#3b82f6' }}>
              <MessageCircle size={24} />
            </div>
            <div>
              <h1>Scout</h1>
              <p>AI networking assistant — manage conversations, profiles, and introductions at scale.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* Stats Row */}
        <div className="module-stats-row">
          <div className="module-stat">
            <span className="module-stat-value">{stats?.messages_today_total ?? 0}</span>
            <span className="module-stat-label">Sent Today</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{stats?.active_convos ?? 0}</span>
            <span className="module-stat-label">Active Threads</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#10b981' }}>{stats?.response_rate ?? 0}%</span>
            <span className="module-stat-label">Response Rate</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#f59e0b' }}>{optOutRate}%</span>
            <span className="module-stat-label">Opt-Out Rate</span>
          </div>
          <Link href="/nucleus/scout/flagged" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="module-stat" style={{ cursor: 'pointer' }}>
              <span className="module-stat-value" style={{ color: '#ef4444' }}>{stats?.flagged_count ?? 0}</span>
              <span className="module-stat-label">Flagged</span>
            </div>
          </Link>
          <Link href="/nucleus/scout/introductions" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="module-stat" style={{ cursor: 'pointer' }}>
              <span className="module-stat-value" style={{ color: '#8b5cf6' }}>{stats?.pending_intros ?? 0}</span>
              <span className="module-stat-label">Pending Intros</span>
            </div>
          </Link>
        </div>

        {/* Line Health */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
            Line Health
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {SCOUT_LINES.map((line) => {
              const sentToday = stats?.messages_today[line.phone] ?? 0;
              const usage = sentToday / line.daily_limit;
              const statusColor = usage >= 0.9 ? '#ef4444' : usage >= 0.7 ? '#f59e0b' : '#10b981';
              return (
                <div
                  key={line.phone}
                  style={{
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getLineColor(line.phone) }} />
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{line.label}</span>
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>{line.phone}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(usage * 100, 100)}%`, height: '100%', background: statusColor, borderRadius: '3px', transition: 'width 0.3s ease' }} />
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: statusColor }}>
                      {sentToday}/{line.daily_limit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Links */}
        <div>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>
            Quick Links
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {[
              { href: '/nucleus/scout/conversations', icon: MessageCircle, title: 'Conversations', description: 'View and manage all Scout conversations across lines.', color: '#3b82f6' },
              { href: '/nucleus/scout/profiles', icon: Users, title: 'Member Profiles', description: 'Browse and edit member profiles, track completeness.', color: '#10b981' },
              { href: '/nucleus/scout/introductions', icon: GitPullRequest, title: 'Intro Queue', description: 'Review and approve pending introductions.', color: '#8b5cf6' },
              { href: '/nucleus/scout/flagged', icon: AlertTriangle, title: 'Flagged Queue', description: 'Handle flagged conversations and opt-out requests.', color: '#ef4444' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', background: 'white', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${link.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: link.color, flexShrink: 0 }}>
                  <link.icon size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{link.title}</div>
                  <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '2px' }}>{link.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
