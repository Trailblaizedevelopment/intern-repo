'use client';

import React, { useState, useEffect } from 'react';
import {
  Trophy,
  TrendingUp,
  Users,
  Star,
  Gift,
  Link as LinkIcon,
  Copy,
  Check,
  ExternalLink,
  Package,
  ChevronRight,
  X,
  Loader2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AmbassadorProfile {
  name: string;
  phone: string;
  email: string;
  school: string;
  instagram: string;
  signups: number;
  joined: string;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  school: string;
  signups: number;
  isMe?: boolean;
}

// ─── Level System ─────────────────────────────────────────────────────────────

const LEVELS = [
  { name: 'Starter',  min: 0,   max: 10,  color: '#6B7280', bg: '#F3F4F6',  emoji: '🌱' },
  { name: 'Rising',   min: 11,  max: 25,  color: '#10B981', bg: '#D1FAE5',  emoji: '🌿' },
  { name: 'Elite',    min: 26,  max: 50,  color: '#3B82F6', bg: '#DBEAFE',  emoji: '⚡' },
  { name: 'Legend',   min: 51,  max: 100, color: '#8B5CF6', bg: '#EDE9FE',  emoji: '🔥' },
  { name: 'Icon',     min: 101, max: Infinity, color: '#F59E0B', bg: '#FEF3C7', emoji: '👑' },
];

function getLevel(signups: number) {
  return LEVELS.find((l) => signups >= l.min && signups <= l.max) || LEVELS[0];
}

function getNextLevel(signups: number) {
  const idx = LEVELS.findIndex((l) => signups >= l.min && signups <= l.max);
  return LEVELS[idx + 1] || null;
}

function getProgressPct(signups: number): number {
  const level = getLevel(signups);
  if (level.max === Infinity) return 100;
  const range = level.max - level.min + 1;
  const progress = signups - level.min;
  return Math.min(100, Math.round((progress / range) * 100));
}

// ─── Prize Tiers ─────────────────────────────────────────────────────────────

const PRIZES = [
  { level: 'Starter',  signups: 10,  prize: 'Trailblaize merch pack',                          emoji: '👕', color: '#6B7280' },
  { level: 'Rising',   signups: 25,  prize: '$50 gift card',                                     emoji: '🎁', color: '#10B981' },
  { level: 'Elite',    signups: 50,  prize: 'Designer handbag (Girls) · Designer watch (Guys)',  emoji: '✨', color: '#3B82F6' },
  { level: 'Legend',   signups: 100, prize: '$500 gift card + exclusive event invite',            emoji: '🔥', color: '#8B5CF6' },
  { level: 'Icon',     signups: 200, prize: 'Full scholarship package / luxury trip',             emoji: '👑', color: '#F59E0B' },
];

// ─── Placeholder Leaderboard ──────────────────────────────────────────────────

const PLACEHOLDER_LEADERBOARD: Omit<LeaderboardEntry, 'isMe'>[] = [
  { rank: 1, name: 'Alex K.', school: 'University of Texas', signups: 87 },
  { rank: 2, name: 'Jordan M.', school: 'Ole Miss', signups: 64 },
  { rank: 3, name: 'Taylor R.', school: 'LSU', signups: 58 },
  { rank: 4, name: 'Morgan L.', school: 'Auburn', signups: 45 },
  { rank: 5, name: 'Casey W.', school: 'Alabama', signups: 38 },
  { rank: 6, name: 'Riley B.', school: 'Florida', signups: 31 },
  { rank: 7, name: 'Avery S.', school: 'Georgia', signups: 24 },
  { rank: 8, name: 'Parker H.', school: 'Tennessee', signups: 18 },
  { rank: 9, name: 'Quinn T.', school: 'Vanderbilt', signups: 12 },
  { rank: 10, name: 'Drew N.', school: 'Kentucky', signups: 7 },
];

// ─── Main Component ───────────────────────────────────────────────────────────

type TabType = 'dashboard' | 'profile';

export default function AmbassadorPortal() {
  const [profile, setProfile] = useState<AmbassadorProfile | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [copied, setCopied] = useState(false);
  const [showMerchModal, setShowMerchModal] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Merch form state
  const [merchForm, setMerchForm] = useState({
    size: '',
    style: '',
    address: '',
    submitted: false,
  });

  useEffect(() => {
    try {
      const stored = localStorage.getItem('tb_ambassador_profile');
      if (stored) {
        setProfile(JSON.parse(stored));
      } else {
        // Demo profile if nothing in localStorage
        setProfile({
          name: 'Your Name',
          phone: '',
          email: '',
          school: '',
          instagram: '',
          signups: 0,
          joined: new Date().toISOString(),
        });
      }
    } catch (_e) {
      setProfile({
        name: 'Ambassador',
        phone: '',
        email: '',
        school: '',
        instagram: '',
        signups: 0,
        joined: new Date().toISOString(),
      });
    }
    setLoaded(true);
  }, []);

  function copyLink() {
    navigator.clipboard.writeText('https://trailblaize.net — App download link coming soon').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!loaded) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F9FAFB',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#0F172A' }} />
      </div>
    );
  }

  if (!profile) return null;

  const signups = profile.signups || 0;
  const level = getLevel(signups);
  const nextLevel = getNextLevel(signups);
  const progressPct = getProgressPct(signups);
  const firstName = profile.name?.split(' ')[0] || 'Ambassador';

  // Inject self into leaderboard
  const leaderboard: LeaderboardEntry[] = [
    ...PLACEHOLDER_LEADERBOARD.map((e) => ({ ...e, isMe: false })),
    { rank: 11, name: firstName, school: profile.school || 'Your School', signups, isMe: true },
  ]
    .sort((a, b) => b.signups - a.signups)
    .map((e, i) => ({ ...e, rank: i + 1 }))
    .slice(0, 10);

  const referralLink = 'App download link coming soon';

  const tabStyle = (tab: TabType): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 20px',
    border: 'none',
    borderBottom: `2px solid ${activeTab === tab ? '#0F172A' : 'transparent'}`,
    background: 'transparent',
    color: activeTab === tab ? '#111827' : '#6B7280',
    fontWeight: activeTab === tab ? 700 : 500,
    fontSize: '0.9rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  });

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F9FAFB',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .tb-amb-card { animation: fadeIn 0.4s ease both; }
        .tb-progress-bar { transition: width 1s ease; }
        @media (max-width: 640px) {
          .tb-amb-grid-2 { grid-template-columns: 1fr !important; }
          .tb-amb-grid-3 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Nav */}
      <nav
        style={{
          background: 'white',
          borderBottom: '1px solid #E5E7EB',
          padding: '0 24px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <img src="/logos/logo-wordmark-navy.png" alt="Trailblaize" style={{ height: '34px' }} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              background: level.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            {level.emoji}
          </div>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            {firstName}
          </span>
        </div>
      </nav>

      {/* Tabs */}
      <div
        style={{
          background: 'white',
          borderBottom: '1px solid #E5E7EB',
          padding: '0 24px',
          display: 'flex',
          gap: '4px',
        }}
      >
        <button style={tabStyle('dashboard')} onClick={() => setActiveTab('dashboard')}>
          <TrendingUp size={15} />
          Dashboard
        </button>
        <button style={tabStyle('profile')} onClick={() => setActiveTab('profile')}>
          <Star size={15} />
          My Profile
        </button>
      </div>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* ─── DASHBOARD TAB ─── */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Welcome + Level */}
            <div
              className="tb-amb-card"
              style={{
                background: `linear-gradient(135deg, #0F172A 0%, #1e293b 100%)`,
                borderRadius: '16px',
                padding: '32px',
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
                  width: '180px',
                  height: '180px',
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.08)',
                }}
              />
              <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.6)', margin: '0 0 6px' }}>
                Welcome back,
              </p>
              <h1
                style={{
                  fontSize: 'clamp(1.5rem, 4vw, 2rem)',
                  fontWeight: 700,
                  margin: '0 0 20px',
                  letterSpacing: '-0.01em',
                }}
              >
                {firstName} {level.emoji}
              </h1>

              {/* Sign-up tracker */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
                  <span
                    style={{
                      fontSize: 'clamp(2.5rem, 6vw, 3.5rem)',
                      fontWeight: 800,
                      color: '#10B981',
                      lineHeight: 1,
                    }}
                  >
                    {signups}
                  </span>
                  <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }}>
                    sign-ups through your link
                  </span>
                </div>
              </div>

              {/* Level + progress */}
              <div
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: level.color,
                        background: level.bg,
                        borderRadius: '6px',
                        padding: '2px 10px',
                      }}
                    >
                      {level.name}
                    </span>
                  </div>
                  {nextLevel && (
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                      {nextLevel.min - signups} more to {nextLevel.name} {nextLevel.emoji}
                    </span>
                  )}
                  {!nextLevel && (
                    <span style={{ fontSize: '0.75rem', color: '#F59E0B', fontWeight: 600 }}>
                      Max level! 👑
                    </span>
                  )}
                </div>
                <div
                  style={{
                    height: '6px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    className="tb-progress-bar"
                    style={{
                      height: '100%',
                      width: `${progressPct}%`,
                      background: '#10B981',
                      borderRadius: '3px',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div
              className="tb-amb-grid-3"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px',
              }}
            >
              {[
                { label: 'Sign-Ups',        value: signups,      color: '#10B981', icon: <Users size={18} color="#10B981" /> },
                { label: 'Current Level',   value: level.name,   color: level.color, icon: <span style={{ fontSize: '18px' }}>{level.emoji}</span> },
                { label: 'Next Milestone',  value: nextLevel ? `${nextLevel.min} signups` : 'Max level!', color: '#F59E0B', icon: <Trophy size={18} color="#F59E0B" /> },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="tb-amb-card"
                  style={{
                    background: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <div style={{ marginBottom: '10px' }}>{stat.icon}</div>
                  <div
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 700,
                      color: stat.color,
                      marginBottom: '4px',
                    }}
                  >
                    {stat.value}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 500 }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Leaderboard + Next Prize */}
            <div
              className="tb-amb-grid-2"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
              }}
            >
              {/* Leaderboard */}
              <div
                className="tb-amb-card"
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
                    gap: '8px',
                    marginBottom: '20px',
                  }}
                >
                  <Trophy size={18} color="#F59E0B" />
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                    Top 10 Ambassadors
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {leaderboard.map((entry) => (
                    <div
                      key={entry.rank}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: entry.isMe ? '#F0FDF4' : 'transparent',
                        border: entry.isMe ? '1px solid #D1FAE5' : '1px solid transparent',
                      }}
                    >
                      <span
                        style={{
                          width: '22px',
                          fontSize: entry.rank <= 3 ? '16px' : '0.75rem',
                          fontWeight: 700,
                          color: entry.rank === 1 ? '#F59E0B' : entry.rank === 2 ? '#9CA3AF' : entry.rank === 3 ? '#92400E' : '#9CA3AF',
                          textAlign: 'center',
                        }}
                      >
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: entry.isMe ? 700 : 600,
                            color: entry.isMe ? '#10B981' : '#111827',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          {entry.name}
                          {entry.isMe && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                background: '#10B981',
                                color: 'white',
                                borderRadius: '4px',
                                padding: '1px 5px',
                                fontWeight: 700,
                              }}
                            >
                              You
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{entry.school}</div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          color: '#111827',
                        }}
                      >
                        {entry.signups}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Prize + Recent Activity */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Next prize */}
                {nextLevel && (
                  <div
                    className="tb-amb-card"
                    style={{
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      padding: '24px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <Gift size={18} color="#10B981" />
                      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                        Next Prize Milestone
                      </h3>
                    </div>
                    {(() => {
                      const prize = PRIZES.find((p) => p.level === nextLevel.name);
                      return prize ? (
                        <div>
                          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>{prize.emoji}</div>
                          <div
                            style={{
                              fontSize: '1rem',
                              fontWeight: 700,
                              color: prize.color,
                              marginBottom: '4px',
                            }}
                          >
                            {prize.signups} sign-ups
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.5 }}>
                            {prize.prize}
                          </div>
                          <div
                            style={{
                              marginTop: '12px',
                              fontSize: '0.8125rem',
                              color: '#6B7280',
                            }}
                          >
                            {nextLevel.min - signups} more sign-ups to unlock
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Recent activity */}
                <div
                  className="tb-amb-card"
                  style={{
                    background: 'white',
                    border: '1px solid #E5E7EB',
                    borderRadius: '12px',
                    padding: '24px',
                    flex: 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <TrendingUp size={18} color="#6B7280" />
                    <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                      Recent Activity
                    </h3>
                  </div>
                  {signups === 0 ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '20px 0',
                        color: '#9CA3AF',
                        fontSize: '0.875rem',
                      }}
                    >
                      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔗</div>
                      Share your link to start earning sign-ups!
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Array.from({ length: Math.min(5, signups) }).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px',
                            borderRadius: '8px',
                            background: '#F9FAFB',
                          }}
                        >
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              background: '#D1FAE5',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                            }}
                          >
                            ✅
                          </div>
                          <div>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
                              New sign-up via your link
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>
                              Recently
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── PROFILE TAB ─── */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Profile info */}
            <div
              className="tb-amb-card"
              style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                padding: '28px',
              }}
            >
              <h3
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '0 0 20px',
                }}
              >
                Your Info
              </h3>
              <div
                className="tb-amb-grid-2"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '16px',
                }}
              >
                {[
                  { label: 'Name', value: profile.name || '—' },
                  { label: 'School', value: profile.school || '—' },
                  { label: 'Email', value: profile.email || '—' },
                  { label: 'Phone', value: profile.phone || '—' },
                  { label: 'Instagram', value: profile.instagram || '—' },
                  { label: 'Joined', value: new Date(profile.joined).toLocaleDateString() },
                ].map((item) => (
                  <div key={item.label}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9CA3AF', marginBottom: '4px' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.9375rem', fontWeight: 500, color: '#111827' }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Referral link */}
            <div
              className="tb-amb-card"
              style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                padding: '28px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <LinkIcon size={18} color="#0F172A" />
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Your Referral Link
                </h3>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                  background: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  marginBottom: '12px',
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontSize: '0.875rem',
                    color: '#9CA3AF',
                    fontStyle: 'italic',
                  }}
                >
                  {referralLink}
                </span>
                <button
                  onClick={copyLink}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: copied ? '#10B981' : '#0F172A',
                    color: 'white',
                    border: 'none',
                    borderRadius: '7px',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.2s ease',
                    flexShrink: 0,
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p style={{ fontSize: '0.8125rem', color: '#9CA3AF', margin: 0 }}>
                🚧 App download link coming soon — share trailblaize.net in the meantime
              </p>
            </div>

            {/* Prize tracker */}
            <div
              className="tb-amb-card"
              style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                padding: '28px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <Trophy size={18} color="#F59E0B" />
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Prize Tiers
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {PRIZES.map((prize) => {
                  const unlocked = signups >= prize.signups;
                  const isCurrent = !unlocked && (PRIZES.find((p) => !signups || signups < p.signups)?.level === prize.level);
                  return (
                    <div
                      key={prize.level}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: unlocked ? '#F0FDF4' : isCurrent ? '#FFFBEB' : '#F9FAFB',
                        border: `1px solid ${unlocked ? '#D1FAE5' : isCurrent ? '#FDE68A' : '#E5E7EB'}`,
                        opacity: unlocked || isCurrent ? 1 : 0.75,
                      }}
                    >
                      <span style={{ fontSize: '24px', flexShrink: 0 }}>{prize.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span
                            style={{
                              fontSize: '0.875rem',
                              fontWeight: 700,
                              color: prize.color,
                            }}
                          >
                            {prize.level}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                            {prize.signups} sign-ups
                          </span>
                          {unlocked && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                background: '#10B981',
                                color: 'white',
                                borderRadius: '4px',
                                padding: '1px 6px',
                                fontWeight: 700,
                              }}
                            >
                              ✓ Unlocked
                            </span>
                          )}
                          {isCurrent && !unlocked && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                background: '#F59E0B',
                                color: 'white',
                                borderRadius: '4px',
                                padding: '1px 6px',
                                fontWeight: 700,
                              }}
                            >
                              Next up
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: '#374151' }}>{prize.prize}</div>
                      </div>
                      {unlocked && (
                        <ChevronRight size={16} color="#10B981" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Submit Merch button */}
              <button
                onClick={() => setShowMerchModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  marginTop: '20px',
                  padding: '12px',
                  background: signups >= 10 ? '#0F172A' : '#F3F4F6',
                  color: signups >= 10 ? 'white' : '#9CA3AF',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: signups >= 10 ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s ease',
                }}
              >
                <Package size={16} />
                {signups >= 10 ? 'Submit Merch Request' : 'Unlock at 10 sign-ups'}
              </button>
            </div>

            {/* Resources */}
            <div
              className="tb-amb-card"
              style={{
                background: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                padding: '28px',
              }}
            >
              <h3
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '0 0 16px',
                }}
              >
                Resources
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'Brand Guidelines', icon: '🎨', href: 'https://trailblaize.net', desc: 'Colors, fonts, and usage rules' },
                  { label: 'Talking Points', icon: '💬', href: 'https://trailblaize.net', desc: 'How to explain Trailblaize to people' },
                  { label: 'Share Graphics', icon: '📱', href: 'https://trailblaize.net', desc: 'Ready-to-post Instagram content' },
                ].map((res) => (
                  <a
                    key={res.label}
                    href={res.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 14px',
                      background: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      borderRadius: '10px',
                      textDecoration: 'none',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>{res.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                        {res.label}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{res.desc}</div>
                    </div>
                    <ExternalLink size={14} color="#9CA3AF" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Merch Modal */}
      {showMerchModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}
          onClick={() => setShowMerchModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '480px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '24px',
              }}
            >
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                🎁 Submit Merch Request
              </h2>
              <button
                onClick={() => setShowMerchModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}
              >
                <X size={20} />
              </button>
            </div>

            {merchForm.submitted ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎉</div>
                <h3 style={{ fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Request sent!</h3>
                <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>
                  We&rsquo;ll be in touch with your merch details.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                    Size
                  </label>
                  <select
                    value={merchForm.size}
                    onChange={(e) => setMerchForm({ ...merchForm, size: e.target.value })}
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '1px solid #E5E7EB', borderRadius: '10px',
                      fontSize: '0.9375rem', fontFamily: 'inherit',
                      color: '#111827', background: 'white',
                    }}
                  >
                    <option value="">Select size...</option>
                    <option>XS</option><option>S</option><option>M</option>
                    <option>L</option><option>XL</option><option>XXL</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                    Style Preference
                  </label>
                  <input
                    type="text"
                    value={merchForm.style}
                    onChange={(e) => setMerchForm({ ...merchForm, style: e.target.value })}
                    placeholder="e.g. hoodie, tee, hat..."
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '1px solid #E5E7EB', borderRadius: '10px',
                      fontSize: '0.9375rem', fontFamily: 'inherit',
                      color: '#111827', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                    Shipping Address
                  </label>
                  <textarea
                    value={merchForm.address}
                    onChange={(e) => setMerchForm({ ...merchForm, address: e.target.value })}
                    placeholder="Street, City, State, ZIP"
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '1px solid #E5E7EB', borderRadius: '10px',
                      fontSize: '0.9375rem', fontFamily: 'inherit',
                      color: '#111827', resize: 'vertical', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  onClick={() => setMerchForm({ ...merchForm, submitted: true })}
                  style={{
                    padding: '12px',
                    background: '#0F172A',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Submit Request →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
