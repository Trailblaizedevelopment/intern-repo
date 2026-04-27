'use client';

import React, { useState } from 'react';

const SUGGESTED_TAGS = [
  'Fraternity', 'Sorority', 'Club Sport', 'Business Fraternity',
  'Honor Society', 'Student Government', 'Alumni Association',
  'Professional Org', 'Greek Life', 'Club Team', 'Military',
  'Startup', 'Consulting', 'Finance', 'Engineering',
  'Pre-Law', 'Pre-Med', 'Church Group', 'Volunteer Org'
];

export default function WaitlistPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput('');
    setShowSuggestions(false);
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      addTag(tagInput);
    }
    if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const filteredSuggestions = SUGGESTED_TAGS.filter(
    s => s.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(s)
  );

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !phone.replace(/\D/g, '').length) return;
    setLoading(true);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.replace(/\D/g, ''),
          affiliations: tags,
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
            You're on the list.
          </h1>
          <p style={{ color: '#94A3B8', fontSize: 16, lineHeight: 1.6, fontFamily: 'Inter, system-ui, sans-serif' }}>
            We'll text you when it's your turn to join. Your network is closer than you think.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
            <span style={{ color: 'white', fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px', fontFamily: 'Inter, system-ui, sans-serif' }}>
              Trailblaize
            </span>
          </div>
          <p style={{ color: '#64748B', fontSize: 13, fontFamily: 'Inter, system-ui, sans-serif' }}>
            The app is almost here.
          </p>
        </div>

        {/* Heading */}
        <h1 style={{ color: 'white', fontSize: 26, fontWeight: 700, textAlign: 'center', marginBottom: 8, lineHeight: 1.3, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Join the Waitlist
        </h1>
        <p style={{ color: '#94A3B8', fontSize: 15, textAlign: 'center', marginBottom: 32, lineHeight: 1.5, fontFamily: 'Inter, system-ui, sans-serif' }}>
          Your private network for the people and places that actually matter. Enter your info and we'll text you when it's time.
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

          {/* Tags */}
          <div style={{ position: 'relative' }}>
            <div style={{
              padding: '10px 12px', borderRadius: 10, border: '1px solid #334155',
              background: '#1E293B', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
              minHeight: 48,
            }}>
              {tags.map(tag => (
                <span key={tag} style={{
                  background: '#334155', color: 'white', padding: '4px 10px', borderRadius: 20,
                  fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  {tag}
                  <span onClick={() => removeTag(tag)} style={{ cursor: 'pointer', color: '#94A3B8', fontSize: 16, lineHeight: 1 }}>×</span>
                </span>
              ))}
              <input
                type="text"
                placeholder={tags.length === 0 ? "Your affiliations (fraternity, club, school...)" : "Add more..."}
                value={tagInput}
                onChange={e => { setTagInput(e.target.value); setShowSuggestions(true); }}
                onKeyDown={handleTagKeyDown}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                style={{
                  flex: 1, minWidth: 150, background: 'transparent', border: 'none', outline: 'none',
                  color: 'white', fontSize: 14, padding: '4px 0',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              />
            </div>
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                background: '#1E293B', border: '1px solid #334155', borderRadius: 10,
                maxHeight: 200, overflowY: 'auto', zIndex: 10,
              }}>
                {filteredSuggestions.slice(0, 8).map(s => (
                  <div key={s} onMouseDown={() => addTag(s)} style={{
                    padding: '10px 16px', cursor: 'pointer', color: '#CBD5E1', fontSize: 14,
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}>
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!firstName.trim() || phone.replace(/\D/g, '').length < 10 || loading}
            style={{
              padding: '16px 24px', borderRadius: 10, border: 'none',
              background: (!firstName.trim() || phone.replace(/\D/g, '').length < 10) ? '#334155' : 'white',
              color: (!firstName.trim() || phone.replace(/\D/g, '').length < 10) ? '#64748B' : '#0F172A',
              fontSize: 16, fontWeight: 600, cursor: 'pointer', marginTop: 8,
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
