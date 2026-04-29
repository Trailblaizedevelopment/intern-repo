'use client';

import React, { useState } from 'react';

const CATEGORIES = [
  'Fraternity', 'Sorority', 'Club Sport', 'Business Club',
  'Honor Society', 'Student Government', 'Professional Org',
  'Club Team', 'Startup', 'Church Group', 'Volunteer Org', 'Other'
];

interface Affiliation {
  category: string;
  orgName: string;
}

export default function WaitlistPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [school, setSchool] = useState('');
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [orgInput, setOrgInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggleCategory = (cat: string) => {
    const existing = affiliations.find(a => a.category === cat);
    if (existing) {
      setAffiliations(affiliations.filter(a => a.category !== cat));
      if (expandedCategory === cat) setExpandedCategory(null);
    } else {
      setExpandedCategory(cat);
      setOrgInput('');
    }
  };

  const confirmOrg = () => {
    if (expandedCategory && orgInput.trim()) {
      setAffiliations([...affiliations.filter(a => a.category !== expandedCategory), { category: expandedCategory, orgName: orgInput.trim() }]);
      setExpandedCategory(null);
      setOrgInput('');
    }
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || phone.replace(/\D/g, '').length < 10) return;
    setLoading(true);
    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.replace(/\D/g, ''),
          affiliations: [
            ...(school ? [`School: ${school}`] : []),
            ...affiliations.map(a => `${a.category}: ${a.orgName}`),
          ],
        }),
      });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
        {/* Subtle glow */}
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h1 style={{ color: 'white', fontSize: 28, fontWeight: 700, marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '-0.02em' }}>
            You&apos;re in.
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.7, fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 340, margin: '0 auto' }}>
            We&apos;ll text you when the app is ready. Your network is about to get a lot more powerful.
          </p>
        </div>
      </div>
    );
  }

  const isSelected = (cat: string) => affiliations.some(a => a.category === cat);
  const canSubmit = firstName.trim() && phone.replace(/\D/g, '').length >= 10;

  return (
    <div style={{ minHeight: '100vh', background: '#0F172A', position: 'relative', overflow: 'hidden' }}>
      {/* Background elements */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.06) 0%, transparent 50%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: 460, width: '100%', margin: '0 auto', padding: '60px 24px 40px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981' }} />
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Inter, system-ui, sans-serif' }}>Launching May 2026</span>
          </div>

          <h1 style={{ color: 'white', fontSize: 'clamp(28px, 6vw, 36px)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 14, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Your people are<br />already connected.
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 15, lineHeight: 1.65, maxWidth: 360, margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
            The private network for the organizations, teams, and communities you actually belong to. Join the waitlist.
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name row */}
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="text" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)}
              style={{ flex: 1, padding: '13px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', transition: 'border-color 0.15s' }}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
            <input type="text" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)}
              style={{ flex: 1, padding: '13px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', transition: 'border-color 0.15s' }}
              onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
            />
          </div>

          {/* Phone */}
          <input type="tel" placeholder="Phone number" value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
            style={{ padding: '13px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', transition: 'border-color 0.15s' }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
          />

          {/* School */}
          <input type="text" placeholder="University (optional)" value={school} onChange={e => setSchool(e.target.value)}
            style={{ padding: '13px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif', transition: 'border-color 0.15s' }}
            onFocus={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
            onBlur={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
          />

          {/* Affiliations */}
          <div>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10, fontFamily: 'Inter, system-ui, sans-serif' }}>
              Your organizations
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(cat => {
                const selected = isSelected(cat);
                const affiliation = affiliations.find(a => a.category === cat);
                return (
                  <button key={cat} onClick={() => toggleCategory(cat)}
                    style={{
                      padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      background: selected ? 'white' : 'rgba(255,255,255,0.06)',
                      color: selected ? '#0F172A' : 'rgba(255,255,255,0.6)',
                      fontSize: 13, fontWeight: selected ? 600 : 400,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {selected ? `${cat}: ${affiliation?.orgName}` : cat}
                    {selected && <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>✕</span>}
                  </button>
                );
              })}
            </div>

            {expandedCategory && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <input type="text" autoFocus placeholder={`Name of your ${expandedCategory.toLowerCase()}...`}
                  value={orgInput} onChange={e => setOrgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && orgInput.trim()) confirmOrg(); }}
                  style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'white', fontSize: 14, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
                />
                <button onClick={confirmOrg} disabled={!orgInput.trim()}
                  style={{ padding: '11px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: orgInput.trim() ? 'white' : 'rgba(255,255,255,0.06)', color: orgInput.trim() ? '#0F172A' : 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!canSubmit || loading}
            style={{
              padding: '15px 24px', borderRadius: 10, border: 'none',
              background: canSubmit ? 'white' : 'rgba(255,255,255,0.06)',
              color: canSubmit ? '#0F172A' : 'rgba(255,255,255,0.3)',
              fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
              marginTop: 6, fontFamily: 'Inter, system-ui, sans-serif',
              opacity: loading ? 0.7 : 1, letterSpacing: '-0.01em',
              transition: 'all 0.15s ease',
            }}
          >
            {loading ? 'Joining...' : 'Get Early Access'}
          </button>
        </div>

        {/* Social proof */}
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex' }}>
              {['#6366F1', '#10B981', '#F59E0B', '#EF4444'].map((c, i) => (
                <div key={i} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: '2px solid #0F172A', marginLeft: i > 0 ? -8 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: 'white', fontWeight: 700 }}>{['O', 'F', 'A', 'W'][i]}</span>
                </div>
              ))}
            </div>
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
              Join 5,500+ members across 5 schools
            </span>
          </div>
        </div>

        {/* Footer */}
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, textAlign: 'center', marginTop: 20, fontFamily: 'Inter, system-ui, sans-serif' }}>
          We&apos;ll text you when the app launches. No spam, ever.
        </p>
      </div>
    </div>
  );
}
