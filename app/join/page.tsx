'use client';

import React, { useState } from 'react';
import { ChevronRight, ArrowRight } from 'lucide-react';

const SCREENS = [
  {
    type: 'hook' as const,
    headline: 'Social media sucks.',
    sub: '',
  },
  {
    type: 'text' as const,
    headline: null,
    body: [
      'LinkedIn is built for the professional.',
      'X is built for the peanut gallery.',
      'Instagram is built for the socialite.',
      'Facebook was built for the individual.',
      '',
      'But none of them are built for your real network — the people who actually shaped your life.',
    ],
  },
  {
    type: 'text' as const,
    headline: null,
    body: [
      'Your fraternity brothers. Your college teammates. Your study group. Your church group. Your startup co-founders.',
      '',
      'These are the people who matter. But there\'s no platform designed to keep those connections alive after you leave.',
    ],
  },
  {
    type: 'text' as const,
    headline: 'Enter Trailblaize.',
    body: [
      'Trailblaize is built for the individual and their lived-in experiences.',
      '',
      'One platform where every organization you\'ve been part of — your chapter, your team, your company, your club — has a private space where members stay connected forever.',
      '',
      'Find jobs through alumni. Get mentored by people who walked your path. Reconnect with people you lost touch with. Build the network that actually matters.',
    ],
  },
  {
    type: 'fork' as const,
    headline: 'We\'re growing fast and we need people on the ground at every campus.',
    sub: 'Two ways to join:',
  },
];

const TOTAL = SCREENS.length;

export default function JoinPage() {
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);

  function advance() {
    if (current >= TOTAL - 1) return;
    setVisible(false);
    setTimeout(() => {
      setCurrent((c) => c + 1);
      setVisible(true);
    }, 220);
  }

  const screen = SCREENS[current];
  const isLast = current === TOTAL - 1;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'white',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .join-fork-card { transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease; }
        .join-fork-card:hover { border-color: #10B981 !important; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(16,185,129,0.12); }
        .join-fork-ambassador:hover { border-color: #10B981 !important; }
        .join-fork-intern:hover { border-color: #0F172A !important; transform: translateY(-2px); box-shadow: 0 4px 16px rgba(15,23,42,0.1); }
        .join-next-btn:hover { background: #1e293b !important; }
        .join-next-btn { transition: background 0.2s ease; }
        @media (max-width: 620px) {
          .join-fork-cards { flex-direction: column !important; }
          .join-fork-card { width: 100% !important; }
        }
      `}</style>

      {/* Nav */}
      <nav
        style={{
          padding: '0 24px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #F3F4F6',
          flexShrink: 0,
        }}
      >
        <a href="/">
          <img
            src="/logos/logo-wordmark-navy.png"
            alt="Trailblaize"
            style={{ height: '36px' }}
          />
        </a>
        <a
          href="/workspace"
          style={{
            fontSize: '0.8125rem',
            color: '#6B7280',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Already a member? Sign in →
        </a>
      </nav>

      {/* Progress dots */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '6px',
          padding: '14px 0',
          borderBottom: '1px solid #F3F4F6',
          flexShrink: 0,
        }}
      >
        {Array.from({ length: TOTAL }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === current ? '22px' : '7px',
              height: '7px',
              borderRadius: '4px',
              background: i <= current ? '#0F172A' : '#D1D5DB',
              transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(18px)',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
        }}
      >
        {/* Screen content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: screen.type === 'fork' ? 'flex-start' : 'center',
            justifyContent: 'center',
            padding: screen.type === 'fork' ? '52px 24px 0' : '40px 24px 0',
          }}
        >
          <div style={{ maxWidth: '640px', width: '100%' }}>

            {/* Hook screen */}
            {screen.type === 'hook' && (
              <h1
                style={{
                  fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
                  fontWeight: 700,
                  color: '#0F172A',
                  margin: 0,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  textAlign: 'center',
                  fontFamily: '"Instrument Serif", Georgia, serif',
                }}
              >
                {screen.headline}
              </h1>
            )}

            {/* Text screen */}
            {screen.type === 'text' && (
              <div>
                {screen.headline && (
                  <h2
                    style={{
                      fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                      fontWeight: 700,
                      color: '#0F172A',
                      margin: '0 0 24px',
                      letterSpacing: '-0.01em',
                      fontFamily: '"Instrument Serif", Georgia, serif',
                    }}
                  >
                    {screen.headline}
                  </h2>
                )}
                {screen.body.map((line, i) =>
                  line === '' ? (
                    <div key={i} style={{ height: '12px' }} />
                  ) : (
                    <p
                      key={i}
                      style={{
                        fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
                        color: '#374151',
                        lineHeight: 1.7,
                        margin: 0,
                      }}
                    >
                      {line}
                    </p>
                  )
                )}
              </div>
            )}

            {/* Fork screen */}
            {screen.type === 'fork' && (
              <div>
                <p
                  style={{
                    fontSize: 'clamp(1rem, 2.5vw, 1.25rem)',
                    color: '#374151',
                    lineHeight: 1.7,
                    margin: '0 0 8px',
                  }}
                >
                  {screen.headline}
                </p>
                <p
                  style={{
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    color: '#111827',
                    margin: '0 0 32px',
                  }}
                >
                  {screen.sub}
                </p>

                {/* Fork cards */}
                <div
                  className="join-fork-cards"
                  style={{ display: 'flex', gap: '20px' }}
                >
                  {/* Ambassador */}
                  <a
                    href="/join/ambassador"
                    className="join-fork-card join-fork-ambassador"
                    style={{
                      flex: 1,
                      background: 'white',
                      border: '2px solid #E5E7EB',
                      borderRadius: '16px',
                      padding: '28px 24px',
                      textDecoration: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        background: '#F0FDF4',
                        border: '1px solid #D1FAE5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '16px',
                        fontSize: '22px',
                      }}
                    >
                      🌟
                    </div>
                    <h3
                      style={{
                        fontSize: '1.125rem',
                        fontWeight: 700,
                        color: '#111827',
                        margin: '0 0 8px',
                      }}
                    >
                      Ambassador
                    </h3>
                    <p
                      style={{
                        fontSize: '0.9rem',
                        color: '#6B7280',
                        lineHeight: 1.6,
                        margin: '0 0 20px',
                        flex: 1,
                      }}
                    >
                      Represent Trailblaize at your school. Earn rewards. Build your network.
                    </p>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#10B981',
                      }}
                    >
                      Apply now <ArrowRight size={14} />
                    </span>
                  </a>

                  {/* Growth Intern */}
                  <a
                    href="/join/intern"
                    className="join-fork-card join-fork-intern"
                    style={{
                      flex: 1,
                      background: 'white',
                      border: '2px solid #E5E7EB',
                      borderRadius: '16px',
                      padding: '28px 24px',
                      textDecoration: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        background: '#F9FAFB',
                        border: '1px solid #E5E7EB',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '16px',
                        fontSize: '22px',
                      }}
                    >
                      💼
                    </div>
                    <h3
                      style={{
                        fontSize: '1.125rem',
                        fontWeight: 700,
                        color: '#111827',
                        margin: '0 0 8px',
                      }}
                    >
                      Growth Intern
                    </h3>
                    <p
                      style={{
                        fontSize: '0.9rem',
                        color: '#6B7280',
                        lineHeight: 1.6,
                        margin: '0 0 20px',
                        flex: 1,
                      }}
                    >
                      Work directly with our founding team. Learn startup sales. Get paid.
                    </p>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        color: '#0F172A',
                      }}
                    >
                      Apply now <ArrowRight size={14} />
                    </span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom nav */}
        {!isLast && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '24px 32px 40px',
              maxWidth: '640px',
              margin: '0 auto',
              width: '100%',
            }}
          >
            <button
              onClick={advance}
              className="join-next-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 28px',
                background: '#0F172A',
                color: 'white',
                borderRadius: '10px',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}

        {isLast && <div style={{ height: '40px' }} />}
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #F3F4F6',
          padding: '16px 24px',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        <p style={{ fontSize: '0.8125rem', color: '#9CA3AF', margin: 0 }}>
          © 2025 Trailblaize, Inc. ·{' '}
          <a
            href="mailto:support@trailblaize.net"
            style={{ color: '#9CA3AF', textDecoration: 'none' }}
          >
            support@trailblaize.net
          </a>
        </p>
      </footer>
    </div>
  );
}
