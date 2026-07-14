'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Calendar, Edit2, Trash2, Briefcase, ClipboardList, Instagram, Loader2,
  CheckSquare, Square,
} from 'lucide-react';
import {
  ChapterWithOnboarding, ChapterCheckIn, CheckInFrequency,
  CHECK_IN_FREQUENCY_LABELS, HealthScore, HEALTH_SCORE_LABELS, HEALTH_SCORE_COLORS,
  ChapterMember, MemberStatus, MEMBER_STATUS_CONFIG,
} from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import {
  CS_UI, CS_CARD, SECTION_TITLE, TOOLBAR_BUTTON, TOOLBAR_BUTTON_PRIMARY,
  NEUTRAL_BADGE, LIST_PILL,
} from '../cs-ui';

const INPUT: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '0.8125rem',
  padding: '7px 10px',
  border: `1px solid ${CS_UI.border}`,
  borderRadius: 8,
  outline: 'none',
  fontFamily: 'inherit',
  color: CS_UI.text,
  background: '#fff',
};

interface SuccessTabProps {
  chapter: ChapterWithOnboarding;
  onUpdate: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface LoggedMatch {
  id: string;
  active_member: string;
  alumni_name: string;
  date: string;
  notes: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years}y ago`;
}

// ─── TaskRow sub-component ───────────────────────────────────────────────────

interface TaskRowProps {
  task: {
    id: string;
    title: string;
    due_date: string | null;
    assigned_to: string | null;
    status: 'open' | 'complete';
    created_at: string;
  };
  onToggle: () => void;
  onDelete: () => void;
}

function TaskRow({ task, onToggle, onDelete }: TaskRowProps) {
  const isComplete = task.status === 'complete';
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = !isComplete && task.due_date && task.due_date < today;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', borderRadius: 8,
      background: isComplete ? CS_UI.surfaceMuted : CS_UI.surface,
      border: `1px solid ${CS_UI.border}`,
      opacity: isComplete ? 0.7 : 1,
    }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: isComplete ? CS_UI.success : CS_UI.textSubtle, flexShrink: 0, display: 'flex' }}
        title={isComplete ? 'Mark open' : 'Mark complete'}
      >
        {isComplete ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: '0.8125rem', color: CS_UI.text,
          textDecoration: isComplete ? 'line-through' : 'none',
        }}>
          {task.title}
        </span>
        <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
          {task.due_date && (
            <span style={{
              fontSize: '0.72rem', fontWeight: 600,
              color: isOverdue ? CS_UI.danger : CS_UI.textMuted,
            }}>
              {isOverdue ? 'Overdue · ' : ''}Due {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {task.assigned_to && (
            <span style={{ fontSize: '0.72rem', color: CS_UI.textSubtle }}>
              → {task.assigned_to}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: CS_UI.textSubtle, padding: 2, display: 'flex', flexShrink: 0 }}
        title="Delete task"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SuccessTab({ chapter, onUpdate, showToast }: SuccessTabProps) {
  // ─── Check-ins ───
  const [checkIns, setCheckIns] = useState<ChapterCheckIn[]>([]);
  const [loadingCheckIns, setLoadingCheckIns] = useState(true);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInForm, setCheckInForm] = useState({
    date: new Date().toISOString().split('T')[0],
    notes: '', health_score: 'good' as HealthScore, action_items: [''],
  });

  // ─── Members (headhunting) ───
  const [members, setMembers] = useState<ChapterMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberType, setAddMemberType] = useState<'active' | 'alumni'>('active');
  const [memberForm, setMemberForm] = useState({
    name: '', grad_year: '', major: '', career_interest: '',
    status: 'looking' as MemberStatus, notes: '',
    member_type: 'active' as 'active' | 'alumni',
    job_role: '', company: '', is_hiring: false,
  });
  const [editingMember, setEditingMember] = useState<ChapterMember | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

  // ─── Match log ───
  const [matches, setMatches] = useState<LoggedMatch[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [savingMatch, setSavingMatch] = useState(false);
  const [matchForm, setMatchForm] = useState({ active_member: '', alumni_name: '', date: new Date().toISOString().split('T')[0], notes: '' });

  // ─── Instagram Flyer Tracker ───
  const [flyerPosted, setFlyerPosted] = useState<boolean>(chapter.instagram_flyer_posted ?? false);
  const [flyerPostDate, setFlyerPostDate] = useState<string>(chapter.instagram_flyer_post_date ?? '');
  const [flyerPostUrl, setFlyerPostUrl] = useState<string>(chapter.instagram_flyer_post_url ?? '');
  const [flyerNotes, setFlyerNotes] = useState<string>(chapter.instagram_flyer_notes ?? '');
  const [savingFlyer, setSavingFlyer] = useState(false);

  // ─── Notes ───
  const [execNotes, setExecNotes] = useState(chapter.exec_notes || '');
  const [bonusNotes, setBonusNotes] = useState(chapter.bonus_notes || '');
  const [savingNotes, setSavingNotes] = useState<'exec' | 'bonus' | null>(null);

  // ─── Tasks ───
  interface ChapterTask {
    id: string;
    chapter_id: string;
    title: string;
    due_date: string | null;
    assigned_to: string | null;
    status: 'open' | 'complete';
    created_at: string;
  }
  const [tasks, setTasks] = useState<ChapterTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', due_date: '', assigned_to: '' });
  const [savingTask, setSavingTask] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/tasks`);
      const json = await res.json();
      if (!json.error && json.data) setTasks(json.data);
    } catch { /* silent */ }
    finally { setLoadingTasks(false); }
  }, [chapter.id]);

  const fetchCheckIns = useCallback(async () => {
    try {
      const res = await fetch(`/api/check-ins?chapter_id=${chapter.id}&limit=5`);
      const json = await res.json();
      if (json.data) setCheckIns(json.data);
    } catch { /* silent */ }
    finally { setLoadingCheckIns(false); }
  }, [chapter.id]);

  const fetchMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/chapter-members?chapter_id=${chapter.id}`);
      const json = await res.json();
      if (json.data) setMembers(json.data);
    } finally {
      setLoadingMembers(false);
    }
  }, [chapter.id]);

  const fetchMatches = useCallback(async () => {
    setLoadingMatches(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/matches`);
      const json = await res.json();
      if (!json.error && json.data) setMatches(json.data);
    } catch { /* silent */ }
    finally { setLoadingMatches(false); }
  }, [chapter.id]);

  useEffect(() => {
    fetchCheckIns();
    fetchMembers();
    fetchTasks();
    fetchMatches();
  }, [fetchCheckIns, fetchMembers, fetchTasks, fetchMatches]);

  useEffect(() => {
    setExecNotes(chapter.exec_notes || '');
    setBonusNotes(chapter.bonus_notes || '');
    setFlyerPosted(chapter.instagram_flyer_posted ?? false);
    setFlyerPostDate(chapter.instagram_flyer_post_date ?? '');
    setFlyerPostUrl(chapter.instagram_flyer_post_url ?? '');
    setFlyerNotes(chapter.instagram_flyer_notes ?? '');
  }, [chapter.exec_notes, chapter.bonus_notes, chapter.instagram_flyer_posted, chapter.instagram_flyer_post_date, chapter.instagram_flyer_post_url, chapter.instagram_flyer_notes]);

  async function updateCheckInFrequency(frequency: CheckInFrequency) {
    try {
      const r = await fetch('/api/check-ins', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapter.id, frequency }),
      });
      const res = await r.json();
      if (res.error) showToast(res.error.message, 'error');
      else { showToast('Frequency updated', 'success'); onUpdate(); }
    } catch { showToast('Failed to update', 'error'); }
  }

  async function submitCheckIn() {
    try {
      const r = await fetch('/api/check-ins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapter.id,
          check_in_date: checkInForm.date,
          notes: checkInForm.notes,
          health_score: checkInForm.health_score,
          action_items: checkInForm.action_items.filter(a => a.trim()),
        }),
      });
      const res = await r.json();
      if (res.error) return showToast(res.error.message, 'error');
      showToast('Check-in logged', 'success');
      setShowCheckInModal(false);
      setCheckInForm({ date: new Date().toISOString().split('T')[0], notes: '', health_score: 'good', action_items: [''] });
      fetchCheckIns();
      onUpdate();
    } catch { showToast('Failed to log check-in', 'error'); }
  }

  async function addMember() {
    if (!memberForm.name.trim()) return showToast('Name required', 'error');
    try {
      const r = await fetch('/api/chapter-members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapter.id,
          name: memberForm.name.trim(),
          grad_year: memberForm.grad_year ? parseInt(memberForm.grad_year) : null,
          major: memberForm.major || null,
          career_interest: memberForm.career_interest || null,
          status: memberForm.status,
          notes: memberForm.notes || null,
          member_type: memberForm.member_type,
          job_role: memberForm.job_role || null,
          company: memberForm.company || null,
          is_hiring: memberForm.is_hiring,
        }),
      });
      const json = await r.json();
      if (json.error) return showToast(json.error, 'error');
      showToast('Member added', 'success');
      setShowAddMember(false);
      setMemberForm({ name: '', grad_year: '', major: '', career_interest: '', status: 'looking', notes: '', member_type: 'active', job_role: '', company: '', is_hiring: false });
      fetchMembers();
    } catch { showToast('Failed to add member', 'error'); }
  }

  async function updateMember(memberId: string, updates: Partial<ChapterMember>) {
    try {
      const r = await fetch('/api/chapter-members', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: memberId, ...updates }),
      });
      const json = await r.json();
      if (json.error) return showToast(json.error, 'error');
      fetchMembers();
      setEditingMember(null);
    } catch { showToast('Failed to update', 'error'); }
  }

  async function deleteMember(memberId: string) {
    setDeletingMemberId(memberId);
    try {
      await fetch(`/api/chapter-members?id=${memberId}`, { method: 'DELETE' });
      setMembers(p => p.filter(m => m.id !== memberId));
    } finally { setDeletingMemberId(null); }
  }

  async function saveFlyer(overrides?: Partial<{ posted: boolean; date: string; url: string; notes: string }>) {
    setSavingFlyer(true);
    const posted = overrides?.posted ?? flyerPosted;
    const date = overrides?.date ?? flyerPostDate;
    const url = overrides?.url ?? flyerPostUrl;
    const notes = overrides?.notes ?? flyerNotes;
    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instagram_flyer_posted: posted,
          instagram_flyer_post_date: date || null,
          instagram_flyer_post_url: url || null,
          instagram_flyer_notes: notes || null,
          // Also mark the onboarding checklist step
          activate_ig_flyer: posted,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Failed to save', 'error');
      } else {
        showToast('Instagram flyer status saved', 'success');
        onUpdate();
      }
    } catch { showToast('Failed to save', 'error'); }
    finally { setSavingFlyer(false); }
  }

  async function saveNotes(type: 'exec' | 'bonus') {
    setSavingNotes(type);
    const field = type === 'exec' ? 'exec_notes' : 'bonus_notes';
    const value = type === 'exec' ? execNotes : bonusNotes;
    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Failed to save notes', 'error');
      } else {
        showToast('Notes saved', 'success');
        onUpdate();
      }
    } catch { showToast('Failed to save notes', 'error'); }
    finally { setSavingNotes(null); }
  }

  async function addMatch() {
    if (!matchForm.active_member.trim() || !matchForm.alumni_name.trim()) return showToast('Both names required', 'error');
    // Optimistic update
    const tempId = Date.now().toString();
    const optimistic = { id: tempId, ...matchForm };
    setMatches(p => [optimistic, ...p]);
    setMatchForm({ active_member: '', alumni_name: '', date: new Date().toISOString().split('T')[0], notes: '' });
    setSavingMatch(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_member: matchForm.active_member.trim(),
          alumni_name: matchForm.alumni_name.trim(),
          date: matchForm.date,
          notes: matchForm.notes || null,
        }),
      });
      const json = await res.json();
      if (json.error) {
        // Roll back optimistic update
        setMatches(p => p.filter(m => m.id !== tempId));
        showToast(json.error, 'error');
        return;
      }
      // Replace temp entry with real DB record (correct ID)
      setMatches(p => p.map(m => m.id === tempId ? json.data : m));
      showToast('Match logged', 'success');
    } catch {
      setMatches(p => p.filter(m => m.id !== tempId));
      showToast('Failed to save match', 'error');
    } finally {
      setSavingMatch(false);
    }
  }

  async function addTask() {
    if (!taskForm.title.trim()) return showToast('Task title required', 'error');
    setSavingTask(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskForm.title.trim(),
          due_date: taskForm.due_date || null,
          assigned_to: taskForm.assigned_to || null,
        }),
      });
      const json = await res.json();
      if (json.error) return showToast(json.error, 'error');
      showToast('Task added', 'success');
      setTaskForm({ title: '', due_date: '', assigned_to: '' });
      setShowAddTask(false);
      fetchTasks();
    } catch { showToast('Failed to add task', 'error'); }
    finally { setSavingTask(false); }
  }

  async function toggleTaskStatus(task: ChapterTask) {
    const newStatus = task.status === 'open' ? 'complete' : 'open';
    try {
      await fetch(`/api/chapters/${chapter.id}/tasks`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, status: newStatus }),
      });
      setTasks(p => p.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch { showToast('Failed to update task', 'error'); }
  }

  async function deleteTask(taskId: string) {
    try {
      await fetch(`/api/chapters/${chapter.id}/tasks?taskId=${taskId}`, { method: 'DELETE' });
      setTasks(p => p.filter(t => t.id !== taskId));
      showToast('Task deleted', 'info');
    } catch { showToast('Failed to delete task', 'error'); }
  }

  const daysUntilCheckIn = chapter.next_check_in_date
    ? Math.ceil((new Date(chapter.next_check_in_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ─── 1. Check-ins ─── */}
      <section>
        <h3 style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={15} color={CS_UI.textMuted} /> Check-ins
        </h3>
        <div style={{ ...CS_CARD, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: CS_UI.textSecondary }}>Frequency:</label>
              <select
                value={chapter.check_in_frequency || 'biweekly'}
                onChange={e => updateCheckInFrequency(e.target.value as CheckInFrequency)}
                style={{ ...INPUT, width: 'auto', height: 34, padding: '0 10px' }}
              >
                {Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setShowCheckInModal(true)} style={TOOLBAR_BUTTON_PRIMARY}>
              <Plus size={13} /> Log Check-in
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: CS_UI.textMuted, marginBottom: 12 }}>
            <Calendar size={14} />
            {chapter.next_check_in_date ? (
              <>
                Next: <strong style={{ color: CS_UI.text }}>{new Date(chapter.next_check_in_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                {daysUntilCheckIn !== null && (
                  <span style={{
                    ...LIST_PILL,
                    background: daysUntilCheckIn < 0 ? '#fef2f2' : daysUntilCheckIn <= 3 ? '#fffbeb' : NEUTRAL_BADGE.bg,
                    color: daysUntilCheckIn < 0 ? CS_UI.danger : daysUntilCheckIn <= 3 ? CS_UI.warning : CS_UI.textMuted,
                    border: `1px solid ${daysUntilCheckIn < 0 ? '#fecaca' : daysUntilCheckIn <= 3 ? '#fde68a' : NEUTRAL_BADGE.border}`,
                  }}>
                    {daysUntilCheckIn < 0 ? `${Math.abs(daysUntilCheckIn)}d overdue` : daysUntilCheckIn === 0 ? 'Today' : `in ${daysUntilCheckIn}d`}
                  </span>
                )}
              </>
            ) : <span style={{ color: CS_UI.textSubtle }}>No check-ins scheduled</span>}
          </div>

          {loadingCheckIns ? (
            <div style={{ color: CS_UI.textSubtle, fontSize: '0.8125rem' }}>Loading…</div>
          ) : checkIns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h5 style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, color: CS_UI.textSubtle, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent</h5>
              {checkIns.slice(0, 3).map(ci => (
                <div key={ci.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: CS_UI.surfaceMuted, borderRadius: 8, border: `1px solid ${CS_UI.border}` }}>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: CS_UI.textSecondary, flexShrink: 0 }}>
                    {new Date(ci.check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {ci.health_score && (
                    <span style={{ ...LIST_PILL, background: HEALTH_SCORE_COLORS[ci.health_score].bg, color: HEALTH_SCORE_COLORS[ci.health_score].text, border: '1px solid transparent' }}>
                      {HEALTH_SCORE_LABELS[ci.health_score]}
                    </span>
                  )}
                  {ci.notes && <span style={{ fontSize: '0.8125rem', color: CS_UI.textMuted }}>{ci.notes.slice(0, 80)}{ci.notes.length > 80 ? '…' : ''}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: CS_UI.textSubtle }}>No check-ins logged yet.</p>
          )}
        </div>
      </section>

      {/* ─── Instagram Flyer Tracker ─── */}
      <section>
        <h3 style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Instagram size={15} color={CS_UI.textMuted} /> Instagram Story Flyer
        </h3>
        <div style={{ ...CS_CARD, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                ...LIST_PILL,
                background: flyerPosted ? '#ecfdf5' : NEUTRAL_BADGE.bg,
                color: flyerPosted ? CS_UI.success : CS_UI.textSecondary,
                border: `1px solid ${flyerPosted ? '#6ee7b7' : NEUTRAL_BADGE.border}`,
              }}>
                {flyerPosted ? 'Posted' : 'Not Posted'}
              </span>
              {!flyerPosted && chapter.status === 'active' && (() => {
                const daysSinceActive = chapter.payment_start_date
                  ? Math.floor((Date.now() - new Date(chapter.payment_start_date).getTime()) / 86400000)
                  : null;
                return daysSinceActive !== null && daysSinceActive > 14 ? (
                  <span style={{ ...LIST_PILL, background: '#fffbeb', color: CS_UI.warning, border: '1px solid #fde68a' }}>
                    {daysSinceActive}d since activation — no flyer yet
                  </span>
                ) : null;
              })()}
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !flyerPosted;
                setFlyerPosted(next);
                if (next && !flyerPostDate) {
                  const today = new Date().toISOString().split('T')[0];
                  setFlyerPostDate(today);
                  saveFlyer({ posted: next, date: today });
                } else {
                  saveFlyer({ posted: next });
                }
              }}
              disabled={savingFlyer}
              style={flyerPosted
                ? { ...TOOLBAR_BUTTON, opacity: savingFlyer ? 0.7 : 1 }
                : { ...TOOLBAR_BUTTON_PRIMARY, opacity: savingFlyer ? 0.7 : 1 }}
            >
              {savingFlyer ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {flyerPosted ? 'Mark Not Posted' : 'Mark as Posted'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Post Date</label>
                <input type="date" value={flyerPostDate} onChange={e => setFlyerPostDate(e.target.value)} onBlur={() => saveFlyer()} style={INPUT} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>
                  Post URL <span style={{ fontWeight: 400, color: CS_UI.textSubtle }}>(optional)</span>
                </label>
                <input type="url" value={flyerPostUrl} onChange={e => setFlyerPostUrl(e.target.value)} onBlur={() => saveFlyer()} placeholder="https://instagram.com/p/..." style={INPUT} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>
                Notes <span style={{ fontWeight: 400, color: CS_UI.textSubtle }}>(optional)</span>
              </label>
              <input type="text" value={flyerNotes} onChange={e => setFlyerNotes(e.target.value)} onBlur={() => saveFlyer()} placeholder="e.g. Posted to story + feed, tagged Trailblaize" style={INPUT} />
            </div>
            {flyerPosted && flyerPostUrl && (
              <a href={flyerPostUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8125rem', color: CS_UI.blueDark, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Instagram size={13} /> View Post →
              </a>
            )}
          </div>

          <p style={{ marginTop: 14, marginBottom: 0, fontSize: '0.75rem', color: CS_UI.textSubtle, lineHeight: 1.5 }}>
            Social proof milestone — chapters that post flyers drive organic inbound from other schools. No post after 14 days active = health warning.
          </p>
        </div>
      </section>

      {/* ─── 2. Headhunting / Matchmaking ─── */}
      <section>
        <h3 style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Briefcase size={15} color={CS_UI.textMuted} /> Headhunting / Matchmaking
        </h3>
        <div style={{ ...CS_CARD, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: '0.8125rem', color: CS_UI.textMuted }}>Track actives and alumni for career connections</span>
            <button
              type="button"
              onClick={() => { setShowAddMember(true); setEditingMember(null); setAddMemberType('active'); setMemberForm({ name: '', grad_year: '', major: '', career_interest: '', status: 'looking', notes: '', member_type: 'active', job_role: '', company: '', is_hiring: false }); }}
              style={TOOLBAR_BUTTON_PRIMARY}
            >
              <Plus size={13} /> Add Member
            </button>
          </div>

          {loadingMembers ? (
            <div style={{ color: CS_UI.textSubtle, fontSize: '0.8125rem' }}>Loading…</div>
          ) : members.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.8125rem', color: CS_UI.textSubtle }}>No members tracked yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...members].sort((a, b) => {
                if (a.is_hiring && !b.is_hiring) return -1;
                if (!a.is_hiring && b.is_hiring) return 1;
                if ((a.member_type || 'active') === 'alumni' && (b.member_type || 'active') !== 'alumni') return -1;
                if ((a.member_type || 'active') !== 'alumni' && (b.member_type || 'active') === 'alumni') return 1;
                return 0;
              }).map(m => (
                editingMember?.id === m.id ? (
                  <div key={m.id} style={{ background: CS_UI.surfaceMuted, borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', border: `1px solid ${CS_UI.border}` }}>
                    <input className="cs-member-input" placeholder="Name" value={memberForm.name} onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))} style={{ ...INPUT, flex: '1 1 120px', width: 'auto' }} />
                    <input className="cs-member-input" placeholder="Grad Year" value={memberForm.grad_year} onChange={e => setMemberForm(p => ({ ...p, grad_year: e.target.value }))} style={{ ...INPUT, width: 90 }} />
                    {(m.member_type || 'active') === 'active' ? (
                      <input className="cs-member-input" placeholder="Major" value={memberForm.major} onChange={e => setMemberForm(p => ({ ...p, major: e.target.value }))} style={{ ...INPUT, flex: '1 1 100px', width: 'auto' }} />
                    ) : (
                      <>
                        <input className="cs-member-input" placeholder="Job Role" value={memberForm.job_role} onChange={e => setMemberForm(p => ({ ...p, job_role: e.target.value }))} style={{ ...INPUT, flex: '1 1 120px', width: 'auto' }} />
                        <input className="cs-member-input" placeholder="Company" value={memberForm.company} onChange={e => setMemberForm(p => ({ ...p, company: e.target.value }))} style={{ ...INPUT, flex: '1 1 120px', width: 'auto' }} />
                      </>
                    )}
                    <select className="cs-member-select" value={memberForm.status} onChange={e => setMemberForm(p => ({ ...p, status: e.target.value as MemberStatus }))} style={{ ...INPUT, width: 'auto' }}>
                      {(Object.keys(MEMBER_STATUS_CONFIG) as MemberStatus[]).map(s => (
                        <option key={s} value={s}>{MEMBER_STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => updateMember(m.id, {
                      name: memberForm.name,
                      grad_year: memberForm.grad_year ? parseInt(memberForm.grad_year) : null,
                      major: (m.member_type || 'active') === 'active' ? (memberForm.major || null) : null,
                      job_role: (m.member_type || 'active') === 'alumni' ? (memberForm.job_role || null) : null,
                      company: (m.member_type || 'active') === 'alumni' ? (memberForm.company || null) : null,
                      is_hiring: memberForm.is_hiring,
                      status: memberForm.status,
                    })} style={{ ...TOOLBAR_BUTTON_PRIMARY, padding: '0 12px', height: 30, fontSize: '0.8rem' }}>Save</button>
                    <button type="button" onClick={() => setEditingMember(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: CS_UI.textMuted }}><X size={14} /></button>
                  </div>
                ) : (
                  <div key={m.id} className="cs-member-row">
                    <div className="cs-member-name" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {m.name}
                        <span style={{
                          ...LIST_PILL,
                          background: (m.member_type || 'active') === 'alumni' ? NEUTRAL_BADGE.bg : '#eff6ff',
                          color: (m.member_type || 'active') === 'alumni' ? CS_UI.textSecondary : CS_UI.blueDark,
                          border: `1px solid ${(m.member_type || 'active') === 'alumni' ? NEUTRAL_BADGE.border : '#bfdbfe'}`,
                        }}>
                          {(m.member_type || 'active') === 'alumni' ? 'Alumni' : 'Active'}
                        </span>
                        {m.platform_member_id && (
                          <a
                            href={`https://trailblaize.net/profile/${m.platform_member_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: 'none' }}
                            title="View on Trailblaize platform"
                          >
                            <span style={{ ...LIST_PILL, background: '#ecfdf5', color: CS_UI.success, border: '1px solid #6ee7b7' }}>
                              On Platform
                            </span>
                          </a>
                        )}
                      </div>
                      {m.platform_joined_at && (
                        <span style={{ fontSize: '0.68rem', color: CS_UI.textSubtle }}>
                          Joined {formatRelativeDate(m.platform_joined_at)}
                        </span>
                      )}
                    </div>
                    {m.grad_year && <div className="cs-member-meta">&apos;{String(m.grad_year).slice(2)}</div>}
                    {(m.member_type || 'active') === 'alumni' ? (
                      <>
                        {m.job_role && <div className="cs-member-meta">{m.job_role}</div>}
                        {m.company && <div className="cs-member-meta cs-member-meta--muted">{m.company}</div>}
                        {m.is_hiring && <span style={{ ...LIST_PILL, background: '#ecfdf5', color: CS_UI.success, border: '1px solid #6ee7b7' }}>Hiring</span>}
                      </>
                    ) : (
                      m.major && <div className="cs-member-meta cs-member-meta--muted">{m.major}</div>
                    )}
                    {m.career_interest && <div className="cs-member-interest">{m.career_interest}</div>}
                    <span className="cs-member-status" style={{ background: MEMBER_STATUS_CONFIG[m.status].bg, color: MEMBER_STATUS_CONFIG[m.status].color }}>
                      {MEMBER_STATUS_CONFIG[m.status].label}
                    </span>
                    <div className="cs-member-row-actions">
                      <button type="button" className="module-table-action" onClick={() => { setEditingMember(m); setMemberForm({ name: m.name, grad_year: m.grad_year ? String(m.grad_year) : '', major: m.major || '', career_interest: m.career_interest || '', status: m.status, notes: m.notes || '', member_type: m.member_type || 'active', job_role: m.job_role || '', company: m.company || '', is_hiring: m.is_hiring || false }); }}>
                        <Edit2 size={13} />
                      </button>
                      <button type="button" className="module-table-action delete" disabled={deletingMemberId === m.id} onClick={() => deleteMember(m.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {showAddMember && (
            <div style={{ marginTop: 16, background: CS_UI.surfaceMuted, borderRadius: 8, padding: 16, border: `1px solid ${CS_UI.border}` }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {(['active', 'alumni'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setAddMemberType(type); setMemberForm(p => ({ ...p, member_type: type })); }}
                    style={addMemberType === type ? TOOLBAR_BUTTON_PRIMARY : TOOLBAR_BUTTON}
                  >
                    {type === 'active' ? 'Active Member' : 'Alumni'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Name *</label>
                  <input value={memberForm.name} onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" style={INPUT} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Grad Year</label>
                  <input type="number" value={memberForm.grad_year} onChange={e => setMemberForm(p => ({ ...p, grad_year: e.target.value }))} placeholder="2025" style={INPUT} />
                </div>
                {addMemberType === 'active' ? (
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Major</label>
                    <input value={memberForm.major} onChange={e => setMemberForm(p => ({ ...p, major: e.target.value }))} style={INPUT} />
                  </div>
                ) : (
                  <>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Job Role</label>
                      <input value={memberForm.job_role} onChange={e => setMemberForm(p => ({ ...p, job_role: e.target.value }))} placeholder="VP at Goldman Sachs" style={INPUT} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Company</label>
                      <input value={memberForm.company} onChange={e => setMemberForm(p => ({ ...p, company: e.target.value }))} style={INPUT} />
                    </div>
                  </>
                )}
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Career Interest</label>
                  <input value={memberForm.career_interest} onChange={e => setMemberForm(p => ({ ...p, career_interest: e.target.value }))} style={INPUT} />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Status</label>
                  <select value={memberForm.status} onChange={e => setMemberForm(p => ({ ...p, status: e.target.value as MemberStatus }))} style={INPUT}>
                    {(Object.keys(MEMBER_STATUS_CONFIG) as MemberStatus[]).map(s => <option key={s} value={s}>{MEMBER_STATUS_CONFIG[s].label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Notes</label>
                  <input value={memberForm.notes} onChange={e => setMemberForm(p => ({ ...p, notes: e.target.value }))} style={INPUT} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={addMember} style={TOOLBAR_BUTTON_PRIMARY}>Add Member</button>
                <button type="button" onClick={() => setShowAddMember(false)} style={TOOLBAR_BUTTON}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 20, borderTop: `1px solid ${CS_UI.border}`, paddingTop: 16 }}>
            <h5 style={{ margin: '0 0 12px', fontSize: '0.8125rem', fontWeight: 700, color: CS_UI.text }}>Log Match</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Active Member</label>
                <input value={matchForm.active_member} onChange={e => setMatchForm(p => ({ ...p, active_member: e.target.value }))} placeholder="Name" style={INPUT} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Alumni</label>
                <input value={matchForm.alumni_name} onChange={e => setMatchForm(p => ({ ...p, alumni_name: e.target.value }))} placeholder="Name" style={INPUT} />
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Date</label>
                <input type="date" value={matchForm.date} onChange={e => setMatchForm(p => ({ ...p, date: e.target.value }))} style={INPUT} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Outcome Notes</label>
              <input value={matchForm.notes} onChange={e => setMatchForm(p => ({ ...p, notes: e.target.value }))} placeholder="How did the intro go?" style={INPUT} />
            </div>
            <button type="button" onClick={addMatch} disabled={savingMatch} style={{ ...TOOLBAR_BUTTON_PRIMARY, opacity: savingMatch ? 0.7 : 1 }}>
              {savingMatch ? 'Saving…' : 'Log Match'}
            </button>

            {matches.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h5 style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, color: CS_UI.textSubtle, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Logged Matches ({matches.length})
                </h5>
                {matches.map(m => (
                  <div key={m.id} style={{ display: 'flex', gap: 10, fontSize: '0.8125rem', background: CS_UI.surfaceMuted, padding: '8px 10px', borderRadius: 8, alignItems: 'center', border: `1px solid ${CS_UI.border}`, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: CS_UI.text }}>{m.active_member}</span>
                    <span style={{ color: CS_UI.textSubtle }}>↔</span>
                    <span style={{ fontWeight: 600, color: CS_UI.text }}>{m.alumni_name}</span>
                    <span style={{ color: CS_UI.textSubtle }}>{m.date}</span>
                    {m.notes && <span style={{ color: CS_UI.textMuted, flex: 1 }}>{m.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Tasks ─── */}
      <section>
        <h3 style={{ ...SECTION_TITLE, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClipboardList size={15} color={CS_UI.textMuted} /> Tasks
        </h3>
        <div style={{ ...CS_CARD, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: '0.8125rem', color: CS_UI.textMuted }}>
              {tasks.filter(t => t.status === 'open').length} open · {tasks.filter(t => t.status === 'complete').length} complete
            </span>
            <button type="button" onClick={() => setShowAddTask(v => !v)} style={TOOLBAR_BUTTON_PRIMARY}>
              <Plus size={13} /> Add Task
            </button>
          </div>

          {showAddTask && (
            <div style={{ background: CS_UI.surfaceMuted, borderRadius: 8, padding: '14px 16px', border: `1px solid ${CS_UI.border}`, marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Task *</label>
                  <input
                    value={taskForm.title}
                    onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Follow up on alumni list"
                    onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Due Date</label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={e => setTaskForm(p => ({ ...p, due_date: e.target.value }))}
                    style={INPUT}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Assigned To</label>
                  <input
                    value={taskForm.assigned_to}
                    onChange={e => setTaskForm(p => ({ ...p, assigned_to: e.target.value }))}
                    placeholder="Owen, Ford…"
                    style={INPUT}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={addTask}
                  disabled={savingTask || !taskForm.title.trim()}
                  style={{ ...TOOLBAR_BUTTON_PRIMARY, opacity: savingTask || !taskForm.title.trim() ? 0.7 : 1 }}
                >
                  {savingTask ? 'Adding…' : 'Add Task'}
                </button>
                <button type="button" onClick={() => setShowAddTask(false)} style={TOOLBAR_BUTTON}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loadingTasks ? (
            <div style={{ color: CS_UI.textSubtle, fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading tasks…
            </div>
          ) : tasks.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: CS_UI.textSubtle, margin: 0 }}>No tasks yet. Add one above.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tasks.filter(t => t.status === 'open').map(task => (
                <TaskRow key={task.id} task={task} onToggle={() => toggleTaskStatus(task)} onDelete={() => deleteTask(task.id)} />
              ))}
              {tasks.filter(t => t.status === 'complete').length > 0 && (
                <>
                  {tasks.filter(t => t.status === 'open').length > 0 && (
                    <div style={{ borderTop: `1px dashed ${CS_UI.border}`, margin: '6px 0' }} />
                  )}
                  {tasks.filter(t => t.status === 'complete').map(task => (
                    <TaskRow key={task.id} task={task} onToggle={() => toggleTaskStatus(task)} onDelete={() => deleteTask(task.id)} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── 3. Exec Meeting Notes ─── */}
      <section>
        <h3 style={SECTION_TITLE}>Exec Meeting Notes</h3>
        <div style={{ ...CS_CARD, padding: '14px 16px' }}>
          <textarea
            value={execNotes}
            onChange={e => setExecNotes(e.target.value)}
            onBlur={() => saveNotes('exec')}
            placeholder="Notes from exec team meetings…"
            rows={5}
            style={{ ...INPUT, minHeight: 120, resize: 'vertical', height: 'auto', padding: '10px 12px', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: '0.75rem', color: CS_UI.textSubtle }}>Auto-saves on blur</span>
            <button type="button" onClick={() => saveNotes('exec')} disabled={savingNotes === 'exec'} style={TOOLBAR_BUTTON}>
              {savingNotes === 'exec' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* ─── 4. Bonus Notes ─── */}
      <section>
        <h3 style={SECTION_TITLE}>
          Bonus Notes{' '}
          <span style={{ fontSize: '0.8125rem', color: CS_UI.textMuted, fontWeight: 400 }}>(care packages, extras)</span>
        </h3>
        <div style={{ ...CS_CARD, padding: '14px 16px' }}>
          <textarea
            value={bonusNotes}
            onChange={e => setBonusNotes(e.target.value)}
            onBlur={() => saveNotes('bonus')}
            placeholder="Care packages, swag, extras, special requests…"
            rows={4}
            style={{ ...INPUT, minHeight: 96, resize: 'vertical', height: 'auto', padding: '10px 12px', lineHeight: 1.6 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: '0.75rem', color: CS_UI.textSubtle }}>Auto-saves on blur</span>
            <button type="button" onClick={() => saveNotes('bonus')} disabled={savingNotes === 'bonus'} style={TOOLBAR_BUTTON}>
              {savingNotes === 'bonus' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* Check-in Modal */}
      {showCheckInModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowCheckInModal(false)}>
          <div className="module-modal" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header"><h2>Log Check-in</h2><button className="module-modal-close" onClick={() => setShowCheckInModal(false)}><X size={20} /></button></div>
            <div className="module-modal-body">
              <div className="module-form-group"><label>Date</label><input type="date" value={checkInForm.date} onChange={e => setCheckInForm({ ...checkInForm, date: e.target.value })} /></div>
              <div className="module-form-group">
                <label>Health Score</label>
                <div className="cs-health-options">
                  {(Object.keys(HEALTH_SCORE_LABELS) as HealthScore[]).map(score => (
                    <label key={score} className={`cs-health-option ${checkInForm.health_score === score ? 'selected' : ''}`}
                      style={{ background: checkInForm.health_score === score ? HEALTH_SCORE_COLORS[score].bg : 'transparent', borderColor: HEALTH_SCORE_COLORS[score].bg, color: checkInForm.health_score === score ? HEALTH_SCORE_COLORS[score].text : '#64748b' }}>
                      <input type="radio" name="health_score" value={score} checked={checkInForm.health_score === score} onChange={() => setCheckInForm({ ...checkInForm, health_score: score })} />
                      {HEALTH_SCORE_LABELS[score]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="module-form-group"><label>Notes</label><textarea value={checkInForm.notes} onChange={e => setCheckInForm({ ...checkInForm, notes: e.target.value })} placeholder="How did the check-in go?" rows={4} /></div>
              <div className="module-form-group">
                <label>Action Items</label>
                {checkInForm.action_items.map((item, i) => (
                  <div key={i} className="cs-action-item-input">
                    <input type="text" value={item} onChange={e => { const n = [...checkInForm.action_items]; n[i] = e.target.value; setCheckInForm({ ...checkInForm, action_items: n }); }} placeholder="e.g. Follow up on alumni list upload" />
                    {checkInForm.action_items.length > 1 && <button type="button" className="cs-remove-action" onClick={() => setCheckInForm({ ...checkInForm, action_items: checkInForm.action_items.filter((_, j) => j !== i) })}><X size={14} /></button>}
                  </div>
                ))}
                <button type="button" className="cs-add-action" onClick={() => setCheckInForm({ ...checkInForm, action_items: [...checkInForm.action_items, ''] })}><Plus size={14} /> Add Action Item</button>
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowCheckInModal(false)}>Cancel</button>
              <button className="module-primary-btn" onClick={submitCheckIn}>Log Check-in</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
