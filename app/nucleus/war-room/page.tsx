'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Tv,
  RefreshCw,
  MapPin,
  Calendar,
  Phone,
  TrendingUp,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Pause,
  Play,
  Check,
  AlertCircle,
  Clock,
  DollarSign,
  Users,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface School {
  id: string;
  name: string;
  conference?: string;
  state?: string;
}

interface Organization {
  id: string;
  name: string;
  school?: School;
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
  value?: number;
  temperature?: string;
  next_followup?: string;
  assigned_to?: string;
  notes?: string;
  conference?: string;
  deal_type?: string;
  organization?: Organization;
  contact?: Contact;
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

interface GranolaPanel {
  id?: string;
  content?: string;
  title?: string;
}

interface GranolaNote {
  id: string;
  title?: string;
  created_at?: string;
  attendees?: { name?: string; email?: string }[];
  panels?: GranolaPanel[];
}

// Campaign types — stored in localStorage (TODO: migrate to DB)
type CampaignType = 'founder_led' | 'intern_led' | 'instagram' | 'ambassador' | 'marketing';
type CampaignStatus = 'active' | 'paused' | 'completed';
type OutreachMethod = 'email' | 'text' | 'instagram_dm';

interface CampaignRow {
  id: string;
  chapterName: string;
  orgId?: string;
  connected: boolean;
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
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  outreach: 'Outreach',
  contacted: 'Contacted',
  follow_up: 'Follow-up',
  demo_booked: 'Demo Booked',
  first_demo: 'Demo Done',
  second_call: 'Decision Call',
  proposal: 'Proposal',
  negotiation: 'Negotiating',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  hold_off: 'Hold Off',
};

const STAGE_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700',
  outreach: 'bg-blue-100 text-blue-700',
  contacted: 'bg-cyan-100 text-cyan-700',
  follow_up: 'bg-sky-100 text-sky-700',
  demo_booked: 'bg-amber-100 text-amber-700',
  first_demo: 'bg-orange-100 text-orange-700',
  second_call: 'bg-violet-100 text-violet-700',
  proposal: 'bg-purple-100 text-purple-700',
  negotiation: 'bg-pink-100 text-pink-700',
  closed_won: 'bg-emerald-100 text-emerald-700',
  closed_lost: 'bg-red-100 text-red-700',
  hold_off: 'bg-slate-100 text-slate-500',
};

const CONF_COLORS: Record<string, string> = {
  SEC: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Big 12': 'bg-amber-100 text-amber-800 border-amber-200',
  ACC: 'bg-blue-100 text-blue-800 border-blue-200',
  'Big Ten': 'bg-violet-100 text-violet-800 border-violet-200',
  'Big East': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'Pac-12': 'bg-pink-100 text-pink-800 border-pink-200',
};

const TEMP_EMOJI: Record<string, string> = {
  hot: '🔥',
  warm: '☀️',
  cold: '🧊',
  dead: '💀',
};

const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  founder_led: 'Founder-Led',
  intern_led: 'Intern-Led',
  instagram: 'Instagram',
  ambassador: 'Ambassador',
  marketing: 'Marketing',
};

const CAMPAIGN_TYPE_COLORS: Record<CampaignType, string> = {
  founder_led: 'bg-violet-100 text-violet-700',
  intern_led: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  ambassador: 'bg-amber-100 text-amber-700',
  marketing: 'bg-emerald-100 text-emerald-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function fmtDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function followupColor(dateStr?: string): string {
  if (!dateStr) return 'text-gray-400';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  if (d < today) return 'text-red-500 font-semibold';
  if (d.getTime() === today.getTime()) return 'text-amber-600 font-semibold';
  return 'text-gray-500';
}

function confColorClass(conf: string): string {
  return CONF_COLORS[conf] || 'bg-gray-100 text-gray-700 border-gray-200';
}

function repInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

function repColor(name?: string): string {
  const colors = [
    'bg-violet-200 text-violet-800',
    'bg-blue-200 text-blue-800',
    'bg-emerald-200 text-emerald-800',
    'bg-amber-200 text-amber-800',
    'bg-pink-200 text-pink-800',
    'bg-cyan-200 text-cyan-800',
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  icon: Icon,
  color = 'text-[#1B2A4A]',
}: {
  label: string;
  value: number | string;
  icon?: React.ElementType;
  color?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5 text-gray-400 text-xs font-medium uppercase tracking-wide truncate">
        {Icon && <Icon size={12} />}
        <span className="truncate">{label}</span>
      </div>
      <span className={`text-2xl font-bold ${color} font-[Instrument_Serif] leading-none`}>
        {value}
      </span>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls} whitespace-nowrap`}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

function RepChip({ name }: { name?: string }) {
  if (!name) return null;
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${repColor(name)}`}
      title={name}
    >
      {repInitials(name)}
    </span>
  );
}

// ─── Tab 1: Dashboard ─────────────────────────────────────────────────────────

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

  return (
    <div className="space-y-6">
      {/* MRR Hero */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-gray-400 mb-1">
              Monthly Recurring Revenue
            </p>
            <p
              className="text-6xl lg:text-7xl font-bold text-[#1B2A4A] leading-none"
              style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
            >
              {fmt$(stats.mrr)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Goal: {fmt$(stats.mrrGoal)}</p>
            <p
              className="text-3xl font-bold text-[#C4874A]"
              style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
            >
              {mrrPct}%
            </p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
          <div
            className="h-4 rounded-full transition-all duration-700"
            style={{
              width: `${mrrPct}%`,
              background: 'linear-gradient(90deg, #C4874A 0%, #E0A96D 100%)',
            }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>{fmt$(stats.mrr)} MRR</span>
          <span>{fmt$(stats.mrrGoal)} goal</span>
        </div>
      </div>

      {/* Stats Chips Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatChip
          label="Schools in Convo"
          value={stats.schoolsInConversation}
          icon={Users}
          color="text-[#1B2A4A]"
        />
        <StatChip
          label="Demos · 7 days"
          value={stats.demosNext7}
          icon={Calendar}
          color="text-amber-600"
        />
        <StatChip
          label="Demos · 14 days"
          value={stats.demosNext14}
          icon={Calendar}
          color="text-amber-600"
        />
        <StatChip
          label="Decisions · 7d"
          value={stats.decisionsNext7}
          icon={Phone}
          color="text-violet-600"
        />
        <StatChip
          label="Decisions · 14d"
          value={stats.decisionsNext14}
          icon={Phone}
          color="text-violet-600"
        />
      </div>

      {/* Conference Grid */}
      {stats.byConference.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <h2
            className="text-lg font-semibold text-[#1B2A4A] mb-4"
            style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
          >
            Conference Tracker
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.byConference.map((c) => (
              <div
                key={c.conference}
                className={`border rounded-xl px-3 py-2 flex flex-col gap-0.5 min-w-[110px] ${confColorClass(c.conference)}`}
              >
                <span className="text-xs font-bold uppercase tracking-wide">{c.conference}</span>
                <span className="text-lg font-bold leading-none" style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}>
                  {c.dealCount}
                </span>
                <span className="text-xs opacity-70">{fmt$(c.pipelineValue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Pipeline Feed */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2
            className="text-lg font-semibold text-[#1B2A4A]"
            style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
          >
            Live Pipeline Feed
          </h2>
          <span className="text-xs text-gray-400">{stats.recentDeals.length} active deals</span>
        </div>
        <div className="overflow-y-auto max-h-[520px] divide-y divide-gray-50">
          {stats.recentDeals.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">No active deals</div>
          ) : (
            stats.recentDeals.map((deal) => (
              <PipelineRow key={deal.id} deal={deal} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PipelineRow({ deal }: { deal: Deal }) {
  const org = deal.organization;
  const school = org?.school;
  const chapterName = org?.name || '—';
  const schoolName = school?.name || deal.conference || '—';
  const followupCls = followupColor(deal.next_followup);

  return (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
      {/* Chapter + School */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#1B2A4A] truncate">{chapterName}</p>
        <p className="text-xs text-gray-400 truncate">{schoolName}</p>
      </div>

      {/* Stage */}
      <div className="hidden sm:block flex-shrink-0">
        <StageBadge stage={deal.stage} />
      </div>

      {/* Temp emoji */}
      <span className="text-base flex-shrink-0" title={deal.temperature || ''}>
        {TEMP_EMOJI[deal.temperature || ''] || ''}
      </span>

      {/* Rep */}
      <div className="flex-shrink-0">
        <RepChip name={deal.assigned_to} />
      </div>

      {/* Next followup */}
      <div className={`text-xs flex-shrink-0 w-16 text-right ${followupCls}`}>
        {deal.next_followup ? fmtDate(deal.next_followup) : '—'}
      </div>

      {/* Value */}
      <div className="text-xs font-medium text-gray-600 flex-shrink-0 w-14 text-right">
        {deal.value ? fmt$(deal.value) : '—'}
      </div>
    </div>
  );
}

// ─── Tab 2: Campaigns ─────────────────────────────────────────────────────────

const CAMPAIGN_STORAGE_KEY = 'trailblaize_campaigns_v1';

// NOTE: Campaigns are currently stored in localStorage for fast local iteration.
// TODO: Migrate to a `campaigns` table in Supabase with `campaign_rows` child table.

function loadCampaigns(): Campaign[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Campaign[]) : [];
  } catch {
    return [];
  }
}

function saveCampaigns(campaigns: Campaign[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaigns));
}

function CampaignsTab({ stats }: { stats: PipelineStats | null }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CampaignType>('founder_led');
  const [newSchool, setNewSchool] = useState('');

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadCampaigns();
    setCampaigns(stored);
    if (stored.length > 0) setActiveCampaignId(stored[0].id);
  }, []);

  const persist = useCallback((updated: Campaign[]) => {
    setCampaigns(updated);
    saveCampaigns(updated);
  }, []);

  const createCampaign = () => {
    if (!newName.trim()) return;

    // Pre-populate rows from pipeline deals at this school
    const schoolDeals =
      stats?.recentDeals.filter(
        (d) =>
          d.organization?.school?.name?.toLowerCase().includes(newSchool.toLowerCase()) ||
          d.organization?.school?.id === newSchool
      ) ?? [];

    const rows: CampaignRow[] = schoolDeals.map((d) => ({
      id: uid(),
      chapterName: d.organization?.name || '',
      orgId: d.organization?.id,
      connected: false,
      method: 'email',
      contactName: d.contact?.name || '',
      contactInfo: d.contact?.email || d.contact?.phone || '',
      sourceUrl: '',
      meetingBooked: false,
      dealId: d.id,
    }));

    // Add a blank row if no pre-populated
    if (rows.length === 0) {
      rows.push({
        id: uid(),
        chapterName: '',
        connected: false,
        method: 'email',
        contactName: '',
        contactInfo: '',
        sourceUrl: '',
        meetingBooked: false,
      });
    }

    const campaign: Campaign = {
      id: uid(),
      name: newName.trim(),
      type: newType,
      school: newSchool.trim(),
      status: 'active',
      rows,
    };

    const updated = [...campaigns, campaign];
    persist(updated);
    setActiveCampaignId(campaign.id);
    setShowNewForm(false);
    setNewName('');
    setNewSchool('');
  };

  const updateCampaignStatus = (id: string, status: CampaignStatus) => {
    persist(campaigns.map((c) => (c.id === id ? { ...c, status } : c)));
  };

  const deleteCampaign = (id: string) => {
    const updated = campaigns.filter((c) => c.id !== id);
    persist(updated);
    if (activeCampaignId === id) setActiveCampaignId(updated[0]?.id ?? null);
  };

  const updateRow = (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => {
    persist(
      campaigns.map((c) => {
        if (c.id !== campaignId) return c;
        return {
          ...c,
          rows: c.rows.map((r) => (r.id === rowId ? { ...r, ...updates } : r)),
        };
      })
    );
  };

  const addRow = (campaignId: string) => {
    const newRow: CampaignRow = {
      id: uid(),
      chapterName: '',
      connected: false,
      method: 'email',
      contactName: '',
      contactInfo: '',
      sourceUrl: '',
      meetingBooked: false,
    };
    persist(
      campaigns.map((c) =>
        c.id === campaignId ? { ...c, rows: [...c.rows, newRow] } : c
      )
    );
  };

  const deleteRow = (campaignId: string, rowId: string) => {
    persist(
      campaigns.map((c) =>
        c.id === campaignId
          ? { ...c, rows: c.rows.filter((r) => r.id !== rowId) }
          : c
      )
    );
  };

  const activeCampaign = campaigns.find((c) => c.id === activeCampaignId) ?? null;

  return (
    <div className="space-y-4">
      {/* Campaign List + New */}
      <div className="flex items-center gap-2 flex-wrap">
        {campaigns.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCampaignId(c.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              activeCampaignId === c.id
                ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                c.status === 'active'
                  ? 'bg-emerald-400'
                  : c.status === 'paused'
                  ? 'bg-amber-400'
                  : 'bg-gray-300'
              }`}
            />
            {c.name}
          </button>
        ))}
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-dashed border-gray-300 text-gray-500 hover:border-[#C4874A] hover:text-[#C4874A] transition-colors"
        >
          <Plus size={14} />
          New Campaign
        </button>
      </div>

      {/* New Campaign Form */}
      {showNewForm && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Campaign name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as CampaignType)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40"
          >
            {Object.entries(CAMPAIGN_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="School name (optional)"
            value={newSchool}
            onChange={(e) => setNewSchool(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40"
          />
          <button
            onClick={createCampaign}
            className="bg-[#1B2A4A] text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-[#263d6b] transition-colors"
          >
            Create
          </button>
          <button
            onClick={() => setShowNewForm(false)}
            className="px-3 py-2 rounded-xl text-sm text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Active Campaign */}
      {activeCampaign ? (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Campaign Header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${CAMPAIGN_TYPE_COLORS[activeCampaign.type]}`}
              >
                {CAMPAIGN_TYPE_LABELS[activeCampaign.type]}
              </span>
              <h2
                className="text-base font-semibold text-[#1B2A4A] truncate"
                style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
              >
                {activeCampaign.name}
              </h2>
              {activeCampaign.school && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <MapPin size={11} />
                  {activeCampaign.school}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeCampaign.status === 'active' ? (
                <button
                  onClick={() => updateCampaignStatus(activeCampaign.id, 'paused')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-amber-200 text-amber-600 hover:bg-amber-50"
                  title="Pause campaign"
                >
                  <Pause size={12} /> Pause
                </button>
              ) : activeCampaign.status === 'paused' ? (
                <button
                  onClick={() => updateCampaignStatus(activeCampaign.id, 'active')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  title="Resume campaign"
                >
                  <Play size={12} /> Resume
                </button>
              ) : null}
              <button
                onClick={() => updateCampaignStatus(activeCampaign.id, 'completed')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-50"
              >
                <Check size={12} /> Complete
              </button>
              <button
                onClick={() => deleteCampaign(activeCampaign.id)}
                className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50"
                title="Delete campaign"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Campaign Sheet */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-medium">Chapter</th>
                  <th className="text-left px-4 py-2 font-medium">Connected</th>
                  <th className="text-left px-4 py-2 font-medium">Method</th>
                  <th className="text-left px-4 py-2 font-medium">Contact</th>
                  <th className="text-left px-4 py-2 font-medium">Contact Info</th>
                  <th className="text-left px-4 py-2 font-medium">Source URL</th>
                  <th className="text-center px-4 py-2 font-medium">Meeting Booked</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activeCampaign.rows.map((row) => (
                  <CampaignRowItem
                    key={row.id}
                    row={row}
                    campaignId={activeCampaign.id}
                    onUpdate={updateRow}
                    onDelete={deleteRow}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Add row */}
          <div className="px-5 py-3 border-t border-gray-100">
            <button
              onClick={() => addRow(activeCampaign.id)}
              className="flex items-center gap-1.5 text-sm text-[#C4874A] hover:text-[#b07842] font-medium"
            >
              <Plus size={14} />
              Add row
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex items-center justify-center h-48 text-gray-400 text-sm">
          No campaigns yet. Create one above.
        </div>
      )}
    </div>
  );
}

function CampaignRowItem({
  row,
  campaignId,
  onUpdate,
  onDelete,
}: {
  row: CampaignRow;
  campaignId: string;
  onUpdate: (campaignId: string, rowId: string, updates: Partial<CampaignRow>) => void;
  onDelete: (campaignId: string, rowId: string) => void;
}) {
  return (
    <tr className="group hover:bg-gray-50 transition-colors">
      <td className="px-4 py-2">
        <input
          type="text"
          value={row.chapterName}
          onChange={(e) => onUpdate(campaignId, row.id, { chapterName: e.target.value })}
          className="w-full bg-transparent border-b border-transparent focus:border-gray-200 focus:outline-none text-sm py-0.5"
          placeholder="Chapter name"
        />
      </td>
      <td className="px-4 py-2">
        <button
          onClick={() => onUpdate(campaignId, row.id, { connected: !row.connected })}
          className={`w-5 h-5 rounded border transition-colors flex items-center justify-center ${
            row.connected
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-gray-300 text-transparent hover:border-emerald-400'
          }`}
        >
          <Check size={12} />
        </button>
      </td>
      <td className="px-4 py-2">
        <select
          value={row.method}
          onChange={(e) => onUpdate(campaignId, row.id, { method: e.target.value as OutreachMethod })}
          className="bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-gray-200"
        >
          <option value="email">Email</option>
          <option value="text">Text</option>
          <option value="instagram_dm">Instagram DM</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={row.contactName}
          onChange={(e) => onUpdate(campaignId, row.id, { contactName: e.target.value })}
          className="w-full bg-transparent border-b border-transparent focus:border-gray-200 focus:outline-none text-sm py-0.5"
          placeholder="Name"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={row.contactInfo}
          onChange={(e) => onUpdate(campaignId, row.id, { contactInfo: e.target.value })}
          className="w-full bg-transparent border-b border-transparent focus:border-gray-200 focus:outline-none text-sm py-0.5"
          placeholder="Email / phone"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={row.sourceUrl}
          onChange={(e) => onUpdate(campaignId, row.id, { sourceUrl: e.target.value })}
          className="w-full bg-transparent border-b border-transparent focus:border-gray-200 focus:outline-none text-sm py-0.5"
          placeholder="https://..."
        />
      </td>
      <td className="px-4 py-2 text-center">
        <button
          onClick={() => onUpdate(campaignId, row.id, { meetingBooked: !row.meetingBooked })}
          className={`w-5 h-5 rounded border transition-colors flex items-center justify-center mx-auto ${
            row.meetingBooked
              ? 'bg-amber-500 border-amber-500 text-white'
              : 'border-gray-300 text-transparent hover:border-amber-400'
          }`}
          title={row.meetingBooked ? 'Meeting booked' : 'Mark meeting booked'}
        >
          <Check size={12} />
        </button>
      </td>
      <td className="px-4 py-2">
        <button
          onClick={() => onDelete(campaignId, row.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}

// ─── Tab 3: Granola Notes ─────────────────────────────────────────────────────

function NotesTab() {
  const [notes, setNotes] = useState<GranolaNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/granola/notes');
      const data = await res.json();
      setNotes(data.notes || []);
      if (data.error) setError(data.error);
    } catch {
      setError('Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const filtered = notes.filter((n) =>
    !search || n.title?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-2" />
        Loading notes…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C4874A]/40"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex items-center justify-center h-48 text-gray-400 text-sm">
          {search ? `No notes matching "${search}"` : 'No notes found. Add GRANOLA_API_KEY to Vercel env vars.'}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((note) => {
          const isOpen = expanded.has(note.id);
          const date = note.created_at
            ? new Date(note.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : null;
          const panelText = (note.panels || [])
            .map((p) => p.content || p.title || '')
            .filter(Boolean)
            .join('\n\n');

          return (
            <div
              key={note.id}
              className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden"
            >
              <button
                onClick={() => toggleExpand(note.id)}
                className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="font-semibold text-[#1B2A4A] text-base truncate"
                    style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
                  >
                    {note.title || 'Untitled Note'}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    {date && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={11} />
                        {date}
                      </span>
                    )}
                    {note.attendees && note.attendees.length > 0 && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Users size={11} />
                        {note.attendees
                          .map((a) => a.name || a.email || 'Unknown')
                          .join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-gray-300 mt-0.5">
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>
              {isOpen && panelText && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-sans">
                    {panelText}
                  </pre>
                </div>
              )}
              {isOpen && !panelText && (
                <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-400 italic">
                  No panel content available.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab 4: Client Map ────────────────────────────────────────────────────────

function ClientMapTab({ stats }: { stats: PipelineStats | null }) {
  return (
    <div className="space-y-6">
      {/* KPI Summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatChip label="MRR" value={fmt$(stats.mrr)} icon={DollarSign} color="text-[#C4874A]" />
          <StatChip label="Schools" value={stats.schoolsInConversation} icon={Users} />
          <StatChip label="Demos · 7d" value={stats.demosNext7} icon={Calendar} color="text-amber-600" />
          <StatChip label="Decisions · 7d" value={stats.decisionsNext7} icon={Phone} color="text-violet-600" />
          <StatChip
            label="Active Deals"
            value={stats.recentDeals.length}
            icon={TrendingUp}
            color="text-emerald-600"
          />
        </div>
      )}

      {/* Map CTA */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col items-center justify-center gap-5 py-20 px-6">
        <div className="w-16 h-16 rounded-full bg-[#1B2A4A]/5 flex items-center justify-center">
          <MapPin size={32} className="text-[#1B2A4A]" />
        </div>
        <div className="text-center">
          <h2
            className="text-2xl font-bold text-[#1B2A4A] mb-2"
            style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
          >
            Client Map
          </h2>
          <p className="text-sm text-gray-400 max-w-xs">
            Visualize all active deals and clients across the country on an interactive map.
          </p>
        </div>
        <Link
          href="/nucleus/client-map"
          className="flex items-center gap-2 bg-[#1B2A4A] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#263d6b] transition-colors"
        >
          <ExternalLink size={16} />
          Open Full Map →
        </Link>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'campaigns' | 'notes' | 'map';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'campaigns', label: '📣 Campaigns' },
  { id: 'notes', label: '📝 Notes' },
  { id: 'map', label: '🗺 Client Map' },
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
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [fetchStats]);

  return (
    <div
      className="min-h-screen"
      style={{ background: '#FAFAF8' }}
    >
      {/* Page Header */}
      <div className="sticky top-0 z-10 bg-[#FAFAF8]/95 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Title */}
            <div className="flex items-center gap-2.5">
              <Tv size={20} className="text-[#1B2A4A]" />
              <h1
                className="text-xl font-bold text-[#1B2A4A]"
                style={{ fontFamily: 'Instrument Serif, Georgia, serif' }}
              >
                War Room
              </h1>
              {statsLoading && (
                <RefreshCw size={14} className="animate-spin text-gray-400" />
              )}
            </div>

            {/* Refresh + last refreshed */}
            <div className="flex items-center gap-3">
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
          <div className="flex gap-1 pb-0 -mb-px overflow-x-auto scrollbar-none">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-[#C4874A] text-[#C4874A]'
                    : 'border-transparent text-gray-500 hover:text-[#1B2A4A] hover:border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'dashboard' && <DashboardTab stats={stats} />}
        {tab === 'campaigns' && <CampaignsTab stats={stats} />}
        {tab === 'notes' && <NotesTab />}
        {tab === 'map' && <ClientMapTab stats={stats} />}
      </div>
    </div>
  );
}
