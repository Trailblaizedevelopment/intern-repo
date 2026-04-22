'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Phone, PhoneCall, Voicemail,
  ChevronDown, ChevronUp, RefreshCw, CheckSquare, Square,
  X, LayoutDashboard, User, Users, AlertCircle,
  MessageSquare, Bell, Share2, Globe,
} from 'lucide-react';
import Link from 'next/link';

// ─── Types ──────────────────────────────────────────────────────────────────

type ColumnStatus = 'not_called' | 'voicemail' | 'called' | 'declined' | 'pending_connect' | 'connected';
type ActiveView = 'call_center' | 'web';

interface MergedAlumni {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  avatar_url: string | null;
  grad_year: number | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  outreach_status: string;
  platform_joined: boolean;
  last_active_at: string | null;
  member_status: string | null;
  engagement_score: number;
  chapter_name?: string; // added client-side for All Chapters view
}

interface Chapter {
  id: string;
  chapter_name?: string;
  fraternity?: string;
  school?: string;
}

interface ContactSnapshot {
  name: string;
  avatarUrl: string | null;
  location: string | null;
  gradYear: number | null;
  memberStatus: string | null;
  chapterName?: string;
}

interface CallLog {
  contactId: string;
  status: ColumnStatus;
  notes: string;
  tags: string[];
  calledBy: string;
  calledAt: string;
  followUpDate?: string;
  followUpCompleted?: boolean;
  contactSnapshot?: ContactSnapshot;
}

interface PendingConnectEntry {
  id: string;
  personName: string;
  connectWithName: string;
  connectType: 'Job' | 'Mentoring' | 'Advice' | 'Networking';
  createdAt: string;
  createdBy: string;
}

interface ConnectedEntry {
  id: string;
  person1Name: string;
  person2Name: string;
  connectType: 'Job' | 'Mentoring' | 'Advice' | 'Networking';
  connectedAt: string;
}

interface SeedEntry {
  name: string;
  chapter: string;
  status: string;
  outcome: 'answered' | 'voicemail' | 'declined';
  calledBy: string;
  calledAt: string;
  notes: string;
  tags: string[];
  followUp: string | null;
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

interface LinqMessageClient {
  id: string;
  is_from_me: boolean;
  text: string;
  created_at: string;
}

interface TextingState {
  contact: MergedAlumni;
  selectedLine: 'Owen' | 'Ford';
  template: 'welcome' | 'followup' | 'checkin' | 'custom';
  message: string;
  sending: boolean;
  sent: boolean;
  chatId: string | null;
  messages: LinqMessageClient[];
  loadingHistory: boolean;
  error: string | null;
}

interface LoggingState {
  contact: MergedAlumni;
  notes: string;
  tags: string[];
  tagInput: string;
  followUp: boolean;
  followUpDate: string;
  saving: boolean;
}

interface WebNode {
  id: string;
  name: string;
  avatarUrl: string | null;
  tags: string[];
  location: string | null;
  gradYear: number | null;
  memberStatus: string | null;
  chapterName?: string;
  notes: string;
  connectionCount: number;
  x: number;
  y: number;
  radius: number;
}

interface WebEdge {
  from: string;
  to: string;
  degree: 1 | 2 | 3;
  sharedContext: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const COLUMN_CONFIG: Record<ColumnStatus, {
  label: string; borderColor: string; badgeBg: string; badgeColor: string; headerBg: string;
}> = {
  not_called: { label: 'Not Called',     borderColor: '#d1d5db', badgeBg: '#f3f4f6', badgeColor: '#6b7280', headerBg: '#f9fafb' },
  voicemail:  { label: 'Voicemail Sent', borderColor: '#93c5fd', badgeBg: '#dbeafe', badgeColor: '#1d4ed8', headerBg: '#eff6ff' },
  called:     { label: 'Called / Logged',borderColor: '#86efac', badgeBg: '#dcfce7', badgeColor: '#15803d', headerBg: '#f0fdf4' },
  declined:        { label: 'Declined',          borderColor: '#fca5a5', badgeBg: '#fee2e2', badgeColor: '#b91c1c', headerBg: '#fff1f2' },
  pending_connect: { label: 'Pending Connects',   borderColor: '#8B5CF6', badgeBg: '#ede9fe', badgeColor: '#7c3aed', headerBg: '#f5f3ff' },
  connected:       { label: 'Connected',           borderColor: '#10B981', badgeBg: '#d1fae5', badgeColor: '#065f46', headerBg: '#ecfdf5' },
};

const PREDEFINED_TAGS: { label: string; color: string; bg: string }[] = [
  { label: 'Hiring',             color: '#15803d', bg: '#dcfce7' },
  { label: 'Mentoring',          color: '#1d4ed8', bg: '#dbeafe' },
  { label: 'Looking to Connect', color: '#7c3aed', bg: '#ede9fe' },
  { label: 'Advice',             color: '#d97706', bg: '#fef3c7' },
  { label: 'Industry Expert',    color: '#0d9488', bg: '#ccfbf1' },
  { label: 'Wants to Help',      color: '#15803d', bg: '#f0fdf4' },
  { label: 'Event Interest',     color: '#db2777', bg: '#fce7f3' },
  { label: 'Referred Someone',   color: '#ea580c', bg: '#ffedd5' },
  { label: 'Posted on Platform', color: '#4f46e5', bg: '#e0e7ff' },
];

const TAG_COLOR_MAP: Record<string, { color: string; bg: string }> = {};
PREDEFINED_TAGS.forEach(t => { TAG_COLOR_MAP[t.label.toLowerCase()] = { color: t.color, bg: t.bg }; });
function getTagStyle(tag: string): { color: string; bg: string } {
  return TAG_COLOR_MAP[tag.toLowerCase()] ?? { color: '#6b7280', bg: '#f3f4f6' };
}

const INDUSTRY_TAGS = ['Hiring', 'Industry Expert', 'Mentoring'];
const CALLER_NAMES = ['Owen', 'Ford', 'Adam', 'Katie', 'Hyatt', 'Zach', 'Other'];
const DEGREE_COLORS: Record<1 | 2 | 3, string> = {
  1: '#EF4444', // 1st degree — same chapter (red)
  2: '#F59E0B', // 2nd degree — same school or org (amber)
  3: '#3B82F6', // 3rd degree — shared network (blue)
};

// ─── localStorage ─────────────────────────────────────────────────────────────

const LS = {
  callLogs:       'connects_call_logs_v3',
  claims:         'connects_claims_v3',
  assignments:    'connects_assignments_v3',
  currentUser:    'connects_current_user',
  todoCompleted:  'connects_todo_completed_v3',
  pendingConnects:'connects_pending_v3',
  connected:      'connects_connected_v3',
};
const SEED_FLAG = 'connects_seeded_v5';

function readCallLogs(): Record<string, CallLog> {
  try { return JSON.parse(localStorage.getItem(LS.callLogs) || '{}'); } catch { return {}; }
}
function writeCallLog(log: CallLog) {
  const all = readCallLogs(); all[log.contactId] = log;
  localStorage.setItem(LS.callLogs, JSON.stringify(all));
}

function readClaims(): Record<string, Claim> {
  try {
    const raw: Record<string, Claim> = JSON.parse(localStorage.getItem(LS.claims) || '{}');
    const now = Date.now(); const active: Record<string, Claim> = {};
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
  const all = readClaims(); delete all[contactId];
  localStorage.setItem(LS.claims, JSON.stringify(all));
}

function readAssignments(): Assignment[] {
  try { return JSON.parse(localStorage.getItem(LS.assignments) || '[]'); } catch { return []; }
}
function writeAssignments(a: Assignment[]) { localStorage.setItem(LS.assignments, JSON.stringify(a)); }
function readCurrentUser(): string { return localStorage.getItem(LS.currentUser) || 'Owen'; }
function saveCurrentUser(n: string) { localStorage.setItem(LS.currentUser, n); }
function readTodoCompleted(): string[] {
  try { return JSON.parse(localStorage.getItem(LS.todoCompleted) || '[]'); } catch { return []; }
}
function toggleTodoDone(key: string): string[] {
  const all = readTodoCompleted(); const idx = all.indexOf(key);
  if (idx >= 0) all.splice(idx, 1); else all.push(key);
  localStorage.setItem(LS.todoCompleted, JSON.stringify(all));
  return [...all];
}

function readPendingConnects(): PendingConnectEntry[] {
  try { return JSON.parse(localStorage.getItem(LS.pendingConnects) || '[]'); } catch { return []; }
}
function writePendingConnects(entries: PendingConnectEntry[]) {
  localStorage.setItem(LS.pendingConnects, JSON.stringify(entries));
}
function readConnected(): ConnectedEntry[] {
  try { return JSON.parse(localStorage.getItem(LS.connected) || '[]'); } catch { return []; }
}
function writeConnected(entries: ConnectedEntry[]) {
  localStorage.setItem(LS.connected, JSON.stringify(entries));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPhone(p: string | null): string {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}
function isOverdue(dateStr?: string): boolean { return !!dateStr && new Date(dateStr) < new Date(); }
function today(): string { return new Date().toISOString().slice(0, 10); }
function getContactStatus(c: MergedAlumni, logs: Record<string, CallLog>): ColumnStatus {
  // Check by ID first, then by name (seed data uses name as key)
  if (logs[c.id]) return logs[c.id].status;
  const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
  if (fullName && logs[fullName]) return logs[fullName].status;
  return 'not_called';
}
function getInitials(name: string): string {
  const p = name.trim().split(' ');
  if (p.length >= 2) return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
  return (name.slice(0, 2) || '?').toUpperCase();
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AvatarImg({ avatarUrl, name, size = 40 }: { avatarUrl: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = getInitials(name);
  const bgColors = ['#0F172A', '#1d4ed8', '#0d9488', '#7c3aed', '#db2777'];
  const bg = bgColors[(name.charCodeAt(0) || 0) % bgColors.length];
  if (avatarUrl && !err) {
    return <img src={avatarUrl} alt={name} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #E5E7EB' }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.35, flexShrink: 0, border: '2px solid #E5E7EB', letterSpacing: '0.03em' }}>
      {initials}
    </div>
  );
}

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

// ─── Goal Bar ─────────────────────────────────────────────────────────────────

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

// ─── Assign Calls Panel ───────────────────────────────────────────────────────

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
    return Object.values(callLogs).filter(l => l.calledBy === name && l.calledAt?.slice(0, 10) === t && (l.status === 'called' || l.status === 'voicemail')).length;
  }
  function add() {
    if (!newName.trim() || !newCount) return;
    onUpdate([...assignments.filter(a => a.name !== newName.trim()), { name: newName.trim(), count: parseInt(newCount) }]);
    setNewName(''); setNewCount('');
  }
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, marginBottom: '1.5rem', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users size={16} style={{ color: '#6b7280' }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Assign Calls</span>
          {assignments.length > 0 && <span style={{ fontSize: '0.7rem', background: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: 9999, fontWeight: 600 }}>{assignments.length} person{assignments.length !== 1 ? 's' : ''}</span>}
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
                    <button onClick={() => onUpdate(assignments.filter(x => x.name !== a.name))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 4, display: 'flex' }}><X size={14} /></button>
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

type TodoItemType = 'overdue_followup' | 'voicemail_callback' | 'assigned_uncalled';
interface TodoItem { type: TodoItemType; contactId: string; name: string; detail: string; completed: boolean; }

function DailyTodo({ contacts, callLogs, currentUser, assignments, completed, onToggle }: {
  contacts: MergedAlumni[];
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
    const name = c.full_name;
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
  const pending = todos.filter(td => !td.completed).length;
  const typeConfig: Record<TodoItemType, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
    overdue_followup:   { icon: <AlertCircle size={13} />, color: '#b91c1c', bg: '#fee2e2', label: 'Overdue Follow-Up' },
    voicemail_callback: { icon: <Voicemail size={13} />,   color: '#1d4ed8', bg: '#dbeafe', label: 'Voicemail Callback' },
    assigned_uncalled:  { icon: <Users size={13} />,       color: '#d97706', bg: '#fef3c7', label: 'Assigned' },
  };
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, marginBottom: '1.5rem', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bell size={16} style={{ color: '#d97706' }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Daily To-Do</span>
          {pending > 0 && <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 9999, fontWeight: 600 }}>{pending} pending</span>}
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

// ─── Contact Card (V3) ────────────────────────────────────────────────────────

function ContactCard({ contact, log, claim, onCallClick, onTextClick }: {
  contact: MergedAlumni;
  log: CallLog | undefined;
  claim: Claim | undefined;
  onCallClick: () => void;
  onTextClick: () => void;
}) {
  const overdueFollowUp = log?.followUpDate && !log.followUpCompleted && isOverdue(log.followUpDate);
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', transition: 'border-color 0.15s', opacity: log?.status === 'declined' ? 0.65 : 1 }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#9ca3af')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
    >
      {/* Top: avatar + name/meta */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <AvatarImg avatarUrl={contact.avatar_url} name={contact.full_name} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', lineHeight: 1.3 }}>{contact.full_name}</span>
            {contact.grad_year && <span style={{ fontSize: '0.7rem', color: '#9ca3af', flexShrink: 0 }}>&apos;{String(contact.grad_year).slice(-2)}</span>}
          </div>
          {contact.member_status && <div style={{ fontSize: '0.73rem', color: '#6b7280', marginTop: 1 }}>{contact.member_status}</div>}
          {contact.location && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 1 }}>📍 {contact.location}</div>}
          {contact.chapter_name && <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 1 }}>🏛️ {contact.chapter_name}</div>}
        </div>
      </div>

      {/* Phone */}
      {contact.phone && <div style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 500, marginBottom: 8 }}>📞 {fmtPhone(contact.phone)}</div>}

      {/* Tags */}
      {log?.tags && log.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
          {log.tags.slice(0, 3).map(t => <TagPill key={t} tag={t} />)}
          {log.tags.length > 3 && <span style={{ fontSize: '0.7rem', color: '#9ca3af', alignSelf: 'center' }}>+{log.tags.length - 3}</span>}
        </div>
      )}

      {/* Notes preview */}
      {log?.notes && <div style={{ fontSize: '0.75rem', color: '#374151', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>{log.notes}</div>}

      {/* Follow-up */}
      {log?.followUpDate && (
        <div style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: 8, padding: '2px 8px', borderRadius: 9999, display: 'inline-block', background: overdueFollowUp ? '#fef3c7' : '#f0fdf4', color: overdueFollowUp ? '#92400e' : '#15803d' }}>
          {overdueFollowUp ? '⚠️ ' : '📅 '}Follow-up: {log.followUpDate}
        </div>
      )}

      {/* Claim badge */}
      {claim && <div style={{ fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic', marginBottom: 8 }}>🔒 Claimed by {claim.claimedBy} — {Math.round((Date.now() - new Date(claim.claimedAt).getTime()) / 60000)}m ago</div>}

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onCallClick}
          style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0d9488, #10b981)', color: 'white', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'opacity 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <Phone size={16} /> Call
        </button>
        <button
          onClick={onTextClick}
          style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#0F172A', color: 'white', fontWeight: 700, fontSize: '0.9375rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'opacity 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <MessageSquare size={16} /> Text
        </button>
      </div>
    </div>
  );
}

// ─── Texting Panel ───────────────────────────────────────────────────────────

const LINE_PHONES: Record<'Owen' | 'Ford', string> = {
  Owen: '+16462101111',
  Ford: '+16462442696',
};
const LINE_NUMBERS_MAP: Record<'Owen' | 'Ford', number> = {
  Owen: 1,
  Ford: 3,
};

function TextingPanel({ contact, currentUser, onClose }: {
  contact: MergedAlumni;
  currentUser: string;
  onClose: () => void;
}) {
  const defaultLine: 'Owen' | 'Ford' = currentUser === 'Ford' ? 'Ford' : 'Owen';
  const [selectedLine, setSelectedLine] = useState<'Owen' | 'Ford'>(defaultLine);
  const [template, setTemplate] = useState<'welcome' | 'followup' | 'checkin' | 'custom'>('welcome');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LinqMessageClient[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function buildMessage(tmpl: string, line: 'Owen' | 'Ford'): string {
    const firstName = contact.first_name || contact.full_name.split(' ')[0];
    const org = contact.chapter_name || 'your org';
    switch (tmpl) {
      case 'welcome':
        return `Hey ${firstName}, this is ${line} from Trailblaize. Welcome to ${org}\'s network! Let us know if you need anything getting started.`;
      case 'followup':
        return `Hey ${firstName}, just checking in. Have you had a chance to explore the platform? Happy to help if you have questions.`;
      case 'checkin':
        return `Hey ${firstName}, wanted to touch base. Anything we can help with on the platform?`;
      default:
        return '';
    }
  }

  // Set message when template or line changes
  useEffect(() => {
    if (template !== 'custom') {
      setMessage(buildMessage(template, selectedLine));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, selectedLine]);

  // Initialize message on mount
  useEffect(() => {
    setMessage(buildMessage('welcome', defaultLine));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load conversation history when panel opens or line changes
  useEffect(() => {
    if (!contact.phone) return;
    setLoadingHistory(true);
    setChatId(null);
    setMessages([]);

    const lineNum = LINE_NUMBERS_MAP[selectedLine];
    const searchQ = contact.phone.replace(/\D/g, '').slice(-10);

    fetch(`/api/linq/conversations?line=${lineNum}&search=${encodeURIComponent(searchQ)}`)
      .then(r => r.json())
      .then(async (json) => {
        if (json.error || !json.data) return;
        const chats = json.data as Array<{ chat_id: string; phone: string | null; line_number: number }>;
        const normalized = contact.phone!.replace(/\D/g, '').slice(-10);
        const match = chats.find(c => {
          const cphone = (c.phone || '').replace(/\D/g, '').slice(-10);
          return cphone === normalized;
        });
        if (match) {
          setChatId(match.chat_id);
          const msgRes = await fetch(`/api/linq/messages?chat_id=${match.chat_id}&limit=30`);
          const msgJson = await msgRes.json();
          if (msgJson.data) {
            const parsed: LinqMessageClient[] = (msgJson.data as Array<{
              id: string;
              is_from_me: boolean;
              parts: Array<{ type: string; value: string }>;
              created_at: string;
            }>).map(m => ({
              id: m.id,
              is_from_me: m.is_from_me,
              text: m.parts?.find(p => p.type === 'text')?.value || '',
              created_at: m.created_at,
            }));
            setMessages(parsed);
          }
        }
      })
      .catch(e => console.error('[texting] history fetch error:', e))
      .finally(() => setLoadingHistory(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.phone, selectedLine]);

  // Scroll to bottom when messages load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || !contact.phone) return;
    setSending(true);
    setError(null);
    try {
      const body: Record<string, string> = chatId
        ? { chat_id: chatId, message: trimmed }
        : { line_phone: LINE_PHONES[selectedLine], contact_phone: contact.phone, message: trimmed };

      const res = await fetch('/api/linq/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (json.error) {
        setError(json.error);
      } else {
        setSent(true);
        if (!chatId && json.data?.chat_id) setChatId(json.data.chat_id);
        const sentMsg: LinqMessageClient = {
          id: `local_${Date.now()}`,
          is_from_me: true,
          text: trimmed,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, sentMsg]);
        setMessage('');
        setTemplate('custom');
        setTimeout(() => setSent(false), 3000);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSending(false);
    }
  }

  const TEMPLATE_OPTIONS = [
    { key: 'welcome', label: 'Welcome' },
    { key: 'followup', label: 'Follow-up' },
    { key: 'checkin', label: 'Check-in' },
    { key: 'custom', label: 'Custom' },
  ] as const;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 49 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw', background: 'white', zIndex: 50, boxShadow: '-4px 0 32px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB', flexShrink: 0, background: 'white', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <AvatarImg avatarUrl={contact.avatar_url} name={contact.full_name} size={44} />
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{contact.full_name}</h2>
                {contact.phone && <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{fmtPhone(contact.phone)}</div>}
                {contact.chapter_name && <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>🏛️ {contact.chapter_name}</div>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#9ca3af', display: 'flex', flexShrink: 0 }}><X size={20} /></button>
          </div>
          <div style={{ marginTop: 10, padding: '5px 12px', background: '#eff6ff', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={13} style={{ color: '#1d4ed8' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1d4ed8' }}>Linq iMessage — Connects Center</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Line selector */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Send From</label>
            <div style={{ display: 'inline-flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 }}>
              {(['Owen', 'Ford'] as const).map(name => (
                <button key={name} onClick={() => setSelectedLine(name)}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: selectedLine === name ? '#0F172A' : 'transparent', color: selectedLine === name ? 'white' : '#6b7280', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  {name}
                  <span style={{ fontSize: '0.68rem', opacity: 0.6 }}>{name === 'Owen' ? 'line 1' : 'line 3'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Template pills */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Template</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TEMPLATE_OPTIONS.map(t => (
                <button key={t.key} onClick={() => setTemplate(t.key)}
                  style={{ padding: '6px 14px', borderRadius: 9999, border: 'none', background: template === t.key ? '#0F172A' : '#F3F4F6', color: template === t.key ? 'white' : '#374151', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message textarea */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Message</label>
            <textarea
              value={message}
              onChange={e => { setMessage(e.target.value); if (template !== 'custom') setTemplate('custom'); }}
              placeholder="Write your message..."
              rows={5}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', color: '#111827', background: '#fff', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{message.length} chars</span>
              {error && <span style={{ fontSize: '0.7rem', color: '#b91c1c' }}>{error}</span>}
            </div>
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || !contact.phone}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: sent ? '#10b981' : (sending || !message.trim() ? '#E5E7EB' : '#0F172A'), color: sent ? 'white' : (sending || !message.trim() ? '#9ca3af' : 'white'), fontWeight: 700, fontSize: '0.9375rem', cursor: (sending || !message.trim()) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'all 0.2s' }}
          >
            <MessageSquare size={16} />
            {sent ? '✓ Sent!' : sending ? 'Sending...' : `Send via ${selectedLine}`}
          </button>

          {!contact.phone && (
            <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#b91c1c', padding: '8px', background: '#fee2e2', borderRadius: 8 }}>No phone number on file — can&apos;t text this contact.</div>
          )}

          {/* Conversation history */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Conversation History</label>
            {loadingHistory ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', color: '#9ca3af', fontSize: '0.8rem', gap: 6 }}>
                <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading history...
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#d1d5db', fontSize: '0.8rem' }}>
                No previous messages on this line
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.is_from_me ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%', padding: '8px 12px',
                      borderRadius: msg.is_from_me ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.is_from_me ? '#0F172A' : '#F3F4F6',
                      color: msg.is_from_me ? 'white' : '#111827',
                      fontSize: '0.8125rem', lineHeight: 1.5,
                    }}>
                      <div>{msg.text}</div>
                      <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: 3, textAlign: msg.is_from_me ? 'right' : 'left' }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Call Prompt Modal ────────────────────────────────────────────────────────

function CallPromptModal({ contact, currentUser, onAnswered, onVoicemailSaved, onDeclined, onClose }: {
  contact: MergedAlumni;
  currentUser: string;
  onAnswered: () => void;
  onVoicemailSaved: (note: string) => void;
  onDeclined: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'prompt' | 'voicemail'>('prompt');
  const [vmNote, setVmNote] = useState('');

  useEffect(() => {
    writeClaim(contact.id, currentUser);
  }, [contact.id, currentUser]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 49 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 20, padding: '28px 28px 24px', width: 400, maxWidth: '92vw', zIndex: 50, boxShadow: '0 24px 64px rgba(0,0,0,0.22)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
              <AvatarImg avatarUrl={contact.avatar_url} name={contact.full_name} size={36} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>{contact.full_name}</h3>
            </div>
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} style={{ fontSize: '0.9rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Phone size={14} /> {fmtPhone(contact.phone)}
              </a>
            ) : (
              <span style={{ fontSize: '0.8rem', color: '#d1d5db' }}>No phone number</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af', display: 'flex' }}><X size={20} /></button>
        </div>

        {phase === 'prompt' ? (
          <>
            <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 16px' }}>What happened on this call?</p>

            {/* Answered */}
            <button onClick={onAnswered}
              style={{ width: '100%', padding: '16px', borderRadius: 12, border: '2px solid #86efac', background: '#f0fdf4', color: '#15803d', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', marginBottom: 10, textAlign: 'left' }}
            >
              <PhoneCall size={22} />
              <div>
                <div>Answered</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 400, color: '#4ade80', marginTop: 2 }}>Log the conversation</div>
              </div>
            </button>

            {/* Voicemail */}
            <button onClick={() => setPhase('voicemail')}
              style={{ width: '100%', padding: '16px', borderRadius: 12, border: '2px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', marginBottom: 10, textAlign: 'left' }}
            >
              <Voicemail size={22} />
              <div>
                <div>Voicemail</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 400, color: '#60a5fa', marginTop: 2 }}>Moves to Voicemail Sent column</div>
              </div>
            </button>

            {/* Declined */}
            <button onClick={onDeclined}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1.5px solid #fca5a5', background: 'transparent', color: '#b91c1c', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
            >
              Asked not to be contacted → Decline
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <button onClick={() => setPhase('prompt')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9ca3af', display: 'flex' }}>
                <ChevronDown size={16} style={{ transform: 'rotate(90deg)' }} />
              </button>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>🔔 Left a Voicemail</p>
            </div>
            <textarea
              value={vmNote}
              onChange={e => setVmNote(e.target.value)}
              placeholder="Optional quick note… (e.g. left VM about joining the platform)"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPhase('prompt')} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Back</button>
              <button onClick={() => onVoicemailSaved(vmNote)}
                style={{ flex: 2, padding: '10px', borderRadius: 8, background: '#1d4ed8', color: '#fff', fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Save Voicemail
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Logging Panel (Answered) ─────────────────────────────────────────────────

function LoggingPanel({ panel, currentUser, onClose, onSave, onChange }: {
  panel: LoggingState;
  currentUser: string;
  onClose: () => void;
  onSave: () => void;
  onChange: (u: Partial<LoggingState>) => void;
}) {
  const c = panel.contact;
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
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '100vw', background: 'white', zIndex: 50, boxShadow: '-4px 0 32px rgba(0,0,0,0.14)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB', flexShrink: 0, background: 'white', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <AvatarImg avatarUrl={c.avatar_url} name={c.full_name} size={44} />
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 2px' }}>{c.full_name}</h2>
                {c.grad_year && <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Class of &apos;{String(c.grad_year).slice(-2)}</span>}
                {c.location && <div style={{ fontSize: '0.78rem', color: '#9ca3af' }}>📍 {c.location}</div>}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#9ca3af', display: 'flex', flexShrink: 0 }}><X size={20} /></button>
          </div>
          <div style={{ marginTop: 10, padding: '6px 12px', background: '#f0fdf4', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <PhoneCall size={14} style={{ color: '#15803d' }} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#15803d' }}>✅ They Answered — Log It</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Notes */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Notes</label>
            <textarea
              value={panel.notes}
              onChange={e => onChange({ notes: e.target.value })}
              placeholder="What did you talk about? Industry, hiring, open to connecting, what chapter they were in..."
              rows={4}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', color: '#111827', background: '#fff', resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* Tags */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Tags — the gold 🏆</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {PREDEFINED_TAGS.map(pt => {
                const sel = panel.tags.includes(pt.label);
                return (
                  <button key={pt.label} onClick={() => toggleTag(pt.label)}
                    style={{ padding: '7px 13px', borderRadius: 9999, border: sel ? `2px solid ${pt.color}` : '1.5px solid #E5E7EB', background: sel ? pt.bg : '#fff', color: sel ? pt.color : '#6b7280', fontSize: '0.8125rem', fontWeight: sel ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}
                  >
                    {sel && '✓ '}{pt.label}
                  </button>
                );
              })}
            </div>
            {panel.tags.filter(t => !PREDEFINED_TAGS.map(p => p.label).includes(t)).length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                {panel.tags.filter(t => !PREDEFINED_TAGS.map(p => p.label).includes(t)).map(t => (
                  <TagPill key={t} tag={t} onRemove={() => onChange({ tags: panel.tags.filter(x => x !== t) })} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" value={panel.tagInput} onChange={e => onChange({ tagInput: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCustomTag(panel.tagInput); } }}
                placeholder="Custom tag… (press Enter)"
                style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', outline: 'none', flex: 1, fontFamily: 'inherit' }}
              />
              <button onClick={() => addCustomTag(panel.tagInput)} style={{ padding: '6px 12px', background: '#f3f4f6', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', cursor: 'pointer', color: '#374151', fontFamily: 'inherit' }}>Add</button>
            </div>
          </div>

          {/* Follow-up */}
          <div>
            <button onClick={() => onChange({ followUp: !panel.followUp })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: panel.followUp ? '#2563eb' : '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: 0, fontFamily: 'inherit' }}
            >
              {panel.followUp ? <CheckSquare size={16} /> : <Square size={16} />}
              Schedule follow-up
            </button>
            {panel.followUp && (
              <input type="date" value={panel.followUpDate} onChange={e => onChange({ followUpDate: e.target.value })}
                style={{ display: 'block', marginTop: 8, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.875rem', outline: 'none', background: '#fff', fontFamily: 'inherit' }}
              />
            )}
          </div>

          {/* Follow-up text */}
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', margin: '0 0 6px', letterSpacing: '0.04em' }}>Follow-Up Text Template</p>
            <p style={{ fontSize: '0.8125rem', color: '#374151', margin: '0 0 10px', lineHeight: 1.5 }}>{followUpText}</p>
            <button onClick={() => { try { navigator.clipboard.writeText(followUpText); } catch {} }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'white', border: '1px solid #86efac', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, color: '#15803d', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <MessageSquare size={12} /> Copy Text
            </button>
          </div>

          {/* Save */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={onSave} disabled={panel.saving}
              style={{ flex: 2, padding: '10px', borderRadius: 8, background: panel.saving ? '#e5e7eb' : '#0F172A', color: panel.saving ? '#9ca3af' : '#fff', fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: panel.saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              {panel.saving ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />Saving...</> : 'Save & Close'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Pending Connect Card ────────────────────────────────────────────────────

const CONNECT_TYPE_STYLES: Record<string, { color: string; bg: string }> = {
  Job:        { color: '#15803d', bg: '#dcfce7' },
  Mentoring:  { color: '#1d4ed8', bg: '#dbeafe' },
  Advice:     { color: '#d97706', bg: '#fef3c7' },
  Networking: { color: '#7c3aed', bg: '#ede9fe' },
};
function getConnectTypeStyle(t: string) { return CONNECT_TYPE_STYLES[t] ?? { color: '#6b7280', bg: '#f3f4f6' }; }

function PendingConnectCard({ entry, onPromote }: { entry: PendingConnectEntry; onPromote: () => void }) {
  const tc = getConnectTypeStyle(entry.connectType);
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px', transition: 'border-color 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#9ca3af')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <AvatarImg avatarUrl={null} name={entry.personName} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827', lineHeight: 1.3 }}>{entry.personName}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>wants to connect with</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginTop: 1 }}>{entry.connectWithName}</div>
        </div>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: tc.color, background: tc.bg, padding: '3px 8px', borderRadius: 9999, flexShrink: 0 }}>{entry.connectType}</span>
      </div>
      <button
        onClick={onPromote}
        style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #8b5cf6)', color: 'white', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s' }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
      >
        ✓ Mark Connected
      </button>
    </div>
  );
}

// ─── Connected Card ───────────────────────────────────────────────────────────

function ConnectedCard({ entry }: { entry: ConnectedEntry }) {
  const tc = getConnectTypeStyle(entry.connectType);
  const dateStr = new Date(entry.connectedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <AvatarImg avatarUrl={null} name={entry.person1Name} size={32} />
        <span style={{ fontSize: '1rem', color: '#10b981', fontWeight: 700 }}>↔</span>
        <AvatarImg avatarUrl={null} name={entry.person2Name} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.person1Name} &amp; {entry.person2Name}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: tc.color, background: tc.bg, padding: '3px 8px', borderRadius: 9999 }}>{entry.connectType}</span>
        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>📅 {dateStr}</span>
      </div>
    </div>
  );
}

// ─── Pending Connect Column ───────────────────────────────────────────────────

function PendingConnectColumn({ entries, onAdd, onPromote }: {
  entries: PendingConnectEntry[];
  onAdd: (data: Omit<PendingConnectEntry, 'id' | 'createdAt' | 'createdBy'>) => void;
  onPromote: (id: string) => void;
}) {
  const cfg = COLUMN_CONFIG['pending_connect'];
  const [showForm, setShowForm] = useState(false);
  const [personName, setPersonName] = useState('');
  const [connectWithName, setConnectWithName] = useState('');
  const [connectType, setConnectType] = useState<'Job' | 'Mentoring' | 'Advice' | 'Networking'>('Networking');

  function submit() {
    if (!personName.trim() || !connectWithName.trim()) return;
    onAdd({ personName: personName.trim(), connectWithName: connectWithName.trim(), connectType });
    setPersonName(''); setConnectWithName(''); setShowForm(false);
  }

  return (
    <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: cfg.headerBg, border: `1px solid ${cfg.borderColor}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827' }}>{cfg.label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.badgeColor, background: cfg.badgeBg, padding: '2px 8px', borderRadius: 9999 }}>{entries.length}</span>
          <button
            onClick={() => setShowForm(f => !f)}
            title="Add pending connect"
            style={{ background: cfg.badgeBg, border: 'none', cursor: 'pointer', color: cfg.badgeColor, fontWeight: 700, fontSize: '0.9rem', width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
          >+</button>
        </div>
      </div>
      {showForm && (
        <div style={{ background: 'white', border: `1.5px solid ${cfg.borderColor}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="text" value={personName} onChange={e => setPersonName(e.target.value)} placeholder="Member name" style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', outline: 'none', fontFamily: 'inherit' }} />
          <input type="text" value={connectWithName} onChange={e => setConnectWithName(e.target.value)} placeholder="Connect with..." style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', outline: 'none', fontFamily: 'inherit' }} />
          <select value={connectType} onChange={e => setConnectType(e.target.value as 'Job' | 'Mentoring' | 'Advice' | 'Networking')} style={{ padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.8125rem', outline: 'none', fontFamily: 'inherit', background: 'white' }}>
            <option value="Job">Job</option>
            <option value="Mentoring">Mentoring</option>
            <option value="Advice">Advice</option>
            <option value="Networking">Networking</option>
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '6px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={submit} style={{ flex: 2, padding: '6px', borderRadius: 6, border: 'none', background: '#7c3aed', color: 'white', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 'calc(100vh - 380px)', paddingBottom: 8 }}>
        {entries.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#d1d5db', fontSize: '0.8125rem' }}>No pending connects</div>
        ) : entries.map(entry => (
          <PendingConnectCard key={entry.id} entry={entry} onPromote={() => onPromote(entry.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── Connected Column ─────────────────────────────────────────────────────────

function ConnectedColumn({ entries }: { entries: ConnectedEntry[] }) {
  const cfg = COLUMN_CONFIG['connected'];
  return (
    <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: cfg.headerBg, border: `1px solid ${cfg.borderColor}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827' }}>{cfg.label}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: cfg.badgeColor, background: cfg.badgeBg, padding: '2px 8px', borderRadius: 9999 }}>{entries.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 'calc(100vh - 380px)', paddingBottom: 8 }}>
        {entries.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#d1d5db', fontSize: '0.8125rem' }}>No connections yet</div>
        ) : entries.map(entry => (
          <ConnectedCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({ status, contacts, callLogs, claims, onCallClick, onTextClick }: {
  status: ColumnStatus;
  contacts: MergedAlumni[];
  callLogs: Record<string, CallLog>;
  claims: Record<string, Claim>;
  onCallClick: (c: MergedAlumni) => void;
  onTextClick: (c: MergedAlumni) => void;
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
          <ContactCard key={c.id} contact={c} log={callLogs[c.id]} claim={claims[c.id]} onCallClick={() => onCallClick(c)} onTextClick={() => onTextClick(c)} />
        ))}
      </div>
    </div>
  );
}

// ─── Chapter Field Parser ────────────────────────────────────────────────────

function parseChapterField(chapter: string | undefined): { school: string | null; org: string | null } {
  if (!chapter) return { school: null, org: null };
  // Greek letter words + common shorthand
  const GREEK_WORDS = new Set([
    'alpha','beta','gamma','delta','epsilon','zeta','eta','theta','iota','kappa',
    'lambda','mu','nu','xi','pi','rho','sigma','tau','upsilon','phi','chi','psi','omega',
    'delt','sig','pike','tke',
  ]);
  // Known school abbreviations (first-word)
  const SCHOOL_ABBREVS = new Set(['tamu','fsu','uf','lsu','ut','ou','osu','asu','usc','ucla','uva','unc','duke','penn']);
  const words = chapter.trim().split(/\s+/);
  // If first word(s) are Greek → org comes first
  let orgEnd = 0;
  for (const w of words) {
    if (GREEK_WORDS.has(w.toLowerCase())) orgEnd++;
    else break;
  }
  if (orgEnd > 0) {
    return { org: words.slice(0, orgEnd).join(' '), school: words.slice(orgEnd).join(' ') || null };
  }
  // First word is non-Greek — check if it's a known school abbreviation
  if (SCHOOL_ABBREVS.has(words[0].toLowerCase())) {
    return { school: words[0], org: words.slice(1).join(' ') || null };
  }
  // Otherwise treat first all-caps token(s) as org abbreviation, rest as school
  return { org: words[0], school: words.slice(1).join(' ') || null };
}

// ─── The Web: Network Visualization ──────────────────────────────────────────

function computeWebGraph(callLogs: Record<string, CallLog>): { nodes: WebNode[]; edges: WebEdge[] } {
  const calledLogs = Object.values(callLogs).filter(l => l.status === 'called' && l.contactSnapshot);
  if (calledLogs.length === 0) return { nodes: [], edges: [] };

  const nodeData = calledLogs.map(log => ({
    id: log.contactId,
    name: log.contactSnapshot!.name,
    avatarUrl: log.contactSnapshot!.avatarUrl,
    tags: log.tags,
    location: log.contactSnapshot!.location,
    gradYear: log.contactSnapshot!.gradYear,
    memberStatus: log.contactSnapshot!.memberStatus,
    chapterName: log.contactSnapshot!.chapterName,
    notes: log.notes,
  }));

  // Pre-parse chapters
  const parsed = nodeData.map(nd => ({
    ...nd,
    ...parseChapterField(nd.chapterName),
  }));

  const INDUSTRY_TAGS_SET = new Set(INDUSTRY_TAGS);

  function pairKey(a: string, b: string) {
    return a < b ? `${a}::${b}` : `${b}::${a}`;
  }

  // Build 1st and 2nd degree direct edges
  const directEdges: WebEdge[] = [];
  const connectedPairs = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    for (let j = i + 1; j < parsed.length; j++) {
      const a = parsed[i], b = parsed[j];
      const key = pairKey(a.id, b.id);
      if (connectedPairs.has(key)) continue;

      const orgA = a.org?.toLowerCase() ?? null;
      const orgB = b.org?.toLowerCase() ?? null;
      const schoolA = a.school?.toLowerCase() ?? null;
      const schoolB = b.school?.toLowerCase() ?? null;

      const sameOrg = !!(orgA && orgB && orgA === orgB);
      const sameSchool = !!(schoolA && schoolB && schoolA === schoolB);

      if (sameOrg && sameSchool) {
        // 1st degree: same chapter (same org + same school)
        directEdges.push({ from: a.id, to: b.id, degree: 1, sharedContext: `${a.org} @ ${a.school}` });
        connectedPairs.add(key);
      } else if (sameSchool || sameOrg) {
        // 2nd degree: same school different org, or same org different school
        const ctx = sameSchool ? `Both at ${a.school}` : `Both in ${a.org}`;
        directEdges.push({ from: a.id, to: b.id, degree: 2, sharedContext: ctx });
        connectedPairs.add(key);
      } else if (a.location && b.location) {
        // 2nd degree: same city + both have industry tags
        const cityA = a.location.split(',')[0].trim().toLowerCase();
        const cityB = b.location.split(',')[0].trim().toLowerCase();
        if (cityA && cityA === cityB) {
          const aIndustry = a.tags.some(t => INDUSTRY_TAGS_SET.has(t));
          const bIndustry = b.tags.some(t => INDUSTRY_TAGS_SET.has(t));
          if (aIndustry && bIndustry) {
            directEdges.push({ from: a.id, to: b.id, degree: 2, sharedContext: `Same city & industry (${a.location.split(',')[0]})` });
            connectedPairs.add(key);
          }
        }
      }
    }
  }

  // Build adjacency map from direct edges
  const adjacency: Record<string, Set<string>> = {};
  nodeData.forEach(nd => { adjacency[nd.id] = new Set(); });
  directEdges.forEach(e => {
    adjacency[e.from].add(e.to);
    adjacency[e.to].add(e.from);
  });

  // 3rd degree: A↔B (1/2nd), B↔C (1/2nd) → A↔C if not already connected
  const thirdEdges: WebEdge[] = [];
  for (let i = 0; i < nodeData.length; i++) {
    for (let j = i + 1; j < nodeData.length; j++) {
      const aId = nodeData[i].id;
      const bId = nodeData[j].id;
      const key = pairKey(aId, bId);
      if (connectedPairs.has(key)) continue;
      // Check for common direct neighbor
      for (const mid of adjacency[aId]) {
        if (adjacency[bId].has(mid)) {
          const midName = nodeData.find(n => n.id === mid)?.name ?? 'network';
          thirdEdges.push({ from: aId, to: bId, degree: 3, sharedContext: `Connected through ${midName}` });
          connectedPairs.add(key);
          break;
        }
      }
    }
  }

  const allEdges = [...directEdges, ...thirdEdges];

  // Count total connections per node (all degrees)
  const connCount: Record<string, number> = {};
  nodeData.forEach(nd => { connCount[nd.id] = 0; });
  allEdges.forEach(e => {
    connCount[e.from] = (connCount[e.from] || 0) + 1;
    connCount[e.to] = (connCount[e.to] || 0) + 1;
  });

  const sorted = [...nodeData].sort((a, b) => (connCount[b.id] || 0) - (connCount[a.id] || 0));
  const total = sorted.length;
  const cx = 400, cy = 410;
  const ringRadii = [155, 255, 355];

  // Group into rings
  const rings: (typeof sorted)[] = [[], [], []];
  sorted.forEach((nd, i) => {
    const pct = total <= 1 ? 0 : i / (total - 1);
    const rIdx = pct < 0.34 ? 0 : pct < 0.67 ? 1 : 2;
    rings[rIdx].push(nd);
  });

  const nodes: WebNode[] = [];
  rings.forEach((ring, rIdx) => {
    ring.forEach((nd, i) => {
      const angle = ring.length === 1 ? -Math.PI / 2 : (i / ring.length) * 2 * Math.PI - Math.PI / 2;
      const r = ringRadii[rIdx];
      const count = connCount[nd.id] || 0;
      nodes.push({
        ...nd,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        radius: Math.min(28, 12 + Math.min(count, 8) * 2),
        connectionCount: count,
      });
    });
  });

  return { nodes, edges: allEdges };
}

function WebVisualization({ callLogs }: { callLogs: Record<string, CallLog> }) {
  const [selectedNode, setSelectedNode] = useState<WebNode | null>(null);
  const [copied, setCopied] = useState('');
  const { nodes, edges } = useMemo(() => computeWebGraph(callLogs), [callLogs]);

  // Compute connections grouped by degree for the selected node
  const connectionsByDegree = useMemo(() => {
    if (!selectedNode) return { d1: [] as WebNode[], d2: [] as WebNode[], d3: [] as WebNode[] };
    const d1: WebNode[] = [], d2: WebNode[] = [], d3: WebNode[] = [];
    for (const edge of edges) {
      if (edge.from === selectedNode.id || edge.to === selectedNode.id) {
        const otherId = edge.from === selectedNode.id ? edge.to : edge.from;
        const other = nodes.find(n => n.id === otherId);
        if (!other) continue;
        if (edge.degree === 1) d1.push(other);
        else if (edge.degree === 2) d2.push(other);
        else d3.push(other);
      }
    }
    return { d1, d2, d3 };
  }, [selectedNode, edges, nodes]);

  if (nodes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 24px', color: '#9ca3af', background: 'white', border: '1px solid #E5E7EB', borderRadius: 16 }}>
        <Share2 size={56} style={{ margin: '0 auto 16px', opacity: 0.2, display: 'block' }} />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>The Web is empty</h3>
        <p style={{ margin: 0, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
          Call alumni and log them as &ldquo;Answered&rdquo; to start building your network graph. Each call adds a node.
        </p>
      </div>
    );
  }

  const SVG_W = 800, SVG_H = 820;
  const cx = 400, cy = 410;

  return (
    <div style={{ display: 'flex', background: 'white', border: '1px solid #E5E7EB', borderRadius: 16, overflow: 'hidden' }}>
      {/* SVG Canvas */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 600, display: 'block' }}>
          <defs>
            {nodes.map((n, i) => (
              <clipPath key={`web-clip-${i}`} id={`web-clip-${i}`}>
                <circle cx={n.x} cy={n.y} r={n.radius} />
              </clipPath>
            ))}
          </defs>

          {/* Edges — styled by degree */}
          {edges.map((edge, i) => {
            const fn = nodes.find(n => n.id === edge.from);
            const tn = nodes.find(n => n.id === edge.to);
            if (!fn || !tn) return null;
            const hi = !!(selectedNode && (selectedNode.id === edge.from || selectedNode.id === edge.to));
            const color = DEGREE_COLORS[edge.degree];
            const baseWidth = edge.degree === 1 ? 3 : edge.degree === 2 ? 2 : 1;
            return (
              <line key={i} x1={fn.x} y1={fn.y} x2={tn.x} y2={tn.y}
                stroke={color}
                strokeWidth={hi ? baseWidth + 1 : baseWidth}
                strokeOpacity={hi ? 0.9 : 0.2}
                strokeDasharray={edge.degree === 3 ? '5 4' : undefined}
              />
            );
          })}

          {/* Center hub */}
          <circle cx={cx} cy={cy} r={44} fill="#0F172A" />
          <text x={cx} y={cy - 5} textAnchor="middle" fill="white" fontSize={11} fontWeight="700">Trail</text>
          <text x={cx} y={cy + 9} textAnchor="middle" fill="white" fontSize={11} fontWeight="700">blaize</text>

          {/* Nodes */}
          {nodes.map((node, i) => {
            const isSel = selectedNode?.id === node.id;
            const isHub = node.connectionCount >= 5;
            const bgColors = ['#0F172A', '#1d4ed8', '#0d9488', '#7c3aed', '#db2777'];
            const bg = bgColors[(node.name.charCodeAt(0) || 0) % bgColors.length];
            const initials = getInitials(node.name);
            return (
              <g key={node.id} onClick={() => setSelectedNode(isSel ? null : node)} style={{ cursor: 'pointer' }}>
                {/* Hub double ring — amber glow for highly connected nodes */}
                {isHub && (
                  <circle cx={node.x} cy={node.y} r={node.radius + 5} fill="none" stroke="#F59E0B" strokeWidth={1.5} strokeOpacity={0.5} />
                )}
                {/* Initials background */}
                <circle cx={node.x} cy={node.y} r={node.radius} fill={bg} />
                <text x={node.x} y={node.y + node.radius * 0.35} textAnchor="middle" fill="white" fontSize={node.radius * 0.7} fontWeight="600" style={{ pointerEvents: 'none', userSelect: 'none' }}>{initials}</text>
                {/* Avatar (overrides initials when available) */}
                {node.avatarUrl && (
                  <image href={node.avatarUrl} x={node.x - node.radius} y={node.y - node.radius} width={node.radius * 2} height={node.radius * 2} clipPath={`url(#web-clip-${i})`} preserveAspectRatio="xMidYMid slice" />
                )}
                {/* Border ring */}
                <circle cx={node.x} cy={node.y} r={node.radius} fill="none" stroke={isSel ? '#0F172A' : 'white'} strokeWidth={isSel ? 3 : 2} />
                {/* Name label */}
                <text x={node.x} y={node.y + node.radius + 14} textAnchor="middle" fill="#374151" fontSize={10} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {node.name.split(' ')[0]}
                </text>
                {/* Connection count badge */}
                {node.connectionCount > 0 && (
                  <>
                    <circle cx={node.x + node.radius - 4} cy={node.y - node.radius + 4} r={8} fill="#10b981" />
                    <text x={node.x + node.radius - 4} y={node.y - node.radius + 8} textAnchor="middle" fill="white" fontSize={8} fontWeight="700" style={{ pointerEvents: 'none' }}>{node.connectionCount}</text>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* Degrees of Separation Legend */}
        <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 12, flexWrap: 'wrap', background: 'rgba(255,255,255,0.95)', padding: '8px 14px', borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', maxWidth: 'calc(100% - 32px)' }}>
          {([
            { degree: 1 as const, label: '1st Degree — Same chapter', dashed: false },
            { degree: 2 as const, label: '2nd Degree — Same school or org', dashed: false },
            { degree: 3 as const, label: '3rd Degree — Shared network', dashed: true },
          ]).map(leg => (
            <div key={leg.degree} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#374151', fontWeight: 600 }}>
              {leg.dashed ? (
                <svg width="20" height="4" style={{ flexShrink: 0 }}>
                  <line x1="0" y1="2" x2="20" y2="2" stroke={DEGREE_COLORS[leg.degree]} strokeWidth="2" strokeDasharray="5 4" />
                </svg>
              ) : (
                <div style={{ width: 20, height: leg.degree === 1 ? 3 : 2, background: DEGREE_COLORS[leg.degree], borderRadius: 1, flexShrink: 0 }} />
              )}
              {leg.label}
            </div>
          ))}
          <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{nodes.length} called alumni</div>
        </div>

        {/* Click hint */}
        {!selectedNode && (
          <div style={{ position: 'absolute', bottom: 16, right: 16, fontSize: '0.72rem', color: '#9ca3af', background: 'rgba(255,255,255,0.95)', padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
            Click a node to explore connections
          </div>
        )}
      </div>

      {/* Sidebar */}
      {selectedNode && (
        <div style={{ width: 320, borderLeft: '1px solid #E5E7EB', overflowY: 'auto', maxHeight: 600, flexShrink: 0 }}>
          <div style={{ padding: '20px 20px 0' }}>
            {/* Profile header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AvatarImg avatarUrl={selectedNode.avatarUrl} name={selectedNode.name} size={48} />
                <div>
                  <h3 style={{ margin: '0 0 2px', fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{selectedNode.name}</h3>
                  {selectedNode.memberStatus && <div style={{ fontSize: '0.73rem', color: '#6b7280' }}>{selectedNode.memberStatus}</div>}
                  {selectedNode.location && <div style={{ fontSize: '0.73rem', color: '#9ca3af' }}>📍 {selectedNode.location}</div>}
                  {selectedNode.gradYear && <div style={{ fontSize: '0.73rem', color: '#9ca3af' }}>Class of &apos;{String(selectedNode.gradYear).slice(-2)}</div>}
                  {selectedNode.chapterName && <div style={{ fontSize: '0.73rem', color: '#6b7280' }}>🏛️ {selectedNode.chapterName}</div>}
                </div>
              </div>
              <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af', display: 'flex', flexShrink: 0 }}><X size={18} /></button>
            </div>

            {/* Tags */}
            {selectedNode.tags.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Tags</p>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selectedNode.tags.map(t => <TagPill key={t} tag={t} />)}
                </div>
              </div>
            )}

            {/* Call Notes */}
            {selectedNode.notes && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Call Notes</p>
                <p style={{ fontSize: '0.8125rem', color: '#374151', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>{selectedNode.notes}</p>
              </div>
            )}

            {/* Connections by degree */}
            {([
              { key: 'd1' as const, degree: 1, label: '1st Degree', color: '#EF4444', bg: '#FEF2F2', canIntro: true },
              { key: 'd2' as const, degree: 2, label: '2nd Degree', color: '#F59E0B', bg: '#FFFBEB', canIntro: true },
              { key: 'd3' as const, degree: 3, label: '3rd Degree', color: '#3B82F6', bg: '#EFF6FF', canIntro: false },
            ]).map(({ key, degree, label, color, bg, canIntro }) => {
              const degNodes = connectionsByDegree[key];
              if (degNodes.length === 0) return null;
              return (
                <div key={degree} style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: '0.68rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                    {label} ({degNodes.length})
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {degNodes.map(dn => {
                      const copyKey = `${selectedNode.id}::${dn.id}`;
                      const isCopied = copied === copyKey;
                      const introMsg = `Hey ${selectedNode.name.split(' ')[0]}, I think you should connect with ${dn.name} — you have a ${label.toLowerCase()} connection through Trailblaize${dn.chapterName ? ` (${dn.chapterName})` : ''}. Want me to make that intro?`;
                      return (
                        <div key={dn.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: bg, borderRadius: 8, border: `1px solid ${color}25` }}>
                          <AvatarImg avatarUrl={dn.avatarUrl} name={dn.name} size={28} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dn.name}</div>
                            {dn.chapterName && <div style={{ fontSize: '0.68rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🏛️ {dn.chapterName}</div>}
                          </div>
                          {canIntro && (
                            <button
                              onClick={() => {
                                try { navigator.clipboard.writeText(introMsg); } catch {}
                                setCopied(copyKey);
                                setTimeout(() => setCopied(''), 2500);
                              }}
                              title="Copy intro message"
                              style={{ flexShrink: 0, padding: '4px 8px', borderRadius: 6, border: `1px solid ${isCopied ? '#86efac' : color}50`, background: isCopied ? '#f0fdf4' : 'white', color: isCopied ? '#15803d' : color, fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                            >
                              {isCopied ? '✓' : '🤝 Intro'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {connectionsByDegree.d1.length === 0 && connectionsByDegree.d2.length === 0 && connectionsByDegree.d3.length === 0 && (
              <div style={{ paddingBottom: 16 }}>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>No connections found yet. Log more calls to build the network.</p>
              </div>
            )}

            <div style={{ height: 20 }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConnectsCenter() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');
  const [contacts, setContacts] = useState<MergedAlumni[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>('call_center');

  // localStorage state
  const [callLogs, setCallLogs] = useState<Record<string, CallLog>>({});
  const [claims, setClaims] = useState<Record<string, Claim>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [currentUser, setCurrentUserState] = useState<string>('Owen');
  const [todoCompleted, setTodoCompleted] = useState<string[]>([]);
  const [pendingConnects, setPendingConnects] = useState<PendingConnectEntry[]>([]);
  const [connected, setConnected] = useState<ConnectedEntry[]>([]);

  // UI state
  const [callModal, setCallModal] = useState<MergedAlumni | null>(null);
  const [loggingPanel, setLoggingPanel] = useState<LoggingState | null>(null);
  const [textingContact, setTextingContact] = useState<MergedAlumni | null>(null);

  // Hydrate localStorage
  useEffect(() => {
    setCallLogs(readCallLogs());
    setClaims(readClaims());
    setAssignments(readAssignments());
    setCurrentUserState(readCurrentUser());
    setTodoCompleted(readTodoCompleted());
    setPendingConnects(readPendingConnects());
    setConnected(readConnected());
  }, []);

  // Auto-seed historical call data (runs once per device)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(SEED_FLAG)) return;
    (async () => {
      try {
        const res = await fetch('/connects-seed-data.json');
        if (!res.ok) return;
        const data: SeedEntry[] = await res.json();
        const outcomeMap: Record<string, ColumnStatus> = {
          answered: 'called',
          voicemail: 'voicemail',
          declined: 'declined',
        };
        const all = readCallLogs();
        for (const entry of data) {
          const status: ColumnStatus = outcomeMap[entry.outcome] ?? 'called';
          const contactId = entry.name;
          all[contactId] = {
            contactId,
            status,
            notes: entry.notes || '',
            tags: entry.tags || [],
            calledBy: entry.calledBy || 'Owen',
            calledAt: entry.calledAt,
            followUpDate: entry.followUp ?? undefined,
            followUpCompleted: false,
            contactSnapshot: {
              name: entry.name,
              avatarUrl: null,
              location: null,
              gradYear: null,
              memberStatus: null,
              chapterName: entry.chapter,
            },
          };
        }
        localStorage.setItem(LS.callLogs, JSON.stringify(all));
        localStorage.setItem(SEED_FLAG, '1');
        setCallLogs({ ...all });
      } catch (e) {
        console.error('Seed failed:', e);
      }
    })();
  }, []);

  // Refresh claims every 60s
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

  // Load contacts for a chapter (platform members only)
  const loadContacts = useCallback(async (chapterId: string, chapterName?: string) => {
    setLoadingContacts(true);
    try {
      if (chapterId === 'all') {
        // Aggregate all chapters
        const all: MergedAlumni[] = [];
        const seen = new Set<string>();
        await Promise.allSettled(
          chapters.map(async ch => {
            try {
              const res = await fetch(`/api/chapters/${ch.id}/alumni?status=platform_joined&limit=1000&page=1`);
              if (!res.ok) return;
              const json = await res.json();
              const members: MergedAlumni[] = json.members || [];
              const cname = ch.fraternity || ch.chapter_name || '';
              for (const m of members) {
                if (!seen.has(m.id)) {
                  seen.add(m.id);
                  all.push({ ...m, chapter_name: cname });
                }
              }
            } catch {}
          })
        );
        setContacts(all);
      } else {
        const res = await fetch(`/api/chapters/${chapterId}/alumni?status=platform_joined&limit=1000&page=1`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const members: MergedAlumni[] = json.members || [];
        setContacts(members.map(m => ({ ...m, chapter_name: chapterName })));
      }
    } catch (e) { console.error(e); }
    setLoadingContacts(false);
  }, [chapters]);

  useEffect(() => {
    if (selectedChapterId) {
      const ch = chapters.find(c => c.id === selectedChapterId);
      const name = ch ? (ch.fraternity || ch.chapter_name || '') : '';
      setCallModal(null);
      setLoggingPanel(null);
      loadContacts(selectedChapterId, name);
    } else {
      setContacts([]);
    }
  }, [selectedChapterId, loadContacts, chapters]);

  // Bucket contacts
  const cols: Record<ColumnStatus, MergedAlumni[]> = { not_called: [], voicemail: [], called: [], declined: [], pending_connect: [], connected: [] };
  for (const c of contacts) cols[getContactStatus(c, callLogs)].push(c);

  // Handle call button click
  function handleCallClick(contact: MergedAlumni) {
    setCallModal(contact);
  }

  // Handle text button click
  function handleTextClick(contact: MergedAlumni) {
    setTextingContact(contact);
  }

  // Handle "Answered" in call modal
  function handleAnswered() {
    if (!callModal) return;
    const existing = callLogs[callModal.id];
    setLoggingPanel({
      contact: callModal,
      notes: existing?.notes || '',
      tags: existing?.tags || [],
      tagInput: '',
      followUp: !!existing?.followUpDate,
      followUpDate: existing?.followUpDate || '',
      saving: false,
    });
    setCallModal(null);
  }

  // Handle "Voicemail saved"
  async function handleVoicemailSaved(note: string) {
    if (!callModal) return;
    const log: CallLog = {
      contactId: callModal.id,
      status: 'voicemail',
      notes: note,
      tags: [],
      calledBy: currentUser,
      calledAt: new Date().toISOString(),
    };
    writeCallLog(log);
    setCallLogs(prev => ({ ...prev, [callModal.id]: log }));
    deleteClaim(callModal.id);
    setCallModal(null);
    try {
      await fetch(`/api/alumni-contacts/${callModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreach_status: 'touch1_sent' }),
      });
    } catch {}
  }

  // Handle "Declined"
  async function handleDeclined() {
    if (!callModal) return;
    const log: CallLog = {
      contactId: callModal.id,
      status: 'declined',
      notes: '',
      tags: [],
      calledBy: currentUser,
      calledAt: new Date().toISOString(),
    };
    writeCallLog(log);
    setCallLogs(prev => ({ ...prev, [callModal.id]: log }));
    deleteClaim(callModal.id);
    setCallModal(null);
    try {
      await fetch(`/api/alumni-contacts/${callModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreach_status: 'opted_out' }),
      });
    } catch {}
  }

  // Save full call log (answered)
  async function saveLog() {
    if (!loggingPanel) return;
    setLoggingPanel(prev => prev ? { ...prev, saving: true } : prev);
    const { contact } = loggingPanel;
    const snapshot: ContactSnapshot = {
      name: contact.full_name,
      avatarUrl: contact.avatar_url,
      location: contact.location,
      gradYear: contact.grad_year,
      memberStatus: contact.member_status,
      chapterName: contact.chapter_name,
    };
    const log: CallLog = {
      contactId: contact.id,
      status: 'called',
      notes: loggingPanel.notes,
      tags: loggingPanel.tags,
      calledBy: currentUser,
      calledAt: new Date().toISOString(),
      followUpDate: loggingPanel.followUp && loggingPanel.followUpDate ? loggingPanel.followUpDate : undefined,
      followUpCompleted: false,
      contactSnapshot: snapshot,
    };
    writeCallLog(log);
    setCallLogs(prev => ({ ...prev, [contact.id]: log }));
    deleteClaim(contact.id);
    setClaims(prev => { const n = { ...prev }; delete n[contact.id]; return n; });
    const tagsStr = log.tags.length ? `\nTags: ${log.tags.join(', ')}` : '';
    const fuStr = log.followUpDate ? `\nFollow-up: ${log.followUpDate}` : '';
    const responseText = `[answered] ${log.notes}${tagsStr}${fuStr}`.trim();
    try {
      await fetch(`/api/alumni-contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreach_status: 'responded', response_text: responseText }),
      });
    } catch {}
    setLoggingPanel(null);
  }

  function handleAddPendingConnect(data: Omit<PendingConnectEntry, 'id' | 'createdAt' | 'createdBy'>) {
    const entry: PendingConnectEntry = {
      id: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
    };
    const all = readPendingConnects();
    all.push(entry);
    writePendingConnects(all);
    setPendingConnects(all);
  }

  function handlePromoteToConnected(pendingId: string) {
    const entry = pendingConnects.find(e => e.id === pendingId);
    if (!entry) return;
    const conn: ConnectedEntry = {
      id: `cn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      person1Name: entry.personName,
      person2Name: entry.connectWithName,
      connectType: entry.connectType,
      connectedAt: new Date().toISOString(),
    };
    const newPending = pendingConnects.filter(e => e.id !== pendingId);
    const newConnected = [...readConnected(), conn];
    writePendingConnects(newPending);
    writeConnected(newConnected);
    setPendingConnects(newPending);
    setConnected(newConnected);
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
            <div className="module-icon" style={{ backgroundColor: '#f0fdf4', color: '#15803d' }}>
              <Phone size={24} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1>Connects Center</h1>
                {/* Calling as */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: '1px solid #E5E7EB', borderRadius: 8, padding: '4px 10px' }}>
                  <User size={13} style={{ color: '#6b7280' }} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Calling as:</span>
                  <select value={currentUser} onChange={e => handleCurrentUserChange(e.target.value)}
                    style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827', background: 'none', border: 'none', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    {CALLER_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                {/* View Toggle */}
                <div style={{ display: 'inline-flex', background: '#f3f4f6', borderRadius: 10, padding: 3, gap: 2 }}>
                  <button onClick={() => setActiveView('call_center')}
                    style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: activeView === 'call_center' ? 'white' : 'transparent', color: activeView === 'call_center' ? '#111827' : '#6b7280', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: activeView === 'call_center' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}
                  >
                    📞 Call Center
                  </button>
                  <button onClick={() => setActiveView('web')}
                    style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: activeView === 'web' ? 'white' : 'transparent', color: activeView === 'web' ? '#111827' : '#6b7280', fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', boxShadow: activeView === 'web' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}
                  >
                    🕸️ The Web
                  </button>
                </div>
              </div>
              <p>Platform members only — one-tap calling, 4-column pipeline, 100 calls/day goal.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {activeView === 'call_center' ? (
          <>
            {/* Goal Bar */}
            <GoalBar callLogs={callLogs} assignments={assignments} />

            {/* Assign Calls */}
            <AssignCallsPanel assignments={assignments} callLogs={callLogs} onUpdate={a => { writeAssignments(a); setAssignments(a); }} />

            {/* Daily To-Do */}
            {contacts.length > 0 && (
              <DailyTodo contacts={contacts} callLogs={callLogs} currentUser={currentUser} assignments={assignments} completed={todoCompleted} onToggle={key => setTodoCompleted(toggleTodoDone(key))} />
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
                  {/* All Chapters */}
                  <button
                    onClick={() => setSelectedChapterId(selectedChapterId === 'all' ? '' : 'all')}
                    style={{ padding: '10px 16px', borderRadius: 12, border: `1.5px solid ${'all' === selectedChapterId ? '#0F172A' : '#E5E7EB'}`, background: 'all' === selectedChapterId ? '#0F172A' : 'white', color: 'all' === selectedChapterId ? 'white' : '#111827', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Globe size={15} style={{ opacity: 0.7 }} />
                    <div>
                      <div style={{ fontWeight: 700 }}>All Chapters</div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.7, marginTop: 1 }}>Aggregated view</div>
                    </div>
                  </button>
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

            {/* Board */}
            {!selectedChapterId ? (
              <div className="module-empty-state" style={{ marginTop: '3rem' }}>
                <Phone size={48} />
                <h3>Select a chapter to begin</h3>
                <p>Choose a chapter above to load platform members into the call pipeline.</p>
              </div>
            ) : loadingContacts ? (
              <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 8 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ height: 44, background: '#f3f4f6', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />
                    {Array.from({ length: 4 }).map((__, j) => <div key={j} style={{ height: 120, background: '#f3f4f6', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />)}
                  </div>
                ))}
              </div>
            ) : contacts.length === 0 ? (
              <div className="module-empty-state">
                <User size={48} />
                <h3>No platform members found</h3>
                <p>This chapter doesn&apos;t have any alumni who have signed up on the platform yet.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minWidth: 'max-content' }}>
                  {(['not_called', 'voicemail', 'called', 'declined'] as const).map(status => (
                    <KanbanColumn key={status} status={status} contacts={cols[status]} callLogs={callLogs} claims={claims} onCallClick={handleCallClick} onTextClick={handleTextClick} />
                  ))}
                  <PendingConnectColumn
                    entries={pendingConnects}
                    onAdd={handleAddPendingConnect}
                    onPromote={handlePromoteToConnected}
                  />
                  <ConnectedColumn entries={connected} />
                </div>
              </div>
            )}
          </>
        ) : (
          /* The Web */
          <WebVisualization callLogs={callLogs} />
        )}
      </main>

      {/* Call Prompt Modal */}
      {callModal && (
        <CallPromptModal
          contact={callModal}
          currentUser={currentUser}
          onAnswered={handleAnswered}
          onVoicemailSaved={handleVoicemailSaved}
          onDeclined={handleDeclined}
          onClose={() => setCallModal(null)}
        />
      )}

      {/* Logging Panel (Answered) */}
      {loggingPanel && (
        <LoggingPanel
          panel={loggingPanel}
          currentUser={currentUser}
          onClose={() => setLoggingPanel(null)}
          onSave={saveLog}
          onChange={u => setLoggingPanel(prev => prev ? { ...prev, ...u } : prev)}
        />
      )}

      {/* Texting Panel */}
      {textingContact && (
        <TextingPanel
          contact={textingContact}
          currentUser={currentUser}
          onClose={() => setTextingContact(null)}
        />
      )}
    </div>
  );
}
