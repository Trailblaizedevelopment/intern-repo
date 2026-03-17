'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { STAGE_CONFIG, DealStage } from '@/lib/supabase';

/* ─── Types ─── */
type OrgCategory = 'fraternity' | 'sorority' | 'council' | 'national' | 'sports' | 'other';

interface School { id: string; name: string; state: string | null; conference: string | null; }
interface NationalOrg { id: string; name: string; abbreviation: string | null; type: 'fraternity' | 'sorority'; }

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

/* ─── Constants ─── */
const ORG_CATEGORIES: { key: OrgCategory; label: string; emoji: string; dealType: 'local' | 'council' | 'national' }[] = [
  { key: 'fraternity', label: 'Fraternity Chapter', emoji: '🏛', dealType: 'local' },
  { key: 'sorority', label: 'Sorority Chapter', emoji: '🏠', dealType: 'local' },
  { key: 'council', label: 'IFC / PHC Council', emoji: '⚖️', dealType: 'council' },
  { key: 'national', label: 'National HQ', emoji: '🌐', dealType: 'national' },
  { key: 'sports', label: 'Sports Team / Club', emoji: '⚽', dealType: 'local' },
  { key: 'other', label: 'Other Campus Org', emoji: '🎓', dealType: 'local' },
];

const PIPELINE_STAGES: DealStage[] = ['lead', 'demo_booked', 'first_demo', 'second_call', 'contract_sent', 'closed_won'];
const COUNCIL_TYPES = ['IFC', 'PHC', 'MGC', 'NPHC'];
const CONTACT_ROLES = [
  { value: 'president', label: 'President' },
  { value: 'advisor', label: 'Advisor' },
  { value: 'fsl_director', label: 'FSL Director' },
  { value: 'nationals_rep', label: 'Nationals Rep' },
  { value: 'alumni_chair', label: 'Alumni Chair' },
  { value: 'board_member', label: 'Board Member' },
  { value: 'other', label: 'Other' },
];
const TEAM_MEMBERS = ['Owen Ridgeway', 'Adam', 'Ford', 'Knox Perry'];

const DEFAULT_VALUE: Record<OrgCategory, string> = {
  fraternity: '3588',
  sorority: '3588',
  sports: '3588',
  other: '3588',
  council: '',
  national: '',
};

const TEMP_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  hot:  { bg: '#ef444420', border: '#ef4444', color: '#ef4444' },
  warm: { bg: '#f59e0b20', border: '#f59e0b', color: '#f59e0b' },
  cold: { bg: '#3b82f620', border: '#3b82f6', color: '#3b82f6' },
};

/* ─── Component ─── */
export default function NewDealModal({ onClose, onCreated }: Props) {
  /* Data */
  const [schools, setSchools] = useState<School[]>([]);
  const [nationalOrgs, setNationalOrgs] = useState<NationalOrg[]>([]);

  /* Form state */
  const [orgCategory, setOrgCategory] = useState<OrgCategory | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolDropOpen, setSchoolDropOpen] = useState(false);

  const [orgName, setOrgName] = useState('');
  const [nationalOrgId, setNationalOrgId] = useState<string | null>(null);
  const [nationalOrgName, setNationalOrgName] = useState('');
  const [natSearch, setNatSearch] = useState('');
  const [natDropOpen, setNatDropOpen] = useState(false);
  const [councilType, setCouncilType] = useState('IFC');

  const [stage, setStage] = useState<DealStage>('lead');
  const [temperature, setTemperature] = useState<'hot' | 'warm' | 'cold'>('warm');
  const [value, setValue] = useState('');

  const [contactExpanded, setContactExpanded] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('president');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [assignedTo, setAssignedTo] = useState('');
  const [notes, setNotes] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schoolRef = useRef<HTMLDivElement>(null);
  const natRef = useRef<HTMLDivElement>(null);

  /* Load data */
  useEffect(() => {
    fetch('/api/pipeline/schools').then(r => r.json()).then(setSchools).catch(() => {});
    fetch('/api/pipeline/nationals').then(r => r.json()).then(setNationalOrgs).catch(() => {});
  }, []);

  /* Close dropdowns on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (schoolRef.current && !schoolRef.current.contains(e.target as Node)) setSchoolDropOpen(false);
      if (natRef.current && !natRef.current.contains(e.target as Node)) setNatDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Auto-set value when category changes */
  useEffect(() => {
    if (orgCategory) setValue(DEFAULT_VALUE[orgCategory]);
  }, [orgCategory]);

  /* Auto-set org name for council */
  useEffect(() => {
    if (orgCategory === 'council' && selectedSchool) {
      setOrgName(`${councilType} ${selectedSchool.name}`);
    }
  }, [orgCategory, selectedSchool, councilType]);

  /* Filtered school list */
  const filteredSchools = useMemo(() => {
    if (!schoolSearch) return schools.slice(0, 30);
    const q = schoolSearch.toLowerCase();
    return schools.filter(s => s.name.toLowerCase().includes(q)).slice(0, 20);
  }, [schools, schoolSearch]);

  /* Filtered national orgs */
  const filteredNationals = useMemo(() => {
    const typeFilter = orgCategory === 'fraternity' ? 'fraternity' : orgCategory === 'sorority' ? 'sorority' : null;
    let list = nationalOrgs;
    if (typeFilter) list = list.filter(n => n.type === typeFilter);
    if (!natSearch) return list.slice(0, 30);
    const q = natSearch.toLowerCase();
    return list.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.abbreviation?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [nationalOrgs, orgCategory, natSearch]);

  /* Derived deal type */
  const dealType = orgCategory ? ORG_CATEGORIES.find(c => c.key === orgCategory)!.dealType : 'local';

  /* Can create? Steps 1–5 */
  const step1Done = !!orgCategory;
  const step2Done = !!selectedSchool;
  const step3Done = orgName.trim().length > 0 || (orgCategory === 'fraternity' || orgCategory === 'sorority' ? !!nationalOrgId : false);
  const step4Done = true; // stage always has a default
  const step5Done = true; // temperature always has a default
  const canCreate = step1Done && step2Done && (
    orgCategory === 'fraternity' || orgCategory === 'sorority'
      ? !!nationalOrgId
      : orgName.trim().length > 0
  );

  /* ─── Submit ─── */
  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      // Determine final org name
      const finalOrgName = (orgCategory === 'fraternity' || orgCategory === 'sorority')
        ? (nationalOrgName ? `${nationalOrgName} at ${selectedSchool?.name}` : orgName.trim())
        : orgName.trim();

      // 1. Find or create org
      let orgId: string;
      const existingRes = await fetch(`/api/pipeline/orgs?school_id=${selectedSchool?.id || ''}`);
      if (existingRes.ok) {
        const existingOrgs = await existingRes.json();
        let found = null;
        if (orgCategory === 'fraternity' || orgCategory === 'sorority') {
          found = existingOrgs.find((o: any) => o.national_org_id === nationalOrgId && o.school_id === selectedSchool?.id);
        } else {
          found = existingOrgs.find((o: any) => o.name?.toLowerCase() === finalOrgName.toLowerCase() && o.school_id === selectedSchool?.id);
        }
        if (found) {
          orgId = found.id;
        } else {
          const createRes = await fetch('/api/pipeline/orgs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: finalOrgName,
              school_id: selectedSchool?.id || null,
              national_org_id: nationalOrgId || null,
              type: orgCategory === 'council' ? 'ifc' : orgCategory === 'national' ? 'national' : 'chapter',
              status: 'prospect',
            }),
          });
          if (!createRes.ok) throw new Error('Failed to create organization');
          const newOrg = await createRes.json();
          orgId = newOrg.id;
        }
      } else {
        const createRes = await fetch('/api/pipeline/orgs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: finalOrgName,
            school_id: selectedSchool?.id || null,
            national_org_id: nationalOrgId || null,
            type: orgCategory === 'council' ? 'ifc' : orgCategory === 'national' ? 'national' : 'chapter',
            status: 'prospect',
          }),
        });
        if (!createRes.ok) throw new Error('Failed to create organization');
        const newOrg = await createRes.json();
        orgId = newOrg.id;
      }

      // 2. Create contact (optional)
      let contactId: string | null = null;
      if (contactName.trim()) {
        const cRes = await fetch('/api/pipeline/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: orgId,
            name: contactName.trim(),
            phone: contactPhone.trim() || null,
            email: contactEmail.trim() || null,
            role: contactRole || 'president',
          }),
        });
        if (cRes.ok) {
          const c = await cRes.json();
          contactId = c.id;
        }
      }

      // 3. Create deal
      const dRes = await fetch('/api/pipeline/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          contact_id: contactId,
          deal_type: dealType,
          stage,
          value: parseInt(value) || 0,
          temperature,
          assigned_to: assignedTo || null,
          conference: selectedSchool?.conference || null,
          notes: notes.trim() || null,
          next_followup: nextFollowup || null,
          last_touched: new Date().toISOString(),
        }),
      });
      if (!dRes.ok) throw new Error('Failed to create deal');

      onCreated();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  const showStep2 = !!orgCategory;
  const showStep3 = showStep2 && !!selectedSchool;
  const showStep4 = showStep3 && (orgCategory === 'fraternity' || orgCategory === 'sorority' ? !!nationalOrgId : orgName.trim().length > 0);
  const showOptional = showStep4;

  return (
    <>
      <div className="ndm__overlay" onClick={onClose} />
      <div className="ndm__modal">
        {/* Header */}
        <div className="ndm__header">
          <h2 className="ndm__title">New Deal</h2>
          <button className="ndm__close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="ndm__body">

          {/* ── Step 1: Org Type ── */}
          <div className="ndm__section">
            <div className="ndm__step-label">
              <span className={`ndm__step-num ${step1Done ? 'ndm__step-num--done' : 'ndm__step-num--active'}`}>1</span>
              <span className="ndm__step-title">Organization Type <span className="ndm__required">*</span></span>
            </div>
            <div className="ndm__org-grid">
              {ORG_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  className={`ndm__org-pill ${orgCategory === cat.key ? 'ndm__org-pill--selected' : ''}`}
                  onClick={() => {
                    setOrgCategory(cat.key);
                    setOrgName('');
                    setNationalOrgId(null);
                    setNationalOrgName('');
                    setNatSearch('');
                    setCouncilType('IFC');
                  }}
                >
                  <span className="ndm__org-emoji">{cat.emoji}</span>
                  <span className="ndm__org-label">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Step 2: School ── */}
          {showStep2 && (
            <div className="ndm__section">
              <div className="ndm__step-label">
                <span className={`ndm__step-num ${step2Done ? 'ndm__step-num--done' : 'ndm__step-num--active'}`}>2</span>
                <span className="ndm__step-title">School <span className="ndm__required">*</span></span>
              </div>
              <div className="ndm__dropdown-wrap" ref={schoolRef}>
                <button
                  className="ndm__dropdown-btn"
                  onClick={() => setSchoolDropOpen(v => !v)}
                  type="button"
                >
                  {selectedSchool ? (
                    <span className="ndm__dropdown-val">
                      {selectedSchool.name}
                      {selectedSchool.conference && (
                        <span className="ndm__conf-badge">{selectedSchool.conference}</span>
                      )}
                    </span>
                  ) : (
                    <span className="ndm__dropdown-placeholder">Search schools…</span>
                  )}
                  {schoolDropOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {schoolDropOpen && (
                  <div className="ndm__dropdown-menu">
                    <div className="ndm__dropdown-search">
                      <Search size={14} />
                      <input
                        autoFocus
                        value={schoolSearch}
                        onChange={e => setSchoolSearch(e.target.value)}
                        placeholder="Type to search…"
                      />
                    </div>
                    <div className="ndm__dropdown-list">
                      {filteredSchools.map(s => (
                        <button
                          key={s.id}
                          className="ndm__dropdown-item"
                          onClick={() => {
                            setSelectedSchool(s);
                            setSchoolDropOpen(false);
                            setSchoolSearch('');
                            if (orgCategory === 'council') {
                              setOrgName(`${councilType} ${s.name}`);
                            }
                          }}
                        >
                          <span>{s.name}</span>
                          {s.conference && <span className="ndm__conf-badge">{s.conference}</span>}
                        </button>
                      ))}
                      {filteredSchools.length === 0 && (
                        <div className="ndm__dropdown-empty">No schools found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Org Name ── */}
          {showStep3 && (
            <div className="ndm__section">
              <div className="ndm__step-label">
                <span className={`ndm__step-num ${step3Done ? 'ndm__step-num--done' : 'ndm__step-num--active'}`}>3</span>
                <span className="ndm__step-title">Organization Name <span className="ndm__required">*</span></span>
              </div>

              {(orgCategory === 'fraternity' || orgCategory === 'sorority') ? (
                <div className="ndm__dropdown-wrap" ref={natRef}>
                  <button
                    className="ndm__dropdown-btn"
                    onClick={() => setNatDropOpen(v => !v)}
                    type="button"
                  >
                    {nationalOrgId ? (
                      <span className="ndm__dropdown-val">
                        {nationalOrgName}
                        {selectedSchool && <span className="ndm__school-suffix"> at {selectedSchool.name}</span>}
                      </span>
                    ) : (
                      <span className="ndm__dropdown-placeholder">
                        Search {orgCategory === 'fraternity' ? 'fraternities' : 'sororities'}…
                      </span>
                    )}
                    {natDropOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {natDropOpen && (
                    <div className="ndm__dropdown-menu">
                      <div className="ndm__dropdown-search">
                        <Search size={14} />
                        <input
                          autoFocus
                          value={natSearch}
                          onChange={e => setNatSearch(e.target.value)}
                          placeholder="Type to search…"
                        />
                      </div>
                      <div className="ndm__dropdown-list">
                        {filteredNationals.map(n => (
                          <button
                            key={n.id}
                            className="ndm__dropdown-item"
                            onClick={() => {
                              setNationalOrgId(n.id);
                              setNationalOrgName(n.name + (n.abbreviation ? ` (${n.abbreviation})` : ''));
                              setOrgName(`${n.name} at ${selectedSchool?.name}`);
                              setNatDropOpen(false);
                              setNatSearch('');
                            }}
                          >
                            <span>{n.name}</span>
                            {n.abbreviation && <span className="ndm__abbr">({n.abbreviation})</span>}
                          </button>
                        ))}
                        {filteredNationals.length === 0 && (
                          <div className="ndm__dropdown-empty">No results</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : orgCategory === 'council' ? (
                <>
                  <div className="ndm__council-type-row">
                    {COUNCIL_TYPES.map(ct => (
                      <button
                        key={ct}
                        className={`ndm__council-pill ${councilType === ct ? 'ndm__council-pill--active' : ''}`}
                        onClick={() => {
                          setCouncilType(ct);
                          setOrgName(`${ct} ${selectedSchool?.name || ''}`);
                        }}
                      >
                        {ct}
                      </button>
                    ))}
                  </div>
                  <input
                    className="ndm__input"
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder={`${councilType} ${selectedSchool?.name || '...'}`}
                  />
                </>
              ) : (
                <input
                  className="ndm__input"
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder={
                    orgCategory === 'sports' ? 'e.g. Alabama Club Soccer' :
                    orgCategory === 'national' ? 'e.g. Sigma Alpha Epsilon HQ' :
                    'Organization name'
                  }
                  autoFocus
                />
              )}
            </div>
          )}

          {/* ── Step 4: Stage ── */}
          {showStep4 && (
            <div className="ndm__section">
              <div className="ndm__step-label">
                <span className="ndm__step-num ndm__step-num--done">4</span>
                <span className="ndm__step-title">Stage</span>
              </div>
              <div className="ndm__stage-pills">
                {PIPELINE_STAGES.map(s => {
                  const cfg = STAGE_CONFIG[s];
                  const isActive = stage === s;
                  return (
                    <button
                      key={s}
                      className="ndm__stage-pill"
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
          )}

          {/* ── Step 5: Temperature ── */}
          {showStep4 && (
            <div className="ndm__section">
              <div className="ndm__step-label">
                <span className="ndm__step-num ndm__step-num--done">5</span>
                <span className="ndm__step-title">Temperature</span>
              </div>
              <div className="ndm__temp-row">
                {(['hot', 'warm', 'cold'] as const).map(t => {
                  const ts = TEMP_STYLE[t];
                  return (
                    <button
                      key={t}
                      className="ndm__temp-btn"
                      style={temperature === t ? { background: ts.bg, borderColor: ts.border, color: ts.color } : {}}
                      onClick={() => setTemperature(t)}
                    >
                      {t === 'hot' ? '🔴' : t === 'warm' ? '🟡' : '🔵'}
                      <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 6: Value ── */}
          {showOptional && (
            <div className="ndm__section">
              <div className="ndm__step-label">
                <span className="ndm__step-num ndm__step-num--optional">6</span>
                <span className="ndm__step-title">Deal Value</span>
              </div>
              <div className="ndm__input-wrap">
                <span className="ndm__input-prefix">$</span>
                <input
                  className="ndm__input ndm__input--prefixed"
                  type="number"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder={
                    orgCategory === 'council' ? 'e.g. 45000' :
                    orgCategory === 'national' ? 'e.g. 250000' :
                    '3588'
                  }
                />
              </div>
              {orgCategory === 'council' && (
                <p className="ndm__helper">IFC deals typically $20K–$125K</p>
              )}
            </div>
          )}

          {/* ── Step 7: Contact (optional, collapsible) ── */}
          {showOptional && (
            <div className="ndm__section">
              <button
                className="ndm__collapse-btn"
                onClick={() => setContactExpanded(v => !v)}
              >
                {contactExpanded ? '▾' : '▸'} Contact (optional)
              </button>
              {contactExpanded && (
                <div className="ndm__contact-grid">
                  <div className="ndm__field ndm__field--full">
                    <label>Name</label>
                    <input className="ndm__input" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="John Smith" />
                  </div>
                  <div className="ndm__field">
                    <label>Role</label>
                    <select className="ndm__select" value={contactRole} onChange={e => setContactRole(e.target.value)}>
                      {CONTACT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="ndm__field">
                    <label>Phone</label>
                    <input className="ndm__input" type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+1 555 000 0000" />
                  </div>
                  <div className="ndm__field">
                    <label>Email</label>
                    <input className="ndm__input" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="john@school.edu" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 8: Assigned To ── */}
          {showOptional && (
            <div className="ndm__section">
              <label className="ndm__label">Assigned To</label>
              <select className="ndm__select" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {/* ── Step 9: Notes ── */}
          {showOptional && (
            <div className="ndm__section">
              <label className="ndm__label">Notes</label>
              <textarea
                className="ndm__textarea"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes about this deal…"
                rows={3}
              />
            </div>
          )}

          {/* ── Step 10: Next Follow-Up ── */}
          {showOptional && (
            <div className="ndm__section">
              <label className="ndm__label">Next Follow-Up</label>
              <input
                className="ndm__input"
                type="date"
                value={nextFollowup}
                onChange={e => setNextFollowup(e.target.value)}
              />
            </div>
          )}

          {error && <div className="ndm__error">{error}</div>}
        </div>

        {/* Footer */}
        <div className="ndm__footer">
          <button className="ndm__btn" onClick={onClose}>Cancel</button>
          <button
            className="ndm__btn ndm__btn--primary"
            onClick={handleCreate}
            disabled={!canCreate || saving}
          >
            {saving ? 'Creating…' : 'Create Deal'}
          </button>
        </div>
      </div>

      <style>{`
        .ndm__overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          z-index: 9998; backdrop-filter: blur(2px);
        }
        .ndm__modal {
          position: fixed; bottom: 0; left: 0; right: 0;
          background: var(--ws-surface, #fff);
          border-radius: 20px 20px 0 0;
          z-index: 9999;
          display: flex; flex-direction: column;
          max-height: 92dvh;
          box-shadow: 0 -8px 40px rgba(0,0,0,0.2);
        }
        @media (min-width: 640px) {
          .ndm__modal {
            top: 50%; left: 50%; right: auto; bottom: auto;
            transform: translate(-50%, -50%);
            width: 540px; max-height: 88vh;
            border-radius: 16px;
          }
        }
        .ndm__header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 20px 12px;
          border-bottom: 1px solid var(--ws-border, #e5e7eb);
          flex-shrink: 0;
        }
        .ndm__title { font-size: 1.125rem; font-weight: 700; margin: 0; }
        .ndm__close {
          background: none; border: none; cursor: pointer;
          padding: 4px; color: var(--ws-text-secondary, #6b7280);
          border-radius: 8px;
        }
        .ndm__body {
          overflow-y: auto; padding: 16px 20px 8px;
          flex: 1;
        }
        .ndm__section { margin-bottom: 20px; }
        .ndm__step-label {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 10px;
        }
        .ndm__step-num {
          width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.75rem; font-weight: 700; flex-shrink: 0;
        }
        .ndm__step-num--active { background: #C9A84C; color: #fff; }
        .ndm__step-num--done { background: #10b981; color: #fff; }
        .ndm__step-num--optional { background: var(--ws-border, #e5e7eb); color: var(--ws-text-secondary, #6b7280); }
        .ndm__step-title { font-size: 0.875rem; font-weight: 600; }
        .ndm__required { color: #ef4444; }

        .ndm__org-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .ndm__org-pill {
          display: flex; flex-direction: column; align-items: center;
          gap: 6px; padding: 14px 10px;
          border: 2px solid var(--ws-border, #e5e7eb);
          border-radius: 12px; background: var(--ws-surface, #fff);
          cursor: pointer; transition: all 0.15s;
        }
        .ndm__org-pill--selected {
          border-color: #C9A84C; background: #C9A84C18;
        }
        .ndm__org-emoji { font-size: 1.5rem; }
        .ndm__org-label { font-size: 0.8125rem; font-weight: 500; text-align: center; line-height: 1.3; }

        .ndm__dropdown-wrap { position: relative; }
        .ndm__dropdown-btn {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; border: 1.5px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; background: var(--ws-surface, #fff);
          cursor: pointer; font-size: 0.875rem;
        }
        .ndm__dropdown-val { display: flex; align-items: center; gap: 8px; }
        .ndm__dropdown-placeholder { color: var(--ws-text-secondary, #9ca3af); }
        .ndm__dropdown-menu {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: var(--ws-surface, #fff);
          border: 1.5px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; z-index: 100;
          box-shadow: 0 4px 20px rgba(0,0,0,0.12);
          overflow: hidden;
        }
        .ndm__dropdown-search {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px; border-bottom: 1px solid var(--ws-border, #e5e7eb);
        }
        .ndm__dropdown-search input {
          flex: 1; border: none; outline: none; background: none;
          font-size: 0.875rem;
        }
        .ndm__dropdown-list { max-height: 200px; overflow-y: auto; }
        .ndm__dropdown-item {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 10px 14px; background: none; border: none; cursor: pointer;
          font-size: 0.875rem; text-align: left;
        }
        .ndm__dropdown-item:hover { background: var(--ws-bg, #f9fafb); }
        .ndm__dropdown-empty { padding: 12px 14px; font-size: 0.875rem; color: var(--ws-text-secondary, #9ca3af); }
        .ndm__conf-badge {
          font-size: 0.7rem; font-weight: 600; padding: 2px 6px;
          border-radius: 6px; background: #C9A84C22; color: #C9A84C;
          white-space: nowrap;
        }
        .ndm__abbr { font-size: 0.8rem; color: var(--ws-text-secondary, #6b7280); }
        .ndm__school-suffix { color: var(--ws-text-secondary, #6b7280); font-size: 0.85em; }

        .ndm__council-type-row {
          display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px;
        }
        .ndm__council-pill {
          padding: 6px 14px; border: 1.5px solid var(--ws-border, #e5e7eb);
          border-radius: 20px; background: var(--ws-surface, #fff);
          cursor: pointer; font-size: 0.8125rem; font-weight: 500;
        }
        .ndm__council-pill--active { border-color: #C9A84C; background: #C9A84C18; color: #C9A84C; }

        .ndm__stage-pills {
          display: flex; flex-wrap: wrap; gap: 6px;
        }
        .ndm__stage-pill {
          padding: 6px 12px; border: 1.5px solid var(--ws-border, #e5e7eb);
          border-radius: 20px; background: var(--ws-surface, #fff);
          cursor: pointer; font-size: 0.8rem; font-weight: 500;
          transition: all 0.15s;
        }

        .ndm__temp-row { display: flex; gap: 8px; }
        .ndm__temp-btn {
          flex: 1; display: flex; align-items: center; justify-content: center;
          gap: 6px; padding: 12px 8px;
          border: 2px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; background: var(--ws-surface, #fff);
          cursor: pointer; font-size: 0.875rem; font-weight: 500;
          transition: all 0.15s;
        }

        .ndm__input-wrap { position: relative; display: flex; align-items: center; }
        .ndm__input-prefix {
          position: absolute; left: 12px;
          color: var(--ws-text-secondary, #6b7280); font-weight: 500;
        }
        .ndm__input {
          width: 100%; padding: 10px 14px;
          border: 1.5px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; background: var(--ws-surface, #fff);
          font-size: 0.875rem; outline: none;
        }
        .ndm__input--prefixed { padding-left: 26px; }
        .ndm__input:focus { border-color: #C9A84C; }
        .ndm__helper { font-size: 0.75rem; color: var(--ws-text-secondary, #9ca3af); margin: 4px 0 0; }

        .ndm__label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 6px; }
        .ndm__select {
          width: 100%; padding: 10px 14px;
          border: 1.5px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; background: var(--ws-surface, #fff);
          font-size: 0.875rem; outline: none; cursor: pointer;
        }
        .ndm__select:focus { border-color: #C9A84C; }
        .ndm__textarea {
          width: 100%; padding: 10px 14px;
          border: 1.5px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; background: var(--ws-surface, #fff);
          font-size: 0.875rem; outline: none; resize: vertical;
          font-family: inherit;
        }
        .ndm__textarea:focus { border-color: #C9A84C; }

        .ndm__collapse-btn {
          background: none; border: none; cursor: pointer;
          font-size: 0.875rem; font-weight: 600; color: #C9A84C;
          padding: 0; margin-bottom: 10px;
        }
        .ndm__contact-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
        }
        .ndm__field { display: flex; flex-direction: column; gap: 4px; }
        .ndm__field label { font-size: 0.8rem; font-weight: 500; color: var(--ws-text-secondary, #6b7280); }
        .ndm__field--full { grid-column: 1 / -1; }

        .ndm__error {
          padding: 10px 14px; background: #ef444420; border-radius: 8px;
          color: #ef4444; font-size: 0.875rem; margin-top: 4px;
        }

        .ndm__footer {
          display: flex; gap: 10px; padding: 14px 20px;
          border-top: 1px solid var(--ws-border, #e5e7eb);
          flex-shrink: 0;
        }
        .ndm__btn {
          flex: 1; padding: 12px; border-radius: 10px;
          border: 1.5px solid var(--ws-border, #e5e7eb);
          background: var(--ws-surface, #fff);
          font-size: 0.9375rem; font-weight: 500; cursor: pointer;
        }
        .ndm__btn--primary {
          background: #C9A84C; border-color: #C9A84C; color: #fff; font-weight: 600;
        }
        .ndm__btn--primary:disabled { opacity: 0.45; cursor: not-allowed; }
      `}</style>
    </>
  );
}
