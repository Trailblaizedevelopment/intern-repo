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

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700', outreach: 'bg-blue-100 text-blue-700',
  contacted: 'bg-cyan-100 text-cyan-700', follow_up: 'bg-sky-100 text-sky-700',
  demo_booked: 'bg-amber-100 text-amber-700', first_demo: 'bg-orange-100 text-orange-700',
  second_call: 'bg-violet-100 text-violet-700', proposal: 'bg-purple-100 text-purple-700',
  negotiation: 'bg-pink-100 text-pink-700', closed_won: 'bg-emerald-100 text-emerald-700',
  closed_lost: 'bg-red-100 text-red-700', hold_off: 'bg-slate-100 text-slate-500',
  lead: 'bg-gray-100 text-gray-700', contract_sent: 'bg-amber-100 text-amber-700',
};

const CONF_BORDER_COLORS: Record<string, string> = {
  SEC: '#10b981', 'Big 12': '#C4874A', ACC: '#2563eb', 'Big Ten': '#7c3aed',
  'Big East': '#06b6d4', 'Pac-12': '#ec4899',
};

const CONF_BG_COLORS: Record<string, string> = {
  SEC: '#ecfdf5', 'Big 12': '#fffbeb', ACC: '#eff6ff', 'Big Ten': '#f5f3ff',
  'Big East': '#ecfeff', 'Pac-12': '#fdf2f8',
};

const CONF_TEXT_COLORS: Record<string, string> = {
  SEC: '#065f46', 'Big 12': '#92400e', ACC: '#1e40af', 'Big Ten': '#5b21b6',
  'Big East': '#164e63', 'Pac-12': '#9d174d',
};

const TEMP_EMOJI: Record<string, string> = { hot: '🔥', warm: '☀️', cold: '🧊', dead: '💀' };

const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  founder_led: 'Founder-Led', intern_led: 'Intern-Led', instagram: 'Instagram',
  ambassador: 'Ambassador', marketing: 'Marketing',
};

const CAMPAIGN_TYPE_DOT_COLORS: Record<CampaignType, string> = {
  founder_led: 'bg-violet-500', intern_led: 'bg-blue-500', instagram: 'bg-pink-500',
  ambassador: 'bg-amber-500', marketing: 'bg-emerald-500',
};

const CAMPAIGN_TYPE_BADGE_COLORS: Record<CampaignType, string> = {
  founder_led: 'bg-violet-100 text-violet-700',
  intern_led: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  ambassador: 'bg-amber-100 text-amber-700',
  marketing: 'bg-emerald-100 text-emerald-700',
};

const REP_COLORS: Record<string, string> = {
  Owen: '#C4874A', Ford: '#2563eb', Adam: '#10b981', Hyatt: '#7c3aed',
};

const OUTREACH_STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string; bg: string; border: string }> = {
  not_contacted: { label: 'Not Contacted', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  contacted:     { label: 'Contacted',     color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  demo_booked:   { label: 'Demo Booked',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  signed:        { label: 'Signed',        color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7' },
};

const STAGE_CONF: Record<string, { label: string; color: string; bg: string; border: string }> = {
  lead:          { label: 'New Lead',      color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  demo_booked:   { label: 'Demo Booked',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  first_demo:    { label: 'First Demo',    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  second_call:   { label: 'Second Call',   color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  contract_sent: { label: 'Contract Sent', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  closed_won:    { label: 'Closed Won',    color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7' },
};

const STAGE_OPTIONS = [
  { value: 'lead', label: 'New Lead' }, { value: 'demo_booked', label: 'Demo Booked' },
  { value: 'first_demo', label: 'First Demo' }, { value: 'second_call', label: 'Second Call' },
  { value: 'contract_sent', label: 'Contract Sent' }, { value: 'closed_won', label: 'Closed Won' },
];

const TEMP_OPTIONS = [
  { value: 'hot', label: '🔥 Hot' }, { value: 'warm', label: '🟡 Warm' }, { value: 'cold', label: '🧊 Cold' },
];

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

function followupColor(dateStr?: string | null): string {
  if (!dateStr) return 'text-gray-400';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  if (d < today) return 'text-red-500 font-semibold';
  if (d.getTime() === today.getTime()) return 'text-amber-600 font-semibold';
  return 'text-gray-500';
}

function getRepColor(name?: string | null): string {
  if (!name) return '#6b7280';
  return REP_COLORS[name] ?? '#6b7280';
}

function getRepInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
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

function KpiChip({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm min-w-0">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${color}18`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide leading-none truncate">{label}</p>
        <p className="text-lg font-bold text-[#1B2A4A] leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const sc = STAGE_CONFIG[stage as DealStage];
  if (sc) {
    return (
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
        style={{ color: sc.color, backgroundColor: sc.color + '22', borderColor: sc.color + '40' }}
      >
        {sc.emoji} {sc.label}
      </span>
    );
  }
  // fallback for non-standard stages
  const conf = STAGE_CONF[stage];
  if (conf) {
    return (
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
        style={{ color: conf.color, backgroundColor: conf.bg, borderColor: conf.border }}
      >
        {conf.label}
      </span>
    );
  }
  const cls = STAGE_COLORS[stage] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls} whitespace-nowrap`}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

function RepChip({ name, size = 'sm' }: { name?: string | null; size?: 'sm' | 'lg' }) {
  if (!name) return null;
  const color = getRepColor(name);
  return (
    <span
      className="inline-flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full text-white text-xs font-semibold flex-shrink-0"
      style={{ backgroundColor: color }}
    >
      <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
        {getRepInitials(name)}
      </span>
      <span className="hidden sm:inline">{name}</span>
    </span>
  );
}

function MethodPill({ method }: { method: OutreachMethod }) {
  const cfg = {
    email:        { label: 'Email',  icon: <Mail size={10} />,          color: 'text-blue-700 bg-blue-50 border-blue-200' },
    text:         { label: 'Text',   icon: <MessageSquare size={10} />, color: 'text-green-700 bg-green-50 border-green-200' },
    instagram_dm: { label: 'IG DM', icon: <Instagram size={10} />,      color: 'text-pink-700 bg-pink-50 border-pink-200' },
  }[method];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium ${cfg.color}`}>
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
    { label: 'This Week', color: '#C4874A', deals: thisWeek },
    { label: 'Upcoming', color: '#9ca3af', deals: upcoming },
  ].filter(g => g.deals.length > 0);
}

function PipelineDealRow({ deal }: { deal: Deal }) {
  const org = deal.organization;
  const chapterName = org?.name || '—';
  const schoolName = org?.school?.name || deal.conference || '—';
  const fuCls = followupColor(deal.next_followup);

  return (
    <tr
      className="hover:bg-gray-50/80 transition-colors border-b border-gray-50 cursor-pointer"
      onClick={() => { window.location.href = '/nucleus/pipeline'; }}
    >
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-[#1B2A4A] truncate hover:text-[#C4874A] transition-colors">{chapterName}</p>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <p className="text-xs text-gray-400 truncate">{schoolName}</p>
      </td>
      <td className="px-4 py-3">
        <StageBadge stage={deal.stage} />
      </td>
      <td className="px-4 py-3 text-center">
        {deal.temperature && <span className="text-sm">{TEMP_EMOJI[deal.temperature] || ''}</span>}
      </td>
      <td className={`px-4 py-3 text-right hidden sm:table-cell text-xs ${fuCls}`}>
        {fmtDate(deal.next_followup)}
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <RepChip name={deal.assigned_to} />
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-xs font-semibold text-gray-600">{deal.value ? fmt$(deal.value) : '—'}</span>
      </td>
    </tr>
  );
}

function CollapsiblePipelineGroup({ group }: { group: PipelineGroup }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr className="bg-gray-50 border-y border-gray-100">
        <td colSpan={7} className="px-4 py-2">
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex-1">{group.label}</span>
            <span className="text-xs text-gray-400 font-medium">{group.deals.length} deal{group.deals.length !== 1 ? 's' : ''}</span>
            {open ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
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
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-2" />
        Loading stats…
      </div>
    );
  }

  const mrrPct = Math.min(100, Math.round((stats.mrr / stats.mrrGoal) * 100));
  const mrrAway = stats.mrrGoal - stats.mrr;
  const pipelineGroups = groupDealsByUrgency(stats.recentDeals);

  return (
    <div className="space-y-5">
      {/* MRR Hero Card */}
      <div
        className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #ffffff 55%, #fdf6ef 100%)' }}
      >
        <div className="p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
                Monthly Recurring Revenue
              </p>
              <p
                className="text-6xl lg:text-7xl font-bold text-[#1B2A4A] leading-none"
                style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
              >
                {fmt$(stats.mrr)}
              </p>
              <p className="text-sm text-gray-400 mt-3">
                {mrrAway > 0 ? (
                  <span className="text-[#C4874A] font-semibold">{fmt$(mrrAway)} away</span>
                ) : (
                  <span className="text-emerald-600 font-semibold">Goal reached! 🎉</span>
                )}{' '}
                from {fmt$(stats.mrrGoal)} goal
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Progress to goal</p>
              <p
                className="text-5xl font-bold text-[#C4874A]"
                style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
              >
                {mrrPct}%
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="relative">
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-3 rounded-full transition-all duration-700"
                style={{ width: `${mrrPct}%`, background: 'linear-gradient(90deg, #C4874A 0%, #E0A96D 100%)' }}
              />
            </div>
            {/* Goal marker */}
            <div className="absolute top-0 right-0 h-3 w-0.5 bg-gray-300 rounded-full" />
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span className="font-semibold" style={{ color: '#C4874A' }}>{fmt$(stats.mrr)}</span>
            <span>Goal: {fmt$(stats.mrrGoal)}</span>
          </div>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiChip icon={<Building2 size={16} />} label="Schools in Convo" value={String(stats.schoolsInConversation)} color="#2563eb" />
        <KpiChip icon={<Calendar size={16} />} label="Demos · 7 Days" value={String(stats.demosNext7)} color="#10b981" />
        <KpiChip icon={<Calendar size={16} />} label="Demos · 14 Days" value={String(stats.demosNext14)} color="#6ee7b7" />
        <KpiChip icon={<Phone size={16} />} label="Decisions · 7d" value={String(stats.decisionsNext7)} color="#C4874A" />
        <KpiChip icon={<Phone size={16} />} label="Decisions · 14d" value={String(stats.decisionsNext14)} color="#e0a96d" />
      </div>

      {/* Conference Tracker */}
      {stats.byConference.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
            Conference Tracker
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {stats.byConference.map(c => (
              <div
                key={c.conference}
                className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-1.5"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {c.conference}
                </span>
                <span className="text-2xl font-bold leading-none text-[#1B2A4A] mt-0.5">
                  {c.dealCount}
                </span>
                <span className="text-sm text-gray-500">
                  {fmt$(c.pipelineValue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Pipeline Feed */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Pipeline
            </p>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              {stats.recentDeals.length}
            </span>
          </div>
          <Link
            href="/nucleus/pipeline"
            className="text-xs font-semibold text-[#C4874A] hover:text-[#b07842] flex items-center gap-1 transition-colors"
          >
            View all <ExternalLink size={11} />
          </Link>
        </div>

        {stats.recentDeals.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No active deals</div>
        ) : (
          <div className="overflow-y-auto max-h-[560px]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Org</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">School</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Stage</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Temp</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Followup</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Assigned</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Value</th>
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

// TODO: migrate to campaigns table in Supabase
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
  schools: string[];
  onClose: () => void;
  onCreate: (c: Campaign) => void;
}

function CreateCampaignDrawer({ schools, onClose, onCreate }: CreateCampaignDrawerProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CampaignType>('founder_led');
  const [school, setSchool] = useState('');
  const [status] = useState<CampaignStatus>('active');
  const [schoolQuery, setSchoolQuery] = useState('');
  const [showSchoolDrop, setShowSchoolDrop] = useState(false);

  const filteredSchools = useMemo(() => {
    if (!schoolQuery.trim()) return schools.slice(0, 8);
    const q = schoolQuery.toLowerCase();
    return schools.filter(s => s.toLowerCase().includes(q)).slice(0, 8);
  }, [schools, schoolQuery]);

  function handleSchoolSelect(s: string) {
    setSchool(s);
    setSchoolQuery(s);
    setShowSchoolDrop(false);
    if (!name.trim()) setName(s);
  }

  function handleCreate() {
    if (!name.trim()) return;
    const campaign: Campaign = {
      id: uid(), name: name.trim(), type, school: school.trim(),
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
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[420px] bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>
              New Campaign
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Create an outreach campaign</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* School */}
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">School</label>
            <input
              type="text"
              value={schoolQuery}
              onChange={e => { setSchoolQuery(e.target.value); setShowSchoolDrop(true); if (!e.target.value) setSchool(''); }}
              onFocus={() => setShowSchoolDrop(true)}
              placeholder="Search school…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40"
            />
            {showSchoolDrop && filteredSchools.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-10 overflow-hidden">
                {filteredSchools.map(s => (
                  <button key={s} onClick={() => handleSchoolSelect(s)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 transition-colors border-b border-gray-50 last:border-0">
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. TCU - Instagram"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`py-2 px-3 text-sm rounded-xl border font-medium transition-colors ${
                    type === opt.value
                      ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-50"
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
    <tr className="group hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2">
        <input type="text" value={row.chapterName}
          onChange={e => onUpdate(campaignId, row.id, { chapterName: e.target.value })}
          className="w-full bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none text-sm py-0.5 min-w-[120px]"
          placeholder="Chapter name" />
      </td>
      <td className="px-3 py-2">
        <select value={row.status}
          onChange={e => onUpdate(campaignId, row.id, { status: e.target.value as CampaignRow['status'] })}
          className="bg-transparent text-xs focus:outline-none">
          <option value="not_contacted">Not Contacted</option>
          <option value="contacted">Contacted</option>
          <option value="demo_booked">Demo Booked</option>
          <option value="signed">Signed</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <select value={row.method}
          onChange={e => onUpdate(campaignId, row.id, { method: e.target.value as OutreachMethod })}
          className="bg-transparent text-xs focus:outline-none">
          <option value="email">Email</option>
          <option value="text">Text</option>
          <option value="instagram_dm">Instagram DM</option>
        </select>
      </td>
      <td className="px-3 py-2">
        <input type="text" value={row.contactName}
          onChange={e => onUpdate(campaignId, row.id, { contactName: e.target.value })}
          className="w-full bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none text-sm py-0.5 min-w-[100px]"
          placeholder="Name" />
      </td>
      <td className="px-3 py-2">
        <input type="text" value={row.contactInfo}
          onChange={e => onUpdate(campaignId, row.id, { contactInfo: e.target.value })}
          className="w-full bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none text-sm py-0.5 min-w-[120px]"
          placeholder="Email / phone" />
      </td>
      <td className="px-3 py-2">
        <input type="text" value={row.sourceUrl}
          onChange={e => onUpdate(campaignId, row.id, { sourceUrl: e.target.value })}
          className="w-full bg-transparent border-b border-transparent focus:border-gray-300 focus:outline-none text-sm py-0.5 min-w-[140px]"
          placeholder="https://..." />
      </td>
      <td className="px-3 py-2 text-center">
        <button
          onClick={() => onUpdate(campaignId, row.id, { meetingBooked: !row.meetingBooked })}
          className={`w-5 h-5 rounded border flex items-center justify-center mx-auto transition-colors ${
            row.meetingBooked ? 'bg-amber-500 border-amber-500 text-white' : 'border-gray-300 hover:border-amber-400'
          }`}
        >
          {row.meetingBooked && <Check size={12} />}
        </button>
      </td>
      <td className="px-3 py-2">
        <button onClick={() => onDelete(campaignId, row.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all">
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

function ExpandedCampaign({
  campaign, onUpdate, onDelete, onAddRow, onUpdateCampaign,
}: {
  campaign: Campaign;
  onUpdate: (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => void;
  onDelete: (campaignId: string, rowId: string) => void;
  onAddRow: (campaignId: string) => void;
  onUpdateCampaign: (id: string, updates: Partial<Campaign>) => void;
}) {
  return (
    <div className="border-t border-gray-100">
      {/* Campaign controls */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50/60">
        <span className="text-xs text-gray-500">{campaign.rows.length} rows</span>
        <div className="flex-1" />
        <button
          onClick={() => onUpdateCampaign(campaign.id, {
            status: campaign.status === 'active' ? 'paused' : 'active',
          })}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-white transition-colors"
        >
          {campaign.status === 'active' ? 'Pause' : 'Resume'}
        </button>
        <button
          onClick={() => onUpdateCampaign(campaign.id, { status: 'completed' })}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-white transition-colors"
        >
          <Check size={11} /> Complete
        </button>
      </div>

      {/* Sheet table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-gray-400 uppercase tracking-wider border-b border-gray-100">
              <th className="text-left px-3 py-2 font-semibold">Chapter</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
              <th className="text-left px-3 py-2 font-semibold">Method</th>
              <th className="text-left px-3 py-2 font-semibold">Contact</th>
              <th className="text-left px-3 py-2 font-semibold">Contact Info</th>
              <th className="text-left px-3 py-2 font-semibold">Source URL</th>
              <th className="text-center px-3 py-2 font-semibold">Booked ✓</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {campaign.rows.map(row => (
              <CampaignRowItem key={row.id} row={row} campaignId={campaign.id}
                onUpdate={onUpdate} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2.5 border-t border-gray-100">
        <button
          onClick={() => onAddRow(campaign.id)}
          className="flex items-center gap-1.5 text-sm text-[#C4874A] hover:text-[#b07842] font-semibold transition-colors"
        >
          <Plus size={14} /> Add Chapter
        </button>
      </div>
    </div>
  );
}

function CampaignCard({
  campaign, expanded, onToggle, onUpdate, onDelete, onAddRow, onUpdateCampaign, onDeleteCampaign,
}: {
  campaign: Campaign;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => void;
  onDelete: (campaignId: string, rowId: string) => void;
  onAddRow: (campaignId: string) => void;
  onUpdateCampaign: (id: string, updates: Partial<Campaign>) => void;
  onDeleteCampaign: (id: string) => void;
}) {
  const contacted = campaign.rows.filter(r => r.status !== 'not_contacted').length;
  const total = campaign.rows.length;
  const pct = total > 0 ? Math.round((contacted / total) * 100) : 0;

  const statusBadge = {
    active:    { label: 'Active',    cls: 'bg-emerald-100 text-emerald-700' },
    paused:    { label: 'Paused',    cls: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Completed', cls: 'bg-gray-100 text-gray-600' },
  }[campaign.status];

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={onToggle}
      >
        {/* Type dot + info */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${CAMPAIGN_TYPE_DOT_COLORS[campaign.type]}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-[#1B2A4A] truncate">{campaign.name}</p>
            {campaign.school && campaign.school !== campaign.name && (
              <span className="text-xs text-gray-400 hidden sm:block flex-shrink-0">{campaign.school}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CAMPAIGN_TYPE_BADGE_COLORS[campaign.type]}`}>
              {CAMPAIGN_TYPE_LABELS[campaign.type]}
            </span>
            {total > 0 && (
              <span className="text-xs text-gray-400">{contacted}/{total} contacted</span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="hidden sm:block w-24 flex-shrink-0">
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5 text-right">{pct}%</p>
          </div>
        )}

        {/* Status + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDeleteCampaign(campaign.id); }}
            className="p-1 text-gray-200 hover:text-red-400 transition-colors"
            title="Delete campaign"
          >
            <Trash2 size={13} />
          </button>
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <ExpandedCampaign
          campaign={campaign}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddRow={onAddRow}
          onUpdateCampaign={onUpdateCampaign}
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

  // Load campaigns and auto-seed one per school from pipeline if none exist yet
  useEffect(() => {
    const existing = loadCampaigns();
    if (existing.length > 0 || !stats?.recentDeals?.length) {
      setCampaigns(existing);
      return;
    }
    // Auto-seed: create one founder_led campaign per unique school
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

  const schoolNames = useMemo(() => {
    const names = new Set<string>();
    stats?.recentDeals.forEach(d => { if (d.organization?.school?.name) names.add(d.organization.school.name); });
    return Array.from(names).sort();
  }, [stats]);

  // Count deals not in any campaign
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
    // Sort: active first, then by updatedAt DESC
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

  function handleDeleteCampaign(id: string) {
    persist(campaigns.filter(c => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  const typeFilterOptions = [
    { value: 'all', label: 'All Types' },
    { value: 'founder_led', label: 'Founder-Led' }, { value: 'intern_led', label: 'Intern-Led' },
    { value: 'instagram', label: 'Instagram' }, { value: 'ambassador', label: 'Ambassador' },
    { value: 'marketing', label: 'Marketing' },
  ];

  return (
    <div className="space-y-4">
      {/* Auto-association callout */}
      {unlinkedDealsCount > 0 && (
        <div className="bg-white border border-amber-100 rounded-xl p-4" style={{ borderLeftWidth: 4, borderLeftColor: '#f59e0b' }}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertCircle size={16} className="flex-shrink-0 text-amber-500" />
              <span><strong>{unlinkedDealsCount}</strong> deal{unlinkedDealsCount !== 1 ? 's' : ''} not associated with a campaign.</span>
            </div>
            <button
              onClick={() => setShowCreateDrawer(true)}
              className="text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            >
              Create Campaign →
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text" placeholder="Search campaigns…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={13} /></button>}
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40">
          {typeFilterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
        </select>
        <button
          onClick={() => setShowCreateDrawer(true)}
          className="flex items-center gap-2 bg-[#1B2A4A] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#263d6b] transition-colors flex-shrink-0"
        >
          <Plus size={15} /> New Campaign
        </button>
      </div>

      {/* Campaign list */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col items-center justify-center py-20 gap-4">
          <Target size={32} className="text-gray-200" />
          <div className="text-center">
            <p className="font-semibold text-gray-500">No campaigns yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first campaign to start tracking outreach</p>
          </div>
          <button
            onClick={() => setShowCreateDrawer(true)}
            className="flex items-center gap-2 bg-[#1B2A4A] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#263d6b] transition-colors"
          >
            <Plus size={15} /> New Campaign
          </button>
        </div>
      ) : (
        <div className="space-y-3">
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
            />
          ))}
        </div>
      )}

      {showCreateDrawer && (
        <CreateCampaignDrawer
          schools={schoolNames}
          onClose={() => setShowCreateDrawer(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

// ─── Tab 3: Next Steps ───────────────────────────────────────────────────────

// TODO: migrate to meeting_notes table in Supabase
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

  const assigneeColors: Record<string, string> = { Owen: '#C4874A', Ford: '#2563eb', Adam: '#10b981', All: '#6b7280' };

  return (
    <div className="space-y-6">
      {/* Section A: Granola Meetings */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Recent Meetings</p>
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="text" placeholder="Search meetings…" value={granolaSearch}
              onChange={e => setGranolaSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40" />
          </div>
        </div>

        {granolaLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <RefreshCw size={20} className="animate-spin mr-2" /> Loading meetings…
          </div>
        ) : granolaError ? (
          <div className="px-5 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
              <AlertCircle size={15} /> {granolaError}
            </div>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            {granolaSearch ? `No meetings matching "${granolaSearch}"` : 'No recent meetings found'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredNotes.map(note => (
              <div key={note.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1B2A4A] truncate">{note.title || 'Untitled Meeting'}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {note.created_at && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} /> {fmtDateLong(note.created_at)}
                      </span>
                    )}
                    {note.attendees && note.attendees.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Users size={10} className="text-gray-300" />
                        <div className="flex gap-1">
                          {note.attendees.slice(0, 3).map((a, i) => (
                            <span key={i} className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                              {a.name || a.email || 'Unknown'}
                            </span>
                          ))}
                          {note.attendees.length > 3 && (
                            <span className="text-xs text-gray-400">+{note.attendees.length - 3}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setAddingForNote(addingForNote?.id === note.id ? null : note)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors flex-shrink-0 ${
                    addingForNote?.id === note.id
                      ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Add Next Steps
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Inline add form */}
        {addingForNote && (
          <div className="border-t border-gray-100 px-5 py-4 bg-amber-50/40 space-y-3">
            <p className="text-xs font-semibold text-gray-600">
              Adding next steps for: <span className="text-[#1B2A4A]">{addingForNote.title || 'Untitled'}</span>
            </p>
            <textarea
              value={newStepText} onChange={e => setNewStepText(e.target.value)}
              placeholder="Next step text…" rows={2}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40 resize-none bg-white"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1.5">
                {(['Owen', 'Ford', 'Adam', 'All'] as const).map(name => (
                  <button key={name} onClick={() => setNewStepAssignee(name)}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors ${
                      newStepAssignee === name ? 'text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                    style={newStepAssignee === name ? { backgroundColor: assigneeColors[name] } : {}}>
                    {name}
                  </button>
                ))}
              </div>
              <input type="date" value={newStepDue} onChange={e => setNewStepDue(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white" />
              <div className="flex-1" />
              <button onClick={() => setAddingForNote(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Cancel</button>
              <button onClick={handleAddStep} disabled={!newStepText.trim()}
                className="text-xs font-bold px-3 py-1.5 bg-[#1B2A4A] text-white rounded-xl hover:bg-[#263d6b] transition-colors disabled:opacity-50">
                Add Step
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section B: Next Steps Board */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Next Steps</p>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'pending', 'done', 'Owen', 'Ford', 'Adam'].map(f => (
              <button key={f} onClick={() => setStepsFilter(f)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors capitalize ${
                  stepsFilter === f
                    ? 'bg-[#1B2A4A] text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {filteredSteps.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No next steps yet. Add them from meetings above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Meeting</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Next Step</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Assigned To</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Due Date</th>
                  <th className="text-center px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Done ✓</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredSteps.map(step => (
                  <tr key={step.id} className={`hover:bg-gray-50 transition-colors ${step.done ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-xs text-gray-400 truncate max-w-[140px]">{step.noteTitle}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className={`text-sm font-semibold text-[#1B2A4A] ${step.done ? 'line-through' : ''}`}>{step.text}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: assigneeColors[step.assignedTo] }}
                      >
                        {step.assignedTo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                      <span className="text-xs text-gray-500">{step.dueDate ? fmtDate(step.dueDate) : '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => toggleDone(step.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            step.done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 hover:border-emerald-400'
                          }`}
                        >
                          {step.done && <Check size={11} className="text-white" />}
                        </button>
                        <button onClick={() => deleteStep(step.id)} className="text-gray-200 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab 4: Client Map (Embedded) ─────────────────────────────────────────────

// ── Map Tooltip ───────────────────────────────────────────────────────────────
function MapTooltip({ stateAbbr, data, x, y }: {
  stateAbbr: string; data: StateData | null; x: number; y: number;
}) {
  return (
    <div
      style={{ position: 'fixed', left: x + 14, top: y - 14, zIndex: 100 }}
      className="bg-[#1B2A4A] text-white text-xs rounded-xl px-3 py-2.5 shadow-2xl pointer-events-none min-w-[160px]"
    >
      <p className="font-bold text-sm mb-1.5">{stateAbbr}</p>
      {data ? (
        <div className="space-y-0.5 text-white/80">
          {data.activeClients > 0 && <p>✅ {data.activeClients} active client{data.activeClients !== 1 ? 's' : ''}</p>}
          {data.pipelineDeals > 0 && <p>📊 {data.pipelineDeals} deal{data.pipelineDeals !== 1 ? 's' : ''}</p>}
          {data.pipelineValue > 0 && <p>💰 {fmt$(data.pipelineValue)}</p>}
          {data.activeClients === 0 && data.pipelineDeals === 0 && <p className="text-white/50">No activity yet</p>}
        </div>
      ) : (
        <p className="text-white/50">No activity yet</p>
      )}
    </div>
  );
}

// ── US Pipeline Map ───────────────────────────────────────────────────────────
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
    if (selectedState === stateAbbr) return '#1B2A4A';
    const data = stateDataMap[stateAbbr];
    if (!data) return '#e5e7eb';
    switch (data.status) {
      case 'active_client': return 'rgba(16, 185, 129, 0.8)';
      case 'in_pipeline':   return 'rgba(196, 135, 74, 0.6)';
      default:              return '#e5e7eb';
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#10b98118' }}>
            <MapPin size={15} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">US Pipeline Map</p>
            <p className="text-xs text-gray-400">{selectedState ? `${selectedState} selected · click to clear` : 'Click a state to filter'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> Active Client
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
              <div className="w-2 h-2 rounded-full bg-amber-400" /> In Pipeline
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
              <div className="w-2 h-2 rounded-full bg-gray-300" /> Not Contacted
            </span>
          </div>
          {selectedState && (
            <button onClick={() => onStateClick(null)}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors">
              <X size={10} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="relative px-4 pb-4 pt-2">
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
                        hover:   { fill: isSelected ? '#243560' : '#C4874A', outline: 'none', opacity: 0.85, cursor: 'pointer' } as React.CSSProperties,
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
          <div className="h-72 flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#C4874A]" />
          </div>
        )}
      </div>
      {tooltip && <MapTooltip stateAbbr={tooltip.stateAbbr} data={stateDataMap[tooltip.stateAbbr] ?? null} x={tooltip.x} y={tooltip.y} />}
    </div>
  );
}

// ── State Deal Panel (slide-out from right) ───────────────────────────────────
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
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[420px] bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>
              {stateAbbr} Pipeline
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">{stateDeals.length} deal{stateDeals.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {stateDeals.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No active deals in {stateAbbr}</div>
          ) : (
            stateDeals.map(deal => (
              <div key={deal.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-sm text-[#1B2A4A] truncate">{deal.organization?.name || '—'}</p>
                      {deal.temperature && <span className="text-sm">{TEMP_EMOJI[deal.temperature] || ''}</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{deal.organization?.school?.name || '—'}</p>
                  </div>
                  <Link href="/nucleus/pipeline"
                    className="flex-shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors whitespace-nowrap">
                    View Deal →
                  </Link>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <StageBadge stage={deal.stage} />
                  <RepChip name={deal.assigned_to} />
                  {deal.value && <span className="text-xs font-bold text-[#1B2A4A]">{fmt$(deal.value)}</span>}
                  {deal.next_followup && (
                    <span className={`text-xs ml-auto ${followupColor(deal.next_followup)}`}>
                      <Calendar size={10} className="inline mr-1" />{fmtDate(deal.next_followup)}
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

// ── Map School Drill-down ─────────────────────────────────────────────────────
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
    <div className="flex items-center gap-3 py-3.5 px-5 border-b border-gray-100 hover:bg-[#FAFAF8] transition-colors last:border-0">
      <span className="flex-1 text-sm font-semibold text-[#1B2A4A] truncate min-w-0">{org.name}</span>
      <span className="flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border"
        style={{ color: statusCfg.color, backgroundColor: statusCfg.bg, borderColor: statusCfg.border }}>
        {statusCfg.label}
      </span>
      {outreachEntry && <MethodPill method={outreachEntry.method} />}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <button onClick={() => onLogContact(org, type)}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors whitespace-nowrap">
          <Plus size={11} /> Log
        </button>
        <button onClick={() => onViewDeal(org)}
          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
            primaryDeal ? 'bg-[#C4874A] text-white hover:bg-[#b07640]' : 'border border-gray-200 text-gray-400 hover:bg-gray-50'
          }`}>
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
  const labelBg   = type === 'fraternity' ? '#eff6ff' : '#fdf2f8';

  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-50/70 border-b border-gray-100">
        <span className="text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-md"
          style={{ color: labelColor, backgroundColor: labelBg }}>
          {label}
        </span>
        <span className="text-xs text-gray-400">{contactedCount}/{orgs.length} contacted</span>
        {contactedCount === orgs.length && orgs.length > 0 && <span className="text-xs text-emerald-600 font-semibold">✓ All done!</span>}
      </div>
      {orgs.length === 0 ? (
        <div className="px-5 py-4 text-center"><p className="text-xs text-gray-400">No {label.toLowerCase()} linked yet</p></div>
      ) : orgs.map(org => (
        <ChapterRow key={org.id} org={org} type={type} outreachEntry={outreachLog[org.id]}
          onLogContact={onLogContact} onViewDeal={onViewDeal} />
      ))}
    </div>
  );
}

// ── Log Contact Drawer ────────────────────────────────────────────────────────
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

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[440px] bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>Log Contact</h2>
            <p className="text-sm text-gray-500 mt-0.5">{org.name} · {schoolName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Who did you reach?</label>
            <div className="grid grid-cols-2 gap-2">
              {contactOptions.map(opt => (
                <button key={opt.value} onClick={() => setContactType(opt.value)}
                  className={`py-2 px-3 text-sm rounded-xl border font-medium transition-colors ${contactType === opt.value ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Method</label>
            <div className="flex gap-2">
              {methodOptions.map(opt => (
                <button key={opt.value} onClick={() => setMethod(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-xl border font-medium transition-colors ${method === opt.value ? 'bg-[#C4874A] text-white border-[#C4874A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Info</label>
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={contactInfo} onChange={e => setContactInfo(e.target.value)}
                placeholder="Phone number or @instagram handle"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Source URL</label>
            <div className="relative">
              <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
                placeholder="Instagram profile, chapter website…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="What happened? Key details…" rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 resize-none" />
          </div>
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
            <div className="relative mt-0.5">
              <input type="checkbox" checked={meetingBooked} onChange={e => setMeetingBooked(e.target.checked)} className="sr-only" />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${meetingBooked ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                {meetingBooked && <CheckCircle2 size={12} className="text-white" />}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Meeting / demo booked</p>
              <p className="text-xs text-gray-500 mt-0.5">Sets deal stage to Demo Booked automatically</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
            <div className="relative mt-0.5">
              <input type="checkbox" checked={createDeal} onChange={e => setCreateDeal(e.target.checked)} className="sr-only" />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${createDeal ? 'bg-[#1B2A4A] border-[#1B2A4A]' : 'bg-white border-gray-300'}`}>
                {createDeal && <CheckCircle2 size={12} className="text-white" />}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Create pipeline deal</p>
              <p className="text-xs text-gray-500 mt-0.5">Add this chapter as a new lead in the pipeline</p>
            </div>
          </label>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── View Deal Drawer ──────────────────────────────────────────────────────────
function ViewDealDrawer({ org, onClose, onSaved }: {
  org: OrgEntry; onClose: () => void; onSaved: () => void;
}) {
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
      .then(r => r.json())
      .then(d => { setDeal(d); setStage(d.stage ?? 'lead'); setTemperature(d.temperature ?? ''); setNextFollowup(d.next_followup ?? ''); setNotes(d.notes ?? ''); })
      .catch(console.error).finally(() => setLoading(false));
  }, [primaryDeal]);

  async function handleSave() {
    if (!deal) return;
    setSaving(true);
    try {
      await fetch(`/api/pipeline/deals/${deal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, temperature: temperature || null, next_followup: nextFollowup || null, notes: notes || null }),
      });
      onSaved(); onClose();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[420px] bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>Pipeline Deal</h2>
            <p className="text-sm text-gray-500 mt-0.5">{org.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1B2A4A]" /></div>
          ) : !deal ? (
            <div className="text-center py-12">
              <Building2 size={28} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-500">No deal found</p>
              <p className="text-xs text-gray-400 mt-1">Log a contact first</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Stage</label>
                <div className="relative">
                  <select value={stage} onChange={e => setStage(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 appearance-none bg-white">
                    {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Temperature</label>
                <div className="flex gap-2">
                  {TEMP_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => setTemperature(opt.value === temperature ? '' : opt.value)}
                      className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-colors ${temperature === opt.value ? 'bg-[#C4874A] text-white border-[#C4874A]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Next Follow-up</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="date" value={nextFollowup} onChange={e => setNextFollowup(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 resize-none" />
              </div>
            </>
          )}
        </div>
        {deal && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Import Chapters Modal ─────────────────────────────────────────────────────
function ImportChaptersModal({ school, existingOrgs, onClose, onImported }: {
  school: MapSchool; existingOrgs: OrgEntry[]; onClose: () => void; onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: string[]; skipped: string[] } | null>(null);

  async function handleImport() {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setImporting(true);
    const added: string[] = []; const skipped: string[] = [];
    const existingNames = new Set(existingOrgs.map(o => o.name.toLowerCase()));
    for (const name of lines) {
      if (existingNames.has(name.toLowerCase())) { skipped.push(name); continue; }
      try {
        const res = await fetch('/api/pipeline/orgs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, school_id: school.id, type: 'fraternity', status: 'prospect' }) });
        if (res.ok) added.push(name); else skipped.push(name);
      } catch { skipped.push(name); }
    }
    setResult({ added, skipped }); setImporting(false);
    if (added.length > 0) onImported();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8] rounded-t-2xl">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>Import Chapters</h2>
            <p className="text-sm text-gray-500 mt-0.5">{school.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-600">Paste chapter names below, one per line.</p>
              <textarea value={text} onChange={e => setText(e.target.value)} rows={8}
                placeholder={'Alpha Phi Alpha\nKappa Alpha Psi\nPhi Beta Sigma'}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 resize-none font-mono" />
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                <button onClick={handleImport} disabled={importing || !text.trim()}
                  className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] disabled:opacity-60 flex items-center justify-center gap-2">
                  {importing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Importing…</> : <><Upload size={15} />Import</>}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {result.added.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <p className="text-sm font-semibold text-emerald-800 mb-2">✅ Added {result.added.length}</p>
                    <ul className="space-y-1">{result.added.map(n => <li key={n} className="text-xs text-emerald-700">{n}</li>)}</ul>
                  </div>
                )}
                {result.skipped.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-600 mb-2">⏭ Skipped {result.skipped.length}</p>
                    <ul className="space-y-1">{result.skipped.map(n => <li key={n} className="text-xs text-gray-500">{n}</li>)}</ul>
                  </div>
                )}
              </div>
              <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560]">Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Client Map Tab ────────────────────────────────────────────────────────────
function ClientMapTab({ statsDeals }: { statsDeals: Deal[] }) {
  const [mapSchools, setMapSchools] = useState<MapSchool[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<MapSchool | null>(null);
  const [outreachLog, setOutreachLog] = useState<OutreachLog>({});
  const [schoolSearch, setSchoolSearch] = useState('');
  const [logContactOrg, setLogContactOrg] = useState<{ org: OrgEntry; type: 'fraternity' | 'sorority' } | null>(null);
  const [viewDealOrg, setViewDealOrg] = useState<OrgEntry | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tb_outreach_log');
      if (saved) setOutreachLog(JSON.parse(saved));
    } catch {}

    fetch('/api/pipeline/schools')
      .then(r => r.json())
      .then((data: MapSchool[]) => setMapSchools(data))
      .catch(console.error)
      .finally(() => setMapLoading(false));
  }, []);

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
  const totalChaptersInSchool = selectedSchool
    ? selectedSchool.fraternities.length + selectedSchool.sororities.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Map */}
      {mapLoading ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C4874A]" />
        </div>
      ) : (
        <USPipelineMap
          schools={mapSchools}
          selectedState={selectedState}
          onStateClick={(st) => {
            setSelectedState(st);
            if (st) {
              // auto-clear school drill-down when selecting state
            }
          }}
        />
      )}

      {/* School Drill-down */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#2563eb18' }}>
              <Building2 size={15} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">School Outreach</p>
              <p className="text-xs text-gray-400">Search a school to contact every chapter</p>
            </div>
          </div>
          {selectedSchool && (
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
              <Upload size={12} /> Import Chapters
            </button>
          )}
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={schoolSearch}
              onChange={e => setSchoolSearch(e.target.value)}
              onFocus={() => setSelectedSchool(null)}
              placeholder="Search for a school…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20" />
          </div>
          {schoolSearch && (
            <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-lg">
              {filteredSchools.slice(0, 8).map(school => (
                <button key={school.id}
                  onClick={() => { setSelectedSchool(school); setSchoolSearch(''); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-amber-50 transition-colors flex items-center justify-between border-b border-gray-50 last:border-0">
                  <span className="font-medium text-gray-800">{school.name}</span>
                  <span className="text-xs text-gray-400">{school.fraternities.length + school.sororities.length} chapters</span>
                </button>
              ))}
              {filteredSchools.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400 text-center">No schools found</div>
              )}
            </div>
          )}
        </div>

        {/* Drill-down or empty state */}
        {selectedSchool ? (
          <div>
            <div className="px-5 py-3 bg-[#FAFAF8] border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <p className="font-bold text-[#1B2A4A] text-sm">{selectedSchool.name}</p>
                <p className="text-xs text-gray-400">
                  {selectedSchool.state}{selectedSchool.conference ? ` · ${selectedSchool.conference}` : ''} · {totalChaptersInSchool} chapters
                </p>
              </div>
              <button onClick={() => setSelectedSchool(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
            {totalChaptersInSchool === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-gray-400">
                <Building2 size={28} className="text-gray-200" />
                <p className="text-sm font-semibold text-gray-500">No chapters linked yet</p>
                <button onClick={() => setShowImport(true)}
                  className="mt-2 flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors">
                  <Upload size={14} /> Import Chapters
                </button>
              </div>
            ) : (
              <div>
                <ChapterSection label="Fraternities" orgs={selectedSchool.fraternities} type="fraternity"
                  outreachLog={outreachLog}
                  onLogContact={(o, t) => setLogContactOrg({ org: o, type: t })}
                  onViewDeal={o => setViewDealOrg(o)} />
                <ChapterSection label="Sororities" orgs={selectedSchool.sororities} type="sorority"
                  outreachLog={outreachLog}
                  onLogContact={(o, t) => setLogContactOrg({ org: o, type: t })}
                  onViewDeal={o => setViewDealOrg(o)} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#C4874A12', border: '1.5px solid #C4874A30' }}>
              <Target size={22} style={{ color: '#C4874A' }} />
            </div>
            <p className="text-sm font-semibold text-[#1B2A4A]" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>
              Select a school to see chapters
            </p>
            <p className="text-xs text-gray-400 max-w-xs text-center">Search above, then log contact for every frat and sorority in 30 min</p>
          </div>
        )}
      </div>

      {/* Drawers */}
      {selectedState && (
        <StateDealPanel stateAbbr={selectedState} deals={statsDeals} onClose={() => setSelectedState(null)} />
      )}
      {logContactOrg && selectedSchool && (
        <LogContactDrawer
          org={logContactOrg.org} orgType={logContactOrg.type}
          schoolName={selectedSchool.name}
          onClose={() => setLogContactOrg(null)}
          onSaved={handleOutreachSaved}
        />
      )}
      {viewDealOrg && (
        <ViewDealDrawer org={viewDealOrg} onClose={() => setViewDealOrg(null)} onSaved={() => {}} />
      )}
      {showImport && selectedSchool && (
        <ImportChaptersModal
          school={selectedSchool}
          existingOrgs={[...selectedSchool.fraternities, ...selectedSchool.sororities]}
          onClose={() => setShowImport(false)}
          onImported={() => {
            fetch('/api/pipeline/schools').then(r => r.json()).then((data: MapSchool[]) => {
              setMapSchools(data);
              const updated = data.find(s => s.id === selectedSchool.id) ?? null;
              setSelectedSchool(updated);
            }).catch(console.error);
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'campaigns' | 'notes' | 'map';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard',  icon: TrendingUp },
  { id: 'campaigns', label: 'Campaigns',  icon: Zap },
  { id: 'notes',     label: 'Next Steps', icon: Clock },
  { id: 'map',       label: 'Client Map', icon: MapPin },
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
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data: PipelineStats = await res.json();
      setStats(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('[war-room] stats fetch error:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 60s
  useEffect(() => {
    fetchStats();
    refreshRef.current = setInterval(fetchStats, 60_000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [fetchStats]);

  return (
    <div className="min-h-screen" style={{ background: '#FAFAF8' }}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[#FAFAF8]/95 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Title */}
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold text-[#1B2A4A]">
                War Room
              </h1>
              <span className="text-sm text-gray-400 hidden sm:block">Live sales intelligence</span>
              {statsLoading && <RefreshCw size={14} className="animate-spin text-gray-400" />}
            </div>

            {/* Last updated + Refresh */}
            <div className="flex items-center gap-2">
              {lastRefreshed && (
                <span className="hidden sm:block text-xs text-gray-400">
                  Updated {lastRefreshed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              )}
              <button
                onClick={() => { setStatsLoading(true); fetchStats(); }}
                className="p-1.5 rounded-lg text-gray-400 hover:text-[#1B2A4A] hover:bg-gray-100 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-none -mb-px mt-1">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                    tab === t.id
                      ? 'border-[#1B2A4A] text-[#1B2A4A]'
                      : 'border-transparent text-gray-400 hover:text-[#1B2A4A] hover:border-gray-200'
                  }`}
                >
                  <Icon size={15} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'dashboard'  && <DashboardTab stats={stats} />}
        {tab === 'campaigns'  && <CampaignsTab stats={stats} />}
        {tab === 'notes'      && <NextStepsTab />}
        {tab === 'map'        && <ClientMapTab statsDeals={stats?.recentDeals ?? []} />}
      </div>
    </div>
  );
}
