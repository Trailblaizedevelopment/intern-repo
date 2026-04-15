'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ComposableMap, Geographies, Geography as GeographyBase } from 'react-simple-maps';
const Geography = GeographyBase as any;
import {
  RefreshCw, MapPin, Calendar, Phone, Search, X,
  ChevronDown, ChevronUp, Plus, Trash2, Check,
  AlertCircle, Clock, Users, Building2, DollarSign,
  TrendingUp, ChevronRight, Mail, MessageSquare,
  Instagram, Upload, CheckCircle2, Link2,
  Target, ExternalLink, Zap, BarChart3,
  ArrowLeft, LayoutDashboard, FileUp,
} from 'lucide-react';
import { STAGE_CONFIG, DealStage } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface School {
  id: string;
  name: string;
  conference?: string | null;
  state?: string | null;
}

interface Organization {
  id: string;
  name: string;
  school?: School | null;
  national_org?: { name: string; abbrev?: string } | null;
}

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface Deal {
  id: string;
  stage: string;
  value?: number | null;
  temperature?: string | null;
  next_followup?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
  conference?: string | null;
  deal_type?: string | null;
  org_id?: string | null;
  organization?: Organization | null;
  contact?: Contact | null;
}

interface ConferenceStats {
  conference: string;
  dealCount: number;
  pipelineValue: number;
}

interface PipelineStats {
  mrr: number;
  mrrGoal: number;
  schoolsInConversation: number;
  demosNext7: number;
  demosNext14: number;
  decisionsNext7: number;
  decisionsNext14: number;
  byConference: ConferenceStats[];
  recentDeals: Deal[];
}

interface GranolaNote {
  id: string;
  title?: string;
  created_at?: string;
  attendees?: { name?: string; email?: string }[];
}

// Campaign types
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

// Next Steps (Notes tab)
interface NextStep {
  id: string;
  noteId: string;
  noteTitle: string;
  noteDate: string;
  text: string;
  assignedTo: 'Owen' | 'Ford' | 'Adam' | 'All';
  dueDate?: string;
  done: boolean;
  createdAt: string;
}

// Client Map types
type SchoolStatus = 'active_client' | 'in_pipeline' | 'not_contacted';
type OutreachStatus = 'not_contacted' | 'contacted' | 'demo_booked' | 'signed';
type ContactType = 'president' | 'alumni_chair' | 'rush_chair' | 'other';

interface OrgDeal {
  id: string;
  stage: string;
  value: number;
  assigned_to: string | null;
}

interface OrgEntry {
  id: string;
  name: string;
  deals: OrgDeal[];
}

interface ActiveChapter {
  id: string;
  chapter_name: string;
  mrr: number;
}

interface MapSchool {
  id: string;
  name: string;
  state: string | null;
  conference: string | null;
  fraternities: OrgEntry[];
  sororities: OrgEntry[];
  activeChapters: ActiveChapter[];
  pipelineValue: number;
  dealCount: number;
  status: SchoolStatus;
}

interface OutreachEntry {
  status: OutreachStatus;
  method: OutreachMethod;
  contactType: ContactType;
  contactedAt: string;
  notes: string;
  dealId?: string;
  sourceUrl?: string;
  contactInfo?: string;
  meetingBooked?: boolean;
}

type OutreachLog = Record<string, OutreachEntry>;

interface StateData {
  status: SchoolStatus;
  activeClients: number;
  pipelineDeals: number;
  pipelineValue: number;
}

interface DealDetail {
  id: string;
  stage: string;
  value: number;
  temperature: string | null;
  next_followup: string | null;
  notes: string | null;
  assigned_to: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect', outreach: 'Outreach', contacted: 'Contacted',
  follow_up: 'Follow-up', demo_booked: 'Demo Booked', first_demo: 'Demo Done',
  second_call: 'Decision Call', proposal: 'Proposal', negotiation: 'Negotiating',
  closed_won: 'Closed Won', closed_lost: 'Closed Lost', hold_off: 'Hold Off',
  lead: 'New Lead', contract_sent: 'Contract Sent',
};

const STAGE_CONF: Record<string, { label: string; color: string; bg: string }> = {
  lead:          { label: 'New Lead',      color: '#6b7280', bg: '#f9fafb' },
  demo_booked:   { label: 'Demo Booked',   color: '#1d4ed8', bg: '#eff6ff' },
  first_demo:    { label: 'First Demo',    color: '#1d4ed8', bg: '#eff6ff' },
  second_call:   { label: 'Second Call',   color: '#7c3aed', bg: '#f5f3ff' },
  contract_sent: { label: 'Contract Sent', color: '#b45309', bg: '#fffbeb' },
  closed_won:    { label: 'Closed Won',    color: '#065f46', bg: '#ecfdf5' },
};

const STAGE_OPTIONS = [
  { value: 'lead', label: 'New Lead' }, { value: 'demo_booked', label: 'Demo Booked' },
  { value: 'first_demo', label: 'First Demo' }, { value: 'second_call', label: 'Second Call' },
  { value: 'contract_sent', label: 'Contract Sent' }, { value: 'closed_won', label: 'Closed Won' },
];

const TEMP_OPTIONS = [
  { value: 'hot', label: 'Hot' }, { value: 'warm', label: 'Warm' }, { value: 'cold', label: 'Cold' },
];

const TEMP_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  hot:  { label: 'Hot',  color: '#dc2626', bg: '#fee2e2' },
  warm: { label: 'Warm', color: '#d97706', bg: '#fef3c7' },
  cold: { label: 'Cold', color: '#0284c7', bg: '#e0f2fe' },
  dead: { label: 'Dead', color: '#6b7280', bg: '#f3f4f6' },
};

const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  founder_led: 'Founder-Led', intern_led: 'Intern-Led', instagram: 'Instagram',
  ambassador: 'Ambassador', marketing: 'Marketing',
};

const CAMPAIGN_TYPE_BADGE: Record<CampaignType, { color: string; bg: string }> = {
  founder_led: { color: '#7c3aed', bg: '#f5f3ff' },
  intern_led:  { color: '#1d4ed8', bg: '#eff6ff' },
  instagram:   { color: '#be185d', bg: '#fdf2f8' },
  ambassador:  { color: '#b45309', bg: '#fffbeb' },
  marketing:   { color: '#065f46', bg: '#ecfdf5' },
};

const REP_COLORS: Record<string, string> = {
  Owen: '#0F172A', Ford: '#2563eb', Adam: '#10b981', Hyatt: '#7c3aed',
  'Owen Ridgeway': '#0F172A', 'Hyatt Williams': '#7c3aed',
};

const UUID_TO_NAME: Record<string, string> = {
  '33ab5810-4d9f-485e-babb-a99b650a09e1': 'Owen',
  '3853cd9d-0773-4d04-b23f-20eb51717e0f': 'Ford',
  '66952c26-316d-4e9c-8fe1-4dd5743926ef': 'Adam',
  '904e6a81-8046-44a5-9710-db893be0a094': 'Hyatt',
  '6622b57d-1a17-49ae-b492-85906612954f': 'Ally',
  'b51b7314-fbdc-496f-ae08-3af8aff29a39': 'Devin',
  'eadecbba-91da-41da-adc5-9a5b1cb82d4c': 'Parker',
  '5a848006-7f96-4c86-aa8d-3032ac0636ef': 'Riley',
  '6b7763bb-9bc7-46fb-b677-3e39d0a5d927': 'Worth',
};

function resolveRep(val?: string | null): string | null {
  if (!val) return null;
  if (val.includes('-') && val.length > 20) return UUID_TO_NAME[val] ?? null;
  return val;
}

const OUTREACH_STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string; bg: string; border: string }> = {
  not_contacted: { label: 'Not Contacted', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  contacted:     { label: 'Contacted',     color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  demo_booked:   { label: 'Demo Booked',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  signed:        { label: 'Signed',        color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7' },
};

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const STATE_NAME_TO_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI',
  Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME',
  Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE',
  Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM',
  'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH',
  Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX',
  Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'Puerto Rico': 'PR',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateLong(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function followupStyle(dateStr?: string | null): React.CSSProperties {
  if (!dateStr) return { color: '#9ca3af' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  if (d < today) return { color: '#ef4444', fontWeight: 600 };
  if (d.getTime() === today.getTime()) return { color: '#d97706', fontWeight: 600 };
  return { color: '#6b7280' };
}

function getRepColor(name?: string | null): string {
  if (!name) return '#6b7280';
  const resolved = resolveRep(name) ?? name;
  return REP_COLORS[resolved] ?? '#6b7280';
}

function getRepInitials(name?: string | null): string {
  if (!name) return '?';
  const resolved = resolveRep(name) ?? name;
  const parts = resolved.trim().split(/\s+/);
  return parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function in7DaysISO(): string {
  const d = new Date(); d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0];
}

// ─── Shared Components ────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string }) {
  const sc = STAGE_CONFIG[stage as DealStage];
  if (sc) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: sc.color,
          backgroundColor: sc.color + '22',
          whiteSpace: 'nowrap',
        }}
      >
        {sc.label}
      </span>
    );
  }
  const conf = STAGE_CONF[stage];
  if (conf) {
    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 10px',
          borderRadius: '9999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: conf.color,
          backgroundColor: conf.bg,
          whiteSpace: 'nowrap',
        }}
      >
        {conf.label}
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#6b7280',
        backgroundColor: '#f3f4f6',
        whiteSpace: 'nowrap',
      }}
    >
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

function TempBadge({ temp }: { temp?: string | null }) {
  if (!temp) return null;
  const cfg = TEMP_BADGE[temp] ?? { label: temp, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '0.7rem',
        fontWeight: 500,
        color: cfg.color,
        backgroundColor: cfg.bg,
      }}
    >
      {cfg.label}
    </span>
  );
}

function RepChip({ name }: { name?: string | null }) {
  if (!name) return null;
  const displayName = resolveRep(name) ?? name;
  const color = getRepColor(displayName);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        paddingLeft: '2px',
        paddingRight: '8px',
        paddingTop: '2px',
        paddingBottom: '2px',
        borderRadius: '9999px',
        backgroundColor: color,
        color: '#fff',
        fontSize: '0.75rem',
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      <span style={{
        width: '20px', height: '20px', borderRadius: '9999px',
        background: 'rgba(255,255,255,0.2)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700,
      }}>
        {getRepInitials(displayName)}
      </span>
      {displayName}
    </span>
  );
}

function MethodPill({ method }: { method: OutreachMethod }) {
  const cfg = {
    email:        { label: 'Email',  color: '#1d4ed8', bg: '#eff6ff', icon: <Mail size={10} /> },
    text:         { label: 'Text',   color: '#065f46', bg: '#ecfdf5', icon: <MessageSquare size={10} /> },
    instagram_dm: { label: 'IG DM', color: '#be185d', bg: '#fdf2f8', icon: <Instagram size={10} /> },
  }[method];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '0.7rem', padding: '2px 8px', borderRadius: '9999px',
      color: cfg.color, backgroundColor: cfg.bg, fontWeight: 500,
    }}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Tab 1: Dashboard ─────────────────────────────────────────────────────────

interface PipelineGroup {
  label: string;
  color: string;
  deals: Deal[];
}

function groupDealsByUrgency(deals: Deal[]): PipelineGroup[] {
  const today = todayISO();
  const week = in7DaysISO();
  const overdue: Deal[] = [];
  const thisWeek: Deal[] = [];
  const upcoming: Deal[] = [];
  for (const d of deals) {
    const fu = d.next_followup;
    if (!fu) { upcoming.push(d); continue; }
    if (fu < today) overdue.push(d);
    else if (fu <= week) thisWeek.push(d);
    else upcoming.push(d);
  }
  return [
    { label: 'Overdue', color: '#ef4444', deals: overdue },
    { label: 'This Week', color: '#d97706', deals: thisWeek },
    { label: 'Upcoming', color: '#9ca3af', deals: upcoming },
  ].filter(g => g.deals.length > 0);
}

function PipelineDealRow({ deal }: { deal: Deal }) {
  const org = deal.organization;
  const chapterName = org?.name || '—';
  const schoolName = org?.school?.name || deal.conference || '—';
  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => { window.location.href = '/nucleus/pipeline'; }}
    >
      <td className="module-table-name">{chapterName}</td>
      <td style={{ color: '#6b7280', fontSize: '0.8125rem' }}>{schoolName}</td>
      <td><StageBadge stage={deal.stage} /></td>
      <td style={{ textAlign: 'center' }}><TempBadge temp={deal.temperature} /></td>
      <td style={{ textAlign: 'right', fontSize: '0.8125rem', ...followupStyle(deal.next_followup) }}>
        {fmtDate(deal.next_followup)}
      </td>
      <td><RepChip name={deal.assigned_to} /></td>
      <td style={{ textAlign: 'right', fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>
        {deal.value ? fmt$(deal.value) : '—'}
      </td>
    </tr>
  );
}

function CollapsiblePipelineGroup({ group }: { group: PipelineGroup }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr style={{ background: '#F9FAFB', borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB' }}>
        <td colSpan={7} style={{ padding: '8px 20px' }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ width: '8px', height: '8px', borderRadius: '9999px', background: group.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
              {group.label}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>
              {group.deals.length} deal{group.deals.length !== 1 ? 's' : ''}
            </span>
            {open ? <ChevronUp size={13} color="#9ca3af" /> : <ChevronDown size={13} color="#9ca3af" />}
          </button>
        </td>
      </tr>
      {open && group.deals.map(deal => <PipelineDealRow key={deal.id} deal={deal} />)}
    </>
  );
}

function DashboardTab({ stats }: { stats: PipelineStats | null }) {
  if (!stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '16rem', color: '#9ca3af' }}>
        <RefreshCw size={24} style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }} />
        Loading stats…
      </div>
    );
  }

  const mrrPct = Math.min(100, Math.round((stats.mrr / stats.mrrGoal) * 100));
  const mrrAway = stats.mrrGoal - stats.mrr;
  const pipelineGroups = groupDealsByUrgency(stats.recentDeals);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* MRR Hero Card */}
      <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B7280', marginBottom: '4px' }}>
            Monthly Recurring Revenue
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
                {fmt$(stats.mrr)}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#6B7280', marginTop: '8px' }}>
                {mrrAway > 0 ? (
                  <span style={{ color: '#0F172A', fontWeight: 600 }}>{fmt$(mrrAway)} away</span>
                ) : (
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Goal reached!</span>
                )}{' '}
                from {fmt$(stats.mrrGoal)} goal
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Progress</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: '#111827' }}>{mrrPct}%</p>
            </div>
          </div>
        </div>
        <div style={{ background: '#F3F4F6', borderRadius: '9999px', height: '8px', overflow: 'hidden' }}>
          <div style={{ height: '8px', borderRadius: '9999px', background: '#0F172A', width: `${mrrPct}%`, transition: 'width 0.7s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0F172A' }}>{fmt$(stats.mrr)}</span>
          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Goal: {fmt$(stats.mrrGoal)}</span>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="module-stats-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <div className="module-stat">
          <span className="module-stat-value">{stats.schoolsInConversation}</span>
          <span className="module-stat-label">Schools in Convo</span>
        </div>
        <div className="module-stat">
          <span className="module-stat-value">{stats.demosNext7}</span>
          <span className="module-stat-label">Demos · 7 Days</span>
        </div>
        <div className="module-stat">
          <span className="module-stat-value">{stats.demosNext14}</span>
          <span className="module-stat-label">Demos · 14 Days</span>
        </div>
        <div className="module-stat">
          <span className="module-stat-value">{stats.decisionsNext7}</span>
          <span className="module-stat-label">Decisions · 7d</span>
        </div>
        <div className="module-stat">
          <span className="module-stat-value">{stats.decisionsNext14}</span>
          <span className="module-stat-label">Decisions · 14d</span>
        </div>
      </div>

      {/* Conference Tracker */}
      {stats.byConference.length > 0 && (
        <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '20px' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', marginBottom: '16px' }}>
            Conference Tracker
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
            {stats.byConference.map(c => (
              <div key={c.conference} className="module-stat">
                <span className="module-stat-label">{c.conference}</span>
                <span className="module-stat-value" style={{ fontSize: '1.5rem', marginTop: '4px' }}>{c.dealCount}</span>
                <span className="module-stat-label">{fmt$(c.pipelineValue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Pipeline Feed */}
      <div className="module-table-container">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: '10px', height: '10px' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '9999px', background: '#34d399', opacity: 0.75, animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite' }} />
              <span style={{ position: 'relative', borderRadius: '9999px', background: '#10b981', width: '10px', height: '10px' }} />
            </span>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280' }}>Pipeline</span>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', background: '#F3F4F6', borderRadius: '9999px', padding: '2px 8px' }}>
              {stats.recentDeals.length}
            </span>
          </div>
          <Link
            href="/nucleus/pipeline"
            style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0F172A', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
          >
            View all <ExternalLink size={11} />
          </Link>
        </div>
        {stats.recentDeals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: '0.875rem' }}>No active deals</div>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: '560px' }}>
            <table className="module-table">
              <thead>
                <tr>
                  <th>Org</th>
                  <th>School</th>
                  <th>Stage</th>
                  <th style={{ textAlign: 'center' }}>Temp</th>
                  <th style={{ textAlign: 'right' }}>Followup</th>
                  <th>Rep</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {pipelineGroups.length > 0
                  ? pipelineGroups.map(group => <CollapsiblePipelineGroup key={group.label} group={group} />)
                  : stats.recentDeals.map(deal => <PipelineDealRow key={deal.id} deal={deal} />)
                }
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 2: Campaigns ─────────────────────────────────────────────────────────

const CAMPAIGNS_STORAGE_KEY = 'tb_campaigns_v2';

function loadCampaigns(): Campaign[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Campaign[]) : [];
  } catch { return []; }
}

function saveCampaigns(campaigns: Campaign[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(campaigns));
}

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
  const [status] = useState<CampaignStatus>('active');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [showSchoolDrop, setShowSchoolDrop] = useState(false);

  const filteredSchools = useMemo(() => {
    if (!schoolQuery.trim()) return schools.slice(0, 8);
    const q = schoolQuery.toLowerCase();
    return schools.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [schools, schoolQuery]);

  function handleSchoolSelect(s: { id: string; name: string }) {
    setSchool(s.name);
    setSchoolId(s.id);
    setSchoolQuery(s.name);
    setShowSchoolDrop(false);
    if (!name.trim()) setName(s.name);
  }

  function handleCreate() {
    if (!name.trim()) return;
    const campaign: Campaign = {
      id: uid(), name: name.trim(), type, school: school.trim(),
      schoolId: schoolId || undefined,
      status, rows: [], updatedAt: new Date().toISOString(),
    };
    onCreate(campaign);
    onClose();
  }

  const typeOptions: { value: CampaignType; label: string }[] = [
    { value: 'founder_led', label: 'Founder-Led' }, { value: 'intern_led', label: 'Intern-Led' },
    { value: 'instagram', label: 'Instagram' }, { value: 'ambassador', label: 'Ambassador' },
    { value: 'marketing', label: 'Marketing' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ width: '420px', background: '#ffffff', display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #E5E7EB' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
          <div>
            <h2 style={{ fontWeight: 700, color: '#111827', fontSize: '1rem', margin: 0 }}>New Campaign</h2>
            <p style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: '2px' }}>Create an outreach campaign</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '4px', borderRadius: '8px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>School</label>
            <input
              type="text"
              value={schoolQuery}
              onChange={e => { setSchoolQuery(e.target.value); setShowSchoolDrop(true); if (!e.target.value) { setSchool(''); setSchoolId(''); } }}
              onFocus={() => setShowSchoolDrop(true)}
              placeholder="Search school…"
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '10px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            {showSchoolDrop && filteredSchools.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', marginTop: '4px', left: 0, right: 0, background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', zIndex: 10, overflow: 'hidden' }}>
                {filteredSchools.map(s => (
                  <button key={s.id} onClick={() => handleSchoolSelect(s)}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px', fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #F9FAFB', fontFamily: 'inherit' }}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. TCU - Instagram"
              style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '10px 12px', fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  style={{
                    padding: '8px 12px', fontSize: '0.875rem', borderRadius: '12px',
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

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#374151', border: '1px solid #E5E7EB', borderRadius: '12px', background: '#ffffff', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="module-primary-btn"
            style={{ flex: 1, justifyContent: 'center', borderRadius: '12px', padding: '10px', opacity: name.trim() ? 1 : 0.5 }}
          >
            Create Campaign
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignRowItem({
  row, campaignId, onUpdate, onDelete,
}: {
  row: CampaignRow;
  campaignId: string;
  onUpdate: (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => void;
  onDelete: (campaignId: string, rowId: string) => void;
}) {
  return (
    <tr>
      <td>
        <input type="text" value={row.chapterName}
          onChange={e => onUpdate(campaignId, row.id, { chapterName: e.target.value })}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', fontSize: '0.875rem', padding: '2px 0', minWidth: '120px', fontFamily: 'inherit' }}
          placeholder="Chapter name" />
      </td>
      <td>
        <select value={row.status}
          onChange={e => onUpdate(campaignId, row.id, { status: e.target.value as CampaignRow['status'] })}
          style={{ background: 'transparent', fontSize: '0.75rem', border: 'none', outline: 'none', fontFamily: 'inherit' }}>
          <option value="not_contacted">Not Contacted</option>
          <option value="contacted">Contacted</option>
          <option value="demo_booked">Demo Booked</option>
          <option value="signed">Signed</option>
        </select>
      </td>
      <td>
        <select value={row.method}
          onChange={e => onUpdate(campaignId, row.id, { method: e.target.value as OutreachMethod })}
          style={{ background: 'transparent', fontSize: '0.75rem', border: 'none', outline: 'none', fontFamily: 'inherit' }}>
          <option value="email">Email</option>
          <option value="text">Text</option>
          <option value="instagram_dm">Instagram DM</option>
        </select>
      </td>
      <td>
        <input type="text" value={row.contactName}
          onChange={e => onUpdate(campaignId, row.id, { contactName: e.target.value })}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', fontSize: '0.875rem', padding: '2px 0', minWidth: '100px', fontFamily: 'inherit' }}
          placeholder="Name" />
      </td>
      <td>
        <input type="text" value={row.contactInfo}
          onChange={e => onUpdate(campaignId, row.id, { contactInfo: e.target.value })}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', fontSize: '0.875rem', padding: '2px 0', minWidth: '120px', fontFamily: 'inherit' }}
          placeholder="Email / phone" />
      </td>
      <td>
        <input type="text" value={row.sourceUrl}
          onChange={e => onUpdate(campaignId, row.id, { sourceUrl: e.target.value })}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', fontSize: '0.875rem', padding: '2px 0', minWidth: '140px', fontFamily: 'inherit' }}
          placeholder="https://..." />
      </td>
      <td style={{ textAlign: 'center' }}>
        <button
          onClick={() => onUpdate(campaignId, row.id, { meetingBooked: !row.meetingBooked })}
          style={{
            width: '20px', height: '20px', borderRadius: '4px',
            border: `1px solid ${row.meetingBooked ? '#0F172A' : '#d1d5db'}`,
            background: row.meetingBooked ? '#0F172A' : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', margin: '0 auto',
          }}
        >
          {row.meetingBooked && <Check size={12} color="#fff" />}
        </button>
      </td>
      <td>
        <button onClick={() => onDelete(campaignId, row.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '2px' }}>
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── CSV Import for Campaigns ─────────────────────────────────────────────────

interface CsvImportState {
  importing: boolean;
  progress: number;
  total: number;
  summary: { imported: number; deals: number } | null;
}

function ExpandedCampaign({
  campaign, onUpdate, onDelete, onAddRow, onUpdateCampaign, onUpdateCampaignMeta,
}: {
  campaign: Campaign;
  onUpdate: (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => void;
  onDelete: (campaignId: string, rowId: string) => void;
  onAddRow: (campaignId: string) => void;
  onUpdateCampaign: (id: string, updates: Partial<Campaign>) => void;
  onUpdateCampaignMeta: (id: string, rows: CampaignRow[], schoolId?: string) => void;
}) {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvState, setCsvState] = useState<CsvImportState>({ importing: false, progress: 0, total: 0, summary: null });

  function parseCSV(text: string): Array<Record<string, string>> {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = vals[i] ?? ''; });
      return row;
    }).filter(r => r['chapter_name']?.trim());
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) return;

    setCsvState({ importing: true, progress: 0, total: rows.length, summary: null });

    // Look up school data (orgs) to find existing ones
    let schoolId = campaign.schoolId;
    let existingOrgNames: Map<string, string> = new Map(); // name.lower → orgId

    try {
      const schoolRes = await fetch(`/api/pipeline/schools?search=${encodeURIComponent(campaign.school)}`);
      const schoolData: MapSchool[] = await schoolRes.json();
      const school = schoolData[0];
      if (school) {
        if (!schoolId) schoolId = school.id;
        const allOrgs = [...school.fraternities, ...school.sororities];
        allOrgs.forEach(o => existingOrgNames.set(o.name.toLowerCase(), o.id));
      }
    } catch (err) {
      console.error('[csv-import] school lookup failed:', err);
    }

    const newRows: CampaignRow[] = [];
    let dealsCreated = 0;

    for (let i = 0; i < rows.length; i++) {
      const csvRow = rows[i];
      const chapterName = csvRow['chapter_name'].trim();
      if (!chapterName) continue;

      setCsvState(s => ({ ...s, progress: i + 1 }));

      const method = (csvRow['method'] as OutreachMethod) || 'email';
      const newRow: CampaignRow = {
        id: uid(),
        chapterName,
        status: 'not_contacted',
        method: ['email', 'text', 'instagram_dm'].includes(method) ? method : 'email',
        contactName: csvRow['contact_name'] || '',
        contactInfo: csvRow['contact_info'] || '',
        sourceUrl: csvRow['source_url'] || '',
        meetingBooked: false,
      };

      // Try to create pipeline deal
      try {
        let orgId = existingOrgNames.get(chapterName.toLowerCase());

        if (!orgId && schoolId) {
          // Create org
          const orgRes = await fetch('/api/pipeline/orgs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: chapterName, school_id: schoolId, type: 'fraternity', status: 'prospect' }),
          });
          if (orgRes.ok) {
            const org = await orgRes.json();
            orgId = org.id;
          }
        }

        if (orgId) {
          const dealRes = await fetch('/api/pipeline/deals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ org_id: orgId, stage: 'lead', value: 0, deal_type: 'local' }),
          });
          if (dealRes.ok) {
            const deal = await dealRes.json();
            newRow.dealId = deal.id;
            newRow.orgId = orgId;
            dealsCreated++;
          }
        }
      } catch (err) {
        console.error('[csv-import] deal creation failed for', chapterName, err);
      }

      newRows.push(newRow);
    }

    const updatedRows = [...campaign.rows, ...newRows];
    onUpdateCampaignMeta(campaign.id, updatedRows, schoolId);
    setCsvState({ importing: false, progress: rows.length, total: rows.length, summary: { imported: newRows.length, deals: dealsCreated } });
  }

  return (
    <div style={{ borderTop: '1px solid #E5E7EB' }}>
      {/* Campaign controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#F9FAFB' }}>
        <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{campaign.rows.length} rows</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => onUpdateCampaign(campaign.id, {
            status: campaign.status === 'active' ? 'paused' : 'active',
          })}
          className="module-filter-btn"
          style={{ fontSize: '0.75rem', padding: '4px 10px' }}
        >
          {campaign.status === 'active' ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={() => onUpdateCampaign(campaign.id, { status: 'completed' })}
          className="module-filter-btn"
          style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <Check size={11} /> Complete
        </button>
      </div>

      {/* Sheet table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="module-table">
          <thead>
            <tr>
              <th>Chapter</th>
              <th>Status</th>
              <th>Method</th>
              <th>Contact</th>
              <th>Contact Info</th>
              <th>Source URL</th>
              <th style={{ textAlign: 'center' }}>Booked</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {campaign.rows.map(row => (
              <CampaignRowItem key={row.id} row={row} campaignId={campaign.id}
                onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: Add row + CSV import */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => onAddRow(campaign.id)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', color: '#0F172A', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <Plus size={14} /> Add Chapter
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={csvState.importing}
            className="module-filter-btn"
            style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <FileUp size={13} />
            {csvState.importing ? `Importing ${csvState.progress}/${csvState.total}…` : 'Import CSV'}
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleCsvImport}
          />
          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
            CSV format: chapter_name, contact_name, contact_info, method, source_url
          </span>
        </div>

        {csvState.summary && (
          <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
            Imported {csvState.summary.imported} chapters, created {csvState.summary.deals} deals
          </span>
        )}
      </div>
    </div>
  );
}

function CampaignCard({
  campaign, expanded, onToggle, onUpdate, onDelete, onAddRow, onUpdateCampaign, onDeleteCampaign, onUpdateCampaignMeta,
}: {
  campaign: Campaign;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => void;
  onDelete: (campaignId: string, rowId: string) => void;
  onAddRow: (campaignId: string) => void;
  onUpdateCampaign: (id: string, updates: Partial<Campaign>) => void;
  onDeleteCampaign: (id: string) => void;
  onUpdateCampaignMeta: (id: string, rows: CampaignRow[], schoolId?: string) => void;
}) {
  const contacted = campaign.rows.filter(r => r.status !== 'not_contacted').length;
  const total = campaign.rows.length;
  const pct = total > 0 ? Math.round((contacted / total) * 100) : 0;

  const statusBadge = {
    active:    { label: 'Active',    color: '#065f46', bg: '#d1fae5' },
    paused:    { label: 'Paused',    color: '#b45309', bg: '#fef3c7' },
    completed: { label: 'Completed', color: '#6b7280', bg: '#f3f4f6' },
  }[campaign.status];

  const typeBadge = CAMPAIGN_TYPE_BADGE[campaign.type];

  return (
    <div className="module-table-container" style={{ borderRadius: '14px' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}
        onClick={onToggle}
      >
        {/* Type indicator */}
        <div style={{ width: '10px', height: '10px', borderRadius: '9999px', background: typeBadge.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <p style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{campaign.name}</p>
            {campaign.school && campaign.school !== campaign.name && (
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', flexShrink: 0 }}>{campaign.school}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px', color: typeBadge.color, background: typeBadge.bg }}>
              {CAMPAIGN_TYPE_LABELS[campaign.type]}
            </span>
            {total > 0 && (
              <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{contacted}/{total} contacted</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div style={{ width: '80px', flexShrink: 0 }}>
            <div style={{ background: '#F3F4F6', borderRadius: '9999px', height: '6px', overflow: 'hidden' }}>
              <div style={{ height: '6px', borderRadius: '9999px', background: '#10b981', width: `${pct}%` }} />
            </div>
            <p style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '2px', textAlign: 'right' }}>{pct}%</p>
          </div>
        )}

        {/* Status + actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '9999px', color: statusBadge.color, background: statusBadge.bg }}>
            {statusBadge.label}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDeleteCampaign(campaign.id); }}
            style={{ padding: '4px', background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db' }}
            title="Delete campaign"
          >
            <Trash2 size={13} />
          </button>
          {expanded ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronRight size={15} color="#9ca3af" />}
        </div>
      </div>

      {expanded && (
        <ExpandedCampaign
          campaign={campaign}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddRow={onAddRow}
          onUpdateCampaign={onUpdateCampaign}
          onUpdateCampaignMeta={onUpdateCampaignMeta}
        />
      )}
    </div>
  );
}

function CampaignsTab({ stats }: { stats: PipelineStats | null }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const existing = loadCampaigns();
    if (existing.length > 0 || !stats?.recentDeals?.length) {
      setCampaigns(existing);
      return;
    }
    const seenSchools = new Map<string, { id: string; name: string }>();
    for (const d of stats.recentDeals) {
      const school = d.organization?.school;
      if (school && !seenSchools.has(school.id)) seenSchools.set(school.id, school);
    }
    const seeded: Campaign[] = Array.from(seenSchools.values()).map(school => ({
      id: uid(),
      name: school.name,
      type: 'founder_led' as CampaignType,
      school: school.name,
      schoolId: school.id,
      status: 'active' as CampaignStatus,
      rows: stats.recentDeals
        .filter(d => d.organization?.school?.id === school.id)
        .map(d => ({
          id: uid(),
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
    seeded.sort((a, b) => b.rows.length - a.rows.length);
    saveCampaigns(seeded);
    setCampaigns(seeded);
  }, [stats]);

  const persist = useCallback((updated: Campaign[]) => {
    setCampaigns(updated); saveCampaigns(updated);
  }, []);

  // Build school list from stats for the create drawer
  const schoolList = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    stats?.recentDeals.forEach(d => {
      const school = d.organization?.school;
      if (school && !map.has(school.id)) map.set(school.id, { id: school.id, name: school.name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [stats]);

  const unlinkedDealsCount = useMemo(() => {
    const linkedOrgIds = new Set(campaigns.flatMap(c => c.rows.map(r => r.orgId).filter(Boolean)));
    return stats?.recentDeals.filter(d => d.organization?.id && !linkedOrgIds.has(d.organization.id)).length ?? 0;
  }, [campaigns, stats]);

  const filtered = useMemo(() => {
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

  function handleCreate(c: Campaign) {
    const updated = [...campaigns, c];
    persist(updated);
    setExpandedId(c.id);
  }

  function handleUpdateRow(campaignId: string, rowId: string, updates: Partial<CampaignRow>) {
    persist(campaigns.map(c => c.id === campaignId
      ? { ...c, rows: c.rows.map(r => r.id === rowId ? { ...r, ...updates } : r), updatedAt: new Date().toISOString() }
      : c
    ));
  }

  function handleDeleteRow(campaignId: string, rowId: string) {
    persist(campaigns.map(c => c.id === campaignId
      ? { ...c, rows: c.rows.filter(r => r.id !== rowId), updatedAt: new Date().toISOString() }
      : c
    ));
  }

  function handleAddRow(campaignId: string) {
    const newRow: CampaignRow = {
      id: uid(), chapterName: '', status: 'not_contacted', method: 'email',
      contactName: '', contactInfo: '', sourceUrl: '', meetingBooked: false,
    };
    persist(campaigns.map(c => c.id === campaignId
      ? { ...c, rows: [...c.rows, newRow], updatedAt: new Date().toISOString() }
      : c
    ));
  }

  function handleUpdateCampaign(id: string, updates: Partial<Campaign>) {
    persist(campaigns.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c));
  }

  function handleUpdateCampaignMeta(id: string, rows: CampaignRow[], schoolId?: string) {
    persist(campaigns.map(c => c.id === id
      ? { ...c, rows, schoolId: schoolId ?? c.schoolId, updatedAt: new Date().toISOString() }
      : c
    ));
  }

  function handleDeleteCampaign(id: string) {
    persist(campaigns.filter(c => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Unlinked deals callout */}
      {unlinkedDealsCount > 0 && (
        <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: '#374151' }}>
            <AlertCircle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
            <span><strong>{unlinkedDealsCount}</strong> deal{unlinkedDealsCount !== 1 ? 's' : ''} not associated with a campaign.</span>
          </div>
          <button
            onClick={() => setShowCreateDrawer(true)}
            className="module-filter-btn"
            style={{ fontSize: '0.75rem', flexShrink: 0 }}
          >
            Create Campaign
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="module-actions-bar">
        <div className="module-search">
          <Search size={18} />
          <input
            type="text" placeholder="Search campaigns…" value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0 }}><X size={13} /></button>}
        </div>
        <div className="module-actions">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '6px 12px', fontSize: '0.875rem', background: '#ffffff', outline: 'none', fontFamily: 'inherit', color: '#374151' }}>
            <option value="all">All Types</option>
            <option value="founder_led">Founder-Led</option>
            <option value="intern_led">Intern-Led</option>
            <option value="instagram">Instagram</option>
            <option value="ambassador">Ambassador</option>
            <option value="marketing">Marketing</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '6px 12px', fontSize: '0.875rem', background: '#ffffff', outline: 'none', fontFamily: 'inherit', color: '#374151' }}>
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

      {/* Campaign list */}
      {filtered.length === 0 ? (
        <div className="module-table-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: '16px' }}>
          <Target size={32} color="#e5e7eb" />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontWeight: 600, color: '#6B7280', margin: 0 }}>No campaigns yet</p>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '4px' }}>Create your first campaign to start tracking outreach</p>
          </div>
          <button onClick={() => setShowCreateDrawer(true)} className="module-primary-btn">
            <Plus size={15} /> New Campaign
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(campaign => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              expanded={expandedId === campaign.id}
              onToggle={() => setExpandedId(expandedId === campaign.id ? null : campaign.id)}
              onUpdate={handleUpdateRow}
              onDelete={handleDeleteRow}
              onAddRow={handleAddRow}
              onUpdateCampaign={handleUpdateCampaign}
              onDeleteCampaign={handleDeleteCampaign}
              onUpdateCampaignMeta={handleUpdateCampaignMeta}
            />
          ))}
        </div>
      )}

      {showCreateDrawer && (
        <CreateCampaignDrawer
          schools={schoolList}
          onClose={() => setShowCreateDrawer(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

// ─── Tab 3: Next Steps ───────────────────────────────────────────────────────

const NOTES_STORAGE_KEY = 'tb_meeting_notes';

function loadNextSteps(): NextStep[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NextStep[]) : [];
  } catch { return []; }
}

function saveNextSteps(steps: NextStep[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(steps));
}

function NextStepsTab() {
  const [granolaLoading, setGranolaLoading] = useState(true);
  const [granolaError, setGranolaError] = useState<string | null>(null);
  const [granolaSearch, setGranolaSearch] = useState('');
  const [notes, setNotes] = useState<GranolaNote[]>([]);
  const [nextSteps, setNextSteps] = useState<NextStep[]>([]);
  const [stepsFilter, setStepsFilter] = useState<string>('all');
  const [addingForNote, setAddingForNote] = useState<GranolaNote | null>(null);
  const [newStepText, setNewStepText] = useState('');
  const [newStepAssignee, setNewStepAssignee] = useState<'Owen' | 'Ford' | 'Adam' | 'All'>('Owen');
  const [newStepDue, setNewStepDue] = useState('');

  useEffect(() => {
    setNextSteps(loadNextSteps());
    fetch('/api/granola/notes')
      .then(r => r.json())
      .then(d => { setNotes(d.notes || []); if (d.error) setGranolaError(d.error); })
      .catch(() => setGranolaError('Failed to load Granola notes'))
      .finally(() => setGranolaLoading(false));
  }, []);

  const persistSteps = useCallback((updated: NextStep[]) => {
    setNextSteps(updated); saveNextSteps(updated);
  }, []);

  function handleAddStep() {
    if (!addingForNote || !newStepText.trim()) return;
    const step: NextStep = {
      id: uid(),
      noteId: addingForNote.id,
      noteTitle: addingForNote.title || 'Untitled Meeting',
      noteDate: addingForNote.created_at || new Date().toISOString(),
      text: newStepText.trim(),
      assignedTo: newStepAssignee,
      dueDate: newStepDue || undefined,
      done: false,
      createdAt: new Date().toISOString(),
    };
    persistSteps([step, ...nextSteps]);
    setNewStepText(''); setNewStepDue(''); setAddingForNote(null);
  }

  function toggleDone(id: string) {
    persistSteps(nextSteps.map(s => s.id === id ? { ...s, done: !s.done } : s));
  }

  function deleteStep(id: string) {
    persistSteps(nextSteps.filter(s => s.id !== id));
  }

  const filteredNotes = useMemo(() => {
    if (!granolaSearch.trim()) return notes;
    const q = granolaSearch.toLowerCase();
    return notes.filter(n => n.title?.toLowerCase().includes(q));
  }, [notes, granolaSearch]);

  const filteredSteps = useMemo(() => {
    let list = [...nextSteps];
    if (stepsFilter === 'Owen') list = list.filter(s => s.assignedTo === 'Owen' || s.assignedTo === 'All');
    else if (stepsFilter === 'Ford') list = list.filter(s => s.assignedTo === 'Ford' || s.assignedTo === 'All');
    else if (stepsFilter === 'Adam') list = list.filter(s => s.assignedTo === 'Adam' || s.assignedTo === 'All');
    else if (stepsFilter === 'pending') list = list.filter(s => !s.done);
    else if (stepsFilter === 'done') list = list.filter(s => s.done);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [nextSteps, stepsFilter]);

  const assigneeColors: Record<string, string> = { Owen: '#0F172A', Ford: '#2563eb', Adam: '#10b981', All: '#6b7280' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Section A: Granola Meetings */}
      <div className="module-table-container">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', margin: 0 }}>Recent Meetings</p>
          <div className="module-search" style={{ flex: 1, maxWidth: '280px' }}>
            <Search size={14} />
            <input type="text" placeholder="Search meetings…" value={granolaSearch}
              onChange={e => setGranolaSearch(e.target.value)} />
          </div>
        </div>

        {granolaLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: '#9ca3af' }}>
            <RefreshCw size={20} style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }} /> Loading meetings…
          </div>
        ) : granolaError ? (
          <div style={{ padding: '20px' }}>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 16px', fontSize: '0.875rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={15} /> {granolaError}
            </div>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '0.875rem' }}>
            {granolaSearch ? `No meetings matching "${granolaSearch}"` : 'No recent meetings found'}
          </div>
        ) : (
          <div>
            {filteredNotes.map(note => (
              <div key={note.id} style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #F9FAFB' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                    {note.title || 'Untitled Meeting'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '2px' }}>
                    {note.created_at && (
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={10} /> {fmtDateLong(note.created_at)}
                      </span>
                    )}
                    {note.attendees && note.attendees.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Users size={10} color="#d1d5db" />
                        {note.attendees.slice(0, 3).map((a, i) => (
                          <span key={i} style={{ fontSize: '0.7rem', color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: '9999px' }}>
                            {a.name || a.email || 'Unknown'}
                          </span>
                        ))}
                        {note.attendees.length > 3 && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>+{note.attendees.length - 3}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setAddingForNote(addingForNote?.id === note.id ? null : note)}
                  className={addingForNote?.id === note.id ? 'module-primary-btn' : 'module-filter-btn'}
                  style={{ fontSize: '0.75rem', padding: '6px 12px', flexShrink: 0 }}
                >
                  Add Next Steps
                </button>
              </div>
            ))}
          </div>
        )}

        {addingForNote && (
          <div style={{ borderTop: '1px solid #E5E7EB', padding: '16px 20px', background: '#FFFBF5', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', margin: 0 }}>
              Adding next steps for: <span style={{ color: '#111827' }}>{addingForNote.title || 'Untitled'}</span>
            </p>
            <textarea
              value={newStepText} onChange={e => setNewStepText(e.target.value)}
              placeholder="Next step text…" rows={2}
              style={{ width: '100%', fontSize: '0.875rem', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '10px 12px', outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['Owen', 'Ford', 'Adam', 'All'] as const).map(name => (
                  <button key={name} onClick={() => setNewStepAssignee(name)}
                    style={{
                      fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
                      background: newStepAssignee === name ? assigneeColors[name] : '#ffffff',
                      color: newStepAssignee === name ? '#ffffff' : '#374151',
                      border: `1px solid ${newStepAssignee === name ? assigneeColors[name] : '#E5E7EB'}`,
                    }}>
                    {name}
                  </button>
                ))}
              </div>
              <input type="date" value={newStepDue} onChange={e => setNewStepDue(e.target.value)}
                style={{ fontSize: '0.75rem', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '4px 10px', outline: 'none', fontFamily: 'inherit' }} />
              <div style={{ flex: 1 }} />
              <button onClick={() => setAddingForNote(null)} style={{ fontSize: '0.75rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleAddStep} disabled={!newStepText.trim()} className="module-primary-btn" style={{ fontSize: '0.75rem', padding: '6px 14px', opacity: newStepText.trim() ? 1 : 0.5 }}>
                Add Step
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section B: Next Steps Board */}
      <div className="module-table-container">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', margin: 0 }}>Next Steps</p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['all', 'pending', 'done', 'Owen', 'Ford', 'Adam'].map(f => (
              <button key={f} onClick={() => setStepsFilter(f)}
                style={{
                  fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                  background: stepsFilter === f ? '#0F172A' : '#F3F4F6',
                  color: stepsFilter === f ? '#ffffff' : '#6B7280',
                  border: 'none',
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {filteredSteps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '0.875rem' }}>
            No next steps yet. Add them from meetings above.
          </div>
        ) : (
          <table className="module-table">
            <thead>
              <tr>
                <th>Meeting</th>
                <th>Next Step</th>
                <th>Assigned To</th>
                <th style={{ textAlign: 'right' }}>Due Date</th>
                <th style={{ textAlign: 'center' }}>Done</th>
              </tr>
            </thead>
            <tbody>
              {filteredSteps.map(step => (
                <tr key={step.id} style={{ opacity: step.done ? 0.6 : 1 }}>
                  <td style={{ maxWidth: '140px' }}>
                    <p style={{ fontSize: '0.75rem', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{step.noteTitle}</p>
                  </td>
                  <td>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', textDecoration: step.done ? 'line-through' : 'none', margin: 0 }}>{step.text}</p>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', color: '#ffffff', background: assigneeColors[step.assignedTo] }}>
                      {step.assignedTo}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>{step.dueDate ? fmtDate(step.dueDate) : '—'}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <button
                        onClick={() => toggleDone(step.id)}
                        style={{
                          width: '20px', height: '20px', borderRadius: '4px',
                          border: `2px solid ${step.done ? '#10b981' : '#d1d5db'}`,
                          background: step.done ? '#10b981' : 'transparent',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}
                      >
                        {step.done && <Check size={11} color="#fff" />}
                      </button>
                      <button onClick={() => deleteStep(step.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Tab 4: Client Map ────────────────────────────────────────────────────────

function MapTooltip({ stateAbbr, data, x, y }: {
  stateAbbr: string; data: StateData | null; x: number; y: number;
}) {
  return (
    <div
      style={{ position: 'fixed', left: x + 14, top: y - 14, zIndex: 100, background: '#0F172A', color: '#ffffff', fontSize: '0.75rem', borderRadius: '12px', padding: '10px 14px', pointerEvents: 'none', minWidth: '160px' }}
    >
      <p style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '6px', margin: '0 0 6px 0' }}>{stateAbbr}</p>
      {data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', color: 'rgba(255,255,255,0.8)' }}>
          {data.activeClients > 0 && <p style={{ margin: 0 }}>{data.activeClients} active client{data.activeClients !== 1 ? 's' : ''}</p>}
          {data.pipelineDeals > 0 && <p style={{ margin: 0 }}>{data.pipelineDeals} deal{data.pipelineDeals !== 1 ? 's' : ''}</p>}
          {data.pipelineValue > 0 && <p style={{ margin: 0 }}>{fmt$(data.pipelineValue)}</p>}
          {data.activeClients === 0 && data.pipelineDeals === 0 && <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)' }}>No activity yet</p>}
        </div>
      ) : (
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)' }}>No activity yet</p>
      )}
    </div>
  );
}

function USPipelineMap({ schools, selectedState, onStateClick }: {
  schools: MapSchool[];
  selectedState: string | null;
  onStateClick: (state: string | null) => void;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; stateAbbr: string } | null>(null);

  useEffect(() => { setIsMounted(true); }, []);

  const stateDataMap = useMemo<Record<string, StateData>>(() => {
    const map: Record<string, StateData> = {};
    for (const school of schools) {
      if (!school.state) continue;
      const st = school.state.toUpperCase().trim();
      if (!map[st]) map[st] = { status: 'not_contacted', activeClients: 0, pipelineDeals: 0, pipelineValue: 0 };
      if (school.status === 'active_client') {
        map[st].activeClients += school.activeChapters.length;
        map[st].status = 'active_client';
      } else if (school.status === 'in_pipeline' && map[st].status !== 'active_client') {
        map[st].status = 'in_pipeline';
      }
      map[st].pipelineDeals += school.dealCount;
      map[st].pipelineValue += school.pipelineValue;
    }
    return map;
  }, [schools]);

  function getStateFill(stateAbbr: string): string {
    if (selectedState === stateAbbr) return '#0F172A';
    const data = stateDataMap[stateAbbr];
    if (!data) return '#e5e7eb';
    switch (data.status) {
      case 'active_client': return 'rgba(16, 185, 129, 0.8)';
      case 'in_pipeline':   return 'rgba(15, 23, 42, 0.4)';
      default:              return '#e5e7eb';
    }
  }

  return (
    <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={15} color="#059669" />
          </div>
          <div>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', margin: 0 }}>US Pipeline Map</p>
            <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{selectedState ? `${selectedState} selected · click to clear` : 'Click a state to filter'}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', background: '#d1fae5', color: '#065f46' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#10b981' }} /> Active Client
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', background: '#f1f5f9', color: '#475569' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#94a3b8' }} /> In Pipeline
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', background: '#F3F4F6', color: '#6B7280' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '9999px', background: '#d1d5db' }} /> Not Contacted
            </span>
          </div>
          {selectedState && (
            <button onClick={() => onStateClick(null)} className="module-filter-btn" style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <X size={10} /> Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '8px 16px 16px' }}>
        {isMounted ? (
          <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 1000 }}
            width={800} height={460} style={{ width: '100%', height: 'auto' }}>
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map(geo => {
                  const stateName = (geo.properties?.name ?? '') as string;
                  const stateAbbr = STATE_NAME_TO_ABBR[stateName] ?? '';
                  const isSelected = selectedState === stateAbbr;
                  const fill = getStateFill(stateAbbr);
                  return (
                    <Geography key={geo.rsmKey} geography={geo} fill={fill} stroke="#fff" strokeWidth={0.5}
                      style={{
                        default: { outline: 'none', cursor: stateAbbr ? 'pointer' : 'default' } as React.CSSProperties,
                        hover:   { fill: isSelected ? '#1e293b' : '#0F172A', outline: 'none', opacity: 0.85, cursor: 'pointer' } as React.CSSProperties,
                        pressed: { outline: 'none' } as React.CSSProperties,
                      }}
                      onClick={() => { if (stateAbbr) onStateClick(isSelected ? null : stateAbbr); }}
                      onMouseEnter={(e: any) => { if (stateAbbr) setTooltip({ x: e.clientX, y: e.clientY, stateAbbr }); }}
                      onMouseMove={(e: any) => { setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null); }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        ) : (
          <div style={{ height: '288px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '9999px', border: '2px solid transparent', borderBottomColor: '#0F172A', animation: 'spin 1s linear infinite' }} />
          </div>
        )}
      </div>
      {tooltip && <MapTooltip stateAbbr={tooltip.stateAbbr} data={stateDataMap[tooltip.stateAbbr] ?? null} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

function StateDealPanel({ stateAbbr, deals, onClose }: {
  stateAbbr: string;
  deals: Deal[];
  onClose: () => void;
}) {
  const stateDeals = useMemo(
    () => deals.filter(d => d.organization?.school?.state?.toUpperCase() === stateAbbr),
    [deals, stateAbbr]
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ width: '420px', background: '#ffffff', display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #E5E7EB' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
          <div>
            <h2 style={{ fontWeight: 700, color: '#111827', fontSize: '1rem', margin: 0 }}>{stateAbbr} Pipeline</h2>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', marginTop: '2px' }}>{stateDeals.length} deal{stateDeals.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '4px', borderRadius: '8px' }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {stateDeals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: '0.875rem' }}>No active deals in {stateAbbr}</div>
          ) : (
            stateDeals.map(deal => (
              <div key={deal.id} style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{deal.organization?.name || '—'}</p>
                    <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: '2px 0 0 0' }}>{deal.organization?.school?.name || '—'}</p>
                  </div>
                  <Link href="/nucleus/pipeline" style={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 600, padding: '6px 12px', borderRadius: '8px', background: '#0F172A', color: '#ffffff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    View Deal
                  </Link>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <StageBadge stage={deal.stage} />
                  <TempBadge temp={deal.temperature} />
                  <RepChip name={deal.assigned_to} />
                  {deal.value && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827' }}>{fmt$(deal.value)}</span>}
                  {deal.next_followup && (
                    <span style={{ fontSize: '0.75rem', marginLeft: 'auto', ...followupStyle(deal.next_followup), display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={10} />{fmtDate(deal.next_followup)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterRow({ org, type, outreachEntry, onLogContact, onViewDeal }: {
  org: OrgEntry; type: 'fraternity' | 'sorority';
  outreachEntry: OutreachEntry | undefined;
  onLogContact: (org: OrgEntry, type: 'fraternity' | 'sorority') => void;
  onViewDeal: (org: OrgEntry) => void;
}) {
  const status: OutreachStatus = outreachEntry?.status ?? 'not_contacted';
  const statusCfg = OUTREACH_STATUS_CONFIG[status];
  const primaryDeal = org.deals[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 20px', borderBottom: '1px solid #F9FAFB' }}>
      <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{org.name}</span>
      <span style={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: '9999px', border: `1px solid ${statusCfg.border}`, color: statusCfg.color, background: statusCfg.bg }}>
        {statusCfg.label}
      </span>
      {outreachEntry && <MethodPill method={outreachEntry.method} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <button onClick={() => onLogContact(org, type)} className="module-primary-btn" style={{ fontSize: '0.75rem', padding: '6px 10px', gap: '4px' }}>
          <Plus size={11} /> Log
        </button>
        <button onClick={() => onViewDeal(org)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit',
            background: primaryDeal ? '#0F172A' : '#ffffff',
            color: primaryDeal ? '#ffffff' : '#6B7280',
            border: `1px solid ${primaryDeal ? '#0F172A' : '#E5E7EB'}`,
          }}>
          Deal
        </button>
      </div>
    </div>
  );
}

function ChapterSection({ label, orgs, type, outreachLog, onLogContact, onViewDeal }: {
  label: string; orgs: OrgEntry[]; type: 'fraternity' | 'sorority';
  outreachLog: OutreachLog;
  onLogContact: (org: OrgEntry, type: 'fraternity' | 'sorority') => void;
  onViewDeal: (org: OrgEntry) => void;
}) {
  const contactedCount = orgs.filter(o => { const e = outreachLog[o.id]; return e && e.status !== 'not_contacted'; }).length;
  const labelColor = type === 'fraternity' ? '#1d4ed8' : '#be185d';
  const labelBg = type === 'fraternity' ? '#eff6ff' : '#fdf2f8';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 10px', borderRadius: '8px', color: labelColor, background: labelBg }}>
          {label}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{contactedCount}/{orgs.length} contacted</span>
        {contactedCount === orgs.length && orgs.length > 0 && <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>All done!</span>}
      </div>
      {orgs.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center' }}><p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>No {label.toLowerCase()} linked yet</p></div>
      ) : orgs.map(org => (
        <ChapterRow key={org.id} org={org} type={type} outreachEntry={outreachLog[org.id]}
          onLogContact={onLogContact} onViewDeal={onViewDeal} />
      ))}
    </div>
  );
}

function LogContactDrawer({ org, orgType, schoolName, onClose, onSaved }: {
  org: OrgEntry; orgType: 'fraternity' | 'sorority'; schoolName: string;
  onClose: () => void; onSaved: (orgId: string, entry: OutreachEntry) => void;
}) {
  const [contactType, setContactType] = useState<ContactType>('president');
  const [method, setMethod] = useState<OutreachMethod>('email');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [meetingBooked, setMeetingBooked] = useState(false);
  const [createDeal, setCreateDeal] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      let dealId: string | undefined;
      if (createDeal) {
        const noteParts = [notes, sourceUrl && `Source: ${sourceUrl}`, contactInfo && `Contact: ${contactInfo}`].filter(Boolean);
        const res = await fetch('/api/pipeline/deals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: org.id, stage: meetingBooked ? 'demo_booked' : 'lead', value: 0, deal_type: orgType, notes: noteParts.join('\n') || null }),
        });
        if (res.ok) { const deal = await res.json(); dealId = deal.id; }
      }
      const entry: OutreachEntry = {
        status: meetingBooked ? 'demo_booked' : 'contacted', method, contactType,
        contactedAt: new Date().toISOString(), notes, dealId,
        sourceUrl: sourceUrl || undefined, contactInfo: contactInfo || undefined, meetingBooked,
      };
      onSaved(org.id, entry);
      onClose();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  const methodOptions: { value: OutreachMethod; label: string; icon: React.ReactNode }[] = [
    { value: 'email', label: 'Email', icon: <Mail size={14} /> },
    { value: 'text', label: 'Text', icon: <MessageSquare size={14} /> },
    { value: 'instagram_dm', label: 'IG DM', icon: <Instagram size={14} /> },
  ];

  const contactOptions: { value: ContactType; label: string }[] = [
    { value: 'president', label: 'President' }, { value: 'alumni_chair', label: 'Alumni Chair' },
    { value: 'rush_chair', label: 'Rush Chair' }, { value: 'other', label: 'Other' },
  ];

  const selectedBtnStyle = { background: '#0F172A', color: '#ffffff', border: '1px solid #0F172A' };
  const unselectedBtnStyle = { background: '#ffffff', color: '#374151', border: '1px solid #E5E7EB' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ width: '440px', background: '#ffffff', display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #E5E7EB' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
          <div>
            <h2 style={{ fontWeight: 700, color: '#111827', fontSize: '1rem', margin: 0 }}>Log Contact</h2>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', marginTop: '2px' }}>{org.name} · {schoolName}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '4px', borderRadius: '8px' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Who did you reach?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {contactOptions.map(opt => (
                <button key={opt.value} onClick={() => setContactType(opt.value)}
                  style={{ ...(contactType === opt.value ? selectedBtnStyle : unselectedBtnStyle), padding: '8px 12px', fontSize: '0.875rem', borderRadius: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Contact Method</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {methodOptions.map(opt => (
                <button key={opt.value} onClick={() => setMethod(opt.value)}
                  style={{ ...(method === opt.value ? selectedBtnStyle : unselectedBtnStyle), flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', fontSize: '0.875rem', borderRadius: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Contact Info</label>
            <div style={{ position: 'relative' }}>
              <Phone size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input type="text" value={contactInfo} onChange={e => setContactInfo(e.target.value)}
                placeholder="Phone number or @instagram handle"
                style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', fontSize: '0.875rem', border: '1px solid #E5E7EB', borderRadius: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Source URL</label>
            <div style={{ position: 'relative' }}>
              <Link2 size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
                placeholder="Instagram profile, chapter website, etc."
                style={{ width: '100%', paddingLeft: '36px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px', fontSize: '0.875rem', border: '1px solid #E5E7EB', borderRadius: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened? Key details..." rows={3}
              style={{ width: '100%', fontSize: '0.875rem', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '10px 12px', outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '12px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
            <div style={{ position: 'relative', marginTop: '2px' }}>
              <input type="checkbox" checked={meetingBooked} onChange={e => setMeetingBooked(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: meetingBooked ? 'none' : '2px solid #D1D5DB', background: meetingBooked ? '#0F172A' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {meetingBooked && <Check size={12} color="white" />}
              </div>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', margin: 0 }}>Meeting / demo booked</p>
              <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: '2px 0 0 0' }}>Sets deal stage to Demo Booked automatically</p>
            </div>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', padding: '12px', borderRadius: '12px', border: '1px solid #E5E7EB' }}>
            <div style={{ position: 'relative', marginTop: '2px' }}>
              <input type="checkbox" checked={createDeal} onChange={e => setCreateDeal(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: createDeal ? 'none' : '2px solid #D1D5DB', background: createDeal ? '#0F172A' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {createDeal && <Check size={12} color="white" />}
              </div>
            </div>
            <div>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', margin: 0 }}>Create pipeline deal</p>
              <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: '2px 0 0 0' }}>Add this chapter as a new lead in the pipeline</p>
            </div>
          </label>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#374151', background: 'white', border: '1px solid #E5E7EB', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 700, color: 'white', background: saving ? '#9ca3af' : '#0F172A', border: 'none', borderRadius: '12px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving...' : 'Save Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── View Deal Drawer ───────────────────────────────────────────────────────
function ViewDealDrawer({ org, onClose, onSaved }: { org: OrgEntry; onClose: () => void; onSaved: () => void }) {
  const primaryDeal = org.deals[0];
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState('');
  const [temperature, setTemperature] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!primaryDeal) { setLoading(false); return; }
    fetch(`/api/pipeline/deals/${primaryDeal.id}`)
      .then(r => r.json()).then(d => { setDeal(d); setStage(d.stage ?? 'lead'); setTemperature(d.temperature ?? ''); setNextFollowup(d.next_followup ?? ''); setNotes(d.notes ?? ''); })
      .catch(console.error).finally(() => setLoading(false));
  }, [primaryDeal]);

  async function handleSave() {
    if (!deal) return;
    setSaving(true);
    try {
      await fetch(`/api/pipeline/deals/${deal.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage, temperature: temperature || null, next_followup: nextFollowup || null, notes: notes || null }) });
      onSaved(); onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  const cardStyle = { background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: '8px' };
  const inputStyle = { width: '100%', padding: '10px 12px', fontSize: '0.875rem', border: '1px solid #E5E7EB', borderRadius: '12px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)' }} onClick={onClose} />
      <div style={{ width: '420px', background: 'white', display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #E5E7EB' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>Pipeline Deal</h2>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: '2px 0 0 0' }}>{org.name}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px', borderRadius: '8px' }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {loading ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '160px' }}><RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} /></div>
          : !deal ? <div style={{ textAlign: 'center', padding: '48px 0' }}><Building2 size={28} color="#D1D5DB" style={{ margin: '0 auto 12px' }} /><p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>No deal found</p></div>
          : <>
            <div><label style={labelStyle}>Stage</label>
              <div style={{ position: 'relative' }}>
                <select value={stage} onChange={e => setStage(e.target.value)} style={{ ...inputStyle, paddingRight: '32px', appearance: 'none' }}>
                  {STAGE_OPTIONS_MAP.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
              </div>
            </div>
            <div><label style={labelStyle}>Temperature</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {TEMP_OPTIONS_MAP.map(opt => (
                  <button key={opt.value} onClick={() => setTemperature(opt.value === temperature ? '' : opt.value)}
                    style={{ flex: 1, padding: '8px', fontSize: '0.875rem', borderRadius: '12px', border: temperature === opt.value ? 'none' : '1px solid #E5E7EB', background: temperature === opt.value ? '#0F172A' : 'white', color: temperature === opt.value ? 'white' : '#374151', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div><label style={labelStyle}>Next Follow-up</label>
              <div style={{ position: 'relative' }}>
                <Calendar size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="date" value={nextFollowup} onChange={e => setNextFollowup(e.target.value)} style={{ ...inputStyle, paddingLeft: '36px' }} />
              </div>
            </div>
            <div><label style={labelStyle}>Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Deal notes, context, next steps..." rows={4}
                style={{ ...inputStyle, resize: 'none' }} />
            </div>
          </>}
        </div>
        {deal && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 500, color: '#374151', background: 'white', border: '1px solid #E5E7EB', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '10px', fontSize: '0.875rem', fontWeight: 700, color: 'white', background: saving ? '#9ca3af' : '#0F172A', border: 'none', borderRadius: '12px', cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Client Map Tab ────────────────────────────────────────────────────────
function ClientMapTab({ statsDeals }: { statsDeals: Deal[] }) {
  const [mapSchools, setMapSchools] = useState<MapSchool[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<MapSchool | null>(null);
  const [outreachLog, setOutreachLog] = useState<OutreachLog>({});
  const [logContactOrg, setLogContactOrg] = useState<{ org: OrgEntry; type: 'fraternity' | 'sorority' } | null>(null);
  const [viewDealOrg, setViewDealOrg] = useState<OrgEntry | null>(null);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [stateDeals, setStateDeals] = useState<Deal[]>([]);
  const [showStatePanel, setShowStatePanel] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem('tb_outreach_log'); if (s) setOutreachLog(JSON.parse(s)); } catch {}
    fetch('/api/pipeline/schools').then(r => r.json()).then(d => setMapSchools(Array.isArray(d) ? d : [])).catch(console.error);
  }, []);

  function handleStateClick(state: string | null) {
    setSelectedState(state);
    if (state) {
      const deals = statsDeals.filter(d => d.organization?.school?.state?.toUpperCase() === state.toUpperCase());
      setStateDeals(deals);
      setShowStatePanel(true);
    } else {
      setShowStatePanel(false);
    }
  }

  function handleOutreachSaved(orgId: string, entry: OutreachEntry) {
    const next = { ...outreachLog, [orgId]: entry };
    setOutreachLog(next);
    try { localStorage.setItem('tb_outreach_log', JSON.stringify(next)); } catch {}
  }

  const filteredSchools = useMemo(() => {
    if (!schoolSearch.trim()) return mapSchools;
    const q = schoolSearch.toLowerCase();
    return mapSchools.filter(s => s.name.toLowerCase().includes(q));
  }, [mapSchools, schoolSearch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* US Map */}
      <USPipelineMap schools={mapSchools} selectedState={selectedState} onStateClick={handleStateClick} />

      {/* State deals panel */}
      {showStatePanel && selectedState && (
        <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', margin: 0 }}>Deals in {selectedState} <span style={{ fontSize: '0.8125rem', color: '#6B7280', fontWeight: 400 }}>({stateDeals.length})</span></h3>
            <button onClick={() => { setShowStatePanel(false); setSelectedState(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
          </div>
          <div className="module-table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="module-table">
              <thead><tr><th>Org</th><th>School</th><th>Stage</th><th>Rep</th><th>Value</th><th>Followup</th></tr></thead>
              <tbody>
                {stateDeals.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af', padding: '24px' }}>No deals in this state</td></tr>
                ) : stateDeals.map(deal => {
                  const displayName = resolveRep(deal.assigned_to) ?? deal.assigned_to ?? '—';
                  const repColor = getRepColor(displayName);
                  return (
                    <tr key={deal.id}>
                      <td style={{ fontWeight: 600, color: '#111827' }}>{deal.organization?.name ?? '—'}</td>
                      <td style={{ color: '#6B7280' }}>{deal.organization?.school?.name ?? '—'}</td>
                      <td><StageBadge stage={deal.stage} /></td>
                      <td>{deal.assigned_to ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 8px 2px 2px', borderRadius: '20px', background: repColor, color: 'white', fontSize: '0.75rem', fontWeight: 600 }}><span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700 }}>{getRepInitials(displayName)}</span>{displayName}</span> : '—'}</td>
                      <td style={{ color: '#111827', fontWeight: 600 }}>{deal.value ? fmt$(deal.value) : '—'}</td>
                      <td style={{ color: !deal.next_followup ? '#6B7280' : deal.next_followup < todayISO() ? '#ef4444' : deal.next_followup === todayISO() ? '#d97706' : '#6B7280' }}>{fmtDate(deal.next_followup)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* School search + drill-down */}
      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', margin: 0 }}>School Outreach</h3>
          {selectedSchool && <button onClick={() => setSelectedSchool(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>}
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <div className="module-search" style={{ maxWidth: '400px' }}>
            <Search size={16} />
            <input type="text" value={schoolSearch} onChange={e => { setSchoolSearch(e.target.value); setSelectedSchool(null); }} placeholder="Search for a school..." />
          </div>
          {schoolSearch && !selectedSchool && (
            <div style={{ marginTop: '8px', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              {filteredSchools.slice(0, 6).map(school => (
                <button key={school.id} onClick={() => { setSelectedSchool(school); setSchoolSearch(''); }}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: '0.875rem', background: 'white', border: 'none', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', fontFamily: 'inherit' }}>
                  <span style={{ fontWeight: 500, color: '#111827' }}>{school.name}</span>
                  <span style={{ color: '#9ca3af' }}>{school.fraternities.length + school.sororities.length} orgs</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedSchool ? (
          <div>
            <div style={{ padding: '12px 20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', margin: 0 }}>{selectedSchool.name}</p>
              <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: '2px 0 0 0' }}>{selectedSchool.state ?? ''}{selectedSchool.conference ? ` · ${selectedSchool.conference}` : ''}</p>
            </div>
            <ChapterSection label="Fraternities" orgs={selectedSchool.fraternities} type="fraternity" outreachLog={outreachLog}
              onLogContact={(o, t) => setLogContactOrg({ org: o, type: t })} onViewDeal={o => setViewDealOrg(o)} />
            <ChapterSection label="Sororities" orgs={selectedSchool.sororities} type="sorority" outreachLog={outreachLog}
              onLogContact={(o, t) => setLogContactOrg({ org: o, type: t })} onViewDeal={o => setViewDealOrg(o)} />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '48px', color: '#9ca3af' }}>
            <MapPin size={28} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#6B7280', margin: 0 }}>Select a school to see all chapters</p>
          </div>
        )}
      </div>

      {logContactOrg && selectedSchool && (
        <LogContactDrawer org={logContactOrg.org} orgType={logContactOrg.type} schoolName={selectedSchool.name}
          onClose={() => setLogContactOrg(null)} onSaved={handleOutreachSaved} />
      )}
      {viewDealOrg && <ViewDealDrawer org={viewDealOrg} onClose={() => setViewDealOrg(null)} onSaved={() => {}} />}
    </div>
  );
}

// ── Constants referenced in drawers ──────────────────────────────────────
const STAGE_OPTIONS_MAP = [
  { value: 'lead', label: 'New Lead' }, { value: 'demo_booked', label: 'Demo Booked' },
  { value: 'first_demo', label: 'First Demo' }, { value: 'second_call', label: 'Second Call' },
  { value: 'contract_sent', label: 'Contract Sent' }, { value: 'closed_won', label: 'Closed Won' },
];
const TEMP_OPTIONS_MAP = [
  { value: 'hot', label: '🔥 Hot' }, { value: 'warm', label: '🟡 Warm' }, { value: 'cold', label: '🧊 Cold' },
];

// ── Main Page ──────────────────────────────────────────────────────────────
type Tab = 'dashboard' | 'campaigns' | 'notes' | 'map';
const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'notes',     label: 'Next Steps' },
  { id: 'map',       label: 'Client Map' },
];

export default function WarRoomPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/stats');
      if (!res.ok) throw new Error('Failed');
      const data: PipelineStats = await res.json();
      setStats(data);
      setLastRefreshed(new Date());
    } catch (err) { console.error('[war-room] stats fetch error:', err); }
    finally { setStatsLoading(false); }
  }, []);

  useEffect(() => {
    fetchStats();
    refreshRef.current = setInterval(fetchStats, 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchStats]);

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>
      {/* Sticky Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(249,250,251,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', margin: 0 }}>War Room</h1>
              <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>Live sales intelligence</span>
              {statsLoading && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {lastRefreshed && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
              <button onClick={() => { setStatsLoading(true); fetchStats(); }}
                className="module-filter-btn" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '4px', overflowX: 'auto' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ flexShrink: 0, padding: '10px 20px', fontSize: '0.875rem', fontWeight: tab === t.id ? 600 : 500, color: tab === t.id ? '#111827' : '#6B7280', background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid #0F172A' : '2px solid transparent', cursor: 'pointer', fontFamily: 'inherit', marginBottom: '-1px', transition: 'all 0.15s' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
        {tab === 'dashboard'  && <DashboardTab stats={stats} />}
        {tab === 'campaigns'  && <CampaignsTab stats={stats} />}
        {tab === 'notes'      && <NextStepsTab />}
        {tab === 'map'        && <ClientMapTab statsDeals={stats?.recentDeals ?? []} />}
      </div>
    </div>
  );
}
