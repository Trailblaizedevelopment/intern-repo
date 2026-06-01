'use client';
import React, { useState } from 'react';

// ─── Demo Alumni ──────────────────────────────────────────────────────────────

const ALUMNI = [
  { name: 'Ethan Hill',       role: 'Financial Services Rep',   company: 'Fidelity',          city: 'Dallas, TX',        color: '#0F172A' },
  { name: 'Nash Dehmer',      role: 'Dir of Operations',        company: 'US Senate',         city: 'Washington, DC',    color: '#6366F1' },
  { name: 'Jake Coppen',      role: 'Founder',                  company: 'Scratch AI',        city: 'New York, NY',      color: '#0F172A' },
  { name: 'Gavin Murrey',     role: 'Credit Portfolio Analyst', company: 'JPMorgan',          city: 'New York, NY',      color: '#8B5CF6' },
  { name: 'Payne Parker',     role: 'Account Executive',        company: 'Knight Commercial', city: 'Dallas, TX',        color: '#10B981' },
  { name: 'Andrew Longo',     role: 'GTM',                      company: 'Glean',             city: 'Nashville, TN',     color: '#F59E0B' },
  { name: 'Andrew Hopperton', role: 'IB Analyst',               company: 'GSI Capital',       city: 'Tampa, FL',         color: '#0EA5E9' },
  { name: 'Garrett Smalley',  role: 'Associate Underwriter',    company: 'Chubb',             city: 'Atlanta, GA',       color: '#EC4899' },
  { name: 'Luke Nayfa',       role: 'MS Finance',               company: 'McCombs School',    city: 'Austin, TX',        color: '#F59E0B' },
  { name: 'Peyton Pounds',    role: 'Financial Advisor',        company: 'Williams Wealth',   city: 'Charlotte, NC',     color: '#10B981' },
  { name: 'William Heusler',  role: 'Analyst',                  company: 'MSCI',              city: 'New York, NY',      color: '#8B5CF6' },
  { name: 'Charlie Parkman',  role: 'Real Estate Associate',    company: 'Eastdil Secured',   city: 'Dallas, TX',        color: '#6366F1' },
  { name: 'Carter Brown',     role: 'Marketing Manager',        company: 'HubSpot',           city: 'Austin, TX',        color: '#EC4899' },
  { name: 'Cole Montgomery',  role: 'Commercial Real Estate',   company: 'CBRE',              city: 'Atlanta, GA',       color: '#0EA5E9' },
  { name: 'Jack Grier',       role: 'Healthcare Recruiter',     company: 'Medasource',        city: 'Nashville, TN',     color: '#EC4899' },
  { name: 'Thomas Pham',      role: 'AI Product Manager',       company: 'Google',            city: 'San Francisco, CA', color: '#6366F1' },
];

const Q1_OPTIONS = [
  { value: 'jobs',        label: 'Finding a job or internship' },
  { value: 'mentorship',  label: 'Career mentorship & advice' },
  { value: 'city',        label: 'Networking with brothers in my city' },
  { value: 'connections', label: 'Keep the connections I\'m building in school' },
];

const Q2_OPTIONS = [
  { value: 'fewer_5',  label: 'Fewer than 5' },
  { value: '5_to_15',  label: '5 – 15' },
  { value: '15_to_30', label: '15 – 30' },
  { value: 'over_30',  label: 'More than 30' },
];

function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: Math.round(size * 0.32), fontWeight: 700,
      fontFamily: 'Inter, sans-serif', flexShrink: 0,
    }}>{initials}</div>
  );
}

function AlumniCard({ a }: { a: typeof ALUMNI[0] }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E8E6E0', borderRadius: 14,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
      minWidth: 248, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <Avatar name={a.name} color={a.color} size={42} />
      <div>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0D0D0D', fontFamily: 'Inter, sans-serif', lineHeight: 1.2 }}>{a.name}</div>
        <div style={{ fontSize: 12, color: '#5C5449', fontFamily: 'Inter, sans-serif', marginTop: 3 }}>{a.role} · {a.company}</div>
        <div style={{ fontSize: 11.5, color: '#9A9A9A', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>📍 {a.city}</div>
      </div>
    </div>
  );
}

function ScrollTrack({ items, reverse = false }: { items: typeof ALUMNI; reverse?: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div style={{ overflow: 'hidden', width: '100%', maskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)' }}>
      <div style={{
        display: 'flex', gap: 12,
        animation: `${reverse ? 'scrollRight' : 'scrollLeft'} 34s linear infinite`,
        width: 'max-content',
      }}>
        {doubled.map((a, i) => <AlumniCard key={i} a={a} />)}
      </div>
    </div>
  );
}

export default function InterestPage() {
  const [q1, setQ1] = useState<string | null>(null);
  const [q2, setQ2] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const canSubmit = q1 !== null && q2 !== null;

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital,wght@0,400;1,400&family=Inter:wght@400;500;600;700&display=swap');`}</style>
        <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <img src="/logos/logo-wordmark-navy.png" alt="Trailblaize" style={{ height: 32, width: 'auto', marginBottom: 40 }} />
          <h2 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 34, color: '#0D0D0D', marginBottom: 14, lineHeight: 1.2,
          }}>Your network is waiting.</h2>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, color: '#5C5449', lineHeight: 1.75, marginBottom: 10 }}>
            Download Trailblaize and start exploring your trail of connections — alumni and members verified across every organization already on the platform.
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: '#9A9A9A', lineHeight: 1.65, marginBottom: 36 }}>
            When your chapter gets set up, you'll unlock your full alumni network. Until then, discover who's already out there.
          </p>
          <a
            href="https://apps.apple.com/us/app/trailblaize/id6760151823"
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#0D0D0D', color: '#fff', fontFamily: 'Inter, sans-serif',
              fontWeight: 700, fontSize: 15, borderRadius: 14, padding: '16px 24px',
              textDecoration: 'none', marginBottom: 16,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            Download on the App Store
          </a>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#9A9A9A' }}>
            Want to get your chapter set up?{' '}
            <a href="https://trailblaize.net" style={{ color: '#1B2A4A', fontWeight: 700, textDecoration: 'none' }}>Learn more →</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', fontFamily: 'Inter, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital,wght@0,400;1,400&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes scrollLeft  { from { transform: translateX(0) }    to { transform: translateX(-50%) } }
        @keyframes scrollRight { from { transform: translateX(-50%) } to { transform: translateX(0) } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .opt:hover { border-color: #1B2A4A !important; }
      `}</style>

      {/* Nav */}
      <div style={{ padding: '28px 28px 0', textAlign: 'center' }}>
        <img src="/logos/logo-wordmark-navy.png" alt="Trailblaize" style={{ height: 36, width: 'auto' }} />
      </div>

      {/* Hero */}
      <div style={{ padding: '44px 24px 32px', textAlign: 'center', maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 'clamp(30px, 8vw, 46px)',
          color: '#0D0D0D', lineHeight: 1.15, marginBottom: 20, letterSpacing: '-0.01em',
        }}>
          Your chapter has been building this network for decades.{' '}
          <em style={{ color: '#1B2A4A' }}>You just can't access it yet.</em>
        </h1>
        <p style={{ fontSize: 16, color: '#5C5449', lineHeight: 1.75, maxWidth: 460, margin: '0 auto' }}>
          The average fraternity chapter has <strong style={{ color: '#0D0D0D' }}>500+ alumni</strong> spread across every city, company, and industry you want to break into. Most members can name fewer than 10.
        </p>
      </div>

      {/* Scrolling cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <ScrollTrack items={ALUMNI.slice(0, 8)} />
        <ScrollTrack items={[...ALUMNI].reverse().slice(0, 8)} reverse />
      </div>

      {/* Pain line */}
      <div style={{ textAlign: 'center', padding: '4px 28px 44px', maxWidth: 480, margin: '0 auto' }}>
        <p style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: 16, color: '#5C5449', fontStyle: 'italic', lineHeight: 1.7,
        }}>
          Most chapters have hundreds of alumni out there. They just have no way to reach them.
        </p>
      </div>

      {/* Questions */}
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 60px' }}>
        <div style={{ borderTop: '1px solid #D9D4CC', marginBottom: 36 }} />

        {/* Q1 */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9A9A9A', marginBottom: 10 }}>1 of 2</p>
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 23, color: '#0D0D0D', marginBottom: 18, lineHeight: 1.3,
          }}>
            What would you use your alumni network for most?
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Q1_OPTIONS.map(opt => (
              <button key={opt.value} className="opt" onClick={() => setQ1(opt.value)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: q1 === opt.value ? '#0D0D0D' : '#fff',
                border: `1.5px solid ${q1 === opt.value ? '#0D0D0D' : '#D9D4CC'}`,
                borderRadius: 12, padding: '14px 16px',
                fontSize: 14, color: q1 === opt.value ? '#fff' : '#3A3A3A',
                fontWeight: q1 === opt.value ? 600 : 400,
                fontFamily: 'Inter, sans-serif', textAlign: 'left', width: '100%', cursor: 'pointer',
              }}>
                {opt.label}
                {q1 === opt.value && <span style={{ fontSize: 14, opacity: 0.8 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Q2 */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9A9A9A', marginBottom: 10 }}>2 of 2</p>
          <h3 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 23, color: '#0D0D0D', marginBottom: 6, lineHeight: 1.3,
          }}>
            How many alumni from your chapter do you actually know?
          </h3>
          <p style={{ fontSize: 13, color: '#9A9A9A', marginBottom: 18, fontStyle: 'italic' }}>Brothers you could reach out to today and get a response.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {Q2_OPTIONS.map(opt => (
              <button key={opt.value} className="opt" onClick={() => setQ2(opt.value)} style={{
                background: q2 === opt.value ? '#1B2A4A' : '#fff',
                border: `1.5px solid ${q2 === opt.value ? '#1B2A4A' : '#D9D4CC'}`,
                borderRadius: 12, padding: '15px 12px',
                fontSize: 15, fontWeight: 600,
                color: q2 === opt.value ? '#fff' : '#0D0D0D',
                fontFamily: 'Inter, sans-serif', cursor: 'pointer', transition: 'all 0.12s',
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => canSubmit && setSubmitted(true)} disabled={!canSubmit} style={{
          width: '100%',
          background: canSubmit ? '#1B2A4A' : '#D9D4CC',
          color: canSubmit ? '#fff' : '#9A9A9A',
          fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 16,
          border: 'none', borderRadius: 14, padding: '17px',
          cursor: canSubmit ? 'pointer' : 'not-allowed', transition: 'opacity 0.15s',
        }}>
          See what's out there →
        </button>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#9A9A9A', marginTop: 14, lineHeight: 1.6 }}>
          Your answers help your exec board understand what members actually want.
        </p>
      </div>
    </div>
  );
}
