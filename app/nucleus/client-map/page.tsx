'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Target,
  TrendingUp,
  DollarSign,
  Users,
  MapPin,
  ChevronRight,
  Search,
  X,
  Plus,
  Filter,
  Building2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Clock,
  Circle,
  Star,
  Edit3,
  Check,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type SchoolStatus = 'active_client' | 'in_pipeline' | 'not_contacted';

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

interface FounderTarget {
  founder: string;
  schoolId: string;
  schoolName: string;
  note?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────
const FOUNDERS = ['Owen', 'Ford', 'Adam'] as const;
type Founder = typeof FOUNDERS[number];

const FOUNDER_COLORS: Record<Founder, { bg: string; text: string; border: string; dot: string }> = {
  Owen: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
  Ford: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', dot: 'bg-blue-500' },
  Adam: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

const STATUS_CONFIG: Record<SchoolStatus, { label: string; color: string; bg: string; icon: React.ReactNode; dot: string }> = {
  active_client: {
    label: 'Active Client',
    color: '#059669',
    bg: '#d1fae5',
    icon: <CheckCircle2 size={11} />,
    dot: 'bg-emerald-500',
  },
  in_pipeline: {
    label: 'In Pipeline',
    color: '#d97706',
    bg: '#fef3c7',
    icon: <Clock size={11} />,
    dot: 'bg-amber-500',
  },
  not_contacted: {
    label: 'Not Contacted',
    color: '#6b7280',
    bg: '#f3f4f6',
    icon: <Circle size={11} />,
    dot: 'bg-gray-400',
  },
};

const STAGE_LABELS: Record<string, string> = {
  lead: 'New Lead',
  demo_booked: 'Demo Booked',
  first_demo: 'First Demo',
  second_call: 'Second Call',
  contract_sent: 'Contract Sent',
  closed_won: 'Closed Won',
};

const STAGE_COLORS: Record<string, string> = {
  lead: '#6b7280',
  demo_booked: '#3b82f6',
  first_demo: '#8b5cf6',
  second_call: '#f59e0b',
  contract_sent: '#ec4899',
  closed_won: '#10b981',
};

const CONFERENCES = ['SEC', 'Big Ten', 'ACC', 'Big 12', 'Pac-12', 'Big East', 'AAC', 'Sun Belt', 'MAC', 'Mountain West'];

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

const STATE_NAMES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',
  CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',
  IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',
  ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',
  MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',
  OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',
  SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',
  WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',
};

// ── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 min-w-0">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15`, color }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── School Card ────────────────────────────────────────────────────────────
function SchoolCard({ school, selected, onClick, founderTargets }: {
  school: School;
  selected: boolean;
  onClick: () => void;
  founderTargets: FounderTarget[];
}) {
  const cfg = STATUS_CONFIG[school.status];
  const assignedFounders = founderTargets.filter((t) => t.schoolId === school.id).map((t) => t.founder as Founder);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border transition-all duration-150 p-3.5 hover:border-[#1a2744]/30 hover:shadow-sm ${
        selected
          ? 'border-[#1a2744] bg-[#1a2744]/5 shadow-sm'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate leading-tight">{school.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{school.state ?? '—'} · {school.conference ?? 'Independent'}</p>
        </div>
        <span
          className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ color: cfg.color, backgroundColor: cfg.bg }}
        >
          {cfg.icon}
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="font-medium text-gray-700">{school.fraternities.length}</span> frats
        </span>
        <span className="flex items-center gap-1">
          <span className="font-medium text-gray-700">{school.sororities.length}</span> sororities
        </span>
        {school.pipelineValue > 0 && (
          <span className="flex items-center gap-1 text-amber-600 font-medium ml-auto">
            <DollarSign size={10} />
            {fmt$(school.pipelineValue)}
          </span>
        )}
        {school.activeChapters.length > 0 && (
          <span className="flex items-center gap-1 text-emerald-600 font-medium ml-auto">
            <CheckCircle2 size={10} />
            {school.activeChapters.length} active
          </span>
        )}
      </div>

      {assignedFounders.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
          {assignedFounders.map((f) => {
            const fc = FOUNDER_COLORS[f];
            return (
              <span key={f} className={`text-xs px-2 py-0.5 rounded-full font-medium border ${fc.bg} ${fc.text} ${fc.border}`}>
                {f}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}

// ── Org Row ────────────────────────────────────────────────────────────────
function OrgRow({ org, type }: { org: OrgEntry; type: 'fraternity' | 'sorority' }) {
  const primaryDeal = org.deals[0];
  const stage = primaryDeal?.stage ?? null;
  const stageColor = stage ? (STAGE_COLORS[stage] ?? '#6b7280') : '#9ca3af';
  const stageLabel = stage ? (STAGE_LABELS[stage] ?? stage) : 'Not contacted';

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 group">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base">{type === 'fraternity' ? '🔵' : '🌸'}</span>
        <span className="text-sm text-gray-800 truncate font-medium">{org.name}</span>
      </div>
      <span
        className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ color: stageColor, backgroundColor: `${stageColor}18` }}
      >
        {stageLabel}
      </span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function SalesCommandCenter() {
  const [schools, setSchools] = useState<School[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SchoolStatus>('all');
  const [conferenceFilter, setConferenceFilter] = useState<string>('all');
  const [founderTargets, setFounderTargets] = useState<FounderTarget[]>([]);
  const [editingFounder, setEditingFounder] = useState<Founder | null>(null);
  const [assignSchoolSearch, setAssignSchoolSearch] = useState('');
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/client-map/command-center');
      const data = await res.json();
      setSchools(data.schools ?? []);
      setKpis(data.kpis ?? null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load founder targets from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('founder_targets_v1');
      if (saved) setFounderTargets(JSON.parse(saved));
    } catch {}
  }, []);

  const saveTargets = useCallback((targets: FounderTarget[]) => {
    setFounderTargets(targets);
    try { localStorage.setItem('founder_targets_v1', JSON.stringify(targets)); } catch {}
  }, []);

  const assignSchoolToFounder = useCallback((founder: Founder, school: School) => {
    setFounderTargets((prev) => {
      const existing = prev.find((t) => t.founder === founder && t.schoolId === school.id);
      if (existing) return prev;
      const next = [...prev, { founder, schoolId: school.id, schoolName: school.name }];
      try { localStorage.setItem('founder_targets_v1', JSON.stringify(next)); } catch {}
      return next;
    });
    setEditingFounder(null);
    setAssignSchoolSearch('');
    setShowAssignDropdown(false);
  }, []);

  const removeTarget = useCallback((founder: string, schoolId: string) => {
    setFounderTargets((prev) => {
      const next = prev.filter((t) => !(t.founder === founder && t.schoolId === schoolId));
      try { localStorage.setItem('founder_targets_v1', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Filter logic
  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      if (selectedState && s.state !== selectedState) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (conferenceFilter !== 'all' && s.conference !== conferenceFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !(s.state ?? '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [schools, selectedState, statusFilter, conferenceFilter, searchQuery]);

  // State summary
  const stateSummary = useMemo(() => {
    const map: Record<string, { total: number; active: number; pipeline: number }> = {};
    for (const s of schools) {
      const st = s.state ?? 'Unknown';
      if (!map[st]) map[st] = { total: 0, active: 0, pipeline: 0 };
      map[st].total++;
      if (s.status === 'active_client') map[st].active++;
      if (s.status === 'in_pipeline') map[st].pipeline++;
    }
    return map;
  }, [schools]);

  const assignSearchResults = useMemo(() => {
    if (!assignSchoolSearch.trim()) return schools.slice(0, 8);
    const q = assignSchoolSearch.toLowerCase();
    return schools.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [schools, assignSchoolSearch]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a2744] mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading Sales Command Center...</p>
        </div>
      </div>
    );
  }

  const selectedFounderForSchool = founderTargets
    .filter((t) => t.schoolId === selectedSchool?.id)
    .map((t) => t.founder as Founder);

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#1a2744] flex items-center gap-2">
              <Target size={20} className="text-amber-500" />
              Sales &amp; Growth Command Center
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {schools.length} schools tracked · {kpis?.totalActiveChapters ?? 0} active chapters · {kpis?.statesCovered ?? 0} states covered
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* ── KPI Strip ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            icon={<CheckCircle2 size={16} />}
            label="Active Chapters"
            value={String(kpis?.totalActiveChapters ?? 0)}
            sub="paying clients"
            color="#059669"
          />
          <KpiCard
            icon={<Building2 size={16} />}
            label="Schools w/ Client"
            value={String(kpis?.schoolsWithActiveClient ?? 0)}
            sub="have ≥1 active chapter"
            color="#1a2744"
          />
          <KpiCard
            icon={<TrendingUp size={16} />}
            label="Schools in Pipeline"
            value={String(kpis?.schoolsInPipeline ?? 0)}
            sub="active deals"
            color="#d97706"
          />
          <KpiCard
            icon={<DollarSign size={16} />}
            label="Pipeline Value"
            value={fmt$(kpis?.totalPipelineValue ?? 0)}
            sub="open deals"
            color="#7c3aed"
          />
          <KpiCard
            icon={<MapPin size={16} />}
            label="States Covered"
            value={String(kpis?.statesCovered ?? 0)}
            sub="with active chapters"
            color="#0ea5e9"
          />
        </div>

        {/* ── Main Two-Panel ─────────────────────────────────────────────── */}
        <div className="flex gap-4 items-start">
          {/* Left Panel */}
          <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Filters */}
            <div className="p-4 border-b border-gray-100 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search schools..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1a2744]/20 focus:border-[#1a2744]/40"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <Filter size={14} className="text-gray-400 flex-shrink-0" />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedState ?? 'all'}
                  onChange={(e) => setSelectedState(e.target.value === 'all' ? null : e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1a2744]/30"
                >
                  <option value="all">All States</option>
                  {US_STATES.map((st) => {
                    const info = stateSummary[st];
                    return (
                      <option key={st} value={st}>
                        {STATE_NAMES[st] ?? st} {info ? `(${info.total})` : ''}
                      </option>
                    );
                  })}
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | SchoolStatus)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1a2744]/30"
                >
                  <option value="all">All Status</option>
                  <option value="active_client">Active Client</option>
                  <option value="in_pipeline">In Pipeline</option>
                  <option value="not_contacted">Not Contacted</option>
                </select>

                <select
                  value={conferenceFilter}
                  onChange={(e) => setConferenceFilter(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#1a2744]/30"
                >
                  <option value="all">All Conferences</option>
                  {CONFERENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  <span className="font-medium text-gray-600">{filteredSchools.length}</span> schools
                  {(selectedState || statusFilter !== 'all' || conferenceFilter !== 'all' || searchQuery) && (
                    <button
                      onClick={() => { setSelectedState(null); setStatusFilter('all'); setConferenceFilter('all'); setSearchQuery(''); }}
                      className="ml-2 text-amber-600 hover:text-amber-700 underline underline-offset-2"
                    >
                      clear filters
                    </button>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  {(['active_client', 'in_pipeline', 'not_contacted'] as SchoolStatus[]).map((s) => {
                    const cfg = STATUS_CONFIG[s];
                    const count = filteredSchools.filter((sc) => sc.status === s).length;
                    return (
                      <span key={s} className="flex items-center gap-1 text-xs" style={{ color: cfg.color }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {count}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* School List */}
            <div className="p-3 space-y-2 max-h-[580px] overflow-y-auto">
              {filteredSchools.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Building2 size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No schools match your filters</p>
                </div>
              ) : (
                filteredSchools.map((school) => (
                  <SchoolCard
                    key={school.id}
                    school={school}
                    selected={selectedSchool?.id === school.id}
                    onClick={() => setSelectedSchool(selectedSchool?.id === school.id ? null : school)}
                    founderTargets={founderTargets}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right Panel — School Detail */}
          <div className="w-[400px] flex-shrink-0 bg-white rounded-xl border border-gray-200 overflow-hidden">
            {!selectedSchool ? (
              <div className="flex flex-col items-center justify-center h-[500px] text-gray-400 p-6">
                <Target size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500">Select a school</p>
                <p className="text-xs text-center mt-1 text-gray-400">
                  Click any school on the left to see its fraternities, sororities, pipeline deals, and more.
                </p>
              </div>
            ) : (
              <div className="flex flex-col h-[580px]">
                {/* School Header */}
                <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-[#1a2744]/5 to-transparent">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-[#1a2744] text-base leading-tight">{selectedSchool.name}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {selectedSchool.state ?? '—'} · {selectedSchool.conference ?? 'Independent'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium"
                        style={{ color: STATUS_CONFIG[selectedSchool.status].color, backgroundColor: STATUS_CONFIG[selectedSchool.status].bg }}
                      >
                        {STATUS_CONFIG[selectedSchool.status].icon}
                        {STATUS_CONFIG[selectedSchool.status].label}
                      </span>
                      <button onClick={() => setSelectedSchool(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span>{selectedSchool.fraternities.length} fraternities</span>
                    <span>{selectedSchool.sororities.length} sororities</span>
                    {selectedSchool.activeChapters.length > 0 && (
                      <span className="text-emerald-600 font-medium">{selectedSchool.activeChapters.length} active clients</span>
                    )}
                    {selectedSchool.pipelineValue > 0 && (
                      <span className="text-amber-600 font-medium">{fmt$(selectedSchool.pipelineValue)} pipeline</span>
                    )}
                  </div>

                  {/* Founder assignment */}
                  {selectedFounderForSchool.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3">
                      <Star size={12} className="text-amber-500" />
                      <span className="text-xs text-gray-500">Assigned:</span>
                      {selectedFounderForSchool.map((f) => {
                        const fc = FOUNDER_COLORS[f];
                        return (
                          <span key={f} className={`text-xs px-2 py-0.5 rounded-full font-medium border ${fc.bg} ${fc.text} ${fc.border}`}>
                            {f}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Active Chapters */}
                  {selectedSchool.activeChapters.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Active Clients</p>
                      <div className="space-y-1">
                        {selectedSchool.activeChapters.map((ch) => (
                          <div key={ch.id} className="flex items-center justify-between py-1.5 px-3 bg-emerald-50 rounded-lg border border-emerald-100">
                            <span className="text-sm text-emerald-800 font-medium">{ch.chapter_name}</span>
                            {ch.mrr > 0 && (
                              <span className="text-xs text-emerald-600 font-medium">{fmt$(ch.mrr * 12)}/yr</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fraternities */}
                  {selectedSchool.fraternities.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Fraternities ({selectedSchool.fraternities.length})
                      </p>
                      <div>
                        {selectedSchool.fraternities.map((org) => (
                          <OrgRow key={org.id} org={org} type="fraternity" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sororities */}
                  {selectedSchool.sororities.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                        Sororities ({selectedSchool.sororities.length})
                      </p>
                      <div>
                        {selectedSchool.sororities.map((org) => (
                          <OrgRow key={org.id} org={org} type="sorority" />
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedSchool.fraternities.length === 0 && selectedSchool.sororities.length === 0 && (
                    <div className="text-center py-6 text-gray-400">
                      <p className="text-sm">No organizations linked yet</p>
                      <p className="text-xs mt-1">This school is an opportunity — no fraternities or sororities in the DB</p>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="p-4 border-t border-gray-100 flex items-center gap-2">
                  <a
                    href="/nucleus/pipeline"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 bg-[#1a2744] text-white rounded-lg hover:bg-[#243560] transition-colors"
                  >
                    <ExternalLink size={12} />
                    View Pipeline
                  </a>
                  <a
                    href={`/nucleus/pipeline?search=${encodeURIComponent(selectedSchool.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 px-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    <Plus size={12} />
                    Add Deal
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Weekly Founder Targets ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-[#1a2744] flex items-center gap-2">
                <Star size={16} className="text-amber-500" />
                Weekly Founder Targets
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Schools each founder is attacking this week</p>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-gray-100">
            {FOUNDERS.map((founder) => {
              const targets = founderTargets.filter((t) => t.founder === founder);
              const fc = FOUNDER_COLORS[founder];
              const isEditing = editingFounder === founder;

              return (
                <div key={founder} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${fc.dot}`} />
                      <span className="font-semibold text-gray-800">{founder}</span>
                    </div>
                    <button
                      onClick={() => {
                        if (isEditing) {
                          setEditingFounder(null);
                          setAssignSchoolSearch('');
                          setShowAssignDropdown(false);
                        } else {
                          setEditingFounder(founder);
                          setShowAssignDropdown(true);
                        }
                      }}
                      className={`text-xs flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
                        isEditing
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                      }`}
                    >
                      {isEditing ? <><Check size={11} /> Done</> : <><Plus size={11} /> Assign</>}
                    </button>
                  </div>

                  {/* Assign dropdown */}
                  {isEditing && (
                    <div className="mb-3 relative">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search school..."
                          value={assignSchoolSearch}
                          onChange={(e) => { setAssignSchoolSearch(e.target.value); setShowAssignDropdown(true); }}
                          onFocus={() => setShowAssignDropdown(true)}
                          autoFocus
                          className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300"
                        />
                      </div>
                      {showAssignDropdown && assignSearchResults.length > 0 && (
                        <div className="absolute z-30 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                          {assignSearchResults.map((school) => (
                            <button
                              key={school.id}
                              onClick={() => assignSchoolToFounder(founder, school)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 flex items-center justify-between"
                            >
                              <span className="font-medium text-gray-800 truncate">{school.name}</span>
                              <span
                                className="flex-shrink-0 ml-2 text-xs px-1.5 py-0.5 rounded-full"
                                style={{ color: STATUS_CONFIG[school.status].color, backgroundColor: STATUS_CONFIG[school.status].bg }}
                              >
                                {STATUS_CONFIG[school.status].label}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Target list */}
                  <div className="space-y-2">
                    {targets.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2">No targets set</p>
                    ) : (
                      targets.map((t) => {
                        const school = schools.find((s) => s.id === t.schoolId);
                        return (
                          <div
                            key={t.schoolId}
                            className={`flex items-center justify-between p-2 rounded-lg border ${fc.border} ${fc.bg} group cursor-pointer`}
                            onClick={() => school && setSelectedSchool(school)}
                          >
                            <div className="min-w-0">
                              <p className={`text-xs font-semibold truncate ${fc.text}`}>{t.schoolName}</p>
                              {school && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {school.fraternities.length + school.sororities.length} orgs ·{' '}
                                  <span style={{ color: STATUS_CONFIG[school.status].color }}>
                                    {STATUS_CONFIG[school.status].label}
                                  </span>
                                </p>
                              )}
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeTarget(founder, t.schoolId); }}
                              className="flex-shrink-0 ml-2 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
