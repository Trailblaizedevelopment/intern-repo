'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, HeartHandshake, Plus, Search, X, Trash2, Edit2, Check, ChevronDown,
  ChevronRight, CreditCard, Calendar, DollarSign, Clock, MessageSquare, Copy,
  ExternalLink, Eye, Undo2, AlertTriangle, Sparkles, Settings, Link as LinkIcon,
  LayoutDashboard, Users, Briefcase, Lock, GraduationCap, UserCheck, Linkedin,
  MapPin, BookOpen, Send, Mail,
} from 'lucide-react';
import Link from 'next/link';
import {
  supabase, Chapter, ONBOARDING_STEPS, ChapterCheckIn, CheckInFrequency,
  CHECK_IN_FREQUENCY_LABELS, HealthScore, HEALTH_SCORE_LABELS, HEALTH_SCORE_COLORS,
  ChapterExecutive, ChapterOutreachChannel, EXECUTIVE_POSITION_LABELS,
  OUTREACH_CHANNEL_LABELS, ChapterWithOnboarding,
  ChapterMember, MemberStatus, MEMBER_STATUS_CONFIG, PlatformMember,
} from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';
import ConversationsTab from './ConversationsTab';
import LinqOutreachTab from './LinqOutreachTab';
import EmailTemplatesTab from './EmailTemplatesTab';
import EmailOutreachTab from './EmailOutreachTab';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

interface ConfettiParticle {
  id: number; x: number; y: number;
  color: string; rotation: number; scale: number;
}

type ChapterTab = 'overview' | 'alumni' | 'platform' | 'headhunting' | 'links' | 'payment';

const TAB_CONFIG: { id: ChapterTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview',     label: 'Overview',      icon: <LayoutDashboard size={13} /> },
  { id: 'alumni',       label: 'Alumni',         icon: <Users size={13} /> },
  { id: 'platform',     label: 'Members',        icon: <UserCheck size={13} /> },
  { id: 'headhunting',  label: 'Headhunting',    icon: <Briefcase size={13} /> },
  { id: 'links',        label: 'Signup Links',   icon: <Lock size={13} /> },
  { id: 'payment',      label: 'Payment',        icon: <CreditCard size={13} /> },
];

export default function CustomerSuccessModule() {
  /* ─── Module-level view ─── */
  const [moduleView, setModuleView] = useState<'chapters' | 'conversations' | 'outreach' | 'templates' | 'email'>('chapters');

  /* ─── Core state ─── */
  const [chapters, setChapters] = useState<ChapterWithOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState<ChapterWithOnboarding | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ChapterTab>('overview');
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });

  /* ─── Toast / UX ─── */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [quickFilter, setQuickFilter] = useState<'all' | 'overdue' | 'stalled'>('all');
  const [celebratingChapter, setCelebratingChapter] = useState<string | null>(null);
  const [celebratingCategory, setCelebratingCategory] = useState<{ chapterId: string; category: string } | null>(null);
  const [completedChapter, setCompletedChapter] = useState<ChapterWithOnboarding | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* ─── Modals ─── */
  const [showCheckInModal, setShowCheckInModal] = useState<string | null>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  /* ─── Check-in data ─── */
  const [checkIns, setCheckIns] = useState<Record<string, ChapterCheckIn[]>>({});
  const [submissionData, setSubmissionData] = useState<{
    chapter: ChapterWithOnboarding;
    executives: ChapterExecutive[];
    outreach_channels: ChapterOutreachChannel[];
    submitted_at: string | null;
  } | null>(null);

  /* ─── Alumni pipeline stats ─── */
  const [alumniCounts, setAlumniCounts] = useState<Record<string, number>>({});
  const [alumniPipeline, setAlumniPipeline] = useState<Record<string, {
    total: number; have_phone: number; imessage: number; contacted: number;
    responded: number; signed_up: number; touch1_ready: number; touch2_due: number; touch3_due: number;
  }>>({});

  /* ─── Settings ─── */
  const [bookingLink, setBookingLink] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  /* ─── Signup links (per-chapter, stored locally before save) ─── */
  const [linkEdits, setLinkEdits] = useState<Record<string, { alumni: string; actives: string }>>({});
  const [savingLinks, setSavingLinks] = useState<string | null>(null);

  /* ─── Platform members ─── */
  const [platformMembers, setPlatformMembers] = useState<Record<string, PlatformMember[]>>({});
  const [loadingPlatformMembers, setLoadingPlatformMembers] = useState<Record<string, boolean>>({});

  /* ─── Headhunting ─── */
  const [members, setMembers] = useState<Record<string, ChapterMember[]>>({});
  const [loadingMembers, setLoadingMembers] = useState<Record<string, boolean>>({});
  const [showAddMember, setShowAddMember] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({
    name: '', grad_year: '', major: '', career_interest: '',
    status: 'looking' as MemberStatus, notes: '',
  });
  const [editingMember, setEditingMember] = useState<ChapterMember | null>(null);
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null);

  /* ─── Check-in form ─── */
  const [checkInForm, setCheckInForm] = useState({
    date: new Date().toISOString().split('T')[0],
    notes: '', health_score: 'good' as HealthScore, action_items: [''],
  });

  /* ─── Chapter form ─── */
  const [formData, setFormData] = useState({
    chapter_name: '', school: '', fraternity: '', contact_name: '',
    contact_email: '', contact_phone: '', status: 'onboarding' as Chapter['status'],
    health: 'good' as Chapter['health'], mrr: 0, next_action: '', notes: '',
    alumni_channels: '', payment_day: null as number | null,
    payment_type: 'annual' as Chapter['payment_type'], payment_amount: 299,
    payment_start_date: '', last_payment_date: '', next_payment_date: '',
    check_in_frequency: 'biweekly' as CheckInFrequency,
  });

  /* ═══════════════════════════════ DATA FETCHING ═══════════════════════════════ */

  useEffect(() => { fetchChapters(); fetchBookingLink(); }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showModal || showCheckInModal || showSubmissionModal) return;
      const len = filteredChapters.length;
      if (len === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIndex(p => Math.min(p + 1, len - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIndex(p => Math.max(p - 1, 0)); }
      else if (e.key === ' ' && focusedIndex >= 0) {
        e.preventDefault();
        const ch = filteredChapters[focusedIndex];
        if (ch) toggleExpand(ch.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, expandedChapter, showModal, showCheckInModal, showSubmissionModal]);

  useEffect(() => {
    if (focusedIndex >= 0 && chapterRefs.current[focusedIndex]) {
      chapterRefs.current[focusedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusedIndex]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info', action?: Toast['action']) => {
    const id = Date.now().toString();
    setToasts(p => [...p, { id, message, type, action }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), action ? 5000 : 3000);
  }, []);

  const dismissToast = useCallback((id: string) => setToasts(p => p.filter(t => t.id !== id)), []);

  async function fetchBookingLink() {
    try {
      const r = await fetch('/api/settings?key=booking_link');
      const res = await r.json();
      if (res.data?.value) setBookingLink(res.data.value);
    } catch { /* silent */ }
  }

  async function fetchChapters() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('chapters').select('*').order('created_at', { ascending: false });
    if (error) showToast('Failed to load chapters', 'error');
    else {
      setChapters(data || []);
      (data || []).forEach(ch => { if (alumniPipeline[ch.id] === undefined) fetchAlumniCount(ch.id); });
    }
    setLoading(false);
  }

  async function fetchAlumniCount(chapterId: string) {
    try {
      const res = await fetch(`/api/alumni/stats?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.data) {
        setAlumniCounts(p => ({ ...p, [chapterId]: json.data.total }));
        setAlumniPipeline(p => ({ ...p, [chapterId]: json.data }));
      }
    } catch { /* silent */ }
  }

  async function fetchCheckIns(chapterId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from('chapter_check_ins')
      .select('*, action_items:check_in_action_items(*)')
      .eq('chapter_id', chapterId)
      .order('check_in_date', { ascending: false })
      .limit(5);
    if (data) setCheckIns(p => ({ ...p, [chapterId]: data }));
  }

  async function fetchMembers(chapterId: string) {
    setLoadingMembers(p => ({ ...p, [chapterId]: true }));
    try {
      const res = await fetch(`/api/chapter-members?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.data) setMembers(p => ({ ...p, [chapterId]: json.data }));
    } finally {
      setLoadingMembers(p => ({ ...p, [chapterId]: false }));
    }
  }

  async function fetchPlatformMembers(chapterId: string) {
    if (!supabase) return;
    setLoadingPlatformMembers(p => ({ ...p, [chapterId]: true }));
    try {
      const { data } = await supabase
        .from('platform_members')
        .select('*')
        .eq('chapter_id', chapterId)
        .order('signed_up_at', { ascending: false });
      setPlatformMembers(p => ({ ...p, [chapterId]: data || [] }));
    } finally {
      setLoadingPlatformMembers(p => ({ ...p, [chapterId]: false }));
    }
  }

  async function fetchSubmission(chapterId: string) {
    try {
      const r = await fetch(`/api/onboarding/submission/${chapterId}`);
      const res = await r.json();
      if (res.data) setSubmissionData(res.data);
    } catch { showToast('Failed to load submission', 'error'); }
  }

  /* ═══════════════════════════════ CHAPTER CRUD ═══════════════════════════════ */

  async function createChapter() {
    if (!supabase) return showToast('DB not connected', 'error');
    if (!formData.chapter_name.trim()) return showToast('Chapter name required', 'error');
    const { error } = await supabase.from('chapters').insert([{
      ...formData,
      chapter_created: true,
      onboarding_started: new Date().toISOString().split('T')[0],
      payment_start_date: formData.payment_start_date || null,
      last_payment_date: formData.last_payment_date || null,
      next_payment_date: formData.next_payment_date || null,
    }]);
    if (error) showToast(`Failed: ${error.message}`, 'error');
    else { showToast('Chapter created', 'success'); resetForm(); fetchChapters(); }
  }

  async function updateChapter() {
    if (!supabase || !editingChapter) return;
    const { error } = await supabase.from('chapters').update({
      ...formData,
      payment_start_date: formData.payment_start_date || null,
      last_payment_date: formData.last_payment_date || null,
      next_payment_date: formData.next_payment_date || null,
    }).eq('id', editingChapter.id);
    if (error) showToast(`Failed: ${error.message}`, 'error');
    else { showToast('Chapter updated', 'success'); resetForm(); fetchChapters(); }
  }

  async function deleteChapter(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from('chapters').delete().eq('id', id);
    if (error) showToast('Failed to delete', 'error');
    else { showToast('Chapter deleted', 'success'); fetchChapters(); }
    setDeleteConfirm({ show: false, id: null });
  }

  async function toggleOnboardingStep(chapter: ChapterWithOnboarding, stepKey: string, categoryKey: string) {
    if (!supabase) return;
    const current = chapter[stepKey as keyof ChapterWithOnboarding];
    const next = !current;
    setChapters(p => p.map(c => c.id === chapter.id ? { ...c, [stepKey]: next } : c));

    const catSteps = ONBOARDING_STEPS.filter(s => s.category === categoryKey);
    const catComplete = catSteps.every(s => s.key === stepKey ? next : chapter[s.key as keyof ChapterWithOnboarding]);
    const allKeys = ONBOARDING_STEPS.map(s => s.key);
    const doneCount = allKeys.filter(k => k === stepKey ? next : chapter[k as keyof ChapterWithOnboarding]).length;

    const update: Record<string, unknown> = { [stepKey]: next, last_activity: new Date().toISOString().split('T')[0] };
    if (doneCount === allKeys.length) { update.status = 'active'; update.onboarding_completed = new Date().toISOString().split('T')[0]; }

    const { error } = await supabase.from('chapters').update(update).eq('id', chapter.id);
    if (error) {
      setChapters(p => p.map(c => c.id === chapter.id ? { ...c, [stepKey]: current } : c));
      showToast('Failed to update step', 'error');
    } else {
      if (next) showToast(`✓ ${ONBOARDING_STEPS.find(s => s.key === stepKey)?.label}`, 'success', {
        label: 'Undo',
        onClick: () => toggleOnboardingStep({ ...chapter, [stepKey]: next } as ChapterWithOnboarding, stepKey, categoryKey),
      });
      if (catComplete && next) { setCelebratingCategory({ chapterId: chapter.id, category: categoryKey }); setTimeout(() => setCelebratingCategory(null), 2000); }
      if (doneCount === allKeys.length && next) { setCelebratingChapter(chapter.id); setCompletedChapter({ ...chapter, [stepKey]: next } as ChapterWithOnboarding); setTimeout(() => setCelebratingChapter(null), 3000); }
      fetchChapters();
    }
  }

  async function generateOnboardingLink(chapterId: string, regenerate = false) {
    try {
      const r = await fetch('/api/onboarding/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, regenerate }),
      });
      const res = await r.json();
      if (res.error) return showToast(res.error.message, 'error');
      const link = `${window.location.origin}/onboard/${res.data.token}`;
      await navigator.clipboard.writeText(link);
      showToast('Onboarding link copied!', 'success');
      fetchChapters();
    } catch { showToast('Failed to generate link', 'error'); }
  }

  async function updateCheckInFrequency(chapterId: string, frequency: CheckInFrequency) {
    try {
      const r = await fetch('/api/check-ins', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, frequency }),
      });
      const res = await r.json();
      if (res.error) showToast(res.error.message, 'error');
      else { showToast('Frequency updated', 'success'); fetchChapters(); }
    } catch { showToast('Failed to update', 'error'); }
  }

  async function submitCheckIn(chapterId: string) {
    try {
      const r = await fetch('/api/check-ins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapterId,
          check_in_date: checkInForm.date,
          notes: checkInForm.notes,
          health_score: checkInForm.health_score,
          action_items: checkInForm.action_items.filter(a => a.trim()),
        }),
      });
      const res = await r.json();
      if (res.error) return showToast(res.error.message, 'error');
      showToast('Check-in logged', 'success');
      setShowCheckInModal(null);
      setCheckInForm({ date: new Date().toISOString().split('T')[0], notes: '', health_score: 'good', action_items: [''] });
      fetchChapters();
      fetchCheckIns(chapterId);
    } catch { showToast('Failed to log check-in', 'error'); }
  }

  async function saveLinks(chapter: ChapterWithOnboarding) {
    if (!supabase) return;
    const edits = linkEdits[chapter.id] || { alumni: chapter.alumni_join_link || '', actives: chapter.actives_join_link || '' };
    setSavingLinks(chapter.id);
    const { error } = await supabase.from('chapters').update({
      alumni_join_link: edits.alumni || null,
      actives_join_link: edits.actives || null,
    }).eq('id', chapter.id);
    setSavingLinks(null);
    if (error) showToast('Failed to save links', 'error');
    else { showToast('Links saved', 'success'); fetchChapters(); }
  }

  async function addMember(chapterId: string) {
    if (!memberForm.name.trim()) return showToast('Name required', 'error');
    try {
      const r = await fetch('/api/chapter-members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapterId,
          name: memberForm.name.trim(),
          grad_year: memberForm.grad_year ? parseInt(memberForm.grad_year) : null,
          major: memberForm.major || null,
          career_interest: memberForm.career_interest || null,
          status: memberForm.status,
          notes: memberForm.notes || null,
        }),
      });
      const json = await r.json();
      if (json.error) return showToast(json.error, 'error');
      showToast('Member added', 'success');
      setShowAddMember(null);
      setMemberForm({ name: '', grad_year: '', major: '', career_interest: '', status: 'looking', notes: '' });
      fetchMembers(chapterId);
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
      const chapters_updated = Object.entries(members).find(([, list]) => list.some(m => m.id === memberId))?.[0];
      if (chapters_updated) fetchMembers(chapters_updated);
      setEditingMember(null);
    } catch { showToast('Failed to update', 'error'); }
  }

  async function deleteMember(memberId: string, chapterId: string) {
    setDeletingMemberId(memberId);
    try {
      await fetch(`/api/chapter-members?id=${memberId}`, { method: 'DELETE' });
      setMembers(p => ({ ...p, [chapterId]: (p[chapterId] || []).filter(m => m.id !== memberId) }));
    } finally { setDeletingMemberId(null); }
  }

  async function saveBookingLink() {
    setSavingSettings(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'booking_link', value: bookingLink }),
      });
      const res = await r.json();
      if (res.error) showToast(res.error.message, 'error');
      else { showToast('Booking link saved!', 'success'); setShowSettingsModal(false); }
    } catch { showToast('Failed to save', 'error'); }
    finally { setSavingSettings(false); }
  }

  /* ═══════════════════════════════ HELPERS ═══════════════════════════════ */

  function resetForm() {
    setFormData({
      chapter_name: '', school: '', fraternity: '', contact_name: '',
      contact_email: '', contact_phone: '', status: 'onboarding', health: 'good',
      mrr: 0, next_action: '', notes: '', alumni_channels: '',
      payment_day: null, payment_type: 'annual', payment_amount: 299,
      payment_start_date: '', last_payment_date: '', next_payment_date: '',
      check_in_frequency: 'biweekly',
    });
    setEditingChapter(null);
    setShowModal(false);
  }

  function openEditModal(chapter: ChapterWithOnboarding) {
    setEditingChapter(chapter);
    setFormData({
      chapter_name: chapter.chapter_name, school: chapter.school || '',
      fraternity: chapter.fraternity || '', contact_name: chapter.contact_name || '',
      contact_email: chapter.contact_email || '', contact_phone: chapter.contact_phone || '',
      status: chapter.status, health: chapter.health, mrr: chapter.mrr || 0,
      next_action: chapter.next_action || '', notes: chapter.notes || '',
      alumni_channels: chapter.alumni_channels || '', payment_day: chapter.payment_day,
      payment_type: chapter.payment_type || 'annual', payment_amount: chapter.payment_amount || 299,
      payment_start_date: chapter.payment_start_date || '', last_payment_date: chapter.last_payment_date || '',
      next_payment_date: chapter.next_payment_date || '', check_in_frequency: chapter.check_in_frequency || 'biweekly',
    });
    setShowModal(true);
  }

  function toggleExpand(chapterId: string) {
    const opening = expandedChapter !== chapterId;
    setExpandedChapter(opening ? chapterId : null);
    if (opening) {
      setActiveTab('overview');
      if (!checkIns[chapterId]) fetchCheckIns(chapterId);
      if (alumniCounts[chapterId] === undefined) fetchAlumniCount(chapterId);
    }
  }

  function handleTabChange(tab: ChapterTab, chapterId: string) {
    setActiveTab(tab);
    if (tab === 'headhunting' && !members[chapterId]) fetchMembers(chapterId);
    if (tab === 'platform' && !platformMembers[chapterId]) fetchPlatformMembers(chapterId);
  }

  function getCompletionPercentage(chapter: ChapterWithOnboarding): number {
    const done = ONBOARDING_STEPS.filter(s => chapter[s.key as keyof ChapterWithOnboarding]).length;
    return Math.round((done / ONBOARDING_STEPS.length) * 100);
  }

  function getCompletedStepsCount(chapter: ChapterWithOnboarding): number {
    return ONBOARDING_STEPS.filter(s => chapter[s.key as keyof ChapterWithOnboarding]).length;
  }

  function getCategoryCompletedCount(chapter: ChapterWithOnboarding, category: string): number {
    return ONBOARDING_STEPS.filter(s => s.category === category && chapter[s.key as keyof ChapterWithOnboarding]).length;
  }

  function getProgressGradient(pct: number): string {
    if (pct < 25) return 'linear-gradient(90deg,#f97316,#fb923c)';
    if (pct < 50) return 'linear-gradient(90deg,#f59e0b,#fbbf24)';
    if (pct < 75) return 'linear-gradient(90deg,#10b981,#34d399)';
    return 'linear-gradient(90deg,#14b8a6,#2dd4bf)';
  }

  function getDaysUntilCheckIn(chapter: ChapterWithOnboarding): number | null {
    if (!chapter.next_check_in_date) return null;
    return Math.ceil((new Date(chapter.next_check_in_date).getTime() - Date.now()) / 86400000);
  }

  function getDaysSinceActivity(chapter: ChapterWithOnboarding): number | null {
    if (!chapter.last_activity) return null;
    return Math.floor((Date.now() - new Date(chapter.last_activity).getTime()) / 86400000);
  }

  function formatPaymentDay(day: number | null): string {
    if (!day) return 'Not set';
    const s = day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th';
    return `${day}${s}`;
  }

  function generateConfetti(): ConfettiParticle[] {
    const colors = ['#14b8a6','#f59e0b','#ec4899','#8b5cf6','#10b981','#3b82f6'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i, x: Math.random() * 100, y: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360, scale: 0.5 + Math.random() * 0.5,
    }));
  }

  /* ─── Filtering ─── */
  let filteredChapters = chapters.filter(c => {
    const q = searchQuery.toLowerCase();
    const match = c.chapter_name.toLowerCase().includes(q) ||
      (c.school || '').toLowerCase().includes(q) ||
      (c.fraternity || '').toLowerCase().includes(q);
    return match && (filterStatus === 'all' || c.status === filterStatus);
  });
  if (quickFilter === 'overdue') filteredChapters = filteredChapters.filter(c => { const d = getDaysUntilCheckIn(c); return d !== null && d < 0; });
  if (quickFilter === 'stalled') filteredChapters = filteredChapters.filter(c => { const d = getDaysSinceActivity(c); return d !== null && d >= 7; });

  /* ─── Summary stats ─── */
  const totalChapters = chapters.length;
  const activeChapters = chapters.filter(c => c.status === 'active').length;
  const onboardingChapters = chapters.filter(c => c.status === 'onboarding').length;
  const totalMRR = chapters.reduce((s, c) => s + (c.mrr || 0), 0);
  const overdueCheckIns = chapters.filter(c => { const d = getDaysUntilCheckIn(c); return d !== null && d < 0; }).length;

  const statusLabels: Record<Chapter['status'], string> = {
    onboarding: 'Onboarding', active: 'Active', at_risk: 'At Risk', churned: 'Churned',
  };
  const healthLabels: Record<Chapter['health'], string> = { good: 'Good', warning: 'Warning', critical: 'Critical' };
  const paymentTypeLabels: Record<Chapter['payment_type'], string> = {
    monthly: 'Monthly', one_time: 'One-Time', annual: 'Annual',
  };

  const stepsByCategory = {
    setup: ONBOARDING_STEPS.filter(s => s.category === 'setup'),
    alumni: ONBOARDING_STEPS.filter(s => s.category === 'alumni'),
    members: ONBOARDING_STEPS.filter(s => s.category === 'members'),
    training: ONBOARDING_STEPS.filter(s => s.category === 'training'),
    engagement: ONBOARDING_STEPS.filter(s => s.category === 'engagement'),
    social: ONBOARDING_STEPS.filter(s => s.category === 'social'),
  };

  const categoryLabels: Record<string, string> = {
    setup: '🚀 Setup', alumni: '👥 Alumni', members: '🎓 Members',
    training: '📚 Training', engagement: '💬 Engagement', social: '📱 Social',
  };

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus" className="module-back"><ArrowLeft size={20} /> Back to Nucleus</Link>
            <Link href="/workspace" className="module-back"><LayoutDashboard size={20} /> Workspace</Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#ec489915', color: '#ec4899' }}>
              <HeartHandshake size={24} />
            </div>
            <div>
              <h1>Customer Success</h1>
              <p>Chapter onboarding, alumni outreach, headhunting, and success tracking.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* ─── Module-level navigation ─── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #f3f4f6', paddingBottom: 0 }}>
          {([
            { id: 'chapters', label: 'Chapters', icon: <HeartHandshake size={14} /> },
            { id: 'conversations', label: 'Conversations', icon: <MessageSquare size={14} /> },
            { id: 'outreach', label: 'Linq Outreach', icon: <Send size={14} /> },
            { id: 'templates', label: 'Email Templates', icon: <Mail size={14} /> },
            { id: 'email', label: 'Email Outreach', icon: <Send size={14} /> },
          ] as const).map(view => (
            <button
              key={view.id}
              onClick={() => setModuleView(view.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px',
                border: 'none',
                borderBottom: moduleView === view.id ? '2px solid #ec4899' : '2px solid transparent',
                background: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: moduleView === view.id ? 600 : 400,
                color: moduleView === view.id ? '#ec4899' : '#6b7280',
                marginBottom: -2,
                transition: 'all 0.15s',
              }}
            >
              {view.icon} {view.label}
            </button>
          ))}
        </div>

        {moduleView === 'outreach' ? (
          <OutreachPage />
        ) : moduleView === 'conversations' ? (
          <ConversationsTab showToast={showToast} />
        ) : moduleView === 'outreach' ? (
          <LinqOutreachTab showToast={showToast} />
        ) : moduleView === 'templates' ? (
          <EmailTemplatesTab showToast={showToast} />
        ) : moduleView === 'email' ? (
          <EmailOutreachTab showToast={showToast} />
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ height: 72, background: '#f3f4f6', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i*0.1}s` }} />
            ))}
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="cs-summary-bar">
              <span><strong>{totalChapters}</strong> chapters</span>
              <span className="cs-dot">·</span>
              <span style={{ color: '#10b981' }}><strong>{activeChapters}</strong> active</span>
              <span className="cs-dot">·</span>
              <span style={{ color: '#f59e0b' }}><strong>{onboardingChapters}</strong> onboarding</span>
              <span className="cs-dot">·</span>
              <span><strong>${totalMRR.toLocaleString()}</strong> MRR</span>
              {overdueCheckIns > 0 && (
                <><span className="cs-dot">·</span>
                <span style={{ color: '#ef4444' }}><strong>{overdueCheckIns}</strong> overdue check-ins</span></>
              )}
            </div>

            {/* Actions bar */}
            <div className="module-actions-bar">
              <div className="module-search">
                <Search size={18} />
                <input
                  type="text" placeholder="Search chapters…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="module-actions">
                <div className="cs-quick-filters">
                  {(['all','overdue','stalled'] as const).map(f => (
                    <button key={f} className={`cs-quick-filter ${quickFilter === f ? 'active' : ''}`} onClick={() => setQuickFilter(f)}>
                      {f === 'overdue' && <AlertTriangle size={13} />}
                      {f === 'stalled' && <Clock size={13} />}
                      {f === 'all' ? 'All' : f === 'overdue' ? 'Overdue Check-in' : 'Stalled'}
                    </button>
                  ))}
                </div>
                <select className="module-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">All Status</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Active</option>
                  <option value="at_risk">At Risk</option>
                  <option value="churned">Churned</option>
                </select>
                <button className="module-primary-btn" onClick={() => setShowModal(true)}>
                  <Plus size={18} /> Add Chapter
                </button>
                <button className="module-filter-btn" onClick={() => setShowSettingsModal(true)} title="Settings">
                  <Settings size={18} />
                </button>
              </div>
            </div>

            {/* Chapter list */}
            <div className="chapters-list">
              {filteredChapters.length > 0 ? filteredChapters.map((chapter, index) => {
                const pct = getCompletionPercentage(chapter);
                const daysUntil = getDaysUntilCheckIn(chapter);
                const isOverdue = daysUntil !== null && daysUntil < 0;
                const isCelebrating = celebratingChapter === chapter.id;
                const pipe = alumniPipeline[chapter.id];
                const isExpanded = expandedChapter === chapter.id;

                return (
                  <div
                    key={chapter.id}
                    ref={el => { chapterRefs.current[index] = el; }}
                    className={`chapter-card ${focusedIndex === index ? 'focused' : ''} ${isOverdue ? 'overdue' : ''} ${isCelebrating ? 'celebrating' : ''}`}
                  >
                    {/* Confetti */}
                    {isCelebrating && (
                      <div className="confetti-container">
                        {generateConfetti().map(p => (
                          <div key={p.id} className="confetti-particle"
                            style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: p.color, transform: `rotate(${p.rotation}deg) scale(${p.scale})` }} />
                        ))}
                      </div>
                    )}

                    {/* ─── Card Header ─── */}
                    <div className="chapter-card-header" onClick={() => toggleExpand(chapter.id)}>
                      <div className="chapter-card-expand">
                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </div>

                      <div className="chapter-card-info">
                        <h3>{chapter.chapter_name}</h3>
                        <span className="chapter-card-subtitle">
                          {chapter.fraternity}{chapter.fraternity && chapter.school ? ' · ' : ''}{chapter.school}
                        </span>
                      </div>

                      {/* At-a-glance metrics */}
                      <div className="cs-card-metrics">
                        <div className="cs-card-metric">
                          <span className="cs-card-metric-val" style={{ color: '#059669' }}>
                            {pipe ? pipe.signed_up : '—'}
                          </span>
                          <span className="cs-card-metric-label">Signed Up</span>
                        </div>
                        <div className="cs-card-metric">
                          <span className="cs-card-metric-val">{pct}%</span>
                          <span className="cs-card-metric-label">Onboarded</span>
                        </div>
                        {pipe && pipe.total > 0 && (
                          <div className="cs-card-metric">
                            <span className="cs-card-metric-val" style={{ color: '#8b5cf6' }}>{pipe.total}</span>
                            <span className="cs-card-metric-label">Alumni</span>
                          </div>
                        )}
                      </div>

                      <div className="cs-card-badges">
                        <span className={`module-status ${chapter.status}`}>{statusLabels[chapter.status]}</span>
                        <span
                          className="cs-health-badge"
                          style={{
                            background: HEALTH_SCORE_COLORS[chapter.health === 'good' ? 'good' : chapter.health === 'warning' ? 'needs_attention' : 'at_risk'].bg,
                            color: HEALTH_SCORE_COLORS[chapter.health === 'good' ? 'good' : chapter.health === 'warning' ? 'needs_attention' : 'at_risk'].text,
                          }}
                        >
                          {healthLabels[chapter.health]}
                        </span>
                      </div>

                      <div className="chapter-card-actions" onClick={e => e.stopPropagation()}>
                        <button className="module-table-action" onClick={() => { setShowSubmissionModal(chapter.id); fetchSubmission(chapter.id); }} title="View Submission">
                          <Eye size={14} />
                        </button>
                        <button className="module-table-action" onClick={() => generateOnboardingLink(chapter.id, !!chapter.onboarding_token)} title="Copy Onboarding Link">
                          <Copy size={14} />
                        </button>
                        <button className="module-table-action" onClick={() => openEditModal(chapter)}>
                          <Edit2 size={14} />
                        </button>
                        <button className="module-table-action delete" onClick={() => setDeleteConfirm({ show: true, id: chapter.id })}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* ─── Expanded Body with Tabs ─── */}
                    {isExpanded && (
                      <div className="chapter-card-body">
                        {/* Tab bar */}
                        <div className="cs-tabs">
                          {TAB_CONFIG.map(t => {
                            const pmCount = t.id === 'platform' ? (platformMembers[chapter.id]?.length ?? null) : null;
                            return (
                              <button
                                key={t.id}
                                className={`cs-tab ${activeTab === t.id ? 'active' : ''}`}
                                onClick={() => handleTabChange(t.id, chapter.id)}
                              >
                                {t.icon} {t.label}
                                {pmCount !== null && pmCount > 0 && (
                                  <span className="cs-tab-badge">{pmCount}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* ── Overview tab ── */}
                        {activeTab === 'overview' && (
                          <div className="cs-tab-body">
                            {/* Check-ins */}
                            <div className="cs-checkins-section">
                              <div className="cs-checkins-header">
                                <h4><MessageSquare size={15} /> Check-ins</h4>
                                <div className="cs-checkins-controls">
                                  <select
                                    value={chapter.check_in_frequency || 'biweekly'}
                                    onChange={e => updateCheckInFrequency(chapter.id, e.target.value as CheckInFrequency)}
                                    className="cs-frequency-select"
                                  >
                                    {Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => (
                                      <option key={v} value={v}>{l}</option>
                                    ))}
                                  </select>
                                  <button className="cs-log-btn" onClick={() => setShowCheckInModal(chapter.id)}>
                                    <Plus size={13} /> Log Check-in
                                  </button>
                                </div>
                              </div>
                              <div className="cs-next-checkin">
                                <Calendar size={13} />
                                <span>
                                  {chapter.next_check_in_date ? (
                                    <>
                                      Next: {new Date(chapter.next_check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                      {daysUntil !== null && (
                                        <span className={`cs-countdown ${daysUntil < 0 ? 'overdue' : daysUntil <= 3 ? 'soon' : ''}`}>
                                          {daysUntil < 0 ? ` (${Math.abs(daysUntil)}d overdue)` : daysUntil === 0 ? ' (Today)' : ` (in ${daysUntil}d)`}
                                        </span>
                                      )}
                                    </>
                                  ) : <span className="cs-no-checkin">No check-ins scheduled</span>}
                                </span>
                              </div>
                              {checkIns[chapter.id]?.length > 0 && (
                                <div className="cs-recent-checkins">
                                  <h5>Recent</h5>
                                  {checkIns[chapter.id].slice(0, 3).map(ci => (
                                    <div key={ci.id} className="cs-checkin-item">
                                      <span className="cs-checkin-date">
                                        {new Date(ci.check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </span>
                                      {ci.health_score && (
                                        <span className="cs-checkin-health" style={{ background: HEALTH_SCORE_COLORS[ci.health_score].bg, color: HEALTH_SCORE_COLORS[ci.health_score].text }}>
                                          {HEALTH_SCORE_LABELS[ci.health_score]}
                                        </span>
                                      )}
                                      {ci.notes && <span className="cs-checkin-notes">{ci.notes.slice(0, 60)}{ci.notes.length > 60 ? '…' : ''}</span>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Onboarding checklist */}
                            <div className="onboarding-checklist">
                              {Object.entries(stepsByCategory).map(([category, steps]) => {
                                const done = getCategoryCompletedCount(chapter, category);
                                const total = steps.length;
                                const catPct = Math.round((done / total) * 100);
                                const isCatCelebrating = celebratingCategory?.chapterId === chapter.id && celebratingCategory?.category === category;
                                return (
                                  <div key={category} className={`checklist-category ${isCatCelebrating ? 'celebrating' : ''}`}>
                                    <h4>{categoryLabels[category]} <span className="category-progress">{done}/{total}</span></h4>
                                    <div className="category-progress-bar">
                                      <div className="category-progress-fill" style={{ width: `${catPct}%`, background: getProgressGradient(catPct) }} />
                                    </div>
                                    <div className="checklist-items">
                                      {steps.map(step => {
                                        const checked = !!chapter[step.key as keyof ChapterWithOnboarding];
                                        return (
                                          <label key={step.key} className={`checklist-item-animated ${checked ? 'checked' : ''}`}>
                                            <input type="checkbox" checked={checked} onChange={() => toggleOnboardingStep(chapter, step.key, category)} />
                                            <span className="checkmark-animated">{checked && <Check size={12} />}</span>
                                            <span className="checklist-label">{step.label}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Contact + channels */}
                            {chapter.contact_name && (
                              <div className="chapter-contact">
                                <strong>Contact:</strong> {chapter.contact_name}
                                {chapter.contact_email && ` · ${chapter.contact_email}`}
                                {chapter.contact_phone && ` · ${chapter.contact_phone}`}
                              </div>
                            )}
                            {chapter.alumni_channels && (
                              <div className="chapter-alumni-channels">
                                <strong>📱 Alumni Channels:</strong> {chapter.alumni_channels}
                              </div>
                            )}
                            {chapter.next_action && (
                              <div className="chapter-next-action">
                                <strong>Next Action:</strong> {chapter.next_action}
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Alumni tab ── */}
                        {activeTab === 'alumni' && (
                          <div className="cs-tab-body">
                            {pipe ? (
                              <>
                                <div className="cs-alumni-stats">
                                  {[
                                    { label: 'Total', value: pipe.total, color: '#374151' },
                                    { label: 'Has Phone', value: pipe.have_phone, color: '#8b5cf6' },
                                    { label: 'iMessage', value: pipe.imessage, color: '#16a34a' },
                                    { label: 'Contacted', value: pipe.contacted, color: '#d97706' },
                                    { label: 'Responded', value: pipe.responded, color: '#2563eb' },
                                    { label: 'Signed Up', value: pipe.signed_up, color: '#059669' },
                                    { label: 'Response %', value: pipe.contacted > 0 ? `${Math.round((pipe.responded / pipe.contacted) * 100)}%` : '—', color: '#374151' },
                                  ].map(s => (
                                    <div key={s.label} className="cs-alumni-stat">
                                      <div className="cs-alumni-stat-val" style={{ color: s.color }}>{s.value}</div>
                                      <div className="cs-alumni-stat-label">{s.label}</div>
                                    </div>
                                  ))}
                                </div>
                                {(pipe.touch1_ready > 0 || pipe.touch2_due > 0 || pipe.touch3_due > 0) && (
                                  <div className="cs-touch-queue">
                                    {pipe.touch1_ready > 0 && <span style={{ color: '#8b5cf6' }}>{pipe.touch1_ready} ready for Touch 1</span>}
                                    {pipe.touch2_due > 0 && <span style={{ color: '#d97706' }}>{pipe.touch2_due} due Touch 2</span>}
                                    {pipe.touch3_due > 0 && <span style={{ color: '#2563eb' }}>{pipe.touch3_due} due Touch 3</span>}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="cs-empty-state">No alumni data loaded yet.</div>
                            )}
                            <Link href={`/dashboard/clients/${chapter.id}/alumni`} className="cs-view-full-link">
                              View Full Alumni List <ExternalLink size={13} />
                            </Link>
                          </div>
                        )}

                        {/* ── Platform Members tab ── */}
                        {activeTab === 'platform' && (
                          <div className="cs-tab-body">
                            {loadingPlatformMembers[chapter.id] ? (
                              <div className="cs-empty-state">Loading…</div>
                            ) : !platformMembers[chapter.id] ? (
                              <div className="cs-empty-state">Loading members…</div>
                            ) : platformMembers[chapter.id].length === 0 ? (
                              <div className="cs-empty-state">
                                No alumni have signed up through the platform yet.<br />
                                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Members will appear here once they create accounts via the alumni signup link.</span>
                              </div>
                            ) : (
                              <>
                                <div className="cs-pm-summary">
                                  <span><strong>{platformMembers[chapter.id].length}</strong> signed up</span>
                                  <span className="cs-dot">·</span>
                                  <span style={{ color: '#059669' }}>
                                    <strong>{platformMembers[chapter.id].filter(m => m.onboarding_completed).length}</strong> onboarding complete
                                  </span>
                                  <span className="cs-dot">·</span>
                                  <span style={{ color: '#8b5cf6' }}>
                                    <strong>{platformMembers[chapter.id].filter(m => m.linkedin_url).length}</strong> LinkedIn
                                  </span>
                                </div>
                                <div className="cs-pm-list">
                                  {platformMembers[chapter.id].map(m => (
                                    <div key={m.id} className="cs-pm-row">
                                      <div className="cs-pm-avatar">
                                        {m.avatar_url ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={`/api/avatar-proxy?url=${encodeURIComponent(m.avatar_url!)}`}
                                            alt={m.first_name || ''}
                                            className="cs-pm-avatar-img"
                                            onError={e => {
                                              const img = e.target as HTMLImageElement;
                                              img.style.display = 'none';
                                              const fallback = img.nextElementSibling as HTMLElement | null;
                                              if (fallback) fallback.style.display = 'flex';
                                            }}
                                          />
                                        ) : null}
                                        <span style={{ display: m.avatar_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                                          {(m.first_name?.[0] || '?')}{(m.last_name?.[0] || '')}
                                        </span>
                                      </div>
                                      <div className="cs-pm-info">
                                        <div className="cs-pm-name">
                                          {m.first_name} {m.last_name}
                                          {m.onboarding_completed && (
                                            <span className="cs-pm-badge cs-pm-badge--complete">✓ Onboarded</span>
                                          )}
                                        </div>
                                        <div className="cs-pm-meta">
                                          {m.grad_year && (
                                            <span><GraduationCap size={11} /> {m.grad_year}</span>
                                          )}
                                          {m.major && (
                                            <span><BookOpen size={11} /> {m.major}</span>
                                          )}
                                          {m.location && (
                                            <span><MapPin size={11} /> {m.location}</span>
                                          )}
                                          {m.email && (
                                            <span style={{ color: '#6b7280', fontSize: '0.75rem' }}>{m.email}</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="cs-pm-actions">
                                        {m.linkedin_url && (
                                          <a href={m.linkedin_url} target="_blank" rel="noopener noreferrer" className="cs-pm-linkedin" title="LinkedIn">
                                            <Linkedin size={14} />
                                          </a>
                                        )}
                                        {m.signed_up_at && (
                                          <span className="cs-pm-date">
                                            {new Date(m.signed_up_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {/* ── Headhunting tab ── */}
                        {activeTab === 'headhunting' && (
                          <div className="cs-tab-body">
                            <div className="cs-section-header">
                              <div>
                                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>
                                  <GraduationCap size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                                  Active Members — Career Tracking
                                </h4>
                                <p className="cs-section-sub">Track members actively using their network to find opportunities through Trailblaize.</p>
                              </div>
                              <button className="cs-log-btn" onClick={() => { setShowAddMember(chapter.id); setEditingMember(null); setMemberForm({ name: '', grad_year: '', major: '', career_interest: '', status: 'looking', notes: '' }); }}>
                                <Plus size={13} /> Add Member
                              </button>
                            </div>

                            {loadingMembers[chapter.id] ? (
                              <div className="cs-empty-state">Loading…</div>
                            ) : !members[chapter.id] || members[chapter.id].length === 0 ? (
                              <div className="cs-empty-state">
                                No members tracked yet.<br />
                                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Add members who are looking for jobs or internships through their Trailblaize network.</span>
                              </div>
                            ) : (
                              <div className="cs-members-list">
                                {members[chapter.id].map(m => (
                                  editingMember?.id === m.id ? (
                                    <div key={m.id} className="cs-member-edit-row">
                                      <input className="cs-member-input" placeholder="Name" value={memberForm.name} onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))} />
                                      <input className="cs-member-input cs-member-input--sm" placeholder="Grad Year" value={memberForm.grad_year} onChange={e => setMemberForm(p => ({ ...p, grad_year: e.target.value }))} />
                                      <input className="cs-member-input" placeholder="Major" value={memberForm.major} onChange={e => setMemberForm(p => ({ ...p, major: e.target.value }))} />
                                      <input className="cs-member-input" placeholder="Career Interest" value={memberForm.career_interest} onChange={e => setMemberForm(p => ({ ...p, career_interest: e.target.value }))} />
                                      <select className="cs-member-select" value={memberForm.status} onChange={e => setMemberForm(p => ({ ...p, status: e.target.value as MemberStatus }))}>
                                        {(Object.keys(MEMBER_STATUS_CONFIG) as MemberStatus[]).map(s => (
                                          <option key={s} value={s}>{MEMBER_STATUS_CONFIG[s].label}</option>
                                        ))}
                                      </select>
                                      <input className="cs-member-input" placeholder="Notes" value={memberForm.notes} onChange={e => setMemberForm(p => ({ ...p, notes: e.target.value }))} />
                                      <div className="cs-member-row-actions">
                                        <button className="cs-log-btn" onClick={() => updateMember(m.id, { name: memberForm.name, grad_year: memberForm.grad_year ? parseInt(memberForm.grad_year) : null, major: memberForm.major || null, career_interest: memberForm.career_interest || null, status: memberForm.status, notes: memberForm.notes || null })}>Save</button>
                                        <button className="module-table-action" onClick={() => setEditingMember(null)}><X size={13} /></button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div key={m.id} className="cs-member-row">
                                      <div className="cs-member-name">{m.name}</div>
                                      {m.grad_year && <div className="cs-member-meta">'{String(m.grad_year).slice(2)}</div>}
                                      {m.major && <div className="cs-member-meta cs-member-meta--muted">{m.major}</div>}
                                      {m.career_interest && <div className="cs-member-interest">{m.career_interest}</div>}
                                      <span className="cs-member-status" style={{ background: MEMBER_STATUS_CONFIG[m.status].bg, color: MEMBER_STATUS_CONFIG[m.status].color }}>
                                        {MEMBER_STATUS_CONFIG[m.status].label}
                                      </span>
                                      {m.notes && <div className="cs-member-notes">{m.notes}</div>}
                                      <div className="cs-member-row-actions">
                                        <button className="module-table-action" onClick={() => { setEditingMember(m); setMemberForm({ name: m.name, grad_year: m.grad_year ? String(m.grad_year) : '', major: m.major || '', career_interest: m.career_interest || '', status: m.status, notes: m.notes || '' }); }}>
                                          <Edit2 size={13} />
                                        </button>
                                        <button className="module-table-action delete" disabled={deletingMemberId === m.id} onClick={() => deleteMember(m.id, chapter.id)}>
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </div>
                                  )
                                ))}
                              </div>
                            )}

                            {/* Add member form (inline) */}
                            {showAddMember === chapter.id && (
                              <div className="cs-member-add-form">
                                <div className="cs-member-form-title"><Plus size={13} /> New Member</div>
                                <div className="cs-member-form-grid">
                                  <div className="module-form-group">
                                    <label>Name *</label>
                                    <input type="text" value={memberForm.name} onChange={e => setMemberForm(p => ({ ...p, name: e.target.value }))} placeholder="Full name" />
                                  </div>
                                  <div className="module-form-group">
                                    <label>Grad Year</label>
                                    <input type="number" value={memberForm.grad_year} onChange={e => setMemberForm(p => ({ ...p, grad_year: e.target.value }))} placeholder="2025" />
                                  </div>
                                  <div className="module-form-group">
                                    <label>Major</label>
                                    <input type="text" value={memberForm.major} onChange={e => setMemberForm(p => ({ ...p, major: e.target.value }))} placeholder="Finance" />
                                  </div>
                                  <div className="module-form-group">
                                    <label>Career Interest</label>
                                    <input type="text" value={memberForm.career_interest} onChange={e => setMemberForm(p => ({ ...p, career_interest: e.target.value }))} placeholder="Investment Banking, PE, Tech…" />
                                  </div>
                                  <div className="module-form-group">
                                    <label>Status</label>
                                    <select value={memberForm.status} onChange={e => setMemberForm(p => ({ ...p, status: e.target.value as MemberStatus }))}>
                                      {(Object.keys(MEMBER_STATUS_CONFIG) as MemberStatus[]).map(s => (
                                        <option key={s} value={s}>{MEMBER_STATUS_CONFIG[s].label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="module-form-group" style={{ gridColumn: '1 / -1' }}>
                                    <label>Notes</label>
                                    <input type="text" value={memberForm.notes} onChange={e => setMemberForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any context…" />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                  <button className="module-primary-btn" onClick={() => addMember(chapter.id)}>Add Member</button>
                                  <button className="module-cancel-btn" onClick={() => setShowAddMember(null)}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* ── Signup Links tab ── */}
                        {activeTab === 'links' && (
                          <div className="cs-tab-body">
                            <div className="cs-links-header">
                              <Lock size={14} />
                              <span>Private signup links — used for Linq outreach. Keep these accurate.</span>
                            </div>
                            <div className="cs-links-grid">
                              <div className="module-form-group">
                                <label>
                                  <Users size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                  Alumni Join Link
                                </label>
                                <div className="cs-link-input-row">
                                  <input
                                    type="url"
                                    value={linkEdits[chapter.id]?.alumni ?? chapter.alumni_join_link ?? ''}
                                    onChange={e => setLinkEdits(p => ({ ...p, [chapter.id]: { ...p[chapter.id] ?? { alumni: '', actives: '' }, alumni: e.target.value } }))}
                                    placeholder="https://www.trailblaize.net/alumni-join/…"
                                  />
                                  {(linkEdits[chapter.id]?.alumni ?? chapter.alumni_join_link) && (
                                    <button className="cs-copy-link-btn" onClick={async () => { await navigator.clipboard.writeText(linkEdits[chapter.id]?.alumni ?? chapter.alumni_join_link ?? ''); showToast('Alumni link copied!', 'success'); }} title="Copy">
                                      <Copy size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="module-form-group">
                                <label>
                                  <GraduationCap size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                  Actives Join Link
                                </label>
                                <div className="cs-link-input-row">
                                  <input
                                    type="url"
                                    value={linkEdits[chapter.id]?.actives ?? chapter.actives_join_link ?? ''}
                                    onChange={e => setLinkEdits(p => ({ ...p, [chapter.id]: { ...p[chapter.id] ?? { alumni: '', actives: '' }, actives: e.target.value } }))}
                                    placeholder="https://www.trailblaize.net/join/…"
                                  />
                                  {(linkEdits[chapter.id]?.actives ?? chapter.actives_join_link) && (
                                    <button className="cs-copy-link-btn" onClick={async () => { await navigator.clipboard.writeText(linkEdits[chapter.id]?.actives ?? chapter.actives_join_link ?? ''); showToast('Actives link copied!', 'success'); }} title="Copy">
                                      <Copy size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              className="module-primary-btn"
                              style={{ marginTop: 4 }}
                              disabled={savingLinks === chapter.id}
                              onClick={() => saveLinks(chapter)}
                            >
                              {savingLinks === chapter.id ? 'Saving…' : 'Save Links'}
                            </button>
                          </div>
                        )}

                        {/* ── Payment tab ── */}
                        {activeTab === 'payment' && (
                          <div className="cs-tab-body">
                            <div className="cs-payment-grid">
                              <div className="cs-payment-stat">
                                <DollarSign size={16} style={{ color: '#8b5cf6' }} />
                                <div>
                                  <div className="cs-payment-val">${chapter.payment_amount || 299}</div>
                                  <div className="cs-payment-label">{paymentTypeLabels[chapter.payment_type || 'annual']}</div>
                                </div>
                              </div>
                              {chapter.payment_day && (
                                <div className="cs-payment-stat">
                                  <Calendar size={16} style={{ color: '#8b5cf6' }} />
                                  <div>
                                    <div className="cs-payment-val">{formatPaymentDay(chapter.payment_day)}</div>
                                    <div className="cs-payment-label">Due each month</div>
                                  </div>
                                </div>
                              )}
                              {chapter.payment_start_date && (
                                <div className="cs-payment-stat">
                                  <div>
                                    <div className="cs-payment-val">{new Date(chapter.payment_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                    <div className="cs-payment-label">Start Date</div>
                                  </div>
                                </div>
                              )}
                              {chapter.last_payment_date && (
                                <div className="cs-payment-stat">
                                  <div>
                                    <div className="cs-payment-val">{new Date(chapter.last_payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                    <div className="cs-payment-label">Last Payment</div>
                                  </div>
                                </div>
                              )}
                              {chapter.next_payment_date && (
                                <div className="cs-payment-stat">
                                  <div>
                                    <div className="cs-payment-val" style={{ color: '#8b5cf6' }}>{new Date(chapter.next_payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                    <div className="cs-payment-label">Next Payment</div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <button className="module-filter-btn" style={{ marginTop: 12 }} onClick={() => openEditModal(chapter)}>
                              <Edit2 size={14} /> Edit Payment Details
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }) : (
                <div className="module-empty-state">
                  <HeartHandshake size={48} />
                  <h3>No chapters found</h3>
                  <p>{quickFilter !== 'all' ? 'No chapters match the selected filter.' : 'Add your first chapter to start tracking.'}</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* ─── Toasts ─── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
            {t.action && <button className="toast-action" onClick={t.action.onClick}><Undo2 size={14} /> {t.action.label}</button>}
            <button className="toast-dismiss" onClick={() => dismissToast(t.id)}><X size={14} /></button>
          </div>
        ))}
      </div>

      {/* ─── Add/Edit Chapter Modal ─── */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={resetForm}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>{editingChapter ? 'Edit Chapter' : 'Add Chapter'}</h2>
              <button className="module-modal-close" onClick={resetForm}><X size={20} /></button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-row">
                <div className="module-form-group"><label>Chapter Name *</label><input type="text" value={formData.chapter_name} onChange={e => setFormData({ ...formData, chapter_name: e.target.value })} placeholder="e.g. Ole Miss Phi Delt" /></div>
                <div className="module-form-group"><label>Fraternity</label><input type="text" value={formData.fraternity} onChange={e => setFormData({ ...formData, fraternity: e.target.value })} placeholder="e.g. Phi Delta Theta" /></div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group"><label>School</label><input type="text" value={formData.school} onChange={e => setFormData({ ...formData, school: e.target.value })} placeholder="e.g. University of Mississippi" /></div>
                <div className="module-form-group"><label>MRR ($)</label><input type="number" value={formData.mrr} onChange={e => setFormData({ ...formData, mrr: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group"><label>Contact Name</label><input type="text" value={formData.contact_name} onChange={e => setFormData({ ...formData, contact_name: e.target.value })} /></div>
                <div className="module-form-group"><label>Contact Email</label><input type="email" value={formData.contact_email} onChange={e => setFormData({ ...formData, contact_email: e.target.value })} /></div>
                <div className="module-form-group"><label>Contact Phone</label><input type="tel" value={formData.contact_phone} onChange={e => setFormData({ ...formData, contact_phone: e.target.value })} /></div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group"><label>Status</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value as Chapter['status'] })}><option value="onboarding">Onboarding</option><option value="active">Active</option><option value="at_risk">At Risk</option><option value="churned">Churned</option></select></div>
                <div className="module-form-group"><label>Health</label><select value={formData.health} onChange={e => setFormData({ ...formData, health: e.target.value as Chapter['health'] })}><option value="good">Good</option><option value="warning">Warning</option><option value="critical">Critical</option></select></div>
                <div className="module-form-group"><label>Check-in Frequency</label><select value={formData.check_in_frequency} onChange={e => setFormData({ ...formData, check_in_frequency: e.target.value as CheckInFrequency })}>{Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              {/* Payment */}
              <div style={{ marginTop: 16, marginBottom: 16, padding: 16, background: '#faf5ff', borderRadius: 8, border: '1px solid #e9d5ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}><CreditCard size={18} style={{ color: '#8b5cf6' }} /><span style={{ fontWeight: 600, color: '#6b21a8' }}>Payment Tracking</span></div>
                <div className="module-form-row">
                  <div className="module-form-group"><label>Payment Day (1–31)</label><input type="number" min="1" max="31" value={formData.payment_day || ''} onChange={e => setFormData({ ...formData, payment_day: e.target.value ? parseInt(e.target.value) : null })} placeholder="15" /></div>
                  <div className="module-form-group"><label>Payment Type</label><select value={formData.payment_type} onChange={e => setFormData({ ...formData, payment_type: e.target.value as Chapter['payment_type'] })}><option value="annual">Annual ($299)</option><option value="monthly">Monthly</option><option value="one_time">One-Time</option></select></div>
                  <div className="module-form-group"><label>Amount ($)</label><input type="number" value={formData.payment_amount} onChange={e => setFormData({ ...formData, payment_amount: parseFloat(e.target.value) || 299 })} /></div>
                </div>
                <div className="module-form-row">
                  <div className="module-form-group"><label>Start Date</label><input type="date" value={formData.payment_start_date} onChange={e => setFormData({ ...formData, payment_start_date: e.target.value })} /></div>
                  <div className="module-form-group"><label>Last Payment</label><input type="date" value={formData.last_payment_date} onChange={e => setFormData({ ...formData, last_payment_date: e.target.value })} /></div>
                  <div className="module-form-group"><label>Next Payment</label><input type="date" value={formData.next_payment_date} onChange={e => setFormData({ ...formData, next_payment_date: e.target.value })} /></div>
                </div>
              </div>
              <div className="module-form-group"><label>Next Action</label><input type="text" value={formData.next_action} onChange={e => setFormData({ ...formData, next_action: e.target.value })} placeholder="What's the next step?" /></div>
              <div className="module-form-group"><label>Alumni Channels</label><input type="text" value={formData.alumni_channels} onChange={e => setFormData({ ...formData, alumni_channels: e.target.value })} placeholder="GroupMe, Slack, Email Newsletter…" /></div>
              <div className="module-form-group"><label>Notes</label><textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={3} /></div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={resetForm}>Cancel</button>
              <button className="module-primary-btn" onClick={editingChapter ? updateChapter : createChapter} disabled={!formData.chapter_name}>{editingChapter ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ─── Check-in Modal ─── */}
      {showCheckInModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowCheckInModal(null)}>
          <div className="module-modal" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header"><h2>Log Check-in</h2><button className="module-modal-close" onClick={() => setShowCheckInModal(null)}><X size={20} /></button></div>
            <div className="module-modal-body">
              <div className="module-form-group"><label>Date</label><input type="date" value={checkInForm.date} onChange={e => setCheckInForm({ ...checkInForm, date: e.target.value })} /></div>
              <div className="module-form-group">
                <label>Health Score</label>
                <div className="cs-health-options">
                  {(Object.keys(HEALTH_SCORE_LABELS) as HealthScore[]).map(score => (
                    <label key={score} className={`cs-health-option ${checkInForm.health_score === score ? 'selected' : ''}`} style={{ background: checkInForm.health_score === score ? HEALTH_SCORE_COLORS[score].bg : 'transparent', borderColor: HEALTH_SCORE_COLORS[score].bg, color: checkInForm.health_score === score ? HEALTH_SCORE_COLORS[score].text : '#64748b' }}>
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
              <button className="module-cancel-btn" onClick={() => setShowCheckInModal(null)}>Cancel</button>
              <button className="module-primary-btn" onClick={() => submitCheckIn(showCheckInModal)}>Log Check-in</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ─── Submission Modal ─── */}
      {showSubmissionModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => { setShowSubmissionModal(null); setSubmissionData(null); }}>
          <div className="module-modal module-modal-large" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header"><h2>Onboarding Submission</h2><button className="module-modal-close" onClick={() => { setShowSubmissionModal(null); setSubmissionData(null); }}><X size={20} /></button></div>
            <div className="module-modal-body cs-submission-view">
              {submissionData ? (
                <>
                  <div className="cs-submission-section"><h4>Chapter Info</h4>
                    <div className="cs-submission-grid">
                      <div><strong>Chapter:</strong> {submissionData.chapter.chapter_name}</div>
                      <div><strong>University:</strong> {submissionData.chapter.school}</div>
                      <div><strong>Org:</strong> {submissionData.chapter.fraternity}</div>
                      {submissionData.chapter.estimated_alumni && <div><strong>Est. Alumni:</strong> {submissionData.chapter.estimated_alumni.toLocaleString()}</div>}
                    </div>
                  </div>
                  {submissionData.executives.length > 0 && (
                    <div className="cs-submission-section"><h4>Exec Board ({submissionData.executives.length})</h4>
                      <div className="cs-executives-list">
                        {submissionData.executives.map(e => (
                          <div key={e.id} className="cs-executive-item">
                            <strong>{e.full_name}</strong>
                            <span>{EXECUTIVE_POSITION_LABELS[e.position]}</span>
                            <a href={`mailto:${e.email}`}>{e.email}</a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {submissionData.outreach_channels.length > 0 && (
                    <div className="cs-submission-section"><h4>Outreach Channels</h4>
                      <div className="cs-channels-list">
                        {submissionData.outreach_channels.map(ch => (
                          <div key={ch.id} className="cs-channel-item">
                            <strong>{OUTREACH_CHANNEL_LABELS[ch.channel_type]}</strong>
                            {ch.facebook_url && <a href={ch.facebook_url} target="_blank" rel="noopener noreferrer">View Group</a>}
                            {ch.instagram_handle && <span>@{ch.instagram_handle}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {submissionData.chapter.alumni_list_url && (
                    <div className="cs-submission-section"><h4>Alumni List</h4>
                      <a href={submissionData.chapter.alumni_list_url} target="_blank" rel="noopener noreferrer">Download <ExternalLink size={12} /></a>
                    </div>
                  )}
                  {submissionData.submitted_at && <div className="cs-submission-timestamp">Submitted {new Date(submissionData.submitted_at).toLocaleString()}</div>}
                </>
              ) : (
                <div className="cs-submission-empty"><p>No submission data yet.</p><p className="text-secondary">Share the onboarding link with the chapter president.</p></div>
              )}
            </div>
            <div className="module-modal-footer"><button className="module-cancel-btn" onClick={() => { setShowSubmissionModal(null); setSubmissionData(null); }}>Close</button></div>
          </div>
        </ModalOverlay>
      )}

      {/* ─── Celebration ─── */}
      {completedChapter && (
        <div className="cs-celebration-modal" onClick={() => setCompletedChapter(null)}>
          <div className="cs-celebration-content" onClick={e => e.stopPropagation()}>
            <div className="cs-celebration-confetti">
              {generateConfetti().map(p => <div key={p.id} className="confetti-particle-large" style={{ left: `${p.x}%`, top: `${p.y}%`, backgroundColor: p.color, transform: `rotate(${p.rotation}deg) scale(${p.scale})` }} />)}
            </div>
            <div className="cs-celebration-icon"><Sparkles size={48} /></div>
            <h2>🎉 Chapter Fully Onboarded!</h2>
            <p className="cs-celebration-chapter">{completedChapter.chapter_name}</p>
            <button className="cs-celebration-close" onClick={() => setCompletedChapter(null)}>Awesome!</button>
          </div>
        </div>
      )}

      {/* ─── Settings Modal ─── */}
      {showSettingsModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowSettingsModal(false)}>
          <div className="module-modal" onClick={e => e.stopPropagation()}>
            <div className="module-modal-header"><h2>Settings</h2><button className="module-modal-close" onClick={() => setShowSettingsModal(false)}><X size={20} /></button></div>
            <div className="module-modal-body">
              <div className="module-form-group">
                <label><LinkIcon size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} /> Demo Booking Link</label>
                <input type="url" value={bookingLink} onChange={e => setBookingLink(e.target.value)} placeholder="https://calendar.google.com/…" />
                <span style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.5rem', display: 'block' }}>Appears on all active onboarding forms.</span>
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowSettingsModal(false)}>Cancel</button>
              <button className="module-primary-btn" onClick={saveBookingLink} disabled={savingSettings}>{savingSettings ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ─── Delete Confirm ─── */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Chapter"
        message="This will permanently delete the chapter and all onboarding progress."
        confirmText="Delete" cancelText="Cancel" variant="danger"
        onConfirm={() => deleteConfirm.id && deleteChapter(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />
    </div>
  );
}
