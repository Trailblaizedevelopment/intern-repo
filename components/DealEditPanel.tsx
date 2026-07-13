'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Trash2, Building2, Phone, Mail, Plus, Clock, CheckCircle2, User, DollarSign } from 'lucide-react';
import { STAGE_CONFIG, DealStage } from '@/lib/supabase';

/* ─── Types ─── */
interface DealContact {
  id: string;
  is_primary: boolean;
  contact: { id: string; name: string; email: string | null; phone: string | null; role: string | null } | null;
}

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
  last_activity_at: string | null;
  followup_count: number;
  notes: string | null;
  conference: string | null;
  created_at: string;
  updated_at?: string | null;
  organization?: {
    id: string; name: string; type: string;
    school?: { id: string; name: string; conference: string } | null;
    national_org?: { id: string; name: string; abbreviation: string } | null;
  } | null;
  contact?: { id: string; name: string; email: string | null; phone: string | null; role: string | null } | null;
  deal_contacts?: DealContact[];
}

interface Employee { id: string; name: string; role: string; }
interface School { id: string; name: string; conference: string | null; }
interface NationalOrg { id: string; name: string; abbreviation: string | null; type: string; }

interface Props {
  deal: PipelineDeal | null; // null = create mode
  employees: Employee[];
  schools: School[];
  nationals: NationalOrg[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

const STAGES: DealStage[] = ['lead', 'demo_booked', 'first_demo', 'second_call', 'timing', 'contract_sent', 'closed_won', 'closed_lost', 'hold_off'];

const CONTACT_ROLES = [
  { value: 'president', label: 'President' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'fsl_director', label: 'FSL Director' },
  { value: 'nationals_rep', label: 'Nationals Rep' },
  { value: 'alumni_chair', label: 'Alumni Chair' },
  { value: 'board_member', label: 'Board Member' },
  { value: 'other', label: 'Other' },
];

const TEMP_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  hot:  { bg: '#ef444420', border: '#ef4444', color: '#ef4444' },
  warm: { bg: '#f59e0b20', border: '#f59e0b', color: '#f59e0b' },
  cold: { bg: '#6b728020', border: '#6b7280', color: '#6b7280' },
};

const CATEGORY_LABELS: Record<string, string> = {
  greek: 'Greek Life',
  country_clubs: 'Country Club',
  professional_associations: 'Professional / Chamber',
  sports: 'Sports Team',
  alumni_associations: 'Alumni Association',
};

function formatCurrency(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US')}`;
}

function formatFullDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ClosedWonOverview({
  deal,
  employees,
  dealContacts,
  activities,
  activitiesError,
  timeAgo,
  activityTypes,
}: {
  deal: PipelineDeal;
  employees: Employee[];
  dealContacts: DealContact[];
  activities: { id: string; type: string; outcome: string | null; created_at: string; created_by: string | null }[];
  activitiesError: string | null;
  timeAgo: (iso: string) => string;
  activityTypes: { key: string; emoji: string; label: string }[];
}) {
  const assignedName = employees.find(e => e.id === deal.assigned_to)?.name || 'Unassigned';
  const conference = deal.conference || deal.organization?.school?.conference || '—';
  const category = CATEGORY_LABELS[(deal as { category?: string }).category || 'greek'] || 'Greek Life';
  const mrr = Math.round((deal.value || 0) / 12);
  const tempStyle = TEMP_STYLE[deal.temperature] || TEMP_STYLE.warm;
  const closedAt = deal.updated_at || deal.last_activity_at || deal.last_touched;

  return (
    <>
      <div
        style={{
          margin: '0 0 20px',
          padding: '14px 16px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
          border: '1px solid #6ee7b7',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '9999px',
              background: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={20} color="#059669" />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#047857' }}>
              Closed Won
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.875rem', fontWeight: 600, color: '#065f46' }}>
              {closedAt ? `Closed ${formatFullDate(closedAt)}` : 'Deal successfully closed'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Contract Value', value: formatCurrency(deal.value), icon: DollarSign },
          { label: 'MRR', value: formatCurrency(mrr), icon: DollarSign },
        ].map(stat => (
          <div
            key={stat.label}
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>
              {stat.label}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '1.125rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="pl2__edit-section">
        <h3 className="pl2__edit-section-title">Deal Summary</h3>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '4px 14px' }}>
          {[
            { label: 'Type', value: deal.deal_type.charAt(0).toUpperCase() + deal.deal_type.slice(1) },
            {
              label: 'Temperature',
              value: (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 10px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600,
                  background: tempStyle.bg, border: `1px solid ${tempStyle.border}`, color: tempStyle.color,
                }}>
                  {deal.temperature.charAt(0).toUpperCase() + deal.temperature.slice(1)}
                </span>
              ),
            },
            { label: 'Conference', value: conference },
            { label: 'Category', value: category },
            { label: 'Assigned To', value: assignedName },
            { label: 'Created', value: formatFullDate(deal.created_at) },
            { label: 'Last Updated', value: formatFullDate(closedAt) },
          ].map((row, index, arr) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 0',
                borderBottom: index < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{row.label}</span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827', textAlign: 'right' }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {(dealContacts.length > 0 || deal.contact) && (
        <div className="pl2__edit-section">
          <h3 className="pl2__edit-section-title">Contacts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(dealContacts.length > 0 ? dealContacts : deal.contact ? [{ id: '', is_primary: true, contact: deal.contact }] : []).map((dc, idx) => (
              <div
                key={dc.contact?.id || idx}
                style={{
                  padding: '12px 14px',
                  borderRadius: 10,
                  background: '#f9fafb',
                  border: `1px solid ${dc.is_primary ? '#6ee7b7' : '#e5e7eb'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <User size={14} color="#6b7280" />
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{dc.contact?.name || 'Unknown'}</span>
                  {dc.is_primary && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 9999, background: '#ecfdf5', color: '#047857' }}>
                      Primary
                    </span>
                  )}
                </div>
                {dc.contact?.role && (
                  <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: '#6b7280', textTransform: 'capitalize' }}>
                    {dc.contact.role.replace(/_/g, ' ')}
                  </p>
                )}
                {dc.contact?.email && (
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Mail size={11} /> {dc.contact.email}
                  </p>
                )}
                {dc.contact?.phone && (
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Phone size={11} /> {dc.contact.phone}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {deal.notes?.trim() && (
        <div className="pl2__edit-section">
          <h3 className="pl2__edit-section-title">Notes</h3>
          <div style={{
            padding: '12px 14px', borderRadius: 10, background: '#f9fafb',
            border: '1px solid #e5e7eb', fontSize: '0.875rem', color: '#374151', lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}>
            {deal.notes}
          </div>
        </div>
      )}

      <div className="pl2__edit-section">
        <h3 className="pl2__edit-section-title">Activity History</h3>
        {activitiesError ? (
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', padding: '8px 0' }}>{activitiesError}</div>
        ) : activities.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: '#9ca3af', padding: '8px 0' }}>No activity logged.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activities.map(act => {
              const typeInfo = activityTypes.find(t => t.key === act.type);
              return (
                <div
                  key={act.id}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '10px 12px', borderRadius: 10,
                    background: '#f9fafb', border: '1px solid #e5e7eb',
                  }}
                >
                  <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{typeInfo?.emoji || '📝'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', color: '#111827' }}>{act.outcome || '—'}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> {timeAgo(act.created_at)}
                      {act.created_by && <span>· {act.created_by}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export default function DealEditPanel({ deal, employees, schools, nationals, onClose, onSaved, onDeleted }: Props) {
  const isNew = !deal;
  const isClosedWon = !isNew && deal?.stage === 'closed_won';

  /* ─── State ─── */
  const [stage, setStage] = useState<DealStage>(deal?.stage || 'lead');
  const [dealType, setDealType] = useState<'local' | 'council' | 'national'>(deal?.deal_type || 'local');
  const [temperature, setTemperature] = useState<'hot' | 'warm' | 'cold'>(deal?.temperature || 'warm');
  const [value, setValue] = useState(deal?.value?.toString() || '');
  const [assignedTo, setAssignedTo] = useState(deal?.assigned_to || '');
  const [category, setCategory] = useState((deal as any)?.category || 'greek');
  const [conference, setConference] = useState(deal?.conference || '');
  const [notes, setNotes] = useState(deal?.notes || '');
  const [nextFollowup, setNextFollowup] = useState(deal?.next_followup || '');

  // Contact fields (for new deal creation)
  const [contactName, setContactName] = useState(deal?.contact?.name || '');
  const [contactPhone, setContactPhone] = useState(deal?.contact?.phone || '');
  const [contactEmail, setContactEmail] = useState(deal?.contact?.email || '');
  const [contactRole, setContactRole] = useState(deal?.contact?.role || 'president');
  const [advisorName, setAdvisorName] = useState((deal as any)?.advisor_name || '');
  const [advisorEmail, setAdvisorEmail] = useState((deal as any)?.advisor_email || '');
  const [advisorPhone, setAdvisorPhone] = useState((deal as any)?.advisor_phone || '');
  const [advisorMet, setAdvisorMet] = useState((deal as any)?.advisor_met ?? false);

  // Multi-contact state (for existing deals)
  const [dealContacts, setDealContacts] = useState<DealContact[]>(deal?.deal_contacts || []);
  const [showAddContact, setShowAddContact] = useState(false);
  const [addContactSearch, setAddContactSearch] = useState('');
  const [orgContacts, setOrgContacts] = useState<{ id: string; name: string; email: string | null; phone: string | null; role: string | null }[]>([]);
  const [addContactLoading, setAddContactLoading] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRole, setNewContactRole] = useState('president');
  const [useNewContact, setUseNewContact] = useState(false);

  // New deal org fields
  const [orgName, setOrgName] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [nationalId, setNationalId] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Activity Log ───
  type ActivityType = 'call' | 'text' | 'email' | 'meeting' | 'note';
  interface Activity { id: string; type: ActivityType; outcome: string | null; created_at: string; created_by: string | null; }
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<ActivityType>('call');
  const [logOutcome, setLogOutcome] = useState('');
  const [loggingActivity, setLoggingActivity] = useState(false);

  const loadActivities = useCallback(async () => {
    if (!deal) return;
    try {
      const res = await fetch(`/api/pipeline/deals/${deal.id}/activities`);
      if (!res.ok) {
        if (res.status === 500) { setActivitiesError('Activity log coming soon — run migration to enable'); return; }
        setActivitiesError('Failed to load activity log');
        return;
      }
      const data = await res.json();
      setActivities(Array.isArray(data) ? data : []);
    } catch {
      setActivitiesError('Activity log coming soon — run migration to enable');
    }
  }, [deal]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  // Reload deal contacts from the deal prop when it changes (after saves)
  useEffect(() => {
    setDealContacts(deal?.deal_contacts || []);
  }, [deal]);

  async function loadOrgContacts() {
    if (!deal?.org_id) return;
    setAddContactLoading(true);
    try {
      const res = await fetch(`/api/pipeline/contacts?org_id=${deal.org_id}`);
      if (res.ok) setOrgContacts(await res.json());
    } catch { /* graceful */ }
    finally { setAddContactLoading(false); }
  }

  async function removeContact(contactId: string) {
    if (!deal) return;
    await fetch(`/api/pipeline/deals/${deal.id}/contacts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId }),
    });
    setDealContacts(prev => prev.filter(dc => dc.contact?.id !== contactId));
  }

  async function setPrimaryContact(contactId: string) {
    if (!deal) return;
    await fetch(`/api/pipeline/deals/${deal.id}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId, is_primary: true }),
    });
    setDealContacts(prev => prev.map(dc => ({
      ...dc,
      is_primary: dc.contact?.id === contactId,
    })));
  }

  async function addExistingContact(contactId: string) {
    if (!deal) return;
    const isPrimary = dealContacts.length === 0;
    const res = await fetch(`/api/pipeline/deals/${deal.id}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId, is_primary: isPrimary }),
    });
    if (res.ok) {
      const contact = orgContacts.find(c => c.id === contactId);
      if (contact) {
        setDealContacts(prev => [
          ...prev.map(dc => isPrimary ? { ...dc, is_primary: false } : dc),
          { id: '', is_primary: isPrimary, contact },
        ]);
      }
    }
    setShowAddContact(false);
    setAddContactSearch('');
  }

  async function addNewContact() {
    if (!deal || !newContactName.trim()) return;
    // 1. Create contact
    const cRes = await fetch('/api/pipeline/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: deal.org_id,
        name: newContactName.trim(),
        email: newContactEmail.trim() || null,
        role: newContactRole || 'president',
      }),
    });
    if (!cRes.ok) return;
    const created = await cRes.json();
    // 2. Link to deal
    const isPrimary = dealContacts.length === 0;
    await fetch(`/api/pipeline/deals/${deal.id}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: created.id, is_primary: isPrimary }),
    });
    setDealContacts(prev => [
      ...prev.map(dc => isPrimary ? { ...dc, is_primary: false } : dc),
      { id: '', is_primary: isPrimary, contact: { id: created.id, name: created.name, email: created.email, phone: created.phone, role: created.role } },
    ]);
    setShowAddContact(false);
    setNewContactName('');
    setNewContactEmail('');
    setNewContactRole('president');
    setUseNewContact(false);
  }

  async function submitActivity() {
    if (!deal || !logOutcome.trim()) return;
    setLoggingActivity(true);
    try {
      const res = await fetch(`/api/pipeline/deals/${deal.id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: logType, outcome: logOutcome.trim() }),
      });
      if (res.ok) {
        setLogOutcome('');
        setShowLogForm(false);
        loadActivities();
      }
    } catch { /* graceful */ }
    finally { setLoggingActivity(false); }
  }

  const ACTIVITY_TYPES: { key: ActivityType; emoji: string; label: string }[] = [
    { key: 'call',    emoji: '📞', label: 'Call'    },
    { key: 'text',    emoji: '💬', label: 'Text'    },
    { key: 'email',   emoji: '📧', label: 'Email'   },
    { key: 'meeting', emoji: '🤝', label: 'Meeting' },
    { key: 'note',    emoji: '📝', label: 'Note'    },
  ];

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const salesReps = employees.filter(e =>
    ['founder', 'cofounder', 'growth_intern', 'sales_intern'].includes(e.role)
  );

  /* ─── Save ─── */
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        // 1. Create org
        const orgRes = await fetch('/api/pipeline/orgs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: orgName.trim() || 'Unknown',
            school_id: schoolId || null,
            national_org_id: nationalId || null,
            type: dealType === 'council' ? 'ifc' : 'chapter',
            status: 'prospect',
          }),
        });
        if (!orgRes.ok) throw new Error('Failed to create org');
        const org = await orgRes.json();

        // 2. Create contact (optional)
        let contactId: string | null = null;
        if (contactName.trim()) {
          const cRes = await fetch('/api/pipeline/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              org_id: org.id,
              name: contactName.trim(),
              phone: contactPhone.trim() || null,
              email: contactEmail.trim() || null,
              role: contactRole || 'president',
            }),
          });
          if (cRes.ok) {
            const contact = await cRes.json();
            contactId = contact.id;
          }
        }

        // 3. Create deal
        const dRes = await fetch('/api/pipeline/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: org.id,
            contact_id: contactId,
            deal_type: dealType,
            stage,
            value: parseInt(value) || 0,
            temperature,
            assigned_to: assignedTo || null,
            conference: conference.trim() || null,
            notes: notes.trim() || null,
            next_followup: nextFollowup || null,
            category,
            last_touched: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          }),
        });
        if (!dRes.ok) throw new Error('Failed to create deal');
      } else {
        // Update deal
        const dRes = await fetch(`/api/pipeline/deals/${deal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage,
            deal_type: dealType,
            temperature,
            value: parseInt(value) || 0,
            assigned_to: assignedTo || null,
            conference: conference.trim() || null,
            notes: notes.trim() || null,
            next_followup: nextFollowup || null,
            category,
            last_touched: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
            advisor_name: advisorName.trim() || null,
            advisor_email: advisorEmail.trim() || null,
            advisor_phone: advisorPhone.trim() || null,
            advisor_met: advisorMet,
          }),
        });
        if (!dRes.ok) throw new Error('Failed to update deal');

        // Update contact if exists
        if (deal.contact?.id) {
          await fetch(`/api/pipeline/contacts/${deal.contact.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: contactName.trim() || deal.contact.name,
              phone: contactPhone.trim() || null,
              email: contactEmail.trim() || null,
              role: contactRole || null,
            }),
          });
        }
      }

      onSaved();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  /* ─── Delete ─── */
  async function handleDelete() {
    if (!deal) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await fetch(`/api/pipeline/deals/${deal.id}`, { method: 'DELETE' });
    setDeleting(false);
    onDeleted();
  }

  /* ─── Render ─── */
  return (
    <>
      <div className="pl2__overlay" onClick={onClose} />

      <div className="pl2__edit-panel">
        {/* Header */}
        <div className="pl2__edit-header">
          <div className="pl2__edit-header-info">
            <h2>{isNew ? 'New Deal' : (deal?.organization?.name || 'Edit Deal')}</h2>
            {!isNew && deal?.organization?.school && (
              <span className="pl2__edit-subhead">
                <Building2 size={11} />
                {deal.organization.school.name}
                {deal.organization.school.conference && (
                  <span className="pl2__conf-badge">{deal.organization.school.conference}</span>
                )}
              </span>
            )}
            {isClosedWon && (
              <span style={{ display: 'block', marginTop: 4, fontSize: '0.75rem', color: '#6b7280' }}>
                Read-only overview
              </span>
            )}
          </div>
          <button className="pl2__edit-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="pl2__edit-body">
          {isClosedWon && deal ? (
            <ClosedWonOverview
              deal={deal}
              employees={employees}
              dealContacts={dealContacts}
              activities={activities}
              activitiesError={activitiesError}
              timeAgo={timeAgo}
              activityTypes={ACTIVITY_TYPES}
            />
          ) : (
          <>

          {/* ── New Deal: Org info ── */}
          {isNew && (
            <div className="pl2__edit-section">
              <h3 className="pl2__edit-section-title">Organization</h3>
              <div className="pl2__edit-field">
                <label>Chapter / Org Name</label>
                <input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="e.g. Alabama SAE"
                  autoFocus
                />
              </div>
              <div className="pl2__edit-row">
                <div className="pl2__edit-field">
                  <label>School</label>
                  <select value={schoolId} onChange={e => setSchoolId(e.target.value)}>
                    <option value="">No school / TBD</option>
                    {schools.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="pl2__edit-field">
                  <label>National Org</label>
                  <select value={nationalId} onChange={e => setNationalId(e.target.value)}>
                    <option value="">None</option>
                    {nationals.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.name}{n.abbreviation ? ` (${n.abbreviation})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── Stage ── */}
          <div className="pl2__edit-section">
            <h3 className="pl2__edit-section-title">Stage</h3>
            <div className="pl2__stage-picker">
              {STAGES.map(s => {
                const cfg = STAGE_CONFIG[s];
                const isActive = stage === s;
                return (
                  <button
                    key={s}
                    className="pl2__stage-pick-btn"
                    style={isActive ? {
                      background: cfg.color + '22',
                      borderColor: cfg.color,
                      color: cfg.color,
                    } : {}}
                    onClick={() => setStage(s)}
                  >
                    {cfg.emoji} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Deal Details ── */}
          <div className="pl2__edit-section">
            <h3 className="pl2__edit-section-title">Deal Details</h3>

            <div className="pl2__edit-row">
              <div className="pl2__edit-field">
                <label>Type</label>
                <div className="pl2__pill-group">
                  {(['local', 'council', 'national'] as const).map(t => (
                    <button
                      key={t}
                      className={`pl2__pill ${dealType === t ? 'pl2__pill--active' : ''}`}
                      onClick={() => setDealType(t)}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pl2__edit-field">
                <label>Temperature</label>
                <div className="pl2__pill-group">
                  {(['hot', 'warm', 'cold'] as const).map(t => {
                    const ts = TEMP_STYLE[t];
                    return (
                      <button
                        key={t}
                        className="pl2__pill"
                        style={temperature === t ? { background: ts.bg, borderColor: ts.border, color: ts.color } : {}}
                        onClick={() => setTemperature(t)}
                      >
                        {t === 'hot' ? '🔴' : t === 'warm' ? '🟡' : '🔵'}{' '}
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pl2__edit-row">
              <div className="pl2__edit-field">
                <label>Value ($)</label>
                <input
                  type="number"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="3588"
                />
              </div>
              <div className="pl2__edit-field">
                <label>Conference</label>
                <input
                  value={conference}
                  onChange={e => setConference(e.target.value)}
                  placeholder="SEC, Big 10..."
                />
              </div>
            </div>

            <div className="pl2__edit-row">
              <div className="pl2__edit-field">
                <label>Assigned To</label>
                <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                  <option value="">Unassigned</option>
                  {salesReps.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pl2__edit-row">
              <div className="pl2__edit-field">
                <label>Category</label>
                <select value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="greek">🏙 Greek Life</option>
                  <option value="country_clubs">⛳ Country Club</option>
                  <option value="professional_associations">🏢 Professional / Chamber</option>
                  <option value="sports">⚽ Sports Team</option>
                  <option value="alumni_associations">🎓 Alumni Association</option>
                </select>
              </div>
              <div className="pl2__edit-field">
                <label>Next Follow-up</label>
                <input
                  type="date"
                  value={nextFollowup}
                  onChange={e => setNextFollowup(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Contact ── */}
          <div className="pl2__edit-section">
            <h3 className="pl2__edit-section-title">Contact</h3>

            {/* New deal: single contact form */}
            {isNew && (
              <>
                <div className="pl2__edit-field">
                  <label>Name</label>
                  <input
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    placeholder="John Smith"
                  />
                </div>
                <div className="pl2__edit-row">
                  <div className="pl2__edit-field">
                    <label><Phone size={11} /> Phone</label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={e => setContactPhone(e.target.value)}
                      placeholder="+1 555 000 0000"
                    />
                  </div>
                  <div className="pl2__edit-field">
                    <label><Mail size={11} /> Email</label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      placeholder="john@school.edu"
                    />
                  </div>
                </div>
                <div className="pl2__edit-field">
                  <label>Role</label>
                  <select value={contactRole} onChange={e => setContactRole(e.target.value)}>
                    {CONTACT_ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Existing deal: multi-contact list */}
            {!isNew && (
              <>
                {/* Contact list */}
                {dealContacts.length === 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#9ca3af)', padding: '4px 0 8px' }}>
                    No contacts linked yet.
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {dealContacts.map((dc, idx) => (
                    <div key={dc.contact?.id || idx} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10,
                      background: 'var(--ws-bg,#f9fafb)',
                      border: `1.5px solid ${dc.is_primary ? '#C9A84C' : 'var(--ws-border,#e5e7eb)'}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{dc.contact?.name || 'Unknown'}</span>
                          {dc.is_primary && (
                            <span style={{
                              fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px',
                              borderRadius: 10, background: '#C9A84C22', color: '#C9A84C',
                            }}>⭐ Primary</span>
                          )}
                        </div>
                        {dc.contact?.role && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--ws-text-secondary,#6b7280)', marginTop: 1 }}>
                            {dc.contact.role.replace('_', ' ')}
                          </div>
                        )}
                        {dc.contact?.email && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--ws-text-secondary,#6b7280)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                            <Mail size={10} /> {dc.contact.email}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {!dc.is_primary && (
                          <button
                            onClick={() => dc.contact && setPrimaryContact(dc.contact.id)}
                            title="Set as primary"
                            style={{
                              padding: '4px 8px', borderRadius: 6, fontSize: '0.72rem',
                              border: '1px solid var(--ws-border,#e5e7eb)',
                              background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                              color: 'var(--ws-text-secondary,#6b7280)',
                            }}
                          >
                            Set primary
                          </button>
                        )}
                        <button
                          onClick={() => dc.contact && removeContact(dc.contact.id)}
                          title="Remove contact"
                          style={{
                            padding: '4px 6px', borderRadius: 6,
                            border: '1px solid var(--ws-border,#e5e7eb)',
                            background: 'none', cursor: 'pointer',
                            color: '#ef4444', fontSize: '0.8rem', lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add contact section */}
                {!showAddContact ? (
                  <button
                    onClick={() => { setShowAddContact(true); loadOrgContacts(); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '7px 12px', borderRadius: 8, fontSize: '0.8rem',
                      border: '1.5px dashed var(--ws-border,#e5e7eb)',
                      background: 'none', cursor: 'pointer', color: 'var(--ws-text-secondary,#6b7280)',
                      fontWeight: 500, width: '100%', justifyContent: 'center',
                    }}
                  >
                    <Plus size={13} /> Add Contact
                  </button>
                ) : (
                  <div style={{
                    background: 'var(--ws-bg,#f9fafb)', borderRadius: 10,
                    padding: 12, border: '1px solid var(--ws-border,#e5e7eb)',
                  }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button
                        onClick={() => setUseNewContact(false)}
                        style={{
                          flex: 1, padding: '6px', borderRadius: 6, fontSize: '0.8rem',
                          border: `1.5px solid ${!useNewContact ? '#C9A84C' : 'var(--ws-border,#e5e7eb)'}`,
                          background: !useNewContact ? '#C9A84C18' : 'none',
                          color: !useNewContact ? '#C9A84C' : 'inherit', cursor: 'pointer', fontWeight: 500,
                        }}
                      >Existing</button>
                      <button
                        onClick={() => setUseNewContact(true)}
                        style={{
                          flex: 1, padding: '6px', borderRadius: 6, fontSize: '0.8rem',
                          border: `1.5px solid ${useNewContact ? '#C9A84C' : 'var(--ws-border,#e5e7eb)'}`,
                          background: useNewContact ? '#C9A84C18' : 'none',
                          color: useNewContact ? '#C9A84C' : 'inherit', cursor: 'pointer', fontWeight: 500,
                        }}
                      >New</button>
                    </div>

                    {!useNewContact ? (
                      <>
                        <input
                          value={addContactSearch}
                          onChange={e => setAddContactSearch(e.target.value)}
                          placeholder="Search contacts..."
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: '0.85rem',
                            border: '1.5px solid var(--ws-border,#e5e7eb)',
                            background: 'var(--ws-surface,#fff)', boxSizing: 'border-box', marginBottom: 6,
                          }}
                        />
                        {addContactLoading ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#9ca3af)', padding: '4px 0' }}>Loading...</div>
                        ) : (
                          <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {orgContacts
                              .filter(c =>
                                !dealContacts.some(dc => dc.contact?.id === c.id) &&
                                (!addContactSearch || c.name.toLowerCase().includes(addContactSearch.toLowerCase()))
                              )
                              .map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => addExistingContact(c.id)}
                                  style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                    padding: '7px 10px', borderRadius: 7,
                                    border: '1px solid var(--ws-border,#e5e7eb)',
                                    background: 'var(--ws-surface,#fff)', cursor: 'pointer',
                                    textAlign: 'left',
                                  }}
                                >
                                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.name}</span>
                                  {c.role && <span style={{ fontSize: '0.75rem', color: 'var(--ws-text-secondary,#6b7280)' }}>{c.role.replace('_', ' ')}</span>}
                                </button>
                              ))}
                            {orgContacts.filter(c =>
                              !dealContacts.some(dc => dc.contact?.id === c.id) &&
                              (!addContactSearch || c.name.toLowerCase().includes(addContactSearch.toLowerCase()))
                            ).length === 0 && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#9ca3af)' }}>No matching contacts</div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input
                          value={newContactName}
                          onChange={e => setNewContactName(e.target.value)}
                          placeholder="Name *"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: '0.85rem', border: '1.5px solid var(--ws-border,#e5e7eb)', background: 'var(--ws-surface,#fff)', boxSizing: 'border-box' }}
                        />
                        <input
                          value={newContactEmail}
                          onChange={e => setNewContactEmail(e.target.value)}
                          placeholder="Email"
                          type="email"
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: '0.85rem', border: '1.5px solid var(--ws-border,#e5e7eb)', background: 'var(--ws-surface,#fff)', boxSizing: 'border-box' }}
                        />
                        <select
                          value={newContactRole}
                          onChange={e => setNewContactRole(e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: '0.85rem', border: '1.5px solid var(--ws-border,#e5e7eb)', background: 'var(--ws-surface,#fff)' }}
                        >
                          {CONTACT_ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={addNewContact}
                          disabled={!newContactName.trim()}
                          style={{
                            padding: '8px', borderRadius: 7, background: '#C9A84C', border: 'none',
                            color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                            opacity: newContactName.trim() ? 1 : 0.5,
                          }}
                        >
                          Create &amp; Add
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => { setShowAddContact(false); setAddContactSearch(''); setUseNewContact(false); }}
                      style={{
                        marginTop: 8, width: '100%', padding: '6px', borderRadius: 7,
                        border: '1px solid var(--ws-border,#e5e7eb)', background: 'none',
                        cursor: 'pointer', fontSize: '0.8rem', color: 'var(--ws-text-secondary,#6b7280)',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Advisor ── */}
          <div className="pl2__edit-section">
            <h3 className="pl2__edit-section-title">Advisor</h3>
            <div className="pl2__edit-field">
              <label>Advisor Name</label>
              <input
                value={advisorName}
                onChange={e => setAdvisorName(e.target.value)}
                placeholder="Dr. Jane Smith"
              />
            </div>
            <div className="pl2__edit-row">
              <div className="pl2__edit-field">
                <label><Phone size={11} /> Phone</label>
                <input
                  type="tel"
                  value={advisorPhone}
                  onChange={e => setAdvisorPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                />
              </div>
              <div className="pl2__edit-field">
                <label><Mail size={11} /> Email</label>
                <input
                  type="email"
                  value={advisorEmail}
                  onChange={e => setAdvisorEmail(e.target.value)}
                  placeholder="advisor@school.edu"
                />
              </div>
            </div>
            <div className="pl2__edit-field" style={{ marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={advisorMet}
                  onChange={e => setAdvisorMet(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#C9A84C' }}
                />
                <span>Met with advisor</span>
              </label>
            </div>
          </div>

          {/* ── Notes ── */}
          <div className="pl2__edit-section">
            <h3 className="pl2__edit-section-title">Notes</h3>
            <textarea
              className="pl2__notes-input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about this deal..."
              rows={4}
            />
          </div>

          {/* ── Activity Log ── */}
          {!isNew && (
            <div className="pl2__edit-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 className="pl2__edit-section-title" style={{ margin: 0 }}>Activity Log</h3>
                <button
                  onClick={() => setShowLogForm(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px', borderRadius: 8,
                    background: '#C9A84C', border: 'none', color: '#fff',
                    fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Plus size={13} /> Log Activity
                </button>
              </div>

              {showLogForm && (
                <div style={{ background: 'var(--ws-bg,#f9fafb)', borderRadius: 10, padding: 12, marginBottom: 10, border: '1px solid var(--ws-border,#e5e7eb)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {ACTIVITY_TYPES.map(at => (
                      <button
                        key={at.key}
                        onClick={() => setLogType(at.key)}
                        style={{
                          padding: '5px 10px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500,
                          border: `1.5px solid ${logType === at.key ? '#C9A84C' : 'var(--ws-border,#e5e7eb)'}`,
                          background: logType === at.key ? '#C9A84C18' : 'var(--ws-surface,#fff)',
                          color: logType === at.key ? '#C9A84C' : 'inherit', cursor: 'pointer',
                        }}
                      >
                        {at.emoji} {at.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={logOutcome}
                    onChange={e => setLogOutcome(e.target.value)}
                    placeholder="What happened? Add notes…"
                    rows={2}
                    style={{
                      width: '100%', padding: '8px 10px',
                      border: '1.5px solid var(--ws-border,#e5e7eb)',
                      borderRadius: 8, fontSize: '0.875rem', resize: 'vertical',
                      background: 'var(--ws-surface,#fff)', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setShowLogForm(false); setLogOutcome(''); }}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--ws-border,#e5e7eb)', background: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                    >Cancel</button>
                    <button
                      onClick={submitActivity}
                      disabled={loggingActivity || !logOutcome.trim()}
                      style={{ padding: '6px 14px', borderRadius: 8, background: '#C9A84C', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', opacity: logOutcome.trim() ? 1 : 0.5 }}
                    >{loggingActivity ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              )}

              {activitiesError ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#9ca3af)', padding: '8px 0' }}>
                  {activitiesError}
                </div>
              ) : activities.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#9ca3af)', padding: '8px 0' }}>
                  No activity logged yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activities.map(act => {
                    const typeInfo = ACTIVITY_TYPES.find(t => t.key === act.type);
                    return (
                      <div key={act.id} style={{
                        display: 'flex', gap: 10, alignItems: 'flex-start',
                        padding: '8px 10px', borderRadius: 8,
                        background: 'var(--ws-bg,#f9fafb)', border: '1px solid var(--ws-border,#e5e7eb)',
                      }}>
                        <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{typeInfo?.emoji || '📝'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.875rem' }}>{act.outcome || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--ws-text-secondary,#9ca3af)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} /> {timeAgo(act.created_at)}
                            {act.created_by && <span>· {act.created_by}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {error && <div className="pl2__edit-error">{error}</div>}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="pl2__edit-footer">
          {isClosedWon ? (
            <button
              className="pl2__btn pl2__btn--primary"
              onClick={onClose}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Close
            </button>
          ) : (
          <>
          {!isNew && (
            <button
              className={`pl2__btn pl2__btn--danger ${confirmDelete ? 'pl2__btn--confirm' : ''}`}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : confirmDelete ? '⚠️ Confirm?' : <><Trash2 size={14} /> Delete</>}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="pl2__btn" onClick={onClose}>Cancel</button>
          <button
            className="pl2__btn pl2__btn--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : isNew ? 'Create Deal' : 'Save Changes'}
          </button>
          </>
          )}
        </div>
      </div>
    </>
  );
}
