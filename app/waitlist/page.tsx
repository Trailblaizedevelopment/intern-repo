'use client';

import React, { useState } from 'react';

const CATEGORIES = [
  'Fraternity', 'Sorority', 'Club Sport', 'Business Fraternity',
  'Honor Society', 'Student Government', 'Alumni Association',
  'Professional Org', 'Club Team', 'Military',
  'Startup', 'Church Group', 'Volunteer Org', 'Other'
];

interface Affiliation {
  category: string;
  orgName: string;
}

export default function WaitlistPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
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
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.replace(/\D/g, ''),
          affiliations: affiliations.map(a => `${a.category}: ${a.orgName}`),
        }),
      });
      if (res.ok) setSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔥</div>
          <h1 style={{ color: 'white', fontSize: 28, fontWeight: 700, marginBottom: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
            You&apos;re on the list.
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 16, lineHeight: 1.6, fontFamily: 'Inter, system-ui, sans-serif' }}>
            We&apos;ll text you when it&apos;s your turn to join. Your network is closer than you think.
          </p>
        </div>
      </div>
    );
  }

  const isSelected = (cat: string) => affiliations.some(a => a.category === cat);
  const canSubmit = firstName.trim() && phone.replace(/\D/g, '').length >= 10;

  return (
    <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%' }}>

        {/* Heading — no logo */}
        <h1 style={{ color: 'white', fontSize: 26, fontWeight: 700, textAlign: 'center', marginBottom: 8, lineHeight: 1.3, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Join the Waitlist
        </h1>
        <p style={{ color: '#94A3B8', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Your private network for the people and places that actually matter. Enter your info and we&apos;ll text you when it&apos;s time.
        </p>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name row */}
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              type="text"
              placeholder="First name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              style={{
                flex: 1, padding: '14px 16px', borderRadius: 10, border: '1px solid #334155',
                background: '#1E293B', color: 'white', fontSize: 15, outline: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
            <input
              type="text"
              placeholder="Last name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              style={{
                flex: 1, padding: '14px 16px', borderRadius: 10, border: '1px solid #334155',
                background: '#1E293B', color: 'white', fontSize: 15, outline: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
          </div>

          {/* Phone */}
          <input
            type="tel"
            placeholder="Phone number"
            value={phone}
            onChange={e => setPhone(formatPhone(e.target.value))}
            style={{
              padding: '14px 16px', borderRadius: 10, border: '1px solid #334155',
              background: '#1E293B', color: 'white', fontSize: 15, outline: 'none',
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          />

          {/* Category label */}
          <div>
            <p style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
              Select your affiliations
            </p>

            {/* Category buttons grid */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(cat => {
                const selected = isSelected(cat);
                const expanded = expandedCategory === cat;
                const affiliation = affiliations.find(a => a.category === cat);

                return (
                  <div key={cat} style={{ position: 'relative' }}>
                    <button
                      onClick={() => toggleCategory(cat)}
                      style={{
                        padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        background: selected ? 'white' : '#1E293B',
                        color: selected ? '#0F172A' : '#CBD5E1',
                        fontSize: 13, fontWeight: selected ? 600 : 400,
                        fontFamily: 'Inter, system-ui, sans-serif',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {selected ? `${cat}: ${affiliation?.orgName}` : cat}
                      {selected && <span style={{ marginLeft: 6, fontSize: 11 }}>✕</span>}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Org name input — appears below buttons when a category is expanded */}
            {expandedCategory && (
              <div style={{
                marginTop: 12, display: 'flex', gap: 8, alignItems: 'center',
                animation: 'fadeIn 0.15s ease',
              }}>
                <input
                  type="text"
                  autoFocus
                  placeholder={`Name of your ${expandedCategory.toLowerCase()}...`}
                  value={orgInput}
                  onChange={e => setOrgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && orgInput.trim()) confirmOrg(); }}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid #334155',
                    background: '#1E293B', color: 'white', fontSize: 14, outline: 'none',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                />
                <button
                  onClick={confirmOrg}
                  disabled={!orgInput.trim()}
                  style={{
                    padding: '12px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: orgInput.trim() ? 'white' : '#334155',
                    color: orgInput.trim() ? '#0F172A' : '#64748B',
                    fontSize: 14, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            style={{
              padding: '16px 24px', borderRadius: 10, border: 'none',
              background: canSubmit ? 'white' : '#334155',
              color: canSubmit ? '#0F172A' : '#64748B',
              fontSize: 16, fontWeight: 600, cursor: canSubmit ? 'pointer' : 'default', marginTop: 8,
              fontFamily: 'Inter, system-ui, sans-serif',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Joining...' : 'Join the Waitlist'}
          </button>
        </div>

        {/* Footer */}
        <p style={{ color: '#475569', fontSize: 12, textAlign: 'center', marginTop: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
          By joining, you agree to receive a text when the app launches. No spam.
        </p>
      </div>
    </div>
  );
}
