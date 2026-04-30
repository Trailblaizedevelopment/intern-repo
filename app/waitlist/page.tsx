'use client';

import React, { useState, useEffect, useRef } from 'react';

const CATEGORIES = [
  'Fraternity', 'Sorority', 'Club Sport', 'Business Club',
  'Honor Society', 'Student Government', 'Professional Org',
  'Club Team', 'Startup', 'Church Group', 'Volunteer Org', 'Other'
];

interface Affiliation {
  category: string;
  orgName: string;
}

// Alpha Chapter profiles — real names with local face placeholders
const ALPHA_PROFILES = [
  { name: 'Payne', avatar: '/faces/face1.jpg', role: 'Account Executive @ Knight Commercial' },
  { name: 'Nash', avatar: '/faces/face2.jpg', role: 'Dir of Operations, US Senate' },
  { name: 'Jake', avatar: '/faces/face3.jpg', role: 'Founder @ Scratch AI' },
  { name: 'Ethan', avatar: '/faces/face4.jpg', role: 'Financial Services Rep @ Fidelity' },
  { name: 'Andrew', avatar: '/faces/face5.jpg', role: 'IB Analyst @ GSI Capital' },
  { name: 'Gavin', avatar: '/faces/face6.jpg', role: 'Credit Portfolio Analyst @ JPMorgan' },
  { name: 'Luke', avatar: '/faces/face7.jpg', role: 'MS Finance @ McCombs' },
  { name: 'Zach', avatar: '/faces/face8.jpg', role: 'VP of BD @ Virtue' },
  { name: 'Andrew L.', avatar: '/faces/face9.jpg', role: 'GTM @ Glean' },
  { name: 'Peyton', avatar: '/faces/face10.jpg', role: 'Financial Advisor @ Williams Wealth' },
  { name: 'Abhi', avatar: '/faces/face11.jpg', role: 'AI Product @ Search Party' },
  { name: 'Chadwick', avatar: '/faces/face12.jpg', role: 'Active Member, Finance 29' },
];

// Floating node for the animated web
interface WebNode {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  faceIdx: number;
}

function AnimatedWeb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<WebNode[]>([]);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Load face images from Alpha profiles
    const imgs: HTMLImageElement[] = [];
    ALPHA_PROFILES.forEach((profile, i) => {
      const img = new Image();
      img.src = profile.avatar;
      img.onerror = () => { /* silently fail */ };
      imgs[i] = img;
    });
    imagesRef.current = imgs;

    // Create nodes
    const nodeCount = 20;
    const nodes: WebNode[] = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        id: i,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: i < 12 ? 34 : 6,
        faceIdx: i < 12 ? i : -1,
      });
    }
    nodesRef.current = nodes;

    const connectionDist = 260;

    const animate = () => {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Update positions
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -40) node.x = canvas.width + 40;
        if (node.x > canvas.width + 40) node.x = -40;
        if (node.y < -40) node.y = canvas.height + 40;
        if (node.y > canvas.height + 40) node.y = -40;
      }

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDist) {
            const opacity = (1 - dist / connectionDist) * 0.25;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        if (node.faceIdx >= 0 && imgs[node.faceIdx]?.complete && imgs[node.faceIdx]?.naturalWidth > 0) {
          // Face node with circular clip
          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          try {
            ctx.drawImage(imgs[node.faceIdx], node.x - node.radius, node.y - node.radius, node.radius * 2, node.radius * 2);
          } catch {
            // fallback
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fill();
          }
          ctx.restore();
          // Border
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
          // Name label
          const name = ALPHA_PROFILES[node.faceIdx]?.name ?? '';
          ctx.font = '600 10px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(name, node.x, node.y + node.radius + 4);
        } else {
          // Plain dot node
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }} />;
}

export default function WaitlistPage() {
  const [showForm, setShowForm] = useState(false);
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

  const isSelected = (cat: string) => affiliations.some(a => a.category === cat);
  const canSubmit = firstName.trim() && phone.replace(/\D/g, '').length >= 10;

  // SPLASH SCREEN — animated web with faces
  if (!showForm && !submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#B8B5AD', position: 'relative', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setShowForm(true)}>
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
        <AnimatedWeb />

        {/* Center text */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, textAlign: 'center', width: '90%', maxWidth: 600 }}>
          <h1 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(42px, 10vw, 72px)',
            fontWeight: 700,
            color: 'white',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            textShadow: '0 2px 40px rgba(0,0,0,0.3)',
            marginBottom: 20,
          }}>
            Everyone is<br />connected&hellip;<br />are you?
          </h1>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '12px 28px', borderRadius: 40,
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
          >
            <span style={{
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontSize: 18,
              color: 'white',
              fontWeight: 400,
              fontStyle: 'italic',
            }}>
              Tap to find out
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </div>
        </div>
      </div>
    );
  }

  // SUCCESS SCREEN
  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#B8B5AD', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
        <AnimatedWeb />
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', position: 'relative', zIndex: 10 }}>
          <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: 'white', fontSize: 48, fontWeight: 700, marginBottom: 14, textShadow: '0 2px 20px rgba(0,0,0,0.2)' }}>
            You&apos;re in.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, lineHeight: 1.7, fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 340, margin: '0 auto' }}>
            We&apos;ll text you when the app is ready.
          </p>
        </div>
      </div>
    );
  }

  // FORM SCREEN
  return (
    <div style={{ minHeight: '100vh', background: '#B8B5AD', position: 'relative', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
      <AnimatedWeb />

      <div style={{ maxWidth: 460, width: '100%', margin: '0 auto', padding: '50px 24px 40px', position: 'relative', zIndex: 10 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: 'clamp(32px, 7vw, 44px)',
            fontWeight: 700,
            color: 'white',
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            textShadow: '0 2px 20px rgba(0,0,0,0.15)',
            marginBottom: 10,
          }}>
            Join the waitlist.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 1.6, fontFamily: 'Inter, system-ui, sans-serif' }}>
            Your private network is almost ready.
          </p>
        </div>

        {/* Form card */}
        <div style={{
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(20px)',
          border: 'none',
          borderRadius: 16,
          padding: '28px 24px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input type="text" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
              />
              <input type="text" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
              />
            </div>

            <input type="tel" placeholder="Phone number" value={phone} onChange={e => setPhone(formatPhone(e.target.value))}
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
            />

            <input type="text" placeholder="University" value={school} onChange={e => setSchool(e.target.value)}
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
            />

            <div>
              <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter, system-ui, sans-serif' }}>
                Your organizations
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CATEGORIES.map(cat => {
                  const selected = isSelected(cat);
                  const affiliation = affiliations.find(a => a.category === cat);
                  return (
                    <button key={cat} onClick={() => toggleCategory(cat)}
                      style={{
                        padding: '6px 12px', borderRadius: 20, border: '1px solid #E5E7EB', cursor: 'pointer',
                        background: selected ? '#0F172A' : '#F9FAFB',
                        color: selected ? 'white' : '#374151',
                        fontSize: 12, fontWeight: selected ? 600 : 400, fontFamily: 'Inter, system-ui, sans-serif',
                        transition: 'all 0.15s',
                      }}
                    >
                      {selected ? `${cat}: ${affiliation?.orgName}` : cat}
                      {selected && <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.5 }}>✕</span>}
                    </button>
                  );
                })}
              </div>
              {expandedCategory && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <input type="text" autoFocus placeholder={`Name of your ${expandedCategory.toLowerCase()}...`}
                    value={orgInput} onChange={e => setOrgInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && orgInput.trim()) confirmOrg(); }}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 13, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
                  />
                  <button onClick={confirmOrg} disabled={!orgInput.trim()}
                    style={{ padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: orgInput.trim() ? '#0F172A' : '#E5E7EB', color: orgInput.trim() ? 'white' : '#9CA3AF', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif' }}>
                    Add
                  </button>
                </div>
              )}
            </div>

            <button onClick={handleSubmit} disabled={!canSubmit || loading}
              style={{
                padding: '14px 24px', borderRadius: 10, border: 'none',
                background: canSubmit ? '#0F172A' : '#E5E7EB',
                color: canSubmit ? 'white' : '#9CA3AF',
                fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
                marginTop: 4, fontFamily: 'Inter, system-ui, sans-serif',
                opacity: loading ? 0.7 : 1, transition: 'all 0.15s',
              }}
            >
              {loading ? 'Joining...' : 'Get Early Access'}
            </button>
          </div>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center', marginTop: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
          No spam. We&apos;ll text you when the app launches.
        </p>
      </div>
    </div>
  );
}
