'use client';

import React, { useState, useEffect, useRef } from 'react';

// Categories for "other" orgs — national orgs handled separately via dropdown
const OTHER_CATEGORIES = [
  'Club Sport', 'Business Club', 'Student Government',
  'Club Team', 'Startup', 'Church Group', 'Volunteer Org', 'Other'
];

const ORG_TYPES = [
  { label: 'Fraternity', value: 'fraternity' },
  { label: 'Sorority', value: 'sorority' },
  { label: 'Honor Society', value: 'honor' },
  { label: 'Professional Org', value: 'professional' },
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface SchoolOption {
  id: string;
  name: string;
  short_name?: string;
  location?: string;
}

interface OrgOption {
  id: string;
  name: string;
  short_name?: string;
  type: string;
}

interface DropdownItem {
  id: string;
  name: string;
}

interface OtherAffiliation {
  category: string;
  orgName: string;
}

// ─── SearchableDropdown ───────────────────────────────────────────────────────

interface SearchableDropdownProps {
  placeholder: string;
  items: DropdownItem[];
  selected: DropdownItem | null;
  onSelect: (item: DropdownItem | null) => void;
  renderItem?: (item: DropdownItem) => React.ReactNode;
  disabled?: boolean;
}

function SearchableDropdown({
  placeholder,
  items,
  selected,
  onSelect,
  renderItem,
  disabled,
}: SearchableDropdownProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = items
    .filter(item =>
      query.length === 0 || item.name.toLowerCase().includes(query.toLowerCase())
    )
    .slice(0, 60);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (selected) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1.5px solid #22C55E',
          background: '#F0FDF4',
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 14,
            color: '#166534',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontWeight: 500,
          }}
        >
          ✓ {selected.name}
        </span>
        <button
          type="button"
          onClick={() => { if (!disabled) onSelect(null); }}
          style={{
            background: 'none',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            color: '#9CA3AF',
            fontSize: 14,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        disabled={disabled}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        style={{
          width: '100%',
          padding: '12px 14px',
          borderRadius: 10,
          border: `1px solid ${open ? '#6366F1' : '#E5E7EB'}`,
          background: disabled ? '#F9FAFB' : 'white',
          color: '#374151',
          fontSize: 15,
          outline: 'none',
          fontFamily: 'Inter, system-ui, sans-serif',
          boxSizing: 'border-box',
          opacity: disabled ? 0.5 : 1,
        }}
      />
      {open && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            maxHeight: 200,
            overflowY: 'auto',
            marginTop: 4,
          }}
        >
          {filtered.length > 0 ? (
            filtered.map(item => (
              <div
                key={item.id}
                onMouseDown={() => { onSelect(item); setQuery(''); setOpen(false); }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: '#374151',
                  fontFamily: 'Inter, system-ui, sans-serif',
                  borderBottom: '1px solid #F3F4F6',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#F9FAFB'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'white'; }}
              >
                {renderItem ? renderItem(item) : item.name}
              </div>
            ))
          ) : (
            <div
              style={{
                padding: '12px 14px',
                color: '#9CA3AF',
                fontSize: 13,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {query.length > 0 ? 'No results found' : 'Start typing to search…'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Alpha Chapter profiles ───────────────────────────────────────────────────

const ALPHA_PROFILES = [
  // Alpha Chapter (men) — 12
  { name: 'Nash', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/6f14185e-61b9-468d-a0fc-1d46eb5e122d-1776171521116.jpg', role: 'Dir of Ops, US Senate' },
  { name: 'Ethan', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/cc27eb12-c5fb-4d60-86ef-74e6f28ad9a4-1776170865222.jpg', role: 'Financial Services @ Fidelity' },
  { name: 'Jake', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/4be69e44-669f-442e-8859-731db416ea3b-1776172132818.jpg', role: 'Founder @ Scratch AI' },
  { name: 'Gavin', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/365ac617-1637-4a85-b02c-b2b23b4307c7-1776171942678.jpg', role: 'Analyst @ JPMorgan' },
  { name: 'Garrett', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/8ee6fb3e-f6a8-486f-a140-cad49adfeee4-1776171107178.jpg', role: 'Underwriter @ Chubb' },
  { name: 'Payne', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/dec7107c-53b3-4613-8929-1357413117f5-1776171340287.jpg', role: 'AE @ Knight Commercial' },
  { name: 'Andrew', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/799297e8-2135-4ffd-aa78-a4b370964ed4-1776172249725.jpg', role: 'IB Analyst @ GSI Capital' },
  { name: 'Dimitri', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/c5b64119-3a87-40ca-b9ce-0f895daa35f2-1776171773028.png', role: 'Growth @ Doorlist' },
  { name: 'Peyton', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/c763c3a6-f096-4d2d-bb33-ab72fa68f18d-1776171724379.jpg', role: 'Advisor @ Williams Wealth' },
  { name: 'Luke', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/b3c91296-b4d6-4bc3-80ae-8f428d238bf7-1776172539399.jpg', role: 'MS Finance @ McCombs' },
  { name: 'Nick', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/927335a8-cce4-4f05-b004-281d8d8c00f9-1776170450281.jpg', role: 'AE @ Hooray Health' },
  { name: 'Eli', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/53cb2180-3389-4ab5-a273-cc07b9dc1930-1776172483234.jpg', role: 'Real Estate @ Watersound' },
  // Omega Chapter (women) — 12
  { name: 'Sarah B.', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/793c6990-cf2d-436c-97ce-adde55d88b80-1777564226650.jpg', role: 'Scheduler, US Senate' },
  { name: 'Megan', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/8005621f-cb31-42a6-b7e3-29d756d6d49a-1777563457055.png', role: 'CRA @ Fidelity' },
  { name: 'Maria', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/7b28512b-59c9-4a2d-a7d6-955b48ce3c8a-1777563644735.jpg', role: 'Sales @ Jack Victor' },
  { name: 'Mary', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/5a8d9026-e29e-4b45-b070-1a171330dedd-1777564410163.png', role: 'Real Estate @ Compass' },
  { name: 'Brenley', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/2701ac2c-5f21-484d-99f6-93ee5dc992f7-1777565592730.jpg', role: 'Business Comms, NYC' },
  { name: 'Paloma', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/601df2dd-0691-4ecc-90c6-bace232857f6-1777563930930.jpg', role: 'Wealth Mgmt @ Fidelity' },
  { name: 'Nat', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/9e6a9d40-3193-4e8c-9ed6-5ff6d4e89e87-1777563259842.jpg', role: 'CRA @ Fidelity' },
  { name: 'Brooks', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/84757da0-ab6d-44b2-9a45-a4fd21aded5c-1777564053378.jpg', role: 'Marketing @ OakTruss' },
  { name: 'Elise', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/fc766b39-5a30-4ada-abec-e276e6784216-1777564716161.jpg', role: 'Dental Assistant' },
  { name: 'Lindsey', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/17cd225c-782f-487c-a9bd-10abfd4fe5e7-1777565363946.png', role: 'Dietitian @ NutriFocus' },
  { name: 'Sadler', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/9882ad6a-3e53-472d-89eb-e8e8d435ccf8-1777565880596.jpg', role: 'Stylist @ Natasha Colvin' },
  { name: 'Ivonne', avatar: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/2e275ac2-aa89-4d5f-872a-4bfaa5d0125f-1777560860099.jpg', role: 'Finance Professor' },
];

// ─── Floating node for the animated web ──────────────────────────────────────

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

    const imgs: HTMLImageElement[] = [];
    ALPHA_PROFILES.forEach((profile, i) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = profile.avatar;
      img.onerror = () => { /* silently fail */ };
      imgs[i] = img;
    });
    imagesRef.current = imgs;

    const nodeCount = 32;
    const nodes: WebNode[] = [];
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        id: i,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        radius: i < 24 ? 30 : 5,
        faceIdx: i < 24 ? i : -1,
      });
    }
    nodesRef.current = nodes;

    const connectionDist = 260;

    const animate = () => {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < -40) node.x = canvas.width + 40;
        if (node.x > canvas.width + 40) node.x = -40;
        if (node.y < -40) node.y = canvas.height + 40;
        if (node.y > canvas.height + 40) node.y = -40;
      }

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

      for (const node of nodes) {
        if (node.faceIdx >= 0 && imgs[node.faceIdx]?.complete && imgs[node.faceIdx]?.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          try {
            ctx.drawImage(imgs[node.faceIdx], node.x - node.radius, node.y - node.radius, node.radius * 2, node.radius * 2);
          } catch {
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fill();
          }
          ctx.restore();
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
          const name = ALPHA_PROFILES[node.faceIdx]?.name ?? '';
          ctx.font = '600 10px Inter, system-ui, sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(name, node.x, node.y + node.radius + 4);
        } else {
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

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WaitlistPage() {
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  // School data
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<SchoolOption | null>(null);

  // National org data
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [showOrgSection, setShowOrgSection] = useState(false);
  const [selectedOrgType, setSelectedOrgType] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<OrgOption | null>(null);

  // Other affiliations (category buttons)
  const [affiliations, setAffiliations] = useState<OtherAffiliation[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [orgInput, setOrgInput] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load schools + orgs on mount (cached in state)
  useEffect(() => {
    fetch('/api/waitlist/schools')
      .then(r => r.json())
      .then(d => setSchools(d.schools || []))
      .catch(() => {});

    fetch('/api/waitlist/orgs')
      .then(r => r.json())
      .then(d => setOrgs(d.orgs || []))
      .catch(() => {});
  }, []);

  // Filtered orgs by selected type
  const filteredOrgs: OrgOption[] = selectedOrgType
    ? orgs.filter(o => o.type?.toLowerCase().includes(selectedOrgType))
    : [];

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  };

  const toggleOtherCategory = (cat: string) => {
    const existing = affiliations.find(a => a.category === cat);
    if (existing) {
      setAffiliations(affiliations.filter(a => a.category !== cat));
      if (expandedCategory === cat) setExpandedCategory(null);
    } else {
      setExpandedCategory(cat);
      setOrgInput('');
    }
  };

  const confirmOtherOrg = () => {
    if (expandedCategory && orgInput.trim()) {
      setAffiliations([
        ...affiliations.filter(a => a.category !== expandedCategory),
        { category: expandedCategory, orgName: orgInput.trim() },
      ]);
      setExpandedCategory(null);
      setOrgInput('');
    }
  };

  const handleOrgTypeSelect = (value: string) => {
    if (selectedOrgType === value) {
      setSelectedOrgType('');
    } else {
      setSelectedOrgType(value);
      setSelectedOrg(null);
    }
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || phone.replace(/\D/g, '').length < 10 || !selectedSchool) return;
    setLoading(true);
    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.replace(/\D/g, ''),
          university: selectedSchool.name,
          university_id: selectedSchool.id,
          national_org: selectedOrg?.name || null,
          national_org_id: selectedOrg?.id || null,
          org_type: selectedOrg?.type || null,
          org_name: selectedOrg?.name || null,
          affiliations: affiliations.map(a => `${a.category}: ${a.orgName}`),
        }),
      });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isOtherSelected = (cat: string) => affiliations.some(a => a.category === cat);
  const canSubmit =
    firstName.trim() &&
    phone.replace(/\D/g, '').length >= 10 &&
    !!selectedSchool;

  // ── SPLASH SCREEN ──────────────────────────────────────────────────────────
  if (!showForm && !submitted) {
    return (
      <div
        style={{ minHeight: '100vh', background: '#4A4A4F', position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
        onClick={() => setShowForm(true)}
      >
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
        <AnimatedWeb />

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

          <div
            style={{
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
            <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 18, color: 'white', fontWeight: 400, fontStyle: 'italic' }}>
              Tap to find out
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // ── SUCCESS SCREEN ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#4A4A4F', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative', overflow: 'hidden' }}>
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
        <AnimatedWeb />
        <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', position: 'relative', zIndex: 10 }}>
          <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", color: 'white', fontSize: 48, fontWeight: 700, marginBottom: 14, textShadow: '0 2px 20px rgba(0,0,0,0.2)' }}>
            You&apos;re in.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, lineHeight: 1.7, fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 340, margin: '0 auto' }}>
            We&apos;ll text you when the app is launched.
          </p>
        </div>
      </div>
    );
  }

  // ── FORM SCREEN ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#4A4A4F', position: 'relative', overflow: 'hidden' }}>
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
          borderRadius: 16,
          padding: '28px 24px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Name row */}
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                placeholder="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
              />
              <input
                type="text"
                placeholder="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                style={{ flex: 1, padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
              />
            </div>

            {/* Phone */}
            <input
              type="tel"
              placeholder="Phone number"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 15, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
            />

            {/* University — searchable dropdown (required) */}
            <div>
              <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, fontFamily: 'Inter, system-ui, sans-serif' }}>
                University <span style={{ color: '#EF4444' }}>*</span>
              </p>
              <SearchableDropdown
                placeholder="Search your university…"
                items={schools}
                selected={selectedSchool}
                onSelect={item => setSelectedSchool(item as SchoolOption | null)}
                renderItem={item => {
                  const s = item as unknown as SchoolOption;
                  return (
                    <div>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      {s.location && (
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>{s.location}</div>
                      )}
                    </div>
                  );
                }}
              />
            </div>

            {/* National Organization — optional */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
                  National Organization
                </p>
                {!showOrgSection && (
                  <button
                    type="button"
                    onClick={() => setShowOrgSection(true)}
                    style={{
                      background: 'none', border: '1px solid #E5E7EB', borderRadius: 20,
                      padding: '4px 12px', fontSize: 12, color: '#6B7280',
                      cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                  >
                    + Add
                  </button>
                )}
                {showOrgSection && (
                  <button
                    type="button"
                    onClick={() => { setShowOrgSection(false); setSelectedOrgType(''); setSelectedOrg(null); }}
                    style={{
                      background: 'none', border: 'none', fontSize: 12, color: '#9CA3AF',
                      cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>

              {showOrgSection && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Type selector */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ORG_TYPES.map(t => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => handleOrgTypeSelect(t.value)}
                        style={{
                          padding: '6px 14px', borderRadius: 20,
                          border: `1px solid ${selectedOrgType === t.value ? '#0F172A' : '#E5E7EB'}`,
                          background: selectedOrgType === t.value ? '#0F172A' : '#F9FAFB',
                          color: selectedOrgType === t.value ? 'white' : '#374151',
                          fontSize: 13, fontWeight: selectedOrgType === t.value ? 600 : 400,
                          cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                          transition: 'all 0.15s',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Org search dropdown — only show when type selected */}
                  {selectedOrgType && (
                    <SearchableDropdown
                      placeholder={`Search ${ORG_TYPES.find(t => t.value === selectedOrgType)?.label ?? 'organization'}…`}
                      items={filteredOrgs}
                      selected={selectedOrg}
                      onSelect={item => setSelectedOrg(item as OrgOption | null)}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Other organizations */}
            <div>
              <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Inter, system-ui, sans-serif' }}>
                Other Organizations
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {OTHER_CATEGORIES.map(cat => {
                  const selected = isOtherSelected(cat);
                  const affiliation = affiliations.find(a => a.category === cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleOtherCategory(cat)}
                      style={{
                        padding: '6px 12px', borderRadius: 20, border: '1px solid #E5E7EB', cursor: 'pointer',
                        background: selected ? '#0F172A' : '#F9FAFB',
                        color: selected ? 'white' : '#374151',
                        fontSize: 12, fontWeight: selected ? 600 : 400,
                        fontFamily: 'Inter, system-ui, sans-serif',
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
                  <input
                    type="text"
                    autoFocus
                    placeholder={`Name of your ${expandedCategory.toLowerCase()}…`}
                    value={orgInput}
                    onChange={e => setOrgInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && orgInput.trim()) confirmOtherOrg(); }}
                    style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'white', color: '#374151', fontSize: 13, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
                  />
                  <button
                    type="button"
                    onClick={confirmOtherOrg}
                    disabled={!orgInput.trim()}
                    style={{
                      padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: orgInput.trim() ? '#0F172A' : '#E5E7EB',
                      color: orgInput.trim() ? 'white' : '#9CA3AF',
                      fontSize: 13, fontWeight: 600, fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || loading}
              style={{
                padding: '14px 24px', borderRadius: 10, border: 'none',
                background: canSubmit ? '#0F172A' : '#E5E7EB',
                color: canSubmit ? 'white' : '#9CA3AF',
                fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
                marginTop: 4, fontFamily: 'Inter, system-ui, sans-serif',
                opacity: loading ? 0.7 : 1, transition: 'all 0.15s',
              }}
            >
              {loading ? 'Joining…' : 'Get Early Access'}
            </button>

          </div>
        </div>

        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center', marginTop: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
          No spam. We&apos;ll text you when the app is launched.
        </p>
      </div>
    </div>
  );
}
