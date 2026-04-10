'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Building2,
  Users,
  Flame,
  Snowflake,
  Minus,
} from 'lucide-react';
import { useGoogleIntegration } from '../../hooks/useGoogleIntegration';
import { UseWorkspaceDataReturn } from '../../hooks/useWorkspaceData';
import { useAuth } from '@/lib/auth-context';
import { Employee } from '@/lib/supabase';
import dynamic from 'next/dynamic';

// Lazy-load NewDealModal to keep initial bundle small
const NewDealModal = dynamic(
  () => import('@/app/nucleus/pipeline/NewDealModal'),
  { ssr: false }
);

// Lazy-load DealEditPanel
const DealEditPanel = dynamic(
  () => import('@/app/nucleus/pipeline/DealEditPanel'),
  { ssr: false }
);

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface PipelineDeal {
  id: string;
  stage: string;
  temperature?: string | null;
  next_followup?: string | null;
  assigned_to?: string | null;
  organization?: { name?: string; school?: { name?: string } } | null;
  contact?: { name?: string } | null;
  notes?: string | null;
}

interface FullDeal {
  id: string;
  org_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  deal_type: 'local' | 'council' | 'national';
  stage: any;
  value: number;
  temperature: 'hot' | 'warm' | 'cold';
  next_followup: string | null;
  last_touched: string | null;
  last_activity_at: string | null;
  followup_count: number;
  notes: string | null;
  conference: string | null;
  created_at: string;
  organization?: {
    id: string; name: string; type: string;
    school?: { id: string; name: string; conference: string } | null;
    national_org?: { id: string; name: string; abbreviation: string } | null;
  } | null;
  contact?: { id: string; name: string; email: string | null; phone: string | null; role: string | null } | null;
}

interface PanelEmployee { id: string; name: string; role: string; }
interface PanelSchool { id: string; name: string; conference: string | null; }
interface PanelNationalOrg { id: string; name: string; abbreviation: string | null; type: string; }

interface SchoolEntry {
  id: string;
  name: string;
  conference: string | null;
  organizations: { pipeline_deals: { id: string }[] }[];
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  lead:          { label: 'Lead',          color: '#6b7280' },
  demo_booked:   { label: 'Demo Booked',   color: '#2563eb' },
  first_demo:    { label: 'First Demo',    color: '#7c3aed' },
  second_call:   { label: 'Second Call',   color: '#d97706' },
  contract_sent: { label: 'Contract Sent', color: '#ea580c' },
  closed_won:    { label: 'Closed Won',    color: '#16a34a' },
  closed_lost:   { label: 'Closed Lost',   color: '#dc2626' },
  hold_off:      { label: 'Hold Off',      color: '#9ca3af' },
};

function StageBadge({ stage }: { stage: string }) {
  const cfg = STAGE_LABELS[stage] ?? { label: stage, color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: 0.2,
      background: cfg.color + '18',
      color: cfg.color,
      border: `1px solid ${cfg.color}30`,
      whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

function TempIcon({ temp }: { temp?: string | null }) {
  if (temp === 'hot')  return <Flame size={14} color="#ef4444" />;
  if (temp === 'cold') return <Snowflake size={14} color="#3b82f6" />;
  return <Minus size={14} color="#9ca3af" />;
}

function formatFollowup(date?: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (diff < -1) return `${Math.abs(diff)}d ago`;
  if (diff === -1) return 'Yesterday';
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Calendar Widget ────────────────────────────────────────────────────── */

function CalendarWidget({ employeeId }: { employeeId?: string }) {
  const google = useGoogleIntegration(employeeId);

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

  const upcomingEvents = useMemo(() => {
    if (!google.calendarEvents?.length) return [];
    return google.calendarEvents
      .filter(e => {
        const start = e.start.dateTime || e.start.date || '';
        return start.startsWith(todayStr) || start.startsWith(tomorrowStr);
      })
      .sort((a, b) => (a.start.dateTime || a.start.date || '').localeCompare(b.start.dateTime || b.start.date || ''))
      .slice(0, 4);
  }, [google.calendarEvents, todayStr, tomorrowStr]);

  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <div className="idb-card idb-calendar-card">
      <div className="idb-widget-label">CALENDAR</div>
      <div className="idb-calendar-date">
        <span className="idb-date-day">{dayOfWeek}</span>
        <span className="idb-date-full">{monthDay}</span>
      </div>

      {google.calendarLoading ? (
        <div className="idb-empty-state">Loading…</div>
      ) : !google.status?.connected ? (
        <div className="idb-empty-state">
          <Calendar size={16} color="#9ca3af" />
          <button className="idb-connect-btn" onClick={google.connect}>
            Connect Google Calendar
          </button>
        </div>
      ) : upcomingEvents.length === 0 ? (
        <div className="idb-empty-state">
          <Calendar size={16} color="#9ca3af" />
          <span>No events today</span>
        </div>
      ) : (
        <div className="idb-event-list">
          {upcomingEvents.map(e => {
            const isToday = (e.start.dateTime || e.start.date || '').startsWith(todayStr);
            const time = e.start.dateTime
              ? new Date(e.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              : 'All day';
            return (
              <a key={e.id} href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="idb-event-row">
                <span className={`idb-event-day-tag ${isToday ? 'today' : 'tomorrow'}`}>{isToday ? 'Today' : 'Tmrw'}</span>
                <span className="idb-event-time">{time}</span>
                <span className="idb-event-title">{e.summary}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Create Deal Widget ─────────────────────────────────────────────────── */

function CreateDealWidget({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <div className="idb-card idb-create-deal-card">
      <div className="idb-widget-label">PIPELINE</div>
      <h2 className="idb-create-deal-title">New Deal</h2>
      <p className="idb-create-deal-desc">Add a chapter to your pipeline</p>
      <button className="idb-create-btn" onClick={onOpenModal}>
        <Plus size={16} />
        Create Deal
      </button>
    </div>
  );
}

/* ─── Pipeline Widget ────────────────────────────────────────────────────── */

function PipelineWidget({
  currentEmployeeId,
  schoolFilter,
  onClearSchoolFilter,
}: {
  currentEmployeeId?: string;
  schoolFilter?: string | null;
  onClearSchoolFilter: () => void;
}) {
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [employees, setEmployees] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [myDealsOnly, setMyDealsOnly] = useState(false);
  const [sortField, setSortField] = useState<'next_followup' | 'stage' | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Edit panel state
  const [editingDeal, setEditingDeal] = useState<FullDeal | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelEmployees, setPanelEmployees] = useState<PanelEmployee[]>([]);
  const [panelSchools, setPanelSchools] = useState<PanelSchool[]>([]);
  const [panelNationals, setPanelNationals] = useState<PanelNationalOrg[]>([]);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsRes, empRes] = await Promise.all([
        fetch('/api/pipeline/deals'),
        fetch('/api/employees?status=active'),
      ]);
      if (dealsRes.ok) {
        const data = await dealsRes.json();
        setDeals(Array.isArray(data) ? data : []);
      }
      if (empRes.ok) {
        const empData = await empRes.json();
        const list = Array.isArray(empData) ? empData : (empData.data ?? []);
        const map: Record<string, string> = {};
        list.forEach((e: { id: string; name: string }) => { map[e.id] = e.name; });
        setEmployees(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Load panel support data once
  useEffect(() => {
    async function loadPanelData() {
      const [empRes, schoolsRes, natsRes] = await Promise.all([
        fetch('/api/employees?status=active'),
        fetch('/api/pipeline/schools'),
        fetch('/api/pipeline/nationals'),
      ]);
      if (empRes.ok) {
        const d = await empRes.json();
        setPanelEmployees(Array.isArray(d) ? d : (d.data ?? []));
      }
      if (schoolsRes.ok) {
        const d = await schoolsRes.json();
        setPanelSchools(Array.isArray(d) ? d : []);
      }
      if (natsRes.ok) {
        const d = await natsRes.json();
        setPanelNationals(Array.isArray(d) ? d : []);
      }
    }
    loadPanelData();
  }, []);

  useEffect(() => { fetchDeals(); }, [fetchDeals]);

  async function handleRowClick(deal: PipelineDeal) {
    try {
      const res = await fetch(`/api/pipeline/deals/${deal.id}`);
      if (res.ok) {
        const full = await res.json();
        setEditingDeal(full);
        setPanelOpen(true);
      }
    } catch {
      // fallback: open with partial data cast
      setEditingDeal(deal as unknown as FullDeal);
      setPanelOpen(true);
    }
  }

  function closePanel() {
    setPanelOpen(false);
    setEditingDeal(null);
  }

  function handlePanelSaved() {
    closePanel();
    fetchDeals();
  }

  function handlePanelDeleted() {
    closePanel();
    fetchDeals();
  }

  const filtered = useMemo(() => {
    let result = deals;

    // School filter from Schools widget
    if (schoolFilter) {
      result = result.filter(d => d.organization?.school?.name === schoolFilter || (d.organization as any)?.school?.id === schoolFilter);
    }

    // My deals toggle
    if (myDealsOnly && currentEmployeeId) {
      result = result.filter(d => d.assigned_to === currentEmployeeId);
    }

    // Search
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      result = result.filter(d =>
        d.organization?.name?.toLowerCase().includes(s) ||
        d.organization?.school?.name?.toLowerCase().includes(s) ||
        d.contact?.name?.toLowerCase().includes(s) ||
        d.notes?.toLowerCase().includes(s)
      );
    }

    // Sort
    if (sortField === 'next_followup') {
      result = [...result].sort((a, b) => {
        const av = a.next_followup ?? '9999';
        const bv = b.next_followup ?? '9999';
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    } else if (sortField === 'stage') {
      const STAGE_ORDER = ['lead','demo_booked','first_demo','second_call','contract_sent','closed_won','closed_lost','hold_off'];
      result = [...result].sort((a, b) => {
        const ai = STAGE_ORDER.indexOf(a.stage);
        const bi = STAGE_ORDER.indexOf(b.stage);
        return sortAsc ? ai - bi : bi - ai;
      });
    }

    return result;
  }, [deals, search, myDealsOnly, currentEmployeeId, schoolFilter, sortField, sortAsc]);

  function handleSort(field: 'next_followup' | 'stage') {
    if (sortField === field) {
      setSortAsc(a => !a);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  return (
    <div className="idb-card idb-pipeline-card">
      <div className="idb-pipeline-header">
        <div>
          <div className="idb-widget-label">PIPELINE</div>
          <h2 className="idb-pipeline-title">
            All Deals
            {filtered.length > 0 && (
              <span className="idb-deal-count">{filtered.length}</span>
            )}
          </h2>
        </div>

        <div className="idb-pipeline-controls">
          {schoolFilter && (
            <button className="idb-school-filter-tag" onClick={onClearSchoolFilter}>
              {schoolFilter} ✕
            </button>
          )}
          <label className="idb-toggle-label">
            <input
              type="checkbox"
              checked={myDealsOnly}
              onChange={e => setMyDealsOnly(e.target.checked)}
              className="idb-toggle-input"
            />
            <span className="idb-toggle-track">
              <span className="idb-toggle-thumb" />
            </span>
            <span className="idb-toggle-text">My Deals</span>
          </label>
          <div className="idb-search-wrap">
            <Search size={14} className="idb-search-icon" />
            <input
              className="idb-search-input"
              placeholder="Search deals…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="idb-table-loading">Loading deals…</div>
      ) : filtered.length === 0 ? (
        <div className="idb-table-empty">No deals found{search ? ` for "${search}"` : ''}.</div>
      ) : (
        <div className="idb-table-wrap">
          <table className="idb-table">
            <thead>
              <tr>
                <th className="idb-th">Org</th>
                <th className="idb-th">School</th>
                <th className="idb-th idb-th--sortable" onClick={() => handleSort('stage')}>
                  Stage {sortField === 'stage' ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
                </th>
                <th className="idb-th">Temp</th>
                <th className="idb-th idb-th--sortable" onClick={() => handleSort('next_followup')}>
                  Next Followup {sortField === 'next_followup' ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
                </th>
                <th className="idb-th">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(deal => (
                <tr
                  key={deal.id}
                  className="idb-tr"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleRowClick(deal)}
                >
                  <td className="idb-td idb-td--org">{deal.organization?.name || deal.contact?.name || '—'}</td>
                  <td className="idb-td idb-td--school">{deal.organization?.school?.name || '—'}</td>
                  <td className="idb-td"><StageBadge stage={deal.stage} /></td>
                  <td className="idb-td idb-td--temp"><TempIcon temp={deal.temperature} /></td>
                  <td className="idb-td idb-td--followup">
                    <span className={deal.next_followup && new Date(deal.next_followup) < new Date() ? 'idb-overdue' : ''}>
                      {formatFollowup(deal.next_followup)}
                    </span>
                  </td>
                  <td className="idb-td idb-td--assigned">{deal.assigned_to ? (employees[deal.assigned_to] || deal.assigned_to.slice(0, 8) + '…') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Deal Edit Panel */}
      {panelOpen && editingDeal && (
        <DealEditPanel
          deal={editingDeal}
          employees={panelEmployees}
          schools={panelSchools}
          nationals={panelNationals}
          onClose={closePanel}
          onSaved={handlePanelSaved}
          onDeleted={handlePanelDeleted}
        />
      )}
    </div>
  );
}

/* ─── Schools Widget ─────────────────────────────────────────────────────── */

function SchoolsWidget({
  activeSchool,
  onSelectSchool,
}: {
  activeSchool?: string | null;
  onSelectSchool: (schoolName: string | null) => void;
}) {
  const [schools, setSchools] = useState<SchoolEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSchools() {
      try {
        const res = await fetch('/api/pipeline/schools');
        if (res.ok) {
          const data = await res.json();
          setSchools(Array.isArray(data) ? data : []);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSchools();
  }, []);

  return (
    <div className="idb-card idb-schools-card">
      <div className="idb-widget-label">SCHOOLS</div>
      <h2 className="idb-schools-title">
        <Building2 size={15} />
        Active Schools
      </h2>

      {loading ? (
        <div className="idb-empty-state">Loading…</div>
      ) : schools.length === 0 ? (
        <div className="idb-empty-state">No schools yet</div>
      ) : (
        <div className="idb-schools-list">
          {schools.map(school => {
            const dealCount = school.organizations.reduce((s, o) => s + o.pipeline_deals.length, 0);
            const chapterCount = school.organizations.length;
            const isActive = activeSchool === school.id || activeSchool === school.name;
            return (
              <button
                key={school.id}
                className={`idb-school-row ${isActive ? 'idb-school-row--active' : ''}`}
                onClick={() => onSelectSchool(isActive ? null : school.name)}
              >
                <span className="idb-school-name">{school.name}</span>
                <div className="idb-school-meta">
                  <span className="idb-school-pill">
                    <Users size={11} /> {chapterCount} org{chapterCount !== 1 ? 's' : ''}
                  </span>
                  <span className="idb-school-pill">
                    {dealCount} deal{dealCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────────────────────── */

interface InternDashboardProps {
  data: UseWorkspaceDataReturn;
  teamMembers: Employee[];
}

export function InternDashboard({ data }: InternDashboardProps) {
  const { currentEmployee } = data;
  const { profile } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  const [resolvedEmployeeId, setResolvedEmployeeId] = useState<string | undefined>(currentEmployee?.id);

  // Always resolve employee ID by auth_user_id — don't trust currentEmployee fallback
  useEffect(() => {
    if (!profile?.id) return;
    fetch(`/api/employees?auth_user_id=${profile.id}`)
      .then(r => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : ((data as any).data ?? []);
        if (arr.length > 0) setResolvedEmployeeId(arr[0].id);
        else if (currentEmployee?.id) setResolvedEmployeeId(currentEmployee.id);
      })
      .catch(() => { if (currentEmployee?.id) setResolvedEmployeeId(currentEmployee.id); });
  }, [profile?.id, currentEmployee?.id]);

  return (
    <div className="idb-root">
      {/* Page title */}
      <div className="idb-page-header">
        <h1 className="idb-page-title">Dashboard</h1>
        <p className="idb-page-sub">Your pipeline, at a glance</p>
      </div>

      {/* Top row: Calendar (1/4) + Create Deal (3/4) */}
      <div className="idb-top-row">
        <CalendarWidget employeeId={currentEmployee?.id} />
        <CreateDealWidget onOpenModal={() => setModalOpen(true)} />
      </div>

      {/* Middle: full-width Pipeline */}
      <PipelineWidget
        currentEmployeeId={resolvedEmployeeId}
        schoolFilter={schoolFilter}
        onClearSchoolFilter={() => setSchoolFilter(null)}
      />

      {/* Bottom: Schools */}
      <SchoolsWidget
        activeSchool={schoolFilter}
        onSelectSchool={setSchoolFilter}
      />

      {/* New Deal Modal */}
      {modalOpen && (
        <NewDealModal
          onClose={() => setModalOpen(false)}
          onCreated={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
