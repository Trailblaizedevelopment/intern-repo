'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, X, RefreshCw, ChevronRight, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react';
import { STAGE_CONFIG, type DealStage } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

type LeadOwner = 'Owen' | 'Ford' | 'Adam' | 'Team' | 'Katie' | 'Hyatt';

export interface PipelineDealFull {
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
  updated_at: string;
  // joined
  organization?: {
    id: string;
    name: string;
    school?: { id: string; name: string } | null;
    national_org?: { id: string; name: string } | null;
  } | null;
  contact?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  } | null;
}

interface DealNote {
  ts: string;
  text: string;
  author?: string;
}

// ─── Seed Data (legacy SalesCRM leads — used as fallback only) ─────────────────

type LeadStatus = 'Active' | 'Check In' | 'Hold Off';

interface SalesLead {
  id: string;
  org_name: string;
  school: string | null;
  contact_name: string | null;
  owner: LeadOwner | null;
  status: LeadStatus;
  pipeline_value: number | null;
  last_contact: string | null;
  next_step: string | null;
  notes: string | null;
  is_enterprise: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_STAGES: DealStage[] = [
  'lead',
  'demo_booked',
  'first_demo',
  'second_call',
  'contract_sent',
  'closed_won',
];

const STAGE_LABELS: Record<DealStage, string> = {
  lead:          'Lead',
  demo_booked:   'Demo Booked',
  first_demo:    'First Demo',
  second_call:   'Second Call',
  contract_sent: 'Contract Sent',
  closed_won:    'Closed Won',
  closed_lost:   'Closed Lost',
  hold_off:      'Hold Off',
};

const STAGE_COLORS: Record<DealStage, { color: string; bg: string; border: string }> = {
  lead:          { color: '#6b7280', bg: '#f3f4f6',  border: '#d1d5db' },
  demo_booked:   { color: '#1d4ed8', bg: '#eff6ff',  border: '#bfdbfe' },
  first_demo:    { color: '#7c3aed', bg: '#f5f3ff',  border: '#ddd6fe' },
  second_call:   { color: '#d97706', bg: '#fef3c7',  border: '#fcd34d' },
  contract_sent: { color: '#be185d', bg: '#fdf2f8',  border: '#fbcfe8' },
  closed_won:    { color: '#065f46', bg: '#d1fae5',  border: '#6ee7b7' },
  closed_lost:   { color: '#dc2626', bg: '#fee2e2',  border: '#fca5a5' },
  hold_off:      { color: '#9ca3af', bg: '#f9fafb',  border: '#e5e7eb' },
};

const REP_COLORS: Record<string, string> = {
  Owen:  '#7c3aed',
  Ford:  '#0369a1',
  Adam:  '#b45309',
  Katie: '#be185d',
  Hyatt: '#065f46',
  Team:  '#374151',
};

const SLIPPING_STAGES: DealStage[] = ['first_demo', 'second_call', 'contract_sent'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const days = daysSince(dateStr);
  if (days === null) return '—';
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function activityColor(dateStr: string | null | undefined): string {
  const days = daysSince(dateStr);
  if (days === null) return '#dc2626';
  if (days < 3) return '#059669';
  if (days <= 7) return '#d97706';
  return '#dc2626';
}

function parseDealNotes(notesJson: string | null | undefined): DealNote[] {
  if (!notesJson) return [];
  try {
    const parsed = JSON.parse(notesJson);
    if (Array.isArray(parsed)) return parsed as DealNote[];
  } catch { /* ignore */ }
  // If it's plain text, wrap it as a single note
  if (typeof notesJson === 'string' && notesJson.trim()) {
    return [{ ts: '', text: notesJson, author: '' }];
  }
  return [];
}

function serializeDealNotes(notes: DealNote[]): string {
  return JSON.stringify(notes);
}

// ─── Rep Badge ─────────────────────────────────────────────────────────────────

function RepBadge({ rep }: { rep: string | null | undefined }) {
  if (!rep) return <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>—</span>;
  const color = REP_COLORS[rep] ?? '#6b7280';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px 2px 3px', borderRadius: '9999px',
      background: color, color: '#fff', fontSize: '0.7rem', fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: '16px', height: '16px', borderRadius: '9999px',
        background: 'rgba(255,255,255,0.25)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 800,
      }}>
        {rep[0]}
      </span>
      {rep}
    </span>
  );
}

// ─── Stage Badge ───────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: DealStage }) {
  const cfg = STAGE_COLORS[stage];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: '9999px', fontSize: '0.7rem',
      fontWeight: 600, color: cfg.color, background: cfg.bg,
      border: `1px solid ${cfg.border}`, whiteSpace: 'nowrap',
    }}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

// ─── Stage Stepper ─────────────────────────────────────────────────────────────

function StageStepper({ currentStage, onAdvance }: { currentStage: DealStage; onAdvance: (stage: DealStage) => void }) {
  const currentIdx = PIPELINE_STAGES.indexOf(currentStage);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap' }}>
      {PIPELINE_STAGES.map((stage, idx) => {
        const isActive = stage === currentStage;
        const isPast = idx < currentIdx;
        const cfg = STAGE_COLORS[stage];
        return (
          <React.Fragment key={stage}>
            <button
              onClick={() => onAdvance(stage)}
              style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600,
                border: `1px solid ${isActive ? cfg.border : '#e5e7eb'}`,
                background: isActive ? cfg.bg : isPast ? '#f0fdf4' : '#f9fafb',
                color: isActive ? cfg.color : isPast ? '#059669' : '#9ca3af',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
                textDecoration: isPast ? 'line-through' : 'none',
              }}
              title={`Move to ${STAGE_LABELS[stage]}`}
            >
              {STAGE_LABELS[stage]}
            </button>
            {idx < PIPELINE_STAGES.length - 1 && (
              <ChevronRight size={12} color="#d1d5db" style={{ flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Deal Detail Drawer ────────────────────────────────────────────────────────

interface GranolaNote {
  id: string;
  title: string;
  created_at: string;
  summary?: string;
  transcript?: string;
}

interface DealDrawerProps {
  deal: PipelineDealFull;
  granolaNotesCache: GranolaNote[] | null;
  onClose: () => void;
  onAdvanceStage: (dealId: string, stage: DealStage) => void;
  onLogActivity: (dealId: string, text: string) => void;
}

function DealDetailDrawer({ deal, granolaNotesCache, onClose, onAdvanceStage, onLogActivity }: DealDrawerProps) {
  const [activityInput, setActivityInput] = useState('');
  const orgName = deal.organization?.name ?? 'Unknown Org';
  const schoolName = deal.organization?.school?.name ?? '';
  const contactName = deal.contact?.name ?? null;
  const rep = deal.assigned_to;

  // Parse existing notes/activity log
  const activityLog = useMemo(() => parseDealNotes(deal.notes), [deal.notes]);

  // Fuzzy match Granola notes
  const matchedNotes = useMemo(() => {
    if (!granolaNotesCache) return null;
    const orgLower = orgName.toLowerCase();
    const schoolLower = schoolName.toLowerCase();
    return granolaNotesCache.filter(note => {
      const titleLower = (note.title ?? '').toLowerCase();
      return (
        (orgLower && titleLower.includes(orgLower)) ||
        (schoolLower && titleLower.includes(schoolLower))
      );
    });
  }, [granolaNotesCache, orgName, schoolName]);

  function handleLogActivity() {
    const text = activityInput.trim();
    if (!text) return;
    onLogActivity(deal.id, text);
    setActivityInput('');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      <div
        style={{ flex: 1, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div style={{
        width: 440, background: '#ffffff', display: 'flex', flexDirection: 'column',
        height: '100%', borderLeft: '1px solid #e5e7eb', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>{orgName}</span>
                <StageBadge stage={deal.stage} />
              </div>
              {schoolName && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{schoolName}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                {contactName && <span style={{ fontSize: '0.8rem', color: '#374151' }}>👤 {contactName}</span>}
                <RepBadge rep={rep} />
                {deal.value > 0 && <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1d4ed8' }}>{fmt$(deal.value)}</span>}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: 4, flexShrink: 0 }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Stage Stepper */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
              Stage Progression
            </div>
            <StageStepper currentStage={deal.stage} onAdvance={(stage) => onAdvanceStage(deal.id, stage)} />
          </div>

          {/* Granola Notes */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
              Meeting Notes (Granola)
            </div>
            {matchedNotes === null ? (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>Loading notes…</div>
            ) : matchedNotes.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>
                No meeting notes found — notes auto-match from Granola by org/school name.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {matchedNotes.map(note => (
                  <div key={note.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#111827', marginBottom: 4 }}>{note.title}</div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: 6 }}>
                      {note.created_at ? new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    </div>
                    {(note.summary || note.transcript) && (
                      <div style={{ fontSize: '0.78rem', color: '#374151', lineHeight: 1.5 }}>
                        {(note.summary || note.transcript || '').slice(0, 300)}
                        {((note.summary || note.transcript || '').length > 300) ? '…' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Log */}
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 10 }}>
              Activity Log
            </div>
            {activityLog.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic' }}>No activity logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activityLog.map((note, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '9999px', background: '#d1d5db', flexShrink: 0, marginTop: 6 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.4 }}>{note.text}</div>
                      {note.ts && (
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 2 }}>
                          {new Date(note.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Log Activity Input */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9ca3af', marginBottom: 8 }}>
            Log Activity
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={activityInput}
              onChange={e => setActivityInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLogActivity(); }}
              placeholder="Add a note or follow-up…"
              style={{
                flex: 1, border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px',
                fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#374151',
              }}
            />
            <button
              onClick={handleLogActivity}
              disabled={!activityInput.trim()}
              style={{
                padding: '8px 16px', borderRadius: 10, border: 'none',
                background: activityInput.trim() ? '#0F172A' : '#e5e7eb',
                color: activityInput.trim() ? '#fff' : '#9ca3af',
                fontSize: '0.8rem', fontWeight: 700, cursor: activityInput.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit', transition: 'all 0.1s', whiteSpace: 'nowrap',
              }}
            >
              Log
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Deal Card ─────────────────────────────────────────────────────────────────

interface DealCardProps {
  deal: PipelineDealFull;
  onClick: () => void;
}

function DealCard({ deal, onClick }: DealCardProps) {
  const orgName = deal.organization?.name ?? 'Unknown';
  const schoolName = deal.organization?.school?.name ?? null;
  const contactName = deal.contact?.name ?? null;
  const rep = deal.assigned_to;
  const lastActivity = deal.last_touched ?? deal.updated_at;
  const days = daysSince(lastActivity);
  const actColor = activityColor(lastActivity);

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
        padding: '12px 14px', cursor: 'pointer', transition: 'box-shadow 0.12s, border-color 0.12s',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
        (e.currentTarget as HTMLDivElement).style.borderColor = '#d1d5db';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e7eb';
      }}
    >
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', lineHeight: 1.3 }}>{orgName}</div>
        {schoolName && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 1 }}>{schoolName}</div>}
        {contactName && <div style={{ fontSize: '0.75rem', color: '#374151', marginTop: 2 }}>{contactName}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <RepBadge rep={rep} />
        {deal.value > 0 && (
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#1d4ed8' }}>{fmt$(deal.value)}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.7rem', color: actColor, fontWeight: 600 }}>
          {days === null ? 'No activity' : days === 0 ? 'Today' : `${days}d ago`}
        </span>
      </div>
    </div>
  );
}

// ─── Needs Attention Section ────────────────────────────────────────────────────

interface NeedsAttentionProps {
  deals: PipelineDealFull[];
  onOpenDeal: (deal: PipelineDealFull) => void;
  onLogFollowup: (dealId: string, text: string) => void;
}

function NeedsAttentionSection({ deals, onOpenDeal, onLogFollowup }: NeedsAttentionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const slipping = useMemo(() => {
    return deals.filter(d => {
      if (!SLIPPING_STAGES.includes(d.stage)) return false;
      const lastActivity = d.last_touched ?? d.updated_at;
      const days = daysSince(lastActivity);
      return days === null || days >= 3;
    }).sort((a, b) => {
      const daysA = daysSince(a.last_touched ?? a.updated_at) ?? 999;
      const daysB = daysSince(b.last_touched ?? b.updated_at) ?? 999;
      return daysB - daysA;
    });
  }, [deals]);

  if (slipping.length === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: '#f0fdf4', border: '1px solid #6ee7b7', borderRadius: 12,
        padding: '12px 18px',
      }}>
        <CheckCircle2 size={16} color="#059669" />
        <span style={{ fontSize: '0.875rem', color: '#065f46', fontWeight: 600 }}>All deals on track ✓</span>
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 18px', background: '#fff7ed', borderBottom: '1px solid #fed7aa',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <AlertCircle size={16} color="#ea580c" />
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#9a3412' }}>
          {slipping.length} deal{slipping.length !== 1 ? 's' : ''} need{slipping.length === 1 ? 's' : ''} attention
        </span>
        <span style={{ fontSize: '0.75rem', color: '#c2410c' }}>No follow-up in 3+ days at key stages</span>
      </div>
      <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slipping.map(deal => {
          const orgName = deal.organization?.name ?? 'Unknown';
          const schoolName = deal.organization?.school?.name ?? '';
          const lastActivity = deal.last_touched ?? deal.updated_at;
          const days = daysSince(lastActivity);
          const isRed = days === null || days > 7;
          const isOpen = expandedId === deal.id;

          return (
            <div key={deal.id} style={{ background: '#fff', border: '1px solid #fed7aa', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827', cursor: 'pointer' }}
                      onClick={() => onOpenDeal(deal)}
                    >
                      {orgName}
                    </span>
                    {schoolName && <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{schoolName}</span>}
                    <StageBadge stage={deal.stage} />
                    <RepBadge rep={deal.assigned_to} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{
                    fontSize: '1rem', fontWeight: 800,
                    color: isRed ? '#dc2626' : '#d97706',
                  }}>
                    {days === null ? '∞' : days}d
                  </span>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : deal.id)}
                    style={{
                      padding: '5px 12px', borderRadius: 8, border: '1px solid #fed7aa',
                      background: '#fff7ed', color: '#9a3412', fontSize: '0.75rem', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}
                  >
                    Log Follow-up
                  </button>
                </div>
              </div>
              {isOpen && (
                <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="What happened or what's next…"
                    value={inputs[deal.id] ?? ''}
                    onChange={e => setInputs(prev => ({ ...prev, [deal.id]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const text = (inputs[deal.id] ?? '').trim();
                        if (text) {
                          onLogFollowup(deal.id, text);
                          setInputs(prev => ({ ...prev, [deal.id]: '' }));
                          setExpandedId(null);
                        }
                      }
                    }}
                    style={{
                      flex: 1, border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px',
                      fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', color: '#374151',
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      const text = (inputs[deal.id] ?? '').trim();
                      if (text) {
                        onLogFollowup(deal.id, text);
                        setInputs(prev => ({ ...prev, [deal.id]: '' }));
                        setExpandedId(null);
                      }
                    }}
                    disabled={!(inputs[deal.id] ?? '').trim()}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none',
                      background: (inputs[deal.id] ?? '').trim() ? '#9a3412' : '#e5e7eb',
                      color: '#fff', fontSize: '0.8rem', fontWeight: 700,
                      cursor: (inputs[deal.id] ?? '').trim() ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                    }}
                  >
                    Log
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Pipeline Kanban ───────────────────────────────────────────────────────────

interface PipelineKanbanProps {
  deals: PipelineDealFull[];
  archivedDeals: PipelineDealFull[];
  onOpenDeal: (deal: PipelineDealFull) => void;
}

function PipelineKanban({ deals, archivedDeals, onOpenDeal }: PipelineKanbanProps) {
  const [showArchived, setShowArchived] = useState(false);

  const byStage = useMemo(() => {
    const map: Record<DealStage, PipelineDealFull[]> = {
      lead: [], demo_booked: [], first_demo: [], second_call: [],
      contract_sent: [], closed_won: [], closed_lost: [], hold_off: [],
    };
    for (const deal of deals) {
      if (map[deal.stage]) map[deal.stage].push(deal);
    }
    return map;
  }, [deals]);

  return (
    <div>
      {/* Horizontal columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${PIPELINE_STAGES.length}, minmax(180px, 1fr))`,
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 8,
      }}>
        {PIPELINE_STAGES.map(stage => {
          const stageCfg = STAGE_COLORS[stage];
          const stageDeals = byStage[stage];
          return (
            <div key={stage} style={{ minWidth: 0 }}>
              {/* Column header */}
              <div style={{
                padding: '8px 12px', borderRadius: '10px 10px 0 0',
                background: stageCfg.bg, border: `1px solid ${stageCfg.border}`,
                borderBottom: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: stageCfg.color }}>{STAGE_LABELS[stage]}</span>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: '9999px',
                  background: stageCfg.color + '22', color: stageCfg.color,
                }}>
                  {stageDeals.length}
                </span>
              </div>
              {/* Cards */}
              <div style={{
                border: `1px solid ${stageCfg.border}`, borderRadius: '0 0 10px 10px',
                background: '#fafafa', padding: '8px', display: 'flex',
                flexDirection: 'column', gap: 8, minHeight: 80,
              }}>
                {stageDeals.length === 0 ? (
                  <div style={{ fontSize: '0.75rem', color: '#d1d5db', textAlign: 'center', padding: '16px 0', fontStyle: 'italic' }}>
                    Empty
                  </div>
                ) : (
                  stageDeals.map(deal => (
                    <DealCard key={deal.id} deal={deal} onClick={() => onOpenDeal(deal)} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Archived deals */}
      {archivedDeals.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowArchived(s => !s)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
              cursor: 'pointer', color: '#6b7280', fontSize: '0.8rem', fontWeight: 600,
              fontFamily: 'inherit', padding: '6px 0',
            }}
          >
            <ChevronDown
              size={14}
              style={{ transform: showArchived ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
            />
            Archived / Closed Lost ({archivedDeals.length})
          </button>
          {showArchived && (
            <div style={{
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10,
              marginTop: 8, display: 'flex', flexDirection: 'column', gap: 0, overflow: 'hidden',
            }}>
              {archivedDeals.map((deal, i) => (
                <div
                  key={deal.id}
                  onClick={() => onOpenDeal(deal)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                    borderBottom: i < archivedDeals.length - 1 ? '1px solid #f3f4f6' : 'none',
                    cursor: 'pointer', background: '#fff', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}
                >
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.8rem', color: '#374151' }}>
                    {deal.organization?.name ?? 'Unknown'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                    {deal.organization?.school?.name ?? ''}
                  </span>
                  <StageBadge stage={deal.stage} />
                  <RepBadge rep={deal.assigned_to} />
                  <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{relativeTime(deal.last_touched ?? deal.updated_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function SalesCRM() {
  const [deals, setDeals] = useState<PipelineDealFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('All');
  const [selectedDeal, setSelectedDeal] = useState<PipelineDealFull | null>(null);
  const [granolaNotes, setGranolaNotes] = useState<GranolaNote[] | null>(null);
  const granolaFetchedRef = useRef(false);

  // ── Fetch deals ──
  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline/deals?limit=200');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setDeals(data);
        return data as PipelineDealFull[];
      }
      return [];
    } catch (err) {
      console.error('[sales-crm] fetch deals error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  // ── Fetch Granola notes on mount ──
  useEffect(() => {
    if (granolaFetchedRef.current) return;
    granolaFetchedRef.current = true;
    fetch('/api/granola/notes')
      .then(r => r.json())
      .then((data: any) => {
        if (Array.isArray(data?.notes)) {
          setGranolaNotes(data.notes as GranolaNote[]);
        }
      })
      .catch(err => console.error('[sales-crm] granola error:', err));
  }, []);

  // ── PATCH deal ──
  async function patchDeal(dealId: string, updates: Record<string, any>) {
    try {
      await fetch(`/api/pipeline/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error('[sales-crm] patch error:', err);
    }
  }

  // ── Advance stage ──
  function handleAdvanceStage(dealId: string, stage: DealStage) {
    const now = new Date().toISOString();
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage, last_touched: now } : d));
    if (selectedDeal?.id === dealId) setSelectedDeal(prev => prev ? { ...prev, stage, last_touched: now } : null);
    patchDeal(dealId, { stage, last_touched: now });
  }

  // ── Log activity ──
  function handleLogActivity(dealId: string, text: string) {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    const existingNotes = parseDealNotes(deal.notes);
    const newNote: DealNote = { ts: new Date().toISOString(), text };
    const updatedNotes = [newNote, ...existingNotes];
    const notesJson = serializeDealNotes(updatedNotes);
    const now = new Date().toISOString();
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, notes: notesJson, last_touched: now } : d));
    if (selectedDeal?.id === dealId) setSelectedDeal(prev => prev ? { ...prev, notes: notesJson, last_touched: now } : null);
    patchDeal(dealId, { notes: notesJson, last_touched: now });
  }

  // ── Filters ──
  const { visibleDeals, archivedDeals } = useMemo(() => {
    let list = deals;
    if (ownerFilter !== 'All') list = list.filter(d => d.assigned_to === ownerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        (d.organization?.name ?? '').toLowerCase().includes(q) ||
        (d.organization?.school?.name ?? '').toLowerCase().includes(q) ||
        (d.contact?.name ?? '').toLowerCase().includes(q)
      );
    }
    const archived = list.filter(d => d.stage === 'closed_lost' || d.stage === 'hold_off');
    const visible = list.filter(d => d.stage !== 'closed_lost' && d.stage !== 'hold_off');
    return { visibleDeals: visible, archivedDeals: archived };
  }, [deals, ownerFilter, search]);

  // ── Stats ──
  const stats = useMemo(() => {
    const total = deals.filter(d => d.stage !== 'closed_lost' && d.stage !== 'hold_off').length;
    const pipeline = deals
      .filter(d => !['closed_lost', 'hold_off', 'closed_won'].includes(d.stage) && d.value)
      .reduce((s, d) => s + d.value, 0);
    const closed = deals.filter(d => d.stage === 'closed_won').length;
    const hot = deals.filter(d => ['first_demo', 'second_call', 'contract_sent'].includes(d.stage)).length;
    return { total, pipeline, closed, hot };
  }, [deals]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '10px', color: '#9ca3af' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
        Loading pipeline…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Stats Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        {[
          { label: 'Active Deals',   value: stats.total,          color: '#1e40af', bg: '#dbeafe' },
          { label: 'Hot (Demo+)',    value: stats.hot,            color: '#92400e', bg: '#fef3c7' },
          { label: 'Closed Won',     value: stats.closed,         color: '#065f46', bg: '#d1fae5' },
          { label: 'Pipeline Value', value: fmt$(stats.pipeline), color: '#5b21b6', bg: '#f5f3ff' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: stat.bg, border: `1px solid ${stat.color}30`,
            borderRadius: '12px', padding: '16px',
          }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: stat.color + 'aa', margin: '0 0 4px 0' }}>{stat.label}</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, color: stat.color, margin: 0, lineHeight: 1 }}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* ── Needs Attention (pinned top) ── */}
      <NeedsAttentionSection
        deals={deals}
        onOpenDeal={setSelectedDeal}
        onLogFollowup={handleLogActivity}
      />

      {/* ── Filter Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          flex: 1, minWidth: '200px', maxWidth: '360px',
          background: '#ffffff', border: '1px solid #e5e7eb',
          borderRadius: '10px', padding: '8px 12px',
        }}>
          <Search size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search org, school, contact…"
            style={{ border: 'none', outline: 'none', fontSize: '0.875rem', fontFamily: 'inherit', flex: 1, color: '#374151', background: 'transparent' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 0, display: 'flex' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['All', 'Owen', 'Ford', 'Adam', 'Katie', 'Hyatt', 'Team'].map(o => (
            <button
              key={o}
              onClick={() => setOwnerFilter(o)}
              style={{
                padding: '6px 14px', borderRadius: '8px', fontSize: '0.8125rem',
                fontWeight: ownerFilter === o ? 700 : 500, cursor: 'pointer',
                border: `1px solid ${ownerFilter === o ? '#0F172A' : '#e5e7eb'}`,
                background: ownerFilter === o ? '#0F172A' : '#ffffff',
                color: ownerFilter === o ? '#ffffff' : '#374151',
                fontFamily: 'inherit', transition: 'all 0.1s',
              }}
            >
              {o}
            </button>
          ))}
        </div>

        <button
          onClick={fetchDeals}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* ── Pipeline Kanban ── */}
      {deals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af', fontSize: '0.875rem' }}>
          No deals in pipeline yet
        </div>
      ) : (
        <PipelineKanban
          deals={visibleDeals}
          archivedDeals={archivedDeals}
          onOpenDeal={setSelectedDeal}
        />
      )}

      {/* ── Deal Detail Drawer ── */}
      {selectedDeal && (
        <DealDetailDrawer
          deal={selectedDeal}
          granolaNotesCache={granolaNotes}
          onClose={() => setSelectedDeal(null)}
          onAdvanceStage={handleAdvanceStage}
          onLogActivity={handleLogActivity}
        />
      )}
    </div>
  );
}
