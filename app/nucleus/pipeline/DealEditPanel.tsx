'use client';

import React, { useState } from 'react';
import { X, Trash2, Building2, Phone, Mail } from 'lucide-react';
import { STAGE_CONFIG, DealStage } from '@/lib/supabase';

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
    id: string; name: string; type: string;
    school?: { id: string; name: string; conference: string } | null;
    national_org?: { id: string; name: string; abbreviation: string } | null;
  } | null;
  contact?: { id: string; name: string; email: string | null; phone: string | null; role: string | null } | null;
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

const STAGES: DealStage[] = ['lead', 'demo_booked', 'first_demo', 'second_call', 'contract_sent', 'closed_won', 'closed_lost', 'hold_off'];

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

export default function DealEditPanel({ deal, employees, schools, nationals, onClose, onSaved, onDeleted }: Props) {
  const isNew = !deal;

  /* ─── State ─── */
  const [stage, setStage] = useState<DealStage>(deal?.stage || 'lead');
  const [dealType, setDealType] = useState<'local' | 'council' | 'national'>(deal?.deal_type || 'local');
  const [temperature, setTemperature] = useState<'hot' | 'warm' | 'cold'>(deal?.temperature || 'warm');
  const [value, setValue] = useState(deal?.value?.toString() || '');
  const [assignedTo, setAssignedTo] = useState(deal?.assigned_to || '');
  const [conference, setConference] = useState(deal?.conference || '');
  const [notes, setNotes] = useState(deal?.notes || '');
  const [nextFollowup, setNextFollowup] = useState(deal?.next_followup || '');

  // Contact fields
  const [contactName, setContactName] = useState(deal?.contact?.name || '');
  const [contactPhone, setContactPhone] = useState(deal?.contact?.phone || '');
  const [contactEmail, setContactEmail] = useState(deal?.contact?.email || '');
  const [contactRole, setContactRole] = useState(deal?.contact?.role || 'president');

  // New deal org fields
  const [orgName, setOrgName] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [nationalId, setNationalId] = useState('');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            last_touched: new Date().toISOString(),
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
            last_touched: new Date().toISOString(),
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
          </div>
          <button className="pl2__edit-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="pl2__edit-body">

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

          {error && <div className="pl2__edit-error">{error}</div>}
        </div>

        {/* Footer */}
        <div className="pl2__edit-footer">
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
        </div>
      </div>
    </>
  );
}
