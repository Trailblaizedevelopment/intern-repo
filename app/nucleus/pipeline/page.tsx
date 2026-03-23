'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp, Search, Filter, Phone, MessageSquare, Clock, Mail,
  ChevronRight, ChevronDown, Building2, Users, Trophy, Globe, X,
  Calendar, Flame, BarChart3, MapPin, ArrowUpRight, Plus, Edit2, Check, Download,
  Edit3, SlidersHorizontal
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase, STAGE_CONFIG, DealStage } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import FollowUpPicker from './FollowUpPicker';
import DealEditPanel from './DealEditPanel';
import NewDealModal from './NewDealModal';

/* ─── Types ─── */
interface PipelineDeal {
  id: string;
  org_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  deal_type: 'local' | 'council' | 'national';
  stage: DealStage;
  value: number;
  temperature: 'hot' | 'warm' | 'cold';
  next_followup: string | null;
  last_touched: string | null;
  followup_count: number;
  notes: string | null;
  conference: string | null;
  created_at: string;
  updated_at?: string | null;
  organization?: {
    id: string;
    name: string;
    type: string;
    school?: { id: string; name: string; conference: string } | null;
    national_org?: { id: string; name: string; abbreviation: string; type?: string } | null;
  } | null;
  contact?: { id: string; name: string; email: string | null; phone: string | null; role: string | null } | null;
}

interface School {
  id: string;
  name: string;
  state: string | null;
  conference: string | null;
  total_greek_orgs: number | null;
  chapters_sold: number;
  organizations?: {
    id: string; name: string; type: string; status: string;
    pipeline_deals?: { id: string; stage: string; value: number }[];
  }[];
}

interface NationalOrg {
  id: string;
  name: string;
  abbreviation: string | null;
  type: 'fraternity' | 'sorority';
  nic_npc: boolean;
  chapter_count: number | null;
  stage: string;
  value: number;
  organizations?: {
    id: string; name: string;
    school?: { id: string; name: string; conference: string } | null;
    pipeline_deals?: { id: string; stage: string; value: number }[];
  }[];
}

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
  organization?: { id: string; name: string; school?: { id: string; name: string } | null } | null;
}

interface Employee {
  id: string;
  name: string;
  role: string;
}

type Tab = 'my-deals' | 'all-deals' | 'schools' | 'nationals' | 'contacts' | 'leaderboard';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'my-deals', label: 'My Deals', icon: TrendingUp },
  { key: 'all-deals', label: 'All Deals', icon: BarChart3 },
  { key: 'schools', label: 'Schools', icon: Building2 },
  { key: 'nationals', label: 'Nationals', icon: Globe },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
];

const TEMP_COLORS: Record<string, string> = {
  hot: '#ef4444',
  warm: '#f59e0b',
  cold: '#6b7280',
};

const NATIONAL_STAGES = ['prospect', 'outreach', 'demo', 'negotiation', 'contract_sent', 'signed', 'lost'];

/* ─── Helpers ─── */
function daysAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / 86400000);
}

function followupUrgency(dateStr: string | null): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!dateStr) return 'none';
  const today = new Date().toISOString().split('T')[0];
  if (dateStr < today) return 'overdue';
  if (dateStr === today) return 'today';
  return 'upcoming';
}

function urgencySort(a: PipelineDeal, b: PipelineDeal): number {
  const order = { overdue: 0, today: 1, upcoming: 2, none: 3 };
  const ua = order[followupUrgency(a.next_followup)];
  const ub = order[followupUrgency(b.next_followup)];
  if (ua !== ub) return ua - ub;
  if (a.next_followup && b.next_followup) return a.next_followup.localeCompare(b.next_followup);
  return 0;
}

function formatCurrency(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `$${v}`;
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getOrgIcon(deal: PipelineDeal): string {
  if (deal.deal_type === 'council') return '⚖️';
  if (deal.deal_type === 'national') return '🌐';
  const natType = deal.organization?.national_org?.type;
  if (natType === 'sorority') return '🏠';
  if (natType === 'fraternity') return '🏛';
  const name = (deal.organization?.name || '').toLowerCase();
  const sororityNames = ['alpha chi omega', 'alpha delta pi', 'alpha epsilon phi', 'alpha gamma delta', 'alpha omicron pi', 'alpha phi', 'alpha sigma alpha', 'alpha sigma tau', 'alpha xi delta', 'chi omega', 'delta delta delta', 'delta gamma', 'delta phi epsilon', 'delta zeta', 'gamma phi beta', 'kappa alpha theta', 'kappa delta', 'kappa kappa gamma', 'phi mu', 'phi sigma sigma', 'pi beta phi', 'sigma delta tau', 'sigma kappa', 'sigma sigma sigma', 'theta phi alpha', 'zeta tau alpha'];
  if (sororityNames.some(s => name.includes(s))) return '🏠';
  return '🏛';
}

const TEMP_BORDER: Record<string, string> = {
  hot: '#ef4444',
  warm: '#f59e0b',
  cold: '#3b82f6',
};

function followupStyle(dateStr: string | null): React.CSSProperties {
  if (!dateStr) return { color: 'var(--ws-text-secondary, #9ca3af)' };
  const now = new Date();
  const due = new Date(dateStr);
  const diffMs = due.getTime() - now.getTime();
  const diffHours = diffMs / 3600000;
  if (diffMs < 0) return { color: '#ef4444', fontWeight: 600 };
  if (diffHours <= 48) return { color: '#f59e0b', fontWeight: 600 };
  return { color: 'var(--ws-text-secondary, #9ca3af)' };
}

/* ─── Quick Edit Sheet ─── */
interface QuickEditSheetProps {
  deal: PipelineDeal;
  onClose: () => void;
  onPatch: (id: string, updates: Record<string, unknown>) => Promise<boolean>;
}

function QuickEditSheet({ deal, onClose, onPatch }: QuickEditSheetProps) {
  const STAGES: DealStage[] = ['lead', 'demo_booked', 'first_demo', 'second_call', 'contract_sent', 'closed_won'];
  const [stage, setStage] = React.useState<DealStage>(deal.stage);
  const [temperature, setTemperature] = React.useState<'hot' | 'warm' | 'cold'>(deal.temperature);
  const [value, setValue] = React.useState(deal.value?.toString() || '');
  const [nextFollowup, setNextFollowup] = React.useState(deal.next_followup || '');
  const [notes, setNotes] = React.useState(deal.notes || '');
  const [saving, setSaving] = React.useState(false);

  async function handleClose() {
    setSaving(true);
    await onPatch(deal.id, {
      stage,
      temperature,
      value: parseInt(value) || 0,
      next_followup: nextFollowup || null,
      notes: notes.trim() || null,
      last_touched: new Date().toISOString(),
    });
    setSaving(false);
    onClose();
  }

  const TEMP_STYLE_QE: Record<string, { bg: string; border: string; color: string }> = {
    hot:  { bg: '#ef444420', border: '#ef4444', color: '#ef4444' },
    warm: { bg: '#f59e0b20', border: '#f59e0b', color: '#f59e0b' },
    cold: { bg: '#3b82f620', border: '#3b82f6', color: '#3b82f6' },
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998 }} onClick={handleClose} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--ws-surface,#fff)',
        borderRadius: '20px 20px 0 0',
        zIndex: 9999,
        padding: '0 0 env(safe-area-inset-bottom)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        maxHeight: '80dvh',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Quick Edit</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#6b7280)' }}>{deal.organization?.name}</div>
          </div>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--ws-text-secondary,#6b7280)' }}
            disabled={saving}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Stage */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>Stage</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STAGES.map(s => {
                const cfg = STAGE_CONFIG[s];
                return (
                  <button key={s}
                    onClick={() => setStage(s)}
                    style={{
                      padding: '6px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
                      border: `1.5px solid ${stage === s ? cfg.color : 'var(--ws-border,#e5e7eb)'}`,
                      background: stage === s ? cfg.color + '22' : 'var(--ws-surface,#fff)',
                      color: stage === s ? cfg.color : 'inherit', cursor: 'pointer',
                    }}>
                    {cfg.emoji} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Temperature */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>Temperature</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['hot', 'warm', 'cold'] as const).map(t => {
                const ts = TEMP_STYLE_QE[t];
                return (
                  <button key={t}
                    onClick={() => setTemperature(t)}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 10, fontSize: '0.875rem', fontWeight: 500,
                      border: `2px solid ${temperature === t ? ts.border : 'var(--ws-border,#e5e7eb)'}`,
                      background: temperature === t ? ts.bg : 'var(--ws-surface,#fff)',
                      color: temperature === t ? ts.color : 'inherit', cursor: 'pointer',
                    }}>
                    {t === 'hot' ? '🔴 Hot' : t === 'warm' ? '🟡 Warm' : '🔵 Cold'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Value + Follow-Up row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Value ($)</label>
              <input
                type="number"
                value={value}
                onChange={e => setValue(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--ws-border,#e5e7eb)', borderRadius: 8, fontSize: '0.875rem', background: 'var(--ws-surface,#fff)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Next Follow-Up</label>
              <input
                type="date"
                value={nextFollowup}
                onChange={e => setNextFollowup(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--ws-border,#e5e7eb)', borderRadius: 8, fontSize: '0.875rem', background: 'var(--ws-surface,#fff)' }}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '9px 12px', border: '1.5px solid var(--ws-border,#e5e7eb)', borderRadius: 8, fontSize: '0.875rem', background: 'var(--ws-surface,#fff)', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>

          <button
            onClick={handleClose}
            disabled={saving}
            style={{ padding: '12px', borderRadius: 10, background: '#C9A84C', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : 'Save & Close'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Filter Drawer ─── */
interface FilterDrawerProps {
  conferences: string[];
  employees: Employee[];
  filterStages: string[];
  filterConferences: string[];
  filterTemps: string[];
  filterOrgTypes: string[];
  filterAssigned: string;
  filterOverdueOnly: boolean;
  onChangeStages: (v: string[]) => void;
  onChangeConferences: (v: string[]) => void;
  onChangeTemps: (v: string[]) => void;
  onChangeOrgTypes: (v: string[]) => void;
  onChangeAssigned: (v: string) => void;
  onChangeOverdueOnly: (v: boolean) => void;
  onClose: () => void;
}

function FilterDrawer({
  conferences, employees,
  filterStages, filterConferences, filterTemps, filterOrgTypes, filterAssigned, filterOverdueOnly,
  onChangeStages, onChangeConferences, onChangeTemps, onChangeOrgTypes, onChangeAssigned, onChangeOverdueOnly,
  onClose,
}: FilterDrawerProps) {
  function toggleArr(arr: string[], val: string, setter: (v: string[]) => void) {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  }

  const STAGE_ENTRIES = Object.entries(STAGE_CONFIG) as [DealStage, typeof STAGE_CONFIG[DealStage]][];
  const ORG_TYPES = [
    { key: 'fraternity', label: '🏛 Fraternity' },
    { key: 'sorority', label: '🏠 Sorority' },
    { key: 'council', label: '⚖️ Council' },
    { key: 'national', label: '🌐 National' },
    { key: 'sports', label: '⚽ Sports' },
    { key: 'other', label: '🎓 Other' },
  ];

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998 }} onClick={onClose} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(360px, 100vw)',
        background: 'var(--ws-surface,#fff)',
        zIndex: 9999,
        boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 12px', borderBottom: '1px solid var(--ws-border,#e5e7eb)', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 700 }}>Filters</h3>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { onChangeStages([]); onChangeConferences([]); onChangeTemps([]); onChangeOrgTypes([]); onChangeAssigned(''); onChangeOverdueOnly(false); }}
              style={{ fontSize: '0.8125rem', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--ws-border,#e5e7eb)', background: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary,#6b7280)' }}
            >
              Clear
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 20px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Stage */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-secondary,#6b7280)' }}>Stage</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {STAGE_ENTRIES.map(([k, v]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={filterStages.includes(k)}
                    onChange={() => toggleArr(filterStages, k, onChangeStages)}
                    style={{ accentColor: '#C9A84C', width: 16, height: 16 }}
                  />
                  <span>{v.emoji} {v.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Org Type */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-secondary,#6b7280)' }}>Org Type</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ORG_TYPES.map(ot => (
                <button
                  key={ot.key}
                  onClick={() => toggleArr(filterOrgTypes, ot.key, onChangeOrgTypes)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: '0.8125rem', fontWeight: 500,
                    border: `1.5px solid ${filterOrgTypes.includes(ot.key) ? '#C9A84C' : 'var(--ws-border,#e5e7eb)'}`,
                    background: filterOrgTypes.includes(ot.key) ? '#C9A84C18' : 'var(--ws-surface,#fff)',
                    color: filterOrgTypes.includes(ot.key) ? '#C9A84C' : 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {ot.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conference */}
          {conferences.length > 0 && (
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-secondary,#6b7280)' }}>Conference</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {conferences.map(c => (
                  <button
                    key={c}
                    onClick={() => toggleArr(filterConferences, c, onChangeConferences)}
                    style={{
                      padding: '6px 12px', borderRadius: 20, fontSize: '0.8125rem', fontWeight: 500,
                      border: `1.5px solid ${filterConferences.includes(c) ? '#C9A84C' : 'var(--ws-border,#e5e7eb)'}`,
                      background: filterConferences.includes(c) ? '#C9A84C18' : 'var(--ws-surface,#fff)',
                      color: filterConferences.includes(c) ? '#C9A84C' : 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Temperature */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-secondary,#6b7280)' }}>Temperature</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { key: 'hot', label: '🔴 Hot', color: '#ef4444' },
                { key: 'warm', label: '🟡 Warm', color: '#f59e0b' },
                { key: 'cold', label: '🔵 Cold', color: '#3b82f6' },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => toggleArr(filterTemps, t.key, onChangeTemps)}
                  style={{
                    flex: 1, padding: '8px 6px', borderRadius: 10, fontSize: '0.8125rem', fontWeight: 500,
                    border: `1.5px solid ${filterTemps.includes(t.key) ? t.color : 'var(--ws-border,#e5e7eb)'}`,
                    background: filterTemps.includes(t.key) ? t.color + '18' : 'var(--ws-surface,#fff)',
                    color: filterTemps.includes(t.key) ? t.color : 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-secondary,#6b7280)' }}>Assigned To</div>
            <select
              value={filterAssigned}
              onChange={e => onChangeAssigned(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--ws-border,#e5e7eb)', borderRadius: 8, fontSize: '0.875rem', background: 'var(--ws-surface,#fff)' }}
            >
              <option value="">All Reps</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          {/* Overdue Only */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filterOverdueOnly}
                onChange={e => onChangeOverdueOnly(e.target.checked)}
                style={{ accentColor: '#C9A84C', width: 16, height: 16 }}
              />
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Overdue Only</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ws-text-secondary,#6b7280)' }}>Show only deals with past follow-up dates</div>
              </div>
            </label>
          </div>
        </div>

        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--ws-border,#e5e7eb)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ width: '100%', padding: '12px', borderRadius: 10, background: '#C9A84C', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer' }}
          >
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Main Component ─── */
interface PipelineV2Props {
  /** Pre-select and lock to a specific tab (used by intern workspace pages) */
  initialTab?: Tab;
  /** When true, hides the tab bar so users can't switch tabs */
  lockedTab?: boolean;
}

export default function PipelineV2({ initialTab = 'my-deals', lockedTab = false }: PipelineV2Props = {}) {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [nationals, setNationals] = useState<NationalOrg[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters — initialized from URL params
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState<string>(() => searchParams.get('stage') || 'all');
  const [filterConference, setFilterConference] = useState<string>(() => searchParams.get('conf') || '');
  const [filterType, setFilterType] = useState<string>(() => searchParams.get('type') || '');
  const [filterTemp, setFilterTemp] = useState<string>(() => searchParams.get('temp') || '');
  const [filterAssigned, setFilterAssigned] = useState<string>(() => searchParams.get('rep') || '');
  const [filterOverdueOnly, setFilterOverdueOnly] = useState<boolean>(() => searchParams.get('overdue') === '1');
  const [filterStages, setFilterStages] = useState<string[]>(() => {
    const s = searchParams.get('stages');
    return s ? s.split(',') : [];
  });
  const [filterOrgTypes, setFilterOrgTypes] = useState<string[]>(() => {
    const s = searchParams.get('orgtypes');
    return s ? s.split(',') : [];
  });
  const [filterConferences, setFilterConferences] = useState<string[]>(() => {
    const s = searchParams.get('confs');
    return s ? s.split(',') : [];
  });
  const [filterTemps, setFilterTemps] = useState<string[]>(() => {
    const s = searchParams.get('temps');
    return s ? s.split(',') : [];
  });
  const [showFilters, setShowFilters] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Quick action popovers
  const [checkPopoverDeal, setCheckPopoverDeal] = useState<string | null>(null);
  const [quickEditDeal, setQuickEditDeal] = useState<PipelineDeal | null>(null);
  const checkPopoverRef = useRef<HTMLDivElement>(null);

  // Detail views
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [selectedNational, setSelectedNational] = useState<NationalOrg | null>(null);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [editContactData, setEditContactData] = useState<Partial<Contact>>({});

  // Follow-up picker
  const [followupDeal, setFollowupDeal] = useState<string | null>(null);

  // Nationals filters
  const [natStageFilter, setNatStageFilter] = useState<string>('all');
  const [natTypeFilter, setNatTypeFilter] = useState<string>('');

  // Deal edit panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<PipelineDeal | null>(null);
  const [isNewDeal, setIsNewDeal] = useState(false);

  // Stage advance follow-up prompt
  const [stageAdvancePrompt, setStageAdvancePrompt] = useState<{ dealId: string; followupDate: string } | null>(null);

  function openDeal(deal: PipelineDeal | null) {
    setEditingDeal(deal);
    setIsNewDeal(deal === null);
    setPanelOpen(true);
  }
  function closePanel() {
    setPanelOpen(false);
  }
  function handlePanelSaved() {
    closePanel();
    loadDeals();
    loadSchools();
    showToast(isNewDeal ? 'Deal created!' : 'Deal saved!', 'success');
  }
  function handlePanelDeleted() {
    closePanel();
    loadDeals();
    showToast('Deal deleted', 'success');
  }
  function handleNewDealCreated() {
    closePanel();
    loadDeals();
    loadSchools();
    showToast('Deal created!', 'success');
  }

  /* ─── Data Loading ─── */
  const loadDeals = useCallback(async () => {
    const res = await fetch('/api/pipeline/deals');
    if (res.ok) setDeals(await res.json());
  }, []);

  const loadSchools = useCallback(async () => {
    const res = await fetch('/api/pipeline/schools');
    if (res.ok) setSchools(await res.json());
  }, []);

  const loadNationals = useCallback(async () => {
    const params = new URLSearchParams();
    if (natStageFilter !== 'all') params.set('stage', natStageFilter);
    if (natTypeFilter) params.set('type', natTypeFilter);
    const res = await fetch(`/api/pipeline/nationals?${params}`);
    if (res.ok) setNationals(await res.json());
  }, [natStageFilter, natTypeFilter]);

  const loadContacts = useCallback(async (searchOverride?: string) => {
    const params = new URLSearchParams();
    const q = searchOverride !== undefined ? searchOverride : '';
    if (q && activeTab === 'contacts') params.set('search', q);
    const res = await fetch(`/api/pipeline/contacts?${params}`);
    if (res.ok) setContacts(await res.json());
  }, [activeTab]); // searchQuery intentionally excluded — passed as arg to avoid re-triggering initial load effect

  const loadEmployees = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('employees').select('id, name, role').eq('status', 'active');
    if (data) setEmployees(data);
  }, []);

  const loadCurrentUser = useCallback(async () => {
    if (!supabase) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('employees').select('*').eq('auth_user_id', user.id).single();
      if (data) setCurrentUser(data);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadDeals(), loadSchools(), loadNationals(), loadContacts(), loadEmployees(), loadCurrentUser()])
      .finally(() => setLoading(false));
  }, [loadDeals, loadSchools, loadNationals, loadContacts, loadEmployees, loadCurrentUser]);

  useEffect(() => {
    if (activeTab === 'nationals') loadNationals();
  }, [activeTab, natStageFilter, natTypeFilter, loadNationals]);

  useEffect(() => {
    if (activeTab === 'contacts') loadContacts(searchQuery);
  }, [activeTab, searchQuery, loadContacts]);

  /* ─── Actions ─── */
  const logCall = async (dealId: string) => {
    const res = await fetch(`/api/pipeline/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_touched: new Date().toISOString(), followup_count: (deals.find(d => d.id === dealId)?.followup_count || 0) + 1 }),
    });
    if (res.ok) {
      showToast('Call logged!', 'success');
      loadDeals();
    }
  };

  const advanceStage = async (deal: PipelineDeal) => {
    const stages: DealStage[] = ['lead', 'demo_booked', 'first_demo', 'second_call', 'contract_sent', 'closed_won'];
    const idx = stages.indexOf(deal.stage);
    if (idx < 0 || idx >= stages.length - 1) return;
    const next = stages[idx + 1];
    const res = await fetch(`/api/pipeline/deals/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: next, last_touched: new Date().toISOString() }),
    });
    if (res.ok) {
      showToast(`Advanced to ${STAGE_CONFIG[next].label}!`, 'success');
      loadDeals();
      // FEATURE 3: show follow-up suggestion prompt (+3 days)
      const d = new Date();
      d.setDate(d.getDate() + 3);
      setStageAdvancePrompt({ dealId: deal.id, followupDate: d.toISOString().split('T')[0] });
    }
  };

  const setFollowup = async (dealId: string, date: string) => {
    const res = await fetch(`/api/pipeline/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ next_followup: date }),
    });
    if (res.ok) {
      showToast('Follow-up updated', 'success');
      setFollowupDeal(null);
      loadDeals();
    }
  };

  const clearFollowup = async (dealId: string) => {
    const res = await fetch(`/api/pipeline/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ next_followup: null }),
    });
    if (res.ok) {
      showToast('Follow-up cleared', 'success');
      setCheckPopoverDeal(null);
      loadDeals();
    }
  };

  const patchDeal = async (dealId: string, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/pipeline/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) loadDeals();
    return res.ok;
  };

  // Sync filters to URL (for all-deals tab)
  function pushFiltersToURL(overrides: Record<string, string> = {}) {
    const params = new URLSearchParams(searchParams.toString());
    const map: Record<string, string> = {
      stage: filterStage,
      conf: filterConference,
      type: filterType,
      temp: filterTemp,
      rep: filterAssigned,
      overdue: filterOverdueOnly ? '1' : '',
      stages: filterStages.join(','),
      orgtypes: filterOrgTypes.join(','),
      confs: filterConferences.join(','),
      temps: filterTemps.join(','),
      ...overrides,
    };
    Object.entries(map).forEach(([k, v]) => {
      if (v) params.set(k, v); else params.delete(k);
    });
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const saveContact = async (contactId: string) => {
    const res = await fetch(`/api/pipeline/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editContactData),
    });
    if (res.ok) {
      showToast('Contact updated', 'success');
      setEditingContact(null);
      loadContacts();
    }
  };

  /* ─── Filtered Deals ─── */
  const isFounder = currentUser?.role === 'founder' || currentUser?.role === 'cofounder';

  const filteredDeals = useMemo(() => {
    let result = [...deals];

    if (activeTab === 'my-deals' && currentUser) {
      result = result.filter(d => d.assigned_to === currentUser.id);
    }

    // Legacy simple filters (my-deals stage tabs only — not for all-deals which uses the drawer)
    if (filterStage !== 'all' && activeTab !== 'all-deals') result = result.filter(d => d.stage === filterStage);

    // Advanced filters (all-deals drawer)
    if (activeTab === 'all-deals') {
      if (filterStages.length > 0) result = result.filter(d => filterStages.includes(d.stage));
      if (filterConferences.length > 0) result = result.filter(d =>
        filterConferences.includes(d.conference || '') ||
        filterConferences.includes(d.organization?.school?.conference || '')
      );
      if (filterTemps.length > 0) result = result.filter(d => filterTemps.includes(d.temperature));
      if (filterOrgTypes.length > 0) {
        result = result.filter(d => {
          const icon = getOrgIcon(d);
          const iconToType: Record<string, string> = { '🏛': 'fraternity', '🏠': 'sorority', '⚖️': 'council', '🌐': 'national', '⚽': 'sports', '🎓': 'other' };
          return filterOrgTypes.includes(iconToType[icon] || d.deal_type);
        });
      }
      if (filterAssigned) result = result.filter(d => d.assigned_to === filterAssigned);
      if (filterOverdueOnly) result = result.filter(d => followupUrgency(d.next_followup) === 'overdue');
    }

    // Legacy conference/type/temp for simple dropdowns
    if (filterConference && activeTab !== 'all-deals') result = result.filter(d => d.conference === filterConference || d.organization?.school?.conference === filterConference);
    if (filterType) result = result.filter(d => d.deal_type === filterType);
    if (filterTemp && activeTab !== 'all-deals') result = result.filter(d => d.temperature === filterTemp);

    if (searchQuery && (activeTab === 'my-deals' || activeTab === 'all-deals')) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.organization?.name?.toLowerCase().includes(q) ||
        d.organization?.school?.name?.toLowerCase().includes(q) ||
        d.contact?.name?.toLowerCase().includes(q) ||
        d.notes?.toLowerCase().includes(q) ||
        d.conference?.toLowerCase().includes(q)
      );
    }

    result.sort(urgencySort);
    return result;
  }, [deals, activeTab, currentUser, filterStage, filterConference, filterType, filterTemp, filterAssigned, filterStages, filterConferences, filterTemps, filterOrgTypes, filterOverdueOnly, searchQuery]);

  const stats = useMemo(() => {
    const active = filteredDeals.filter(d => d.stage !== 'closed_lost' && d.stage !== 'hold_off');
    const totalValue = active.reduce((s, d) => s + (d.value || 0), 0);
    const overdue = active.filter(d => followupUrgency(d.next_followup) === 'overdue').length;
    const byStage: Record<string, number> = {};
    active.forEach(d => { byStage[d.stage] = (byStage[d.stage] || 0) + 1; });
    return { totalValue, overdue, byStage, total: active.length };
  }, [filteredDeals]);

  const conferences = useMemo(() => {
    const set = new Set<string>();
    deals.forEach(d => {
      if (d.conference) set.add(d.conference);
      if (d.organization?.school?.conference) set.add(d.organization.school.conference);
    });
    return [...set].sort();
  }, [deals]);

  /* ─── Deal Card ─── */
  const DealCard = ({ deal, showAssigned = false }: { deal: PipelineDeal; showAssigned?: boolean }) => {
    const urgency = followupUrgency(deal.next_followup);
    // BUG-5: prefer updated_at, fallback to last_touched, then created_at
    const days = daysAgo(deal.updated_at || deal.last_touched || deal.created_at);
    const stageConf = STAGE_CONFIG[deal.stage];
    const assignee = showAssigned ? employees.find(e => e.id === deal.assigned_to) : null;
    const orgIcon = getOrgIcon(deal);
    const fupStyle = followupStyle(deal.next_followup);
    const isOverdueFup = deal.next_followup && new Date(deal.next_followup) < new Date();
    const isCheckOpen = checkPopoverDeal === deal.id;

    const dealTypeLabelMap: Record<string, string> = { local: 'Local', council: 'Council', national: 'National' };

    return (
      <div
        className={`pl2__deal-card pl2__deal-card--${urgency}`}
        onClick={() => { setCheckPopoverDeal(null); openDeal(deal); }}
        style={{ cursor: 'pointer', borderLeft: `3px solid ${TEMP_BORDER[deal.temperature] || '#e5e7eb'}` }}
      >
        <div className="pl2__deal-header">
          <div className="pl2__deal-org">
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>{orgIcon}</span>
            <span className="pl2__deal-name">{deal.organization?.name || 'Unknown'}</span>
          </div>
          <span className="pl2__stage-pill" style={{ background: stageConf?.color + '22', color: stageConf?.color }}>
            {stageConf?.emoji} {stageConf?.label}
          </span>
        </div>

        <div className="pl2__deal-meta">
          {deal.organization?.school && (
            <span className="pl2__deal-school">
              <Building2 size={12} />
              {deal.organization.school.name}
              {deal.organization.school.conference && (
                <span className="pl2__conf-badge">{deal.organization.school.conference}</span>
              )}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 6, background: 'var(--ws-border,#e5e7eb)', color: 'var(--ws-text-secondary,#6b7280)', fontWeight: 500 }}>
              {dealTypeLabelMap[deal.deal_type] || deal.deal_type}
            </span>
            {deal.deal_type === 'council' && (!deal.value || deal.value === 0) && (
              <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 6, background: '#fef3c7', color: '#d97706', fontWeight: 600 }}>
                ⚠️ Value missing
              </span>
            )}
          </span>
          {deal.contact && <span className="pl2__deal-contact"><Users size={12} /> {deal.contact.name}</span>}
          {deal.value > 0 && <span className="pl2__deal-value">{formatCurrency(deal.value)}</span>}
        </div>

        <div className="pl2__deal-footer">
          <div className="pl2__deal-dates">
            {deal.next_followup ? (
              <span className={`pl2__followup pl2__followup--${urgency}`} style={fupStyle}>
                <Calendar size={12} />
                {isOverdueFup && '⚠️ '}
                {formatDate(deal.next_followup)}
              </span>
            ) : null}
            {days !== null && (
              <span className="pl2__last-touch">
                <Clock size={12} /> {days === 0 ? 'Today' : `${days}d ago`}
              </span>
            )}
          </div>

          <div className="pl2__deal-actions" onClick={e => e.stopPropagation()}>
            {deal.contact?.phone && (
              <a href={`tel:${deal.contact.phone}`} className="pl2__action-btn pl2__action-btn--call" title="Call">
                <Phone size={14} />
              </a>
            )}
            {deal.contact?.phone && (
              <a href={`sms:${deal.contact.phone}`} className="pl2__action-btn" title="Text">
                <MessageSquare size={14} />
              </a>
            )}
            {/* ✓ button with popover */}
            <div style={{ position: 'relative' }}>
              <button
                className={`pl2__action-btn ${isCheckOpen ? 'pl2__action-btn--active' : ''}`}
                onClick={() => setCheckPopoverDeal(isCheckOpen ? null : deal.id)}
                title="Actions"
              >
                <Check size={14} />
              </button>
              {isCheckOpen && (
                <div
                  ref={checkPopoverRef}
                  style={{
                    position: 'absolute', bottom: '100%', right: 0,
                    background: 'var(--ws-surface,#fff)',
                    border: '1px solid var(--ws-border,#e5e7eb)',
                    borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                    zIndex: 100, minWidth: 190, overflow: 'hidden',
                  }}
                >
                  <button
                    style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.8125rem', cursor: 'pointer' }}
                    onClick={() => { clearFollowup(deal.id); setCheckPopoverDeal(null); }}
                  >
                    ✅ Mark follow-up done
                  </button>
                  <button
                    style={{ display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.8125rem', cursor: 'pointer', borderTop: '1px solid var(--ws-border,#e5e7eb)' }}
                    onClick={() => { advanceStage(deal); setCheckPopoverDeal(null); }}
                  >
                    ➡️ Advance stage
                  </button>
                </div>
              )}
            </div>
            <button className="pl2__action-btn" onClick={() => setFollowupDeal(deal.id)} title="Set follow-up">
              <Clock size={14} />
            </button>
            {/* ✏️ Quick Edit */}
            <button
              className="pl2__action-btn"
              onClick={() => setQuickEditDeal(deal)}
              title="Quick edit"
            >
              <Edit3 size={14} />
            </button>
          </div>
        </div>

        {showAssigned && deal.assigned_to && (
          <div className="pl2__deal-assigned">{assignee?.name || deal.assigned_to}</div>
        )}
      </div>
    );
  };

  /* ─── School Card ─── */
  const SchoolCard = ({ school, activeDeals }: { school: School; activeDeals: number }) => {
    const orgs = school.organizations || [];
    const activeCustomers = orgs.filter(o => o.status === 'active_customer').length;
    const hasIfc = orgs.some(o => o.type === 'ifc');
    const hasPhc = orgs.some(o => o.type === 'phc');

    return (
      <button className="pl2__school-card" onClick={() => setSelectedSchool(school)} style={{
        borderLeftColor: activeCustomers > 0 ? 'var(--color-accent-success)' : activeDeals > 0 ? 'var(--color-accent-warm)' : 'var(--ws-border)',
      }}>
        <div className="pl2__school-header">
          <h3 className="pl2__school-name">{school.name}</h3>
          {school.conference && <span className="pl2__conf-badge">{school.conference}</span>}
        </div>
        <div className="pl2__school-stats">
          {activeCustomers > 0 && <span>{activeCustomers} active chapter{activeCustomers !== 1 ? 's' : ''}</span>}
          {(hasIfc || hasPhc) && <span className="pl2__council-badge">{hasIfc && 'IFC'}{hasIfc && hasPhc && ' · '}{hasPhc && 'PHC'}</span>}
        </div>
        <div className="pl2__school-footer">
          <span>{activeDeals} active deal{activeDeals !== 1 ? 's' : ''}</span>
        </div>
      </button>
    );
  };

  /* ─── School Detail ─── */
  const SchoolDetail = ({ school }: { school: School }) => {
    const orgs = school.organizations || [];
    // Only show orgs that have at least one active deal (not closed_lost or hold_off)
    const activeOrgs = orgs
      .map(org => ({
        ...org,
        activeDeals: ((org as any).pipeline_deals || []).filter(
          (d: any) => d.stage !== 'closed_lost' && d.stage !== 'hold_off'
        ),
      }))
      .filter(org => org.activeDeals.length > 0);

    return (
      <div className="pl2__detail-panel">
        <div className="pl2__detail-header">
          <button className="pl2__back-btn" onClick={() => setSelectedSchool(null)}>← Back</button>
          <h2>{school.name}</h2>
          {school.conference && <span className="pl2__conf-badge pl2__conf-badge--lg">{school.conference}</span>}
        </div>
        <div className="pl2__detail-grid">
          {activeOrgs.map(org => (
            <div key={org.id} className="pl2__org-card">
              <div className="pl2__org-header">
                <h4>{org.name}</h4>
                <span className={`pl2__status-dot pl2__status-dot--${org.status}`} />
              </div>
              <span className="pl2__org-type">{org.type}</span>
              {org.activeDeals.map((d: any) => (
                <div key={d.id} className="pl2__mini-deal">
                  <span className="pl2__stage-pill pl2__stage-pill--sm" style={{ background: STAGE_CONFIG[d.stage as DealStage]?.color + '22', color: STAGE_CONFIG[d.stage as DealStage]?.color }}>
                    {STAGE_CONFIG[d.stage as DealStage]?.label}
                  </span>
                  {d.value > 0 && <span>{formatCurrency(d.value)}</span>}
                </div>
              ))}
            </div>
          ))}
          {activeOrgs.length === 0 && <p className="pl2__empty">No active deals at this school.</p>}
        </div>
      </div>
    );
  };

  /* ─── National Detail ─── */
  const NationalDetail = ({ nat }: { nat: NationalOrg }) => {
    const orgs = nat.organizations || [];
    return (
      <div className="pl2__detail-panel">
        <div className="pl2__detail-header">
          <button className="pl2__back-btn" onClick={() => setSelectedNational(null)}>← Back</button>
          <h2>{nat.name}</h2>
          <span className="pl2__type-badge">{nat.type === 'fraternity' ? '🏛️ Fraternity' : '🏠 Sorority'}</span>
        </div>
        <div className="pl2__nat-meta">
          {nat.abbreviation && <span>({nat.abbreviation})</span>}
          <span className="pl2__stage-pill" style={{ background: '#C4A57422', color: '#C4A574' }}>{nat.stage}</span>
          {nat.chapter_count && <span>{nat.chapter_count} chapters</span>}
        </div>
        <h3 className="pl2__section-title">Chapters in Pipeline</h3>
        <div className="pl2__detail-grid">
          {orgs.map(org => (
            <div key={org.id} className="pl2__org-card">
              <h4>{org.name}</h4>
              {org.school && <span className="pl2__deal-school"><Building2 size={12} /> {org.school.name}</span>}
              {(org as any).pipeline_deals?.map((d: any) => (
                <div key={d.id} className="pl2__mini-deal">
                  <span className="pl2__stage-pill pl2__stage-pill--sm" style={{ background: STAGE_CONFIG[d.stage as DealStage]?.color + '22', color: STAGE_CONFIG[d.stage as DealStage]?.color }}>
                    {STAGE_CONFIG[d.stage as DealStage]?.label}
                  </span>
                  {d.value > 0 && <span>{formatCurrency(d.value)}</span>}
                </div>
              ))}
            </div>
          ))}
          {orgs.length === 0 && <p className="pl2__empty">No chapters connected yet.</p>}
        </div>
      </div>
    );
  };

  /* ─── Leaderboard ─── */
  const Leaderboard = () => {
    const repStats = useMemo(() => {
      const map: Record<string, { name: string; closed: number; value: number; total: number; overdueCount: number; upToDate: number }> = {};
      employees.filter(e => ['growth_intern', 'sales_intern', 'founder', 'cofounder'].includes(e.role)).forEach(e => {
        map[e.id] = { name: e.name, closed: 0, value: 0, total: 0, overdueCount: 0, upToDate: 0 };
      });
      deals.forEach(d => {
        if (!d.assigned_to || !map[d.assigned_to]) return;
        const r = map[d.assigned_to];
        r.total++;
        r.value += d.value || 0;
        if (d.stage === 'closed_won') r.closed++;
        const u = followupUrgency(d.next_followup);
        if (u === 'overdue') r.overdueCount++;
        else r.upToDate++;
      });
      return Object.values(map).sort((a, b) => b.value - a.value);
    }, []);

    return (
      <div className="pl2__leaderboard">
        <h2 className="pl2__section-title">🏆 Leaderboard</h2>
        <div className="pl2__lb-grid">
          {repStats.map((r, i) => (
            <div key={i} className="pl2__lb-card">
              <div className="pl2__lb-rank">#{i + 1}</div>
              <div className="pl2__lb-info">
                <h4>{r.name}</h4>
                <div className="pl2__lb-stats">
                  <span>{r.closed} closed</span>
                  <span>{formatCurrency(r.value)} pipeline</span>
                  <span>{r.total > 0 ? Math.round((r.upToDate / r.total) * 100) : 0}% follow-up compliance</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ─── CSV Export ─── */
  function exportPipelineCSV() {
    const escapeCell = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const headers = [
      'Deal Name', 'Organization', 'School', 'Stage', 'Type',
      'Value ($)', 'Assigned To', 'Conference', 'Temperature',
      'Last Touched', 'Follow-up Count', 'Notes', 'Created At',
    ];

    const rows = deals.map(d => {
      const assignee = employees.find(e => e.id === d.assigned_to);
      const conference = d.conference || d.organization?.school?.conference || '';
      return [
        escapeCell(d.organization?.name),
        escapeCell(d.organization?.name),
        escapeCell(d.organization?.school?.name),
        escapeCell(STAGE_CONFIG[d.stage]?.label || d.stage),
        escapeCell(d.organization?.type || d.deal_type),
        escapeCell(d.value),
        escapeCell(assignee?.name),
        escapeCell(conference),
        escapeCell(d.temperature),
        escapeCell(d.last_touched ? new Date(d.last_touched).toLocaleDateString('en-US') : ''),
        escapeCell(d.followup_count),
        escapeCell(d.notes),
        escapeCell(d.created_at ? new Date(d.created_at).toLocaleDateString('en-US') : ''),
      ].join(',');
    });

    const csv = [headers.map(escapeCell).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `trailblaize-pipeline-${today}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ─── Render ─── */
  if (loading) {
    return (
      <div className="pl2__loading">
        <div className="pl2__spinner" />
        <p>Loading pipeline...</p>
      </div>
    );
  }

  return (
    <div className="pl2">
      {/* Tabs — hidden when locked to a single tab (intern workspace pages) */}
      {!lockedTab && (
        <div className="pl2__tabs">
          {TABS.filter(t => t.key !== 'leaderboard' || isFounder).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                className={`pl2__tab ${activeTab === t.key ? 'pl2__tab--active' : ''}`}
                onClick={() => { setActiveTab(t.key); setSelectedSchool(null); setSelectedNational(null); }}
              >
                <Icon size={16} />
                <span className="pl2__tab-label">{t.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + Filters */}
      {(activeTab === 'my-deals' || activeTab === 'all-deals' || activeTab === 'contacts') && (
        <div className="pl2__toolbar">
          <div className="pl2__search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search deals..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && <button className="pl2__clear-btn" onClick={() => setSearchQuery('')}><X size={14} /></button>}
          </div>
          {activeTab === 'all-deals' && (
            <button className="pl2__filter-toggle" onClick={() => setFilterDrawerOpen(true)}>
              <SlidersHorizontal size={16} /> Filters
              {(filterStages.length + filterConferences.length + filterTemps.length + filterOrgTypes.length + (filterOverdueOnly ? 1 : 0) + (filterAssigned ? 1 : 0)) > 0 && (
                <span style={{ marginLeft: 4, background: '#C9A84C', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>
                  {filterStages.length + filterConferences.length + filterTemps.length + filterOrgTypes.length + (filterOverdueOnly ? 1 : 0) + (filterAssigned ? 1 : 0)}
                </span>
              )}
            </button>
          )}
          {(activeTab === 'my-deals' || activeTab === 'all-deals') && (
            <button className="pl2__add-deal-btn" onClick={() => openDeal(null)} title="Add deal">
              <Plus size={16} /> New Deal
            </button>
          )}
          {(activeTab === 'my-deals' || activeTab === 'all-deals') && (
            <button
              onClick={exportPipelineCSV}
              title="Export pipeline as CSV"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 500,
                border: '1px solid var(--ws-border)',
                borderRadius: '8px',
                background: 'var(--ws-surface)',
                color: 'var(--ws-text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
      )}

      {/* Stage tabs — My Deals only */}
      {activeTab === 'my-deals' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 16px 0',
          overflowX: 'auto',
          borderBottom: '1px solid var(--ws-border)',
        }}>
          {([
            { key: 'all', label: 'All', emoji: '📋' },
            ...Object.entries(STAGE_CONFIG)
              .filter(([k]) => k !== 'closed_lost' && k !== 'hold_off')
              .map(([k, v]) => ({ key: k, label: v.label, emoji: v.emoji, color: v.color })),
            { key: 'closed_lost', label: 'Closed Lost', emoji: '❌', color: '#ef4444' },
            { key: 'hold_off', label: 'Hold Off', emoji: '⏸️', color: '#9ca3af' },
          ] as { key: string; label: string; emoji: string; color?: string }[]).map(stage => {
            const isActive = filterStage === stage.key;
            const count = deals.filter(d =>
              d.assigned_to === currentUser?.id &&
              (stage.key === 'all' || d.stage === stage.key)
            ).length;
            return (
              <button
                key={stage.key}
                onClick={() => setFilterStage(stage.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '8px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? (stage.color || 'var(--ws-accent)') : 'var(--ws-text-secondary)',
                  borderBottom: isActive ? `2px solid ${stage.color || 'var(--ws-accent)'}` : '2px solid transparent',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                  marginBottom: -1,
                }}
              >
                <span>{stage.emoji}</span>
                <span>{stage.label}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: isActive ? (stage.color || 'var(--ws-accent)') + '22' : 'var(--ws-border)',
                    color: isActive ? (stage.color || 'var(--ws-accent)') : 'var(--ws-text-secondary)',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active filter chips for All Deals */}
      {activeTab === 'all-deals' && (filterStages.length + filterConferences.length + filterTemps.length + filterOrgTypes.length + (filterOverdueOnly ? 1 : 0) + (filterAssigned ? 1 : 0)) > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 8px' }}>
          {filterStages.map(s => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '3px 8px', borderRadius: 20, background: '#C9A84C22', color: '#C9A84C', fontWeight: 500 }}>
              {STAGE_CONFIG[s as DealStage]?.emoji} {STAGE_CONFIG[s as DealStage]?.label}
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setFilterStages(prev => prev.filter(x => x !== s))}>×</button>
            </span>
          ))}
          {filterConferences.map(c => (
            <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '3px 8px', borderRadius: 20, background: '#C9A84C22', color: '#C9A84C', fontWeight: 500 }}>
              {c}<button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setFilterConferences(prev => prev.filter(x => x !== c))}>×</button>
            </span>
          ))}
          {filterTemps.map(t => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '3px 8px', borderRadius: 20, background: '#C9A84C22', color: '#C9A84C', fontWeight: 500 }}>
              {t === 'hot' ? '🔴' : t === 'warm' ? '🟡' : '🔵'} {t}
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setFilterTemps(prev => prev.filter(x => x !== t))}>×</button>
            </span>
          ))}
          {filterOrgTypes.map(ot => (
            <span key={ot} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '3px 8px', borderRadius: 20, background: '#C9A84C22', color: '#C9A84C', fontWeight: 500 }}>
              {ot}<button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setFilterOrgTypes(prev => prev.filter(x => x !== ot))}>×</button>
            </span>
          ))}
          {filterOverdueOnly && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '3px 8px', borderRadius: 20, background: '#ef444422', color: '#ef4444', fontWeight: 500 }}>
              Overdue only<button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setFilterOverdueOnly(false)}>×</button>
            </span>
          )}
          {filterAssigned && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', padding: '3px 8px', borderRadius: 20, background: '#C9A84C22', color: '#C9A84C', fontWeight: 500 }}>
              Rep: {filterAssigned}<button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }} onClick={() => setFilterAssigned('')}>×</button>
            </span>
          )}
          <button
            style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: 20, background: 'none', border: '1px solid var(--ws-border,#e5e7eb)', color: 'var(--ws-text-secondary,#6b7280)', cursor: 'pointer' }}
            onClick={() => { setFilterStages([]); setFilterConferences([]); setFilterTemps([]); setFilterOrgTypes([]); setFilterOverdueOnly(false); setFilterAssigned(''); }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Stats bar for deal tabs */}
      {(activeTab === 'my-deals' || activeTab === 'all-deals') && (
        <div className="pl2__stats-bar">
          <div className="pl2__stat">
            <span className="pl2__stat-value">{stats.total}</span>
            <span className="pl2__stat-label">Deals</span>
          </div>
          <div className="pl2__stat">
            <span className="pl2__stat-value">{formatCurrency(stats.totalValue)}</span>
            <span className="pl2__stat-label">Pipeline</span>
          </div>
          <div className="pl2__stat pl2__stat--warn">
            <span className="pl2__stat-value">{stats.overdue}</span>
            <span className="pl2__stat-label">Overdue</span>
          </div>
          {Object.entries(stats.byStage).slice(0, 4).map(([stage, count]) => (
            <div key={stage} className="pl2__stat">
              <span className="pl2__stat-value">{count}</span>
              <span className="pl2__stat-label">{STAGE_CONFIG[stage as DealStage]?.emoji} {STAGE_CONFIG[stage as DealStage]?.label}</span>
            </div>
          ))}
          {/* FEATURE 4: Overdue triage button */}
          {stats.overdue > 0 && (
            <button
              onClick={() => {
                setFilterOverdueOnly(true);
                if (activeTab !== 'all-deals') setActiveTab('all-deals');
              }}
              style={{
                marginLeft: 'auto',
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20,
                background: '#f59e0b18', border: '1.5px solid #f59e0b',
                color: '#d97706', fontWeight: 600, fontSize: '0.8rem',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              ⚠️ Triage {stats.overdue} Overdue
            </button>
          )}
        </div>
      )}

      {/* FEATURE 4: Overdue-only banner */}
      {filterOverdueOnly && (activeTab === 'my-deals' || activeTab === 'all-deals') && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', background: '#fff7ed',
          borderBottom: '1px solid #fed7aa', fontSize: '0.8125rem',
          color: '#92400e',
        }}>
          <span>⚠️ Showing overdue deals only — {filteredDeals.filter(d => followupUrgency(d.next_followup) === 'overdue').length} deals need attention</span>
          <button
            onClick={() => setFilterOverdueOnly(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: '#92400e', padding: '0 2px' }}
          >×</button>
        </div>
      )}

      {/* Content */}
      <div className="pl2__content">
        {/* My Deals / All Deals */}
        {(activeTab === 'my-deals' || activeTab === 'all-deals') && (
          <div className="pl2__deals-list">
            {filteredDeals.length === 0 && (
              <div className="pl2__empty">
                <p>{activeTab === 'my-deals' ? 'No deals assigned to you yet.' : 'No deals match your filters.'}</p>
              </div>
            )}
            {filteredDeals.map(deal => (
              <DealCard key={deal.id} deal={deal} showAssigned={activeTab === 'all-deals'} />
            ))}
          </div>
        )}

        {/* Schools */}
        {activeTab === 'schools' && !selectedSchool && (
          <>
            <div className="pl2__toolbar">
              <div className="pl2__search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search schools..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="pl2__schools-grid">
              {schools
                .map(s => ({
                  school: s,
                  activeDeals: (s.organizations || []).reduce((sum, o) =>
                    sum + ((o as any).pipeline_deals || []).filter(
                      (d: any) => d.stage !== 'closed_lost' && d.stage !== 'hold_off'
                    ).length, 0),
                }))
                .filter(({ school, activeDeals }) =>
                  activeDeals > 0 &&
                  (!searchQuery || school.name.toLowerCase().includes(searchQuery.toLowerCase()))
                )
                .sort((a, b) => b.activeDeals - a.activeDeals)
                .map(({ school, activeDeals }) => (
                  <SchoolCard key={school.id} school={school} activeDeals={activeDeals} />
                ))}
            </div>
          </>
        )}
        {activeTab === 'schools' && selectedSchool && <SchoolDetail school={selectedSchool} />}

        {/* Nationals */}
        {activeTab === 'nationals' && !selectedNational && (
          <>
            <div className="pl2__toolbar">
              <div className="pl2__search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search nationals..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <select value={natStageFilter} onChange={e => setNatStageFilter(e.target.value)} className="pl2__filter-select">
                <option value="all">All Stages</option>
                {NATIONAL_STAGES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <select value={natTypeFilter} onChange={e => setNatTypeFilter(e.target.value)} className="pl2__filter-select">
                <option value="">All Types</option>
                <option value="fraternity">Fraternities</option>
                <option value="sorority">Sororities</option>
              </select>
            </div>
            <div className="pl2__nationals-list">
              {nationals
                .filter(n => !searchQuery || n.name.toLowerCase().includes(searchQuery.toLowerCase()) || n.abbreviation?.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(nat => {
                  const chapCount = nat.organizations?.length || 0;
                  return (
                    <button key={nat.id} className="pl2__nat-card" onClick={() => setSelectedNational(nat)}>
                      <div className="pl2__nat-header">
                        <h4>{nat.name}</h4>
                        {nat.abbreviation && <span className="pl2__nat-abbr">({nat.abbreviation})</span>}
                      </div>
                      <div className="pl2__nat-meta">
                        <span className="pl2__type-badge">{nat.type === 'fraternity' ? '🏛️' : '🏠'}</span>
                        <span className="pl2__stage-pill" style={{ background: '#C4A57422', color: '#C4A574' }}>{nat.stage}</span>
                        {chapCount > 0 && <span>{chapCount} in pipeline</span>}
                      </div>
                    </button>
                  );
                })}
            </div>
          </>
        )}
        {activeTab === 'nationals' && selectedNational && <NationalDetail nat={selectedNational} />}

        {/* Contacts */}
        {activeTab === 'contacts' && (
          <div className="pl2__contacts-list">
            {contacts.map(c => (
              <div key={c.id} className="pl2__contact-card">
                {editingContact === c.id ? (
                  <div className="pl2__contact-edit">
                    <input value={editContactData.name || ''} onChange={e => setEditContactData({ ...editContactData, name: e.target.value })} placeholder="Name" />
                    <input value={editContactData.email || ''} onChange={e => setEditContactData({ ...editContactData, email: e.target.value })} placeholder="Email" />
                    <input value={editContactData.phone || ''} onChange={e => setEditContactData({ ...editContactData, phone: e.target.value })} placeholder="Phone" />
                    <div className="pl2__contact-edit-actions">
                      <button onClick={() => saveContact(c.id)} className="pl2__btn pl2__btn--primary">Save</button>
                      <button onClick={() => setEditingContact(null)} className="pl2__btn">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="pl2__contact-info">
                      <h4>{c.name}</h4>
                      {c.role && <span className="pl2__contact-role">{c.role.replace('_', ' ')}</span>}
                      {c.organization && (
                        <span className="pl2__deal-school">
                          <Building2 size={12} />
                          {c.organization.name}
                          {c.organization.school && <> · {c.organization.school.name}</>}
                        </span>
                      )}
                    </div>
                    <div className="pl2__contact-actions">
                      {c.phone && <a href={`tel:${c.phone}`} className="pl2__action-btn pl2__action-btn--call"><Phone size={14} /></a>}
                      {c.email && <a href={`mailto:${c.email}`} className="pl2__action-btn"><Mail size={14} /></a>}
                      <button className="pl2__action-btn" onClick={() => { setEditingContact(c.id); setEditContactData({ name: c.name, email: c.email || '', phone: c.phone || '' }); }}>
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {contacts.length === 0 && <div className="pl2__empty"><p>No contacts found.</p></div>}
          </div>
        )}

        {/* Leaderboard */}
        {activeTab === 'leaderboard' && <Leaderboard />}
      </div>

      {/* New Deal Modal */}
      {panelOpen && isNewDeal && (
        <NewDealModal
          onClose={closePanel}
          onCreated={handleNewDealCreated}
        />
      )}

      {/* Deal Edit Panel (existing deals only) */}
      {panelOpen && !isNewDeal && editingDeal && (
        <DealEditPanel
          deal={editingDeal}
          employees={employees}
          schools={schools}
          nationals={nationals}
          onClose={closePanel}
          onSaved={handlePanelSaved}
          onDeleted={handlePanelDeleted}
        />
      )}

      {/* Quick Edit Sheet */}
      {quickEditDeal && (
        <QuickEditSheet
          deal={quickEditDeal}
          onClose={() => { setQuickEditDeal(null); loadDeals(); }}
          onPatch={patchDeal}
        />
      )}

      {/* Filter Drawer */}
      {filterDrawerOpen && (
        <FilterDrawer
          conferences={conferences}
          employees={employees.filter(e => ['growth_intern', 'sales_intern', 'founder', 'cofounder'].includes(e.role))}
          filterStages={filterStages}
          filterConferences={filterConferences}
          filterTemps={filterTemps}
          filterOrgTypes={filterOrgTypes}
          filterAssigned={filterAssigned}
          filterOverdueOnly={filterOverdueOnly}
          onChangeStages={setFilterStages}
          onChangeConferences={setFilterConferences}
          onChangeTemps={setFilterTemps}
          onChangeOrgTypes={setFilterOrgTypes}
          onChangeAssigned={setFilterAssigned}
          onChangeOverdueOnly={setFilterOverdueOnly}
          onClose={() => setFilterDrawerOpen(false)}
        />
      )}

      {/* FEATURE 3: Stage Advance Follow-up Prompt */}
      {stageAdvancePrompt && (
        <div style={{
          position: 'fixed', bottom: 80, left: 16, right: 16,
          background: 'var(--ws-surface,#fff)',
          border: '1.5px solid #C9A84C', borderRadius: 12,
          padding: '12px 16px', zIndex: 10000,
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column', gap: 8,
          maxWidth: 420, margin: '0 auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>📅 Set a follow-up?</span>
            <button onClick={() => setStageAdvancePrompt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, color: 'var(--ws-text-secondary,#6b7280)', padding: '0 2px' }}>×</button>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#6b7280)' }}>
            Suggested: {formatDate(stageAdvancePrompt.followupDate)} (+3 days)
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                setFollowup(stageAdvancePrompt.dealId, stageAdvancePrompt.followupDate);
                setStageAdvancePrompt(null);
              }}
              style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#C9A84C', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              ✓ Set Follow-Up
            </button>
            <button
              onClick={() => setStageAdvancePrompt(null)}
              style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid var(--ws-border,#e5e7eb)', background: 'none', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Follow-up Picker Bottom Sheet */}
      {followupDeal && (
        <div className="pl2__bottom-sheet-overlay" onClick={() => setFollowupDeal(null)}>
          <div className="pl2__bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="pl2__bottom-sheet-handle" />
            <h3>Set Follow-up</h3>
            <div className="pl2__followup-options">
              {[
                { label: 'Tomorrow', days: 1 },
                { label: 'In 3 days', days: 3 },
                { label: 'Next week', days: 7 },
                { label: 'In 2 weeks', days: 14 },
                { label: 'Next month', days: 30 },
              ].map(opt => {
                const date = new Date();
                date.setDate(date.getDate() + opt.days);
                const dateStr = date.toISOString().split('T')[0];
                return (
                  <button key={opt.days} className="pl2__followup-btn" onClick={() => setFollowup(followupDeal, dateStr)}>
                    {opt.label}
                    <span className="pl2__followup-date">{formatDate(dateStr)}</span>
                  </button>
                );
              })}
              <div className="pl2__followup-custom">
                <input
                  type="date"
                  onChange={e => { if (e.target.value) setFollowup(followupDeal, e.target.value); }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
