'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  X,
  DollarSign,
  Users,
  Globe,
  BarChart3,
  TrendingUp,
  MapPin,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ── Dynamic Map (no SSR — react-simple-maps touches DOM) ──────────────────
const USMap = dynamic(() => import('./USMap'), { ssr: false, loading: () => (
  <div className="flex items-center justify-center h-[480px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
  </div>
)});

// ── Types ──────────────────────────────────────────────────────────────────
export interface Chapter {
  id: string;
  chapter_name: string;
  school: string;
  state: string;
  status: string;
  mrr: number | null;
  arr: number;
  onboarding_completed: string | null;
}

export interface ChapterWithGeo extends Chapter {
  lat: number;
  lng: number;
  region: string;
}

// ── University lookup ──────────────────────────────────────────────────────
export const UNIVERSITY_GEO: Record<
  string,
  { lat: number; lng: number; region: string }
> = {
  'university of tennessee': { lat: 35.9544, lng: -83.9282, region: 'Southeast' },
  'university of mississippi': { lat: 34.3654, lng: -89.5373, region: 'Southeast' },
  'texas a&m university': { lat: 30.6187, lng: -96.3365, region: 'Southwest' },
  'texas a&m': { lat: 30.6187, lng: -96.3365, region: 'Southwest' },
  'texas tech': { lat: 33.5843, lng: -101.8749, region: 'Southwest' },
  'texas tech university': { lat: 33.5843, lng: -101.8749, region: 'Southwest' },
  'university of alabama': { lat: 33.2148, lng: -87.5394, region: 'Southeast' },
  'university of colorado boulder': { lat: 40.0076, lng: -105.2659, region: 'West' },
  'university of colorado': { lat: 40.0076, lng: -105.2659, region: 'West' },
  'university': { lat: 34.3654, lng: -89.5373, region: 'Southeast' }, // fallback for bare "University"
  // Common extras
  'university of georgia': { lat: 33.9480, lng: -83.3774, region: 'Southeast' },
  'auburn university': { lat: 32.6099, lng: -85.4808, region: 'Southeast' },
  'auburn': { lat: 32.6099, lng: -85.4808, region: 'Southeast' },
  'louisiana state university': { lat: 30.4133, lng: -91.1800, region: 'Southeast' },
  'university of florida': { lat: 29.6499, lng: -82.3486, region: 'Southeast' },
  'ohio state university': { lat: 40.0067, lng: -83.0305, region: 'Midwest' },
  'university of michigan': { lat: 42.2780, lng: -83.7382, region: 'Midwest' },
  'penn state university': { lat: 40.7982, lng: -77.8599, region: 'Northeast' },
  'penn state': { lat: 40.7982, lng: -77.8599, region: 'Northeast' },
  'chapman university': { lat: 33.7948, lng: -117.8531, region: 'West' },
  'miami university': { lat: 39.5084, lng: -84.7452, region: 'Midwest' },
  'indiana university': { lat: 39.1682, lng: -86.5230, region: 'Midwest' },
  'clemson university': { lat: 34.6837, lng: -82.8374, region: 'Southeast' },
  'clemson': { lat: 34.6837, lng: -82.8374, region: 'Southeast' },
  'tcu': { lat: 32.7094, lng: -97.3627, region: 'Southwest' },
  'texas christian university': { lat: 32.7094, lng: -97.3627, region: 'Southwest' },
  'villanova university': { lat: 40.0350, lng: -75.3430, region: 'Northeast' },
  'villanova': { lat: 40.0350, lng: -75.3430, region: 'Northeast' },
  'brown university': { lat: 41.8268, lng: -71.4025, region: 'Northeast' },
  'brown': { lat: 41.8268, lng: -71.4025, region: 'Northeast' },
  'university of kansas': { lat: 38.9543, lng: -95.2558, region: 'Midwest' },
  'arizona state university': { lat: 33.4255, lng: -111.9400, region: 'Southwest' },
  'asu': { lat: 33.4255, lng: -111.9400, region: 'Southwest' },
};

export function findGeo(school: string): { lat: number; lng: number; region: string } {
  const key = school.trim().toLowerCase().replace(/\s+/g, ' ');
  // Exact match first
  if (UNIVERSITY_GEO[key]) return UNIVERSITY_GEO[key];
  // Partial match
  for (const [pattern, geo] of Object.entries(UNIVERSITY_GEO)) {
    if (key.includes(pattern) || pattern.includes(key)) return geo;
  }
  return { lat: 39.5, lng: -98.35, region: 'Unknown' };
}

// ── Constants ──────────────────────────────────────────────────────────────
export const ARR_MILESTONES = [100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];
export const CHAPTER_TIERS = [10, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400];

export function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ClientMapPage() {
  const [chapters, setChapters] = useState<ChapterWithGeo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ChapterWithGeo | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/client-map/chapters');
      const { data } = await res.json();
      if (!Array.isArray(data)) return;
      const enriched: ChapterWithGeo[] = (data as Chapter[]).map((c) => {
        const geo = findGeo(c.school);
        return { ...c, ...geo };
      });
      setChapters(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Jitter pins that share a school
  const jittered = chapters.map((c) => {
    const sameSchool = chapters.filter((x) => x.school.trim() === c.school.trim());
    const idx = sameSchool.findIndex((x) => x.id === c.id);
    return { ...c, lat: c.lat + idx * 0.25, lng: c.lng + idx * 0.25 };
  });

  // Build chaptersByState for the state-click panel
  const chaptersByState: Record<string, ChapterWithGeo[]> = {};
  for (const c of chapters) {
    if (c.state && c.state !== 'US') {
      if (!chaptersByState[c.state]) chaptersByState[c.state] = [];
      chaptersByState[c.state].push(c);
    }
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const totalARR = chapters.reduce((s, c) => s + c.arr, 0);
  const count = chapters.length;
  const states = new Set(chapters.map((c) => c.state).filter((s) => s !== 'US')).size;
  const avgARR = count > 0 ? totalARR / count : 0;
  const activeStates = new Set(chapters.map((c) => c.state));

  const nextMilestone = ARR_MILESTONES.find((m) => m > totalARR) ?? ARR_MILESTONES[ARR_MILESTONES.length - 1];
  const prevMilestone = (() => {
    const idx = ARR_MILESTONES.indexOf(nextMilestone);
    return idx > 0 ? ARR_MILESTONES[idx - 1] : 0;
  })();
  const arrProgress = ((totalARR - prevMilestone) / (nextMilestone - prevMilestone)) * 100;

  const nextTier = CHAPTER_TIERS.find((t) => t > count) ?? CHAPTER_TIERS[CHAPTER_TIERS.length - 1];
  const prevTier = (() => {
    const idx = CHAPTER_TIERS.indexOf(nextTier);
    return idx > 0 ? CHAPTER_TIERS[idx - 1] : 0;
  })();
  const tierProgress = ((count - prevTier) / (nextTier - prevTier)) * 100;

  const regionMap: Record<string, number> = {};
  for (const c of chapters) {
    if (c.region !== 'Unknown') regionMap[c.region] = (regionMap[c.region] ?? 0) + 1;
  }
  const regionData = Object.entries(regionMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const topRegion = regionData[0]?.name ?? '—';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          🗺️ <span>Client Map &amp; Revenue Goals</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {count} active chapter{count !== 1 ? 's' : ''} · {states} state{states !== 1 ? 's' : ''} · {fmt$(totalARR)} ARR
        </p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* ── LEFT: MAP ──────────────────────────────────────────────────── */}
        <div className="xl:w-[65%] bg-[#141b27] rounded-2xl border border-slate-700/50 p-4 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={16} className="text-emerald-400" />
            <span className="text-sm font-semibold text-slate-300">US Chapter Coverage</span>
            <span className="ml-auto text-xs text-slate-500">Click a highlighted state or pin</span>
          </div>

          <USMap
            chapters={jittered}
            activeStates={activeStates}
            selected={selected}
            onSelect={setSelected}
            chaptersByState={chaptersByState}
          />

          {/* Legend */}
          <div className="flex gap-4 mt-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" />
              Active state
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#1e2d45] border border-slate-600 inline-block" />
              No chapters
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
              Chapter pin
            </span>
          </div>

          {/* Pin Tooltip */}
          {selected && (
            <div className="absolute top-16 right-4 w-64 bg-[#0d1117] border border-slate-600 rounded-xl p-4 shadow-2xl z-50">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-white text-sm">{selected.chapter_name.trim()}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{selected.school.trim()}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white ml-2">
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  selected.status === 'active'
                    ? 'bg-emerald-900/50 text-emerald-400'
                    : 'bg-amber-900/50 text-amber-400'
                }`}>
                  {selected.status === 'active' ? 'Active' : 'Onboarding'}
                </span>
                <span className="text-xs text-slate-400">{selected.state}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-700">
                <p className="text-xs text-slate-400">ARR Contribution</p>
                <p className="text-base font-bold text-emerald-400">${selected.arr.toLocaleString()}/yr</p>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: GOALS & STATS ────────────────────────────────────────── */}
        <div
          className="xl:w-[35%] flex flex-col gap-6 overflow-y-auto"
          style={{ minWidth: '380px', maxHeight: 'calc(100vh - 180px)', paddingRight: '4px' }}
        >
          {/* ARR Progress */}
          <div className="bg-[#141b27] rounded-2xl border border-slate-700/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign size={17} className="text-emerald-400" />
              <span className="text-base font-semibold text-slate-200">ARR Progress</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{fmt$(totalARR)}</div>
            <p className="text-xs text-slate-400 mb-4">
              Currently at {fmt$(totalARR)} —{' '}
              <span className="text-amber-400 font-medium">{fmt$(nextMilestone - totalARR)} to go</span>
              {' '}until {fmt$(nextMilestone)}
            </p>
            <div className="w-full bg-slate-800 rounded-full h-2.5 mb-2">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
                style={{ width: `${Math.min(arrProgress, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mb-4">
              <span>{fmt$(prevMilestone)}</span>
              <span>{fmt$(nextMilestone)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ARR_MILESTONES.map((m) => (
                <span key={m} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                  totalARR >= m
                    ? 'bg-emerald-900/50 border-emerald-600 text-emerald-400'
                    : m === nextMilestone
                    ? 'bg-amber-900/40 border-amber-500 text-amber-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                }`}>
                  {fmt$(m)}
                </span>
              ))}
            </div>
          </div>

          {/* Chapter Count Tiers */}
          <div className="bg-[#141b27] rounded-2xl border border-slate-700/50 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users size={17} className="text-emerald-400" />
              <span className="text-base font-semibold text-slate-200">Chapter Growth Tiers</span>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-5xl font-black text-white">{count}</span>
              <span className="text-slate-400 text-sm">chapters</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2.5 mb-2">
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all"
                style={{ width: `${Math.min(tierProgress, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mb-5">
              {count - prevTier} of {nextTier - prevTier} to reach{' '}
              <span className="text-amber-400 font-medium">{nextTier} chapters</span>
            </p>
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
              {CHAPTER_TIERS.map((tier) => {
                const done = count >= tier;
                const current = tier === nextTier;
                return (
                  <div key={tier} className="flex items-center gap-3 py-1">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      done ? 'bg-emerald-600 text-white' : current ? 'bg-amber-500 text-black animate-pulse' : 'bg-slate-800 border border-slate-600 text-slate-500'
                    }`}>
                      {done ? '✓' : ''}
                    </div>
                    <span className={`text-sm font-medium ${done ? 'text-emerald-400' : current ? 'text-amber-400' : 'text-slate-500'}`}>
                      {tier} chapters
                    </span>
                    {current && <span className="ml-auto text-xs text-amber-500 font-bold">← next</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <StatCard icon={<Globe size={14} className="text-emerald-400" />} label="States Covered" value={String(states)} />
            <StatCard icon={<DollarSign size={14} className="text-amber-400" />} label="Avg ARR / Chapter" value={fmt$(avgARR)} />
            <StatCard icon={<TrendingUp size={14} className="text-blue-400" />} label="Top Region" value={topRegion} />
            <StatCard icon={<MapPin size={14} className="text-rose-400" />} label="Active Chapters" value={String(count)} />
          </div>

          {/* Regional Breakdown */}
          {regionData.length > 0 && (
            <div className="bg-[#141b27] rounded-2xl border border-slate-700/50 p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={17} className="text-emerald-400" />
                <span className="text-base font-semibold text-slate-200">Regional Breakdown</span>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={regionData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#0d1117', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {regionData.map((entry, index) => (
                      <Cell key={entry.name} fill={index === 0 ? '#059669' : '#1e3a5f'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-slate-500 mt-2">
                Strongest: <span className="text-emerald-400 font-medium">{topRegion}</span>{' '}
                ({regionData[0]?.value ?? 0} chapters)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-[#141b27] rounded-xl border border-slate-700/50 p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}
