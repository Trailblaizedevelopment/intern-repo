'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, Search, Filter, Phone, MessageSquare, Clock, Mail,
  ChevronRight, ChevronDown, Building2, Users, Trophy, Globe, X,
  Calendar, Flame, BarChart3, MapPin, ArrowUpRight, Plus, Edit2, Check
} from 'lucide-react';
import { supabase, STAGE_CONFIG, DealStage } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import FollowUpPicker from './FollowUpPicker';
import DealEditPanel from './DealEditPanel';

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
  organization?: {
    id: string;
    name: string;
    type: string;
    school?: { id: string; name: string; conference: string } | null;
    national_org?: { id: string; name: string; abbreviation: string } | null;
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

/* ─── Main Component ─── */
interface PipelineV2Props {
  /** Pre-select and lock to a specific tab (used by intern workspace pages) */
  initialTab?: Tab;
  /** When true, hides the tab bar so users can't switch tabs */
  lockedTab?: boolean;
}

export default function PipelineV2({ initialTab = 'my-deals', lockedTab = false }: PipelineV2Props = {}) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [nationals, setNationals] = useState<NationalOrg[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [filterConference, setFilterConference] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterTemp, setFilterTemp] = useState<string>('');
  const [filterAssigned, setFilterAssigned] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

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

  const loadContacts = useCallback(async () => {
    const params = new URLSearchParams();
    if (searchQuery && activeTab === 'contacts') params.set('search', searchQuery);
    const res = await fetch(`/api/pipeline/contacts?${params}`);
    if (res.ok) setContacts(await res.json());
  }, [searchQuery, activeTab]);

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
    if (activeTab === 'contacts') loadContacts();
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

    if (filterStage !== 'all') result = result.filter(d => d.stage === filterStage);
    if (filterConference) result = result.filter(d => d.conference === filterConference || d.organization?.school?.conference === filterConference);
    if (filterType) result = result.filter(d => d.deal_type === filterType);
    if (filterTemp) result = result.filter(d => d.temperature === filterTemp);
    if (filterAssigned) result = result.filter(d => d.assigned_to === filterAssigned);

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
  }, [deals, activeTab, currentUser, filterStage, filterConference, filterType, filterTemp, filterAssigned, searchQuery]);

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
    const days = daysAgo(deal.last_touched);
    const stageConf = STAGE_CONFIG[deal.stage];
    const assignee = showAssigned ? employees.find(e => e.id === deal.assigned_to) : null;

    return (
      <div className={`pl2__deal-card pl2__deal-card--${urgency}`} onClick={() => openDeal(deal)} style={{ cursor: 'pointer' }}>
        <div className="pl2__deal-header">
          <div className="pl2__deal-org">
            <span className="pl2__temp-dot" style={{ background: TEMP_COLORS[deal.temperature] }} />
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
          {deal.contact && <span className="pl2__deal-contact"><Users size={12} /> {deal.contact.name}</span>}
          {deal.value > 0 && <span className="pl2__deal-value">{formatCurrency(deal.value)}</span>}
        </div>

        <div className="pl2__deal-footer">
          <div className="pl2__deal-dates">
            {deal.next_followup && (
              <span className={`pl2__followup pl2__followup--${urgency}`}>
                <Calendar size={12} /> {formatDate(deal.next_followup)}
              </span>
            )}
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
            <button className="pl2__action-btn" onClick={() => logCall(deal.id)} title="Log call">
              <Check size={14} />
            </button>
            <button className="pl2__action-btn" onClick={() => setFollowupDeal(deal.id)} title="Snooze follow-up">
              <Clock size={14} />
            </button>
            {deal.stage !== 'closed_won' && deal.stage !== 'closed_lost' && (
              <button className="pl2__action-btn pl2__action-btn--advance" onClick={() => advanceStage(deal)} title="Advance stage">
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </div>

        {showAssigned && assignee && (
          <div className="pl2__deal-assigned">{assignee.name}</div>
        )}
      </div>
    );
  };

  /* ─── School Card ─── */
  const SchoolCard = ({ school }: { school: School }) => {
    const orgs = school.organizations || [];
    const totalDeals = orgs.reduce((s, o) => s + (o.pipeline_deals?.length || 0), 0);
    const totalValue = orgs.reduce((s, o) => s + (o.pipeline_deals?.reduce((v, d) => v + (d.value || 0), 0) || 0), 0);
    const activeCustomers = orgs.filter(o => o.status === 'active_customer').length;
    const hasIfc = orgs.some(o => o.type === 'ifc');
    const hasPhc = orgs.some(o => o.type === 'phc');
    const penetration = school.total_greek_orgs ? Math.round((activeCustomers / school.total_greek_orgs) * 100) : 0;

    return (
      <button className="pl2__school-card" onClick={() => setSelectedSchool(school)} style={{
        borderLeftColor: penetration > 50 ? 'var(--color-accent-success)' : penetration > 0 ? 'var(--color-accent-warm)' : 'var(--ws-border)',
      }}>
        <div className="pl2__school-header">
          <h3 className="pl2__school-name">{school.name}</h3>
          {school.conference && <span className="pl2__conf-badge">{school.conference}</span>}
        </div>
        <div className="pl2__school-stats">
          <span>{activeCustomers}/{school.total_greek_orgs || '?'} chapters</span>
          {(hasIfc || hasPhc) && <span className="pl2__council-badge">{hasIfc && 'IFC'}{hasIfc && hasPhc && ' · '}{hasPhc && 'PHC'}</span>}
        </div>
        <div className="pl2__school-footer">
          <span>{totalDeals} deals</span>
          {totalValue > 0 && <span className="pl2__deal-value">{formatCurrency(totalValue)}</span>}
        </div>
      </button>
    );
  };

  /* ─── School Detail ─── */
  const SchoolDetail = ({ school }: { school: School }) => {
    const orgs = school.organizations || [];
    return (
      <div className="pl2__detail-panel">
        <div className="pl2__detail-header">
          <button className="pl2__back-btn" onClick={() => setSelectedSchool(null)}>← Back</button>
          <h2>{school.name}</h2>
          {school.conference && <span className="pl2__conf-badge pl2__conf-badge--lg">{school.conference}</span>}
        </div>
        <div className="pl2__detail-grid">
          {orgs.map(org => (
            <div key={org.id} className="pl2__org-card">
              <div className="pl2__org-header">
                <h4>{org.name}</h4>
                <span className={`pl2__status-dot pl2__status-dot--${org.status}`} />
              </div>
              <span className="pl2__org-type">{org.type}</span>
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
          {orgs.length === 0 && <p className="pl2__empty">No organizations at this school yet.</p>}
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
            <button className="pl2__filter-toggle" onClick={() => setShowFilters(!showFilters)}>
              <Filter size={16} /> Filters
            </button>
          )}
          {(activeTab === 'my-deals' || activeTab === 'all-deals') && (
            <button className="pl2__add-deal-btn" onClick={() => openDeal(null)} title="Add deal">
              <Plus size={16} /> New Deal
            </button>
          )}
        </div>
      )}

      {/* Expanded filters for All Deals */}
      {showFilters && activeTab === 'all-deals' && (
        <div className="pl2__filters">
          <select value={filterStage} onChange={e => setFilterStage(e.target.value)}>
            <option value="all">All Stages</option>
            {Object.entries(STAGE_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.emoji} {v.label}</option>
            ))}
          </select>
          <select value={filterConference} onChange={e => setFilterConference(e.target.value)}>
            <option value="">All Conferences</option>
            {conferences.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            <option value="local">Local</option>
            <option value="council">Council</option>
            <option value="national">National</option>
          </select>
          <select value={filterTemp} onChange={e => setFilterTemp(e.target.value)}>
            <option value="">All Temps</option>
            <option value="hot">🔴 Hot</option>
            <option value="warm">🟡 Warm</option>
            <option value="cold">🔵 Cold</option>
          </select>
          <select value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
            <option value="">All Reps</option>
            {employees.filter(e => ['growth_intern', 'sales_intern', 'founder', 'cofounder'].includes(e.role)).map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
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
                .filter(s => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(school => (
                  <SchoolCard key={school.id} school={school} />
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

      {/* Deal Edit / Create Panel */}
      {panelOpen && (
        <DealEditPanel
          deal={isNewDeal ? null : editingDeal}
          employees={employees}
          schools={schools}
          nationals={nationals}
          onClose={closePanel}
          onSaved={handlePanelSaved}
          onDeleted={handlePanelDeleted}
        />
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
