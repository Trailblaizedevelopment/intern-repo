'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Phone, PhoneCall, PhoneMissed, PhoneOff, Voicemail,
  ChevronDown, ChevronUp, RefreshCw, CheckSquare, Square,
  X, LayoutDashboard, User, Clock, Users, AlertCircle,
  MessageSquare, Bell,
} from 'lucide-react';
import Link from 'next/link';
import { AlumniContact, Chapter } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

type ColumnStatus = 'not_called' | 'voicemail' | 'called' | 'declined';

interface CallLog {
  contactId: string;
  status: ColumnStatus;
  notes: string;
  tags: string[];
  calledBy: string;
  calledAt: string;
  followUpDate?: string;
  followUpCompleted?: boolean;
}

interface Claim {
  contactId: string;
  claimedBy: string;
  claimedAt: string;
}

interface Assignment {
  name: string;
  count: number;
}

interface SlidePanel {
  contact: AlumniContact;
  phase: 'actions' | 'logging';
  notes: string;
  tags: string[];
  tagInput: string;
  followUp: boolean;
  followUpDate: string;
  saving: boolean;
}

interface TodoItem {
  type: 'overdue_followup' | 'voicemail_callback' | 'assigned_uncalled';
  contactId: string;
  name: string;
  detail: string;
  completed: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const COLUMN_CONFIG: Record<ColumnStatus, {
  label: string;
  borderColor: string;
  badgeBg: string;
  badgeColor: string;
  headerBg: string;
}> = {
  not_called: {
    label: 'Not Called',
    borderColor: '#d1d5db',
    badgeBg: '#f3f4f6',
    badgeColor: '#6b7280',
    headerBg: '#f9fafb',
  },
  voicemail: {
    label: 'Voicemail Sent',
    borderColor: '#93c5fd',
    badgeBg: '#dbeafe',
    badgeColor: '#1d4ed8',
    headerBg: '#eff6ff',
  },
  called: {
    label: 'Called / Logged',
    borderColor: '#86efac',
    badgeBg: '#dcfce7',
    badgeColor: '#15803d',
    headerBg: '#f0fdf4',
  },
  declined: {
    label: 'Declined',
    borderColor: '#fca5a5',
    badgeBg: '#fee2e2',
    badgeColor: '#b91c1c',
    headerBg: '#fff1f2',
  },
};

const PREDEFINED_TAGS: { label: string; color: string; bg: string }[] = [
  { label: 'Hiring',            color: '#15803d', bg: '#dcfce7' },
  { label: 'Mentoring',         color: '#1d4ed8', bg: '#dbeafe' },
  { label: 'Looking to Connect',color: '#7c3aed', bg: '#ede9fe' },
  { label: 'Advice',            color: '#d97706', bg: '#fef3c7' },
  { label: 'Industry Expert',   color: '#0d9488', bg: '#ccfbf1' },
  { label: 'Wants to Help',     color: '#15803d', bg: '#f0fdf4' },
  { label: 'Event Interest',    color: '#db2777', bg: '#fce7f3' },
  { label: 'Referred Someone',  color: '#ea580c', bg: '#ffedd5' },
  { label: 'Posted on Platform',color: '#4f46e5', bg: '#e0e7ff' },
];

const TAG_COLOR_MAP: Record<string, { color: string; bg: string }> = {};
PREDEFINED_TAGS.forEach(t => { TAG_COLOR_MAP[t.label.toLowerCase()] = { color: t.color, bg: t.bg }; });

function getTagStyle(tag: string): { color: string; bg: string } {
  return TAG_COLOR_MAP[tag.toLowerCase()] ?? { color: '#6b7280', bg: '#f3f4f6' };
}

const STATUS_MAP: Record<ColumnStatus, string> = {
  not_called: 'not_contacted',
  voicemail:  'touch1_sent',
  called:     'responded',
  declined:   'opted_out',
};

const CALLER_NAMES = ['Owen', 'Ford', 'Adam', 'Katie', 'Hyatt', 'Zach', 'Other'];

// ─── localStorage Helpers ────────────────────────────────────────────────────

const LS = {
  callLogs:      'connects_call_logs_v2',
  claims:        'connects_claims_v2',
  assignments:   'connects_assignments_v2',
  currentUser:   'connects_current_user',
  todoCompleted: 'connects_todo_completed_v2',
};

function readCallLogs(): Record<string, CallLog> {
  try { return JSON.parse(localStorage.getItem(LS.callLogs) || '{}'); }
  catch { return {}; }
}
function writeCallLog(log: CallLog) {
  const all = readCallLogs();
  all[log.contactId] = log;
  localStorage.setItem(LS.callLogs, JSON.stringify(all));
}

function readClaims(): Record<string, Claim> {
  try {
    const raw: Record<string, Claim> = JSON.parse(localStorage.getItem(LS.claims) || '{}');
    const now = Date.now();
    const active: Record<string, Claim> = {};
    for (const [id, c] of Object.entries(raw)) {
      if (now - new Date(c.claimedAt).getTime() < 30 * 60 * 1000) active[id] = c;
    }
    return active;
  } catch { return {}; }
}
function writeClaim(contactId: string, by: string) {
  const all = readClaims();
  all[contactId] = { contactId, claimedBy: by, claimedAt: new Date().toISOString() };
  localStorage.setItem(LS.claims, JSON.stringify(all));
}
function deleteClaim(contactId: string) {
  const all = readClaims();
  delete all[contactId];
  localStorage.setItem(LS.claims, JSON.stringify(all));
}

function readAssignments(): Assignment[] {
  try { return JSON.parse(localStorage.getItem(LS.assignments) || '[]'); }
  catch { return []; }
}
function writeAssignments(a: Assignment[]) {
  localStorage.setItem(LS.assignments, JSON.stringify(a));
}

function readCurrentUser(): string { return localStorage.getItem(LS.currentUser) || 'Owen'; }
function saveCurrentUser(n: string) { localStorage.setItem(LS.currentUser, n); }

function readTodoCompleted(): string[] {
  try { return JSON.parse(localStorage.getItem(LS.todoCompleted) || '[]'); }
  catch { return []; }
}
function toggleTodoDone(key: string): string[] {
  const all = readTodoCompleted();
  const idx = all.indexOf(key);
  if (idx >= 0) all.splice(idx, 1); else all.push(key);
  localStorage.setItem(LS.todoCompleted, JSON.stringify(all));
  return [...all];
}

// ─── Status Derivation ───────────────────────────────────────────────────────

function getContactStatus(c: AlumniContact, logs: Record<string, CallLog>): ColumnStatus {
  if (logs[c.id]) return logs[c.id].status;
  const s = c.outreach_status;
  if (s === 'opted_out' || s === 'wrong_number') return 'declined';
  if (s === 'responded' || s === 'touch2_sent' || s === 'touch3_sent' || s === 'verified') return 'called';
  if (s === 'touch1_sent') return 'voicemail';
  return 'not_called';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtPhone(p: string | null): string {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}
function isOverdue(dateStr?: string): boolean {
  return !!dateStr && new Date(dateStr) < new Date();
}
function today(): string { return new Date().toISOString().slice(0, 10); }

// ─── Tag Pill ─────────────────────────────────────────────────────────────────

function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  const s = getTagStyle(tag);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 9999, fontSize: '0.7rem', fontWeight: 600, color: s.color, background: s.bg }}>
      {tag}
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: s.color, display: 'flex' }}>
          <X size={10} />
        </button>
      )}
    </span>
  );
}

// ─── Goal Bar ────────────────────────────────────────────────────────────────

function GoalBar({ callLogs, assignments }: { callLogs: Record<string, CallLog>; assignments: Assignment[] }) {
  const t = today();
  const personMap: Record<string, number> = {};
  for (const log of Object.values(callLogs)) {
    if (log.calledAt?.slice(0, 10) === t && (log.status === 'called' || log.status === 'voicemail')) {
      personMap[log.calledBy] = (personMap[log.calledBy] || 0) + 1;
    }
  }
  const total = Object.values(personMap).reduce((s, v) => s + v, 0);
  const pct = Math.min(100, Math.round((total / 100) * 100));
  const names = new Set([...Object.keys(personMap), ...assignments.map(a => a.name)]);

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 16, padding: '20px 24px', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Team Daily Goal — 100 Calls</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Array.from(names).map(name => {
            const called = personMap[name] || 0;
            const assigned = assignments.find(a => a.name === name)?.count || 0;
            return (
              <span key={name} style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 600 }}>
                <span style={{ color: '#111827' }}>{name}:</span>{' '}
                <span style={{ color: '#2563eb' }}>{called}</span>
                {assigned > 0 && <span style={{ color: '#9ca3af' }}>/{assigned}</span>}
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '2.5rem', fontWeight: 700, color: '#111827', lineHeight: 1 }}>{total}</span>
        <span style={{ fontSize: '1.25rem', color: '#9ca3af', fontWeight: 500 }}>/100</span>
      </div>
      <div style={{ background: '#F3F4F6', borderRadius: 9999, height: 8, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#10b981' : '#0F172A', borderRadius: 9999, transition: 'width 0.5s' }} />
      </div>
      <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '4px 0 0 0' }}>
        {total >= 100 ? '🎉 Goal reached!' : `${100 - total} more to hit the goal`}
      </p>
    </div>
  );
}

// ─── Assign Calls Panel ──────────────────────────────────────────────────────

function AssignCallsPanel({ assignments, callLogs, onUpdate }: {
  assignments: Assignment[];
  callLogs: Record<string, CallLog>;
  onUpdate: (a: Assignment[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCount, setNewCount] = useState('');
  const t = today();

  function calledToday(name: string) {
    return Object.values(callLogs).filter(
      l => l.calledBy === name && l.calledAt?.slice(0, 10) === t && (l.status === 'called' || l.status === 'voicemail')
    ).length;
  }
  function add() {
    if (!newName.trim() || !newCount) return;
    const updated = [...assignments.filter(a => a.name !== newName.trim()), { name: newName.trim(), count: parseInt(newCount) }];
    onUpdate(updated);
    setNewName(''); setNewCount('');
  }

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, marginBottom: '1.5rem', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={16} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Assign Calls</span>
          {assignments.length > 0 && (
            <span style={{ fontSize: '0.7rem', background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 9999, fontWeight: 600 }}>
              {assignments.length} person{assignments.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} style={{ color: '#9ca3af' }} /> : <ChevronDown size={16} style={{ color: '#9ca3af' }} />}
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px' }}>
          {assignments.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {assignments.map(a => {
                const done = calledToday(a.name);
                const pct = Math.min(100, Math.round((done / a.count) * 100));
                return (
                  <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', width: 90, flexShrink: 0 }}>{a.name}</span>
                    <div style={{ flex: 1, minWidth: 80 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{done}/{a.count}</span>
                        <span style={{ fontSize: '0.75rem', color: pct >= 100 ? '#15803d' : '#9ca3af' }}>{pct}%</span>
                      </div>
                      <div style={{ background: '#F3F4F6', borderRadius: 9999, height: 6 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#10b981' : '#0F172A', borderRadius: 9999, transition: 'width 0.4s' }} />
                      </div>
                    </div>
                    <button onClick={() => onUpdate(assignments.filter(x => x.name !== a.name))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 4, display: 'flex' }}>
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (e.g. Katie)" style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', outline: 'none', width: 140, fontFamily: 'inherit' }} />
            <input type="number" value={newCount} onChange={e => setNewCount(e.target.value)} placeholder="# calls" style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', outline: 'none', width: 80, fontFamily: 'inherit' }} />
            <button onClick={add} style={{ padding: '6px 14px', background: '#0F172A', color: 'white', border: 'none', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Daily To-Do ──────────────────────────────────────────────────────────────

function DailyTodo({ contacts, callLogs, currentUser, assignments, completed, onToggle }: {
  contacts: AlumniContact[];
  callLogs: Record<string, CallLog>;
  currentUser: string;
  assignments: Assignment[];
  completed: string[];
  onToggle: (key: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const t = today();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const todos: TodoItem[] = [];

  for (const c of contacts) {
    const log = callLogs[c.id];
    const name = `${c.first_name} ${c.last_name}`;
    if (log?.followUpDate && !log.followUpCompleted && isOverdue(log.followUpDate)) {
      todos.push({ type: 'overdue_followup', contactId: c.id, name, detail: `Follow-up was due ${log.followUpDate}`, completed: completed.includes(`fu_${c.id}`) });
    }
    if (log?.status === 'voicemail' && log.calledAt && log.calledAt < twoDaysAgo) {
      todos.push({ type: 'voicemail_callback', contactId: c.id, name, detail: `Voicemail sent ${new Date(log.calledAt).toLocaleDateString()}`, completed: completed.includes(`vm_${c.id}`) });
    }
  }

  const myAssign = assignments.find(a => a.name === currentUser);
  if (myAssign) {
    const calledByMe = Object.values(callLogs).filter(l => l.calledBy === currentUser && l.calledAt?.slice(0, 10) === t).length;
    if (calledByMe < myAssign.count) {
      todos.push({ type: 'assigned_uncalled', contactId: '', name: `${myAssign.count - calledByMe} calls remaining`, detail: `You have ${myAssign.count - calledByMe} assigned calls left today`, completed: completed.includes('quota') });
    }
  }

  if (todos.length === 0) return null;

  const pending = todos.filter(t => !t.completed).length;
  const typeConfig = {
    overdue_followup:  { icon: <AlertCircle size={13} />, color: '#b91c1c', bg: '#fee2e2', label: 'Overdue Follow-Up' },
    voicemail_callback:{ icon: <Voicemail size={13} />,   color: '#1d4ed8', bg: '#dbeafe', label: 'Voicemail Callback' },
    assigned_uncalled: { icon: <Users size={13} />,       color: '#d97706', bg: '#fef3c7', label: 'Assigned' },
  };

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, marginBottom: '1.5rem', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bell size={16} style={{ color: '#d97706' }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Daily To-Do</span>
          {pending > 0 && (
            <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 9999, fontWeight: 600 }}>
              {pending} pending
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} style={{ color: '#9ca3af' }} /> : <ChevronDown size={16} style={{ color: '#9ca3af' }} />}
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {todos.map(todo => {
            const key = todo.type === 'overdue_followup' ? `fu_${todo.contactId}` : todo.type === 'voicemail_callback' ? `vm_${todo.contactId}` : 'quota';
            const cfg = typeConfig[todo.type];
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', borderRadius: 8, background: todo.completed ? '#f9fafb' : cfg.bg, opacity: todo.completed ? 0.6 : 1 }}>
                <button onClick={() => onToggle(key)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: todo.completed ? '#9ca3af' : cfg.color, flexShrink: 0, marginTop: 2, display: 'flex' }}>
                  {todo.completed ? <CheckSquare size={15} /> : <Square size={15} />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 600, color: cfg.color, background: 'white', padding: '1px 7px', borderRadius: 9999, border: `1px solid ${cfg.color}30` }}>
                      {cfg.icon}{cfg.label}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', textDecoration: todo.completed ? 'line-through' : 'none' }}>{todo.name}</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '2px 0 0 0' }}>{todo.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Contact Card ─────────────────────────────────────────────────────────────

function ContactCard({ contact, log, claim, onClick }: {
  contact: AlumniContact;
  log: CallLog | undefined;
  claim: Claim | undefined;
  onClick: () => void;
}) {
  const name = `${contact.first_name} ${contact.last_name}`;
  const year = contact.grad_year || contact.year;
  const overdueFollowUp = log?.followUpDate && !log.followUpCompleted && isOverdue(log.followUpDate);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', opacity: log?.status === 'declined' ? 0.65 : 1, transition: 'border-color 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#9ca3af')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
    >
      {/* Name + year */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>{name}</span>
        {year && <span style={{ fontSize: '0.7rem', color: '#9ca3af', flexShrink: 0 }}>&apos;{String(year).slice(-2)}</span>}
      </div>

      {/* Major */}
      {contact.major && (
        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{contact.major}</div>
      )}

      {/* Location */}
      {contact.location_city && (
        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>{contact.location_city}</div>
      )}

      {/* Note preview */}
      {log?.notes && (
        <div style={{ fontSize: '0.75rem', color: '#374151', marginTop: 6, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {log.notes}
        </div>
      )}

      {/* Tags */}
      {log?.tags && log.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {log.tags.slice(0, 3).map(t => <TagPill key={t} tag={t} />)}
          {log.tags.length > 3 && <span style={{ fontSize: '0.7rem', color: '#9ca3af', alignSelf: 'center' }}>+{log.tags.length - 3}</span>}
        </div>
      )}

      {/* Follow-up */}
      {log?.followUpDate && (
        <div style={{ fontSize: '0.7rem', fontWeight: 600, marginTop: 6, padding: '2px 8px', borderRadius: 9999, display: 'inline-block', background: overdueFollowUp ? '#fef3c7' : '#f0fdf4', color: overdueFollowUp ? '#92400e' : '#15803d' }}>
          {overdueFollowUp ? '⚠️ ' : '📅 '}Follow-up: {log.followUpDate}
        </div>
      )}

      {/* Claim */}
      {claim && (
        <div style={{ marginTop: 6, fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic' }}>
          🔒 Claimed by {claim.claimedBy} — {Math.round((Date.now() - new Date(claim.claimedAt).getTime()) / 60000)}m ago
        </div>
      )}
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ status, contacts, callLogs, claims, onCardClick }: {
  status: ColumnStatus;
  contacts: AlumniContact[];
  callLogs: Record<string, CallLog>;
  claims: Record<string, Claim>;
  onCardClick: (c: AlumniContact) => void;
}) {
  const cfg = COLUMN_CONFIG[status];
  return (
    <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: cfg.headerBg, border: `1px solid ${cfg.borderColor}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827' }}>{cfg.label}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.badgeColor, background: cfg.badgeBg, padding: '2px 8px', borderRadius: 9999 }}>{contacts.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 'calc(100vh - 380px)', paddingBottom: 8 }}>
        {contacts.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#d1d5db', fontSize: '0.8125rem' }}>No contacts</div>
        ) : contacts.map(c => (
          <ContactCard key={c.id} contact={c} log={callLogs[c.id]} claim={claims[c.id]} onClick={() => onCardClick(c)} />
        ))}
      </div>
    </div>
  );
}

// ─── Slide-Out Panel ──────────────────────────────────────────────────────────

function SlideOutPanel({ panel, currentUser, onClose, onStatusChange, onSaveLog, onStartCall, onChange }: {
  panel: SlidePanel;
  currentUser: string;
  onClose: () => void;
  onStatusChange: (s: ColumnStatus) => void;
  onSaveLog: () => void;
  onStartCall: () => void;
  onChange: (u: Partial<SlidePanel>) => void;
}) {
  const c = panel.contact;
  const name = `${c.first_name} ${c.last_name}`;
  const year = c.grad_year || c.year;
  const phone = c.phone_primary || c.phone_secondary;
  const followUpText = `Hey ${c.first_name}, great talking today! Here's the link to join: [chapter join link]. Would love for you to share it with other alumni too.`;

  function toggleTag(tag: string) {
    if (panel.tags.includes(tag)) onChange({ tags: panel.tags.filter(t => t !== tag) });
    else onChange({ tags: [...panel.tags, tag] });
  }
  function addCustomTag(tag: string) {
    const t = tag.trim();
    if (!t || panel.tags.includes(t)) { onChange({ tagInput: '' }); return; }
    onChange({ tags: [...panel.tags, t], tagInput: '' });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 49 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw', background: 'white', zIndex: 50, boxShadow: '-4px 0 32px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB', flexShrink: 0, background: 'white', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>{name}</h2>
              {year && <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Class of &apos;{String(year).slice(-2)}</span>}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#9ca3af', display: 'flex', flexShrink: 0 }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {c.major && <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>{c.major}</div>}
            {c.location_city && <div style={{ fontSize: '0.8125rem', color: '#6b7280' }}>📍 {c.location_city}</div>}
            {phone ? (
              <a href={`tel:${phone}`} onClick={onStartCall} style={{ fontSize: '0.9rem', color: '#2563eb', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Phone size={15} />
                {fmtPhone(phone)}
              </a>
            ) : (
              <span style={{ fontSize: '0.8rem', color: '#d1d5db', marginTop: 4 }}>No phone number</span>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {panel.phase === 'actions' ? (
            <div>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>What happened on this call?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Voicemail */}
                <button
                  onClick={() => onStatusChange('voicemail')}
                  style={{ padding: '14px 16px', borderRadius: 10, border: '1.5px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <Voicemail size={20} />
                  <div>
                    <div>No Answer / Voicemail</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 400, color: '#60a5fa', marginTop: 2 }}>Moves to Voicemail Sent column</div>
                  </div>
                </button>
                {/* Answered */}
                <button
                  onClick={() => onChange({ phase: 'logging' })}
                  style={{ padding: '14px 16px', borderRadius: 10, border: '1.5px solid #86efac', background: '#f0fdf4', color: '#15803d', fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <PhoneCall size={20} />
                  <div>
                    <div>Answered</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 400, color: '#4ade80', marginTop: 2 }}>Log the conversation</div>
                  </div>
                </button>
                {/* Declined */}
                <button
                  onClick={() => onStatusChange('declined')}
                  style={{ padding: '14px 16px', borderRadius: 10, border: '1.5px solid #fca5a5', background: '#fff1f2', color: '#b91c1c', fontWeight: 600, fontSize: '0.9375rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textAlign: 'left' }}
                >
                  <PhoneOff size={20} />
                  <div>
                    <div>Declined</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 400, color: '#f87171', marginTop: 2 }}>Asked not to be contacted</div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            /* Logging Form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => onChange({ phase: 'actions' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 0 }}>
                  <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>✅ They Answered — Log It</p>
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notes</label>
                <textarea
                  value={panel.notes}
                  onChange={e => onChange({ notes: e.target.value })}
                  placeholder="What did you talk about? What did they say? Industry, hiring, open to connecting..."
                  rows={4}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', color: '#111827', background: '#fff', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>

              {/* Tags — the gold */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Tags — the gold 🏆
                </label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {PREDEFINED_TAGS.map(pt => {
                    const sel = panel.tags.includes(pt.label);
                    return (
                      <button
                        key={pt.label}
                        onClick={() => toggleTag(pt.label)}
                        style={{ padding: '7px 13px', borderRadius: 9999, border: sel ? `2px solid ${pt.color}` : '1.5px solid #E5E7EB', background: sel ? pt.bg : '#fff', color: sel ? pt.color : '#6b7280', fontSize: '0.8125rem', fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}
                      >
                        {sel && '✓ '}{pt.label}
                      </button>
                    );
                  })}
                </div>
                {/* Custom tags */}
                {panel.tags.filter(t => !PREDEFINED_TAGS.map(p => p.label).includes(t)).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {panel.tags.filter(t => !PREDEFINED_TAGS.map(p => p.label).includes(t)).map(t => (
                      <TagPill key={t} tag={t} onRemove={() => onChange({ tags: panel.tags.filter(x => x !== t) })} />
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={panel.tagInput}
                    onChange={e => onChange({ tagInput: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCustomTag(panel.tagInput); } }}
                    placeholder="Custom tag... (press Enter)"
                    style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', outline: 'none', flex: 1, fontFamily: 'inherit' }}
                  />
                  <button onClick={() => addCustomTag(panel.tagInput)} style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>Add</button>
                </div>
              </div>

              {/* Follow-up */}
              <div>
                <button
                  onClick={() => onChange({ followUp: !panel.followUp })}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: panel.followUp ? '#2563eb' : '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}
                >
                  {panel.followUp ? <CheckSquare size={16} /> : <Square size={16} />}
                  Schedule follow-up
                </button>
                {panel.followUp && (
                  <input
                    type="date"
                    value={panel.followUpDate}
                    onChange={e => onChange({ followUpDate: e.target.value })}
                    style={{ display: 'block', marginTop: 8, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', outline: 'none', background: '#fff', fontFamily: 'inherit' }}
                  />
                )}
              </div>

              {/* Follow-up text */}
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', margin: '0 0 6px 0', letterSpacing: '0.04em' }}>Follow-Up Text Template</p>
                <p style={{ fontSize: '0.8125rem', color: '#374151', margin: '0 0 10px 0', lineHeight: 1.5 }}>{followUpText}</p>
                <button
                  onClick={() => { try { navigator.clipboard.writeText(followUpText); } catch {} }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'white', border: '1px solid #86efac', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, color: '#15803d', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <MessageSquare size={12} />
                  Copy Text
                </button>
              </div>

              {/* Save */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => onChange({ phase: 'actions' })} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Back
                </button>
                <button
                  onClick={onSaveLog}
                  disabled={panel.saving}
                  style={{ flex: 2, padding: '10px', borderRadius: 8, background: panel.saving ? '#e5e7eb' : '#0F172A', color: panel.saving ? '#9ca3af' : '#fff', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: panel.saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
                >
                  {panel.saving ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />Saving...</> : 'Save & Close'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConnectsCenter() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [contacts, setContacts] = useState<AlumniContact[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // localStorage state — hydrated on mount
  const [callLogs, setCallLogs] = useState<Record<string, CallLog>>({});
  const [claims, setClaims] = useState<Record<string, Claim>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [currentUser, setCurrentUserState] = useState<string>('Owen');
  const [todoCompleted, setTodoCompleted] = useState<string[]>([]);

  // UI
  const [slidePanel, setSlidePanel] = useState<SlidePanel | null>(null);

  // Hydrate localStorage
  useEffect(() => {
    setCallLogs(readCallLogs());
    setClaims(readClaims());
    setAssignments(readAssignments());
    setCurrentUserState(readCurrentUser());
    setTodoCompleted(readTodoCompleted());
  }, []);

  // Refresh claims every minute to auto-expire
  useEffect(() => {
    const id = setInterval(() => setClaims(readClaims()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Load chapters
  useEffect(() => {
    (async () => {
      setLoadingChapters(true);
      try {
        const res = await fetch('/api/chapters?status=active');
        const data = await res.json();
        setChapters(data.data || data || []);
      } catch (e) { console.error(e); }
      setLoadingChapters(false);
    })();
  }, []);

  // Load contacts
  const loadContacts = useCallback(async (chapterId: string) => {
    setLoadingContacts(true);
    try {
      const first = await fetch(`/api/alumni-contacts?chapter_id=${chapterId}&limit=1`);
      const fj = await first.json();
      const total: number = fj.data?.total ?? 500;
      const ps = 500;
      const all: AlumniContact[] = [];
      for (let p = 0; p < Math.ceil(total / ps); p++) {
        const res = await fetch(`/api/alumni-contacts?chapter_id=${chapterId}&limit=${ps}&offset=${p * ps}`);
        const j = await res.json();
        const batch: AlumniContact[] = j.data?.contacts ?? j.data ?? [];
        all.push(...batch);
        if (batch.length < ps) break;
      }
      setContacts(all);
    } catch (e) { console.error(e); }
    setLoadingContacts(false);
  }, []);

  useEffect(() => {
    if (selectedChapterId) {
      setSlidePanel(null);
      loadContacts(selectedChapterId);
    } else {
      setContacts([]);
    }
  }, [selectedChapterId, loadContacts]);

  // Bucket contacts into columns
  const cols: Record<ColumnStatus, AlumniContact[]> = { not_called: [], voicemail: [], called: [], declined: [] };
  for (const c of contacts) cols[getContactStatus(c, callLogs)].push(c);

  // Open slide panel
  function openPanel(contact: AlumniContact) {
    const existing = callLogs[contact.id];
    setSlidePanel({
      contact,
      phase: 'actions',
      notes: existing?.notes || '',
      tags: existing?.tags || [],
      tagInput: '',
      followUp: !!existing?.followUpDate,
      followUpDate: existing?.followUpDate || '',
      saving: false,
    });
  }

  // Quick status change (voicemail/declined — no notes needed)
  async function handleStatusChange(status: ColumnStatus) {
    if (!slidePanel) return;
    const { contact } = slidePanel;
    const log: CallLog = { contactId: contact.id, status, notes: '', tags: [], calledBy: currentUser, calledAt: new Date().toISOString() };
    writeCallLog(log);
    setCallLogs(prev => ({ ...prev, [contact.id]: log }));
    setSlidePanel(null);
    try {
      await fetch(`/api/alumni-contacts/${contact.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outreach_status: STATUS_MAP[status] }) });
    } catch (e) { console.error(e); }
  }

  // Save full call log (answered)
  async function saveLog() {
    if (!slidePanel) return;
    setSlidePanel(prev => prev ? { ...prev, saving: true } : prev);
    const { contact } = slidePanel;
    const log: CallLog = {
      contactId: contact.id,
      status: 'called',
      notes: slidePanel.notes,
      tags: slidePanel.tags,
      calledBy: currentUser,
      calledAt: new Date().toISOString(),
      followUpDate: slidePanel.followUp && slidePanel.followUpDate ? slidePanel.followUpDate : undefined,
      followUpCompleted: false,
    };
    writeCallLog(log);
    setCallLogs(prev => ({ ...prev, [contact.id]: log }));
    deleteClaim(contact.id);
    setClaims(prev => { const n = { ...prev }; delete n[contact.id]; return n; });

    const tagsStr = log.tags.length ? `\nTags: ${log.tags.join(', ')}` : '';
    const fuStr = log.followUpDate ? `\nFollow-up: ${log.followUpDate}` : '';
    const responseText = `[answered] ${log.notes}${tagsStr}${fuStr}`.trim();
    try {
      await fetch(`/api/alumni-contacts/${contact.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outreach_status: STATUS_MAP['called'], response_text: responseText }) });
    } catch (e) { console.error(e); }
    setSlidePanel(null);
  }

  // Claim on phone tap
  function handleStartCall() {
    if (!slidePanel) return;
    writeClaim(slidePanel.contact.id, currentUser);
    setClaims(prev => ({ ...prev, [slidePanel.contact.id]: { contactId: slidePanel.contact.id, claimedBy: currentUser, claimedAt: new Date().toISOString() } }));
  }

  function handleAssignmentsUpdate(a: Assignment[]) {
    writeAssignments(a);
    setAssignments(a);
  }

  function handleTodoToggle(key: string) {
    setTodoCompleted(toggleTodoDone(key));
  }

  function handleCurrentUserChange(name: string) {
    saveCurrentUser(name);
    setCurrentUserState(name);
  }

  return (
    <div className="module-page">
      {/* Header */}
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/workspace" className="module-back">
              <LayoutDashboard size={20} />
              Back to Workspace
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <Phone size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1>Connects Center</h1>
                {/* Caller identity picker */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 10px' }}>
                  <User size={13} style={{ color: '#6b7280' }} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Calling as:</span>
                  <select
                    value={currentUser}
                    onChange={e => handleCurrentUserChange(e.target.value)}
                    style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827', background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {CALLER_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <p>Kanban call pipeline — log outcomes, build relationship intel, hit 100 calls/day.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">

        {/* Goal Bar */}
        <GoalBar callLogs={callLogs} assignments={assignments} />

        {/* Assign Calls */}
        <AssignCallsPanel assignments={assignments} callLogs={callLogs} onUpdate={handleAssignmentsUpdate} />

        {/* Daily To-Do */}
        {contacts.length > 0 && (
          <DailyTodo
            contacts={contacts}
            callLogs={callLogs}
            currentUser={currentUser}
            assignments={assignments}
            completed={todoCompleted}
            onToggle={handleTodoToggle}
          />
        )}

        {/* Chapter Selector */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px 0' }}>Select Chapter</p>
          {loadingChapters ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ height: 56, width: 180, background: '#f3f4f6', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />)}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {chapters.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => setSelectedChapterId(ch.id === selectedChapterId ? '' : ch.id)}
                  style={{ padding: '10px 16px', borderRadius: 12, border: `1.5px solid ${ch.id === selectedChapterId ? '#0F172A' : '#E5E7EB'}`, background: ch.id === selectedChapterId ? '#0F172A' : 'white', color: ch.id === selectedChapterId ? 'white' : '#111827', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', textAlign: 'left' }}
                >
                  <div style={{ fontWeight: 700 }}>{ch.fraternity || ch.chapter_name}</div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 2 }}>{ch.school}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Kanban Board */}
        {!selectedChapterId ? (
          <div className="module-empty-state" style={{ marginTop: '3rem' }}>
            <Phone size={48} />
            <h3>Select a chapter to begin</h3>
            <p>Choose a chapter above to load the call pipeline.</p>
          </div>
        ) : loadingContacts ? (
          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 44, background: '#f3f4f6', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />
                {Array.from({ length: 5 }).map((_, j) => <div key={j} style={{ height: 76, background: '#f3f4f6', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />)}
              </div>
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="module-empty-state">
            <User size={48} />
            <h3>No alumni contacts found</h3>
            <p>This chapter doesn&apos;t have any alumni contacts yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 'max-content' }}>
              {(['not_called', 'voicemail', 'called', 'declined'] as ColumnStatus[]).map(status => (
                <KanbanColumn
                  key={status}
                  status={status}
                  contacts={cols[status]}
                  callLogs={callLogs}
                  claims={claims}
                  onCardClick={openPanel}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Slide-out panel */}
      {slidePanel && (
        <SlideOutPanel
          panel={slidePanel}
          currentUser={currentUser}
          onClose={() => setSlidePanel(null)}
          onStatusChange={handleStatusChange}
          onSaveLog={saveLog}
          onStartCall={handleStartCall}
          onChange={u => setSlidePanel(prev => prev ? { ...prev, ...u } : prev)}
        />
      )}
    </div>
  );
}
