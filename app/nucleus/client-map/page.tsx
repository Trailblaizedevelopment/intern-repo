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
import {
  CM_UI, CM_CARD, SECTION_TITLE, TOOLBAR_BUTTON, TOOLBAR_BUTTON_PRIMARY,
  LIST_PILL, TOOLBAR_SEARCH, NEUTRAL_BADGE, DRAWER_LABEL, DRAWER_INPUT,
} from './cm-ui';

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

const OUTREACH_STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string; bg: string; border: string }> = {
  not_contacted: { label: 'Not Contacted', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  contacted:     { label: 'Contacted',     color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  demo_booked:   { label: 'Demo Booked',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  signed:        { label: 'Signed',        color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7' },
};

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  lead:          { label: 'New Lead',      color: CM_UI.textMuted, bg: NEUTRAL_BADGE.bg, border: NEUTRAL_BADGE.border },
  demo_booked:   { label: 'Demo Booked',   color: CM_UI.blueDark, bg: CM_UI.blueBg, border: '#bfdbfe' },
  first_demo:    { label: 'First Demo',    color: CM_UI.blueDark, bg: CM_UI.blueBg, border: '#bfdbfe' },
  second_call:   { label: 'Second Call',   color: CM_UI.textSecondary, bg: NEUTRAL_BADGE.bg, border: NEUTRAL_BADGE.border },
  contract_sent: { label: 'Contract Sent', color: CM_UI.warning, bg: '#fffbeb', border: '#fde68a' },
  closed_won:    { label: 'Closed Won',    color: CM_UI.success, bg: '#ecfdf5', border: '#6ee7b7' },
};

const TEMP_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  hot:  { label: 'Hot',  color: CM_UI.danger,  bg: '#fef2f2', border: '#fecaca' },
  warm: { label: 'Warm', color: CM_UI.warning, bg: '#fffbeb', border: '#fde68a' },
  cold: { label: 'Cold', color: CM_UI.blueDark, bg: CM_UI.blueBg, border: '#bfdbfe' },
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
  { value: 'hot',  label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
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

type PipelineTab = 'all' | 'hot' | 'warm' | 'cold' | 'demo_booked' | 'no_contact';

const PIPELINE_TABS: { id: PipelineTab; label: string }[] = [
  { id: 'all',         label: 'All' },
  { id: 'hot',         label: 'Hot' },
  { id: 'warm',        label: 'Warm' },
  { id: 'cold',        label: 'Cold' },
  { id: 'demo_booked', label: 'Demo Booked' },
  { id: 'no_contact',  label: 'No Contact Yet' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function displayOrgName(name: string | null | undefined): string {
  if (!name?.trim()) return 'Untitled org';
  return UUID_RE.test(name.trim()) ? 'Untitled org' : name;
}

// ── KPI Chip ───────────────────────────────────────────────────────────────
function KpiChip({ icon, label, value, last }: {
  icon: React.ReactNode; label: string; value: string; last?: boolean;
}) {
  return (
    <div style={{
      flex: '1 1 140px', minWidth: 0, padding: '12px 14px',
      borderRight: last ? undefined : `1px solid ${CM_UI.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, color: CM_UI.textMuted }}>
        {icon}
        <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CM_UI.textMuted }}>
          {label}
        </p>
      </div>
      <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: CM_UI.text, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </p>
    </div>
  );
}

// ── Method Pill ────────────────────────────────────────────────────────────
function MethodPill({ method }: { method: OutreachMethod }) {
  const cfg = {
    email:        { label: 'Email',  icon: <Mail size={10} />,          color: CM_UI.blueDark, bg: CM_UI.blueBg, border: '#bfdbfe' },
    text:         { label: 'Text',   icon: <MessageSquare size={10} />, color: CM_UI.success, bg: '#ecfdf5', border: '#6ee7b7' },
    instagram_dm: { label: 'IG DM', icon: <Instagram size={10} />,      color: CM_UI.textSecondary, bg: NEUTRAL_BADGE.bg, border: NEUTRAL_BADGE.border },
  }[method];
  return (
    <span style={{
      ...LIST_PILL, display: 'inline-flex', alignItems: 'center', gap: 4,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ── Stage Badge ────────────────────────────────────────────────────────────
function StageBadge({ stage }: { stage: string }) {
  const cfg = STAGE_CONFIG[stage] ?? STAGE_CONFIG.lead;
  return (
    <span style={{
      ...LIST_PILL,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

function TempPill({ temperature }: { temperature: string }) {
  const cfg = TEMP_STYLE[temperature];
  if (!cfg) return null;
  return (
    <span style={{ ...LIST_PILL, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
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
      style={{
        position: 'fixed', left: x + 14, top: y - 14, zIndex: 100,
        background: CM_UI.ink, color: '#fff', fontSize: '0.75rem',
        borderRadius: 10, padding: '10px 12px', pointerEvents: 'none', minWidth: 160,
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
      }}
    >
      <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '0.8125rem' }}>{stateAbbr}</p>
      {data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, color: 'rgba(255,255,255,0.8)' }}>
          {data.activeClients > 0 && (
            <p style={{ margin: 0 }}>{data.activeClients} active client{data.activeClients !== 1 ? 's' : ''}</p>
          )}
          {data.pipelineDeals > 0 && (
            <p style={{ margin: 0 }}>{data.pipelineDeals} pipeline deal{data.pipelineDeals !== 1 ? 's' : ''}</p>
          )}
          {data.pipelineValue > 0 && (
            <p style={{ margin: 0 }}>{fmt$(data.pipelineValue)}</p>
          )}
          {data.activeClients === 0 && data.pipelineDeals === 0 && (
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>No activity yet</p>
          )}
        </div>
      ) : (
        <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)' }}>No activity yet</p>
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
    if (selectedState === stateAbbr) return CM_UI.ink;
    const data = stateDataMap[stateAbbr];
    if (isHovered) return selectedState === stateAbbr ? CM_UI.ink : CM_UI.blue;
    if (!data) return CM_UI.border;
    switch (data.status) {
      case 'active_client': return 'rgba(5, 150, 105, 0.75)';
      case 'in_pipeline':   return 'rgba(37, 99, 235, 0.45)';
      default:              return CM_UI.border;
    }
  }

  return (
    <div style={{ ...CM_CARD, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${CM_UI.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: CM_UI.surfaceMuted, color: CM_UI.textMuted }}>
            <MapPin size={14} />
          </div>
          <div>
            <h2 style={SECTION_TITLE}>US Pipeline Map</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: CM_UI.textSubtle }}>
              {selectedState ? `Filtering pipeline → ${selectedState} · click again to clear` : 'Click a state to filter the pipeline below'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: CM_UI.textMuted }}>
            <div style={{ width: 10, height: 10, borderRadius: 9999, background: 'rgba(5, 150, 105, 0.75)' }} />
            Active Client
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: CM_UI.textMuted }}>
            <div style={{ width: 10, height: 10, borderRadius: 9999, background: 'rgba(37, 99, 235, 0.45)' }} />
            In Pipeline
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: CM_UI.textMuted }}>
            <div style={{ width: 10, height: 10, borderRadius: 9999, background: CM_UI.border }} />
            Not Contacted
          </div>
          {selectedState && (
            <button type="button" onClick={() => onStateClick(null)} style={TOOLBAR_BUTTON_PRIMARY}>
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', padding: '8px 16px 16px' }}>
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
                        hover:   { fill: isSelected ? CM_UI.ink : CM_UI.blue, outline: 'none', opacity: 0.9, cursor: 'pointer' } as React.CSSProperties,
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
          <div style={{ height: 288, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 24, height: 24, borderRadius: 9999, border: `2px solid ${CM_UI.border}`, borderTopColor: CM_UI.ink, animation: 'spin 1s linear infinite' }} />
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
  const val = deal.value ?? 0;

  return (
    <div style={{
      ...CM_CARD,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      transition: 'border-color 0.15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.8125rem', color: CM_UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayOrgName(deal.organization?.name)}
            </p>
            {deal.temperature && <TempPill temperature={deal.temperature} />}
          </div>
          <p style={{ margin: 0, fontSize: '0.75rem', color: CM_UI.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deal.organization?.school?.name ?? '—'}
          </p>
        </div>
        <button type="button" onClick={() => onLogContact(deal)} style={{ ...TOOLBAR_BUTTON_PRIMARY, height: 28, padding: '0 10px', fontSize: '0.75rem', flexShrink: 0 }}>
          <Plus size={11} /> Log
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <StageBadge stage={deal.stage} />
        {deal.assigned_to && (
          <span style={{
            ...LIST_PILL,
            background: NEUTRAL_BADGE.bg,
            color: CM_UI.textSecondary,
            border: `1px solid ${NEUTRAL_BADGE.border}`,
          }}>
            {deal.assigned_to}
          </span>
        )}
        {val > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: CM_UI.text }}>{fmt$(val)}</span>
        )}
        {deal.next_followup && (
          <span style={{ fontSize: '0.75rem', color: CM_UI.textSubtle, display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
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
    <div style={{ ...CM_CARD, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${CM_UI.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: CM_UI.surfaceMuted, color: CM_UI.textMuted }}>
            <TrendingUp size={14} />
          </div>
          <div>
            <h2 style={SECTION_TITLE}>Pipeline Board</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: CM_UI.textSubtle }}>
              {stateFiltered.length} active deals{stateFilter ? ` in ${stateFilter}` : ''}
            </p>
          </div>
        </div>
        {stateFilter && (
          <button type="button" onClick={onClearStateFilter} style={TOOLBAR_BUTTON}>
            <MapPin size={12} /> {stateFilter} <X size={11} />
          </button>
        )}
      </div>

      {repSummary.length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${CM_UI.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CM_UI.textSubtle }}>Reps:</span>
          {repSummary.map(([rep, data]) => {
            const isActive = activeRep === rep;
            return (
              <button
                key={rep}
                type="button"
                onClick={() => setActiveRep(isActive ? null : rep)}
                style={isActive
                  ? { ...TOOLBAR_BUTTON_PRIMARY, height: 30, padding: '0 10px' }
                  : { ...TOOLBAR_BUTTON, height: 30, padding: '0 10px' }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: 9999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.625rem', fontWeight: 700,
                  background: isActive ? 'rgba(255,255,255,0.2)' : CM_UI.surfaceMuted,
                  color: isActive ? '#fff' : CM_UI.textMuted,
                }}>
                  {rep[0]}
                </span>
                <span>{rep}</span>
                <span style={{ color: isActive ? 'rgba(255,255,255,0.7)' : CM_UI.textSubtle }}>{data.count}</span>
                {data.value > 0 && (
                  <span style={{ fontWeight: 700 }}>{fmt$(data.value)}</span>
                )}
              </button>
            );
          })}
          {activeRep && (
            <button type="button" onClick={() => setActiveRep(null)} style={{ ...TOOLBAR_BUTTON, height: 30, border: 'none', background: 'transparent', color: CM_UI.textSubtle }}>
              Clear
            </button>
          )}
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', gap: 2, overflowX: 'auto', borderBottom: `1px solid ${CM_UI.border}` }}>
        {PIPELINE_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 12px', fontSize: '0.75rem', fontWeight: 600,
              border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? CM_UI.blue : 'transparent'}`,
              background: 'transparent', cursor: 'pointer', whiteSpace: 'nowrap',
              color: activeTab === tab.id ? CM_UI.text : CM_UI.textMuted,
              fontFamily: 'inherit',
            }}
          >
            {tab.label}
            {tabCounts[tab.id] > 0 && (
              <span style={{
                ...LIST_PILL,
                background: activeTab === tab.id ? CM_UI.ink : CM_UI.surfaceMuted,
                color: activeTab === tab.id ? '#fff' : CM_UI.textMuted,
                border: '1px solid transparent',
              }}>
                {tabCounts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {dealsLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
            <div style={{ width: 24, height: 24, borderRadius: 9999, border: `2px solid ${CM_UI.border}`, borderTopColor: CM_UI.ink, animation: 'spin 1s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <TrendingUp size={28} color={CM_UI.border} style={{ margin: '0 auto 12px' }} />
            <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: CM_UI.textMuted }}>No deals in this view</p>
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: CM_UI.textSubtle }}>Try a different tab or clear filters</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
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
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
      borderBottom: `1px solid ${CM_UI.border}`, background: CM_UI.surface,
    }}>
      <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 600, color: CM_UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
        {displayOrgName(org.name)}
      </span>
      <span style={{
        ...LIST_PILL, flexShrink: 0,
        color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.border}`,
      }}>
        {statusCfg.label}
      </span>
      {outreachEntry && <MethodPill method={outreachEntry.method} />}
      {outreachEntry?.contactedAt ? (
        <span style={{ flexShrink: 0, fontSize: '0.75rem', color: CM_UI.textSubtle, width: 56 }}>
          {new Date(outreachEntry.contactedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      ) : (
        <span style={{ flexShrink: 0, fontSize: '0.75rem', color: CM_UI.textSubtle, width: 56 }}>—</span>
      )}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <button type="button" onClick={() => onLogContact(org, type)} style={{ ...TOOLBAR_BUTTON_PRIMARY, height: 30, padding: '0 10px', fontSize: '0.75rem' }}>
          <Plus size={11} /> Log Contact
        </button>
        <button
          type="button"
          onClick={() => onViewDeal(org)}
          style={primaryDeal
            ? { ...TOOLBAR_BUTTON_PRIMARY, height: 30, padding: '0 10px', fontSize: '0.75rem', background: CM_UI.blue }
            : { ...TOOLBAR_BUTTON, height: 30, padding: '0 10px', fontSize: '0.75rem' }}
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

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: CM_UI.surfaceMuted, borderBottom: `1px solid ${CM_UI.border}` }}>
        <span style={{
          ...LIST_PILL,
          color: type === 'fraternity' ? CM_UI.blueDark : CM_UI.textSecondary,
          background: type === 'fraternity' ? CM_UI.blueBg : NEUTRAL_BADGE.bg,
          border: `1px solid ${type === 'fraternity' ? '#bfdbfe' : NEUTRAL_BADGE.border}`,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {label}
        </span>
        <span style={{ fontSize: '0.75rem', color: CM_UI.textSubtle }}>{contactedCount}/{orgs.length} contacted</span>
        {contactedCount === orgs.length && orgs.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: CM_UI.success, fontWeight: 600 }}>All done</span>
        )}
      </div>
      {orgs.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: CM_UI.textSubtle }}>No {label.toLowerCase()} linked yet</p>
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

  const toggleBtn = (selected: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 12px', fontSize: '0.8125rem', fontWeight: 500, borderRadius: 10,
    cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color 0.15s ease',
    border: `1px solid ${selected ? CM_UI.ink : CM_UI.border}`,
    background: selected ? CM_UI.ink : '#fff',
    color: selected ? '#fff' : CM_UI.textSecondary,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{
        width: 440, background: CM_UI.surface, display: 'flex', flexDirection: 'column',
        height: '100%', borderLeft: `1px solid ${CM_UI.border}`,
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.12)',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${CM_UI.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: CM_UI.surfaceMuted,
        }}>
          <div>
            <h2 style={{ ...SECTION_TITLE, fontSize: '0.9375rem', margin: 0 }}>Log Contact</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: CM_UI.textMuted }}>
              {displayOrgName(org.name)} · {schoolName}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{
            ...TOOLBAR_BUTTON, height: 32, width: 32, padding: 0, border: 'none', background: 'transparent', color: CM_UI.textSubtle,
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={DRAWER_LABEL}>Who did you reach?</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {contactOptions.map(opt => (
                <button key={opt.value} type="button" onClick={() => setContactType(opt.value)} style={toggleBtn(contactType === opt.value)}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={DRAWER_LABEL}>Contact Method</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {methodOptions.map(opt => (
                <button key={opt.value} type="button" onClick={() => setMethod(opt.value)} style={{ ...toggleBtn(method === opt.value), flex: 1 }}>
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={DRAWER_LABEL}>Contact Info</label>
            <div style={{ position: 'relative' }}>
              <Phone size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: CM_UI.textSubtle }} />
              <input
                type="text"
                value={contactInfo}
                onChange={e => setContactInfo(e.target.value)}
                placeholder="Phone number or @instagram handle"
                style={{ ...DRAWER_INPUT, paddingLeft: 36 }}
              />
            </div>
          </div>

          <div>
            <label style={DRAWER_LABEL}>Source URL</label>
            <div style={{ position: 'relative' }}>
              <Link2 size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: CM_UI.textSubtle }} />
              <input
                type="url"
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="Instagram profile, chapter website, etc."
                style={{ ...DRAWER_INPUT, paddingLeft: 36 }}
              />
            </div>
          </div>

          <div>
            <label style={DRAWER_LABEL}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What happened? Key details from the conversation..."
              rows={3}
              style={{ ...DRAWER_INPUT, resize: 'none' }}
            />
          </div>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
            padding: 12, borderRadius: 10, border: `1px solid ${CM_UI.border}`,
          }}>
            <div style={{ position: 'relative', marginTop: 2 }}>
              <input type="checkbox" checked={meetingBooked} onChange={e => setMeetingBooked(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              <div style={{
                width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${meetingBooked ? CM_UI.blue : CM_UI.border}`,
                background: meetingBooked ? CM_UI.blue : '#fff',
              }}>
                {meetingBooked && <CheckCircle2 size={12} color="#fff" />}
              </div>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: CM_UI.text }}>Meeting / demo booked</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: CM_UI.textMuted }}>Sets deal stage to Demo Booked automatically</p>
            </div>
          </label>

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
            padding: 12, borderRadius: 10, border: `1px solid ${CM_UI.border}`,
          }}>
            <div style={{ position: 'relative', marginTop: 2 }}>
              <input type="checkbox" checked={createDeal} onChange={e => setCreateDeal(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              <div style={{
                width: 20, height: 20, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `2px solid ${createDeal ? CM_UI.ink : CM_UI.border}`,
                background: createDeal ? CM_UI.ink : '#fff',
              }}>
                {createDeal && <CheckCircle2 size={12} color="#fff" />}
              </div>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: CM_UI.text }}>Create pipeline deal</p>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: CM_UI.textMuted }}>Add this chapter as a new lead in the pipeline</p>
            </div>
          </label>
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${CM_UI.border}`, display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose} style={{ ...TOOLBAR_BUTTON, flex: 1, height: 38, borderRadius: 10 }}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} style={{
            ...TOOLBAR_BUTTON_PRIMARY, flex: 1, height: 38, borderRadius: 10, opacity: saving ? 0.6 : 1,
          }}>
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

  const tempBtn = (selected: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 12px', fontSize: '0.8125rem', fontWeight: 500, borderRadius: 10,
    cursor: 'pointer', fontFamily: 'inherit',
    border: `1px solid ${selected ? CM_UI.ink : CM_UI.border}`,
    background: selected ? CM_UI.ink : '#fff',
    color: selected ? '#fff' : CM_UI.textSecondary,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{
        width: 420, background: CM_UI.surface, display: 'flex', flexDirection: 'column',
        height: '100%', borderLeft: `1px solid ${CM_UI.border}`,
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.12)',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${CM_UI.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: CM_UI.surfaceMuted,
        }}>
          <div>
            <h2 style={{ ...SECTION_TITLE, fontSize: '0.9375rem', margin: 0 }}>Pipeline Deal</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: CM_UI.textMuted }}>{displayOrgName(org.name)}</p>
          </div>
          <button type="button" onClick={onClose} style={{
            ...TOOLBAR_BUTTON, height: 32, width: 32, padding: 0, border: 'none', background: 'transparent', color: CM_UI.textSubtle,
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
              <div style={{ width: 24, height: 24, borderRadius: 9999, border: `2px solid ${CM_UI.border}`, borderTopColor: CM_UI.ink, animation: 'spin 1s linear infinite' }} />
            </div>
          ) : !deal ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Building2 size={28} color={CM_UI.border} style={{ margin: '0 auto 12px' }} />
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: CM_UI.textMuted }}>No deal found</p>
              <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: CM_UI.textSubtle }}>Log a contact first to create a pipeline deal</p>
            </div>
          ) : (
            <>
              <div>
                <label style={DRAWER_LABEL}>Stage</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={stage}
                    onChange={e => setStage(e.target.value)}
                    style={{ ...DRAWER_INPUT, appearance: 'none', paddingRight: 32 }}
                  >
                    {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: CM_UI.textSubtle, pointerEvents: 'none' }} />
                </div>
              </div>
              <div>
                <label style={DRAWER_LABEL}>Temperature</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {TEMP_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTemperature(opt.value === temperature ? '' : opt.value)}
                      style={tempBtn(temperature === opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={DRAWER_LABEL}>Next Follow-up</label>
                <div style={{ position: 'relative' }}>
                  <Calendar size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: CM_UI.textSubtle }} />
                  <input
                    type="date"
                    value={nextFollowup}
                    onChange={e => setNextFollowup(e.target.value)}
                    style={{ ...DRAWER_INPUT, paddingLeft: 36 }}
                  />
                </div>
              </div>
              <div>
                <label style={DRAWER_LABEL}>Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Deal notes, context, next steps..."
                  rows={4}
                  style={{ ...DRAWER_INPUT, resize: 'none' }}
                />
              </div>
            </>
          )}
        </div>

        {deal && (
          <div style={{ padding: '14px 20px', borderTop: `1px solid ${CM_UI.border}`, display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...TOOLBAR_BUTTON, flex: 1, height: 38, borderRadius: 10 }}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving} style={{
              ...TOOLBAR_BUTTON_PRIMARY, flex: 1, height: 38, borderRadius: 10, opacity: saving ? 0.6 : 1,
            }}>
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{
        ...CM_CARD, position: 'relative', width: '100%', maxWidth: 448,
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.12)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${CM_UI.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: CM_UI.surfaceMuted,
        }}>
          <div>
            <h2 style={{ ...SECTION_TITLE, fontSize: '0.9375rem', margin: 0 }}>Import Chapters</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: CM_UI.textMuted }}>{school.name}</p>
          </div>
          <button type="button" onClick={onClose} style={{
            ...TOOLBAR_BUTTON, height: 32, width: 32, padding: 0, border: 'none', background: 'transparent', color: CM_UI.textSubtle,
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!result ? (
            <>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: CM_UI.textSecondary }}>
                Paste chapter names below, one per line. Existing chapters will be skipped.
              </p>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={'Alpha Phi Alpha\nKappa Alpha Psi\nPhi Beta Sigma'}
                rows={8}
                style={{ ...DRAWER_INPUT, resize: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={onClose} style={{ ...TOOLBAR_BUTTON, flex: 1, height: 38, borderRadius: 10 }}>Cancel</button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !text.trim()}
                  style={{
                    ...TOOLBAR_BUTTON_PRIMARY, flex: 1, height: 38, borderRadius: 10,
                    opacity: importing || !text.trim() ? 0.6 : 1,
                  }}
                >
                  {importing ? (
                    <>
                      <div style={{ width: 14, height: 14, borderRadius: 9999, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} />
                      Importing...
                    </>
                  ) : (
                    <><Upload size={15} />Import</>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.added.length > 0 && (
                  <div style={{ background: '#ecfdf5', border: '1px solid #d1fae5', borderRadius: 10, padding: 14 }}>
                    <p style={{ margin: '0 0 8px', fontSize: '0.8125rem', fontWeight: 600, color: CM_UI.success }}>
                      Added {result.added.length} chapter{result.added.length !== 1 ? 's' : ''}
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {result.added.map(n => <li key={n} style={{ fontSize: '0.75rem', color: '#047857' }}>{displayOrgName(n)}</li>)}
                    </ul>
                  </div>
                )}
                {result.skipped.length > 0 && (
                  <div style={{ background: CM_UI.surfaceMuted, border: `1px solid ${CM_UI.border}`, borderRadius: 10, padding: 14 }}>
                    <p style={{ margin: '0 0 8px', fontSize: '0.8125rem', fontWeight: 600, color: CM_UI.textSecondary }}>
                      Skipped {result.skipped.length} (already exist or failed)
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {result.skipped.map(n => <li key={n} style={{ fontSize: '0.75rem', color: CM_UI.textMuted }}>{displayOrgName(n)}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              <button type="button" onClick={onClose} style={{ ...TOOLBAR_BUTTON_PRIMARY, width: '100%', height: 38, borderRadius: 10 }}>
                Done
              </button>
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
    <div style={{ ...CM_CARD, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${CM_UI.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: CM_UI.surfaceMuted, color: CM_UI.textMuted }}>
          <Zap size={14} />
        </div>
        <div>
          <h2 style={SECTION_TITLE}>Founder Target Board</h2>
          <p style={{ margin: 0, fontSize: '0.75rem', color: CM_UI.textSubtle }}>Today&apos;s school targets — pick a school, blast every chapter</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {FOUNDERS.map((founder, idx) => {
          const target = founderTargets[founder] ?? null;
          const progress = getProgress(target);
          const isEditing = editingFounder === founder;
          const pct = progress.total > 0 ? Math.round((progress.contacted / progress.total) * 100) : 0;
          const school = target ? schools.find(s => s.id === target.schoolId) : null;

          return (
            <div
              key={founder}
              style={{
                padding: 16,
                borderRight: (idx + 1) % 4 !== 0 ? `1px solid ${CM_UI.border}` : undefined,
                borderBottom: `1px solid ${CM_UI.border}`,
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 9999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6875rem', fontWeight: 700, color: '#fff', background: CM_UI.ink,
                  }}>
                    {founder[0]}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: CM_UI.text }}>{founder}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setEditingFounder(isEditing ? null : founder); setSearchQuery(''); }}
                  style={{ ...TOOLBAR_BUTTON, height: 28, padding: '0 8px', fontSize: '0.72rem' }}
                >
                  <Edit3 size={10} />
                  {target ? 'Change' : 'Set'}
                </button>
              </div>

              {isEditing && (
                <div style={{ marginBottom: 12, position: 'relative', zIndex: 20 }}>
                  <div style={{ ...TOOLBAR_SEARCH, height: 32 }}>
                    <Search size={12} color={CM_UI.textSubtle} />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search school..."
                      style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.75rem', background: 'transparent', fontFamily: 'inherit', color: CM_UI.text }}
                    />
                  </div>
                  <div style={{
                    position: 'absolute', top: '100%', marginTop: 4, left: 0, right: 0,
                    background: '#fff', border: `1px solid ${CM_UI.border}`, borderRadius: 10, overflow: 'hidden', zIndex: 30,
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.1)',
                  }}>
                    {searchResults.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { onTargetChange(founder, { schoolId: s.id, schoolName: s.name }); setEditingFounder(null); setSearchQuery(''); }}
                        style={{
                          width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem',
                          border: 'none', borderBottom: `1px solid ${CM_UI.border}`, background: '#fff', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ fontWeight: 500, color: CM_UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                        <span style={{ flexShrink: 0, color: CM_UI.textSubtle, marginLeft: 8 }}>{s.fraternities.length + s.sororities.length} orgs</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {target ? (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (school) onSelectSchool(school); }}
                  onKeyDown={e => { if (e.key === 'Enter' && school) onSelectSchool(school); }}
                  style={{
                    borderRadius: 10, border: `1px solid ${CM_UI.border}`, padding: 12, cursor: 'pointer',
                    background: CM_UI.surfaceMuted,
                  }}
                >
                  <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.8125rem', color: CM_UI.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {target.schoolName}
                  </p>
                  <div style={{ height: 6, background: '#fff', borderRadius: 9999, overflow: 'hidden', marginBottom: 6, border: `1px solid ${CM_UI.border}` }}>
                    <div style={{ height: '100%', borderRadius: 9999, width: `${pct}%`, background: CM_UI.ink, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: CM_UI.textMuted }}>{progress.contacted}/{progress.total} contacted</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: CM_UI.text }}>{pct}%</span>
                  </div>
                  {school && school.pipelineValue > 0 && (
                    <p style={{ margin: '6px 0 0', fontSize: '0.75rem', fontWeight: 600, color: CM_UI.textSecondary }}>{fmt$(school.pipelineValue)} pipeline</p>
                  )}
                </div>
              ) : (
                <div style={{
                  borderRadius: 10, border: `1px dashed ${CM_UI.border}`, padding: 16,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                  textAlign: 'center', minHeight: 80,
                }}>
                  <Target size={18} color={CM_UI.textSubtle} />
                  <p style={{ margin: 0, fontSize: '0.75rem', color: CM_UI.textMuted, fontWeight: 500 }}>No target set</p>
                  <p style={{ margin: 0, fontSize: '0.6875rem', color: CM_UI.textSubtle }}>Click Set to assign a school</p>
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
    <div style={{ minHeight: '100vh', background: CM_UI.pageBg }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: CM_UI.text }}>
              Sales Command Center
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: CM_UI.textSubtle }}>
              Founder-led outbound → scalable sales engine
            </p>
          </div>
          <button type="button" onClick={() => { load(); loadDeals(); }} style={TOOLBAR_BUTTON}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* KPI chips */}
        <div style={{ ...CM_CARD, display: 'flex', flexWrap: 'wrap', overflow: 'hidden' }}>
          <KpiChip icon={<Users size={14} />} label="Active Chapters" value={String(kpis.totalActiveChapters)} />
          <KpiChip icon={<Building2 size={14} />} label="In Pipeline Schools" value={String(kpis.schoolsInPipeline)} />
          <KpiChip icon={<DollarSign size={14} />} label="Pipeline Value" value={fmt$(kpis.totalPipelineValue)} />
          <KpiChip icon={<Zap size={14} />} label="Contacted Today" value={String(contactedToday)} />
          <KpiChip icon={<MapPin size={14} />} label="States Covered" value={String(kpis.statesCovered)} last />
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
        <div style={{ ...CM_CARD, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 16px', borderBottom: `1px solid ${CM_UI.border}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: CM_UI.surfaceMuted, color: CM_UI.textMuted,
            }}>
              <Building2 size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={SECTION_TITLE}>School Outreach</h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: CM_UI.textSubtle }}>Select a school to see all chapters</p>
            </div>
            {selectedSchool && (
              <button type="button" onClick={() => setShowImport(true)} style={TOOLBAR_BUTTON}>
                <Upload size={12} />Import Chapters
              </button>
            )}
          </div>

          {/* Search bar */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${CM_UI.border}` }}>
            <div style={TOOLBAR_SEARCH}>
              <Search size={14} color={CM_UI.textSubtle} />
              <input
                type="text"
                value={schoolSearch}
                onChange={e => setSchoolSearch(e.target.value)}
                onFocus={() => setSelectedSchool(null)}
                placeholder="Search for a school to launch outbound..."
                style={{
                  flex: 1, border: 'none', outline: 'none', fontSize: '0.8125rem',
                  background: 'transparent', fontFamily: 'inherit', color: CM_UI.text,
                }}
              />
            </div>
            {schoolSearch && (
              <div style={{
                marginTop: 8, border: `1px solid ${CM_UI.border}`, borderRadius: 10,
                overflow: 'hidden', boxShadow: '0 8px 24px rgba(15, 23, 42, 0.1)',
              }}>
                {filteredSchools.slice(0, 8).map(school => (
                  <button
                    key={school.id}
                    type="button"
                    onClick={() => { setSelectedSchool(school); setSchoolSearch(''); }}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: '0.8125rem',
                      border: 'none', borderBottom: `1px solid ${CM_UI.border}`, background: '#fff',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontWeight: 500, color: CM_UI.text }}>{school.name}</span>
                    <span style={{ fontSize: '0.75rem', color: CM_UI.textSubtle }}>
                      {school.fraternities.length + school.sororities.length} chapters
                    </span>
                  </button>
                ))}
                {filteredSchools.length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: '0.8125rem', color: CM_UI.textSubtle, textAlign: 'center' }}>
                    No schools found
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Drill-down or empty state */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: 9999, border: `2px solid ${CM_UI.border}`, borderTopColor: CM_UI.ink, animation: 'spin 1s linear infinite' }} />
            </div>
          ) : selectedSchool ? (
            <div>
              {/* School header */}
              <div style={{
                padding: '12px 16px', background: CM_UI.surfaceMuted, borderBottom: `1px solid ${CM_UI.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.8125rem', color: CM_UI.text }}>{selectedSchool.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: CM_UI.textSubtle }}>
                    {selectedSchool.state}{selectedSchool.conference ? ` · ${selectedSchool.conference}` : ''} · {totalChaptersInSchool} chapters
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedSchool(null)} style={{
                  ...TOOLBAR_BUTTON, height: 28, width: 28, padding: 0, border: 'none', background: 'transparent', color: CM_UI.textSubtle,
                }}>
                  <X size={16} />
                </button>
              </div>

              {/* Column headers */}
              {totalChaptersInSchool > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
                  borderBottom: `1px solid ${CM_UI.border}`,
                  fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: CM_UI.textSubtle,
                }}>
                  <span style={{ flex: 1 }}>Chapter</span>
                  <span style={{ width: 96, flexShrink: 0 }}>Status</span>
                  <span style={{ width: 64, flexShrink: 0 }}>Method</span>
                  <span style={{ width: 112, flexShrink: 0 }}>Contact</span>
                  <span style={{ width: 64, flexShrink: 0 }}>Date</span>
                  <span style={{ width: 144, flexShrink: 0 }}>Actions</span>
                </div>
              )}

              {totalChaptersInSchool === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: CM_UI.textSubtle }}>
                  <Building2 size={28} color={CM_UI.border} style={{ marginBottom: 12 }} />
                  <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: CM_UI.textMuted }}>No chapters linked yet</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: CM_UI.textSubtle }}>Use Import to add chapters to this school</p>
                  <button type="button" onClick={() => setShowImport(true)} style={{ ...TOOLBAR_BUTTON_PRIMARY, marginTop: 16 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12, display: 'flex', alignItems: 'center',
                justifyContent: 'center', marginBottom: 16,
                background: CM_UI.surfaceMuted, border: `1px solid ${CM_UI.border}`, color: CM_UI.textSubtle,
              }}>
                <Target size={26} />
              </div>
              <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: CM_UI.text }}>
                Select a school to see all chapters
              </p>
              <p style={{
                margin: '8px 0 0', fontSize: '0.8125rem', color: CM_UI.textSubtle,
                maxWidth: 280, textAlign: 'center', lineHeight: 1.5,
              }}>
                Pick a school, then contact every frat and sorority in 30–45 minutes
              </p>
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
