'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, X, Calendar, GraduationCap, Edit2, Trash2, Briefcase, BookOpen, MapPin,
  Linkedin, Loader2, CheckSquare, Square, ClipboardList, Instagram,
} from 'lucide-react';
import {
  supabase, ChapterWithOnboarding, ChapterCheckIn, CheckInFrequency,
  CHECK_IN_FREQUENCY_LABELS, HealthScore, HEALTH_SCORE_LABELS, HEALTH_SCORE_COLORS,
  ChapterMember, MemberStatus, MEMBER_STATUS_CONFIG,
} from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';

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
      padding: '8px 10px', borderRadius: 2,
      background: isComplete ? 'rgba(0,0,0,0.02)' : '#F7F5F1',
      border: '1px solid #E8E4DF',
      opacity: isComplete ? 0.65 : 1,
      transition: 'opacity 0.15s',
    }}>
      <button
        onClick={onToggle}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: isComplete ? '#059669' : '#9ca3af', flexShrink: 0, display: 'flex' }}
        title={isComplete ? 'Mark open' : 'Mark complete'}
      >
        {isComplete ? <CheckSquare size={16} /> : <Square size={16} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: '0.85rem', color: '#1B2A4A',
          textDecoration: isComplete ? 'line-through' : 'none',
        }}>
          {task.title}
        </span>
        <div style={{ display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
          {task.due_date && (
            <span style={{
              fontSize: '0.72rem', fontWeight: 600,
              color: isOverdue ? '#dc2626' : '#6b7280',
            }}>
              {isOverdue ? '⚠ ' : ''}Due {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {task.assigned_to && (
            <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
              → {task.assigned_to}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onDelete}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 2, display: 'flex', flexShrink: 0, transition: 'color 0.1s' }}
        title="Delete task"
        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
        onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}
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
    if (!supabase) { setLoadingCheckIns(false); return; }
    const { data } = await supabase
      .from('chapter_check_ins')
      .select('*, action_items:check_in_action_items(*)')
      .eq('chapter_id', chapter.id)
      .order('check_in_date', { ascending: false })
      .limit(5);
    if (data) setCheckIns(data);
    setLoadingCheckIns(false);
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
    if (!supabase) return;
    setSavingFlyer(true);
    const posted = overrides?.posted ?? flyerPosted;
    const date = overrides?.date ?? flyerPostDate;
    const url = overrides?.url ?? flyerPostUrl;
    const notes = overrides?.notes ?? flyerNotes;
    try {
      const { error } = await supabase.from('chapters').update({
        instagram_flyer_posted: posted,
        instagram_flyer_post_date: date || null,
        instagram_flyer_post_url: url || null,
        instagram_flyer_notes: notes || null,
        // Also mark the onboarding checklist step
        activate_ig_flyer: posted,
      }).eq('id', chapter.id);
      if (error) {
        if (error.message?.includes('column') || error.code === 'PGRST204') {
          showToast('Saved locally (DB column missing — run migration)', 'info');
        } else {
          showToast(`Failed: ${error.message}`, 'error');
        }
      } else {
        showToast('Instagram flyer status saved', 'success');
        onUpdate();
      }
    } catch { showToast('Failed to save', 'error'); }
    finally { setSavingFlyer(false); }
  }

  async function saveNotes(type: 'exec' | 'bonus') {
    if (!supabase) return;
    setSavingNotes(type);
    const field = type === 'exec' ? 'exec_notes' : 'bonus_notes';
    const value = type === 'exec' ? execNotes : bonusNotes;
    try {
      const { error } = await supabase.from('chapters').update({ [field]: value }).eq('id', chapter.id);
      if (error) {
        if (error.message?.includes('column') || error.code === 'PGRST204') {
          showToast('Saved locally (DB column missing — run migration)', 'info');
        } else {
          showToast(`Failed: ${error.message}`, 'error');
        }
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
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ─── 1. Check-ins ─── */}
      <section>
        <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: '1.1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#1B2A4A' }}>
          📅 Check-ins
        </h3>
        <div style={{ background: '#fff', border: '1px solid #D9D4CC', borderRadius: 2, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>Frequency:</label>
              <select
                value={chapter.check_in_frequency || 'biweekly'}
                onChange={e => updateCheckInFrequency(e.target.value as CheckInFrequency)}
                style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff' }}
              >
                {Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => setShowCheckInModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 2, background: '#1B2A4A', color: '#F7F5F1', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'background 0.15s ease-out' }}
            >
              <Plus size={13} /> Log Check-in
            </button>
          </div>

          {/* Next check-in */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: '#4b5563', marginBottom: 12 }}>
            <Calendar size={15} />
            {chapter.next_check_in_date ? (
              <>
                Next: <strong>{new Date(chapter.next_check_in_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                {daysUntilCheckIn !== null && (
                  <span style={{
                    fontSize: '0.78rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                    background: daysUntilCheckIn < 0 ? '#fee2e2' : daysUntilCheckIn <= 3 ? '#fef3c7' : '#f3f4f6',
                    color: daysUntilCheckIn < 0 ? '#991b1b' : daysUntilCheckIn <= 3 ? '#92400e' : '#6b7280',
                  }}>
                    {daysUntilCheckIn < 0 ? `${Math.abs(daysUntilCheckIn)}d overdue` : daysUntilCheckIn === 0 ? 'Today' : `in ${daysUntilCheckIn}d`}
                  </span>
                )}
              </>
            ) : <span style={{ color: '#9ca3af' }}>No check-ins scheduled</span>}
          </div>

          {/* Recent check-ins */}
          {loadingCheckIns ? (
            <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Loading…</div>
          ) : checkIns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h5 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recent</h5>
              {checkIns.slice(0, 3).map(ci => (
                <div key={ci.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: '#F7F5F1', borderRadius: 2, border: '1px solid #E8E4DF' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                    {new Date(ci.check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  {ci.health_score && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 8px', borderRadius: 99, background: HEALTH_SCORE_COLORS[ci.health_score].bg, color: HEALTH_SCORE_COLORS[ci.health_score].text, flexShrink: 0 }}>
                      {HEALTH_SCORE_LABELS[ci.health_score]}
                    </span>
                  )}
                  {ci.notes && <span style={{ fontSize: '0.8rem', color: '#4b5563' }}>{ci.notes.slice(0, 80)}{ci.notes.length > 80 ? '…' : ''}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>No check-ins logged yet.</p>
          )}
        </div>
      </section>

      {/* ─── Instagram Flyer Tracker ─── */}
      <section>
        <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: '1.1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#1B2A4A' }}>
          <Instagram size={16} /> Instagram Story Flyer
        </h3>
        <div style={{ background: '#fff', border: '1px solid #D9D4CC', borderRadius: 2, padding: '18px 20px' }}>
          {/* Status badge + toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: '0.75rem', fontWeight: 700, padding: '3px 12px', borderRadius: 99,
                background: flyerPosted ? '#EAF0E8' : '#F5EFE0',
                color: flyerPosted ? '#2A4229' : '#6B4A1E',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {flyerPosted ? '✓ Posted' : '⏳ Not Posted'}
              </span>
              {!flyerPosted && chapter.status === 'active' && (() => {
                const daysSinceActive = chapter.payment_start_date
                  ? Math.floor((Date.now() - new Date(chapter.payment_start_date).getTime()) / 86400000)
                  : null;
                return daysSinceActive !== null && daysSinceActive > 14 ? (
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>
                    ⚠ {daysSinceActive}d since activation — no flyer yet
                  </span>
                ) : null;
              })()}
            </div>
            <button
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
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 2,
                background: flyerPosted ? '#F5E8E0' : '#1B2A4A',
                color: flyerPosted ? '#6B2A1E' : '#F7F5F1',
                border: flyerPosted ? '1px solid #F5C5B5' : 'none',
                cursor: savingFlyer ? 'not-allowed' : 'pointer',
                fontSize: '0.8rem', fontWeight: 600,
                transition: 'all 0.15s ease-out',
              }}
            >
              {savingFlyer ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {flyerPosted ? 'Mark Not Posted' : 'Mark as Posted ✓'}
            </button>
          </div>

          {/* Details form — only shown when posted */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="module-form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Post Date
                </label>
                <input
                  type="date"
                  value={flyerPostDate}
                  onChange={e => setFlyerPostDate(e.target.value)}
                  onBlur={() => saveFlyer()}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.85rem', padding: '6px 10px', border: '1px solid #D9D4CC', borderRadius: 2, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>
              <div className="module-form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                  Post URL <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
                </label>
                <input
                  type="url"
                  value={flyerPostUrl}
                  onChange={e => setFlyerPostUrl(e.target.value)}
                  onBlur={() => saveFlyer()}
                  placeholder="https://instagram.com/p/..."
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.85rem', padding: '6px 10px', border: '1px solid #D9D4CC', borderRadius: 2, outline: 'none', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div className="module-form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                Notes <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={flyerNotes}
                onChange={e => setFlyerNotes(e.target.value)}
                onBlur={() => saveFlyer()}
                placeholder="e.g. Posted to story + feed, tagged Trailblaize"
                style={{ width: '100%', boxSizing: 'border-box', fontSize: '0.85rem', padding: '6px 10px', border: '1px solid #D9D4CC', borderRadius: 2, outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            {flyerPosted && flyerPostUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a
                  href={flyerPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.8rem', color: '#C4874A', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Instagram size={13} /> View Post →
                </a>
              </div>
            )}
          </div>

          <p style={{ marginTop: 14, fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.5 }}>
            Social proof milestone — chapters that post flyers drive organic inbound from other schools. No post after 14 days active = health warning.
          </p>
        </div>
      </section>

      {/* ─── 2. Headhunting / Matchmaking ─── */}
      <section>
        <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: '1.1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#1B2A4A' }}>
          <Briefcase size={16} /> Headhunting / Matchmaking
        </h3>
        <div style={{ background: '#fff', border: '1px solid #D9D4CC', borderRadius: 2, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Track actives and alumni for career connections</span>
            <button
              onClick={() => { setShowAddMember(true); setEditingMember(null); setAddMemberType('active'); setMemberForm({ name: '', grad_year: '', major: '', career_interest: '', status: 'looking', notes: '', member_type: 'active', job_role: '', company: '', is_hiring: false }); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 2, background: '#1B2A4A', color: '#F7F5F1', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'background 0.15s ease-out' }}
            >
              <Plus size={13} /> Add Member
            </button>
          </div>

          {loadingMembers ? (
            <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Loading…</div>
          ) : members.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>No members tracked yet.</p>
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
                  <div key={m.id} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input className="cs-member-input" placeholder="Name" value={memberForm.name} onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))} style={{ flex: '1 1 120px' }} />
                    <input className="cs-member-input" placeholder="Grad Year" value={memberForm.grad_year} onChange={e => setMemberForm(p => ({ ...p, grad_year: e.target.value }))} style={{ width: 90 }} />
                    {(m.member_type || 'active') === 'active' ? (
                      <input className="cs-member-input" placeholder="Major" value={memberForm.major} onChange={e => setMemberForm(p => ({ ...p, major: e.target.value }))} style={{ flex: '1 1 100px' }} />
                    ) : (
                      <>
                        <input className="cs-member-input" placeholder="Job Role" value={memberForm.job_role} onChange={e => setMemberForm(p => ({ ...p, job_role: e.target.value }))} style={{ flex: '1 1 120px' }} />
                        <input className="cs-member-input" placeholder="Company" value={memberForm.company} onChange={e => setMemberForm(p => ({ ...p, company: e.target.value }))} style={{ flex: '1 1 120px' }} />
                      </>
                    )}
                    <select className="cs-member-select" value={memberForm.status} onChange={e => setMemberForm(p => ({ ...p, status: e.target.value as MemberStatus }))}>
                      {(Object.keys(MEMBER_STATUS_CONFIG) as MemberStatus[]).map(s => (
                        <option key={s} value={s}>{MEMBER_STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                    <button onClick={() => updateMember(m.id, {
                      name: memberForm.name,
                      grad_year: memberForm.grad_year ? parseInt(memberForm.grad_year) : null,
                      major: (m.member_type || 'active') === 'active' ? (memberForm.major || null) : null,
                      job_role: (m.member_type || 'active') === 'alumni' ? (memberForm.job_role || null) : null,
                      company: (m.member_type || 'active') === 'alumni' ? (memberForm.company || null) : null,
                      is_hiring: memberForm.is_hiring,
                      status: memberForm.status,
                    })} style={{ padding: '4px 12px', borderRadius: 6, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Save</button>
                    <button onClick={() => setEditingMember(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={14} /></button>
                  </div>
                ) : (
                  <div key={m.id} className="cs-member-row">
                    <div className="cs-member-name">
                      {m.name}
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 7px', borderRadius: 2, background: (m.member_type || 'active') === 'alumni' ? '#F5EFE0' : '#E8EDF5', color: (m.member_type || 'active') === 'alumni' ? '#6B4A1E' : '#1B2A4A', marginLeft: 4 }}>
                        {(m.member_type || 'active') === 'alumni' ? 'Alumni' : 'Active'}
                      </span>
                    </div>
                    {m.grad_year && <div className="cs-member-meta">&apos;{String(m.grad_year).slice(2)}</div>}
                    {(m.member_type || 'active') === 'alumni' ? (
                      <>
                        {m.job_role && <div className="cs-member-meta">{m.job_role}</div>}
                        {m.company && <div className="cs-member-meta cs-member-meta--muted">{m.company}</div>}
                        {m.is_hiring && <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 8px', borderRadius: 2, background: '#EAF0E8', color: '#2A4229' }}>Hiring ✓</span>}
                      </>
                    ) : (
                      m.major && <div className="cs-member-meta cs-member-meta--muted">{m.major}</div>
                    )}
                    {m.career_interest && <div className="cs-member-interest">{m.career_interest}</div>}
                    <span className="cs-member-status" style={{ background: MEMBER_STATUS_CONFIG[m.status].bg, color: MEMBER_STATUS_CONFIG[m.status].color }}>
                      {MEMBER_STATUS_CONFIG[m.status].label}
                    </span>
                    <div className="cs-member-row-actions">
                      <button className="module-table-action" onClick={() => { setEditingMember(m); setMemberForm({ name: m.name, grad_year: m.grad_year ? String(m.grad_year) : '', major: m.major || '', career_interest: m.career_interest || '', status: m.status, notes: m.notes || '', member_type: m.member_type || 'active', job_role: m.job_role || '', company: m.company || '', is_hiring: m.is_hiring || false }); }}>
                        <Edit2 size={13} />
                      </button>
                      <button className="module-table-action delete" disabled={deletingMemberId === m.id} onClick={() => deleteMember(m.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              ))}
            </div>
          )}

          {/* Add member form */}
          {showAddMember && (
            <div style={{ marginTop: 16, background: '#F7F5F1', borderRadius: 2, padding: '16px', border: '1px solid #D9D4CC' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {(['active', 'alumni'] as const).map(type => (
                  <button key={type} onClick={() => { setAddMemberType(type); setMemberForm(p => ({ ...p, member_type: type })); }}
                    style={{ padding: '4px 14px', borderRadius: 2, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: addMemberType === type ? '2px solid #1B2A4A' : '1px solid #D9D4CC', background: addMemberType === type ? '#E8EDF5' : '#fff', color: addMemberType === type ? '#1B2A4A' : '#5C5449', transition: 'all 0.15s ease-out' }}>
                    {type === 'active' ? 'Active Member' : 'Alumni'}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="module-form-group"><label>Name *</label><input value={memberForm.name} onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" /></div>
                <div className="module-form-group"><label>Grad Year</label><input type="number" value={memberForm.grad_year} onChange={e => setMemberForm(p => ({ ...p, grad_year: e.target.value }))} placeholder="2025" /></div>
                {addMemberType === 'active' ? (
                  <div className="module-form-group"><label>Major</label><input value={memberForm.major} onChange={e => setMemberForm(p => ({ ...p, major: e.target.value }))} /></div>
                ) : (
                  <>
                    <div className="module-form-group"><label>Job Role</label><input value={memberForm.job_role} onChange={e => setMemberForm(p => ({ ...p, job_role: e.target.value }))} placeholder="VP at Goldman Sachs" /></div>
                    <div className="module-form-group"><label>Company</label><input value={memberForm.company} onChange={e => setMemberForm(p => ({ ...p, company: e.target.value }))} /></div>
                  </>
                )}
                <div className="module-form-group"><label>Career Interest</label><input value={memberForm.career_interest} onChange={e => setMemberForm(p => ({ ...p, career_interest: e.target.value }))} /></div>
                <div className="module-form-group"><label>Status</label><select value={memberForm.status} onChange={e => setMemberForm(p => ({ ...p, status: e.target.value as MemberStatus }))}>{(Object.keys(MEMBER_STATUS_CONFIG) as MemberStatus[]).map(s => <option key={s} value={s}>{MEMBER_STATUS_CONFIG[s].label}</option>)}</select></div>
                <div className="module-form-group" style={{ gridColumn: '1 / -1' }}><label>Notes</label><input value={memberForm.notes} onChange={e => setMemberForm(p => ({ ...p, notes: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={addMember} style={{ padding: '6px 16px', borderRadius: 2, background: '#1B2A4A', color: '#F7F5F1', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'background 0.15s ease-out' }}>Add Member</button>
                <button onClick={() => setShowAddMember(false)} style={{ padding: '6px 16px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Log Match */}
          <div style={{ marginTop: 20, borderTop: '1px solid #f3f4f6', paddingTop: 16 }}>
            <h5 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: 12 }}>Log Match</h5>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div className="module-form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem' }}>Active Member</label><input value={matchForm.active_member} onChange={e => setMatchForm(p => ({ ...p, active_member: e.target.value }))} placeholder="Name" style={{ fontSize: '0.8rem', padding: '5px 8px' }} /></div>
              <div className="module-form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem' }}>Alumni</label><input value={matchForm.alumni_name} onChange={e => setMatchForm(p => ({ ...p, alumni_name: e.target.value }))} placeholder="Name" style={{ fontSize: '0.8rem', padding: '5px 8px' }} /></div>
              <div className="module-form-group" style={{ margin: 0 }}><label style={{ fontSize: '0.75rem' }}>Date</label><input type="date" value={matchForm.date} onChange={e => setMatchForm(p => ({ ...p, date: e.target.value }))} style={{ fontSize: '0.8rem', padding: '5px 8px' }} /></div>
            </div>
            <div className="module-form-group" style={{ margin: '0 0 10px' }}><label style={{ fontSize: '0.75rem' }}>Outcome Notes</label><input value={matchForm.notes} onChange={e => setMatchForm(p => ({ ...p, notes: e.target.value }))} placeholder="How did the intro go?" style={{ fontSize: '0.8rem', padding: '5px 8px' }} /></div>
            <button onClick={addMatch} disabled={savingMatch} style={{ padding: '5px 14px', borderRadius: 2, background: savingMatch ? '#9ca3af' : '#1B2A4A', color: '#F7F5F1', border: 'none', cursor: savingMatch ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600, transition: 'background 0.15s ease-out' }}>{savingMatch ? 'Saving…' : 'Log Match'}</button>

            {matches.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h5 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Logged Matches ({matches.length})</h5>
                {matches.map(m => (
                  <div key={m.id} style={{ display: 'flex', gap: 10, fontSize: '0.8rem', background: '#f9fafb', padding: '6px 10px', borderRadius: 6, alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{m.active_member}</span>
                    <span style={{ color: '#9ca3af' }}>↔</span>
                    <span style={{ fontWeight: 600 }}>{m.alumni_name}</span>
                    <span style={{ color: '#9ca3af' }}>{m.date}</span>
                    {m.notes && <span style={{ color: '#6b7280', flex: 1 }}>{m.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ─── NEW: Tasks ─── */}
      <section>
        <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: '1.1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#1B2A4A' }}>
          <ClipboardList size={16} /> Tasks
        </h3>
        <div style={{ background: '#fff', border: '1px solid #D9D4CC', borderRadius: 2, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              {tasks.filter(t => t.status === 'open').length} open · {tasks.filter(t => t.status === 'complete').length} complete
            </span>
            <button
              onClick={() => setShowAddTask(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 2, background: '#1B2A4A', color: '#F7F5F1', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
            >
              <Plus size={13} /> Add Task
            </button>
          </div>

          {/* Add task form */}
          {showAddTask && (
            <div style={{ background: '#F7F5F1', borderRadius: 2, padding: '14px 16px', border: '1px solid #D9D4CC', marginBottom: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: 10, marginBottom: 10 }}>
                <div className="module-form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Task *</label>
                  <input
                    value={taskForm.title}
                    onChange={e => setTaskForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Follow up on alumni list"
                    onKeyDown={e => { if (e.key === 'Enter') addTask(); }}
                    style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                  />
                </div>
                <div className="module-form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Due Date</label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={e => setTaskForm(p => ({ ...p, due_date: e.target.value }))}
                    style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                  />
                </div>
                <div className="module-form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>Assigned To</label>
                  <input
                    value={taskForm.assigned_to}
                    onChange={e => setTaskForm(p => ({ ...p, assigned_to: e.target.value }))}
                    placeholder="Owen, Ford…"
                    style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={addTask}
                  disabled={savingTask || !taskForm.title.trim()}
                  style={{ padding: '6px 16px', borderRadius: 2, background: savingTask ? '#9ca3af' : '#1B2A4A', color: '#F7F5F1', border: 'none', cursor: savingTask ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  {savingTask ? 'Adding…' : 'Add Task'}
                </button>
                <button onClick={() => setShowAddTask(false)} style={{ padding: '6px 14px', borderRadius: 2, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Task list */}
          {loadingTasks ? (
            <div style={{ color: '#9ca3af', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading tasks…
            </div>
          ) : tasks.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>No tasks yet. Add one above.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Open tasks first */}
              {tasks.filter(t => t.status === 'open').map(task => (
                <TaskRow key={task.id} task={task} onToggle={() => toggleTaskStatus(task)} onDelete={() => deleteTask(task.id)} />
              ))}
              {/* Completed tasks */}
              {tasks.filter(t => t.status === 'complete').length > 0 && (
                <>
                  {tasks.filter(t => t.status === 'open').length > 0 && (
                    <div style={{ borderTop: '1px dashed #E8E4DF', margin: '6px 0' }} />
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
        <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: '1.1rem', marginBottom: 12, color: '#1B2A4A' }}>📝 Exec Meeting Notes</h3>
        <div style={{ background: '#fff', border: '1px solid #D9D4CC', borderRadius: 2, padding: '16px 20px' }}>
          <textarea
            value={execNotes}
            onChange={e => setExecNotes(e.target.value)}
            onBlur={() => saveNotes('exec')}
            placeholder="Notes from exec team meetings…"
            rows={5}
            style={{ width: '100%', fontSize: '0.875rem', lineHeight: 1.6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Auto-saves on blur</span>
            <button onClick={() => saveNotes('exec')} disabled={savingNotes === 'exec'}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: '0.8rem', background: '#f3f4f6', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              {savingNotes === 'exec' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* ─── 4. Bonus Notes ─── */}
      <section>
        <h3 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontSize: '1.1rem', marginBottom: 12, color: '#1B2A4A' }}>🎁 Bonus Notes <span style={{ fontSize: '0.8rem', color: '#5C5449', fontWeight: 400, fontFamily: 'inherit' }}>(care packages, extras)</span></h3>
        <div style={{ background: '#fff', border: '1px solid #D9D4CC', borderRadius: 2, padding: '16px 20px' }}>
          <textarea
            value={bonusNotes}
            onChange={e => setBonusNotes(e.target.value)}
            onBlur={() => saveNotes('bonus')}
            placeholder="Care packages, swag, extras, special requests…"
            rows={4}
            style={{ width: '100%', fontSize: '0.875rem', lineHeight: 1.6, border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Auto-saves on blur</span>
            <button onClick={() => saveNotes('bonus')} disabled={savingNotes === 'bonus'}
              style={{ padding: '4px 12px', borderRadius: 6, fontSize: '0.8rem', background: '#f3f4f6', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
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
