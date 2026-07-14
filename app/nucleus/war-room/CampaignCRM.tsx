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
  category: 'greek' | 'clubs' | 'sports' | 'alumni_associations' | 'professional_associations' | 'country_clubs' | '';
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

const CAMPAIGN_UI = {
  border: '#e5e7eb',
  surface: '#ffffff',
  surfaceMuted: '#f9fafb',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textSubtle: '#9ca3af',
  blue: '#2563eb',
  blueDark: '#1d4ed8',
  blueBg: '#eff6ff',
  ink: '#0F172A',
};

const NEUTRAL_BADGE = { color: '#374151', bg: '#f9fafb', border: '#e5e7eb' };

const TOOLBAR_CONTROL_HEIGHT = 34;

const TOOLBAR_BUTTON: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 12px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  borderRadius: '9999px',
  border: `1px solid ${CAMPAIGN_UI.border}`,
  background: '#fff',
  color: CAMPAIGN_UI.textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

const TOOLBAR_SELECT: React.CSSProperties = {
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 28px 0 12px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  borderRadius: '9999px',
  border: `1px solid ${CAMPAIGN_UI.border}`,
  background: '#fff',
  color: CAMPAIGN_UI.textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  outline: 'none',
};

const TOOLBAR_SEARCH: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 12px',
  borderRadius: '9999px',
  border: `1px solid ${CAMPAIGN_UI.border}`,
  background: '#fff',
  flex: 1,
  minWidth: 0,
};

const CAMPAIGN_LIST_COLUMNS = 'minmax(0, 1.4fr) 88px 80px repeat(5, 52px) 72px 36px';

const CAMPAIGN_CARDS_PAGE_SIZE = 12;

function CampaignPaginationFooter({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      paddingTop: 12, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '0.8125rem', color: CAMPAIGN_UI.textMuted }}>
        Showing {start}–{end} of {totalCount}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          style={{
            ...TOOLBAR_BUTTON,
            color: page <= 1 ? CAMPAIGN_UI.textSubtle : CAMPAIGN_UI.textSecondary,
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
            opacity: page <= 1 ? 0.6 : 1,
          }}
        >
          Previous
        </button>
        <span style={{ fontSize: '0.8125rem', color: CAMPAIGN_UI.textMuted, minWidth: 88, textAlign: 'center' }}>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          style={{
            ...TOOLBAR_BUTTON,
            color: page >= totalPages ? CAMPAIGN_UI.textSubtle : CAMPAIGN_UI.textSecondary,
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
            opacity: page >= totalPages ? 0.6 : 1,
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function campaignStatusLabel(status: CampaignStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function CampaignStatsInline({ stats }: { stats: ProspectStats }) {
  const items = [
    { label: 'Pros', value: stats.total },
    { label: 'Out', value: stats.contacted },
    { label: 'Rep', value: stats.replied },
    { label: 'Demo', value: stats.demos },
    { label: 'Won', value: stats.closed },
  ];

  return (
    <>
      {items.map(item => (
        <span
          key={item.label}
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: CAMPAIGN_UI.textSecondary,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {item.value}
        </span>
      ))}
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Generate a valid UUID for new prospects (required by Supabase uuid column) */
function newProspectId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: build a UUID v4-shaped string
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
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
  const items = [
    { label: 'Prospects', value: stats.total },
    { label: 'Contacted', value: stats.contacted },
    { label: 'Replied', value: stats.replied },
    { label: 'Demos', value: stats.demos },
    { label: 'Closed Won', value: stats.closed },
  ];

  return (
    <div style={{ paddingBottom: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          width: '100%',
          paddingBottom: 12,
          borderBottom: `1px solid ${CAMPAIGN_UI.border}`,
        }}
      >
        {items.map((item, index) => (
          <React.Fragment key={item.label}>
            {index > 0 && (
              <div
                aria-hidden
                style={{
                  width: 1,
                  alignSelf: 'stretch',
                  margin: '4px 0',
                  background: CAMPAIGN_UI.border,
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: '1 1 0', padding: '0 12px', minWidth: 0, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CAMPAIGN_UI.textSubtle }}>
                {item.label}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 700, color: CAMPAIGN_UI.text, fontVariantNumeric: 'tabular-nums' }}>
                {item.value}
              </p>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ paddingTop: 12 }}>
        <FunnelBar {...stats} />
      </div>
    </div>
  );
}

// ─── Status Select ────────────────────────────────────────────────────────────

function StatusSelect({ value, onChange }: { value: ProspectStatus; onChange: (v: ProspectStatus) => void }) {
  const cfg = STATUS_CONFIG[value] ?? STATUS_CONFIG['not_contacted'];
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
  const [category, setCategory] = useState<CampaignProspect['category']>('greek');

  function handleAdd() {
    if (!orgName.trim()) return;
    const p: CampaignProspect = {
      id: newProspectId(),
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
      category,
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
          <div>
            <label style={labelStyle}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as CampaignProspect['category'])} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="greek">Greek</option>
              <option value="clubs">Clubs</option>
              <option value="sports">Sports</option>
              <option value="alumni_associations">Alumni Associations</option>
              <option value="professional_associations">Professional Associations</option>
              <option value="country_clubs">Country Clubs</option>
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
      id: newProspectId(),
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
      category: 'greek' as CampaignProspect['category'],
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            ...TOOLBAR_BUTTON,
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={14} /> Campaigns
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: CAMPAIGN_UI.text, margin: 0 }}>{campaign.name}</h2>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
              {CAMPAIGN_TYPE_LABELS[campaign.type]}
            </span>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
              {campaignStatusLabel(campaign.status)}
            </span>
          </div>
          {campaign.school && campaign.school !== campaign.name && (
            <p style={{ fontSize: '0.8125rem', color: CAMPAIGN_UI.textMuted, margin: '4px 0 0' }}>{campaign.school}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            style={TOOLBAR_BUTTON}
          >
            <Upload size={14} /> Import
          </button>
          <button
            type="button"
            onClick={() => setShowAddDrawer(true)}
            style={{
              ...TOOLBAR_BUTTON,
              border: 'none',
              background: CAMPAIGN_UI.ink,
              color: '#fff',
            }}
          >
            <Plus size={14} /> Add Prospect
          </button>
        </div>
      </div>

      {/* Stats Dashboard */}
      <StatsDashboard prospects={prospects} />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ ...TOOLBAR_SEARCH, flex: '1 1 180px' }}>
          <Search size={15} color={CAMPAIGN_UI.textSubtle} />
          <input
            type="text"
            placeholder="Search prospects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.8125rem', fontFamily: 'inherit', color: CAMPAIGN_UI.text, minWidth: 0 }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: CAMPAIGN_UI.textSubtle, padding: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={TOOLBAR_SELECT}>
          <option value="all">All Statuses</option>
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
        </select>
        <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} style={TOOLBAR_SELECT}>
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="ig_dm">IG DM</option>
          <option value="imessage">iMessage</option>
          <option value="call">Call</option>
          <option value="text">Text</option>
        </select>
        <select value={assignedFilter} onChange={e => setAssignedFilter(e.target.value)} style={TOOLBAR_SELECT}>
          <option value="all">All Reps</option>
          {REPS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontSize: '0.75rem', color: CAMPAIGN_UI.textSubtle, marginLeft: 'auto' }}>
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

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '12px 16px',
        border: `1px solid ${CAMPAIGN_UI.border}`,
        borderRadius: 12,
        background: CAMPAIGN_UI.surface,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
        e.currentTarget.style.borderColor = '#d1d5db';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = CAMPAIGN_UI.border;
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 12, alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: CAMPAIGN_UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {campaign.name}
          </div>
          {campaign.school && campaign.school !== campaign.name && (
            <div style={{ fontSize: '0.75rem', color: CAMPAIGN_UI.textSubtle, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {campaign.school}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
              {CAMPAIGN_TYPE_LABELS[campaign.type]}
            </span>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
              {campaignStatusLabel(campaign.status)}
            </span>
          </div>
        </div>

        {stats.total > 0 ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {[
              { label: 'Pros', value: stats.total },
              { label: 'Out', value: stats.contacted },
              { label: 'Rep', value: stats.replied },
              { label: 'Demo', value: stats.demos },
              { label: 'Won', value: stats.closed },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center', minWidth: 34 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: CAMPAIGN_UI.text, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                <div style={{ fontSize: '0.58rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: CAMPAIGN_UI.textSubtle }}>{item.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: '0.75rem', color: CAMPAIGN_UI.textSubtle }}>No prospects</span>
        )}

        <div
          role="presentation"
          onClick={e => { e.stopPropagation(); onDelete(campaign.id); }}
          style={{ color: CAMPAIGN_UI.textSubtle, padding: 4, cursor: 'pointer' }}
          title="Delete campaign"
        >
          <Trash2 size={14} />
        </div>
      </div>

      {stats.total > 0 && (
        <div style={{ marginTop: 10 }}>
          <FunnelBar {...stats} />
        </div>
      )}
    </button>
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
  const [sortBy, setSortBy] = useState<'recent' | 'alpha' | 'prospects' | 'deals'>('recent');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('list');
  const [campaignCardPage, setCampaignCardPage] = useState(1);
  const seededRef = useRef(false);

  // Fetch all prospects from Supabase on mount (shared across all users)
  useEffect(() => {
    fetch('/api/war-room/prospects')
      .then(r => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : [];
        setProspects(arr as CampaignProspect[]);
      })
      .catch(err => console.error('[prospects] fetch error:', err));
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

  // Update local prospect state (Supabase is source of truth — callers fire API requests)
  function persistProspects(updated: CampaignProspect[]) {
    setProspects(Array.isArray(updated) ? updated : []);
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
    const safeArr = Array.isArray(prospects) ? prospects : [];
    const existing = safeArr.find(p => p.id === id);
    if (!existing) {
      // Prospect came from legacy campaign rows JSONB — promote to campaign_prospects table
      const fromMerged = selectedProspects.find(p => p.id === id);
      if (fromMerged) {
        const promoted = { ...fromMerged, ...updates, id: newProspectId() };
        persistProspects([...safeArr, promoted]);
        fetch('/api/war-room/prospects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(promoted),
        }).catch(err => console.error('[prospects] promote error:', err));
      }
      return;
    }
    const updated = safeArr.map(p => p.id === id ? { ...p, ...updates } : p);
    persistProspects(updated);
    fetch('/api/war-room/prospects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    }).catch(err => console.error('[prospects] update error:', err));
  }

  function handleDeleteProspect(id: string) {
    const safeArr = Array.isArray(prospects) ? prospects : [];
    persistProspects(safeArr.filter(p => p.id !== id));
    fetch(`/api/war-room/prospects?id=${id}`, { method: 'DELETE' })
      .catch(err => console.error('[prospects] delete error:', err));
  }

  function handleAddProspect(prospect: CampaignProspect) {
    const safeArr = Array.isArray(prospects) ? prospects : [];
    persistProspects([...safeArr, prospect]);
    fetch('/api/war-room/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prospect),
    }).catch(err => console.error('[prospects] add error:', err));
  }

  function handleImportProspects(newProspects: CampaignProspect[]) {
    const safeArr = Array.isArray(prospects) ? prospects : [];
    persistProspects([...safeArr, ...newProspects]);
    if (newProspects.length > 0) {
      fetch('/api/war-room/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProspects),
      }).catch(err => console.error('[prospects] bulk import error:', err));
    }
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

  // Filtered + sorted campaign list
  const filteredCampaigns = useMemo(() => {
    let list = Array.isArray(campaigns) ? campaigns : [];
    if (typeFilter !== 'all') list = list.filter(c => c.type === typeFilter);
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.school.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'alpha') return a.name.localeCompare(b.name);
      if (sortBy === 'prospects') {
        const aP = prospects.filter(p => p.campaignId === a.id).length + (a.rows?.length ?? 0);
        const bP = prospects.filter(p => p.campaignId === b.id).length + (b.rows?.length ?? 0);
        return bP - aP;
      }
      if (sortBy === 'deals') {
        const aD = (a.rows ?? []).filter(r => r.dealId).length;
        const bD = (b.rows ?? []).filter(r => r.dealId).length;
        return bD - aD;
      }
      // Default: active first, then most recent
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [campaigns, typeFilter, statusFilter, search, sortBy, prospects]);

  const totalCardPages = Math.max(1, Math.ceil(filteredCampaigns.length / CAMPAIGN_CARDS_PAGE_SIZE));
  const safeCardPage = Math.min(campaignCardPage, totalCardPages);
  const paginatedCardCampaigns = useMemo(
    () => filteredCampaigns.slice(
      (safeCardPage - 1) * CAMPAIGN_CARDS_PAGE_SIZE,
      safeCardPage * CAMPAIGN_CARDS_PAGE_SIZE,
    ),
    [filteredCampaigns, safeCardPage],
  );

  useEffect(() => {
    setCampaignCardPage(1);
  }, [search, statusFilter, typeFilter, sortBy]);

  useEffect(() => {
    if (campaignCardPage > totalCardPages) setCampaignCardPage(totalCardPages);
  }, [campaignCardPage, totalCardPages]);

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const selectedProspects = useMemo(
    () => {
      if (!selectedCampaignId) return [];
      // Merge localStorage prospects with API campaign rows
      const lsProspects = prospects.filter(p => p.campaignId === selectedCampaignId);
      const campaign = campaigns.find(c => c.id === selectedCampaignId);
      const apiRows = (campaign as any)?.rows ?? [];
      const existingOrgs = new Set(lsProspects.map(p => p.orgName.toLowerCase()));
      const fromApi: CampaignProspect[] = apiRows
        .filter((r: any) => r.chapterName && !existingOrgs.has(r.chapterName.toLowerCase()))
        .map((r: any) => ({
          id: r.id || `api-${Math.random().toString(36).slice(2)}`,
          campaignId: selectedCampaignId,
          orgName: r.chapterName || '',
          school: (campaign as any)?.school || '',
          contactName: r.contactName || '',
          contactEmail: r.contactInfo || '',
          contactPhone: '',
          contactIg: '',
          channel: (r.method as any) || '',
          status: r.status === 'demo_booked' ? 'demo_booked' : r.status === 'closed_won' ? 'closed_won' : r.meetingBooked ? 'demo_booked' : r.method ? 'contacted' : 'not_contacted',
          outreachDate: null,
          lastActivityDate: null,
          assignedTo: '',
          notes: '',
          dealId: null,
          createdAt: ((campaign as any)?.created_at) || new Date().toISOString(),
        } as CampaignProspect));
      return [...lsProspects, ...fromApi];
    },
    [prospects, selectedCampaignId, campaigns]
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

  const safeProspects = Array.isArray(prospects) ? prospects : [];

  // ── Campaign List View ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ ...TOOLBAR_SEARCH, flex: '1 1 220px' }}>
          <Search size={15} color={CAMPAIGN_UI.textSubtle} />
          <input
            type="text"
            placeholder="Search campaigns…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.8125rem', fontFamily: 'inherit', color: CAMPAIGN_UI.text, minWidth: 0 }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: CAMPAIGN_UI.textSubtle, padding: 0 }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreateDrawer(true)}
          style={{
            ...TOOLBAR_BUTTON,
            border: 'none',
            background: CAMPAIGN_UI.ink,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <Plus size={15} /> New Campaign
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'active', 'paused', 'completed'] as const).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              style={{
                ...TOOLBAR_BUTTON,
                border: `1px solid ${statusFilter === s ? CAMPAIGN_UI.blue : CAMPAIGN_UI.border}`,
                background: statusFilter === s ? CAMPAIGN_UI.blueBg : '#fff',
                color: statusFilter === s ? CAMPAIGN_UI.blueDark : CAMPAIGN_UI.textSecondary,
                fontWeight: statusFilter === s ? 600 : 500,
              }}
            >
              {s === 'all' ? 'All' : campaignStatusLabel(s)}
            </button>
          ))}
        </div>

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={TOOLBAR_SELECT}>
          <option value="all">All Types</option>
          <option value="founder_led">Founder-Led</option>
          <option value="intern_led">Intern-Led</option>
          <option value="instagram">Instagram</option>
          <option value="ambassador">Ambassador</option>
          <option value="marketing">Marketing</option>
        </select>

        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={TOOLBAR_SELECT}>
          <option value="recent">Most Recent</option>
          <option value="alpha">A → Z</option>
          <option value="prospects">Most Prospects</option>
          <option value="deals">Most Deals</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: CAMPAIGN_UI.textSubtle }}>
            {filteredCampaigns.length} campaign{filteredCampaigns.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', background: CAMPAIGN_UI.surfaceMuted, borderRadius: 9999, padding: 2, border: `1px solid ${CAMPAIGN_UI.border}` }}>
            {(['list', 'cards'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 9999,
                  border: 'none',
                  background: viewMode === mode ? '#fff' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: viewMode === mode ? CAMPAIGN_UI.text : CAMPAIGN_UI.textMuted,
                  fontFamily: 'inherit',
                  boxShadow: viewMode === mode ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {mode === 'list' ? 'List' : 'Cards'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Campaign content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#9ca3af', gap: 8 }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading campaigns…
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '56px 20px', gap: 14, border: `1px solid ${CAMPAIGN_UI.border}`, borderRadius: 12, background: CAMPAIGN_UI.surface,
        }}>
          <Target size={28} color={CAMPAIGN_UI.border} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, color: CAMPAIGN_UI.textMuted, margin: 0 }}>No campaigns yet</p>
            <p style={{ fontSize: '0.8125rem', color: CAMPAIGN_UI.textSubtle, marginTop: 4 }}>Create your first campaign to start tracking outreach</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateDrawer(true)}
            style={{ ...TOOLBAR_BUTTON, border: 'none', background: CAMPAIGN_UI.ink, color: '#fff' }}
          >
            <Plus size={15} /> New Campaign
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div style={{ border: `1px solid ${CAMPAIGN_UI.border}`, borderRadius: 12, background: CAMPAIGN_UI.surface, overflow: 'hidden' }}>
          <div
            role="row"
            style={{
              display: 'grid',
              gridTemplateColumns: CAMPAIGN_LIST_COLUMNS,
              gap: 10,
              alignItems: 'center',
              padding: '10px 16px',
              borderBottom: `1px solid ${CAMPAIGN_UI.border}`,
              background: CAMPAIGN_UI.surfaceMuted,
            }}
          >
            {['Campaign', 'Type', 'Status', 'Pros', 'Out', 'Rep', 'Demo', 'Won', 'Updated', ''].map(label => (
              <span
                key={label || 'actions'}
                role="columnheader"
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: CAMPAIGN_UI.textSubtle,
                  textAlign: label && !['Campaign', 'Type', 'Status', ''].includes(label) ? 'right' : 'left',
                }}
              >
                {label}
              </span>
            ))}
          </div>

          <div style={{ maxHeight: 'min(68vh, 720px)', overflowY: 'auto' }}>
            {filteredCampaigns.map((campaign, index) => {
              const campaignProspects = [
                ...safeProspects.filter(p => p.campaignId === campaign.id),
                ...((campaign.rows ?? []).filter(r => r.chapterName).map(r => ({
                  id: r.id,
                  campaignId: campaign.id,
                  orgName: r.chapterName,
                  status: r.meetingBooked ? 'demo_booked' : r.method ? 'contacted' : 'not_contacted',
                })) as CampaignProspect[]),
              ];
              const stats = computeStats(campaignProspects);
              const updatedDate = new Date(campaign.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => setSelectedCampaignId(campaign.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: CAMPAIGN_LIST_COLUMNS,
                    gap: 10,
                    alignItems: 'center',
                    width: '100%',
                    padding: '10px 16px',
                    border: 'none',
                    borderBottom: index < filteredCampaigns.length - 1 ? `1px solid ${CAMPAIGN_UI.border}` : 'none',
                    background: CAMPAIGN_UI.surface,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: CAMPAIGN_UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {campaign.name}
                    </div>
                    {campaign.school && campaign.school !== campaign.name && (
                      <div style={{ fontSize: '0.72rem', color: CAMPAIGN_UI.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {campaign.school}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}`, justifySelf: 'start' }}>
                    {CAMPAIGN_TYPE_LABELS[campaign.type]}
                  </span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: NEUTRAL_BADGE.color, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}`, justifySelf: 'start' }}>
                    {campaignStatusLabel(campaign.status)}
                  </span>
                  <CampaignStatsInline stats={stats} />
                  <span style={{ fontSize: '0.75rem', color: CAMPAIGN_UI.textSubtle, textAlign: 'right', whiteSpace: 'nowrap' }}>{updatedDate}</span>
                  <span
                    role="presentation"
                    onClick={e => { e.stopPropagation(); handleDeleteCampaign(campaign.id); }}
                    style={{ color: CAMPAIGN_UI.textSubtle, padding: 4, cursor: 'pointer', justifySelf: 'end' }}
                  >
                    <Trash2 size={13} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paginatedCardCampaigns.map(campaign => (
              <CampaignListCard
                key={campaign.id}
                campaign={campaign}
                prospects={[
                  ...safeProspects.filter(p => p.campaignId === campaign.id),
                  ...((campaign as any)?.rows ?? []).filter((r: any) => r.chapterName).map((r: any) => ({
                    id: r.id, campaignId: campaign.id, orgName: r.chapterName,
                    status: r.meetingBooked ? 'demo_booked' : r.method ? 'contacted' : 'not_contacted',
                  } as CampaignProspect))
                ]}
                onClick={() => setSelectedCampaignId(campaign.id)}
                onDelete={handleDeleteCampaign}
              />
            ))}
          </div>
          <CampaignPaginationFooter
            page={safeCardPage}
            pageSize={CAMPAIGN_CARDS_PAGE_SIZE}
            totalCount={filteredCampaigns.length}
            onPageChange={setCampaignCardPage}
          />
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
