'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const DealEditPanel = dynamic(() => import('@/app/nucleus/pipeline/DealEditPanel'), { ssr: false });
import { ComposableMap, Geographies, Geography as GeographyBase } from 'react-simple-maps';
const Geography = GeographyBase as any;
import {
  RefreshCw, MapPin, Calendar, Phone, Search, X,
  ChevronDown, ChevronUp, Plus, Trash2, Check,
  AlertCircle, Clock, Users, Building2, DollarSign,
  TrendingUp, ChevronRight, Mail, MessageSquare,
  Instagram, Upload, CheckCircle2, Link2,
  Target, ExternalLink, Zap, BarChart3,
  ArrowLeft, LayoutDashboard, FileUp, Edit3,
  CalendarCheck,
} from 'lucide-react';
import { STAGE_CONFIG, DealStage } from '@/lib/supabase';
import { CampaignCRM } from './CampaignCRM';
import { SalesCRM } from './SalesCRM';

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
  closedDealCount?: number;
  closedChapters?: string[];
  schoolsInConversation: number;
  demosLast7: number;
  demosLast14: number;
  decisionCalls: number;
  // Legacy compat
  demosNext7?: number;
  demosNext14?: number;
  decisionsNext7?: number;
  decisionsNext14?: number;
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
  timing:        { label: 'Bad Timing',    color: '#6d28d9', bg: '#f5f3ff' },
  contract_sent: { label: 'Contract Sent', color: '#b45309', bg: '#fffbeb' },
  closed_won:    { label: 'Closed Won',    color: '#065f46', bg: '#ecfdf5' },
};

const STAGE_OPTIONS = [
  { value: 'lead', label: 'New Lead' }, { value: 'demo_booked', label: 'Demo Booked' },
  { value: 'first_demo', label: 'First Demo' }, { value: 'second_call', label: 'Second Call' },
  { value: 'timing', label: 'Bad Timing' },
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

// ─── Stage ↔ Status mapping ──────────────────────────────────────────────────

function stageToStatus(stage: string): CampaignRow['status'] {
  if (stage === 'closed_won') return 'signed';
  if (['demo_booked', 'first_demo', 'second_call', 'contract_sent'].includes(stage)) return 'demo_booked';
  if (stage === 'lead') return 'not_contacted';
  return 'contacted';
}

function statusToStage(status: CampaignRow['status']): string {
  switch (status) {
    case 'not_contacted': return 'lead';
    case 'demo_booked':   return 'demo_booked';
    case 'signed':        return 'closed_won';
    case 'contacted':     return 'lead';
    default:              return 'lead';
  }
}

// ─── Row Type Classification ──────────────────────────────────────────────────

type RowType = 'client' | 'deal' | 'prospect';

function getRowType(row: CampaignRow, dealStageMap: Record<string, string>): RowType {
  if (row.status === 'signed' || (row.dealId && dealStageMap[row.dealId] === 'closed_won')) {
    return 'client';
  }
  if (row.dealId && dealStageMap[row.dealId] && dealStageMap[row.dealId] !== 'closed_won') {
    return 'deal';
  }
  return 'prospect';
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



function DashboardTab({ stats, onOpenDeal: _onOpenDeal }: { stats: PipelineStats | null; onOpenDeal: (deal: Deal) => void }) {
  const [mapSchools, setMapSchools] = useState<MapSchool[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [stateDeals, setStateDeals] = useState<Deal[]>([]);
  const [showStatePanel, setShowStatePanel] = useState(false);

  useEffect(() => {
    fetch('/api/pipeline/schools').then(r => r.json()).then(d => setMapSchools(Array.isArray(d) ? d : [])).catch(console.error);
  }, []);

  function handleStateClick(state: string | null) {
    setSelectedState(state);
    if (state && stats) {
      const deals = stats.recentDeals.filter(d => d.organization?.school?.state?.toUpperCase() === state.toUpperCase());
      setStateDeals(deals);
      setShowStatePanel(true);
    } else {
      setShowStatePanel(false);
    }
  }

  if (!stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '16rem', color: '#9ca3af' }}>
        <RefreshCw size={24} style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }} />
        Loading stats…
      </div>
    );
  }

  const closedCount = stats.closedDealCount ?? 0;
  const closedChapters = stats.closedChapters ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* 1. Stats Row — most prominent */}
      <div className="module-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {/* Schools in Conversation */}
        <div className="module-stat">
          <span className="module-stat-value" style={{ fontSize: '2.25rem' }}>{stats.schoolsInConversation}</span>
          <span className="module-stat-label">Schools in Conversation</span>
        </div>

        {/* Demos Last 7 Days — blue badge */}
        <div className="module-stat" style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
            borderRadius: '9999px', background: '#dbeafe', color: '#1d4ed8',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>Demo</span>
          <span className="module-stat-value" style={{ fontSize: '2.25rem' }}>{stats.demosLast7}</span>
          <span className="module-stat-label">Demos · Last 7 Days</span>
        </div>

        {/* Demos Last 14 Days — blue badge */}
        <div className="module-stat" style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
            borderRadius: '9999px', background: '#dbeafe', color: '#1d4ed8',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>Demo</span>
          <span className="module-stat-value" style={{ fontSize: '2.25rem' }}>{stats.demosLast14}</span>
          <span className="module-stat-label">Demos · Last 14 Days</span>
        </div>

        {/* Decision Calls — amber badge */}
        <div className="module-stat" style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px',
            borderRadius: '9999px', background: '#fef3c7', color: '#d97706',
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>Decision</span>
          <span className="module-stat-value" style={{ fontSize: '2.25rem' }}>{stats.decisionCalls}</span>
          <span className="module-stat-label">Decision Calls</span>
        </div>
      </div>

      {/* 2. Conference Tracker */}
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

      {/* 3. US Pipeline Map */}
      <USPipelineMap schools={mapSchools} selectedState={selectedState} onStateClick={handleStateClick} />

      {/* State Deal Slide-out Panel */}
      {showStatePanel && selectedState && (
        <StateDealPanel
          stateAbbr={selectedState}
          deals={stateDeals}
          onClose={() => { setShowStatePanel(false); setSelectedState(null); }}
        />
      )}

      {/* 4. Closed Deals — small box below map */}
      <div style={{ background: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '14px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: closedChapters.length > 0 ? '12px' : 0 }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', margin: 0 }}>
            Closed Deals
          </p>
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px',
            borderRadius: '9999px', background: '#d1fae5', color: '#065f46',
          }}>{closedCount}</span>
        </div>
        {closedChapters.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {closedChapters.map((name, i) => (
              <span key={i} style={{
                fontSize: '0.8125rem', fontWeight: 500,
                color: '#374151', background: '#F9FAFB',
                border: '1px solid #E5E7EB', borderRadius: '8px',
                padding: '4px 10px',
              }}>{name}</span>
            ))}
          </div>
        )}
        {closedCount === 0 && (
          <p style={{ fontSize: '0.875rem', color: '#9ca3af', margin: 0 }}>No closed deals yet</p>
        )}
      </div>
    </div>
  );
}

// ─── Tab 2: Campaigns ─────────────────────────────────────────────────────────

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
  const [previewedDeals, setPreviewedDeals] = useState<Deal[]>([]);
  const [fetchingPreview, setFetchingPreview] = useState(false);

  const filteredSchools = useMemo(() => {
    if (!schoolQuery.trim()) return schools.slice(0, 8);
    const q = schoolQuery.toLowerCase();
    return schools.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [schools, schoolQuery]);

  async function handleSchoolSelect(s: { id: string; name: string }) {
    setSchool(s.name);
    setSchoolId(s.id);
    setSchoolQuery(s.name);
    setShowSchoolDrop(false);
    if (!name.trim()) setName(s.name);
    // Fetch existing deals for preview
    setPreviewedDeals([]);
    setFetchingPreview(true);
    try {
      const res = await fetch('/api/pipeline/deals');
      if (res.ok) {
        const allDeals: Deal[] = await res.json();
        const schoolDeals = allDeals.filter(
          d => d.organization?.school?.id === s.id &&
               d.stage !== 'closed_lost'
        );
        setPreviewedDeals(schoolDeals);
      }
    } catch (err) {
      console.error('[create-campaign] deal preview error:', err);
    } finally {
      setFetchingPreview(false);
    }
  }

  function handleCreate() {
    if (!name.trim()) return;
    const rows: CampaignRow[] = previewedDeals.map(d => ({
      id: uid(),
      chapterName: d.organization?.name || '',
      orgId: d.organization?.id,
      dealId: d.id,
      status: stageToStatus(d.stage),
      method: 'email' as OutreachMethod,
      contactName: d.contact?.name || '',
      contactInfo: '',
      sourceUrl: '',
      meetingBooked: d.stage === 'demo_booked' || d.stage === 'first_demo',
    }));
    const campaign: Campaign = {
      id: uid(), name: name.trim(), type, school: school.trim(),
      schoolId: schoolId || undefined,
      status, rows, updatedAt: new Date().toISOString(),
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
            {fetchingPreview && (
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '6px' }}>Checking existing deals…</p>
            )}
            {!fetchingPreview && previewedDeals.length > 0 && (
              <p style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} />
                {previewedDeals.length} existing deal{previewedDeals.length !== 1 ? 's' : ''} will be imported
              </p>
            )}
            {!fetchingPreview && schoolId && previewedDeals.length === 0 && (
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '6px' }}>No existing pipeline deals for this school</p>
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
  row, campaignId, onUpdate, onDelete, onDealCreate, openDeal, dealStageMap, dealValueMap, dealTempMap,
}: {
  row: CampaignRow;
  campaignId: string;
  onUpdate: (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => void;
  onDelete: (campaignId: string, rowId: string) => void;
  onDealCreate?: (campaignId: string, rowId: string) => void;
  openDeal?: (deal: Deal) => void;
  dealStageMap: Record<string, string>;
  dealValueMap: Record<string, number>;
  dealTempMap: Record<string, string>;
}) {
  // Hooks must precede any early returns
  const [showNextSteps, setShowNextSteps] = useState(false);
  const [granolaMatches, setGranolaMatches] = useState<GranolaNote[]>([]);
  const [granolaLoaded, setGranolaLoaded] = useState(false);

  const rowType = getRowType(row, dealStageMap);
  const stage = row.dealId ? dealStageMap[row.dealId] : undefined;
  const dealValue = row.dealId ? dealValueMap[row.dealId] : undefined;
  const dealTemp = row.dealId ? dealTempMap[row.dealId] : undefined;
  const mrr = dealValue ? Math.round(dealValue / 12) : undefined;
  const TEMP_EMOJI: Record<string, string> = { hot: '🔥', warm: '🌡️', cold: '🧊' };

  async function fetchGranolaMatches() {
    if (granolaLoaded) return;
    setGranolaLoaded(true);
    try {
      const res = await fetch('/api/granola/notes');
      if (res.ok) {
        const data = await res.json();
        const allNotes: GranolaNote[] = data.notes || [];
        const chapterLower = row.chapterName.toLowerCase();
        setGranolaMatches(allNotes.filter(n => n.title && n.title.toLowerCase().includes(chapterLower)));
      }
    } catch { /* silent */ }
  }

  // ── Client row ────────────────────────────────────────────────────────────
  if (rowType === 'client') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', background: '#f0fdf4', borderBottom: '1px solid #dcfce7', minHeight: '44px' }}>
        <CheckCircle2 size={16} color="#15803d" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontWeight: 700, color: '#15803d', fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.chapterName || '—'}
        </span>
        <span style={{ flexShrink: 0, fontSize: '0.875rem', fontWeight: 700, color: '#15803d' }}>
          {dealValue
            ? `$${mrr}/mo`
            : <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#dcfce7', padding: '2px 8px', borderRadius: '9999px', color: '#15803d' }}>Active Client</span>
          }
        </span>
        <span style={{ fontSize: '0.8125rem', color: '#6b7280', flexShrink: 0, minWidth: '120px', textAlign: 'right' }}>
          {row.contactName || '—'}
        </span>
      </div>
    );
  }

  // ── Deal row ──────────────────────────────────────────────────────────────
  if (rowType === 'deal') {
    return (
      <div style={{ background: '#ffffff', borderBottom: '1px solid #f3f4f6' }}>
        {/* Main row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', minHeight: '44px' }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: '0.875rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.chapterName || '—'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {stage && <StageBadge stage={stage} />}
            {dealTemp && <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{TEMP_EMOJI[dealTemp] ?? ''}</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button
              onClick={() => { setShowNextSteps(s => !s); if (!showNextSteps) fetchGranolaMatches(); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', background: showNextSteps ? '#F3F4F6' : 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.04em' }}
            >
              Next Steps {showNextSteps ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {row.dealId && openDeal && (
              <button
                onClick={() => openDeal({ id: row.dealId } as Deal)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, padding: '5px 12px', borderRadius: '8px', background: '#0F172A', color: '#ffffff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
              >
                Edit →
              </button>
            )}
          </div>
        </div>
        {/* Collapsible Next Steps */}
        {showNextSteps && (
          <div style={{ padding: '8px 16px 12px', background: '#FAFAFA', borderTop: '1px solid #F3F4F6' }}>
            <p style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9CA3AF', margin: '0 0 6px 0' }}>Next Steps</p>
            <textarea
              value={row.notes || ''}
              onChange={e => onUpdate(campaignId, row.id, { notes: e.target.value })}
              placeholder="Add next steps..."
              rows={2}
              style={{ width: '100%', fontSize: '0.8125rem', border: '1px solid #E5E7EB', borderRadius: '8px', padding: '8px 10px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', color: '#374151', background: '#ffffff', boxSizing: 'border-box' }}
            />
            {granolaMatches.length > 0 && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {granolaMatches.map(note => (
                  <Link key={note.id} href="/nucleus/war-room?tab=notes" style={{ fontSize: '0.75rem', color: '#4B5563', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    📋 {note.title} →
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Prospect row ──────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#fafafa', borderBottom: '1px solid #f3f4f6', minHeight: '44px' }}>
      <div style={{ width: '160px', flexShrink: 0 }}>
        <input type="text" value={row.chapterName}
          onChange={e => onUpdate(campaignId, row.id, { chapterName: e.target.value })}
          onBlur={() => { if (row.chapterName.trim() && row.orgId && !row.dealId) { onDealCreate?.(campaignId, row.id); } }}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', fontSize: '0.875rem', padding: '2px 0', fontFamily: 'inherit' }}
          placeholder="Chapter name" />
      </div>
      <div style={{ width: '120px', flexShrink: 0 }}>
        <select value={row.status}
          onChange={e => onUpdate(campaignId, row.id, { status: e.target.value as CampaignRow['status'] })}
          style={{ background: 'transparent', fontSize: '0.75rem', border: 'none', outline: 'none', fontFamily: 'inherit', width: '100%' }}>
          <option value="not_contacted">Not Contacted</option>
          <option value="contacted">Contacted</option>
          <option value="demo_booked">Demo Booked</option>
          <option value="signed">Signed</option>
        </select>
      </div>
      <div style={{ width: '80px', flexShrink: 0 }}>
        <select value={row.method}
          onChange={e => onUpdate(campaignId, row.id, { method: e.target.value as OutreachMethod })}
          style={{ background: 'transparent', fontSize: '0.75rem', border: 'none', outline: 'none', fontFamily: 'inherit', width: '100%' }}>
          <option value="email">Email</option>
          <option value="text">Text</option>
          <option value="instagram_dm">IG DM</option>
        </select>
      </div>
      <div style={{ width: '120px', flexShrink: 0 }}>
        <input type="text" value={row.contactName}
          onChange={e => onUpdate(campaignId, row.id, { contactName: e.target.value })}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', fontSize: '0.875rem', padding: '2px 0', fontFamily: 'inherit' }}
          placeholder="Name" />
      </div>
      <div style={{ flex: 1, minWidth: '120px' }}>
        <input type="text" value={row.contactInfo}
          onChange={e => onUpdate(campaignId, row.id, { contactInfo: e.target.value })}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', fontSize: '0.875rem', padding: '2px 0', fontFamily: 'inherit' }}
          placeholder="Email / phone" />
      </div>
      <div style={{ flex: 1, minWidth: '130px' }}>
        <input type="text" value={row.sourceUrl}
          onChange={e => onUpdate(campaignId, row.id, { sourceUrl: e.target.value })}
          style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid transparent', outline: 'none', fontSize: '0.875rem', padding: '2px 0', fontFamily: 'inherit' }}
          placeholder="https://..." />
      </div>
      <div style={{ width: '44px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={() => onUpdate(campaignId, row.id, { meetingBooked: !row.meetingBooked })}
          style={{ width: '20px', height: '20px', borderRadius: '4px', border: `1px solid ${row.meetingBooked ? '#0F172A' : '#d1d5db'}`, background: row.meetingBooked ? '#0F172A' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          {row.meetingBooked && <Check size={12} color="#fff" />}
        </button>
      </div>
      <div style={{ flexShrink: 0 }}>
        <button onClick={() => onDelete(campaignId, row.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '2px' }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
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
  campaign, onUpdate, onDelete, onAddRow, onUpdateCampaign, onUpdateCampaignMeta, onDealCreate, openDeal,
  dealStageMap, dealValueMap, dealTempMap,
}: {
  campaign: Campaign;
  onUpdate: (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => void;
  onDelete: (campaignId: string, rowId: string) => void;
  onAddRow: (campaignId: string) => void;
  onUpdateCampaign: (id: string, updates: Partial<Campaign>) => void;
  onUpdateCampaignMeta: (id: string, rows: CampaignRow[], schoolId?: string) => void;
  onDealCreate?: (campaignId: string, rowId: string) => void;
  openDeal?: (deal: Deal) => void;
  dealStageMap: Record<string, string>;
  dealValueMap: Record<string, number>;
  dealTempMap: Record<string, string>;
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

      {/* Sheet — three grouped sections */}
      <div style={{ overflowX: 'auto' }}>
        {(() => {
          const clientRows = campaign.rows.filter(r => getRowType(r, dealStageMap) === 'client');
          const dealRows   = campaign.rows.filter(r => getRowType(r, dealStageMap) === 'deal');
          const prospectRows = campaign.rows.filter(r => getRowType(r, dealStageMap) === 'prospect');
          const rowProps = { campaignId: campaign.id, onUpdate, onDelete, onDealCreate, openDeal, dealStageMap, dealValueMap, dealTempMap };
          return (
            <>
              {/* ── Active Clients ── */}
              {clientRows.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 16px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#15803d' }}>Active Clients</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: '9999px', background: '#15803d', color: '#fff' }}>{clientRows.length}</span>
                  </div>
                  {clientRows.map(row => <CampaignRowItem key={row.id} row={row} {...rowProps} />)}
                </div>
              )}

              {/* ── Pipeline (active deals) ── */}
              {dealRows.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#1e3a5f' }}>Pipeline</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: '9999px', background: '#1e3a5f', color: '#fff' }}>{dealRows.length}</span>
                  </div>
                  {dealRows.map(row => <CampaignRowItem key={row.id} row={row} {...rowProps} />)}
                </div>
              )}

              {/* ── Outreach (prospects) ── */}
              {prospectRows.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#6b7280' }}>Outreach</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: '9999px', background: '#6b7280', color: '#fff' }}>{prospectRows.length}</span>
                  </div>
                  {/* Column header for prospect rows */}
                  <div style={{ display: 'flex', gap: '8px', padding: '5px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6', fontSize: '0.67rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <span style={{ width: '160px', flexShrink: 0 }}>Chapter</span>
                    <span style={{ width: '120px', flexShrink: 0 }}>Status</span>
                    <span style={{ width: '80px', flexShrink: 0 }}>Method</span>
                    <span style={{ width: '120px', flexShrink: 0 }}>Contact</span>
                    <span style={{ flex: 1, minWidth: '120px' }}>Contact Info</span>
                    <span style={{ flex: 1, minWidth: '130px' }}>Source URL</span>
                    <span style={{ width: '44px', flexShrink: 0, textAlign: 'center' }}>Booked</span>
                    <span style={{ flexShrink: 0, width: '24px' }}></span>
                  </div>
                  {prospectRows.map(row => <CampaignRowItem key={row.id} row={row} {...rowProps} />)}
                </div>
              )}

              {campaign.rows.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: '0.875rem' }}>
                  No rows yet — add chapters below
                </div>
              )}
            </>
          );
        })()}
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
  campaign, expanded, onToggle, onUpdate, onDelete, onAddRow, onUpdateCampaign, onDeleteCampaign, onUpdateCampaignMeta, pipelineDeals, onDealCreate, openDeal,
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
  pipelineDeals: Deal[];
  onDealCreate?: (campaignId: string, rowId: string) => void;
  openDeal?: (deal: Deal) => void;
}) {
  const contacted = campaign.rows.filter(r => r.status !== 'not_contacted').length;
  const total = campaign.rows.length;
  const pct = total > 0 ? Math.round((contacted / total) * 100) : 0;

  // Build lookup maps from pipelineDeals
  const dealStageMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of pipelineDeals) map[d.id] = d.stage;
    return map;
  }, [pipelineDeals]);

  const dealValueMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of pipelineDeals) if (d.value) map[d.id] = d.value;
    return map;
  }, [pipelineDeals]);

  const dealTempMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of pipelineDeals) if (d.temperature) map[d.id] = d.temperature;
    return map;
  }, [pipelineDeals]);

  // Determine the best pipeline stage across all rows in this campaign
  const stages = campaign.rows.map(r => r.dealId ? dealStageMap[r.dealId] : null).filter(Boolean) as string[];
  const hasClosedWon = stages.some(s => s === 'closed_won');
  const hasDemoBooked = stages.some(s => s === 'demo_booked' || s === 'first_demo');
  const hasSecondCall = stages.some(s => s === 'second_call');
  const hasContractSent = stages.some(s => s === 'contract_sent');

  // Pipeline status badge — derived from actual deal data, not just campaign.status
  const pipelineBadge = hasClosedWon
    ? { label: 'Active Client', color: '#065f46', bg: '#d1fae5' }
    : hasContractSent
    ? { label: 'Contract Sent', color: '#b45309', bg: '#fef3c7' }
    : hasSecondCall
    ? { label: 'Decision Call', color: '#5b21b6', bg: '#ede9fe' }
    : hasDemoBooked
    ? { label: 'Demo Booked', color: '#1d4ed8', bg: '#dbeafe' }
    : stages.length > 0
    ? { label: 'In Pipeline', color: '#374151', bg: '#f3f4f6' }
    : null;

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
            {total > 0 && (() => {
              const cCount = campaign.rows.filter(r => getRowType(r, dealStageMap) === 'client').length;
              const dCount = campaign.rows.filter(r => getRowType(r, dealStageMap) === 'deal').length;
              const pCount = campaign.rows.filter(r => getRowType(r, dealStageMap) === 'prospect').length;
              return (
                <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                  {cCount > 0 && <span style={{ color: '#15803d', fontWeight: 700 }}>{cCount} client{cCount !== 1 ? 's' : ''}</span>}
                  {cCount > 0 && (dCount > 0 || pCount > 0) && ' · '}
                  {dCount > 0 && <span>{dCount} deal{dCount !== 1 ? 's' : ''}</span>}
                  {dCount > 0 && pCount > 0 && ' · '}
                  {pCount > 0 && <span>{pCount} prospect{pCount !== 1 ? 's' : ''}</span>}
                </span>
              );
            })()}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {pipelineBadge && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', color: pipelineBadge.color, background: pipelineBadge.bg, border: `1px solid ${pipelineBadge.color}30` }}>
              {pipelineBadge.label}
            </span>
          )}
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
          onDealCreate={onDealCreate}
          openDeal={openDeal}
          dealStageMap={dealStageMap}
          dealValueMap={dealValueMap}
          dealTempMap={dealTempMap}
        />
      )}
    </div>
  );
}

function CampaignsTab({ stats, openDeal }: { stats: PipelineStats | null; openDeal?: (deal: Deal) => void }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [allSchools, setAllSchools] = useState<{ id: string; name: string }[]>([]);

  // Fetch full school list for the create drawer
  useEffect(() => {
    fetch('/api/pipeline/schools')
      .then(r => r.json())
      .then((d: any[]) => {
        if (Array.isArray(d)) {
          setAllSchools(d.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch(err => console.error('[campaigns] schools fetch error:', err));
  }, []);

  // Track whether we've already attempted seeding to avoid re-seeding on every render
  const seededRef = useRef(false);

  // Fetch campaigns from API on mount
  useEffect(() => {
    fetch('/api/war-room/campaigns')
      .then(r => r.json())
      .then((raw: unknown) => {
        // Normalize: API returns array or {data: array}
        const arr = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
        // Ensure rows is always an array on each campaign
        const data: Campaign[] = arr.map((c: any) => ({
          ...c,
          rows: Array.isArray(c.rows) ? c.rows : [],
          updatedAt: c.updated_at || c.updatedAt || new Date().toISOString(),
        }));
        setCampaigns(data);
        if (data.length > 0) seededRef.current = true;
      })
      .catch(err => console.error('[campaigns] fetch error:', err))
      .finally(() => setLoading(false));
  }, []);

  // Auto-seed from pipeline stats if API returned 0 campaigns and stats are loaded
  useEffect(() => {
    if (loading) return;
    if (seededRef.current) return;
    if (!stats?.recentDeals?.length) return;
    seededRef.current = true;

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

    // POST each seeded campaign to the API
    Promise.all(seeded.map(c =>
      fetch('/api/war-room/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      }).then(r => r.ok ? r.json() : null)
    )).then(results => {
      const created = results.filter(Boolean) as Campaign[];
      if (created.length > 0) setCampaigns(created);
    }).catch(err => console.error('[campaigns] seed error:', err));
  }, [loading, stats]);

  // Persist a single updated campaign to the API via PATCH
  const persistOne = useCallback(async (campaign: Campaign) => {
    try {
      const res = await fetch('/api/war-room/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(campaign),
      });
      if (!res.ok) console.error('[campaigns] patch error:', await res.text());
    } catch (err) { console.error('[campaigns] patch error:', err); }
  }, []);

  // Build school list from allSchools (API) + stats fallback for the create drawer
  const schoolList = useMemo(() => {
    if (allSchools.length > 0) return allSchools;
    const map = new Map<string, { id: string; name: string }>();
    stats?.recentDeals.forEach(d => {
      const school = d.organization?.school;
      if (school && !map.has(school.id)) map.set(school.id, { id: school.id, name: school.name });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSchools, stats]);

  const unlinkedDealsCount = useMemo(() => {
    const linkedOrgIds = new Set((Array.isArray(campaigns) ? campaigns : []).flatMap(c => (Array.isArray(c.rows) ? c.rows : []).map(r => r.orgId).filter(Boolean)));
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

  async function handleCreate(c: Campaign) {
    try {
      const res = await fetch('/api/war-room/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(c),
      });
      if (res.ok) {
        const created: Campaign = await res.json();
        setCampaigns(prev => [...prev, created]);
        setExpandedId(created.id);
      }
    } catch (err) { console.error('[campaigns] create error:', err); }
  }

  function handleUpdateRow(campaignId: string, rowId: string, updates: Partial<CampaignRow>) {
    // Special case: meetingBooked toggled ON → create pipeline deal if no dealId
    const campaign = campaigns.find(c => c.id === campaignId);
    const row = campaign?.rows.find(r => r.id === rowId);
    const meetingBookedToggled = updates.meetingBooked === true && row && !row.meetingBooked;

    const updatedCampaigns = campaigns.map(c => c.id === campaignId
      ? { ...c, rows: c.rows.map(r => r.id === rowId ? { ...r, ...updates } : r), updatedAt: new Date().toISOString() }
      : c
    );
    setCampaigns(updatedCampaigns);

    const updatedCampaign = updatedCampaigns.find(c => c.id === campaignId)!;
    const updatedRow = updatedCampaign.rows.find(r => r.id === rowId)!;

    // Status change → sync deal stage on existing deal
    if (updates.status !== undefined && row?.dealId) {
      const newStage = statusToStage(updates.status);
      fetch(`/api/pipeline/deals/${row.dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      }).catch(err => console.error('[campaigns] deal stage sync error:', err));
    }

    if (meetingBookedToggled && !updatedRow.dealId) {
      // Update row status to demo_booked immediately so it moves to Pipeline section
      const withStatus = updatedCampaigns.map(c => c.id === campaignId
        ? { ...c, rows: c.rows.map(r => r.id === rowId ? { ...r, ...updates, status: 'demo_booked' as const, meetingBooked: true } : r), updatedAt: new Date().toISOString() }
        : c
      );
      setCampaigns(withStatus);

      // Create pipeline deal if we have an orgId
      if (updatedRow.orgId) {
        fetch('/api/pipeline/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: updatedRow.orgId, stage: 'demo_booked', value: 0 }),
        }).then(r => r.ok ? r.json() : null).then(deal => {
          if (!deal) { persistOne(withStatus.find(c => c.id === campaignId)!); return; }
          const finalCampaigns = withStatus.map(c => c.id === campaignId
            ? { ...c, rows: c.rows.map(r => r.id === rowId ? { ...r, ...updates, status: 'demo_booked' as const, meetingBooked: true, dealId: deal.id } : r), updatedAt: new Date().toISOString() }
            : c
          );
          setCampaigns(finalCampaigns);
          persistOne(finalCampaigns.find(c => c.id === campaignId)!);
        }).catch(err => { console.error('[campaigns] deal create error:', err); persistOne(withStatus.find(c => c.id === campaignId)!); });
      } else {
        // No orgId — just update status and persist
        persistOne(withStatus.find(c => c.id === campaignId)!);
      }
    } else {
      persistOne(updatedCampaign);
    }
  }

  async function handleDealCreate(campaignId: string, rowId: string) {
    const campaign = campaigns.find(c => c.id === campaignId);
    const row = campaign?.rows.find(r => r.id === rowId);
    if (!row || !row.orgId || row.dealId || !row.chapterName.trim()) return;
    try {
      const res = await fetch('/api/pipeline/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: row.orgId, stage: 'lead', value: 0, deal_type: 'local' }),
      });
      if (res.ok) {
        const deal = await res.json();
        const updatedCampaigns = campaigns.map(c => c.id === campaignId
          ? { ...c, rows: c.rows.map(r => r.id === rowId ? { ...r, dealId: deal.id } : r), updatedAt: new Date().toISOString() }
          : c
        );
        setCampaigns(updatedCampaigns);
        persistOne(updatedCampaigns.find(c => c.id === campaignId)!);
      }
    } catch (err) { console.error('[campaigns] deal create on blur error:', err); }
  }

  function handleDeleteRow(campaignId: string, rowId: string) {
    const updatedCampaigns = campaigns.map(c => c.id === campaignId
      ? { ...c, rows: c.rows.filter(r => r.id !== rowId), updatedAt: new Date().toISOString() }
      : c
    );
    setCampaigns(updatedCampaigns);
    persistOne(updatedCampaigns.find(c => c.id === campaignId)!);
  }

  function handleAddRow(campaignId: string) {
    const newRow: CampaignRow = {
      id: uid(), chapterName: '', status: 'not_contacted', method: 'email',
      contactName: '', contactInfo: '', sourceUrl: '', meetingBooked: false,
    };
    const updatedCampaigns = campaigns.map(c => c.id === campaignId
      ? { ...c, rows: [...c.rows, newRow], updatedAt: new Date().toISOString() }
      : c
    );
    setCampaigns(updatedCampaigns);
    persistOne(updatedCampaigns.find(c => c.id === campaignId)!);
  }

  function handleUpdateCampaign(id: string, updates: Partial<Campaign>) {
    const updatedCampaigns = campaigns.map(c => c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c);
    setCampaigns(updatedCampaigns);
    persistOne(updatedCampaigns.find(c => c.id === id)!);
  }

  function handleUpdateCampaignMeta(id: string, rows: CampaignRow[], schoolId?: string) {
    const updatedCampaigns = campaigns.map(c => c.id === id
      ? { ...c, rows, schoolId: schoolId ?? c.schoolId, updatedAt: new Date().toISOString() }
      : c
    );
    setCampaigns(updatedCampaigns);
    persistOne(updatedCampaigns.find(c => c.id === id)!);
  }

  async function handleDeleteCampaign(id: string) {
    try {
      const res = await fetch(`/api/war-room/campaigns?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCampaigns(prev => prev.filter(c => c.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
    } catch (err) { console.error('[campaigns] delete error:', err); }
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
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: '#9ca3af', gap: '8px' }}>
          <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading campaigns…
        </div>
      ) : filtered.length === 0 ? (
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
              pipelineDeals={stats?.recentDeals ?? []}
              onDealCreate={handleDealCreate}
              openDeal={openDeal}
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

// ─── Map Components (used in Dashboard) ─────────────────────────────────────


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
                  <Link href={`/nucleus/war-room`} style={{ flexShrink: 0, fontSize: '0.75rem', fontWeight: 600, padding: '6px 12px', borderRadius: '8px', background: '#0F172A', color: '#ffffff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
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
type Tab = 'crm' | 'dashboard' | 'campaigns';
const TABS: { id: Tab; label: string }[] = [
  { id: 'crm',       label: 'CRM' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'campaigns', label: 'Campaigns' },
];

export default function WarRoomPage() {
  const [tab, setTab] = useState<Tab>('crm');
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number; errors: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const autoSyncTriggeredRef = useRef(false);

  // Deal panel state
  const [panelDeal, setPanelDeal] = useState<any>(null);
  const [panelEmployees, setPanelEmployees] = useState<any[]>([]);
  const [panelSchools, setPanelSchools] = useState<any[]>([]);
  const [panelNationals, setPanelNationals] = useState<any[]>([]);
  const [supportLoaded, setSupportLoaded] = useState(false);

  // Load support data for DealEditPanel once
  const loadSupportData = useCallback(async () => {
    if (supportLoaded) return;
    const [empRes, schoolRes, natRes] = await Promise.all([
      fetch('/api/employees?status=active'),
      fetch('/api/pipeline/schools'),
      fetch('/api/pipeline/nationals'),
    ]);
    if (empRes.ok) { const d = await empRes.json(); setPanelEmployees(Array.isArray(d) ? d : d.data ?? []); }
    if (schoolRes.ok) { const d = await schoolRes.json(); setPanelSchools(Array.isArray(d) ? d : []); }
    if (natRes.ok) { const d = await natRes.json(); setPanelNationals(Array.isArray(d) ? d : []); }
    setSupportLoaded(true);
  }, [supportLoaded]);

  async function openDeal(deal: Deal) {
    loadSupportData();
    // Fetch full deal detail
    try {
      const res = await fetch(`/api/pipeline/deals/${deal.id}`);
      if (res.ok) setPanelDeal(await res.json());
      else setPanelDeal(deal);
    } catch { setPanelDeal(deal); }
  }

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

  const syncCalendar = useCallback(async () => {
    setSyncLoading(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const res = await fetch('/api/pipeline/sync-calendar', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setSyncResult({ synced: data.synced ?? 0, skipped: data.skipped ?? 0, errors: data.errors ?? 0 });
      fetchStats();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncLoading(false);
    }
  }, [fetchStats]);

  useEffect(() => {
    fetchStats();
    refreshRef.current = setInterval(fetchStats, 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchStats]);

  // Auto-sync if ?autoSync=true in URL
  useEffect(() => {
    if (autoSyncTriggeredRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoSync') === 'true') {
      autoSyncTriggeredRef.current = true;
      syncCalendar();
    }
  }, [syncCalendar]);

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB' }}>
      {/* Sticky Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(249,250,251,0.95)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #E5E7EB' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', margin: 0 }}>Sales Room</h1>
              <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>Live sales intelligence</span>
              {statsLoading && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {lastRefreshed && <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
              {syncResult && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#065f46', background: '#d1fae5', padding: '3px 10px', borderRadius: '9999px' }}>
                  ✓ {syncResult.synced} synced, {syncResult.skipped} skipped
                </span>
              )}
              {syncError && (
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '3px 10px', borderRadius: '9999px' }}>
                  ✗ {syncError}
                </span>
              )}
              <button
                onClick={syncCalendar}
                disabled={syncLoading}
                className="module-filter-btn"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: syncLoading ? 0.7 : 1 }}
              >
                {syncLoading
                  ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Syncing…</>
                  : <><CalendarCheck size={14} /> Sync Calendar</>
                }
              </button>
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
        {tab === 'crm'        && <SalesCRM />}
        {tab === 'dashboard'  && <DashboardTab stats={stats} onOpenDeal={openDeal} />}
        {tab === 'campaigns'  && <CampaignCRM stats={stats} openDeal={openDeal} />}
      </div>

      {/* Deal Edit Panel — slide-in from right */}
      {panelDeal && (
        <DealEditPanel
          deal={panelDeal}
          employees={panelEmployees}
          schools={panelSchools}
          nationals={panelNationals}
          onClose={() => setPanelDeal(null)}
          onSaved={() => { setPanelDeal(null); fetchStats(); }}
          onDeleted={() => { setPanelDeal(null); fetchStats(); }}
        />
      )}
    </div>
  );
}
