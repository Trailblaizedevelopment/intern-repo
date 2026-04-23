'use client';

import React from 'react';

export default function HomePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F9FAFB',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <style>{`
        @media (max-width: 640px) {
          .tb-landing-cards { flex-direction: column !important; align-items: center !important; }
          .tb-landing-card { width: 100% !important; max-width: 380px !important; }
        }
        .tb-landing-card-join:hover { border-color: #10B981 !important; transform: translateY(-2px); }
        .tb-landing-card-login:hover { border-color: #0F172A !important; transform: translateY(-2px); }
        .tb-landing-card-login, .tb-landing-card-join { transition: border-color 0.2s ease, transform 0.2s ease; }
        .tb-btn-navy:hover { background: #1e293b !important; }
        .tb-btn-emerald:hover { background: #059669 !important; }
        .tb-btn-navy, .tb-btn-emerald { transition: background 0.2s ease; }
      `}</style>

      {/* Logo */}
      <div style={{ marginBottom: '56px', textAlign: 'center' }}>
        <img
          src="/logos/logo-wordmark-navy.png"
          alt="Trailblaize"
          style={{ height: '52px' }}
        />
      </div>

      {/* Cards */}
      <div
        className="tb-landing-cards"
        style={{
          display: 'flex',
          gap: '24px',
          alignItems: 'stretch',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '760px',
        }}
      >
        {/* Welcome Back */}
        <div
          className="tb-landing-card tb-landing-card-login"
          style={{
            flex: 1,
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '16px',
            padding: '44px 36px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              fontSize: '24px',
            }}
          >
            🔑
          </div>
          <h2
            style={{
              fontSize: '1.375rem',
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 10px',
              letterSpacing: '-0.01em',
            }}
          >
            WELCOME BACK
          </h2>
          <p
            style={{
              fontSize: '0.9375rem',
              color: '#6B7280',
              margin: '0 0 36px',
              lineHeight: 1.55,
            }}
          >
            Log in to your workspace
          </p>
          <a
            href="/workspace"
            className="tb-btn-navy"
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: '#0F172A',
              color: 'white',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.9375rem',
              textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            Sign In →
          </a>
        </div>

        {/* Join Our Team */}
        <div
          className="tb-landing-card tb-landing-card-join"
          style={{
            flex: 1,
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '16px',
            padding: '44px 36px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              background: '#F0FDF4',
              border: '1px solid #D1FAE5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              fontSize: '24px',
            }}
          >
            🚀
          </div>
          <h2
            style={{
              fontSize: '1.375rem',
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 10px',
              letterSpacing: '-0.01em',
            }}
          >
            JOIN OUR TEAM
          </h2>
          <p
            style={{
              fontSize: '0.9375rem',
              color: '#6B7280',
              margin: '0 0 36px',
              lineHeight: 1.55,
            }}
          >
            Become part of Trailblaize
          </p>
          <a
            href="/join"
            className="tb-btn-emerald"
            style={{
              display: 'inline-block',
              padding: '13px 32px',
              background: '#10B981',
              color: 'white',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '1rem',
              textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            Get Started →
          </a>
        </div>
      </div>

      <p style={{ marginTop: '48px', fontSize: '0.8125rem', color: '#9CA3AF' }}>
        © 2025 Trailblaize, Inc.
      </p>
    </div>
  );
}
