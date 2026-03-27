'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Lock, Mail, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';

export default function NucleusLogin() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // If successful, the auth context will update and redirect
  }

  return (
    <div className="nucleus-login-page">
      {/* Decorative background elements */}
      <div className="nucleus-bg-pattern" />
      
      <div className="nucleus-login-container">
        {/* Logo and Header */}
        <div className="nucleus-login-header">
          <div className="nucleus-brand">
            <img src="/logos/logo-icon-black.png" alt="Trailblaize" className="nucleus-login-logo" />
            <div className="nucleus-brand-text">
              <span className="nucleus-brand-name">Trailblaize</span>
              <span className="nucleus-brand-tagline">Growth Space</span>
            </div>
          </div>
          <div className="nucleus-title-section">
            <h1>Nucleus</h1>
            <p>Command Center</p>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="nucleus-login-form">
          {error && (
            <div className="nucleus-login-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="nucleus-login-field">
            <label htmlFor="email">Email address</label>
            <div className="nucleus-login-input-wrapper">
              <Mail size={18} className="nucleus-login-input-icon" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@trailblaize.net"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="nucleus-login-field">
            <label htmlFor="password">Password</label>
            <div className="nucleus-login-input-wrapper">
              <Lock size={18} className="nucleus-login-input-icon" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="nucleus-login-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            type="submit" 
            className="nucleus-login-submit"
            disabled={loading}
          >
            <span>{loading ? 'Signing in...' : 'Enter Command Center'}</span>
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        {/* Footer */}
        <div className="nucleus-login-footer">
          <p className="nucleus-login-restricted">Internal Access Only</p>
          <p className="nucleus-login-security">
            <Lock size={12} />
            Secured with Supabase Auth
          </p>
        </div>
      </div>
      
      {/* Corner accent */}
      <div className="nucleus-corner-accent" />
    </div>
  );
}
