'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, X, RefreshCw, Plus, ChevronRight, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { STAGE_CONFIG, type DealStage } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeadOwner = 'Owen' | 'Ford' | 'Adam' | 'Team' | 'Hyatt' | 'Drake' | 'Bryce';

type CategoryFilter = 'all' | 'greek' | 'country_clubs' | 'sports' | 'alumni_associations' | 'professional_associations';

export interface PipelineDealFull {
  id: string;
  org_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  deal_type: 'local' | 'council' | 'national';
  stage: DealStage;
  value: number;
  temperature: 'hot' | 'warm' | 'cold';
  next_followup: string | null;
  last_touched: string | null;
  followup_count: number;
  notes: string | null;
  conference: string | null;
  created_at: string;
  updated_at: string;
  // joined
  organization?: {
    id: string;
    name: string;
    school?: { id: string; name: string } | null;
    national_org?: { id: string; name: string } | null;
  } | null;
  contact?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  } | null;
  deal_contacts?: {
    id: string;
    contact_id: string;
    is_primary: boolean;
    contact?: { id: string; name: string; email?: string | null; role?: string | null } | null;
  }[];
}

interface DealNote {
  ts: string;
  text: string;
  author?: string;
}

// ─── Seed Data (legacy SalesCRM leads — used as fallback only) ─────────────────

type LeadStatus = 'Active' | 'Check In' | 'Hold Off';

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

// ─── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_STAGES: DealStage[] = [
  'lead',
  'demo_booked',
  'first_demo',
  'second_call',
  'timing',
  'contract_sent',
  'closed_won',
];

const STAGE_LABELS: Record<DealStage, string> = {
  lead:          'Lead',
  demo_booked:   'Demo Booked',
  first_demo:    'First Demo',
  second_call:   'Second Call',
  timing:        'Bad Timing',
  contract_sent: 'Contract Sent',
  closed_won:    'Closed Won',
  closed_lost:   'Closed Lost',
  hold_off:      'Hold Off',
};

const STAGE_COLORS: Record<DealStage, { color: string; bg: string; border: string }> = {
  lead:          { color: '#6b7280', bg: '#f3f4f6',  border: '#d1d5db' },
  demo_booked:   { color: '#1d4ed8', bg: '#eff6ff',  border: '#bfdbfe' },
  first_demo:    { color: '#7c3aed', bg: '#f5f3ff',  border: '#ddd6fe' },
  second_call:   { color: '#d97706', bg: '#fef3c7',  border: '#fcd34d' },
  timing:        { color: '#6d28d9', bg: '#f5f3ff',  border: '#c4b5fd' },
  contract_sent: { color: '#be185d', bg: '#fdf2f8',  border: '#fbcfe8' },
  closed_won:    { color: '#065f46', bg: '#d1fae5',  border: '#6ee7b7' },
  closed_lost:   { color: '#dc2626', bg: '#fee2e2',  border: '#fca5a5' },
  hold_off:      { color: '#9ca3af', bg: '#f9fafb',  border: '#e5e7eb' },
};

const REP_COLORS: Record<string, string> = {
  Owen:  '#7c3aed',
  Ford:  '#0369a1',
  Adam:  '#b45309',
  Hyatt: '#065f46',
  Worth: '#0891b2',
  Team:  '#374151',
  Drake: '#0ea5e9',
  Bryce: '#8b5cf6',
};

const ORG_TYPES = [
  { value: 'fraternity',            label: 'Fraternity' },
  { value: 'sorority',              label: 'Sorority' },
  { value: 'council',               label: 'IFC / Council' },
  { value: 'national',              label: 'National' },
  { value: 'sports',                label: 'Sports / Club' },
  { value: 'country_club',          label: '⛳ Country Club' },
  { value: 'professional_association', label: '🏢 Professional / Chamber' },
  { value: 'other',                 label: 'Other' },
];

const CATEGORY_BADGE: Record<string, { label: string; color: string }> = {
  country_clubs:             { label: '⛳ Country Club',   color: '#16a34a' },
  professional_associations: { label: '🏢 Professional',    color: '#2563eb' },
  sports:                    { label: '⚽ Sports',          color: '#ea580c' },
  alumni_associations:       { label: '🎓 Alumni Assoc.', color: '#7c3aed' },
};

const REP_OPTIONS = ['Owen', 'Ford', 'Adam', 'Hyatt', 'Worth', 'Drake', 'Bryce'];

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: 'all',                       label: 'All' },
  { value: 'greek',                     label: 'Greek Life' },
  { value: 'country_clubs',             label: 'Country Clubs' },
  { value: 'sports',                    label: 'Sports Teams' },
  { value: 'alumni_associations',       label: 'Alumni Associations' },
  { value: 'professional_associations', label: 'Professional Assoc.' },
];

// Map known auth UUIDs → display names
const UUID_TO_REP: Record<string, string> = {
  '33ab5810-4d9f-485e-babb-a99b650a09e1': 'Owen',
  '3853cd9d-0773-4d04-b23f-20eb51717e0f': 'Ford',
  '66952c26-316d-4e9c-8fe1-4dd5743926ef': 'Adam',
  '904e6a81-8046-44a5-9710-db893be0a094': 'Hyatt',
  '6622b57d-1a17-49ae-b492-85906612954f': 'Ally',
  'b51b7314-fbdc-496f-ae08-3af8aff29a39': 'Devin',
  'eadecbba-91da-41da-adc5-9a5b1cb82d4c': 'Parker',
  '5a848006-7f96-4c86-aa8d-3032ac0636ef': 'Riley',
  '6b7763bb-9bc7-46fb-b677-3e39d0a5d927': 'Worth',
  'eef2dbc3-6460-4a81-a214-f294d1cc6dd7': 'Bryce',
  '3581905c-804c-4445-b5f6-038f46186edd': 'Drake',
  'af913838-31d9-40d4-953b-8203a8dda173': 'Luke',
  'd13d8438-d878-4abc-afe1-5b1a14974449': 'Michael',
};

function isUUID(s: string | null | undefined): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function resolveRep(rep: string | null | undefined, empList: { id: string; name: string }[] = []): string | null {
  if (!rep) return null;
  if (isUUID(rep)) {
    const match = empList.find(e => e.id.toLowerCase() === rep.toLowerCase());
    const fullName = match?.name ?? UUID_TO_REP[rep.toLowerCase()] ?? null;
    // Return first name only so it matches REP_COLORS keys
    return fullName ? fullName.split(' ')[0] : null;
  }
  return rep;
}

const SLIPPING_STAGES: DealStage[] = ['first_demo', 'second_call', 'contract_sent'];

// ─── Mobile Detection ────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768); }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ─── Create Deal Drawer ────────────────────────────────────────────────────────

interface CreateDealDrawerProps {
  onClose: () => void;
  onCreated: () => void;
  employees?: { id: string; name: string }[];
}

function CreateDealDrawer({ onClose, onCreated, employees = [] }: CreateDealDrawerProps) {
  const isMobile = useIsMobile();
  const salesReps = employees.filter(e =>
    ['founder', 'cofounder', 'growth_intern', 'sales_intern'].includes((e as any).role ?? '')
  ).concat(employees.filter(e => !['founder', 'cofounder', 'growth_intern', 'sales_intern'].includes((e as any).role ?? '') && employees.length <= 15));
  // Fallback: if role filtering returns nothing (role not on object), show all employees
  const repList = salesReps.length > 0 ? salesReps : employees;

  const [orgName, setOrgName]           = useState('');
  const [schoolName, setSchoolName]     = useState('');
  const [orgType, setOrgType]           = useState('fraternity');
  const [stage, setStage]               = useState<DealStage>('lead');
  const [temperature, setTemperature]   = useState<'hot' | 'warm' | 'cold'>('warm');
  const [value, setValue]               = useState('3588');
  const [assignedTo, setAssignedTo]     = useState('');  // stores employee UUID
  const [contactName, setContactName]   = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [creating, setCreating]         = useState(false);
  const [error, setError]               = useState<string | null>(null);

  async function handleCreate() {
    if (!orgName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const row = {
        org_name:      orgName.trim(),
        org_type:      orgType,
        school_name:   schoolName.trim() || undefined,
        stage,
        temperature,
        value:         value || '3588',
        assigned_to:   assignedTo,
        contact_name:  contactName.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        contact_phone: contactPhone.trim() || undefined,
      };
      const res = await fetch('/api/pipeline/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [row], skipDuplicates: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      const result = data.results?.[0];
      if (result?.status === 'error') throw new Error(result.reason || 'Create failed');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deal');
    } finally {
      setCreating(false);
    }
  }

  const TEMP_CFG = {
    hot:  { label: '🔥 Hot',   bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
    warm: { label: '🌡 Warm',  bg: '#fef3c7', color: '#d97706', border: '#fcd34d' },
    cold: { label: '🧊 Cold',  bg: '#e0f2fe', color: '#0284c7', border: '#7dd3fc' },
  } as const;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'flex-end' : 'stretch',
    }}>
      <div
        style={{ flex: 1, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div style={isMobile ? {
        width: '100%', maxHeight: '92vh', background: '#fff', display: 'flex',
        flexDirection: 'column', borderRadius: '20px 20px 0 0',
        overflow: 'hidden', borderTop: '1px solid #e5e7eb',
      } : {
        width: 460, background: '#fff', display: 'flex', flexDirection: 'column',
        height: '100%', borderLeft: '1px solid #e5e7eb', overflow: 'hidden',
      }}>
        {/* Drag handle (mobile only) */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d1d5db' }} />
          </div>
        )}
        {/* Header */}
        <div style={{ padding: isMobile ? '12px 20px 12px' : '20px 24px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', margin: 0 }}>New Deal</h2>
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '2px 0 0 0' }}>Manually add a deal to the pipeline</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 20px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Org name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>
              Chapter / Org Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
              placeholder="e.g. Sigma Chi, IFC, Theta Xi Nationals"
              autoFocus
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* School */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>
              School
            </label>
            <input
              type="text" value={schoolName} onChange={e => setSchoolName(e.target.value)}
              placeholder="e.g. University of Alabama, TCU"
              style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* Org type */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ORG_TYPES.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setOrgType(opt.value)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: '0.8rem', fontFamily: 'inherit',
                    cursor: 'pointer', fontWeight: orgType === opt.value ? 700 : 400,
                    border: `1px solid ${orgType === opt.value ? '#0F172A' : '#e5e7eb'}`,
                    background: orgType === opt.value ? '#0F172A' : '#fff',
                    color: orgType === opt.value ? '#fff' : '#374151',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stage */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>Stage</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PIPELINE_STAGES.map(s => {
                const cfg = STAGE_COLORS[s];
                const isActive = stage === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStage(s)}
                    style={{
                      padding: '5px 12px', borderRadius: 8, fontSize: '0.8rem', fontFamily: 'inherit',
                      cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                      border: `1px solid ${isActive ? cfg.border : '#e5e7eb'}`,
                      background: isActive ? cfg.bg : '#fff',
                      color: isActive ? cfg.color : '#9ca3af',
                    }}
                  >
                    {STAGE_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Temperature + Value */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>Temp</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['hot', 'warm', 'cold'] as const).map(t => {
                  const cfg = TEMP_CFG[t];
                  const isActive = temperature === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setTemperature(t)}
                      style={{
                        flex: 1, padding: '5px 6px', borderRadius: 8, fontSize: '0.78rem',
                        fontFamily: 'inherit', cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                        border: `1px solid ${isActive ? cfg.border : '#e5e7eb'}`,
                        background: isActive ? cfg.bg : '#fff',
                        color: isActive ? cfg.color : '#9ca3af',
                      }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ width: 110 }}>
              <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>Value ($)</label>
              <input
                type="number" value={value} onChange={e => setValue(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Assigned to */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>Assigned To</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {repList.map(emp => {
                const firstName = emp.name.split(' ')[0];
                const color = REP_COLORS[firstName] ?? '#6b7280';
                const isActive = assignedTo === emp.id;
                return (
                  <button
                    key={emp.id}
                    onClick={() => setAssignedTo(emp.id)}
                    style={{
                      padding: '5px 14px', borderRadius: 8, fontSize: '0.8rem',
                      fontFamily: 'inherit', cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                      border: `1px solid ${isActive ? color : '#e5e7eb'}`,
                      background: isActive ? color : '#fff',
                      color: isActive ? '#fff' : '#374151',
                    }}
                  >
                    {firstName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contact (optional) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6b7280', marginBottom: 6 }}>
              Contact <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text" value={contactName} onChange={e => setContactName(e.target.value)}
                placeholder="Contact name"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <input
                type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                placeholder="Email address"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <input
                type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                placeholder="Phone number"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? '12px 20px 28px' : '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!orgName.trim() || creating}
            style={{
              flex: 2, padding: '10px', borderRadius: 10, border: 'none',
              background: orgName.trim() && !creating ? '#0F172A' : '#e5e7eb',
              color: orgName.trim() && !creating ? '#fff' : '#9ca3af',
              fontSize: '0.875rem', fontWeight: 700,
              cursor: orgName.trim() && !creating ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {creating
              ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</>
              : <><Plus size={14} /> Create Deal</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const days = daysSince(dateStr);
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function activityColor(dateStr: string | null | undefined): string {
  const days = daysSince(dateStr);
  if (days === null) return '#dc2626';
  if (days < 3) return '#059669';
  if (days <= 7) return '#d97706';
  return '#dc2626';
}

function parseDealNotes(notesJson: string | null | undefined): DealNote[] {
  if (!notesJson) return [];
  try {
    const parsed = JSON.parse(notesJson);
    if (Array.isArray(parsed)) return parsed as DealNote[];
  } catch { /* ignore */ }
  // If it's plain text, wrap it as a single note
  if (typeof notesJson === 'string' && notesJson.trim()) {
    return [{ ts: '', text: notesJson, author: '' }];
  }
  return [];
}

function serializeDealNotes(notes: DealNote[]): string {
  return JSON.stringify(notes);
}

// ─── Rep Badge ─────────────────────────────────────────────────────────────────

function RepBadge({ rep: repRaw, employees = [] }: { rep: string | null | undefined; employees?: { id: string; name: string }[] }) {
  const rep = resolveRep(repRaw, employees);
  if (!rep) return <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>;
  const color = REP_COLORS[rep] ?? '#6b7280';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px 2px 3px', borderRadius: '9999px',
      background: color, color: '#fff', fontSize: '0.7rem', fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: '16px', height: '16px', borderRadius: '9999px',
        background: 'rgba(255,255,255,0.25)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800,
      }}>
        {rep[0]}
      </span>
      {rep}
    </span>
  );
}

// ─── Stage Badge ───────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: DealStage }) {
  const cfg = STAGE_COLORS[stage];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: '9999px', fontSize: '0.7rem',
      fontWeight: 600, color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap',
    }}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

// ─── Stage Stepper ─────────────────────────────────────────────────────────────

function StageStepper({ currentStage, onAdvance }: { currentStage: DealStage; onAdvance: (stage: DealStage) => void }) {
  const currentIdx = PIPELINE_STAGES.indexOf(currentStage);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
      {PIPELINE_STAGES.map((stage, idx) => {
        const isActive = stage === currentStage;
        const isPast = idx < currentIdx;
        const cfg = STAGE_COLORS[stage];
        return (
          <React.Fragment key={stage}>
            <button
              onClick={() => onAdvance(stage)}
              style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600,
                border: `1px solid ${isActive ? cfg.border : '#e5e7eb'}`,
                background: isActive ? cfg.bg : isPast ? '#f0fdf4' : '#f9fafb',
                color: isActive ? cfg.color : isPast ? '#059669' : '#9ca3af',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
                textDecoration: isPast ? 'line-through' : 'none',
              }}
              title={`Move to ${STAGE_LABELS[stage]}`}
            >
              {STAGE_LABELS[stage]}
            </button>
            {idx < PIPELINE_STAGES.length - 1 && (
              <ChevronRight size={12} color="#d1d5db" style={{ flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Deal Detail Drawer ────────────────────────────────────────────────────────

interface GranolaNote {
  id: string;
  title: string;
  created_at: string;
  summary?: string;
  transcript?: string;
}

interface DealDrawerProps {
  deal: PipelineDealFull;
  granolaNotesCache: GranolaNote[] | null;
  onClose: () => void;
  onAdvanceStage: (dealId: string, stage: DealStage) => void;
  onLogActivity: (dealId: string, text: string) => void;
  onPatch?: (dealId: string, patch: Partial<PipelineDealFull>) => void;
  employees?: { id: string; name: string }[];
}

function DealDetailDrawer({ deal, granolaNotesCache, onClose, onAdvanceStage, onLogActivity, onPatch, employees = [] }: DealDrawerProps) {
  const isMobile = useIsMobile();
  const [activityInput, setActivityInput] = useState('');
  const orgName = deal.organization?.name ?? 'Unknown Org';
  const schoolName = deal.organization?.school?.name ?? '';

  // Editable field state
  const [editTemp, setEditTemp] = useState<'hot' | 'warm' | 'cold'>(deal.temperature ?? 'warm');
  const [editValue, setEditValue] = useState<string>(String(deal.value ?? ''));
  // Store UUID in editRep for saving; display uses resolveRep
  const [editRep, setEditRep] = useState<string>(deal.assigned_to ?? '');
  const [editFollowup, setEditFollowup] = useState<string>(deal.next_followup ?? '');
  const [editContactName, setEditContactName] = useState<string>(deal.contact?.name ?? '');
  const [editContactEmail, setEditContactEmail] = useState<string>(deal.contact?.email ?? '');
  const [editContactPhone, setEditContactPhone] = useState<string>(deal.contact?.phone ?? '');

  // Parse existing notes/activity log
  const activityLog = useMemo(() => parseDealNotes(deal.notes), [deal.notes]);

  // Fuzzy match Granola notes
  const matchedNotes = useMemo(() => {
    if (!granolaNotesCache) return null;
    const orgLower = orgName.toLowerCase();
    const schoolLower = schoolName.toLowerCase();
    return granolaNotesCache.filter(note => {
      const titleLower = (note.title ?? '').toLowerCase();
      return (
        (orgLower && titleLower.includes(orgLower)) ||
        (schoolLower && titleLower.includes(schoolLower))
      );
    });
  }, [granolaNotesCache, orgName, schoolName]);

  function handleLogActivity() {
    const text = activityInput.trim();
    if (!text) return;
    onLogActivity(deal.id, text);
    setActivityInput('');
  }

  async function handleSaveChanges() {
    // Build deal-level patch (non-contact fields)
    const patch: Record<string, unknown> = {};
    if (editTemp !== deal.temperature) patch.temperature = editTemp;
    const numVal = parseFloat(editValue);
    if (!isNaN(numVal) && numVal !== deal.value) patch.value = numVal;
    if (editRep !== (deal.assigned_to ?? '')) patch.assigned_to = editRep || null;
    if (editFollowup !== (deal.next_followup ?? '')) patch.next_followup = editFollowup || null;

    // Build contact flat-field patch (these live on the deal row too)
    if (editContactName !== (deal.contact?.name ?? '')) patch.contact_name = editContactName || null;
    if (editContactEmail !== (deal.contact?.email ?? '')) patch.contact_email = editContactEmail || null;
    if (editContactPhone !== (deal.contact?.phone ?? '')) patch.contact_phone = editContactPhone || null;

    // Single patch call for the deal (covers both deal fields and contact flat fields)
    if (Object.keys(patch).length > 0) {
      onPatch?.(deal.id, patch as Partial<PipelineDealFull>);
    }

    // Also update the contacts table if a contact record is linked
    if (deal.contact?.id) {
      const contactPatch: Record<string, string | null> = {};
      if (editContactName !== (deal.contact?.name ?? '')) contactPatch.name = editContactName || null;
      if (editContactEmail !== (deal.contact?.email ?? '')) contactPatch.email = editContactEmail || null;
      if (editContactPhone !== (deal.contact?.phone ?? '')) contactPatch.phone = editContactPhone || null;
      if (Object.keys(contactPatch).length > 0) {
        await fetch(`/api/pipeline/contacts/${deal.contact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contactPatch),
        });
      }
    }
    onClose();
  }

  function handleClosedLost() {
    onAdvanceStage(deal.id, 'closed_lost');
    onClose();
  }

  function handleHoldOff() {
    onAdvanceStage(deal.id, 'hold_off');
    onClose();
  }

  const TEMP_CFG = {
    hot:  { label: '🔥 Hot',   bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
    warm: { label: '🌡 Warm',  bg: '#fef3c7', color: '#d97706', border: '#fcd34d' },
    cold: { label: '🧊 Cold',  bg: '#e0f2fe', color: '#0284c7', border: '#7dd3fc' },
  } as const;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'flex-end' : 'stretch',
    }}>
      <div
        style={{ flex: 1, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div style={isMobile ? {
        width: '100%', height: '94vh', background: '#ffffff', display: 'flex',
        flexDirection: 'column', borderRadius: '20px 20px 0 0',
        overflow: 'hidden', borderTop: '1px solid #e5e7eb',
      } : {
        width: 480, background: '#ffffff', display: 'flex', flexDirection: 'column',
        height: '100%', borderLeft: '1px solid #e5e7eb', overflow: 'hidden',
      }}>
        {/* Drag handle (mobile only) */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', background: '#f9fafb' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d1d5db' }} />
          </div>
        )}
        {/* Header */}
        <div style={{ padding: isMobile ? '12px 20px 12px' : '20px 24px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{orgName}</span>
                <StageBadge stage={deal.stage} />
              </div>
              {schoolName && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{schoolName}</div>}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, flexShrink: 0 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 20px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Stage Stepper */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
              Stage Progression
            </div>
            <StageStepper currentStage={deal.stage} onAdvance={(stage) => onAdvanceStage(deal.id, stage)} />
          </div>

          {/* Temperature */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>Temperature</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['hot', 'warm', 'cold'] as const).map(t => {
                const cfg = TEMP_CFG[t];
                const isActive = editTemp === t;
                return (
                  <button
                    key={t}
                    onClick={() => setEditTemp(t)}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: '0.8rem',
                      fontFamily: 'inherit', cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                      border: `1px solid ${isActive ? cfg.border : '#e5e7eb'}`,
                      background: isActive ? cfg.bg : '#fff',
                      color: isActive ? cfg.color : '#9ca3af',
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Value + Follow-up */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>Value ($)</div>
              <input
                type="number"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>Next Follow-up</div>
              <input
                type="date"
                value={editFollowup}
                onChange={e => setEditFollowup(e.target.value)}
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>Assigned To</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {employees.map(emp => {
                const firstName = emp.name.split(' ')[0];
                const color = REP_COLORS[firstName] ?? '#6b7280';
                const isActive = editRep === emp.id;
                return (
                  <button
                    key={emp.id}
                    onClick={() => setEditRep(emp.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 8, fontSize: '0.78rem',
                      fontFamily: 'inherit', cursor: 'pointer', fontWeight: isActive ? 700 : 400,
                      border: `1px solid ${isActive ? color : '#e5e7eb'}`,
                      background: isActive ? color : '#fff',
                      color: isActive ? '#fff' : '#374151',
                    }}
                  >
                    {firstName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>Primary Contact</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                value={editContactName}
                onChange={e => setEditContactName(e.target.value)}
                placeholder="Contact name"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <input
                type="email"
                value={editContactEmail}
                onChange={e => setEditContactEmail(e.target.value)}
                placeholder="Email address"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <input
                type="tel"
                value={editContactPhone}
                onChange={e => setEditContactPhone(e.target.value)}
                placeholder="Phone number"
                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* Additional Contacts */}
          {(() => {
            const extras = (deal as any).deal_contacts?.filter((dc: any) => !dc.is_primary) ?? [];
            return (
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>
                  Additional Contacts
                </div>
                {extras.length === 0 && (
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic', marginBottom: 8 }}>No additional contacts</div>
                )}
                {extras.map((dc: any) => (
                  <div key={dc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f9fafb', borderRadius: 8, marginBottom: 6, fontSize: '0.8rem' }}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{dc.contact?.name ?? 'Unknown'}</span>
                      {dc.contact?.role && <span style={{ color: '#6b7280', marginLeft: 6 }}>{dc.contact.role}</span>}
                      {dc.contact?.email && <div style={{ color: '#6b7280', fontSize: '0.72rem' }}>{dc.contact.email}</div>}
                    </div>
                    <button
                      onClick={async () => {
                        await fetch(`/api/pipeline/deals/${deal.id}/contacts`, {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ contact_id: dc.contact_id }),
                        });
                        onClose();
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.75rem', padding: '2px 6px' }}
                    >✕</button>
                  </div>
                ))}
                <AddContactRow dealId={deal.id} onAdded={onClose} />
              </div>
            );
          })()}

          {/* Granola Notes */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
              Meeting Notes (Granola)
            </div>
            {matchedNotes === null ? (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>Loading notes…</div>
            ) : matchedNotes.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>
                No meeting notes found — notes auto-match from Granola by org/school name.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {matchedNotes.map(note => (
                  <div key={note.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#111827', marginBottom: 4 }}>{note.title}</div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: 6 }}>
                      {note.created_at ? new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </div>
                    {(note.summary || note.transcript) && (
                      <div style={{ fontSize: '0.78rem', color: '#374151', lineHeight: 1.5 }}>
                        {(note.summary || note.transcript || '').slice(0, 300)}
                        {((note.summary || note.transcript || '').length > 300) ? '…' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
              Activity Log
            </div>
            {activityLog.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>No activity logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activityLog.map((note, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '9999px', background: '#d1d5db', flexShrink: 0, marginTop: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.4 }}>{note.text}</div>
                      {note.ts && (
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>
                          {new Date(note.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Log Activity Input */}
        <div style={{ padding: isMobile ? '12px 20px 0' : '12px 24px 0', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>
            Log Activity
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={activityInput}
              onChange={e => setActivityInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLogActivity(); }}
              placeholder="Add a note or follow-up…"
              style={{
                flex: 1, border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px',
                fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#374151',
              }}
            />
            <button
              onClick={handleLogActivity}
              disabled={!activityInput.trim()}
              style={{
                padding: '8px 16px', borderRadius: 10, border: 'none',
                background: activityInput.trim() ? '#0F172A' : '#e5e7eb',
                color: activityInput.trim() ? '#fff' : '#9ca3af',
                fontSize: '0.8rem', fontWeight: 700, cursor: activityInput.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'all 0.1s', whiteSpace: 'nowrap',
              }}
            >
              Log
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ padding: isMobile ? '12px 20px 28px' : '12px 24px 16px', background: '#f9fafb', display: 'flex', gap: 8 }}>
          <button
            onClick={handleClosedLost}
            style={{
              flex: 1, padding: '9px 8px', borderRadius: 10, border: 'none',
              background: '#fee2e2', color: '#dc2626',
              fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Closed Lost
          </button>
          <button
            onClick={handleHoldOff}
            style={{
              flex: 1, padding: '9px 8px', borderRadius: 10, border: '1px solid #e5e7eb',
              background: '#f9fafb', color: '#6b7280',
              fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Hold Off
          </button>
          <button
            onClick={handleSaveChanges}
            style={{
              flex: 2, padding: '9px 8px', borderRadius: 10, border: 'none',
              background: '#0F172A', color: '#fff',
              fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Deal Card ─────────────────────────────────────────────────────────────────

interface DealCardProps {
  deal: PipelineDealFull;
  onClick: () => void;
  employees?: { id: string; name: string }[];
}

function AddContactRow({ dealId, onAdded }: { dealId: string; onAdded: () => void }) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const [phone, setPhone] = React.useState('');

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      // Create contact first
      const cRes = await fetch('/api/pipeline/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, role: role.trim() || null }),
      });
      if (!cRes.ok) return;
      const contact = await cRes.json();
      // Link to deal
      await fetch(`/api/pipeline/deals/${dealId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contact.id, is_primary: false }),
      });
      setName(''); setEmail(''); setPhone(''); setRole('');
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', fontSize: '0.8rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f3f4f6' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#6b7280' }}>Add contact</div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name *" style={inputStyle} />
      <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role (e.g. Treasurer)" style={inputStyle} />
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" style={inputStyle} />
      <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone number" style={inputStyle} />
      <button
        onClick={handleAdd}
        disabled={saving || !name.trim()}
        style={{ padding: '7px 12px', borderRadius: 8, background: name.trim() ? '#0F172A' : '#e5e7eb', color: name.trim() ? '#fff' : '#9ca3af', border: 'none', cursor: name.trim() ? 'pointer' : 'not-allowed', fontSize: '0.8rem', fontWeight: 600 }}
      >{saving ? 'Adding…' : '+ Add Contact'}</button>
    </div>
  );
}

function DealCard({ deal, onClick, employees = [] }: DealCardProps) {
  const orgName = deal.organization?.name ?? 'Unknown';
  const schoolName = deal.organization?.school?.name ?? null;
  const contactName = deal.contact?.name ?? null;
  const rep = deal.assigned_to;
  const lastActivity = deal.last_touched ?? deal.updated_at;
  const days = daysSince(lastActivity);
  const actColor = activityColor(lastActivity);

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
        padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow 0.12s, border-color 0.12s',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
        (e.currentTarget as HTMLDivElement).style.borderColor = '#d1d5db';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb';
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', lineHeight: 1.3 }}>{orgName}</div>
        {schoolName && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 1 }}>{schoolName}</div>}
        {contactName && <div style={{ fontSize: '0.75rem', color: '#374151', marginTop: 2 }}>{contactName}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <RepBadge rep={rep} employees={employees} />
        {deal.value > 0 && (
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#1d4ed8' }}>{fmt$(deal.value)}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.7rem', color: actColor, fontWeight: 600 }}>
          {days === null ? 'No activity' : days === 0 ? 'Today' : `${days}d ago`}
        </span>
        {(() => {
          const cat = (deal as any).category;
          const badge = cat && CATEGORY_BADGE[cat];
          if (!badge) return null;
          return (
            <span style={{
              fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 8,
              background: badge.color + '18', color: badge.color,
              border: `1px solid ${badge.color}40`,
            }}>{badge.label}</span>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Needs Attention Section ────────────────────────────────────────────────────

interface NeedsAttentionProps {
  deals: PipelineDealFull[];
  onOpenDeal: (deal: PipelineDealFull) => void;
  onLogFollowup: (dealId: string, text: string) => void;
  employees?: { id: string; name: string }[];
}

function NeedsAttentionSection({ deals, onOpenDeal, onLogFollowup, employees = [] }: NeedsAttentionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const slipping = useMemo(() => {
    return deals.filter(d => {
      if (!SLIPPING_STAGES.includes(d.stage)) return false;
      const lastActivity = d.last_touched ?? d.updated_at;
      const days = daysSince(lastActivity);
      return days === null || days >= 3;
    }).sort((a, b) => {
      const daysA = daysSince(a.last_touched ?? a.updated_at) ?? 999;
      const daysB = daysSince(b.last_touched ?? b.updated_at) ?? 999;
      return daysB - daysA;
    });
  }, [deals]);

  if (slipping.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#f0fdf4', border: '1px solid #6ee7b7', borderRadius: 12,
        padding: '12px 18px',
      }}>
        <CheckCircle2 size={16} color="#059669" />
        <span style={{ fontSize: '0.875rem', color: '#065f46', fontWeight: 600 }}>All deals on track ✓</span>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 18px', background: '#fff7ed', borderBottom: '1px solid #fed7aa',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <AlertCircle size={16} color="#ea580c" />
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#9a3412' }}>
          {slipping.length} deal{slipping.length !== 1 ? 's' : ''} need{slipping.length === 1 ? 's' : ''} attention
        </span>
        <span style={{ fontSize: '0.75rem', color: '#c2410c' }}>No follow-up in 3+ days at key stages</span>
      </div>
      <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slipping.map(deal => {
          const orgName = deal.organization?.name ?? 'Unknown';
          const schoolName = deal.organization?.school?.name ?? '';
          const lastActivity = deal.last_touched ?? deal.updated_at;
          const days = daysSince(lastActivity);
          const isRed = days === null || days > 7;
          const isOpen = expandedId === deal.id;

          return (
            <div key={deal.id} style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', cursor: 'pointer' }}
                      onClick={() => onOpenDeal(deal)}
                    >
                      {orgName}
                    </span>
                    {schoolName && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{schoolName}</span>}
                    <StageBadge stage={deal.stage} />
                    <RepBadge rep={deal.assigned_to} employees={employees} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{
                    fontSize: '1rem', fontWeight: 800,
                    color: isRed ? '#dc2626' : '#d97706',
                  }}>
                    {days === null ? '∞' : days}d
                  </span>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : deal.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 8, border: '1px solid #fed7aa',
                      background: '#fff7ed', color: '#9a3412', fontSize: '0.75rem', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >
                    Log Follow-up
                  </button>
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="What happened or what's next…"
                    value={inputs[deal.id] ?? ''}
                    onChange={e => setInputs(prev => ({ ...prev, [deal.id]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const text = (inputs[deal.id] ?? '').trim();
                        if (text) {
                          onLogFollowup(deal.id, text);
                          setInputs(prev => ({ ...prev, [deal.id]: '' }));
                          setExpandedId(null);
                        }
                      }
                    }}
                    style={{
                      flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px',
                      fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#374151',
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const text = (inputs[deal.id] ?? '').trim();
                      if (text) {
                        onLogFollowup(deal.id, text);
                        setInputs(prev => ({ ...prev, [deal.id]: '' }));
                        setExpandedId(null);
                      }
                    }}
                    disabled={!(inputs[deal.id] ?? '').trim()}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none',
                      background: (inputs[deal.id] ?? '').trim() ? '#9a3412' : '#e5e7eb',
                      color: '#fff', fontSize: '0.8rem', fontWeight: 700,
                      cursor: (inputs[deal.id] ?? '').trim() ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                    }}
                  >
                    Log
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pipeline Kanban ───────────────────────────────────────────────────────────

interface PipelineKanbanProps {
  deals: PipelineDealFull[];
  archivedDeals: PipelineDealFull[];
  onOpenDeal: (deal: PipelineDealFull) => void;
  employees?: { id: string; name: string }[];
}

// ─── Mobile Pipeline View ────────────────────────────────────────────────────────────

function MobilePipelineView({ deals, archivedDeals, onOpenDeal, employees = [] }: PipelineKanbanProps) {
  const [activeStage, setActiveStage] = useState<DealStage | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);

  const countByStage = useMemo(() => {
    const map: Record<string, number> = { all: deals.length };
    for (const s of PIPELINE_STAGES) map[s] = deals.filter(d => d.stage === s).length;
    return map;
  }, [deals]);

  const filteredDeals = useMemo(() =>
    activeStage === 'all' ? deals : deals.filter(d => d.stage === activeStage),
    [deals, activeStage]
  );

  const activeStageColor = activeStage !== 'all' ? STAGE_COLORS[activeStage as DealStage] : null;

  return (
    <div>
      {/* Stage tabs - horizontal scroll */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 4 }}>
        <button
          onClick={() => setActiveStage('all')}
          style={{
            padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem',
            fontWeight: activeStage === 'all' ? 700 : 500, cursor: 'pointer',
            border: `1px solid ${activeStage === 'all' ? '#0F172A' : '#e5e7eb'}`,
            background: activeStage === 'all' ? '#0F172A' : '#fff',
            color: activeStage === 'all' ? '#fff' : '#374151',
            whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
          }}
        >All ({countByStage.all})</button>
        {PIPELINE_STAGES.map(stage => {
          const cfg = STAGE_COLORS[stage];
          const isActive = activeStage === stage;
          return (
            <button
              key={stage}
              onClick={() => setActiveStage(stage)}
              style={{
                padding: '6px 12px', borderRadius: 20, fontSize: '0.8rem',
                fontWeight: isActive ? 700 : 500, cursor: 'pointer',
                border: `1px solid ${isActive ? cfg.border : '#e5e7eb'}`,
                background: isActive ? cfg.bg : '#fff',
                color: isActive ? cfg.color : '#6b7280',
                whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
              }}
            >
              {STAGE_LABELS[stage]}
              {countByStage[stage] > 0 && (
                <span style={{
                  marginLeft: 5, background: isActive ? cfg.color : '#e5e7eb',
                  color: isActive ? '#fff' : '#6b7280',
                  borderRadius: '9999px', padding: '0 5px', fontSize: '0.7rem', fontWeight: 700,
                }}>{countByStage[stage]}</span>
              )}
            </button>
          );
        })}
      </div>

      {activeStageColor && (
        <div style={{
          padding: '8px 14px', borderRadius: 10, marginBottom: 10,
          background: activeStageColor.bg, border: `1px solid ${activeStageColor.border}`,
          fontSize: '0.8rem', fontWeight: 700, color: activeStageColor.color,
        }}>
          {STAGE_LABELS[activeStage as DealStage]} — {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}
        </div>
      )}

      {filteredDeals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af', fontSize: '0.875rem' }}>No deals in this stage</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredDeals.map(deal => (
            <DealCard key={deal.id} deal={deal} onClick={() => onOpenDeal(deal)} employees={employees} />
          ))}
        </div>
      )}

      {archivedDeals.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowArchived(s => !s)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit', padding: '6px 0' }}
          >
            <ChevronDown size={14} style={{ transform: showArchived ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} />
            Archived / Closed Lost ({archivedDeals.length})
          </button>
          {showArchived && (
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, marginTop: 8, overflow: 'hidden' }}>
              {archivedDeals.map((deal, i) => (
                <div
                  key={deal.id} onClick={() => onOpenDeal(deal)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < archivedDeals.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: 'pointer', background: '#fff' }}
                >
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.8rem', color: '#374151', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {deal.organization?.name ?? 'Unknown'}
                  </span>
                  <StageBadge stage={deal.stage} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PipelineKanban({ deals, archivedDeals, onOpenDeal, employees = [] }: PipelineKanbanProps) {
  const isMobile = useIsMobile();
  const [showArchived, setShowArchived] = useState(false);

  if (isMobile) {
    return <MobilePipelineView deals={deals} archivedDeals={archivedDeals} onOpenDeal={onOpenDeal} employees={employees} />;
  }

  const byStage = useMemo(() => {
    const map: Record<DealStage, PipelineDealFull[]> = {
      lead: [], demo_booked: [], first_demo: [], second_call: [],
      timing: [], contract_sent: [], closed_won: [], closed_lost: [], hold_off: [],
    };
    for (const deal of deals) {
      if (map[deal.stage]) map[deal.stage].push(deal);
    }
    return map;
  }, [deals]);

  return (
    <div>
      {/* Horizontal columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, minmax(180px, 1fr))`,
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 8,
      }}>
        {PIPELINE_STAGES.map(stage => {
          const stageCfg = STAGE_COLORS[stage];
          const stageDeals = byStage[stage];
          return (
            <div key={stage} style={{ minWidth: 0 }}>
              {/* Column header */}
              <div style={{
                padding: '8px 12px', borderRadius: '10px 10px 0 0',
                background: stageCfg.bg, border: `1px solid ${stageCfg.border}`,
                borderBottom: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: stageCfg.color }}>{STAGE_LABELS[stage]}</span>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: '9999px',
                  background: stageCfg.color + '22', color: stageCfg.color,
                }}>
                  {stageDeals.length}
                </span>
              </div>
              {/* Cards */}
              <div style={{
                border: `1px solid ${stageCfg.border}`, borderRadius: '0 0 10px 10px',
                background: '#fafafa', padding: '8px', display: 'flex',
                flexDirection: 'column', gap: 8, minHeight: 80,
              }}>
                {stageDeals.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#d1d5db', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
                    Empty
                  </div>
                ) : (
                  stageDeals.map(deal => (
                    <DealCard key={deal.id} deal={deal} onClick={() => onOpenDeal(deal)} employees={employees} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Archived deals */}
      {archivedDeals.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowArchived(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
              cursor: 'pointer', color: '#6b7280', fontSize: '0.8rem', fontWeight: 600,
              fontFamily: 'inherit', padding: '6px 0',
            }}
          >
            <ChevronDown
              size={14}
              style={{ transform: showArchived ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            />
            Archived / Closed Lost ({archivedDeals.length})
          </button>
          {showArchived && (
            <div style={{
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10,
              marginTop: 8, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden',
            }}>
              {archivedDeals.map((deal, i) => (
                <div
                  key={deal.id}
                  onClick={() => onOpenDeal(deal)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                    borderBottom: i < archivedDeals.length - 1 ? '1px solid #f3f4f6' : 'none',
                    cursor: 'pointer', background: '#fff', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                >
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>
                    {deal.organization?.name ?? 'Unknown'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                    {deal.organization?.school?.name ?? ''}
                  </span>
                  <StageBadge stage={deal.stage} />
                  <RepBadge rep={deal.assigned_to} employees={employees} />
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{relativeTime(deal.last_touched ?? deal.updated_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function SalesCRM() {
  const isMobile = useIsMobile();
  const [deals, setDeals] = useState<PipelineDealFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedDeal, setSelectedDeal]     = useState<PipelineDealFull | null>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [granolaNotes, setGranolaNotes]     = useState<GranolaNote[] | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const granolaFetchedRef = useRef(false);

  useEffect(() => {
    fetch('/api/pipeline/employees')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEmployees(data); })
      .catch(() => {});
  }, []);

  // ── Fetch deals ──
  const fetchDeals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '500');
      if (categoryFilter && categoryFilter !== 'all') params.set('category', categoryFilter);
      const res = await fetch(`/api/pipeline/deals?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (Array.isArray(data)) {
        setDeals(data);
        return data as PipelineDealFull[];
      }
      return [];
    } catch (err) {
      console.error('[sales-crm] fetch deals error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals, categoryFilter]);

  // ── Fetch Granola notes on mount ──
  useEffect(() => {
    if (granolaFetchedRef.current) return;
    granolaFetchedRef.current = true;
    fetch('/api/granola/notes')
      .then(r => r.json())
      .then((data: any) => {
        if (Array.isArray(data?.notes)) {
          setGranolaNotes(data.notes as GranolaNote[]);
        }
      })
      .catch(err => console.error('[sales-crm] granola error:', err));
  }, []);

  // ── PATCH deal ──
  async function patchDeal(dealId: string, updates: Record<string, unknown>) {
    try {
      await fetch(`/api/pipeline/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      fetchDeals();
    } catch (err) {
      console.error('[sales-crm] patch error:', err);
    }
  }

  // ── onPatch handler for drawer ──
  function handlePatch(dealId: string, patch: Partial<PipelineDealFull>) {
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, ...patch } : d));
    if (selectedDeal?.id === dealId) setSelectedDeal(prev => prev ? { ...prev, ...patch } : null);
    patchDeal(dealId, patch as Record<string, unknown>);
  }

  // ── Advance stage ──
  function handleAdvanceStage(dealId: string, stage: DealStage) {
    const now = new Date().toISOString();
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage, last_touched: now } : d));
    if (selectedDeal?.id === dealId) setSelectedDeal(prev => prev ? { ...prev, stage, last_touched: now } : null);
    patchDeal(dealId, { stage, last_touched: now });
  }

  // ── Log activity ──
  function handleLogActivity(dealId: string, text: string) {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    const existingNotes = parseDealNotes(deal.notes);
    const newNote: DealNote = { ts: new Date().toISOString(), text };
    const updatedNotes = [newNote, ...existingNotes];
    const notesJson = serializeDealNotes(updatedNotes);
    const now = new Date().toISOString();
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, notes: notesJson, last_touched: now } : d));
    if (selectedDeal?.id === dealId) setSelectedDeal(prev => prev ? { ...prev, notes: notesJson, last_touched: now } : null);
    patchDeal(dealId, { notes: notesJson, last_touched: now });
  }

  // ── Filters ──
  const { visibleDeals, archivedDeals } = useMemo(() => {
    let list = deals;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.organization?.name ?? '').toLowerCase().includes(q) ||
        (d.organization?.school?.name ?? '').toLowerCase().includes(q) ||
        (d.contact?.name ?? '').toLowerCase().includes(q)
      );
    }
    const archived = list.filter(d => d.stage === 'closed_lost' || d.stage === 'hold_off');
    const visible = list.filter(d => d.stage !== 'closed_lost' && d.stage !== 'hold_off');
    return { visibleDeals: visible, archivedDeals: archived };
  }, [deals, search]);

  // ── Stats ──
  const stats = useMemo(() => {
    const total = deals.filter(d => d.stage !== 'closed_lost' && d.stage !== 'hold_off').length;
    const pipeline = deals
      .filter(d => !['closed_lost', 'hold_off', 'closed_won'].includes(d.stage) && d.value)
      .reduce((s, d) => s + d.value, 0);
    const closed = deals.filter(d => d.stage === 'closed_won').length;
    const hot = deals.filter(d => ['first_demo', 'second_call', 'contract_sent'].includes(d.stage)).length;
    return { total, pipeline, closed, hot };
  }, [deals]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '10px', color: '#9ca3af' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        Loading pipeline…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Stats Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? '8px' : '12px' }}>
        {[
          { label: 'Active Deals',   value: stats.total,          color: '#1e40af', bg: '#dbeafe' },
          { label: 'Hot (Demo+)',    value: stats.hot,            color: '#92400e', bg: '#fef3c7' },
          { label: 'Closed Won',     value: stats.closed,         color: '#065f46', bg: '#d1fae5' },
          { label: 'Pipeline Value', value: fmt$(stats.pipeline), color: '#5b21b6', bg: '#f5f3ff' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: stat.bg, border: `1px solid ${stat.color}30`,
            borderRadius: '12px', padding: isMobile ? '12px' : '16px',
          }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: stat.color + 'aa', margin: '0 0 4px 0' }}>{stat.label}</p>
            <p style={{ fontSize: isMobile ? '1.4rem' : '1.75rem', fontWeight: 800, color: stat.color, margin: 0, lineHeight: 1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Needs Attention (pinned top) ── */}
      <NeedsAttentionSection
        deals={deals}
        onOpenDeal={setSelectedDeal}
        onLogFollowup={handleLogActivity}
        employees={employees}
      />

      {/* ── Filter Bar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            flex: 1,
            background: '#ffffff', border: '1px solid #e5e7eb',
            borderRadius: '10px', padding: '9px 12px',
          }}>
            <Search size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search org, school, contact…"
              style={{ border: 'none', outline: 'none', fontSize: '0.875rem', fontFamily: 'inherit', flex: 1, color: '#374151', background: 'transparent' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex' }}>
                <X size={13} />
              </button>
            )}
          </div>
          {!isMobile && (
            <button
              onClick={fetchDeals}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          )}
          {!isMobile && (
            <button
              onClick={() => setShowCreateDrawer(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                padding: '8px 14px', borderRadius: 8, border: 'none',
                background: '#0F172A', color: '#fff',
                fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              <Plus size={13} /> New Deal
            </button>
          )}
        </div>
        {/* Mobile action row */}
        {isMobile && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={fetchDeals}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={() => setShowCreateDrawer(true)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 8, border: 'none',
                background: '#0F172A', color: '#fff',
                fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Plus size={14} /> New Deal
            </button>
          </div>
        )}
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {CATEGORY_FILTERS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setCategoryFilter(opt.value)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              fontSize: '0.8rem',
              fontWeight: categoryFilter === opt.value ? 700 : 500,
              cursor: 'pointer',
              border: `1px solid ${categoryFilter === opt.value ? '#0F172A' : '#e5e7eb'}`,
              background: categoryFilter === opt.value ? '#0F172A' : '#ffffff',
              color: categoryFilter === opt.value ? '#ffffff' : '#374151',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Pipeline Kanban ── */}
      {deals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', fontSize: '0.875rem' }}>
          No deals in pipeline yet
        </div>
      ) : (
        <PipelineKanban
          deals={visibleDeals}
          archivedDeals={archivedDeals}
          onOpenDeal={setSelectedDeal}
          employees={employees}
        />
      )}

      {/* ── Create Deal Drawer ── */}
      {showCreateDrawer && (
        <CreateDealDrawer
          onClose={() => setShowCreateDrawer(false)}
          onCreated={fetchDeals}
          employees={employees}
        />
      )}

      {/* ── Deal Detail Drawer ── */}
      {selectedDeal && (
        <DealDetailDrawer
          deal={selectedDeal}
          granolaNotesCache={granolaNotes}
          onClose={() => setSelectedDeal(null)}
          onAdvanceStage={handleAdvanceStage}
          onLogActivity={handleLogActivity}
          onPatch={handlePatch}
          employees={employees}
        />
      )}
    </div>
  );
}
