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

// ─── Avatar URLs for the animated web ───────────────────────────────────────

// Animated abstract web — dots and lines, no images
function AnimatedWeb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const startTime = Date.now();

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    // Create 30 nodes
    const nodes: { x: number; y: number; vx: number; vy: number; r: number; }[] = [];
    for (let i = 0; i < 30; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 3 + Math.random() * 4,
      });
    }

    const connectionDist = 200;

    const animate = () => {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const elapsed = Date.now() - startTime;
      const visibleCount = Math.min(30, Math.floor(elapsed / 150) + 1);

      // Update + bounce
      for (let i = 0; i < visibleCount; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 10 || n.x > canvas.width - 10) n.vx *= -1;
        if (n.y < 10 || n.y > canvas.height - 10) n.vy *= -1;
      }

      // Draw connections
      for (let i = 0; i < visibleCount; i++) {
        for (let j = i + 1; j < visibleCount; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDist) {
            const opacity = (1 - dist / connectionDist) * 0.3;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      for (let i = 0; i < visibleCount; i++) {
        const n = nodes[i];
        const nodeAge = elapsed - (i * 150);
        const alpha = Math.min(1, nodeAge / 400);

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * alpha})`;
        ctx.fill();
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

// Categories for "other" orgs — national orgs handled separately via dropdown
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
