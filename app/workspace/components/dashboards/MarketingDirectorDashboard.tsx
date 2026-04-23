'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Palette,
  ImageIcon,
  Calendar,
  Users,
  Megaphone,
  ArrowRight,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface MarketingStats {
  totalAssets: number;
  scheduledPosts: number;
  activeCollabs: number;
  activeCampaigns: number;
}

function getMarketingStats(): MarketingStats {
  try {
    const assets = JSON.parse(localStorage.getItem('tb_studio_assets') || '[]');
    const calendar = JSON.parse(localStorage.getItem('tb_studio_calendar') || '[]');
    const collabs = JSON.parse(localStorage.getItem('tb_studio_collabs') || '[]');
    const campaigns = JSON.parse(localStorage.getItem('tb_studio_campaigns') || '[]');

    const scheduledPosts = calendar.filter((e: { status: string }) => e.status === 'Scheduled').length;
    const activeCollabs = collabs.filter((c: { status: string }) => c.status !== 'Posted').length;
    const activeCampaigns = campaigns.filter((c: { status: string }) => c.status === 'Active').length;

    return {
      totalAssets: assets.length,
      scheduledPosts,
      activeCollabs,
      activeCampaigns,
    };
  } catch {
    return { totalAssets: 0, scheduledPosts: 0, activeCollabs: 0, activeCampaigns: 0 };
  }
}

export function MarketingDirectorDashboard() {
  const { profile } = useAuth();
  const firstName = profile?.name?.split(' ')[0] || 'Director';
  const [stats, setStats] = useState<MarketingStats>({ totalAssets: 0, scheduledPosts: 0, activeCollabs: 0, activeCampaigns: 0 });

  function refresh() {
    setStats(getMarketingStats());
  }

  useEffect(() => {
    refresh();
  }, []);

  const statCards = [
    {
      label: 'Total Assets',
      value: stats.totalAssets,
      color: '#7C3AED',
      icon: <ImageIcon size={20} color="#7C3AED" />,
    },
    {
      label: 'Scheduled Posts',
      value: stats.scheduledPosts,
      color: '#3B82F6',
      icon: <Calendar size={20} color="#3B82F6" />,
    },
    {
      label: 'Collab Posts Pending',
      value: stats.activeCollabs,
      color: stats.activeCollabs > 0 ? '#F59E0B' : '#10B981',
      icon: <Users size={20} color={stats.activeCollabs > 0 ? '#F59E0B' : '#10B981'} />,
    },
    {
      label: 'Active Campaigns',
      value: stats.activeCampaigns,
      color: '#10B981',
      icon: <Megaphone size={20} color="#10B981" />,
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
            background: 'rgba(124,58,237,0.12)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Palette size={18} color="#A78BFA" />
          <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>
            Marketing Director
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
          Welcome back, {firstName} 🎨
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)', margin: 0 }}>
          Your creative command center — assets, collabs, campaigns, all in one place.
        </p>
      </div>

      {/* Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
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
              {card.value}
            </div>
            <div style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 500 }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
        }}
      >
        {/* Go to Creative Studio */}
        <div
          style={{
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Palette size={16} color="#7C3AED" />
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                Creative Studio
              </h3>
            </div>
            <button
              onClick={refresh}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '4px', display: 'flex', alignItems: 'center' }}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: '0 0 16px', lineHeight: 1.5 }}>
            Manage assets, content calendar, chapter collabs, and campaigns.
          </p>
          <Link
            href="/workspace/socials"
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
            Open Creative Studio
            <ArrowRight size={14} />
          </Link>
        </div>

        {/* Collab checklist reminder */}
        <div
          style={{
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <TrendingUp size={16} color="#3B82F6" />
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Collab Posts
            </h3>
            {stats.activeCollabs > 0 && (
              <span
                style={{
                  background: '#FEF3C7',
                  color: '#92400E',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                }}
              >
                {stats.activeCollabs} pending
              </span>
            )}
          </div>
          {stats.activeCollabs > 0 ? (
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
                🤝 {stats.activeCollabs} chapter collab post{stats.activeCollabs !== 1 ? 's' : ''} need attention
              </div>
              <Link
                href="/workspace/socials"
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
                View Chapter Collabs
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#9CA3AF', fontSize: '0.875rem' }}>
              <div style={{ fontSize: '1.75rem', marginBottom: '8px' }}>✅</div>
              All collab posts are up to date!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
