'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) {
      setError('Database not configured.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      router.push('/workspace');
    }
  }

  return (
    <div className="tb-root">
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .tb-root {
          min-height: 100vh;
          background: #fff;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          color: #0f172a;
          display: flex;
          flex-direction: column;
        }

        /* ── Nav ── */
        .tb-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 50;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          height: 64px;
        }

        .tb-nav-logo {
          height: 36px;
          width: auto;
          display: block;
        }

        .tb-nav-badge {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #94a3b8;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 4px 10px;
        }

        /* ── Main ── */
        .tb-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 104px 24px 64px;
        }

        /* ── Hero ── */
        .tb-hero {
          text-align: center;
          margin-bottom: 48px;
        }

        .tb-hero-headline {
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: clamp(2.75rem, 6vw, 4rem);
          font-weight: 400;
          line-height: 1.1;
          color: #0f172a;
          letter-spacing: -0.02em;
          margin-bottom: 12px;
        }

        .tb-hero-sub {
          font-size: 1rem;
          color: #64748b;
          font-weight: 400;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: 0.8125rem;
        }

        /* ── Card ── */
        .tb-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 40px 40px 36px;
          width: 100%;
          max-width: 400px;
        }

        .tb-card-title {
          font-size: 1.0625rem;
          font-weight: 600;
          color: #0f172a;
          margin-bottom: 4px;
        }

        .tb-card-sub {
          font-size: 0.8125rem;
          color: #94a3b8;
          margin-bottom: 28px;
        }

        /* ── Form ── */
        .tb-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .tb-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .tb-label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #374151;
        }

        .tb-input {
          width: 100%;
          padding: 11px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          font-size: 0.9375rem;
          font-family: inherit;
          color: #0f172a;
          background: #fff;
          outline: none;
          transition: border-color 0.15s;
        }

        .tb-input:focus {
          border-color: #0f172a;
        }

        .tb-input::placeholder {
          color: #cbd5e1;
        }

        /* ── Error ── */
        .tb-error {
          font-size: 0.8125rem;
          color: #dc2626;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 10px 14px;
        }

        /* ── Button ── */
        .tb-btn-primary {
          width: 100%;
          padding: 13px 20px;
          background: #0f172a;
          color: #fff;
          border: none;
          border-radius: 12px;
          font-size: 0.9375rem;
          font-weight: 600;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.15s, opacity 0.15s;
          margin-top: 4px;
        }

        .tb-btn-primary:hover:not(:disabled) {
          background: #1e293b;
        }

        .tb-btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* ── Join link ── */
        .tb-join-row {
          text-align: center;
          margin-top: 20px;
          font-size: 0.8125rem;
          color: #94a3b8;
        }

        .tb-join-link {
          color: #0f172a;
          font-weight: 600;
          text-decoration: none;
          border-bottom: 1px solid #e2e8f0;
          transition: border-color 0.15s;
        }

        .tb-join-link:hover {
          border-color: #0f172a;
        }

        /* ── Footer ── */
        .tb-footer {
          text-align: center;
          padding: 24px;
          font-size: 0.75rem;
          color: #cbd5e1;
          border-top: 1px solid #f8fafc;
          display: flex;
          gap: 16px;
          justify-content: center;
          align-items: center;
        }

        .tb-footer-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #e2e8f0;
          display: inline-block;
        }

        /* ── Mobile ── */
        @media (max-width: 480px) {
          .tb-nav {
            padding: 0 20px;
          }
          .tb-card {
            padding: 32px 24px 28px;
          }
          .tb-hero-headline {
            font-size: 2.25rem;
          }
        }
      `}</style>

      {/* Nav */}
      <nav className="tb-nav">
        <img
          src="/logos/logo-wordmark-navy.png"
          alt="Trailblaize"
          className="tb-nav-logo"
        />
        <span className="tb-nav-badge">Internal</span>
      </nav>

      {/* Main */}
      <main className="tb-main">
        {/* Hero */}
        <div className="tb-hero">
          <h1 className="tb-hero-headline">Command Center</h1>
          <p className="tb-hero-sub">Trailblaize Internal Workspace</p>
        </div>

        {/* Login card */}
        <div className="tb-card">
          <p className="tb-card-title">Sign in</p>
          <p className="tb-card-sub">Use your Trailblaize account credentials</p>

          <form className="tb-form" onSubmit={handleSignIn}>
            <div className="tb-field">
              <label className="tb-label" htmlFor="tb-email">Email</label>
              <input
                id="tb-email"
                className="tb-input"
                type="email"
                placeholder="you@trailblaize.net"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="tb-field">
              <label className="tb-label" htmlFor="tb-password">Password</label>
              <input
                id="tb-password"
                className="tb-input"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="tb-error">{error}</div>
            )}

            <button
              type="submit"
              className="tb-btn-primary"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Enter Command Center →'}
            </button>
          </form>
        </div>

        {/* Join link */}
        <p className="tb-join-row">
          New to the team?{' '}
          <a href="/join" className="tb-join-link">Join a chapter →</a>
        </p>
      </main>

      {/* Footer */}
      <footer className="tb-footer">
        <span>Internal Access Only</span>
        <span className="tb-footer-dot" />
        <span>Secured with Supabase Auth</span>
        <span className="tb-footer-dot" />
        <span>© 2025 Trailblaize, Inc.</span>
      </footer>
    </div>
  );
}
