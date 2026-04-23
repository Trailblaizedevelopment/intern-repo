'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Star,
  Users,
  TrendingUp,
  ClipboardList,
  ArrowRight,
  RefreshCw,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface Ambassador {
  id: string;
  name: string;
  school: string;
  contact: string;
  status: string;
  notes: string;
  signups?: number;
}

interface AmbassadorStats {
  total: number;
  active: number;
  pending: number;
  totalSignups: number;
  topAmbassadors: Ambassador[];
}

export function AmbassadorLeaderDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<AmbassadorStats>({
    total: 0,
    active: 0,
    pending: 0,
    totalSignups: 0,
    topAmbassadors: [],
  });
  const [loading, setLoading] = useState(true);
  const firstName = profile?.name?.split(' ')[0] || 'Leader';

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch('/api/ambassadors');
      const result = await res.json();
      const ambassadors: Ambassador[] = result.data || [];

      const active = ambassadors.filter((a) => a.status === 'active');
      const pending = ambassadors.filter((a) => a.status === 'pending');

      // Parse signups from notes if available
      const withSignups = active.map((a) => {
        let signups = 0;
        try {
          const parsed = JSON.parse(a.notes || '{}');
          signups = parseInt(parsed.signups || '0', 10) || 0;
        } catch (_e) {
          // notes isn't JSON — no signups stored
        }
        return { ...a, signups };
      });

      const totalSignups = withSignups.reduce((sum, a) => sum + (a.signups || 0), 0);
      const topAmbassadors = [...withSignups]
        .sort((a, b) => (b.signups || 0) - (a.signups || 0))
        .slice(0, 5);

      setStats({
        total: active.length,
        active: active.length,
        pending: pending.length,
        totalSignups,
        topAmbassadors,
      });
    } catch (err) {
      console.error('Error fetching ambassador stats:', err);
    }
    setLoading(false);
  }

  const statCards = [
    {
      label: 'Total Ambassadors',
      value: stats.total,
      color: '#10B981',
      icon: <Users size={20} color="#10B981" />,
    },
    {
      label: 'Total Sign-Ups',
      value: stats.totalSignups,
      color: '#3B82F6',
      icon: <TrendingUp size={20} color="#3B82F6" />,
    },
    {
      label: 'Pending Applications',
      value: stats.pending,
      color: stats.pending > 0 ? '#F59E0B' : '#6B7280',
      icon: <ClipboardList size={20} color={stats.pending > 0 ? '#F59E0B' : '#6B7280'} />,
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        fontFamily: 'Inter, system-ui, sans-serif',
        maxWidth: '900px',
      }}
    >
      {/* Welcome Banner */}
      <div
        style={{
          background: '#0F172A',
          borderRadius: '16px',
          padding: '28px 32px',
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '-40px',
            right: '-40px',
            width: '160px',
            height: '160px',
            borderRadius: '50%',
            background: 'rgba(16,185,129,0.08)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Star size={18} color="#F59E0B" />
          <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
            Ambassador Leader
          </span>
        </div>
        <h1
          style={{
            fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
            fontWeight: 700,
            margin: '0 0 8px',
            letterSpacing: '-0.01em',
          }}
        >
          Welcome back, {firstName} 👋
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)', margin: 0 }}>
          Here&apos;s a snapshot of your ambassador program today.
        </p>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
        }}
      >
        {statCards.map((card) => (
          <div
            key={card.label}
            style={{
              background: 'white',
              border: '1px solid #E5E7EB',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div style={{ marginBottom: '10px' }}>{card.icon}</div>
            <div
              style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                color: card.color,
                marginBottom: '4px',
                lineHeight: 1,
              }}
            >
              {loading ? '—' : card.value}
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 500 }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Top Ambassadors + Pending */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
        }}
      >
        {/* Top Performers */}
        <div
          style={{
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '18px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy size={16} color="#F59E0B" />
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                Top Ambassadors
              </h3>
            </div>
            <button
              onClick={fetchStats}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9CA3AF',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {loading ? (
            <div style={{ color: '#9CA3AF', fontSize: '0.875rem', textAlign: 'center', padding: '20px 0' }}>
              Loading...
            </div>
          ) : stats.topAmbassadors.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {stats.topAmbassadors.map((amb, i) => (
                <div
                  key={amb.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: '#F9FAFB',
                  }}
                >
                  <span
                    style={{
                      width: '22px',
                      fontSize: i < 3 ? '16px' : '0.75rem',
                      fontWeight: 700,
                      color: i === 0 ? '#F59E0B' : i === 1 ? '#9CA3AF' : i === 2 ? '#92400E' : '#9CA3AF',
                      textAlign: 'center',
                    }}
                  >
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: '#111827',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {amb.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{amb.school}</div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: '#10B981',
                    }}
                  >
                    {amb.signups || 0}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                color: '#9CA3AF',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '8px' }}>⭐</div>
              No ambassadors yet
            </div>
          )}
        </div>

        {/* Pending Applications */}
        <div
          style={{
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
            <ClipboardList size={16} color="#3B82F6" />
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Pending Applications
            </h3>
            {stats.pending > 0 && (
              <span
                style={{
                  background: '#DBEAFE',
                  color: '#3B82F6',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                }}
              >
                {stats.pending}
              </span>
            )}
          </div>

          {loading ? (
            <div style={{ color: '#9CA3AF', fontSize: '0.875rem', textAlign: 'center', padding: '20px 0' }}>
              Loading...
            </div>
          ) : stats.pending > 0 ? (
            <div>
              <div
                style={{
                  background: '#FEF3C7',
                  border: '1px solid #FDE68A',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '16px',
                  fontSize: '0.875rem',
                  color: '#92400E',
                  fontWeight: 500,
                }}
              >
                🔔 {stats.pending} ambassador{stats.pending !== 1 ? 's' : ''} waiting for review
              </div>
              <Link
                href="/nucleus/ambassadors"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  background: '#0F172A',
                  color: 'white',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                Review Applications
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                color: '#9CA3AF',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ fontSize: '1.75rem', marginBottom: '8px' }}>✅</div>
              No pending applications
            </div>
          )}

          {/* CTA to full tracker */}
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F3F4F6' }}>
            <Link
              href="/nucleus/ambassadors"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#3B82F6',
                textDecoration: 'none',
              }}
            >
              <Star size={13} />
              View Full Ambassador Tracker
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
