'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, X, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeadStatus = 'Active' | 'Check In' | 'Hold Off';
type LeadOwner = 'Owen' | 'Ford' | 'Adam' | 'Team';

interface SalesLead {
  id: string;
  org_name: string;
  school: string | null;
  contact_name: string | null;
  owner: LeadOwner | null;
  status: LeadStatus;
  pipeline_value: number | null;
  last_contact: string | null;
  next_step: string | null;
  notes: string | null;
  is_enterprise: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Seed Data ─────────────────────────────────────────────────────────────────

const SEED_LEADS: Omit<SalesLead, 'id' | 'created_at' | 'updated_at'>[] = [
  // ── ACTIVE ──
  { org_name: 'Alabama KA',          school: 'Alabama',       contact_name: null,           owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Ole Miss ATO',        school: 'Ole Miss',      contact_name: null,           owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Ole Miss Phi Delt',   school: 'Ole Miss',      contact_name: null,           owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Ole Miss Sigma Pi',   school: 'Ole Miss',      contact_name: null,           owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Ole Miss Sigma Chi',  school: 'Ole Miss',      contact_name: null,           owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Boulder Theta Xi',    school: 'Colorado',      contact_name: 'Bryce Kallio', owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Tennessee SAE',       school: 'Tennessee',     contact_name: null,           owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Sigma Alpha Mu @ Miami', school: 'Miami (OH)', contact_name: null,           owner: 'Ford', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Theta Chi @ Indiana', school: 'Indiana',       contact_name: null,           owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'K2 Killers @ TAMU',   school: 'Texas A&M',     contact_name: 'Alex Winslow', owner: 'Owen', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Chapman AEPI',        school: 'Chapman',       contact_name: null,           owner: 'Adam', status: 'Active',    pipeline_value: null, last_contact: null, next_step: null, notes: null, is_enterprise: false },
  // ── CHECK IN ──
  { org_name: 'KKG @ SMU',                         school: 'SMU',               contact_name: 'Claire Moore',  owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Lambda Chi @ OU',                   school: 'Oklahoma',          contact_name: 'Fiskecooper',   owner: 'Adam', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Theta Xi Nationals',                school: 'National',          contact_name: 'Armando',       owner: 'Owen', status: 'Check In', pipeline_value: 40000,   last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'Delta Psi (Mackay) @ Ole Miss',     school: 'Ole Miss',          contact_name: 'Hayes Hathorn', owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'TCU Sigma Chi',                     school: 'TCU',               contact_name: 'Lucas Rogers',  owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'TCU Phi Delt',                      school: 'TCU',               contact_name: 'Clyde Patton',  owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'TAMU ATO',                          school: 'Texas A&M',         contact_name: 'Jack Eggi',     owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'TAMU SigEp',                        school: 'Texas A&M',         contact_name: 'Will Oliver',   owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Clemson Beta',                      school: 'Clemson',           contact_name: 'William Dixon', owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Clemson FIJI',                      school: 'Clemson',           contact_name: 'Patrick',       owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'KA @ Clemson',                      school: 'Clemson',           contact_name: 'Jack Johnson',  owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'LSU KA',                            school: 'LSU',               contact_name: 'Ethan Carmouche',owner:'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'IFC LSU',                           school: 'LSU',               contact_name: 'Blake Ranlett', owner: 'Owen', status: 'Check In', pipeline_value: 20000,   last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'PIKE @ ASU',                        school: 'Arizona State',     contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Beta @ SMU',                        school: 'SMU',               contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'TAMU FIJI',                         school: 'Texas A&M',         contact_name: 'Blake Meary',   owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Auburn Theta Chi',                  school: 'Auburn',            contact_name: 'Joseph Couch',  owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Arkansas Kappa Sig',                school: 'Arkansas',          contact_name: 'Hudson Kincaid',owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Kappa Sig @ TCU',                   school: 'TCU',               contact_name: 'Sam Rivas',     owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'TCU Beta',                          school: 'TCU',               contact_name: 'Derek Yang',    owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Texas Tech Phi Delt',               school: 'Texas Tech',        contact_name: 'Luke Rumsey',   owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'IFC TCU',                           school: 'TCU',               contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 46000,   last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC Ole Miss',                      school: 'Ole Miss',          contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 20000,   last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC UMiami',                        school: 'Miami',             contact_name: 'Josh Sackett',  owner: 'Owen', status: 'Check In', pipeline_value: 20000,   last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'Alpha Delta Pi @ SC',               school: 'South Carolina',    contact_name: 'Momo Farmer',   owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Sigma Chi International (Lee Beauchamp)', school: 'National',  contact_name: 'Lee Beauchamp',  owner: 'Team', status: 'Check In', pipeline_value: 250000,  last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'SAM Nationals (via Hayden Demos)',  school: 'National',          contact_name: 'Hayden Demos',  owner: 'Ford', status: 'Check In', pipeline_value: 250000,  last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'Phi Delt @ Arizona',               school: 'Arizona',           contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Lambda Chi @ Eastern Illinois',    school: 'Eastern Illinois',  contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'ATO @ Oklahoma State',             school: 'Oklahoma State',    contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Sigma Chi @ Sacred Heart',         school: 'Sacred Heart',      contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Sigma Chi @ WL University',        school: 'Waterloo (Canada)', contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Alpha Chi Rho @ Robert Morris',    school: 'Robert Morris',     contact_name: null,            owner: 'Owen', status: 'Check In', pipeline_value: 3588,    last_contact: null, next_step: null, notes: null, is_enterprise: false },
  // ── HOLD OFF ──
  { org_name: 'Arkansas Phi Delt',        school: 'Arkansas',      contact_name: 'Mason Harris',  owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Arkansas Chi Omega',       school: 'Arkansas',      contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Georgia Chi Phi',          school: 'Georgia',       contact_name: 'Boon Elliott',  owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Michigan State Phi Kap Sig',school: 'Michigan State',contact_name: 'Sam',          owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Boulder SAE',              school: 'Colorado',      contact_name: 'Nathan Wilson', owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Temple KDR',              school: 'Temple',         contact_name: 'Ben Santorini', owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Alabama KKG',             school: 'Alabama',        contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Alabama DKE',             school: 'Alabama',        contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Ole Miss KKG',            school: 'Ole Miss',       contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'South Alabama KA',        school: 'South Alabama',  contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'IFC Berkeley',            school: 'UC Berkeley',    contact_name: 'Jeff Woods',    owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC Georgia Tech',        school: 'Georgia Tech',   contact_name: 'Noah Pastula',  owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC Mississippi State',   school: 'Mississippi State',contact_name: null,          owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC Missouri',            school: 'Missouri',       contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC Alabama',             school: 'Alabama',        contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC Tennessee',           school: 'Tennessee',      contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC Michigan State',      school: 'Michigan State', contact_name: 'Cliff Kendall', owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC Auburn',              school: 'Auburn',         contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'IFC CNU',                 school: 'CNU',            contact_name: 'Jason Trager',  owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, last_contact: null, next_step: null, notes: null, is_enterprise: true  },
  { org_name: 'Alabama Sig Ep',          school: 'Alabama',        contact_name: 'Reid Patterson',owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Texas SAE',               school: 'Texas',          contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'LSU TKE',                 school: 'LSU',            contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Chapman Beta',            school: 'Chapman',        contact_name: null,            owner: 'Adam', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'TAMU PIKE',               school: 'Texas A&M',      contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Texas SigEp',             school: 'Texas',          contact_name: null,            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  last_contact: null, next_step: null, notes: null, is_enterprise: false },
  { org_name: 'Parrish Dallas (High School)', school: 'Parrish (Dallas)', contact_name: 'ssarles@parish.org', owner: 'Owen', status: 'Hold Off', pipeline_value: 0, last_contact: null, next_step: null, notes: null, is_enterprise: false },
];

// ─── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<LeadStatus, { color: string; bg: string; border: string; dot: string }> = {
  'Active':    { color: '#065f46', bg: '#d1fae5', border: '#6ee7b7', dot: '#10b981' },
  'Check In':  { color: '#92400e', bg: '#fef3c7', border: '#fcd34d', dot: '#f59e0b' },
  'Hold Off':  { color: '#374151', bg: '#f3f4f6', border: '#d1d5db', dot: '#9ca3af' },
};

const OWNER_COLORS: Record<string, string> = {
  Owen: '#0F172A',
  Ford: '#2563eb',
  Adam: '#10b981',
  Team: '#7c3aed',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '9999px', fontSize: '0.75rem',
      fontWeight: 600, color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: '6px', height: '6px', borderRadius: '9999px', background: cfg.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

// ─── Owner Chip ────────────────────────────────────────────────────────────────

function OwnerChip({ owner }: { owner: string | null }) {
  if (!owner) return <span style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>—</span>;
  const color = OWNER_COLORS[owner] ?? '#6b7280';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px 2px 3px', borderRadius: '9999px',
      background: color, color: '#fff', fontSize: '0.72rem', fontWeight: 700,
    }}>
      <span style={{
        width: '18px', height: '18px', borderRadius: '9999px',
        background: 'rgba(255,255,255,0.2)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800,
      }}>
        {owner[0]}
      </span>
      {owner}
    </span>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  status, count, collapsed, onToggle,
}: { status: LeadStatus; count: number; collapsed: boolean; onToggle: () => void }) {
  const cfg = STATUS_CONFIG[status];
  const descriptions: Record<LeadStatus, string> = {
    'Active': 'Closed — paying customers',
    'Check In': 'Prospects in dialogue / need follow-up',
    'Hold Off': 'Back burner / stalled',
  };
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 16px', cursor: 'pointer', userSelect: 'none',
        background: cfg.bg, borderBottom: `1px solid ${cfg.border}`,
        transition: 'background 0.1s',
      }}
    >
      <span style={{ width: '10px', height: '10px', borderRadius: '9999px', background: cfg.dot, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: cfg.color, letterSpacing: '0.01em' }}>{status}</span>
      <span style={{
        fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px',
        borderRadius: '9999px', background: cfg.dot + '30', color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}>{count}</span>
      <span style={{ fontSize: '0.75rem', color: cfg.color + 'aa', flex: 1 }}>{descriptions[status]}</span>
      {collapsed ? <ChevronDown size={14} color={cfg.color} /> : <ChevronUp size={14} color={cfg.color} />}
    </div>
  );
}

// ─── Inline Editable Cell ──────────────────────────────────────────────────────

function EditableSelect<T extends string>({
  value, options, onChange, placeholder,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value as T)}
      onClick={e => e.stopPropagation()}
      style={{
        background: 'transparent', border: 'none', outline: 'none',
        fontSize: '0.8125rem', fontFamily: 'inherit', color: '#374151',
        cursor: 'pointer', width: '100%', padding: 0,
      }}
    >
      {placeholder && <option value="" disabled>{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function EditableText({
  value, onChange, placeholder,
}: { value: string | null; onChange: (v: string) => void; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <span
        onClick={e => { e.stopPropagation(); setLocal(value ?? ''); setEditing(true); }}
        style={{
          display: 'block', minWidth: '80px', cursor: 'text',
          color: value ? '#374151' : '#9ca3af', fontSize: '0.8125rem',
          borderRadius: '4px', padding: '1px 4px',
          transition: 'background 0.1s',
        }}
        title="Click to edit"
      >
        {value || placeholder || '—'}
      </span>
    );
  }

  return (
    <input
      ref={ref}
      type="text"
      value={local}
      onClick={e => e.stopPropagation()}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { onChange(local); setEditing(false); }}
      onKeyDown={e => { if (e.key === 'Enter') { onChange(local); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
      style={{
        border: '1px solid #6366f1', borderRadius: '6px', padding: '2px 6px',
        fontSize: '0.8125rem', outline: 'none', fontFamily: 'inherit',
        width: '100%', background: '#fff',
      }}
    />
  );
}

// ─── Table Row ─────────────────────────────────────────────────────────────────

function LeadRow({
  lead, onUpdate,
}: { lead: SalesLead; onUpdate: (id: string, updates: Partial<SalesLead>) => void }) {
  const isActive = lead.status === 'Active';

  function patch(updates: Partial<SalesLead>) {
    onUpdate(lead.id, updates);
    // Persist to API
    fetch(`/api/sales-leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(console.error);
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '2fr 1.5fr 1.3fr 90px 130px 90px 100px 1fr',
      gap: 0,
      padding: '0',
      borderBottom: '1px solid #f3f4f6',
      alignItems: 'stretch',
      minHeight: '44px',
      background: isActive ? '#fafffe' : '#ffffff',
      transition: 'background 0.1s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = isActive ? '#f0fdf9' : '#fafafa'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isActive ? '#fafffe' : '#ffffff'; }}
    >
      {/* Org Name */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {lead.is_enterprise && (
          <span style={{
            fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '0.06em', padding: '1px 5px', borderRadius: '4px',
            background: '#dbeafe', color: '#1d4ed8', flexShrink: 0,
          }}>ENT</span>
        )}
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{lead.org_name}</span>
      </div>

      {/* School */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{lead.school || '—'}</span>
      </div>

      {/* Contact */}
      <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center' }}>
        <EditableText
          value={lead.contact_name}
          onChange={v => patch({ contact_name: v || null })}
          placeholder="—"
        />
      </div>

      {/* Owner */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center' }}>
        <EditableSelect<LeadOwner>
          value={lead.owner}
          options={[
            { value: 'Owen', label: 'Owen' },
            { value: 'Ford', label: 'Ford' },
            { value: 'Adam', label: 'Adam' },
            { value: 'Team', label: 'Team' },
          ]}
          onChange={v => patch({ owner: v })}
        />
      </div>

      {/* Status */}
      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <select
            value={lead.status}
            onChange={e => patch({ status: e.target.value as LeadStatus })}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
              width: '100%', zIndex: 1,
            }}
          >
            <option value="Active">Active</option>
            <option value="Check In">Check In</option>
            <option value="Hold Off">Hold Off</option>
          </select>
          <StatusBadge status={lead.status} />
        </div>
      </div>

      {/* Pipeline Value */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center' }}>
        {isActive ? (
          <span style={{ fontSize: '0.8125rem', color: '#9ca3af', fontStyle: 'italic' }}>Closed</span>
        ) : (
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
            {fmt$(lead.pipeline_value)}
          </span>
        )}
      </div>

      {/* Last Contact */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{fmtDate(lead.last_contact)}</span>
      </div>

      {/* Next Step */}
      <div style={{ padding: '8px 16px 8px 12px', display: 'flex', alignItems: 'center' }}>
        <EditableText
          value={lead.next_step}
          onChange={v => patch({ next_step: v || null })}
          placeholder="Add next step…"
        />
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function SalesCRM() {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('All');
  const [collapsed, setCollapsed] = useState<Record<LeadStatus, boolean>>({
    'Active': false,
    'Check In': false,
    'Hold Off': true, // Default collapsed
  });

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/sales-leads');
      if (!res.ok) throw new Error('Failed');
      const data: SalesLead[] = await res.json();
      setLeads(data);
      return data;
    } catch (err) {
      console.error('[sales-crm] fetch error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads().then(async (data) => {
      // Auto-seed if empty
      if (data.length === 0) {
        setSeeding(true);
        try {
          // Batch insert seed data via a seed endpoint approach
          // We'll use POST on individual records
          const inserted: SalesLead[] = [];
          for (const seed of SEED_LEADS) {
            const res = await fetch('/api/sales-leads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(seed),
            });
            if (res.ok) {
              inserted.push(await res.json());
            }
          }
          if (inserted.length > 0) {
            setLeads(inserted);
          } else {
            // POST not implemented on the GET route — use local seed as fallback display
            // This gracefully handles the case where the DB table hasn't been migrated yet
            const fakeSeed: SalesLead[] = SEED_LEADS.map((s, i) => ({
              ...s,
              id: `seed-${i}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));
            setLeads(fakeSeed);
          }
        } catch (err) {
          console.error('[sales-crm] seed error:', err);
        } finally {
          setSeeding(false);
        }
      }
    });
  }, [fetchLeads]);

  function handleUpdate(id: string, updates: Partial<SalesLead>) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }

  function toggleSection(status: LeadStatus) {
    setCollapsed(prev => ({ ...prev, [status]: !prev[status] }));
  }

  const filtered = useMemo(() => {
    let list = leads;
    if (ownerFilter !== 'All') list = list.filter(l => l.owner === ownerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.org_name.toLowerCase().includes(q) ||
        (l.school ?? '').toLowerCase().includes(q) ||
        (l.contact_name ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [leads, ownerFilter, search]);

  const byStatus = useMemo(() => ({
    'Active':   filtered.filter(l => l.status === 'Active'),
    'Check In': filtered.filter(l => l.status === 'Check In'),
    'Hold Off': filtered.filter(l => l.status === 'Hold Off'),
  }), [filtered]);

  const totalPipeline = useMemo(() =>
    filtered
      .filter(l => l.status !== 'Active' && l.pipeline_value)
      .reduce((sum, l) => sum + (l.pipeline_value ?? 0), 0)
  , [filtered]);

  const TABLE_HEADERS = [
    { label: 'Organization', flex: '2fr' },
    { label: 'School',       flex: '1.5fr' },
    { label: 'Contact',      flex: '1.3fr' },
    { label: 'Owner',        flex: '90px' },
    { label: 'Status',       flex: '130px' },
    { label: 'Value',        flex: '90px' },
    { label: 'Last Contact', flex: '100px' },
    { label: 'Next Step',    flex: '1fr' },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '10px', color: '#9ca3af' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        Loading CRM…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {seeding && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '10px', padding: '10px 16px', fontSize: '0.875rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
          Loading seed data…
        </div>
      )}

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { label: 'Active Clients', value: leads.filter(l => l.status === 'Active').length, color: '#065f46', bg: '#d1fae5' },
          { label: 'Check In',       value: leads.filter(l => l.status === 'Check In').length, color: '#92400e', bg: '#fef3c7' },
          { label: 'Hold Off',       value: leads.filter(l => l.status === 'Hold Off').length, color: '#374151', bg: '#f3f4f6' },
          { label: 'Pipeline Value', value: fmt$(totalPipeline), color: '#1e40af', bg: '#dbeafe' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: stat.bg, border: `1px solid ${stat.color}30`,
            borderRadius: '12px', padding: '16px',
          }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: stat.color + 'aa', margin: '0 0 4px 0' }}>{stat.label}</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, color: stat.color, margin: 0, lineHeight: 1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          flex: 1, minWidth: '200px', maxWidth: '360px',
          background: '#ffffff', border: '1px solid #e5e7eb',
          borderRadius: '10px', padding: '8px 12px',
        }}>
          <Search size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search org, school, contact…"
            style={{ border: 'none', outline: 'none', fontSize: '0.875rem', fontFamily: 'inherit', flex: 1, color: '#374151' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>

        {/* Owner Filter */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['All', 'Owen', 'Ford', 'Adam', 'Team'].map(o => (
            <button
              key={o}
              onClick={() => setOwnerFilter(o)}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '0.8125rem',
                fontWeight: ownerFilter === o ? 700 : 500, cursor: 'pointer',
                border: `1px solid ${ownerFilter === o ? '#0F172A' : '#e5e7eb'}`,
                background: ownerFilter === o ? '#0F172A' : '#ffffff',
                color: ownerFilter === o ? '#ffffff' : '#374151',
                fontFamily: 'inherit', transition: 'all 0.1s',
              }}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* CRM Table */}
      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', overflow: 'hidden' }}>
        {/* Column Headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1.5fr 1.3fr 90px 130px 90px 100px 1fr',
          background: '#f9fafb', borderBottom: '2px solid #e5e7eb',
          padding: '0',
        }}>
          {TABLE_HEADERS.map(h => (
            <div key={h.label} style={{
              padding: '9px 16px', fontSize: '0.68rem', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af',
            }}>{h.label}</div>
          ))}
        </div>

        {/* Sections */}
        {(['Active', 'Check In', 'Hold Off'] as LeadStatus[]).map(status => {
          const rows = byStatus[status];
          return (
            <div key={status}>
              <SectionHeader
                status={status}
                count={rows.length}
                collapsed={collapsed[status]}
                onToggle={() => toggleSection(status)}
              />
              {!collapsed[status] && (
                <>
                  {rows.length === 0 ? (
                    <div style={{ padding: '20px 16px', color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center' }}>
                      No {status.toLowerCase()} leads
                      {(search || ownerFilter !== 'All') ? ' matching current filters' : ''}
                    </div>
                  ) : (
                    rows.map(lead => (
                      <LeadRow key={lead.id} lead={lead} onUpdate={handleUpdate} />
                    ))
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '0.875rem' }}>
          No leads match your current filters
        </div>
      )}
    </div>
  );
}
