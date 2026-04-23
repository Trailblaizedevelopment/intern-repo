'use client';

import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  school: string;
  instagram: string;
  why: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: '0.9375rem',
  border: '1px solid #E5E7EB',
  borderRadius: '10px',
  outline: 'none',
  fontFamily: 'Inter, system-ui, sans-serif',
  boxSizing: 'border-box',
  color: '#111827',
  background: 'white',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px',
};

export default function AmbassadorFormPage() {
  const [form, setForm] = useState<FormState>({
    fullName: '',
    phone: '',
    email: '',
    school: '',
    instagram: '',
    why: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim()) { setError('Full name is required.'); return; }
    if (!form.phone.trim()) { setError('Phone number is required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }

    setSubmitting(true);
    setError('');

    const payload = {
      name: form.fullName,
      phone: form.phone,
      email: form.email,
      school: form.school,
      instagram: form.instagram,
      why: form.why,
      type: 'ambassador',
      submitted_at: new Date().toISOString(),
    };

    // Save to localStorage
    try {
      const existing = JSON.parse(localStorage.getItem('tb_ambassador_applications') || '[]');
      existing.unshift(payload);
      localStorage.setItem('tb_ambassador_applications', JSON.stringify(existing));

      // Also save this ambassador's own info for the portal
      localStorage.setItem('tb_ambassador_profile', JSON.stringify({
        name: form.fullName,
        phone: form.phone,
        email: form.email,
        school: form.school,
        instagram: form.instagram,
        status: 'pending',
        joined: new Date().toISOString(),
        signups: 0,
      }));
    } catch (_e) {
      // localStorage might be unavailable
    }

    // POST to API
    try {
      await fetch('/api/join/ambassador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_e) {
      // API failure is non-fatal — we already saved locally
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#F9FAFB',
          fontFamily: 'Inter, system-ui, sans-serif',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '20px',
            padding: '52px 40px',
            maxWidth: '480px',
            width: '100%',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: '#F0FDF4',
              border: '1px solid #D1FAE5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}
          >
            <CheckCircle2 size={36} color="#10B981" />
          </div>
          <img
            src="/logos/logo-wordmark-navy.png"
            alt="Trailblaize"
            style={{ height: '32px', marginBottom: '24px' }}
          />
          <h2
            style={{
              fontSize: '1.625rem',
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 12px',
              letterSpacing: '-0.01em',
            }}
          >
            Application Received!
          </h2>
          <p
            style={{
              fontSize: '1rem',
              color: '#6B7280',
              lineHeight: 1.65,
              margin: '0 0 32px',
            }}
          >
            We will be in touch shortly.
          </p>
          <div style={{ fontSize: '0.875rem', color: '#9CA3AF', lineHeight: 1.6 }}>
            Questions? Email us at{' '}
            <a
              href="mailto:owen@trailblaize.net"
              style={{ color: '#0F172A', fontWeight: 600, textDecoration: 'none' }}
            >
              owen@trailblaize.net
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F9FAFB',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Nav */}
      <nav
        style={{
          background: 'white',
          borderBottom: '1px solid #E5E7EB',
          padding: '0 24px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <a
          href="/join"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.875rem',
            color: '#6B7280',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} />
          Back
        </a>
        <div style={{ flex: 1 }} />
        <img
          src="/logos/logo-wordmark-navy.png"
          alt="Trailblaize"
          style={{ height: '32px' }}
        />
      </nav>

      {/* Form */}
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 24px 80px' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: '#F0FDF4',
              border: '1px solid #D1FAE5',
              borderRadius: '20px',
              padding: '4px 14px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#10B981',
              marginBottom: '16px',
            }}
          >
            🌟 Ambassador Application
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#111827',
              margin: '0 0 10px',
              letterSpacing: '-0.01em',
            }}
          >
            Represent Trailblaize
          </h1>
          <p style={{ fontSize: '0.9375rem', color: '#6B7280', margin: 0, lineHeight: 1.6 }}>
            Be the face of Trailblaize at your campus. Earn rewards, build your network, and help us grow.
          </p>
        </div>

        <div
          style={{
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '16px',
            padding: '32px',
          }}
        >
          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                background: '#FEF2F2',
                border: '1px solid #FCA5A5',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '24px',
                fontSize: '0.875rem',
                color: '#DC2626',
              }}
            >
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Name */}
              <div>
                <label style={labelStyle}>Full Name *</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => update('fullName', e.target.value)}
                  placeholder="Your full name"
                  style={inputStyle}
                  required
                />
              </div>

              {/* Phone */}
              <div>
                <label style={labelStyle}>Phone Number *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="(555) 555-5555"
                  style={inputStyle}
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label style={labelStyle}>Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="you@email.com"
                  style={inputStyle}
                  required
                />
              </div>

              {/* School */}
              <div>
                <label style={{ ...labelStyle, color: '#6B7280' }}>
                  School{' '}
                  <span style={{ fontWeight: 400, fontSize: '0.75rem' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.school}
                  onChange={(e) => update('school', e.target.value)}
                  placeholder="e.g. University of Texas"
                  style={inputStyle}
                />
              </div>

              {/* Instagram */}
              <div>
                <label style={{ ...labelStyle, color: '#6B7280' }}>
                  Instagram Handle{' '}
                  <span style={{ fontWeight: 400, fontSize: '0.75rem' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.instagram}
                  onChange={(e) => update('instagram', e.target.value)}
                  placeholder="@yourhandle"
                  style={inputStyle}
                />
              </div>

              {/* Why */}
              <div>
                <label style={{ ...labelStyle, color: '#6B7280' }}>
                  Why do you want to be a Trailblaize Ambassador?{' '}
                  <span style={{ fontWeight: 400, fontSize: '0.75rem' }}>(optional)</span>
                </label>
                <textarea
                  value={form.why}
                  onChange={(e) => update('why', e.target.value)}
                  placeholder="Tell us a bit about yourself and why you want to represent Trailblaize..."
                  rows={4}
                  style={{
                    ...inputStyle,
                    resize: 'vertical',
                    lineHeight: 1.6,
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '13px 24px',
                  background: submitting ? '#6B7280' : '#10B981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s ease',
                  marginTop: '8px',
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    Submitting...
                  </>
                ) : (
                  'Submit Application →'
                )}
              </button>
            </div>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: '#9CA3AF', marginTop: '24px' }}>
          Questions?{' '}
          <a
            href="mailto:owen@trailblaize.net"
            style={{ color: '#6B7280', textDecoration: 'none', fontWeight: 500 }}
          >
            owen@trailblaize.net
          </a>
        </p>
      </main>
    </div>
  );
}
