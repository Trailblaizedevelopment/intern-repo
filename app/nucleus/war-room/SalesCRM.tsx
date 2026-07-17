'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, RefreshCw, Plus, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Mail, Phone, Clock, User } from 'lucide-react';
import { STAGE_CONFIG, type DealStage } from '@/lib/supabase';
import { getDealConference } from '@/lib/pipeline-conference';
import { useAuth } from '@/lib/auth-context';

/** REVIEW FLAG: Next-action guidance. Search "NextActionBar" / "FollowUpQueueView" to remove if rejected. */
const START_HERE_DISMISS_KEY = 'sales-room-start-here-dismissed';

function dealDisplayTitle(deal: { organization?: { name?: string | null; school?: { name?: string | null } | null } | null }): string {
  const org = deal.organization?.name?.trim() || 'Unknown deal';
  const school = deal.organization?.school?.name?.trim() || '';
  if (!school) return org;
  if (org.toLowerCase().includes(school.toLowerCase())) return org;
  return `${org} @ ${school}`;
}

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
    school?: { id: string; name: string; conference?: string | null } | null;
    national_org?: { id: string; name: string } | null;
  } | null;
  contact?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  } | null;
  deal_contacts?: {
    id: string;
    contact_id: string;
    is_primary: boolean;
    contact?: {
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      role?: string | null;
    } | null;
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

const DEALS_PAGE_SIZE = 25;
const NEEDS_ATTENTION_PREVIEW = 5;

const CRM_UI = {
  surface: '#f9fafb',
  surfaceMuted: '#f3f4f6',
  border: '#e5e7eb',
  borderSubtle: '#f3f4f6',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textSubtle: '#9ca3af',
  blue: '#2563eb',
  blueDark: '#1d4ed8',
  blueBg: '#eff6ff',
  blueBorder: '#bfdbfe',
  ink: '#0F172A',
} as const;

const NEUTRAL_BADGE = {
  color: '#4b5563',
  bg: '#f3f4f6',
  border: '#e5e7eb',
} as const;

const BOARD_MAX_HEIGHT = 'min(70vh, 680px)';

const TOOLBAR_CONTROL_HEIGHT = 34;

const TOOLBAR_BUTTON: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 12px',
  fontSize: '0.8125rem',
  lineHeight: 1,
  borderRadius: '9999px',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
  flexShrink: 0,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
};

const TOOLBAR_SELECT: React.CSSProperties = {
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 28px 0 12px',
  borderRadius: '9999px',
  border: '1px solid #e5e7eb',
  background: '#fff',
  color: '#374151',
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxSizing: 'border-box',
  lineHeight: 1,
  flexShrink: 0,
};

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

const DRAWER_CONTROL_HEIGHT = 38;
const DRAWER_FIELD_GAP = 12;

const DRAWER_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#6b7280',
  marginBottom: 5,
};

const DRAWER_INPUT: React.CSSProperties = {
  width: '100%',
  height: DRAWER_CONTROL_HEIGHT,
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: '0 12px',
  fontSize: '0.875rem',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#111827',
};

const DRAWER_SELECT: React.CSSProperties = {
  ...DRAWER_INPUT,
  padding: '0 32px 0 12px',
  cursor: 'pointer',
};

const DRAWER_FOOTER_BTN: React.CSSProperties = {
  flex: 1,
  height: 44,
  borderRadius: '9999px',
  fontSize: '0.875rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  boxSizing: 'border-box',
};

const TEMP_OPTIONS = [
  { value: 'hot' as const, label: '🔥 Hot' },
  { value: 'warm' as const, label: '🌡 Warm' },
  { value: 'cold' as const, label: '🧊 Cold' },
];

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
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 20px' : '16px 24px', display: 'flex', flexDirection: 'column', gap: DRAWER_FIELD_GAP }}>

          <div>
            <label style={DRAWER_LABEL}>
              Chapter / Org Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="e.g. Sigma Chi, IFC, Theta Xi Nationals"
              autoFocus
              style={DRAWER_INPUT}
            />
          </div>

          <div>
            <label style={DRAWER_LABEL}>School</label>
            <input
              type="text"
              value={schoolName}
              onChange={e => setSchoolName(e.target.value)}
              placeholder="e.g. University of Alabama, TCU"
              style={DRAWER_INPUT}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: DRAWER_FIELD_GAP }}>
            <div>
              <label style={DRAWER_LABEL}>Type</label>
              <select value={orgType} onChange={e => setOrgType(e.target.value)} style={DRAWER_SELECT}>
                {ORG_TYPES.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={DRAWER_LABEL}>Stage</label>
              <select value={stage} onChange={e => setStage(e.target.value as DealStage)} style={DRAWER_SELECT}>
                {PIPELINE_STAGES.map(s => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: DRAWER_FIELD_GAP }}>
            <div>
              <label style={DRAWER_LABEL}>Temp</label>
              <select
                value={temperature}
                onChange={e => setTemperature(e.target.value as 'hot' | 'warm' | 'cold')}
                style={DRAWER_SELECT}
              >
                {TEMP_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={DRAWER_LABEL}>Value ($)</label>
              <input
                type="number"
                value={value}
                onChange={e => setValue(e.target.value)}
                style={DRAWER_INPUT}
              />
            </div>
          </div>

          <div>
            <label style={DRAWER_LABEL}>Assigned To</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={DRAWER_SELECT}>
              <option value="">Unassigned</option>
              {repList.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name.split(' ')[0]}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={DRAWER_LABEL}>
              Contact <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                placeholder="Name"
                style={DRAWER_INPUT}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="Email"
                  style={DRAWER_INPUT}
                />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="Phone"
                  style={DRAWER_INPUT}
                />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? '12px 20px 28px' : '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...DRAWER_FOOTER_BTN,
              border: '1px solid #e5e7eb',
              background: '#fff',
              color: '#374151',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!orgName.trim() || creating}
            style={{
              ...DRAWER_FOOTER_BTN,
              border: 'none',
              background: orgName.trim() && !creating ? '#0F172A' : '#e5e7eb',
              color: orgName.trim() && !creating ? '#fff' : '#9ca3af',
              cursor: orgName.trim() && !creating ? 'pointer' : 'not-allowed',
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

function dealIdleDays(deal: PipelineDealFull): number {
  return daysSince(deal.last_touched ?? deal.updated_at) ?? 999;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const days = daysSince(dateStr);
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function dealNeedsAttention(deal: PipelineDealFull): boolean {
  if (!SLIPPING_STAGES.includes(deal.stage)) return false;
  const days = daysSince(deal.last_touched ?? deal.updated_at);
  return days === null || days >= 3;
}

function activityColor(dateStr: string | null | undefined): string {
  const days = daysSince(dateStr);
  if (days === null || days > 7) return CRM_UI.blueDark;
  if (days >= 3) return CRM_UI.textMuted;
  return CRM_UI.textSubtle;
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
  if (!rep) return <span style={{ color: CRM_UI.textSubtle, fontSize: '0.75rem' }}>—</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px 2px 3px', borderRadius: '9999px',
      background: NEUTRAL_BADGE.bg, color: NEUTRAL_BADGE.color,
      border: `1px solid ${NEUTRAL_BADGE.border}`,
      fontSize: '0.7rem', fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: '16px', height: '16px', borderRadius: '9999px',
        background: '#e5e7eb', color: CRM_UI.textMuted,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '9px', fontWeight: 700,
      }}>
        {rep[0]}
      </span>
      {rep}
    </span>
  );
}

// ─── Stage Badge ───────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: DealStage }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: '9999px', fontSize: '0.7rem',
      fontWeight: 600, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg,
      border: `1px solid ${NEUTRAL_BADGE.border}`, whiteSpace: 'nowrap',
    }}>
      {STAGE_LABELS[stage]}
    </span>
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

const CATEGORY_LABELS: Record<string, string> = {
  greek: 'Greek Life',
  country_clubs: 'Country Club',
  professional_associations: 'Professional / Chamber',
  sports: 'Sports Team',
  alumni_associations: 'Alumni Association',
};

const TEMP_READ_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  hot:  { bg: '#fef2f2', border: '#fecaca', color: '#dc2626' },
  warm: { bg: '#fffbeb', border: '#fde68a', color: '#d97706' },
  cold: { bg: '#f9fafb', border: '#e5e7eb', color: '#6b7280' },
};

function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ClosedWonDetailDrawer({
  deal,
  employees,
  granolaNotesCache,
  onClose,
}: {
  deal: PipelineDealFull;
  employees: { id: string; name: string }[];
  granolaNotesCache: GranolaNote[] | null;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const orgName = deal.organization?.name ?? 'Unknown Org';
  const schoolName = deal.organization?.school?.name ?? '';
  const assignedName = resolveRep(deal.assigned_to, employees) || 'Unassigned';
  const conference = deal.conference || getDealConference(deal);
  const category = CATEGORY_LABELS[(deal as { category?: string }).category || 'greek'] || 'Greek Life';
  const mrr = Math.round((deal.value || 0) / 12);
  const tempStyle = TEMP_READ_STYLE[deal.temperature] || TEMP_READ_STYLE.warm;
  const closedAt = deal.updated_at || deal.last_touched;
  const activityLog = useMemo(() => parseDealNotes(deal.notes), [deal.notes]);
  const dealContacts = deal.deal_contacts ?? [];

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

  const summaryRows: { label: string; value: React.ReactNode }[] = [
    { label: 'Type', value: deal.deal_type.charAt(0).toUpperCase() + deal.deal_type.slice(1) },
    {
      label: 'Temperature',
      value: (
        <span style={{
          display: 'inline-flex', padding: '2px 10px', borderRadius: '9999px',
          fontSize: '0.75rem', fontWeight: 600,
          background: tempStyle.bg, border: `1px solid ${tempStyle.border}`, color: tempStyle.color,
        }}>
          {deal.temperature.charAt(0).toUpperCase() + deal.temperature.slice(1)}
        </span>
      ),
    },
    { label: 'Conference', value: conference },
    { label: 'Category', value: category },
    { label: 'Assigned To', value: assignedName },
    { label: 'Created', value: formatFullDate(deal.created_at) },
    { label: 'Closed', value: formatFullDate(closedAt) },
  ];

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
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', background: '#f9fafb' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d1d5db' }} />
          </div>
        )}

        <div style={{ padding: isMobile ? '12px 20px 12px' : '20px 24px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{orgName}</span>
              </div>
              {schoolName && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{schoolName}</div>}
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 4 }}>Read-only overview</div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, flexShrink: 0 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 20px' : '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
            border: '1px solid #6ee7b7',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '9999px', background: '#d1fae5',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <CheckCircle2 size={20} color="#059669" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#047857' }}>
                  Closed Won
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.875rem', fontWeight: 600, color: '#065f46' }}>
                  {closedAt ? `Closed ${formatFullDate(closedAt)}` : 'Deal successfully closed'}
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Contract Value', value: fmt$(deal.value) },
              { label: 'MRR', value: fmt$(mrr) },
            ].map(stat => (
              <div key={stat.label} style={{ padding: '12px 14px', borderRadius: 10, background: CRM_UI.surfaceMuted, border: `1px solid ${CRM_UI.border}` }}>
                <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CRM_UI.textMuted }}>
                  {stat.label}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '1.125rem', fontWeight: 700, color: CRM_UI.text, fontVariantNumeric: 'tabular-nums' }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          <div>
            <label style={DRAWER_LABEL}>Deal Summary</label>
            <div style={{ background: '#fff', border: `1px solid ${CRM_UI.border}`, borderRadius: 10, padding: '4px 14px' }}>
              {summaryRows.map((row, index) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    padding: '10px 0',
                    borderBottom: index < summaryRows.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}
                >
                  <span style={{ fontSize: '0.8125rem', color: CRM_UI.textSubtle }}>{row.label}</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: CRM_UI.text, textAlign: 'right' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {(dealContacts.length > 0 || deal.contact) && (
            <div>
              <label style={DRAWER_LABEL}>Contacts</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(dealContacts.length > 0 ? dealContacts : deal.contact ? [{ id: '', contact_id: deal.contact.id, is_primary: true, contact: deal.contact }] : []).map((dc, idx) => (
                  <div
                    key={dc.contact?.id || dc.id || idx}
                    style={{
                      padding: '12px 14px', borderRadius: 10, background: CRM_UI.surfaceMuted,
                      border: `1px solid ${dc.is_primary ? '#6ee7b7' : CRM_UI.border}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <User size={14} color={CRM_UI.textMuted} />
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: CRM_UI.text }}>{dc.contact?.name || 'Unknown'}</span>
                      {dc.is_primary && (
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 9999, background: '#ecfdf5', color: '#047857' }}>
                          Primary
                        </span>
                      )}
                    </div>
                    {dc.contact?.role && (
                      <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: CRM_UI.textSubtle, textTransform: 'capitalize' }}>
                        {dc.contact.role.replace(/_/g, ' ')}
                      </p>
                    )}
                    {dc.contact?.email && (
                      <p style={{ margin: 0, fontSize: '0.75rem', color: CRM_UI.textSubtle, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={11} /> {dc.contact.email}
                      </p>
                    )}
                    {dc.contact?.phone && (
                      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: CRM_UI.textSubtle, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={11} /> {dc.contact.phone}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {matchedNotes !== null && matchedNotes.length > 0 && (
            <div>
              <label style={DRAWER_LABEL}>Meeting Notes</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {matchedNotes.map(note => (
                  <div key={note.id} style={{ background: CRM_UI.surfaceMuted, border: `1px solid ${CRM_UI.border}`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: CRM_UI.text, marginBottom: 4 }}>{note.title}</div>
                    <div style={{ fontSize: '0.72rem', color: CRM_UI.textMuted, marginBottom: 6 }}>
                      {note.created_at ? formatFullDate(note.created_at) : ''}
                    </div>
                    {(note.summary || note.transcript) && (
                      <div style={{ fontSize: '0.78rem', color: CRM_UI.textSecondary, lineHeight: 1.5 }}>
                        {(note.summary || note.transcript || '').slice(0, 300)}
                        {((note.summary || note.transcript || '').length > 300) ? '…' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={DRAWER_LABEL}>Activity History</label>
            {activityLog.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: CRM_UI.textMuted, fontStyle: 'italic' }}>No activity logged.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activityLog.map((note, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, background: CRM_UI.surfaceMuted, border: `1px solid ${CRM_UI.border}` }}>
                    <Clock size={14} color={CRM_UI.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.875rem', color: CRM_UI.text, lineHeight: 1.4 }}>{note.text}</div>
                      {note.ts && (
                        <div style={{ fontSize: '0.75rem', color: CRM_UI.textMuted, marginTop: 2 }}>
                          {formatFullDate(note.ts)}
                          {note.author && <span> · {note.author}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{
          padding: isMobile ? '12px 20px 28px' : '12px 24px 16px',
          background: '#f9fafb',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...DRAWER_FOOTER_BTN,
              flex: 1,
              width: '100%',
              border: 'none',
              background: CRM_UI.ink,
              color: '#fff',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
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
  const [editAdvisorName, setEditAdvisorName] = useState<string>((deal as any).advisor_name ?? '');
  const [editAdvisorEmail, setEditAdvisorEmail] = useState<string>((deal as any).advisor_email ?? '');
  const [editAdvisorPhone, setEditAdvisorPhone] = useState<string>((deal as any).advisor_phone ?? '');
  const [editAdvisorMet, setEditAdvisorMet] = useState<boolean>((deal as any).advisor_met ?? false);

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
    if (editAdvisorName !== ((deal as any).advisor_name ?? '')) patch.advisor_name = editAdvisorName || null;
    if (editAdvisorEmail !== ((deal as any).advisor_email ?? '')) patch.advisor_email = editAdvisorEmail || null;
    if (editAdvisorPhone !== ((deal as any).advisor_phone ?? '')) patch.advisor_phone = editAdvisorPhone || null;
    if (editAdvisorMet !== ((deal as any).advisor_met ?? false)) patch.advisor_met = editAdvisorMet;

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

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '14px 20px' : '16px 24px', display: 'flex', flexDirection: 'column', gap: DRAWER_FIELD_GAP }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: DRAWER_FIELD_GAP }}>
            <div>
              <label style={DRAWER_LABEL}>Stage</label>
              <select
                value={deal.stage}
                onChange={e => onAdvanceStage(deal.id, e.target.value as DealStage)}
                style={DRAWER_SELECT}
              >
                {PIPELINE_STAGES.map(s => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={DRAWER_LABEL}>Temperature</label>
              <select
                value={editTemp}
                onChange={e => setEditTemp(e.target.value as 'hot' | 'warm' | 'cold')}
                style={DRAWER_SELECT}
              >
                {TEMP_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: DRAWER_FIELD_GAP }}>
            <div>
              <label style={DRAWER_LABEL}>Value ($)</label>
              <input
                type="number"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                style={DRAWER_INPUT}
              />
            </div>
            <div>
              <label style={DRAWER_LABEL}>Next Follow-up</label>
              <input
                type="date"
                value={editFollowup}
                onChange={e => setEditFollowup(e.target.value)}
                style={DRAWER_INPUT}
              />
            </div>
          </div>

          <div>
            <label style={DRAWER_LABEL}>Assigned To</label>
            <select value={editRep} onChange={e => setEditRep(e.target.value)} style={DRAWER_SELECT}>
              <option value="">Unassigned</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name.split(' ')[0]}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={DRAWER_LABEL}>Primary Contact</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                type="text"
                value={editContactName}
                onChange={e => setEditContactName(e.target.value)}
                placeholder="Name"
                style={DRAWER_INPUT}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  type="email"
                  value={editContactEmail}
                  onChange={e => setEditContactEmail(e.target.value)}
                  placeholder="Email"
                  style={DRAWER_INPUT}
                />
                <input
                  type="tel"
                  value={editContactPhone}
                  onChange={e => setEditContactPhone(e.target.value)}
                  placeholder="Phone"
                  style={DRAWER_INPUT}
                />
              </div>
            </div>
          </div>

          {/* Additional Contacts */}
          {(() => {
            const extras = (deal as any).deal_contacts?.filter((dc: any) => !dc.is_primary) ?? [];
            return (
              <div>
                <label style={DRAWER_LABEL}>Additional Contacts</label>
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

          {/* Advisor */}
          <div>
            <label style={DRAWER_LABEL}>Advisor</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                value={editAdvisorName}
                onChange={e => setEditAdvisorName(e.target.value)}
                placeholder="Advisor name"
                style={DRAWER_INPUT}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  value={editAdvisorPhone}
                  onChange={e => setEditAdvisorPhone(e.target.value)}
                  placeholder="Phone"
                  type="tel"
                  style={DRAWER_INPUT}
                />
                <input
                  value={editAdvisorEmail}
                  onChange={e => setEditAdvisorEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  style={DRAWER_INPUT}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8125rem', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={editAdvisorMet}
                  onChange={e => setEditAdvisorMet(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#C9A84C' }}
                />
                Met with advisor
              </label>
            </div>
          </div>

          <div>
            <label style={DRAWER_LABEL}>Meeting Notes (Granola)</label>
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

          <div>
            <label style={DRAWER_LABEL}>Activity Log</label>
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

        <div style={{ padding: isMobile ? '12px 20px 0' : '12px 24px 0', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <label style={DRAWER_LABEL}>Log Activity</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              type="text"
              value={activityInput}
              onChange={e => setActivityInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLogActivity(); }}
              placeholder="Add a note or follow-up…"
              style={{ ...DRAWER_INPUT, flex: 1, width: 'auto' }}
            />
            <button
              type="button"
              onClick={handleLogActivity}
              disabled={!activityInput.trim()}
              style={{
                ...DRAWER_FOOTER_BTN,
                flex: '0 0 auto',
                height: DRAWER_CONTROL_HEIGHT,
                padding: '0 18px',
                border: 'none',
                background: activityInput.trim() ? '#0F172A' : '#e5e7eb',
                color: activityInput.trim() ? '#fff' : '#9ca3af',
                cursor: activityInput.trim() ? 'pointer' : 'not-allowed',
                fontSize: '0.8125rem',
              }}
            >
              Log
            </button>
          </div>
        </div>

        <div style={{ padding: isMobile ? '0 20px 28px' : '0 24px 16px', background: '#f9fafb', display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={handleClosedLost}
            style={{
              ...DRAWER_FOOTER_BTN,
              border: 'none',
              background: '#fee2e2',
              color: '#dc2626',
            }}
          >
            Closed Lost
          </button>
          <button
            type="button"
            onClick={handleHoldOff}
            style={{
              ...DRAWER_FOOTER_BTN,
              border: '1px solid #e5e7eb',
              background: '#fff',
              color: '#6b7280',
            }}
          >
            Hold Off
          </button>
          <button
            type="button"
            onClick={handleSaveChanges}
            style={{
              ...DRAWER_FOOTER_BTN,
              border: 'none',
              background: '#0F172A',
              color: '#fff',
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
  previewLimit?: number;
  onViewAll?: () => void;
}

interface NextActionBarProps {
  deal: PipelineDealFull | null;
  queueCount: number;
  employees: { id: string; name: string }[];
  onLogFollowup: (dealId: string, text: string) => void;
  onOpenDeal: (deal: PipelineDealFull) => void;
  onOpenFollowUpQueue: () => void;
  dismissed: boolean;
  onDismiss: () => void;
  onRestore: () => void;
}

function NextActionBar({
  deal,
  queueCount,
  employees,
  onLogFollowup,
  onOpenDeal,
  onOpenFollowUpQueue,
  dismissed,
  onDismiss,
  onRestore,
}: NextActionBarProps) {
  const [logging, setLogging] = useState(false);
  const [note, setNote] = useState('');
  const othersCount = Math.max(0, queueCount - (deal ? 1 : 0));

  useEffect(() => {
    setLogging(false);
    setNote('');
  }, [deal?.id]);

  if (dismissed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' }}>
        <span style={{ fontSize: '0.8125rem', color: CRM_UI.textMuted }}>Next-step helper hidden</span>
        <button
          type="button"
          onClick={onRestore}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: CRM_UI.blueDark, fontFamily: 'inherit' }}
        >
          Show again
        </button>
      </div>
    );
  }

  if (!deal) {
    return (
      <div style={{ padding: '4px 0 16px', borderBottom: `1px solid ${CRM_UI.border}` }}>
        <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: CRM_UI.textSubtle }}>
          Next step
        </p>
        <p style={{ margin: '8px 0 0', fontSize: '1.125rem', fontWeight: 600, color: CRM_UI.text }}>
          You&apos;re caught up on stalled deals.
        </p>
        <p style={{ margin: '6px 0 0', fontSize: '0.875rem', color: CRM_UI.textMuted }}>
          Browse the list below, or add a new deal when you have one.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.75rem', color: CRM_UI.textSubtle, fontFamily: 'inherit' }}
        >
          Hide this
        </button>
      </div>
    );
  }

  const dealId = deal.id;
  const title = dealDisplayTitle(deal);
  const idle = dealIdleDays(deal);
  const stageLabel = STAGE_LABELS[deal.stage] ?? deal.stage;
  const owner = resolveRep(deal.assigned_to, employees);

  function submitFollowup() {
    const text = note.trim();
    if (!text) return;
    onLogFollowup(dealId, text);
    setNote('');
    setLogging(false);
  }

  return (
    <div style={{ padding: '4px 0 18px', borderBottom: `1px solid ${CRM_UI.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: CRM_UI.textSubtle }}>
          Next step
        </p>
        <button
          type="button"
          onClick={onDismiss}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.75rem', color: CRM_UI.textSubtle, fontFamily: 'inherit' }}
        >
          Hide
        </button>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: '1.25rem', fontWeight: 600, color: CRM_UI.text, lineHeight: 1.25 }}>
        Follow up with {title}
      </p>
      <p style={{ margin: '8px 0 0', fontSize: '0.875rem', color: CRM_UI.textMuted }}>
        {stageLabel}
        {owner ? ` · ${owner}` : ''}
        {' · '}
        idle {idle} day{idle === 1 ? '' : 's'}
      </p>
      <p style={{ margin: '10px 0 0', fontSize: '0.8125rem', fontWeight: 700, color: CRM_UI.text, lineHeight: 1.4, maxWidth: 560 }}>
        Sales teams: log a real follow-up to clear this chapter from your queue — it saves to the deal. Or open the deal to advance stage / Hold Off / Closed Lost.
      </p>

      {!logging ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setLogging(true)}
              style={{
                height: 40,
                padding: '0 18px',
                border: 'none',
                borderRadius: 9999,
                background: CRM_UI.ink,
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Log follow-up
            </button>
            <button
              type="button"
              onClick={() => onOpenDeal(deal)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: CRM_UI.textSecondary,
                fontFamily: 'inherit',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Open deal
            </button>
          </div>
          {othersCount > 0 && (
            <button
              type="button"
              onClick={onOpenFollowUpQueue}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: CRM_UI.blueDark,
                fontWeight: 600,
                fontFamily: 'inherit',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              You have {othersCount} other chapter{othersCount === 1 ? '' : 's'} to follow up with
            </button>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submitFollowup();
              if (e.key === 'Escape') { setLogging(false); setNote(''); }
            }}
            placeholder="What did you do / what's next?"
            autoFocus
            style={{
              width: '100%',
              height: 42,
              border: 'none',
              borderBottom: `2px solid ${CRM_UI.ink}`,
              borderRadius: 0,
              padding: '0 2px',
              fontSize: '0.9375rem',
              outline: 'none',
              fontFamily: 'inherit',
              background: 'transparent',
              color: CRM_UI.text,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={submitFollowup}
              disabled={!note.trim()}
              style={{
                height: 40,
                padding: '0 18px',
                border: 'none',
                borderRadius: 9999,
                background: note.trim() ? CRM_UI.ink : '#d1d5db',
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: note.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              Save & next
            </button>
            <button
              type="button"
              onClick={() => { setLogging(false); setNote(''); }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: CRM_UI.textSubtle,
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface FollowUpQueueViewProps {
  deals: PipelineDealFull[];
  employees: { id: string; name: string }[];
  onBack: () => void;
  onLogFollowup: (dealId: string, text: string) => void;
  onSnooze: (dealId: string) => void;
  onSetStage: (dealId: string, stage: DealStage) => void;
  onOpenDeal: (deal: PipelineDealFull) => void;
}

function FollowUpQueueView({
  deals,
  employees,
  onBack,
  onLogFollowup,
  onSnooze,
  onSetStage,
  onOpenDeal,
}: FollowUpQueueViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const linkBtn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: '0.875rem',
            color: CRM_UI.textMuted,
            fontFamily: 'inherit',
          }}
        >
          ← Back to next step
        </button>
        <h2 style={{ margin: '12px 0 0', fontSize: '1.375rem', fontWeight: 600, color: CRM_UI.text }}>
          Chapters to follow up with
        </h2>
        <p style={{ margin: '8px 0 0', fontSize: '0.875rem', color: CRM_UI.textMuted }}>
          {deals.length} chapter{deals.length === 1 ? '' : 's'} idle 3+ days at First Demo, Second Call, or Contract Sent.
        </p>
      </div>

      <div style={{ padding: '14px 0', borderTop: `1px solid ${CRM_UI.border}`, borderBottom: `1px solid ${CRM_UI.border}` }}>
        <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: CRM_UI.text, lineHeight: 1.45 }}>
          Sales teams: take an action on each chapter to clear it from this queue. Logging a follow-up is a real save — it writes to the deal and resets the idle timer — not cosmetic.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: '0.875rem', color: CRM_UI.textSecondary, lineHeight: 1.5 }}>
          Other ways to clear a chapter from this list:
        </p>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: CRM_UI.textSecondary, fontSize: '0.875rem', lineHeight: 1.55 }}>
          <li><strong style={{ color: CRM_UI.text }}>Log follow-up</strong> — record outreach (primary).</li>
          <li><strong style={{ color: CRM_UI.text }}>Snooze</strong> — reset the idle timer without a note (use sparingly).</li>
          <li><strong style={{ color: CRM_UI.text }}>Open deal</strong> — advance stage (e.g. toward Closed Won).</li>
          <li><strong style={{ color: CRM_UI.text }}>Hold Off / Closed Lost</strong> — park or kill dead deals so they stop clogging the queue.</li>
        </ul>
      </div>

      {deals.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.9375rem', color: CRM_UI.textSecondary }}>
          All clear — nothing left in this queue.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {deals.map((deal, index) => {
            const title = dealDisplayTitle(deal);
            const idle = dealIdleDays(deal);
            const stageLabel = STAGE_LABELS[deal.stage] ?? deal.stage;
            const owner = resolveRep(deal.assigned_to, employees);
            const isOpen = expandedId === deal.id;

            return (
              <div
                key={deal.id}
                style={{
                  padding: '16px 0',
                  borderTop: index === 0 ? `1px solid ${CRM_UI.border}` : undefined,
                  borderBottom: `1px solid ${CRM_UI.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: CRM_UI.text }}>
                      {title}
                    </p>
                    <p style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: CRM_UI.textMuted }}>
                      {stageLabel}
                      {owner ? ` · ${owner}` : ''}
                      {' · '}
                      idle {idle}d
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : deal.id)}
                      style={{
                        height: 36,
                        padding: '0 14px',
                        border: 'none',
                        borderRadius: 9999,
                        background: CRM_UI.ink,
                        color: '#fff',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Log follow-up
                    </button>
                    <button
                      type="button"
                      onClick={() => onSnooze(deal.id)}
                      title="Resets idle timer without writing a follow-up note"
                      style={{ ...linkBtn, color: CRM_UI.textSecondary }}
                    >
                      Snooze
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenDeal(deal)}
                      style={{ ...linkBtn, color: CRM_UI.textSecondary }}
                    >
                      Open deal
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetStage(deal.id, 'hold_off')}
                      title="Remove from active queue — bad timing / pause"
                      style={{ ...linkBtn, color: CRM_UI.textMuted }}
                    >
                      Hold Off
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetStage(deal.id, 'closed_lost')}
                      title="Mark as lost — removes from active pipeline"
                      style={{ ...linkBtn, color: '#dc2626' }}
                    >
                      Closed Lost
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: CRM_UI.textMuted }}>
                      This saves a real note on the deal and clears it from the queue.
                    </p>
                    <input
                      type="text"
                      value={inputs[deal.id] ?? ''}
                      onChange={e => setInputs(prev => ({ ...prev, [deal.id]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const text = (inputs[deal.id] ?? '').trim();
                          if (!text) return;
                          onLogFollowup(deal.id, text);
                          setInputs(prev => ({ ...prev, [deal.id]: '' }));
                          setExpandedId(null);
                        }
                      }}
                      placeholder="What did you do / what's next?"
                      autoFocus
                      style={{
                        width: '100%',
                        height: 40,
                        border: 'none',
                        borderBottom: `2px solid ${CRM_UI.ink}`,
                        borderRadius: 0,
                        padding: '0 2px',
                        fontSize: '0.875rem',
                        outline: 'none',
                        fontFamily: 'inherit',
                        background: 'transparent',
                        color: CRM_UI.text,
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 14 }}>
                      <button
                        type="button"
                        onClick={() => {
                          const text = (inputs[deal.id] ?? '').trim();
                          if (!text) return;
                          onLogFollowup(deal.id, text);
                          setInputs(prev => ({ ...prev, [deal.id]: '' }));
                          setExpandedId(null);
                        }}
                        disabled={!(inputs[deal.id] ?? '').trim()}
                        style={{
                          height: 36,
                          padding: '0 14px',
                          border: 'none',
                          borderRadius: 9999,
                          background: (inputs[deal.id] ?? '').trim() ? CRM_UI.ink : '#d1d5db',
                          color: '#fff',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          cursor: (inputs[deal.id] ?? '').trim() ? 'pointer' : 'default',
                          fontFamily: 'inherit',
                        }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedId(null)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontSize: '0.8125rem',
                          color: CRM_UI.textSubtle,
                          fontFamily: 'inherit',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NeedsAttentionSection({
  deals,
  onOpenDeal,
  onLogFollowup,
  employees = [],
  previewLimit = NEEDS_ATTENTION_PREVIEW,
  onViewAll,
}: NeedsAttentionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);

  const slipping = useMemo(() => {
    return deals.filter(d => {
      if (!SLIPPING_STAGES.includes(d.stage)) return false;
      const lastActivity = d.last_touched ?? d.updated_at;
      const days = daysSince(lastActivity);
      return days === null || days >= 3;
    }).sort((a, b) => dealIdleDays(b) - dealIdleDays(a));
  }, [deals]);

  const visibleSlipping = showAll ? slipping : slipping.slice(0, previewLimit);

  if (slipping.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: CRM_UI.surface, border: `1px solid ${CRM_UI.border}`, borderRadius: 12,
        padding: '12px 18px',
      }}>
        <CheckCircle2 size={16} color={CRM_UI.blue} />
        <span style={{ fontSize: '0.875rem', color: CRM_UI.textSecondary, fontWeight: 600 }}>All deals on track</span>
      </div>
    );
  }

  return (
    <div style={{
      background: CRM_UI.surface, border: `1px solid ${CRM_UI.border}`, borderRadius: 14,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 18px', background: CRM_UI.surfaceMuted, borderBottom: `1px solid ${CRM_UI.border}`,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <AlertCircle size={16} color={CRM_UI.blue} />
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: CRM_UI.text }}>
          {slipping.length} deal{slipping.length !== 1 ? 's' : ''} need{slipping.length === 1 ? 's' : ''} attention
        </span>
        <span style={{ fontSize: '0.75rem', color: CRM_UI.textMuted }}>No follow-up in 3+ days at key stages</span>
      </div>
      <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibleSlipping.map(deal => {
          const orgName = deal.organization?.name ?? 'Unknown';
          const schoolName = deal.organization?.school?.name ?? '';
          const lastActivity = deal.last_touched ?? deal.updated_at;
          const days = daysSince(lastActivity);
          const isOpen = expandedId === deal.id;

          return (
            <div key={deal.id} style={{ background: '#fff', border: `1px solid ${CRM_UI.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{ fontWeight: 600, fontSize: '0.875rem', color: CRM_UI.text, cursor: 'pointer' }}
                      onClick={() => onOpenDeal(deal)}
                    >
                      {orgName}
                    </span>
                    {schoolName && <span style={{ fontSize: '0.72rem', color: CRM_UI.textSubtle }}>{schoolName}</span>}
                    <StageBadge stage={deal.stage} />
                    <RepBadge rep={deal.assigned_to} employees={employees} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{
                    fontSize: '0.875rem', fontWeight: 700,
                    color: days === null || (days ?? 0) > 7 ? CRM_UI.blueDark : CRM_UI.textMuted,
                  }}>
                    {days === null ? '—' : `${days}d`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isOpen ? null : deal.id)}
                    style={{
                      padding: '6px 14px', borderRadius: '9999px',
                      border: `1px solid ${CRM_UI.border}`,
                      background: '#fff', color: CRM_UI.textSecondary,
                      fontSize: '0.75rem', fontWeight: 600,
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
                      flex: 1, border: `1px solid ${CRM_UI.border}`, borderRadius: '9999px',
                      padding: '8px 14px', height: DRAWER_CONTROL_HEIGHT, boxSizing: 'border-box',
                      fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: CRM_UI.textSecondary,
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
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
                      padding: '0 18px', borderRadius: '9999px', border: 'none',
                      height: DRAWER_CONTROL_HEIGHT,
                      background: (inputs[deal.id] ?? '').trim() ? CRM_UI.ink : CRM_UI.border,
                      color: '#fff', fontSize: '0.8125rem', fontWeight: 600,
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
        {slipping.length > previewLimit && !showAll && (
          <button
            type="button"
            onClick={() => {
              if (onViewAll) onViewAll();
              else setShowAll(true);
            }}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 14px',
              borderRadius: '9999px',
              border: `1px solid ${CRM_UI.border}`,
              background: '#fff',
              color: CRM_UI.blueDark,
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            View all {slipping.length} deals needing attention
          </button>
        )}
      </div>
    </div>
  );
}

// ─── All Deals List ─────────────────────────────────────────────────────────────

const DEALS_LIST_GRID_COLUMNS = 'minmax(0, 1fr) auto auto 56px 80px';

const DEALS_LIST_HEADER_CELL: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#9CA3AF',
};

type IdleSort = 'desc' | 'asc';

interface AllDealsListProps {
  deals: PipelineDealFull[];
  totalCount: number;
  page: number;
  pageSize: number;
  idleSort: IdleSort;
  onIdleSortChange: (sort: IdleSort) => void;
  onPageChange: (page: number) => void;
  onOpenDeal: (deal: PipelineDealFull) => void;
  employees?: { id: string; name: string }[];
}

function AllDealsList({
  deals,
  totalCount,
  page,
  pageSize,
  idleSort,
  onIdleSortChange,
  onPageChange,
  onOpenDeal,
  employees = [],
}: AllDealsListProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  if (totalCount === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9ca3af', fontSize: '0.875rem' }}>
        No deals match your filters
      </div>
    );
  }

  return (
    <div>
      <div style={{ borderTop: '1px solid #E5E7EB' }}>
        <div
          role="row"
          style={{
            display: 'grid',
            gridTemplateColumns: DEALS_LIST_GRID_COLUMNS,
            gap: '12px',
            alignItems: 'center',
            padding: '10px 0 8px',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          <span role="columnheader" style={DEALS_LIST_HEADER_CELL}>Deal</span>
          <span role="columnheader" style={DEALS_LIST_HEADER_CELL}>Stage</span>
          <span role="columnheader" style={DEALS_LIST_HEADER_CELL}>Owner</span>
          <button
            type="button"
            role="columnheader"
            aria-sort={idleSort === 'desc' ? 'descending' : 'ascending'}
            onClick={() => onIdleSortChange(idleSort === 'desc' ? 'asc' : 'desc')}
            style={{
              ...DEALS_LIST_HEADER_CELL,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 4,
              textAlign: 'right',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: '#6B7280',
            }}
          >
            Idle
            {idleSort === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
          <span role="columnheader" style={{ ...DEALS_LIST_HEADER_CELL, textAlign: 'right' }}>Value</span>
        </div>

        {deals.map(deal => {
          const orgName = deal.organization?.name ?? 'Unknown';
          const schoolName = deal.organization?.school?.name ?? '';
          const lastActivity = deal.last_touched ?? deal.updated_at;
          const days = daysSince(lastActivity);

          return (
            <button
              key={deal.id}
              type="button"
              onClick={() => onOpenDeal(deal)}
              style={{
                display: 'grid',
                gridTemplateColumns: DEALS_LIST_GRID_COLUMNS,
                gap: '12px',
                alignItems: 'center',
                width: '100%',
                padding: '12px 0',
                border: 'none',
                borderBottom: '1px solid #F3F4F6',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {orgName}
                </div>
                {schoolName && (
                  <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {schoolName}
                  </div>
                )}
              </div>
              <StageBadge stage={deal.stage} />
              <RepBadge rep={deal.assigned_to} employees={employees} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: activityColor(lastActivity), textAlign: 'right' }}>
                {days === null ? '—' : `${days}d`}
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: deal.value > 0 ? '#374151' : '#9CA3AF', textAlign: 'right' }}>
                {deal.value > 0 ? fmt$(deal.value) : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
            Showing {start}–{end} of {totalCount}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              style={{
                padding: '6px 12px',
                borderRadius: '9999px',
                border: '1px solid #E5E7EB',
                background: '#fff',
                color: page <= 1 ? '#D1D5DB' : '#374151',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Previous
            </button>
            <span style={{ fontSize: '0.8125rem', color: '#6B7280', minWidth: '88px', textAlign: 'center' }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              style={{
                padding: '6px 12px',
                borderRadius: '9999px',
                border: '1px solid #E5E7EB',
                background: '#fff',
                color: page >= totalPages ? '#D1D5DB' : '#374151',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
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

  const activeStageColor = activeStage !== 'all';

  return (
    <div>
      {/* Stage tabs - horizontal scroll */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, marginBottom: 4 }}>
        <button
          onClick={() => setActiveStage('all')}
          style={{
            padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem',
            fontWeight: activeStage === 'all' ? 700 : 500, cursor: 'pointer',
            border: `1px solid ${activeStage === 'all' ? CRM_UI.ink : CRM_UI.border}`,
            background: activeStage === 'all' ? CRM_UI.ink : '#fff',
            color: activeStage === 'all' ? '#fff' : CRM_UI.textSecondary,
            whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
          }}
        >All ({countByStage.all})</button>
        {PIPELINE_STAGES.map(stage => {
          const isActive = activeStage === stage;
          return (
            <button
              key={stage}
              onClick={() => setActiveStage(stage)}
              style={{
                padding: '6px 12px', borderRadius: 20, fontSize: '0.8rem',
                fontWeight: isActive ? 700 : 500, cursor: 'pointer',
                border: `1px solid ${isActive ? CRM_UI.blue : CRM_UI.border}`,
                background: isActive ? CRM_UI.blueBg : '#fff',
                color: isActive ? CRM_UI.blueDark : CRM_UI.textMuted,
                whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
              }}
            >
              {STAGE_LABELS[stage]}
              {countByStage[stage] > 0 && (
                <span style={{
                  marginLeft: 5, background: isActive ? CRM_UI.blue : CRM_UI.border,
                  color: isActive ? '#fff' : CRM_UI.textMuted,
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
          background: CRM_UI.surfaceMuted, border: `1px solid ${CRM_UI.border}`,
          fontSize: '0.8rem', fontWeight: 600, color: CRM_UI.textSecondary,
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

  // Must be declared before any conditional returns (Rules of Hooks)
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

  if (isMobile) {
    return <MobilePipelineView deals={deals} archivedDeals={archivedDeals} onOpenDeal={onOpenDeal} employees={employees} />;
  }

  return (
    <div>
      <div
        style={{
          maxHeight: BOARD_MAX_HEIGHT,
          overflow: 'auto',
          border: `1px solid ${CRM_UI.border}`,
          borderRadius: 12,
          background: '#fff',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, minmax(180px, 1fr))`,
            gap: 12,
            padding: 12,
            minWidth: PIPELINE_STAGES.length * 192,
            alignItems: 'start',
          }}
        >
        {PIPELINE_STAGES.map(stage => {
          const stageDeals = byStage[stage];
          return (
            <div key={stage} style={{ minWidth: 180, display: 'flex', flexDirection: 'column', maxHeight: 'calc(70vh - 160px)' }}>
              {/* Column header */}
              <div style={{
                padding: '8px 12px', borderRadius: '10px 10px 0 0',
                background: CRM_UI.surfaceMuted, border: `1px solid ${CRM_UI.border}`,
                borderBottom: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0,
                position: 'sticky',
                top: 0,
                zIndex: 1,
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: CRM_UI.textSecondary }}>{STAGE_LABELS[stage]}</span>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 600, padding: '1px 7px', borderRadius: '9999px',
                  background: CRM_UI.border, color: CRM_UI.textMuted,
                }}>
                  {stageDeals.length}
                </span>
              </div>
              {/* Cards */}
              <div style={{
                border: `1px solid ${CRM_UI.border}`, borderRadius: '0 0 10px 10px',
                background: CRM_UI.surface, padding: '8px', display: 'flex',
                flexDirection: 'column', gap: 8, minHeight: 80,
                flex: 1,
                overflowY: 'auto',
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

interface SalesCRMProps {
  conferenceFilter?: string | null;
  onConferenceFilterChange?: (conference: string | null) => void;
}

export function SalesCRM({
  conferenceFilter = null,
  onConferenceFilterChange,
}: SalesCRMProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const [deals, setDeals] = useState<PipelineDealFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [stageFilter, setStageFilter] = useState<DealStage | 'all'>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(false);
  const [dealPage, setDealPage] = useState(1);
  const [idleSort, setIdleSort] = useState<IdleSort>('desc');
  const [pipelineView, setPipelineView] = useState<'list' | 'board'>('list');
  const dealsSectionRef = useRef<HTMLDivElement>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [startHereDismissed, setStartHereDismissed] = useState(false);
  const [queueSkipIds, setQueueSkipIds] = useState<string[]>([]);
  const [showFollowUpQueue, setShowFollowUpQueue] = useState(false);

  const openDealPage = useCallback((deal: PipelineDealFull) => {
    router.push(`/nucleus/war-room/deals/${deal.id}`);
  }, [router]);

  useEffect(() => {
    try {
      setStartHereDismissed(localStorage.getItem(START_HERE_DISMISS_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const myFirstName = useMemo(() => {
    const fromProfile = profile?.name?.trim().split(/\s+/)[0] ?? '';
    if (fromProfile) return fromProfile;
    return null;
  }, [profile?.name]);

  const isMyDeal = useCallback((deal: PipelineDealFull) => {
    if (!myFirstName && !profile?.id) return false;
    const repName = resolveRep(deal.assigned_to, employees);
    if (myFirstName && repName && repName.toLowerCase() === myFirstName.toLowerCase()) return true;
    if (profile?.id && deal.assigned_to && deal.assigned_to.toLowerCase() === profile.id.toLowerCase()) return true;
    return false;
  }, [employees, myFirstName, profile?.id]);

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
    patchDeal(dealId, { notes: notesJson, last_touched: now });
  }

  function handleSnoozeDeal(dealId: string) {
    const now = new Date().toISOString();
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, last_touched: now } : d));
    patchDeal(dealId, { last_touched: now });
  }

  function handleSetStage(dealId: string, stage: DealStage) {
    const now = new Date().toISOString();
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage, last_touched: now } : d));
    patchDeal(dealId, { stage, last_touched: now });
  }

  // ── Filters ──
  const { visibleDeals, archivedDeals, filteredDeals } = useMemo(() => {
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
    let visible = list.filter(d => d.stage !== 'closed_lost' && d.stage !== 'hold_off');

    if (stageFilter !== 'all') {
      visible = visible.filter(d => d.stage === stageFilter);
    }
    if (ownerFilter !== 'all') {
      visible = visible.filter(d => resolveRep(d.assigned_to, employees) === ownerFilter);
    }
    if (needsAttentionOnly) {
      visible = visible.filter(dealNeedsAttention);
    }
    if (conferenceFilter) {
      visible = visible.filter(d => getDealConference(d) === conferenceFilter);
    }

    return { visibleDeals: visible, archivedDeals: archived, filteredDeals: visible };
  }, [deals, search, stageFilter, ownerFilter, needsAttentionOnly, conferenceFilter, employees]);

  const sortedFilteredDeals = useMemo(() => {
    const sorted = [...filteredDeals];
    sorted.sort((a, b) => {
      const diff = dealIdleDays(b) - dealIdleDays(a);
      return idleSort === 'desc' ? diff : -diff;
    });
    return sorted;
  }, [filteredDeals, idleSort]);

  const totalDealPages = Math.max(1, Math.ceil(sortedFilteredDeals.length / DEALS_PAGE_SIZE));
  const safeDealPage = Math.min(dealPage, totalDealPages);
  const paginatedDeals = sortedFilteredDeals.slice(
    (safeDealPage - 1) * DEALS_PAGE_SIZE,
    safeDealPage * DEALS_PAGE_SIZE,
  );

  useEffect(() => {
    setDealPage(1);
  }, [search, stageFilter, ownerFilter, needsAttentionOnly, categoryFilter, idleSort, conferenceFilter]);

  useEffect(() => {
    if (!conferenceFilter) return;
    setPipelineView('list');
    requestAnimationFrame(() => {
      dealsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [conferenceFilter]);

  useEffect(() => {
    if (dealPage > totalDealPages) setDealPage(totalDealPages);
  }, [dealPage, totalDealPages]);

  const focusDealsSection = useCallback(() => {
    setNeedsAttentionOnly(true);
    setDealPage(1);
    setPipelineView('list');
    requestAnimationFrame(() => {
      dealsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const actionQueue = useMemo(() => {
    const stalled = deals
      .filter(dealNeedsAttention)
      .sort((a, b) => dealIdleDays(b) - dealIdleDays(a));
    const mine = stalled.filter(isMyDeal);
    const base = mine.length > 0 ? mine : stalled;
    return base.filter(d => !queueSkipIds.includes(d.id));
  }, [deals, isMyDeal, queueSkipIds]);

  const nextActionDeal = actionQueue[0] ?? null;

  useEffect(() => {
    setQueueSkipIds(prev => prev.filter(id => deals.some(d => d.id === id && dealNeedsAttention(d))));
  }, [deals]);

  const dismissStartHere = useCallback(() => {
    setStartHereDismissed(true);
    try { localStorage.setItem(START_HERE_DISMISS_KEY, '1'); } catch { /* ignore */ }
  }, []);

  const restoreStartHere = useCallback(() => {
    setStartHereDismissed(false);
    try { localStorage.removeItem(START_HERE_DISMISS_KEY); } catch { /* ignore */ }
  }, []);

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

  if (showFollowUpQueue) {
    return (
      <FollowUpQueueView
        deals={actionQueue}
        employees={employees}
        onBack={() => setShowFollowUpQueue(false)}
        onLogFollowup={handleLogActivity}
        onSnooze={handleSnoozeDeal}
        onSetStage={handleSetStage}
        onOpenDeal={openDealPage}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* REVIEW FLAG: NextActionBar — single next step */}
      <NextActionBar
        deal={nextActionDeal}
        queueCount={actionQueue.length}
        employees={employees}
        onLogFollowup={handleLogActivity}
        onOpenDeal={openDealPage}
        onOpenFollowUpQueue={() => setShowFollowUpQueue(true)}
        dismissed={startHereDismissed}
        onDismiss={dismissStartHere}
        onRestore={restoreStartHere}
      />

      {/* ── Stats Row (compact one-line) ── */}
      <p style={{ margin: 0, fontSize: '0.8125rem', color: CRM_UI.textMuted }}>
        {stats.total} active · {stats.hot} hot · {stats.closed} won · {fmt$(stats.pipeline)} pipeline
      </p>

      {/* ── Search & Filters ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '1 1 auto',
            minWidth: isMobile ? '100%' : 240,
            height: TOOLBAR_CONTROL_HEIGHT,
            padding: '0 12px',
            boxSizing: 'border-box',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '9999px',
          }}>
            <Search size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search org, school, contact…"
              style={{
                border: 'none',
                outline: 'none',
                fontSize: '0.8125rem',
                lineHeight: 1,
                height: '100%',
                padding: 0,
                margin: 0,
                fontFamily: 'inherit',
                flex: 1,
                color: '#374151',
                background: 'transparent',
                minWidth: 0,
              }}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
          {!isMobile && (
            <>
              <button
                type="button"
                onClick={fetchDeals}
                style={{
                  ...TOOLBAR_BUTTON,
                  border: '1px solid #e5e7eb',
                  background: '#fff',
                  color: '#6b7280',
                }}
              >
                <RefreshCw size={13} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowCreateDrawer(true)}
                style={{
                  ...TOOLBAR_BUTTON,
                  padding: '0 14px',
                  border: 'none',
                  background: '#0F172A',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                <Plus size={13} /> New Deal
              </button>
            </>
          )}
        </div>

        {isMobile && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={fetchDeals} style={{ ...TOOLBAR_BUTTON, width: TOOLBAR_CONTROL_HEIGHT, padding: 0, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280' }}>
              <RefreshCw size={13} />
            </button>
            <button type="button" onClick={() => setShowCreateDrawer(true)} style={{ ...TOOLBAR_BUTTON, flex: 1, border: 'none', background: '#0F172A', color: '#fff', fontWeight: 600 }}>
              <Plus size={14} /> New Deal
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value as CategoryFilter)}
            aria-label="Filter by category"
            style={TOOLBAR_SELECT}
          >
            {CATEGORY_FILTERS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.value === 'all' ? 'All categories' : opt.label}
              </option>
            ))}
          </select>

          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value as DealStage | 'all')}
            aria-label="Filter by stage"
            style={TOOLBAR_SELECT}
          >
            <option value="all">All stages</option>
            {PIPELINE_STAGES.map(stage => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>

          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            aria-label="Filter by owner"
            style={TOOLBAR_SELECT}
          >
            <option value="all">All owners</option>
            {REP_OPTIONS.map(rep => (
              <option key={rep} value={rep}>{rep}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setNeedsAttentionOnly(v => !v)}
            style={{
              ...TOOLBAR_BUTTON,
              border: `1px solid ${needsAttentionOnly ? CRM_UI.blue : CRM_UI.border}`,
              background: needsAttentionOnly ? CRM_UI.blueBg : '#fff',
              color: needsAttentionOnly ? CRM_UI.blueDark : CRM_UI.textSecondary,
              fontWeight: needsAttentionOnly ? 600 : 500,
            }}
          >
            Needs attention
          </button>

          {conferenceFilter && (
            <button
              type="button"
              onClick={() => onConferenceFilterChange?.(null)}
              style={{
                ...TOOLBAR_BUTTON,
                border: `1px solid ${CRM_UI.blue}`,
                background: CRM_UI.blueBg,
                color: CRM_UI.blueDark,
                fontWeight: 600,
              }}
            >
              {conferenceFilter}
              <X size={12} />
            </button>
          )}

          {(search || stageFilter !== 'all' || ownerFilter !== 'all' || needsAttentionOnly || categoryFilter !== 'all' || conferenceFilter) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStageFilter('all');
                setOwnerFilter('all');
                setNeedsAttentionOnly(false);
                setCategoryFilter('all');
                onConferenceFilterChange?.(null);
              }}
              style={{
                ...TOOLBAR_BUTTON,
                border: '1px solid #e5e7eb',
                background: '#fff',
                color: '#6b7280',
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ── Needs Attention (only if next-step helper is hidden) ── */}
      {startHereDismissed && (
        <NeedsAttentionSection
          deals={deals}
          onOpenDeal={openDealPage}
          onLogFollowup={handleLogActivity}
          employees={employees}
          onViewAll={focusDealsSection}
        />
      )}

      {/* ── All Deals ── */}
      <div ref={dealsSectionRef} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>All Deals</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#6B7280' }}>
              {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''} matching your filters
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setPipelineView('list')}
              style={{
                padding: '6px 12px',
                borderRadius: '9999px',
                border: `1px solid ${pipelineView === 'list' ? '#0F172A' : '#e5e7eb'}`,
                background: pipelineView === 'list' ? '#0F172A' : '#fff',
                color: pipelineView === 'list' ? '#fff' : '#374151',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setPipelineView('board')}
              style={{
                padding: '6px 12px',
                borderRadius: '9999px',
                border: `1px solid ${pipelineView === 'board' ? '#0F172A' : '#e5e7eb'}`,
                background: pipelineView === 'board' ? '#0F172A' : '#fff',
                color: pipelineView === 'board' ? '#fff' : '#374151',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Board
            </button>
          </div>
        </div>

        {deals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', fontSize: '0.875rem' }}>
            No deals in pipeline yet
          </div>
        ) : pipelineView === 'list' ? (
          <AllDealsList
            deals={paginatedDeals}
            totalCount={sortedFilteredDeals.length}
            page={safeDealPage}
            pageSize={DEALS_PAGE_SIZE}
            idleSort={idleSort}
            onIdleSortChange={setIdleSort}
            onPageChange={setDealPage}
            onOpenDeal={openDealPage}
            employees={employees}
          />
        ) : (
          <PipelineKanban
            deals={filteredDeals}
            archivedDeals={archivedDeals}
            onOpenDeal={openDealPage}
            employees={employees}
          />
        )}
      </div>

      {/* ── Create Deal Drawer (new deals only) ── */}
      {showCreateDrawer && (
        <CreateDealDrawer
          onClose={() => setShowCreateDrawer(false)}
          onCreated={fetchDeals}
          employees={employees}
        />
      )}
    </div>
  );
}
