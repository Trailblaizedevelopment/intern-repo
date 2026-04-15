'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ComposableMap, Geographies, Geography as GeographyBase } from 'react-simple-maps';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Geography = GeographyBase as any;
import {
  Target,
  TrendingUp,
  DollarSign,
  Search,
  X,
  Plus,
  Building2,
  RefreshCw,
  CheckCircle2,
  Mail,
  MessageSquare,
  Instagram,
  Upload,
  Calendar,
  Users,
  Zap,
  ChevronDown,
  Edit3,
  MapPin,
  Link2,
  Phone,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type SchoolStatus = 'active_client' | 'in_pipeline' | 'not_contacted';
type OutreachStatus = 'not_contacted' | 'contacted' | 'demo_booked' | 'signed';
type OutreachMethod = 'email' | 'text' | 'instagram_dm';
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

interface School {
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

interface KPIs {
  totalActiveChapters: number;
  schoolsWithActiveClient: number;
  schoolsInPipeline: number;
  totalPipelineValue: number;
  statesCovered: number;
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

interface FounderTarget {
  schoolId: string;
  schoolName: string;
}

type FounderTargetsMap = Record<string, FounderTarget | null>;

interface DealDetail {
  id: string;
  stage: string;
  value: number;
  temperature: string | null;
  next_followup: string | null;
  notes: string | null;
  assigned_to: string | null;
}

interface PipelineDeal {
  id: string;
  stage: string;
  value: number | null;
  temperature: string | null;
  next_followup: string | null;
  notes: string | null;
  assigned_to: string | null;
  deal_type: string | null;
  org_id: string | null;
  organization: {
    id: string;
    name: string;
    type: string | null;
    status: string | null;
    school_id: string | null;
    school: {
      id: string;
      name: string;
      state: string | null;
      conference: string | null;
    } | null;
  } | null;
  contact: { id: string; name: string } | null;
}

interface StateData {
  status: SchoolStatus;
  activeClients: number;
  pipelineDeals: number;
  pipelineValue: number;
}

// ── Constants ──────────────────────────────────────────────────────────────
const FOUNDERS = ['Owen', 'Ford', 'Adam', 'Hyatt'] as const;
type Founder = (typeof FOUNDERS)[number];

const FOUNDER_COLORS: Record<Founder, { bg: string; text: string; border: string; accent: string }> = {
  Owen:  { bg: 'bg-amber-50',  text: 'text-amber-800',  border: 'border-amber-200',  accent: '#C4874A' },
  Ford:  { bg: 'bg-blue-50',   text: 'text-blue-800',   border: 'border-blue-200',   accent: '#2563eb' },
  Adam:  { bg: 'bg-emerald-50',text: 'text-emerald-800',border: 'border-emerald-200',accent: '#059669' },
  Hyatt: { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200', accent: '#7c3aed' },
};

const REP_ACCENT: Record<string, string> = {
  Owen: '#C4874A', Ford: '#2563eb', Adam: '#059669', Hyatt: '#7c3aed',
};

const OUTREACH_STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string; bg: string; border: string }> = {
  not_contacted: { label: 'Not Contacted', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  contacted:     { label: 'Contacted',     color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  demo_booked:   { label: 'Demo Booked',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  signed:        { label: 'Signed',        color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7' },
};

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  lead:          { label: 'New Lead',      color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  demo_booked:   { label: 'Demo Booked',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  first_demo:    { label: 'First Demo',    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  second_call:   { label: 'Second Call',   color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  contract_sent: { label: 'Contract Sent', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  closed_won:    { label: 'Closed Won',    color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7' },
};

const STAGE_OPTIONS = [
  { value: 'lead',          label: 'New Lead' },
  { value: 'demo_booked',   label: 'Demo Booked' },
  { value: 'first_demo',    label: 'First Demo' },
  { value: 'second_call',   label: 'Second Call' },
  { value: 'contract_sent', label: 'Contract Sent' },
  { value: 'closed_won',    label: 'Closed Won' },
];

const TEMP_OPTIONS = [
  { value: 'hot',  label: '🔥 Hot' },
  { value: 'warm', label: '🟡 Warm' },
  { value: 'cold', label: '🧊 Cold' },
];

const TEMP_EMOJI: Record<string, string> = { hot: '🔥', warm: '🟡', cold: '🧊' };

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

type PipelineTab = 'all' | 'hot' | 'warm' | 'cold' | 'demo_booked' | 'no_contact';

const PIPELINE_TABS: { id: PipelineTab; label: string }[] = [
  { id: 'all',         label: 'All' },
  { id: 'hot',         label: 'Hot 🔥' },
  { id: 'warm',        label: 'Warm 🟡' },
  { id: 'cold',        label: 'Cold 🧊' },
  { id: 'demo_booked', label: 'Demo Booked' },
  { id: 'no_contact',  label: 'No Contact Yet' },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ── KPI Chip ───────────────────────────────────────────────────────────────
function KpiChip({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm min-w-0">
      <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide leading-none truncate">{label}</p>
        <p className="text-base font-bold text-[#1B2A4A] leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ── Method Pill ────────────────────────────────────────────────────────────
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

// ── Stage Badge ────────────────────────────────────────────────────────────
function StageBadge({ stage }: { stage: string }) {
  const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.lead;
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.border }}
    >
      {cfg.label}
    </span>
  );
}

// ── Map Tooltip ────────────────────────────────────────────────────────────
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
          {data.activeClients > 0 && (
            <p>✅ {data.activeClients} active client{data.activeClients !== 1 ? 's' : ''}</p>
          )}
          {data.pipelineDeals > 0 && (
            <p>📊 {data.pipelineDeals} pipeline deal{data.pipelineDeals !== 1 ? 's' : ''}</p>
          )}
          {data.pipelineValue > 0 && (
            <p>💰 {fmt$(data.pipelineValue)}</p>
          )}
          {data.activeClients === 0 && data.pipelineDeals === 0 && (
            <p className="text-white/50">No activity yet</p>
          )}
        </div>
      ) : (
        <p className="text-white/50">No activity yet</p>
      )}
    </div>
  );
}

// ── US Pipeline Map ────────────────────────────────────────────────────────
function USPipelineMap({ schools, selectedState, onStateClick }: {
  schools: School[];
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

  function getStateFill(stateAbbr: string, isHovered: boolean): string {
    if (selectedState === stateAbbr) return '#1B2A4A';
    const data = stateDataMap[stateAbbr];
    if (isHovered) return selectedState === stateAbbr ? '#1B2A4A' : '#C4874A';
    if (!data) return '#e5e7eb';
    switch (data.status) {
      case 'active_client': return 'rgba(16, 185, 129, 0.8)';
      case 'in_pipeline':   return 'rgba(196, 135, 74, 0.6)';
      default:              return '#e5e7eb';
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#10b98118' }}>
            <MapPin size={15} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-sm" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              US Pipeline Map
            </h2>
            <p className="text-xs text-gray-400">
              {selectedState ? `Filtering pipeline → ${selectedState} · click again to clear` : 'Click a state to filter the pipeline below'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            Active Client
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: 'rgba(196, 135, 74, 0.6)' }} />
            In Pipeline
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-3 h-3 rounded-full bg-gray-200" />
            Not Contacted
          </div>
          {selectedState && (
            <button
              onClick={() => onStateClick(null)}
              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors"
            >
              <X size={10} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="relative px-4 pb-4 pt-2">
        {isMounted ? (
          <ComposableMap
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1000 }}
            width={800}
            height={460}
            style={{ width: '100%', height: 'auto' }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo) => {
                  const stateName = (geo.properties?.name ?? '') as string;
                  const stateAbbr = STATE_NAME_TO_ABBR[stateName] ?? '';
                  const isSelected = selectedState === stateAbbr;
                  const fill = getStateFill(stateAbbr, false);

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={fill}
                      stroke="#fff"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: 'none', cursor: stateAbbr ? 'pointer' : 'default' } as React.CSSProperties,
                        hover:   { fill: isSelected ? '#243560' : '#C4874A', outline: 'none', opacity: 0.85, cursor: 'pointer' } as React.CSSProperties,
                        pressed: { outline: 'none' } as React.CSSProperties,
                      }}
                      onClick={() => {
                        if (stateAbbr) onStateClick(isSelected ? null : stateAbbr);
                      }}
                      onMouseEnter={(e: any) => {
                        if (stateAbbr) setTooltip({ x: e.clientX, y: e.clientY, stateAbbr });
                      }}
                      onMouseMove={(e: any) => {
                        setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                      }}
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

      {tooltip && (
        <MapTooltip
          stateAbbr={tooltip.stateAbbr}
          data={stateDataMap[tooltip.stateAbbr] ?? null}
          x={tooltip.x}
          y={tooltip.y}
        />
      )}
    </div>
  );
}

// ── Pipeline Deal Card ─────────────────────────────────────────────────────
function PipelineDealCard({ deal, onLogContact }: {
  deal: PipelineDeal;
  onLogContact: (deal: PipelineDeal) => void;
}) {
  const repAccent = deal.assigned_to ? (REP_ACCENT[deal.assigned_to] ?? '#6b7280') : '#6b7280';
  const val = deal.value ?? 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="font-bold text-[#1B2A4A] text-sm truncate">{deal.organization?.name ?? '—'}</p>
            {deal.temperature && <span className="text-sm flex-shrink-0">{TEMP_EMOJI[deal.temperature]}</span>}
          </div>
          <p className="text-xs text-gray-400 truncate">{deal.organization?.school?.name ?? '—'}</p>
        </div>
        <button
          onClick={() => onLogContact(deal)}
          className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors whitespace-nowrap"
        >
          <Plus size={10} />
          Log
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <StageBadge stage={deal.stage} />
        {deal.assigned_to && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: repAccent }}
          >
            {deal.assigned_to}
          </span>
        )}
        {val > 0 && (
          <span className="text-xs font-bold text-[#1B2A4A]">{fmt$(val)}</span>
        )}
        {deal.next_followup && (
          <span className="text-xs text-gray-400 flex items-center gap-1 ml-auto">
            <Calendar size={10} />
            {new Date(deal.next_followup + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Pipeline Board ─────────────────────────────────────────────────────────
function PipelineBoard({ deals, dealsLoading, stateFilter, onClearStateFilter, onLogContact }: {
  deals: PipelineDeal[];
  dealsLoading: boolean;
  stateFilter: string | null;
  onClearStateFilter: () => void;
  onLogContact: (deal: PipelineDeal) => void;
}) {
  const [activeTab, setActiveTab] = useState<PipelineTab>('all');
  const [activeRep, setActiveRep] = useState<string | null>(null);

  // State filter
  const stateFiltered = useMemo(() => {
    const active = deals.filter(d => d.stage !== 'closed_lost' && d.stage !== 'hold_off');
    if (!stateFilter) return active;
    return active.filter(d => d.organization?.school?.state?.toUpperCase() === stateFilter.toUpperCase());
  }, [deals, stateFilter]);

  // Tab filter
  const tabFiltered = useMemo(() => {
    switch (activeTab) {
      case 'hot':         return stateFiltered.filter(d => d.temperature === 'hot');
      case 'warm':        return stateFiltered.filter(d => d.temperature === 'warm');
      case 'cold':        return stateFiltered.filter(d => d.temperature === 'cold');
      case 'demo_booked': return stateFiltered.filter(d => d.stage === 'demo_booked' || d.stage === 'first_demo');
      case 'no_contact':  return stateFiltered.filter(d => d.stage === 'lead');
      default:            return stateFiltered;
    }
  }, [stateFiltered, activeTab]);

  // Rep filter
  const filtered = useMemo(() => {
    if (!activeRep) return tabFiltered;
    return tabFiltered.filter(d => d.assigned_to === activeRep);
  }, [tabFiltered, activeRep]);

  // Rep summary — from ALL state-filtered deals, not just tab
  const repSummary = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    for (const d of stateFiltered) {
      const rep = d.assigned_to ?? 'Unassigned';
      if (!map[rep]) map[rep] = { count: 0, value: 0 };
      map[rep].count++;
      map[rep].value += d.value ?? 0;
    }
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [stateFiltered]);

  const tabCounts: Record<PipelineTab, number> = useMemo(() => ({
    all:         stateFiltered.length,
    hot:         stateFiltered.filter(d => d.temperature === 'hot').length,
    warm:        stateFiltered.filter(d => d.temperature === 'warm').length,
    cold:        stateFiltered.filter(d => d.temperature === 'cold').length,
    demo_booked: stateFiltered.filter(d => d.stage === 'demo_booked' || d.stage === 'first_demo').length,
    no_contact:  stateFiltered.filter(d => d.stage === 'lead').length,
  }), [stateFiltered]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1B2A4A18' }}>
            <TrendingUp size={15} className="text-[#1B2A4A]" />
          </div>
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-sm" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Pipeline Board
            </h2>
            <p className="text-xs text-gray-400">{stateFiltered.length} active deals{stateFilter ? ` in ${stateFilter}` : ''}</p>
          </div>
        </div>
        {stateFilter && (
          <button
            onClick={onClearStateFilter}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
          >
            <MapPin size={11} /> {stateFilter} <X size={10} />
          </button>
        )}
      </div>

      {/* Rep summary bar */}
      {repSummary.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mr-1">Reps:</span>
          {repSummary.map(([rep, data]) => {
            const accent = REP_ACCENT[rep] ?? '#6b7280';
            const isActive = activeRep === rep;
            return (
              <button
                key={rep}
                onClick={() => setActiveRep(isActive ? null : rep)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  isActive ? 'text-white shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                }`}
                style={isActive ? { backgroundColor: accent, borderColor: accent } : {}}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: accent, opacity: isActive ? 0.7 : 1 }}
                >
                  {rep[0]}
                </span>
                <span>{rep}</span>
                <span className={isActive ? 'text-white/70' : 'text-gray-400'}>{data.count}</span>
                {data.value > 0 && (
                  <span className="font-bold" style={{ color: isActive ? 'rgba(255,255,255,0.9)' : accent }}>
                    {fmt$(data.value)}
                  </span>
                )}
              </button>
            );
          })}
          {activeRep && (
            <button onClick={() => setActiveRep(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 flex gap-0.5 overflow-x-auto border-b border-gray-100">
        {PIPELINE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-[#1B2A4A] text-[#1B2A4A]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tabCounts[tab.id] > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? 'bg-[#1B2A4A] text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {tabCounts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="p-5">
        {dealsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#C4874A]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <TrendingUp size={28} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-400">No deals in this view</p>
            <p className="text-xs text-gray-300 mt-1">Try a different tab or clear filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(deal => (
              <PipelineDealCard key={deal.id} deal={deal} onLogContact={onLogContact} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chapter Row ────────────────────────────────────────────────────────────
function ChapterRow({ org, type, outreachEntry, onLogContact, onViewDeal }: {
  org: OrgEntry;
  type: 'fraternity' | 'sorority';
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
      <span
        className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border"
        style={{ color: statusCfg.color, backgroundColor: statusCfg.bg, borderColor: statusCfg.border }}
      >
        {statusCfg.label}
      </span>
      {outreachEntry && <MethodPill method={outreachEntry.method} />}
      {outreachEntry?.contactedAt ? (
        <span className="flex-shrink-0 text-xs text-gray-400 hidden lg:block w-16">
          {new Date(outreachEntry.contactedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      ) : (
        <span className="flex-shrink-0 text-xs text-gray-300 hidden lg:block w-16">—</span>
      )}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <button
          onClick={() => onLogContact(org, type)}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors whitespace-nowrap"
        >
          <Plus size={11} /> Log Contact
        </button>
        <button
          onClick={() => onViewDeal(org)}
          className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
            primaryDeal ? 'bg-[#C4874A] text-white hover:bg-[#b07640]' : 'border border-gray-200 text-gray-400 hover:bg-gray-50'
          }`}
        >
          View Deal
        </button>
      </div>
    </div>
  );
}

// ── Chapter Section ────────────────────────────────────────────────────────
function ChapterSection({ label, orgs, type, outreachLog, onLogContact, onViewDeal }: {
  label: string;
  orgs: OrgEntry[];
  type: 'fraternity' | 'sorority';
  outreachLog: OutreachLog;
  onLogContact: (org: OrgEntry, type: 'fraternity' | 'sorority') => void;
  onViewDeal: (org: OrgEntry) => void;
}) {
  const contactedCount = orgs.filter(o => {
    const e = outreachLog[o.id];
    return e && e.status !== 'not_contacted';
  }).length;

  const labelColor = type === 'fraternity' ? '#1d4ed8' : '#be185d';
  const labelBg   = type === 'fraternity' ? '#eff6ff' : '#fdf2f8';

  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/70 border-b border-gray-100">
        <span className="text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-md" style={{ color: labelColor, backgroundColor: labelBg }}>
          {label}
        </span>
        <span className="text-xs text-gray-400">{contactedCount}/{orgs.length} contacted</span>
        {contactedCount === orgs.length && orgs.length > 0 && (
          <span className="text-xs text-green-600 font-semibold">✓ All done!</span>
        )}
      </div>
      {orgs.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-gray-400">No {label.toLowerCase()} linked yet</p>
        </div>
      ) : (
        <div>
          {orgs.map(org => (
            <ChapterRow
              key={org.id}
              org={org}
              type={type}
              outreachEntry={outreachLog[org.id]}
              onLogContact={onLogContact}
              onViewDeal={onViewDeal}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Log Contact Drawer ─────────────────────────────────────────────────────
function LogContactDrawer({ org, orgType, schoolId, schoolName, onClose, onSaved }: {
  org: OrgEntry;
  orgType: 'fraternity' | 'sorority';
  schoolId: string;
  schoolName: string;
  onClose: () => void;
  onSaved: (orgId: string, entry: OutreachEntry) => void;
}) {
  const [contactType, setContactType]   = useState<ContactType>('president');
  const [method, setMethod]             = useState<OutreachMethod>('email');
  const [notes, setNotes]               = useState('');
  const [sourceUrl, setSourceUrl]       = useState('');
  const [contactInfo, setContactInfo]   = useState('');
  const [meetingBooked, setMeetingBooked] = useState(false);
  const [createDeal, setCreateDeal]     = useState(true);
  const [saving, setSaving]             = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      let dealId: string | undefined;

      if (createDeal) {
        const noteParts = [notes, sourceUrl && `Source: ${sourceUrl}`, contactInfo && `Contact: ${contactInfo}`].filter(Boolean);
        const res = await fetch('/api/pipeline/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: org.id,
            stage: meetingBooked ? 'demo_booked' : 'lead',
            value: 0,
            deal_type: orgType,
            notes: noteParts.join('\n') || null,
          }),
        });
        if (res.ok) {
          const deal = await res.json();
          dealId = deal.id;
        }
      }

      const entry: OutreachEntry = {
        status: meetingBooked ? 'demo_booked' : 'contacted',
        method,
        contactType,
        contactedAt: new Date().toISOString(),
        notes,
        dealId,
        sourceUrl: sourceUrl || undefined,
        contactInfo: contactInfo || undefined,
        meetingBooked,
      };

      onSaved(org.id, entry);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const methodOptions: { value: OutreachMethod; label: string; icon: React.ReactNode }[] = [
    { value: 'email',        label: 'Email',        icon: <Mail size={14} /> },
    { value: 'text',         label: 'Text',         icon: <MessageSquare size={14} /> },
    { value: 'instagram_dm', label: 'Instagram DM', icon: <Instagram size={14} /> },
  ];

  const contactOptions: { value: ContactType; label: string }[] = [
    { value: 'president',    label: 'President' },
    { value: 'alumni_chair', label: 'Alumni Chair' },
    { value: 'rush_chair',   label: 'Rush Chair' },
    { value: 'other',        label: 'Other' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[440px] bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Log Contact
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{org.name} · {schoolName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Who did you reach? */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Who did you reach?</label>
            <div className="grid grid-cols-2 gap-2">
              {contactOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setContactType(opt.value)}
                  className={`py-2 px-3 text-sm rounded-lg border font-medium transition-colors ${
                    contactType === opt.value
                      ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contact Method */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Method</label>
            <div className="flex gap-2">
              {methodOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setMethod(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-lg border font-medium transition-colors ${
                    method === opt.value
                      ? 'bg-[#C4874A] text-white border-[#C4874A]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.icon}
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Info</label>
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={contactInfo}
                onChange={e => setContactInfo(e.target.value)}
                placeholder="Phone number or @instagram handle"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40"
              />
            </div>
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Source URL</label>
            <div className="relative">
              <Link2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="url"
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="Instagram profile, chapter website, etc."
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What happened? Key details from the conversation..."
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40 resize-none"
            />
          </div>

          {/* Meeting booked */}
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

          {/* Create deal */}
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

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── View Deal Drawer ───────────────────────────────────────────────────────
function ViewDealDrawer({ org, onClose, onSaved }: {
  org: OrgEntry;
  onClose: () => void;
  onSaved: () => void;
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
      .then(d => {
        setDeal(d);
        setStage(d.stage ?? 'lead');
        setTemperature(d.temperature ?? '');
        setNextFollowup(d.next_followup ?? '');
        setNotes(d.notes ?? '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [primaryDeal]);

  async function handleSave() {
    if (!deal) return;
    setSaving(true);
    try {
      await fetch(`/api/pipeline/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, temperature: temperature || null, next_followup: nextFollowup || null, notes: notes || null }),
      });
      onSaved();
      onClose();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[420px] bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>Pipeline Deal</h2>
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
              <p className="text-xs text-gray-400 mt-1">Log a contact first to create a pipeline deal</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Stage</label>
                <div className="relative">
                  <select value={stage} onChange={e => setStage(e.target.value)} className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 appearance-none bg-white">
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
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Deal notes, context, next steps..." rows={4}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 resize-none" />
              </div>
            </>
          )}
        </div>

        {deal && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-60">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Import Chapters Modal ──────────────────────────────────────────────────
function ImportChaptersModal({ school, existingOrgs, onClose, onImported }: {
  school: School;
  existingOrgs: OrgEntry[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: string[]; skipped: string[] } | null>(null);

  async function handleImport() {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setImporting(true);
    const added: string[] = [];
    const skipped: string[] = [];
    const existingNames = new Set(existingOrgs.map(o => o.name.toLowerCase()));

    for (const name of lines) {
      if (existingNames.has(name.toLowerCase())) { skipped.push(name); continue; }
      try {
        const res = await fetch('/api/pipeline/orgs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, school_id: school.id, type: 'fraternity', status: 'prospect' }),
        });
        if (res.ok) added.push(name); else skipped.push(name);
      } catch { skipped.push(name); }
    }

    setResult({ added, skipped });
    setImporting(false);
    if (added.length > 0) onImported();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8] rounded-t-2xl">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>Import Chapters</h2>
            <p className="text-sm text-gray-500 mt-0.5">{school.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-600">Paste chapter names below, one per line. Existing chapters will be skipped.</p>
              <textarea value={text} onChange={e => setText(e.target.value)}
                placeholder={'Alpha Phi Alpha\nKappa Alpha Psi\nPhi Beta Sigma'} rows={8}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 resize-none font-mono" />
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={handleImport} disabled={importing || !text.trim()}
                  className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {importing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Importing...</> : <><Upload size={15} />Import</>}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {result.added.length > 0 && (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                    <p className="text-sm font-semibold text-green-800 mb-2">✅ Added {result.added.length} chapter{result.added.length !== 1 ? 's' : ''}</p>
                    <ul className="space-y-1">{result.added.map(n => <li key={n} className="text-xs text-green-700">{n}</li>)}</ul>
                  </div>
                )}
                {result.skipped.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-600 mb-2">⏭ Skipped {result.skipped.length} (already exist or failed)</p>
                    <ul className="space-y-1">{result.skipped.map(n => <li key={n} className="text-xs text-gray-500">{n}</li>)}</ul>
                  </div>
                )}
              </div>
              <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors">Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Founder Target Board ───────────────────────────────────────────────────
function FounderTargetBoard({ schools, outreachLog, founderTargets, onTargetChange, onSelectSchool }: {
  schools: School[];
  outreachLog: OutreachLog;
  founderTargets: FounderTargetsMap;
  onTargetChange: (founder: Founder, target: FounderTarget | null) => void;
  onSelectSchool: (school: School) => void;
}) {
  const [editingFounder, setEditingFounder] = useState<Founder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return schools.slice(0, 6);
    const q = searchQuery.toLowerCase();
    return schools.filter(s => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [schools, searchQuery]);

  function getProgress(target: FounderTarget | null): { contacted: number; total: number } {
    if (!target) return { contacted: 0, total: 0 };
    const school = schools.find(s => s.id === target.schoolId);
    if (!school) return { contacted: 0, total: 0 };
    const allOrgs = [...school.fraternities, ...school.sororities];
    const contacted = allOrgs.filter(o => {
      const entry = outreachLog[o.id];
      return entry && entry.status !== 'not_contacted';
    }).length;
    return { contacted, total: allOrgs.length };
  }

  useEffect(() => {
    if (editingFounder && searchRef.current) searchRef.current.focus();
  }, [editingFounder]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#C4874A18' }}>
          <Zap size={15} className="text-[#C4874A]" />
        </div>
        <div>
          <h2 className="font-bold text-[#1B2A4A] text-sm" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>Founder Target Board</h2>
          <p className="text-xs text-gray-400">Today's school targets — pick a school, blast every chapter</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">
        {FOUNDERS.map(founder => {
          const target = founderTargets[founder] ?? null;
          const fc = FOUNDER_COLORS[founder];
          const progress = getProgress(target);
          const isEditing = editingFounder === founder;
          const pct = progress.total > 0 ? Math.round((progress.contacted / progress.total) * 100) : 0;
          const school = target ? schools.find(s => s.id === target.schoolId) : null;

          return (
            <div key={founder} className="p-4 relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: fc.accent }}>
                    {founder[0]}
                  </span>
                  <span className="font-bold text-[#1B2A4A] text-sm">{founder}</span>
                </div>
                <button
                  onClick={() => { setEditingFounder(isEditing ? null : founder); setSearchQuery(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
                >
                  <Edit3 size={10} />
                  {target ? 'Change' : 'Set'}
                </button>
              </div>

              {isEditing && (
                <div className="mb-3 relative z-20">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input ref={searchRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search school..." className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300/50" />
                  </div>
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-30">
                    {searchResults.map(school => (
                      <button key={school.id}
                        onClick={() => { onTargetChange(founder, { schoolId: school.id, schoolName: school.name }); setEditingFounder(null); setSearchQuery(''); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 transition-colors flex items-center justify-between border-b border-gray-50 last:border-0">
                        <span className="font-medium text-gray-800 truncate">{school.name}</span>
                        <span className="flex-shrink-0 text-gray-400 ml-2">{school.fraternities.length + school.sororities.length} orgs</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {target ? (
                <div className={`rounded-xl border p-3 cursor-pointer hover:shadow-md transition-all ${fc.border} ${fc.bg}`}
                  onClick={() => { if (school) onSelectSchool(school); }}>
                  <p className={`font-bold text-sm truncate ${fc.text} mb-2`}>{target.schoolName}</p>
                  <div className="h-1.5 bg-white/80 rounded-full overflow-hidden mb-1.5">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: fc.accent }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{progress.contacted}/{progress.total} contacted</span>
                    <span className="text-xs font-bold" style={{ color: fc.accent }}>{pct}%</span>
                  </div>
                  {school && school.pipelineValue > 0 && (
                    <p className="text-xs font-semibold mt-1.5" style={{ color: fc.accent }}>{fmt$(school.pipelineValue)} pipeline</p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 flex flex-col items-center justify-center gap-1.5 text-center min-h-[80px]">
                  <Target size={18} className="text-gray-300" />
                  <p className="text-xs text-gray-400 font-medium">No target set</p>
                  <p className="text-[10px] text-gray-300">Click to assign a school</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ClientMapPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIs>({ totalActiveChapters: 0, schoolsWithActiveClient: 0, schoolsInPipeline: 0, totalPipelineValue: 0, statesCovered: 0 });
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [outreachLog, setOutreachLog] = useState<OutreachLog>({});
  const [founderTargets, setFounderTargets] = useState<FounderTargetsMap>({ Owen: null, Ford: null, Adam: null, Hyatt: null });
  const [logContactOrg, setLogContactOrg] = useState<{ org: OrgEntry; type: 'fraternity' | 'sorority' } | null>(null);
  const [viewDealOrg, setViewDealOrg] = useState<OrgEntry | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState('');

  // Persist outreach log + founder targets in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tb_outreach_log');
      if (saved) setOutreachLog(JSON.parse(saved));
      const targets = localStorage.getItem('tb_founder_targets');
      if (targets) setFounderTargets(JSON.parse(targets));
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pipeline/schools');
      const data: School[] = await res.json();
      setSchools(data);
      const states = new Set<string>();
      let activeChapters = 0, activeSchools = 0, pipelineSchools = 0, pipelineVal = 0;
      for (const s of data) {
        if (s.state) states.add(s.state);
        activeChapters += s.activeChapters.length;
        if (s.status === 'active_client') activeSchools++;
        else if (s.status === 'in_pipeline') pipelineSchools++;
        pipelineVal += s.pipelineValue;
      }
      setKpis({ totalActiveChapters: activeChapters, schoolsWithActiveClient: activeSchools, schoolsInPipeline: pipelineSchools, totalPipelineValue: pipelineVal, statesCovered: states.size });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadDeals = useCallback(async () => {
    setDealsLoading(true);
    try {
      const res = await fetch('/api/pipeline/deals?limit=200');
      const data = await res.json();
      setDeals(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setDealsLoading(false); }
  }, []);

  useEffect(() => { load(); loadDeals(); }, [load, loadDeals]);

  function handleOutreachSaved(orgId: string, entry: OutreachEntry) {
    const next = { ...outreachLog, [orgId]: entry };
    setOutreachLog(next);
    try { localStorage.setItem('tb_outreach_log', JSON.stringify(next)); } catch {}
  }

  function handleFounderTargetChange(founder: Founder, target: FounderTarget | null) {
    const next = { ...founderTargets, [founder]: target };
    setFounderTargets(next);
    try { localStorage.setItem('tb_founder_targets', JSON.stringify(next)); } catch {}
  }

  // Count contacts today
  const contactedToday = Object.values(outreachLog).filter(e => e.contactedAt?.startsWith(todayISO())).length;

  const filteredSchools = useMemo(() => {
    if (!schoolSearch.trim()) return schools;
    const q = schoolSearch.toLowerCase();
    return schools.filter(s => s.name.toLowerCase().includes(q));
  }, [schools, schoolSearch]);

  const totalChaptersInSchool = selectedSchool
    ? selectedSchool.fraternities.length + selectedSchool.sororities.length
    : 0;

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-[#1B2A4A]" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Sales Command Center
            </h1>
            <p className="text-sm text-gray-400 mt-1">Founder-led outbound → scalable sales engine</p>
          </div>
          <button onClick={() => { load(); loadDeals(); }}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 px-3 py-2 rounded-xl border border-gray-200 hover:bg-white hover:shadow-sm transition-all">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* KPI chips */}
        <div className="flex gap-3 flex-wrap">
          <KpiChip icon={<Users size={14} />} label="Active Chapters" value={String(kpis.totalActiveChapters)} color="#10b981" />
          <KpiChip icon={<Building2 size={14} />} label="In Pipeline Schools" value={String(kpis.schoolsInPipeline)} color="#C4874A" />
          <KpiChip icon={<DollarSign size={14} />} label="Pipeline Value" value={fmt$(kpis.totalPipelineValue)} color="#7c3aed" />
          <KpiChip icon={<Zap size={14} />} label="Contacted Today" value={String(contactedToday)} color="#f59e0b" />
          <KpiChip icon={<MapPin size={14} />} label="States Covered" value={String(kpis.statesCovered)} color="#2563eb" />
        </div>

        {/* US Map */}
        <USPipelineMap schools={schools} selectedState={selectedState} onStateClick={setSelectedState} />

        {/* Pipeline Board */}
        <PipelineBoard
          deals={deals}
          dealsLoading={dealsLoading}
          stateFilter={selectedState}
          onClearStateFilter={() => setSelectedState(null)}
          onLogContact={(deal) => {
            // Find the org in schools to open the drawer
            const school = schools.find(s =>
              s.fraternities.some(f => f.id === deal.org_id) ||
              s.sororities.some(f => f.id === deal.org_id)
            );
            if (school) {
              setSelectedSchool(school);
              const org = [...school.fraternities, ...school.sororities].find(o => o.id === deal.org_id);
              const orgType = school.fraternities.some(f => f.id === deal.org_id) ? 'fraternity' : 'sorority';
              if (org) setLogContactOrg({ org, type: orgType });
            }
          }}
        />

        {/* Founder Target Board */}
        <FounderTargetBoard
          schools={schools}
          outreachLog={outreachLog}
          founderTargets={founderTargets}
          onTargetChange={handleFounderTargetChange}
          onSelectSchool={(school) => { setSelectedSchool(school); setSchoolSearch(''); }}
        />

        {/* School search + drill-down */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#2563eb18' }}>
              <Building2 size={15} className="text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-[#1B2A4A] text-sm" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>School Outreach</h2>
              <p className="text-xs text-gray-400">Select a school to see all chapters</p>
            </div>
            {selectedSchool && (
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <Upload size={12} />Import Chapters
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="px-6 py-3 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={schoolSearch}
                onChange={e => setSchoolSearch(e.target.value)}
                onFocus={() => setSelectedSchool(null)}
                placeholder="Search for a school to launch outbound..."
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40"
              />
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
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#C4874A]" />
            </div>
          ) : selectedSchool ? (
            <div>
              {/* School header */}
              <div className="px-6 py-3 bg-[#FAFAF8] border-b border-gray-100 flex items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-[#1B2A4A] text-sm">{selectedSchool.name}</p>
                  <p className="text-xs text-gray-400">{selectedSchool.state}{selectedSchool.conference ? ` · ${selectedSchool.conference}` : ''} · {totalChaptersInSchool} chapters</p>
                </div>
                <button onClick={() => setSelectedSchool(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Column headers */}
              {totalChaptersInSchool > 0 && (
                <div className="flex items-center gap-3 px-5 py-2 border-b border-gray-100 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  <span className="flex-1">Chapter</span>
                  <span className="w-24 flex-shrink-0">Status</span>
                  <span className="w-16 flex-shrink-0">Method</span>
                  <span className="w-28 flex-shrink-0 hidden md:block">Contact</span>
                  <span className="w-16 flex-shrink-0 hidden lg:block">Date</span>
                  <span className="w-36 flex-shrink-0">Actions</span>
                </div>
              )}

              {totalChaptersInSchool === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Building2 size={28} className="text-gray-200 mb-3" />
                  <p className="text-sm font-semibold text-gray-500">No chapters linked yet</p>
                  <p className="text-xs mt-1 text-gray-400">Use Import to add chapters to this school</p>
                  <button onClick={() => setShowImport(true)}
                    className="mt-4 flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors">
                    <Upload size={14} />Import Chapters
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
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#C4874A12', border: '1.5px solid #C4874A30' }}>
                <Target size={26} style={{ color: '#C4874A' }} />
              </div>
              <p className="text-base font-semibold text-[#1B2A4A]" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>Select a school to see all chapters</p>
              <p className="text-sm mt-2 text-gray-400 max-w-xs text-center leading-relaxed">Pick a school, then contact every frat and sorority in 30–45 minutes</p>
            </div>
          )}
        </div>
      </div>

      {/* Drawers & Modals */}
      {logContactOrg && selectedSchool && (
        <LogContactDrawer
          org={logContactOrg.org}
          orgType={logContactOrg.type}
          schoolId={selectedSchool.id}
          schoolName={selectedSchool.name}
          onClose={() => setLogContactOrg(null)}
          onSaved={handleOutreachSaved}
        />
      )}
      {viewDealOrg && (
        <ViewDealDrawer org={viewDealOrg} onClose={() => setViewDealOrg(null)} onSaved={load} />
      )}
      {showImport && selectedSchool && (
        <ImportChaptersModal
          school={selectedSchool}
          existingOrgs={[...selectedSchool.fraternities, ...selectedSchool.sororities]}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}
    </div>
  );
}
