'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowLeft, Plus, Search, X, CheckCircle2, Trash2, Check,
  Target, RefreshCw, Mail, MessageSquare, Instagram, Phone,
  ChevronDown, ChevronUp, Building2, Users, TrendingUp,
  Upload, Filter, AlertCircle, Zap, Calendar,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProspectStatus =
  | 'not_contacted' | 'contacted' | 'replied'
  | 'demo_booked' | 'demo_completed' | 'negotiating'
  | 'closed_won' | 'closed_lost' | 'hold_off';

export interface CampaignProspect {
  id: string;
  campaignId: string;
  orgName: string;
  school: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactIg: string;
  channel: 'email' | 'ig_dm' | 'imessage' | 'call' | 'text' | '';
  status: ProspectStatus;
  outreachDate: string | null;
  lastActivityDate: string | null;
  assignedTo: string;
  notes: string;
  dealId: string | null;
  createdAt: string;
}

type CampaignType = 'founder_led' | 'intern_led' | 'instagram' | 'ambassador' | 'marketing';
type CampaignStatus = 'active' | 'paused' | 'completed';
type OutreachMethod = 'email' | 'text' | 'instagram_dm';

interface CampaignRow {
  id: string;
  chapterName: string;
  orgId?: string;
  status: 'not_contacted' | 'contacted' | 'demo_booked' | 'signed';
  method: OutreachMethod;
  contactName: string;
  contactInfo: string;
  sourceUrl: string;
  meetingBooked: boolean;
  dealId?: string;
  notes?: string;
}

interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  school: string;
  schoolId?: string;
  status: CampaignStatus;
  rows: CampaignRow[];
  updatedAt: string;
}

interface PipelineStats {
  recentDeals?: any[];
  [key: string]: any;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'campaign_prospects_v1';

const STATUS_CONFIG: Record<ProspectStatus, { label: string; color: string; bg: string; italic?: boolean }> = {
  not_contacted:  { label: 'Not Contacted',  color: '#6b7280', bg: '#f3f4f6' },
  contacted:      { label: 'Contacted',      color: '#1d4ed8', bg: '#eff6ff' },
  replied:        { label: 'Replied',        color: '#059669', bg: '#ecfdf5' },
  demo_booked:    { label: 'Demo Booked',    color: '#d97706', bg: '#fef3c7' },
  demo_completed: { label: 'Demo Done',      color: '#b45309', bg: '#fef9f0' },
  negotiating:    { label: 'Negotiating',    color: '#7c3aed', bg: '#f5f3ff' },
  closed_won:     { label: 'Closed Won',     color: '#065f46', bg: '#d1fae5' },
  closed_lost:    { label: 'Closed Lost',    color: '#dc2626', bg: '#fee2e2' },
  hold_off:       { label: 'Hold Off',       color: '#9ca3af', bg: '#f9fafb', italic: true },
};

const STATUS_ORDER: ProspectStatus[] = [
  'not_contacted', 'contacted', 'replied',
  'demo_booked', 'demo_completed', 'negotiating',
  'closed_won', 'closed_lost', 'hold_off',
];

const CONVERT_STATUSES: Set<ProspectStatus> = new Set([
  'demo_booked', 'demo_completed', 'negotiating', 'closed_won',
]);

const STATUS_TO_STAGE: Record<ProspectStatus, string> = {
  not_contacted:  'lead',
  contacted:      'lead',
  replied:        'lead',
  demo_booked:    'demo_booked',
  demo_completed: 'first_demo',
  negotiating:    'second_call',
  closed_won:     'closed_won',
  closed_lost:    'closed_lost',
  hold_off:       'lead',
};

const CHANNEL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  email:    { label: 'Email',    color: '#1d4ed8', bg: '#eff6ff' },
  ig_dm:    { label: 'IG DM',   color: '#be185d', bg: '#fdf2f8' },
  imessage: { label: 'iMessage', color: '#059669', bg: '#ecfdf5' },
  call:     { label: 'Call',     color: '#7c3aed', bg: '#f5f3ff' },
  text:     { label: 'Text',     color: '#374151', bg: '#f3f4f6' },
  '':       { label: '—',       color: '#9ca3af', bg: '#f9fafb' },
};

const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  founder_led: 'Founder-Led',
  intern_led:  'Intern-Led',
  instagram:   'Instagram',
  ambassador:  'Ambassador',
  marketing:   'Marketing',
};

const CAMPAIGN_TYPE_BADGE: Record<CampaignType, { color: string; bg: string }> = {
  founder_led: { color: '#7c3aed', bg: '#f5f3ff' },
  intern_led:  { color: '#1d4ed8', bg: '#eff6ff' },
  instagram:   { color: '#be185d', bg: '#fdf2f8' },
  ambassador:  { color: '#b45309', bg: '#fffbeb' },
  marketing:   { color: '#065f46', bg: '#ecfdf5' },
};

const REPS = ['Owen', 'Ford', 'Adam', 'Katie', 'Hyatt'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function loadProspects(): CampaignProspect[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CampaignProspect[]) : [];
  } catch { return []; }
}

function saveProspects(prospects: CampaignProspect[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS_KEY, JSON.stringify(prospects));
}

interface ProspectStats {
  total: number;
  contacted: number;
  replied: number;
  demos: number;
  closed: number;
}

function computeStats(prospects: CampaignProspect[]): ProspectStats {
  const total = prospects.length;
  const contacted = prospects.filter(p =>
    p.status !== 'not_contacted' && p.status !== 'hold_off' && p.status !== 'closed_lost'
  ).length;
  const replied = prospects.filter(p =>
    ['replied', 'demo_booked', 'demo_completed', 'negotiating', 'closed_won'].includes(p.status)
  ).length;
  const demos = prospects.filter(p =>
    ['demo_booked', 'demo_completed', 'negotiating', 'closed_won'].includes(p.status)
  ).length;
  const closed = prospects.filter(p => p.status === 'closed_won').length;
  return { total, contacted, replied, demos, closed };
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Funnel Bar ───────────────────────────────────────────────────────────────

function FunnelBar({ total, contacted, replied, demos, closed }: ProspectStats) {
  if (total === 0) return <div style={{ height: '6px', background: '#f3f4f6', borderRadius: 9999 }} />;
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  return (
    <div style={{ position: 'relative', height: '6px', background: '#f3f4f6', borderRadius: 9999, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, width: pct(contacted), background: '#93c5fd', transition: 'width 0.4s' }} />
      <div style={{ position: 'absolute', inset: 0, width: pct(replied),   background: '#6ee7b7', transition: 'width 0.4s' }} />
      <div style={{ position: 'absolute', inset: 0, width: pct(demos),     background: '#fcd34d', transition: 'width 0.4s' }} />
      <div style={{ position: 'absolute', inset: 0, width: pct(closed),    background: '#10b981', transition: 'width 0.4s' }} />
    </div>
  );
}

// ─── Stats Dashboard (top of detail view) ────────────────────────────────────

function StatsDashboard({ prospects }: { prospects: CampaignProspect[] }) {
  const stats = computeStats(prospects);
  const { total, contacted, replied, demos, closed } = stats;
  const pct = (n: number) => total > 0 ? ` (${Math.round((n / total) * 100)}%)` : '';

  return (
    <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total',      value: String(total),               color: '#111827' },
          { label: 'Contacted',  value: `${contacted}${pct(contacted)}`, color: '#1d4ed8' },
          { label: 'Replied',    value: `${replied}${pct(replied)}`,   color: '#059669' },
          { label: 'Demos',      value: `${demos}${pct(demos)}`,       color: '#d97706' },
          { label: 'Closed Won', value: `${closed}${pct(closed)}`,     color: '#065f46' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', margin: '4px 0 0' }}>{s.label}</p>
          </div>
        ))}
      </div>
      <FunnelBar {...stats} />
      <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Contacted', color: '#93c5fd' },
          { label: 'Replied',   color: '#6ee7b7' },
          { label: 'Demo',      color: '#fcd34d' },
          { label: 'Closed',    color: '#10b981' },
        ].map(l => (
          <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.7rem', color: '#9CA3AF' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />{l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Status Select ────────────────────────────────────────────────────────────

function StatusSelect({ value, onChange }: { value: ProspectStatus; onChange: (v: ProspectStatus) => void }) {
  const cfg = STATUS_CONFIG[value];
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value as ProspectStatus)}
        style={{
          appearance: 'none',
          border: `1px solid ${cfg.color}40`,
          borderRadius: 8,
          padding: '3px 22px 3px 8px',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: cfg.color,
          background: cfg.bg,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontStyle: cfg.italic ? 'italic' : 'normal',
          outline: 'none',
          minWidth: 110,
        }}
      >
        {STATUS_ORDER.map(s => (
          <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
        ))}
      </select>
      <ChevronDown size={10} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', color: cfg.color, pointerEvents: 'none' }} />
    </div>
  );
}

// ─── Channel Pill ─────────────────────────────────────────────────────────────

function ChannelPill({ channel }: { channel: string }) {
  const cfg = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG[''];
  const Icon = channel === 'email' ? Mail : channel === 'ig_dm' ? Instagram : channel === 'call' ? Phone : MessageSquare;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.68rem', fontWeight: 500, padding: '2px 7px', borderRadius: 9999, color: cfg.color, background: cfg.bg }}>
      {channel ? <Icon size={9} /> : null}{cfg.label}
    </span>
  );
}

// ─── Prospect Row ─────────────────────────────────────────────────────────────

interface ProspectRowProps {
  prospect: CampaignProspect;
  onUpdate: (id: string, updates: Partial<CampaignProspect>) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string) => void;
  converting: boolean;
}

function ProspectRow({ prospect, onUpdate, onDelete, onConvert, converting }: ProspectRowProps) {
  const [showNotes, setShowNotes] = useState(false);
  const cfg = STATUS_CONFIG[prospect.status];
  const showConvert = CONVERT_STATUSES.has(prospect.status) && !prospect.dealId;

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid #F3F4F6', background: '#ffffff' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
        onMouseLeave={e => (e.currentTarget.style.background = '#ffffff')}
      >
        {/* Org name */}
        <td style={{ padding: '8px 12px', minWidth: 140, maxWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={12} color="#9ca3af" style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {prospect.orgName || '—'}
            </span>
          </div>
        </td>

        {/* Contact info */}
        <td style={{ padding: '8px 12px', minWidth: 160 }}>
          <div style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 500 }}>{prospect.contactName || '—'}</div>
          {prospect.contactEmail && <div style={{ fontSize: '0.72rem', color: '#6B7280' }}>{prospect.contactEmail}</div>}
          {prospect.contactPhone && <div style={{ fontSize: '0.72rem', color: '#6B7280' }}>{prospect.contactPhone}</div>}
          {prospect.contactIg    && <div style={{ fontSize: '0.72rem', color: '#be185d' }}>@{prospect.contactIg}</div>}
        </td>

        {/* Channel */}
        <td style={{ padding: '8px 12px' }}>
          <select
            value={prospect.channel}
            onChange={e => onUpdate(prospect.id, { channel: e.target.value as CampaignProspect['channel'], lastActivityDate: todayISO() })}
            style={{ background: 'transparent', border: 'none', fontSize: '0.75rem', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', color: CHANNEL_CONFIG[prospect.channel]?.color ?? '#9ca3af' }}
          >
            <option value="">—</option>
            <option value="email">Email</option>
            <option value="ig_dm">IG DM</option>
            <option value="imessage">iMessage</option>
            <option value="call">Call</option>
            <option value="text">Text</option>
          </select>
        </td>

        {/* Status */}
        <td style={{ padding: '8px 12px' }}>
          <StatusSelect value={prospect.status} onChange={v => onUpdate(prospect.id, { status: v, lastActivityDate: todayISO() })} />
        </td>

        {/* Outreach date */}
        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
          <input
            type="date"
            value={prospect.outreachDate ?? ''}
            onChange={e => onUpdate(prospect.id, { outreachDate: e.target.value || null })}
            style={{ background: 'transparent', border: 'none', fontSize: '0.75rem', outline: 'none', fontFamily: 'inherit', color: '#6B7280', cursor: 'pointer', width: 110 }}
          />
        </td>

        {/* Last activity */}
        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{fmtDate(prospect.lastActivityDate)}</span>
        </td>

        {/* Assigned to */}
        <td style={{ padding: '8px 12px' }}>
          <select
            value={prospect.assignedTo}
            onChange={e => onUpdate(prospect.id, { assignedTo: e.target.value })}
            style={{ background: 'transparent', border: 'none', fontSize: '0.75rem', outline: 'none', fontFamily: 'inherit', cursor: 'pointer', color: '#374151' }}
          >
            <option value="">—</option>
            {REPS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </td>

        {/* Notes toggle */}
        <td style={{ padding: '8px 12px' }}>
          <button
            onClick={() => setShowNotes(s => !s)}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer', color: '#6B7280', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 3 }}
          >
            Notes {showNotes ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          </button>
        </td>

        {/* Actions */}
        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {prospect.dealId ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.7rem', fontWeight: 600, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 9999 }}>
                <CheckCircle2 size={10} /> Deal Created
              </span>
            ) : showConvert ? (
              <button
                onClick={() => onConvert(prospect.id)}
                disabled={converting}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: converting ? '#d1fae5' : '#10b981', color: '#ffffff', border: 'none', cursor: converting ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
              >
                <Zap size={10} />{converting ? 'Creating…' : 'Convert to Deal'}
              </button>
            ) : null}
            <button
              onClick={() => onDelete(prospect.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 2, display: 'flex', alignItems: 'center' }}
              title="Delete prospect"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </td>
      </tr>

      {/* Notes expansion row */}
      {showNotes && (
        <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #F3F4F6' }}>
          <td colSpan={9} style={{ padding: '8px 12px 12px' }}>
            <textarea
              value={prospect.notes}
              onChange={e => onUpdate(prospect.id, { notes: e.target.value })}
              placeholder="Add notes…"
              rows={2}
              style={{ width: '100%', fontSize: '0.8125rem', border: '1px solid #E5E7EB', borderRadius: 8, padding: '8px 10px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', color: '#374151', background: '#ffffff', boxSizing: 'border-box' }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Add Prospect Drawer ──────────────────────────────────────────────────────

interface AddProspectDrawerProps {
  campaign: Campaign;
  onClose: () => void;
  onAdd: (prospect: CampaignProspect) => void;
}

function AddProspectDrawer({ campaign, onClose, onAdd }: AddProspectDrawerProps) {
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactIg, setContactIg] = useState('');
  const [channel, setChannel] = useState<CampaignProspect['channel']>('');
  const [assignedTo, setAssignedTo] = useState('');

  function handleAdd() {
    if (!orgName.trim()) return;
    const p: CampaignProspect = {
      id: uid(),
      campaignId: campaign.id,
      orgName: orgName.trim(),
      school: campaign.school,
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      contactIg: contactIg.trim().replace('@', ''),
      channel,
      status: 'not_contacted',
      outreachDate: null,
      lastActivityDate: null,
      assignedTo,
      notes: '',
      dealId: null,
      createdAt: new Date().toISOString(),
    };
    onAdd(p);
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #E5E7EB', borderRadius: 12,
    padding: '10px 12px', fontSize: '0.875rem', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box', color: '#374151',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.72rem', fontWeight: 600,
    color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ width: 420, background: '#ffffff', display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #E5E7EB' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
          <div>
            <h2 style={{ fontWeight: 700, color: '#111827', fontSize: '1rem', margin: 0 }}>Add Prospect</h2>
            <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2, margin: '2px 0 0' }}>{campaign.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Org / Chapter Name *</label>
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. Sigma Chi" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>School</label>
            <input value={campaign.school} disabled style={{ ...inputStyle, background: '#F9FAFB', color: '#9ca3af' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Contact Name</label>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Full name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="email@…" type="email" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+1 555…" type="tel" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Instagram</label>
              <input value={contactIg} onChange={e => setContactIg(e.target.value)} placeholder="@handle" style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Channel</label>
            <select value={channel} onChange={e => setChannel(e.target.value as CampaignProspect['channel'])}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Select channel</option>
              <option value="email">Email</option>
              <option value="ig_dm">IG DM</option>
              <option value="imessage">iMessage</option>
              <option value="call">Call</option>
              <option value="text">Text</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Assigned To</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">Unassigned</option>
              {REPS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#374151', border: '1px solid #E5E7EB', borderRadius: 12, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!orgName.trim()}
            className="module-primary-btn"
            style={{ flex: 1, justifyContent: 'center', borderRadius: 12, padding: '10px', opacity: orgName.trim() ? 1 : 0.5 }}
          >
            Add Prospect
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Prospects Modal ───────────────────────────────────────────────────

interface ImportProspectsModalProps {
  campaign: Campaign;
  onClose: () => void;
  onImport: (prospects: CampaignProspect[]) => void;
}

function ImportProspectsModal({ campaign, onClose, onImport }: ImportProspectsModalProps) {
  const [text, setText] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const lines = text.trim().split('\n').filter(l => l.trim());

  function handleImport() {
    if (!lines.length) return;
    const prospects: CampaignProspect[] = lines.map(line => ({
      id: uid(),
      campaignId: campaign.id,
      orgName: line.trim(),
      school: campaign.school,
      contactName: '',
      contactEmail: '',
      contactPhone: '',
      contactIg: '',
      channel: '',
      status: 'not_contacted',
      outreachDate: null,
      lastActivityDate: null,
      assignedTo,
      notes: '',
      dealId: null,
      createdAt: new Date().toISOString(),
    }));
    onImport(prospects);
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: '#ffffff', borderRadius: 16, width: 480, maxWidth: '90vw', display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden', border: '1px solid #E5E7EB' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
          <div>
            <h2 style={{ fontWeight: 700, color: '#111827', fontSize: '1rem', margin: 0 }}>Import Prospects</h2>
            <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: '2px 0 0' }}>One org per line — creates prospects with "Not Contacted" status</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 24, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Org / Chapter List
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={'Sigma Chi\nDelta Tau Delta\nKappa Sigma\nPhi Kappa Theta\n…'}
              rows={10}
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', color: '#374151' }}
            />
            {lines.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={12} />{lines.length} org{lines.length !== 1 ? 's' : ''} detected
              </p>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Assign All To
            </label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}>
              <option value="">Unassigned</option>
              {REPS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#374151', border: '1px solid #E5E7EB', borderRadius: 12, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={lines.length === 0}
            className="module-primary-btn"
            style={{ flex: 1, justifyContent: 'center', borderRadius: 12, padding: '10px', opacity: lines.length > 0 ? 1 : 0.5 }}
          >
            <Upload size={14} /> Import {lines.length > 0 ? lines.length : ''} Prospects
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Detail View ─────────────────────────────────────────────────────

interface CampaignDetailViewProps {
  campaign: Campaign;
  prospects: CampaignProspect[];
  onBack: () => void;
  onUpdateProspect: (id: string, updates: Partial<CampaignProspect>) => void;
  onDeleteProspect: (id: string) => void;
  onAddProspect: (prospect: CampaignProspect) => void;
  onImportProspects: (prospects: CampaignProspect[]) => void;
  onConvertToDeal: (prospectId: string) => Promise<void>;
  convertingId: string | null;
}

function CampaignDetailView({
  campaign, prospects, onBack, onUpdateProspect, onDeleteProspect,
  onAddProspect, onImportProspects, onConvertToDeal, convertingId,
}: CampaignDetailViewProps) {
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const typeBadge = CAMPAIGN_TYPE_BADGE[campaign.type];

  const filtered = useMemo(() => {
    let list = prospects;
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (channelFilter !== 'all') list = list.filter(p => p.channel === channelFilter);
    if (assignedFilter !== 'all') list = list.filter(p => p.assignedTo === assignedFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.orgName.toLowerCase().includes(q) ||
        p.contactName.toLowerCase().includes(q) ||
        p.contactEmail.toLowerCase().includes(q)
      );
    }
    return list;
  }, [prospects, statusFilter, channelFilter, assignedFilter, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <button
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', fontWeight: 500, color: '#6B7280', background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, marginTop: 2 }}
        >
          <ArrowLeft size={14} /> Campaigns
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0 }}>{campaign.name}</h2>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 9px', borderRadius: 9999, color: typeBadge.color, background: typeBadge.bg }}>
              {CAMPAIGN_TYPE_LABELS[campaign.type]}
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
              color: campaign.status === 'active' ? '#065f46' : campaign.status === 'paused' ? '#b45309' : '#6b7280',
              background: campaign.status === 'active' ? '#d1fae5' : campaign.status === 'paused' ? '#fef3c7' : '#f3f4f6',
            }}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </span>
          </div>
          {campaign.school && <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: '4px 0 0' }}>{campaign.school}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowImportModal(true)}
            className="module-filter-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}
          >
            <Upload size={14} /> Import Prospects
          </button>
          <button
            onClick={() => setShowAddDrawer(true)}
            className="module-primary-btn"
            style={{ borderRadius: 10 }}
          >
            <Plus size={14} /> Add Prospect
          </button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <StatsDashboard prospects={prospects} />

      {/* Filter bar */}
      <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="module-search" style={{ flex: '1 1 180px', minWidth: 140 }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Search prospects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><X size={12} /></button>}
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem', background: '#ffffff', outline: 'none', fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}>
          <option value="all">All Statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
        </select>
        <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
          style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem', background: '#ffffff', outline: 'none', fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}>
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="ig_dm">IG DM</option>
          <option value="imessage">iMessage</option>
          <option value="call">Call</option>
          <option value="text">Text</option>
        </select>
        <select value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)}
          style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem', background: '#ffffff', outline: 'none', fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}>
          <option value="all">All Reps</option>
          {REPS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: 'auto' }}>
          {filtered.length} of {prospects.length}
        </span>
      </div>

      {/* Prospect Table */}
      {filtered.length === 0 ? (
        <div className="module-table-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 20px', gap: 16 }}>
          <Users size={32} color="#e5e7eb" />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, color: '#6B7280', margin: 0 }}>
              {prospects.length === 0 ? 'No prospects yet' : 'No results for these filters'}
            </p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: 4 }}>
              {prospects.length === 0 ? 'Add your first prospect or import a list' : 'Try clearing filters'}
            </p>
          </div>
          {prospects.length === 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowImportModal(true)} className="module-filter-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Upload size={13} /> Import
              </button>
              <button onClick={() => setShowAddDrawer(true)} className="module-primary-btn" style={{ borderRadius: 10 }}>
                <Plus size={13} /> Add Prospect
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="module-table-container" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                {['Org / Chapter', 'Contact', 'Channel', 'Status', 'Outreach Date', 'Last Activity', 'Assigned To', 'Notes', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(prospect => (
                <ProspectRow
                  key={prospect.id}
                  prospect={prospect}
                  onUpdate={onUpdateProspect}
                  onDelete={onDeleteProspect}
                  onConvert={onConvertToDeal}
                  converting={convertingId === prospect.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddDrawer && (
        <AddProspectDrawer campaign={campaign} onClose={() => setShowAddDrawer(false)} onAdd={onAddProspect} />
      )}
      {showImportModal && (
        <ImportProspectsModal campaign={campaign} onClose={() => setShowImportModal(false)} onImport={onImportProspects} />
      )}
    </div>
  );
}

// ─── Campaign List Card (upgraded) ────────────────────────────────────────────

interface CampaignListCardProps {
  campaign: Campaign;
  prospects: CampaignProspect[];
  onClick: () => void;
  onDelete: (id: string) => void;
}

function CampaignListCard({ campaign, prospects, onClick, onDelete }: CampaignListCardProps) {
  const stats = useMemo(() => computeStats(prospects), [prospects]);
  const { total, contacted, replied, demos, closed } = stats;
  const typeBadge = CAMPAIGN_TYPE_BADGE[campaign.type];

  const statusBadge = {
    active:    { label: 'Active',    color: '#065f46', bg: '#d1fae5' },
    paused:    { label: 'Paused',    color: '#b45309', bg: '#fef3c7' },
    completed: { label: 'Completed', color: '#6b7280', bg: '#f3f4f6' },
  }[campaign.status];

  return (
    <div
      className="module-table-container"
      style={{ borderRadius: 14, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onClick={onClick}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      <div style={{ padding: '16px 20px' }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: 9999, background: typeBadge.color, flexShrink: 0, marginTop: 4 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827' }}>{campaign.name}</span>
              {campaign.school && campaign.school !== campaign.name && (
                <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>{campaign.school}</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: typeBadge.color, background: typeBadge.bg }}>
                {CAMPAIGN_TYPE_LABELS[campaign.type]}
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: statusBadge.color, background: statusBadge.bg }}>
                {statusBadge.label}
              </span>
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onDelete(campaign.id); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 4, flexShrink: 0 }}
            title="Delete campaign"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Stats row */}
        {total > 0 && (
          <>
            <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
              {[
                { label: 'Prospects', value: total,     color: '#374151' },
                { label: 'Contacted', value: contacted, color: '#1d4ed8' },
                { label: 'Replied',   value: replied,   color: '#059669' },
                { label: 'Demos',     value: demos,     color: '#d97706' },
                { label: 'Closed',    value: closed,    color: '#065f46' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <FunnelBar {...stats} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                {total > 0 && contacted > 0 ? `${Math.round((contacted / total) * 100)}% contacted` : 'No outreach yet'}
              </span>
            </div>
          </>
        )}

        {total === 0 && (
          <div style={{ padding: '8px 0', fontSize: '0.8125rem', color: '#9ca3af' }}>
            Click to add prospects →
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create Campaign Drawer ───────────────────────────────────────────────────

interface CreateCampaignDrawerProps {
  schools: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (c: Campaign) => void;
}

function CreateCampaignDrawer({ schools, onClose, onCreate }: CreateCampaignDrawerProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CampaignType>('founder_led');
  const [school, setSchool] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [showDrop, setShowDrop] = useState(false);

  const filteredSchools = useMemo(() => {
    if (!schoolQuery.trim()) return schools.slice(0, 8);
    const q = schoolQuery.toLowerCase();
    return schools.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [schools, schoolQuery]);

  function handleSchoolSelect(s: { id: string; name: string }) {
    setSchool(s.name);
    setSchoolId(s.id);
    setSchoolQuery(s.name);
    setShowDrop(false);
    if (!name.trim()) setName(s.name);
  }

  function handleCreate() {
    if (!name.trim()) return;
    const campaign: Campaign = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      name: name.trim(),
      type,
      school: school.trim(),
      schoolId: schoolId || undefined,
      status: 'active',
      rows: [],
      updatedAt: new Date().toISOString(),
    };
    onCreate(campaign);
    onClose();
  }

  const typeOptions: { value: CampaignType; label: string }[] = [
    { value: 'founder_led', label: 'Founder-Led' },
    { value: 'intern_led', label: 'Intern-Led' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'ambassador', label: 'Ambassador' },
    { value: 'marketing', label: 'Marketing' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ width: 420, background: '#ffffff', display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #E5E7EB' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
          <div>
            <h2 style={{ fontWeight: 700, color: '#111827', fontSize: '1rem', margin: 0 }}>New Campaign</h2>
            <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: '2px 0 0' }}>Set up an outreach campaign</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>School</label>
            <input
              type="text"
              value={schoolQuery}
              onChange={e => { setSchoolQuery(e.target.value); setShowDrop(true); if (!e.target.value) { setSchool(''); setSchoolId(''); } }}
              onFocus={() => setShowDrop(true)}
              placeholder="Search school…"
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            {showDrop && filteredSchools.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0, background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.1)', zIndex: 10, overflow: 'hidden' }}>
                {filteredSchools.map(s => (
                  <button key={s.id} onClick={() => handleSchoolSelect(s)}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #F9FAFB', fontFamily: 'inherit', color: '#374151' }}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. TCU - Instagram Outreach"
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  style={{
                    padding: '8px 12px', fontSize: '0.875rem', borderRadius: 12,
                    border: `1px solid ${type === opt.value ? '#0F172A' : '#E5E7EB'}`,
                    background: type === opt.value ? '#0F172A' : '#ffffff',
                    color: type === opt.value ? '#ffffff' : '#374151',
                    fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#374151', border: '1px solid #E5E7EB', borderRadius: 12, background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="module-primary-btn"
            style={{ flex: 1, justifyContent: 'center', borderRadius: 12, padding: '10px', opacity: name.trim() ? 1 : 0.5 }}
          >
            Create Campaign
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main: CampaignCRM ────────────────────────────────────────────────────────

interface CampaignCRMProps {
  stats: PipelineStats | null;
  openDeal?: (deal: any) => void;
}

export function CampaignCRM({ stats, openDeal: _openDeal }: CampaignCRMProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [prospects, setProspects] = useState<CampaignProspect[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [allSchools, setAllSchools] = useState<{ id: string; name: string }[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const seededRef = useRef(false);

  // Load prospects from localStorage on mount
  useEffect(() => {
    setProspects(loadProspects());
  }, []);

  // Fetch campaigns from API
  useEffect(() => {
    fetch('/api/war-room/campaigns')
      .then(r => r.json())
      .then((raw: unknown) => {
        const arr = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
        const data: Campaign[] = arr.map((c: any) => ({
          ...c,
          rows: Array.isArray(c.rows) ? c.rows : [],
          updatedAt: c.updated_at || c.updatedAt || new Date().toISOString(),
        }));
        setCampaigns(data);
        if (data.length > 0) seededRef.current = true;
      })
      .catch(err => console.error('[campaign-crm] fetch error:', err))
      .finally(() => setLoading(false));
  }, []);

  // Fetch schools for create drawer
  useEffect(() => {
    fetch('/api/pipeline/schools')
      .then(r => r.json())
      .then((d: any[]) => {
        if (Array.isArray(d)) {
          setAllSchools(d.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch(err => console.error('[campaign-crm] schools error:', err));
  }, []);

  // ── Power 5 prospect import ──────────────────────────────────────────────
  useEffect(() => {
    if (campaigns.length === 0 || loading) return;
    if (localStorage.getItem('p5_prospects_seeded_v1')) return;
    (async () => {
      try {
        const res = await fetch('/p5-prospects-seed.json');
        if (!res.ok) return;
        const seedData = await res.json();
        const existing = loadProspects();
        const campaignBySchool: Record<string, string> = {};
        campaigns.forEach((c: Campaign) => {
          const name = (c.name || '').toLowerCase().trim();
          campaignBySchool[name] = c.id;
          // Also index by school field if different
          const school = ((c as any).school || '').toLowerCase().trim();
          if (school) campaignBySchool[school] = c.id;
        });
        let added = 0;
        for (const p of seedData) {
          const schoolLower = (p.school || '').toLowerCase().trim();
          let campaignId = campaignBySchool[schoolLower];
          if (!campaignId) {
            for (const [cName, cId] of Object.entries(campaignBySchool)) {
              if (schoolLower.includes(cName) || cName.includes(schoolLower)) {
                campaignId = cId; break;
              }
            }
          }
          if (campaignId && !existing[p.id]) {
            p.campaignId = campaignId;
            existing[p.id] = p;
            added++;
          }
        }
        if (added > 0) {
          localStorage.setItem(LS_KEY, JSON.stringify(existing));
          setProspects({ ...existing });
        }
        localStorage.setItem('p5_prospects_seeded_v1', '1');
        console.log(`[p5-seed] Imported ${added} prospects from Power 5 database`);
      } catch (err) { console.error('[p5-seed]', err); }
    })();
  }, [campaigns, loading]);

  // Auto-seed from pipeline stats if no campaigns
  useEffect(() => {
    if (loading || seededRef.current || !stats?.recentDeals?.length) return;
    seededRef.current = true;

    const seenSchools = new Map<string, { id: string; name: string }>();
    for (const d of (stats.recentDeals ?? [])) {
      const school = d.organization?.school;
      if (school && !seenSchools.has(school.id)) seenSchools.set(school.id, school);
    }

    const seeded: Campaign[] = Array.from(seenSchools.values()).map(school => ({
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      name: school.name,
      type: 'founder_led' as CampaignType,
      school: school.name,
      schoolId: school.id,
      status: 'active' as CampaignStatus,
      rows: (stats.recentDeals ?? [])
        .filter((d: any) => d.organization?.school?.id === school.id)
        .map((d: any) => ({
          id: Math.random().toString(36).slice(2),
          chapterName: d.organization?.name || '',
          orgId: d.organization?.id,
          status: (d.stage === 'closed_won' ? 'signed' : d.stage === 'demo_booked' || d.stage === 'first_demo' ? 'demo_booked' : 'contacted') as CampaignRow['status'],
          method: 'email' as OutreachMethod,
          contactName: d.contact?.name || '',
          contactInfo: '',
          sourceUrl: '',
          meetingBooked: d.stage === 'demo_booked' || d.stage === 'first_demo',
          dealId: d.id,
        })),
      updatedAt: new Date().toISOString(),
    }));

    Promise.all(seeded.map(c =>
      fetch('/api/war-room/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      }).then(r => r.ok ? r.json() : null)
    )).then(results => {
      const created = results.filter(Boolean) as Campaign[];
      if (created.length > 0) setCampaigns(created);
    }).catch(err => console.error('[campaign-crm] seed error:', err));
  }, [loading, stats]);

  // Persist prospects to localStorage
  function persistProspects(updated: CampaignProspect[]) {
    setProspects(updated);
    saveProspects(updated);
  }

  // Persist campaign to API
  const persistCampaign = useCallback(async (campaign: Campaign) => {
    try {
      await fetch('/api/war-room/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaign),
      });
    } catch (err) { console.error('[campaign-crm] patch error:', err); }
  }, []);

  // Handlers
  async function handleCreate(c: Campaign) {
    try {
      const res = await fetch('/api/war-room/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      if (res.ok) {
        const created: Campaign = await res.json();
        setCampaigns(prev => [created, ...prev]);
        setSelectedCampaignId(created.id);
      }
    } catch (err) { console.error('[campaign-crm] create error:', err); }
  }

  async function handleDeleteCampaign(id: string) {
    try {
      const res = await fetch(`/api/war-room/campaigns?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCampaigns(prev => prev.filter(c => c.id !== id));
        if (selectedCampaignId === id) setSelectedCampaignId(null);
      }
    } catch (err) { console.error('[campaign-crm] delete error:', err); }
  }

  function handleUpdateProspect(id: string, updates: Partial<CampaignProspect>) {
    const updated = prospects.map(p => p.id === id ? { ...p, ...updates } : p);
    persistProspects(updated);
  }

  function handleDeleteProspect(id: string) {
    persistProspects(prospects.filter(p => p.id !== id));
  }

  function handleAddProspect(prospect: CampaignProspect) {
    persistProspects([...prospects, prospect]);
  }

  function handleImportProspects(newProspects: CampaignProspect[]) {
    persistProspects([...prospects, ...newProspects]);
  }

  async function handleConvertToDeal(prospectId: string) {
    const prospect = prospects.find(p => p.id === prospectId);
    const campaign = campaigns.find(c => c.id === prospect?.campaignId);
    if (!prospect || !campaign) return;

    setConvertingId(prospectId);
    try {
      let orgId: string | undefined;

      // Try to find or create org
      if (campaign.schoolId) {
        try {
          const schoolRes = await fetch(`/api/pipeline/schools?search=${encodeURIComponent(campaign.school)}`);
          if (schoolRes.ok) {
            const schoolData: any[] = await schoolRes.json();
            const school = schoolData[0];
            if (school) {
              const allOrgs = [...(school.fraternities ?? []), ...(school.sororities ?? [])];
              const existing = allOrgs.find((o: any) =>
                o.name.toLowerCase() === prospect.orgName.toLowerCase()
              );
              if (existing) {
                orgId = existing.id;
              } else {
                const orgRes = await fetch('/api/pipeline/orgs', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: prospect.orgName,
                    school_id: campaign.schoolId,
                    type: 'fraternity',
                    status: 'prospect',
                  }),
                });
                if (orgRes.ok) orgId = (await orgRes.json()).id;
              }
            }
          }
        } catch { /* ignore — fall through */ }
      }

      if (!orgId) {
        console.warn('[campaign-crm] could not resolve org for', prospect.orgName);
        return;
      }

      // Create pipeline deal
      const dealRes = await fetch('/api/pipeline/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          stage: STATUS_TO_STAGE[prospect.status] || 'demo_booked',
          value: 0,
          deal_type: 'local',
          notes: prospect.notes || undefined,
          assigned_to: prospect.assignedTo || undefined,
        }),
      });

      if (!dealRes.ok) { console.error('[campaign-crm] deal create failed'); return; }
      const deal = await dealRes.json();

      // Link deal back to prospect
      handleUpdateProspect(prospectId, { dealId: deal.id, lastActivityDate: todayISO() });
    } catch (err) {
      console.error('[campaign-crm] convertToDeal error:', err);
    } finally {
      setConvertingId(null);
    }
  }

  // Filtered campaign list
  const filteredCampaigns = useMemo(() => {
    let list = campaigns;
    if (typeFilter !== 'all') list = list.filter(c => c.type === typeFilter);
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.school.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [campaigns, typeFilter, statusFilter, search]);

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const selectedProspects = useMemo(
    () => selectedCampaignId ? prospects.filter(p => p.campaignId === selectedCampaignId) : [],
    [prospects, selectedCampaignId]
  );

  // ── Campaign Detail View ──
  if (selectedCampaign) {
    return (
      <>
        <CampaignDetailView
          campaign={selectedCampaign}
          prospects={selectedProspects}
          onBack={() => setSelectedCampaignId(null)}
          onUpdateProspect={handleUpdateProspect}
          onDeleteProspect={handleDeleteProspect}
          onAddProspect={handleAddProspect}
          onImportProspects={handleImportProspects}
          onConvertToDeal={handleConvertToDeal}
          convertingId={convertingId}
        />
        {showCreateDrawer && (
          <CreateCampaignDrawer
            schools={allSchools}
            onClose={() => setShowCreateDrawer(false)}
            onCreate={handleCreate}
          />
        )}
      </>
    );
  }

  // ── Campaign List View ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filter bar */}
      <div className="module-actions-bar">
        <div className="module-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>
        <div className="module-actions">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', fontSize: '0.875rem', background: '#ffffff', outline: 'none', fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}>
            <option value="all">All Types</option>
            <option value="founder_led">Founder-Led</option>
            <option value="intern_led">Intern-Led</option>
            <option value="instagram">Instagram</option>
            <option value="ambassador">Ambassador</option>
            <option value="marketing">Marketing</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', fontSize: '0.875rem', background: '#ffffff', outline: 'none', fontFamily: 'inherit', color: '#374151', cursor: 'pointer' }}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
          <button onClick={() => setShowCreateDrawer(true)} className="module-primary-btn">
            <Plus size={15} /> New Campaign
          </button>
        </div>
      </div>

      {/* Campaign cards */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#9ca3af', gap: 8 }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading campaigns…
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="module-table-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 16 }}>
          <Target size={32} color="#e5e7eb" />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, color: '#6B7280', margin: 0 }}>No campaigns yet</p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: 4 }}>Create your first campaign to start tracking outreach</p>
          </div>
          <button onClick={() => setShowCreateDrawer(true)} className="module-primary-btn">
            <Plus size={15} /> New Campaign
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredCampaigns.map(campaign => (
            <CampaignListCard
              key={campaign.id}
              campaign={campaign}
              prospects={prospects.filter(p => p.campaignId === campaign.id)}
              onClick={() => setSelectedCampaignId(campaign.id)}
              onDelete={handleDeleteCampaign}
            />
          ))}
        </div>
      )}

      {showCreateDrawer && (
        <CreateCampaignDrawer
          schools={allSchools}
          onClose={() => setShowCreateDrawer(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
