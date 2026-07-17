'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { DealStage } from '@/lib/supabase';

type Temperature = 'hot' | 'warm' | 'cold';

interface DealDetail {
  id: string;
  stage: DealStage;
  value: number | null;
  temperature: Temperature | null;
  next_followup: string | null;
  last_touched: string | null;
  notes: string | null;
  assigned_to: string | null;
  deal_type?: string | null;
  conference?: string | null;
  created_at?: string;
  updated_at?: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  advisor_name?: string | null;
  advisor_email?: string | null;
  advisor_phone?: string | null;
  advisor_met?: boolean | null;
  organization?: {
    name?: string;
    school?: { name?: string } | null;
  } | null;
  contact?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
}

interface DealNote {
  ts: string;
  text: string;
  author?: string;
}

interface Employee {
  id: string;
  name: string;
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead',
  demo_booked: 'Demo Booked',
  first_demo: 'First Demo',
  second_call: 'Second Call',
  timing: 'Bad Timing',
  contract_sent: 'Contract Sent',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  hold_off: 'Hold Off',
};

const PIPELINE_STAGES: DealStage[] = [
  'lead',
  'demo_booked',
  'first_demo',
  'second_call',
  'timing',
  'contract_sent',
  'closed_won',
];

const UI = {
  text: '#111827',
  muted: '#6b7280',
  subtle: '#9ca3af',
  border: '#e5e7eb',
  ink: '#0F172A',
  surface: '#f9fafb',
} as const;

function fmt$(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function parseDealNotes(notesJson: string | null | undefined): DealNote[] {
  if (!notesJson) return [];
  try {
    const parsed = JSON.parse(notesJson);
    if (Array.isArray(parsed)) return parsed as DealNote[];
  } catch { /* ignore */ }
  if (typeof notesJson === 'string' && notesJson.trim()) {
    return [{ ts: '', text: notesJson }];
  }
  return [];
}

function serializeDealNotes(notes: DealNote[]): string {
  return JSON.stringify(notes);
}

function dealTitle(deal: DealDetail): string {
  const org = deal.organization?.name?.trim() || 'Untitled deal';
  const school = deal.organization?.school?.name?.trim() || '';
  if (!school) return org;
  if (org.toLowerCase().includes(school.toLowerCase())) return org;
  return `${org} @ ${school}`;
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveRep(rep: string | null | undefined, employees: Employee[]): string {
  if (!rep) return 'Unassigned';
  const match = employees.find(e => e.id.toLowerCase() === rep.toLowerCase());
  if (match?.name) return match.name.split(' ')[0];
  return rep;
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: UI.subtle,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  border: `1px solid ${UI.border}`,
  borderRadius: 10,
  padding: '0 12px',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  background: '#fff',
  color: UI.text,
  boxSizing: 'border-box',
};

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = typeof params.id === 'string' ? params.id : '';

  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [followupNote, setFollowupNote] = useState('');
  const [logging, setLogging] = useState(false);

  const [editStage, setEditStage] = useState<DealStage>('lead');
  const [editTemp, setEditTemp] = useState<Temperature>('warm');
  const [editValue, setEditValue] = useState('');
  const [editRep, setEditRep] = useState('');
  const [editFollowup, setEditFollowup] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editContactEmail, setEditContactEmail] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');

  const loadDeal = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}`);
      if (!res.ok) throw new Error('Deal not found');
      const data = await res.json();
      setDeal(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deal');
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    loadDeal();
  }, [loadDeal]);

  useEffect(() => {
    fetch('/api/pipeline/employees')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEmployees(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!deal) return;
    setEditStage(deal.stage);
    setEditTemp((deal.temperature as Temperature) || 'warm');
    setEditValue(String(deal.value ?? ''));
    setEditRep(deal.assigned_to ?? '');
    setEditFollowup(deal.next_followup ?? '');
    setEditContactName(deal.contact?.name ?? deal.contact_name ?? '');
    setEditContactEmail(deal.contact?.email ?? deal.contact_email ?? '');
    setEditContactPhone(deal.contact?.phone ?? deal.contact_phone ?? '');
  }, [deal]);

  const activityLog = useMemo(() => parseDealNotes(deal?.notes), [deal?.notes]);
  const idleDays = daysSince(deal?.last_touched ?? deal?.updated_at);

  async function patchDeal(updates: Record<string, unknown>) {
    if (!dealId) return null;
    const res = await fetch(`/api/pipeline/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Save failed');
    const data = await res.json();
    const shaped: DealDetail = {
      ...data,
      organization: {
        name: data.deal_name || data.organization?.name || '',
        school: { name: data.university || data.organization?.school?.name || '' },
      },
      contact: data.contact_name || data.contact?.name ? {
        name: data.contact_name ?? data.contact?.name,
        email: data.contact_email ?? data.contact?.email,
        phone: data.contact_phone ?? data.contact?.phone,
      } : null,
    };
    setDeal(shaped);
    return shaped;
  }

  async function handleLogFollowup() {
    if (!deal) return;
    const text = followupNote.trim();
    if (!text) return;
    setLogging(true);
    try {
      const existing = parseDealNotes(deal.notes);
      const updated = [{ ts: new Date().toISOString(), text }, ...existing];
      await patchDeal({
        notes: serializeDealNotes(updated),
        last_touched: new Date().toISOString(),
      });
      setFollowupNote('');
    } catch {
      setError('Could not log follow-up');
    } finally {
      setLogging(false);
    }
  }

  async function handleSaveEdit() {
    if (!deal) return;
    setSaving(true);
    setError(null);
    try {
      const numVal = parseFloat(editValue);
      await patchDeal({
        stage: editStage,
        temperature: editTemp,
        value: Number.isFinite(numVal) ? numVal : deal.value,
        assigned_to: editRep || null,
        next_followup: editFollowup || null,
        contact_name: editContactName || null,
        contact_email: editContactEmail || null,
        contact_phone: editContactPhone || null,
        last_touched: new Date().toISOString(),
      });
      setEditing(false);
    } catch {
      setError('Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkStage(stage: DealStage) {
    try {
      await patchDeal({ stage, last_touched: new Date().toISOString() });
      setEditing(false);
    } catch {
      setError('Could not update stage');
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: UI.subtle }}>
        <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
        Loading deal…
      </div>
    );
  }

  if (!deal) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px' }}>
        <Link href="/nucleus/war-room" style={{ color: UI.muted, textDecoration: 'none', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Back to Sales Room
        </Link>
        <p style={{ marginTop: 24, fontSize: '1.125rem', fontWeight: 600, color: UI.text }}>
          {error || 'Deal not found'}
        </p>
      </div>
    );
  }

  const ownerName = resolveRep(deal.assigned_to, employees);
  const contactName = deal.contact?.name ?? deal.contact_name;
  const contactEmail = deal.contact?.email ?? deal.contact_email;
  const contactPhone = deal.contact?.phone ?? deal.contact_phone;
  const isClosed = deal.stage === 'closed_won' || deal.stage === 'closed_lost' || deal.stage === 'hold_off';

  return (
    <div style={{ minHeight: '100vh', background: UI.surface }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 28 }}>
          <button
            type="button"
            onClick={() => router.push('/nucleus/war-room')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: UI.muted,
              fontSize: '0.875rem',
              fontFamily: 'inherit',
            }}
          >
            <ArrowLeft size={14} /> Sales Room
          </button>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                height: 36,
                padding: '0 14px',
                borderRadius: 10,
                border: `1px solid ${UI.border}`,
                background: '#fff',
                color: UI.text,
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: UI.muted,
                fontSize: '0.8125rem',
                fontFamily: 'inherit',
              }}
            >
              Cancel edit
            </button>
          )}
        </div>

        <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: UI.subtle }}>
          Deal
        </p>
        <h1 style={{ margin: '8px 0 0', fontSize: '1.75rem', fontWeight: 600, color: UI.text, lineHeight: 1.2 }}>
          {dealTitle(deal)}
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: '0.9375rem', color: UI.muted }}>
          {STAGE_LABELS[deal.stage] ?? deal.stage}
          {' · '}
          {ownerName}
          {idleDays !== null ? ` · idle ${idleDays}d` : ''}
          {deal.value ? ` · ${fmt$(deal.value)}` : ''}
        </p>

        {error && (
          <p style={{ marginTop: 12, color: '#dc2626', fontSize: '0.875rem' }}>{error}</p>
        )}

        {/* Next step — always clear */}
        {!isClosed && !editing && (
          <section style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${UI.border}` }}>
            <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: UI.subtle }}>
              What to do next
            </p>
            <p style={{ margin: '8px 0 0', fontSize: '1.125rem', fontWeight: 600, color: UI.text }}>
              Log a follow-up on this chapter
            </p>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
              <input
                type="text"
                value={followupNote}
                onChange={e => setFollowupNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleLogFollowup(); }}
                placeholder="Called president / sent email / waiting on…"
                style={{
                  ...inputStyle,
                  border: 'none',
                  borderBottom: `2px solid ${UI.ink}`,
                  borderRadius: 0,
                  paddingLeft: 2,
                  height: 42,
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  type="button"
                  onClick={handleLogFollowup}
                  disabled={!followupNote.trim() || logging}
                  style={{
                    height: 40,
                    padding: '0 18px',
                    border: 'none',
                    borderRadius: 10,
                    background: followupNote.trim() ? UI.ink : '#d1d5db',
                    color: '#fff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: followupNote.trim() ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                  }}
                >
                  {logging ? 'Saving…' : 'Log follow-up'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: UI.muted,
                    fontFamily: 'inherit',
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                  }}
                >
                  Change stage / details
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Read-only details */}
        {!editing && (
          <section style={{ marginTop: 36 }}>
            <p style={{ margin: '0 0 14px', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: UI.subtle }}>
              Details
            </p>
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { label: 'Stage', value: STAGE_LABELS[deal.stage] ?? deal.stage },
                { label: 'Owner', value: ownerName },
                { label: 'Temperature', value: deal.temperature ? deal.temperature.charAt(0).toUpperCase() + deal.temperature.slice(1) : '—' },
                { label: 'Value', value: fmt$(deal.value) },
                { label: 'Next follow-up', value: formatDate(deal.next_followup) },
                { label: 'Last touched', value: formatDate(deal.last_touched ?? deal.updated_at) },
                { label: 'Contact', value: contactName || '—' },
                { label: 'Email', value: contactEmail || '—' },
                { label: 'Phone', value: contactPhone || '—' },
                { label: 'Conference', value: deal.conference || '—' },
              ].map(row => (
                <div
                  key={row.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: 12,
                    padding: '12px 0',
                    borderBottom: `1px solid ${UI.border}`,
                  }}
                >
                  <dt style={{ margin: 0, fontSize: '0.8125rem', color: UI.subtle }}>{row.label}</dt>
                  <dd style={{ margin: 0, fontSize: '0.875rem', fontWeight: 500, color: UI.text }}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* Edit mode */}
        {editing && (
          <section style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: UI.subtle }}>
              Edit deal
            </p>
            <div>
              <label style={labelStyle}>Stage</label>
              <select value={editStage} onChange={e => setEditStage(e.target.value as DealStage)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {PIPELINE_STAGES.map(s => (
                  <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                ))}
                <option value="closed_lost">Closed Lost</option>
                <option value="hold_off">Hold Off</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Temperature</label>
                <select value={editTemp} onChange={e => setEditTemp(e.target.value as Temperature)} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="cold">Cold</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Value ($)</label>
                <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Assigned to</label>
              <select value={editRep} onChange={e => setEditRep(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">Unassigned</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Next follow-up</label>
              <input type="date" value={editFollowup?.slice(0, 10) ?? ''} onChange={e => setEditFollowup(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Primary contact</label>
              <input value={editContactName} onChange={e => setEditContactName(e.target.value)} style={inputStyle} placeholder="Name" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={editContactEmail} onChange={e => setEditContactEmail(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={editContactPhone} onChange={e => setEditContactPhone(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                style={{
                  height: 42,
                  padding: '0 18px',
                  border: 'none',
                  borderRadius: 10,
                  background: UI.ink,
                  color: '#fff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => handleMarkStage('hold_off')}
                style={{
                  height: 42,
                  padding: '0 14px',
                  border: `1px solid ${UI.border}`,
                  borderRadius: 10,
                  background: '#fff',
                  color: UI.muted,
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Hold Off
              </button>
              <button
                type="button"
                onClick={() => handleMarkStage('closed_lost')}
                style={{
                  height: 42,
                  padding: '0 14px',
                  border: '1px solid #fecaca',
                  borderRadius: 10,
                  background: '#fff',
                  color: '#dc2626',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Closed Lost
              </button>
            </div>
          </section>
        )}

        {/* Activity */}
        <section style={{ marginTop: 40 }}>
          <p style={{ margin: '0 0 14px', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: UI.subtle }}>
            Activity
          </p>
          {activityLog.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.875rem', color: UI.muted }}>No follow-ups logged yet.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activityLog.map((note, i) => (
                <li key={`${note.ts}-${i}`} style={{ paddingBottom: 14, borderBottom: `1px solid ${UI.border}` }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: UI.text, lineHeight: 1.45 }}>{note.text}</p>
                  {note.ts && (
                    <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: UI.subtle }}>
                      {new Date(note.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
