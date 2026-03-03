'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ArrowLeft, HeartHandshake, Plus, Search, X, Trash2, Edit2, Check, ChevronDown, 
  ChevronRight, CreditCard, Calendar, DollarSign, Clock, MessageSquare, Copy, 
  ExternalLink, Eye, Undo2, AlertTriangle, Sparkles, Settings, Link as LinkIcon,
  LayoutDashboard, Users
} from 'lucide-react';
import Link from 'next/link';
import { 
  supabase, Chapter, ONBOARDING_STEPS, ChapterCheckIn, CheckInFrequency, 
  CHECK_IN_FREQUENCY_LABELS, HealthScore, HEALTH_SCORE_LABELS, HEALTH_SCORE_COLORS,
  ChapterExecutive, ChapterOutreachChannel, EXECUTIVE_POSITION_LABELS,
  OUTREACH_CHANNEL_LABELS, ChapterWithOnboarding
} from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';

// Toast notification type
interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Confetti particle type
interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
}

export default function CustomerSuccessModule() {
  const [chapters, setChapters] = useState<ChapterWithOnboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState<ChapterWithOnboarding | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  
  // New state for enhanced features
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showCheckInModal, setShowCheckInModal] = useState<string | null>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<Record<string, ChapterCheckIn[]>>({});
  const [submissionData, setSubmissionData] = useState<{
    chapter: ChapterWithOnboarding;
    executives: ChapterExecutive[];
    outreach_channels: ChapterOutreachChannel[];
    submitted_at: string | null;
  } | null>(null);
  const [quickFilter, setQuickFilter] = useState<'all' | 'overdue' | 'stalled'>('all');
  const [celebratingChapter, setCelebratingChapter] = useState<string | null>(null);
  const [celebratingCategory, setCelebratingCategory] = useState<{ chapterId: string; category: string } | null>(null);
  const [completedChapter, setCompletedChapter] = useState<ChapterWithOnboarding | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  // Alumni pipeline stats per chapter
  const [alumniCounts, setAlumniCounts] = useState<Record<string, number>>({});
  const [alumniPipeline, setAlumniPipeline] = useState<Record<string, {
    total: number; have_phone: number; imessage: number; contacted: number;
    responded: number; signed_up: number; touch1_ready: number; touch2_due: number; touch3_due: number;
  }>>({});

  // Booking link settings
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [bookingLink, setBookingLink] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Check-in form state
  const [checkInForm, setCheckInForm] = useState({
    date: new Date().toISOString().split('T')[0],
    notes: '',
    health_score: 'good' as HealthScore,
    action_items: [''],
  });

  const [formData, setFormData] = useState({
    chapter_name: '',
    school: '',
    fraternity: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    status: 'onboarding' as Chapter['status'],
    health: 'good' as Chapter['health'],
    mrr: 0,
    next_action: '',
    notes: '',
    alumni_channels: '',
    payment_day: null as number | null,
    payment_type: 'annual' as Chapter['payment_type'],
    payment_amount: 299,
    payment_start_date: '',
    last_payment_date: '',
    next_payment_date: '',
    check_in_frequency: 'biweekly' as CheckInFrequency,
  });

  // Fetch chapters and settings
  useEffect(() => {
    fetchChapters();
    fetchBookingLink();
  }, []);

  async function fetchBookingLink() {
    try {
      const response = await fetch('/api/settings?key=booking_link');
      const result = await response.json();
      if (result.data?.value) {
        setBookingLink(result.data.value);
      }
    } catch (err) {
      console.error('Failed to fetch booking link:', err);
    }
  }

  async function saveBookingLink() {
    setSavingSettings(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'booking_link', value: bookingLink }),
      });
      const result = await response.json();
      if (result.error) {
        showToast(result.error.message, 'error');
      } else {
        showToast('Booking link saved!', 'success');
        setShowSettingsModal(false);
      }
    } catch (err) {
      console.error('Failed to save booking link:', err);
      showToast('Failed to save booking link', 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showModal || showCheckInModal || showSubmissionModal) return;
      
      const filteredLen = filteredChapters.length;
      if (filteredLen === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredLen - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === ' ' && focusedIndex >= 0) {
        e.preventDefault();
        const chapter = filteredChapters[focusedIndex];
        if (chapter) {
          setExpandedChapter(expandedChapter === chapter.id ? null : chapter.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, expandedChapter, showModal, showCheckInModal, showSubmissionModal]);

  // Scroll focused chapter into view
  useEffect(() => {
    if (focusedIndex >= 0 && chapterRefs.current[focusedIndex]) {
      chapterRefs.current[focusedIndex]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusedIndex]);

  // Toast management
  const showToast = useCallback((message: string, type: Toast['type'] = 'info', action?: Toast['action']) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type, action }]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, action ? 5000 : 3000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  async function fetchChapters() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching chapters:', error);
      showToast('Failed to load chapters', 'error');
    } else {
      setChapters(data || []);
      // Pre-fetch alumni pipeline stats for all chapters
      (data || []).forEach(ch => {
        if (alumniPipeline[ch.id] === undefined) {
          fetchAlumniCount(ch.id);
        }
      });
    }
    setLoading(false);
  }

  async function fetchAlumniCount(chapterId: string) {
    try {
      const res = await fetch(`/api/alumni/stats?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.data) {
        setAlumniCounts(prev => ({ ...prev, [chapterId]: json.data.total }));
        setAlumniPipeline(prev => ({ ...prev, [chapterId]: {
          total: json.data.total,
          have_phone: json.data.have_phone,
          imessage: json.data.imessage,
          contacted: json.data.contacted,
          responded: json.data.responded,
          signed_up: json.data.signed_up,
          touch1_ready: json.data.touch1_ready,
          touch2_due: json.data.touch2_due,
          touch3_due: json.data.touch3_due,
        }}));
      }
    } catch (err) {
      console.error('Failed to fetch alumni count:', err);
    }
  }

  async function fetchCheckIns(chapterId: string) {
    if (!supabase) return;
    
    const { data, error } = await supabase
      .from('chapter_check_ins')
      .select('*, action_items:check_in_action_items(*)')
      .eq('chapter_id', chapterId)
      .order('check_in_date', { ascending: false })
      .limit(5);

    if (!error && data) {
      setCheckIns(prev => ({ ...prev, [chapterId]: data }));
    }
  }

  async function fetchSubmission(chapterId: string) {
    try {
      const response = await fetch(`/api/onboarding/submission/${chapterId}`);
      const result = await response.json();
      
      if (result.data) {
        setSubmissionData(result.data);
      }
    } catch (err) {
      console.error('Error fetching submission:', err);
      showToast('Failed to load submission data', 'error');
    }
  }

  async function createChapter() {
    if (!supabase) {
      showToast('Database not connected', 'error');
      return;
    }
    if (!formData.chapter_name.trim()) {
      showToast('Chapter name is required', 'error');
      return;
    }

    const { error } = await supabase
      .from('chapters')
      .insert([{
        ...formData,
        chapter_created: true,
        onboarding_started: new Date().toISOString().split('T')[0],
        payment_start_date: formData.payment_start_date || null,
        last_payment_date: formData.last_payment_date || null,
        next_payment_date: formData.next_payment_date || null,
      }]);

    if (error) {
      console.error('Error creating chapter:', error);
      showToast(`Failed to create chapter: ${error.message}`, 'error');
    } else {
      showToast('Chapter created successfully', 'success');
      resetForm();
      fetchChapters();
    }
  }

  async function updateChapter() {
    if (!supabase || !editingChapter) return;

    const { error } = await supabase
      .from('chapters')
      .update({
        ...formData,
        payment_start_date: formData.payment_start_date || null,
        last_payment_date: formData.last_payment_date || null,
        next_payment_date: formData.next_payment_date || null,
      })
      .eq('id', editingChapter.id);

    if (error) {
      console.error('Error updating chapter:', error);
      showToast(`Failed to update chapter: ${error.message}`, 'error');
    } else {
      showToast('Chapter updated successfully', 'success');
      resetForm();
      fetchChapters();
    }
  }

  async function toggleOnboardingStep(chapter: ChapterWithOnboarding, stepKey: string, categoryKey: string) {
    if (!supabase) return;
    
    const currentValue = chapter[stepKey as keyof ChapterWithOnboarding];
    const newValue = !currentValue;
    
    // Optimistically update UI
    setChapters(prev => prev.map(c => 
      c.id === chapter.id ? { ...c, [stepKey]: newValue } : c
    ));

    // Check category completion
    const categorySteps = ONBOARDING_STEPS.filter(s => s.category === categoryKey);
    const categoryComplete = categorySteps.every(s => 
      s.key === stepKey ? newValue : chapter[s.key as keyof ChapterWithOnboarding]
    );

    // Check if all steps are now complete
    const allSteps = ONBOARDING_STEPS.map(s => s.key);
    const completedCount = allSteps.filter(key => 
      key === stepKey ? newValue : chapter[key as keyof ChapterWithOnboarding]
    ).length;
    
    const updateData: Record<string, unknown> = {
      [stepKey]: newValue,
      last_activity: new Date().toISOString().split('T')[0],
    };
    
    // Auto-update status when onboarding is complete
    if (completedCount === allSteps.length) {
      updateData.status = 'active';
      updateData.onboarding_completed = new Date().toISOString().split('T')[0];
    }

    const { error } = await supabase
      .from('chapters')
      .update(updateData)
      .eq('id', chapter.id);

    if (error) {
      console.error('Error updating step:', error);
      // Revert optimistic update
      setChapters(prev => prev.map(c => 
        c.id === chapter.id ? { ...c, [stepKey]: currentValue } : c
      ));
      showToast('Failed to update step', 'error');
    } else {
      // Show undo toast for completion
      if (newValue) {
        showToast(
          `Completed: ${ONBOARDING_STEPS.find(s => s.key === stepKey)?.label}`,
          'success',
          {
            label: 'Undo',
            onClick: () => toggleOnboardingStep({ ...chapter, [stepKey]: newValue } as ChapterWithOnboarding, stepKey, categoryKey),
          }
        );
      }

      // Celebrate category completion
      if (categoryComplete && newValue) {
        setCelebratingCategory({ chapterId: chapter.id, category: categoryKey });
        setTimeout(() => setCelebratingCategory(null), 2000);
      }

      // Celebrate full completion
      if (completedCount === allSteps.length && newValue) {
        setCelebratingChapter(chapter.id);
        setCompletedChapter({ ...chapter, [stepKey]: newValue } as ChapterWithOnboarding);
        setTimeout(() => setCelebratingChapter(null), 3000);
      }

      fetchChapters();
    }
  }

  async function deleteChapter(id: string) {
    if (!supabase) return;

    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting chapter:', error);
      showToast('Failed to delete chapter', 'error');
    } else {
      showToast('Chapter deleted', 'success');
      fetchChapters();
    }
    setDeleteConfirm({ show: false, id: null });
  }

  async function generateOnboardingLink(chapterId: string, regenerate = false) {
    try {
      const response = await fetch('/api/onboarding/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, regenerate }),
      });

      const result = await response.json();
      
      if (result.error) {
        showToast(result.error.message, 'error');
        return;
      }

      const link = `${window.location.origin}/onboard/${result.data.token}`;
      await navigator.clipboard.writeText(link);
      showToast('Onboarding link copied to clipboard!', 'success');
      fetchChapters();
    } catch (err) {
      console.error('Error generating link:', err);
      showToast('Failed to generate link', 'error');
    }
  }

  async function updateCheckInFrequency(chapterId: string, frequency: CheckInFrequency) {
    try {
      const response = await fetch('/api/check-ins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapter_id: chapterId, frequency }),
      });

      const result = await response.json();
      
      if (result.error) {
        showToast(result.error.message, 'error');
        return;
      }

      showToast('Check-in frequency updated', 'success');
      fetchChapters();
    } catch (err) {
      console.error('Error updating frequency:', err);
      showToast('Failed to update frequency', 'error');
    }
  }

  async function submitCheckIn(chapterId: string) {
    try {
      const response = await fetch('/api/check-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: chapterId,
          check_in_date: checkInForm.date,
          notes: checkInForm.notes,
          health_score: checkInForm.health_score,
          action_items: checkInForm.action_items.filter(a => a.trim()),
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        showToast(result.error.message, 'error');
        return;
      }

      showToast('Check-in logged successfully', 'success');
      setShowCheckInModal(null);
      setCheckInForm({
        date: new Date().toISOString().split('T')[0],
        notes: '',
        health_score: 'good',
        action_items: [''],
      });
      fetchChapters();
      fetchCheckIns(chapterId);
    } catch (err) {
      console.error('Error submitting check-in:', err);
      showToast('Failed to submit check-in', 'error');
    }
  }

  function resetForm() {
    setFormData({
      chapter_name: '',
      school: '',
      fraternity: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      status: 'onboarding',
      health: 'good',
      mrr: 0,
      next_action: '',
      notes: '',
      alumni_channels: '',
      payment_day: null,
      payment_type: 'annual',
      payment_amount: 299,
      payment_start_date: '',
      last_payment_date: '',
      next_payment_date: '',
      check_in_frequency: 'biweekly',
    });
    setEditingChapter(null);
    setShowModal(false);
  }

  function openEditModal(chapter: ChapterWithOnboarding) {
    setEditingChapter(chapter);
    setFormData({
      chapter_name: chapter.chapter_name,
      school: chapter.school || '',
      fraternity: chapter.fraternity || '',
      contact_name: chapter.contact_name || '',
      contact_email: chapter.contact_email || '',
      contact_phone: chapter.contact_phone || '',
      status: chapter.status,
      health: chapter.health,
      mrr: chapter.mrr || 0,
      next_action: chapter.next_action || '',
      notes: chapter.notes || '',
      alumni_channels: chapter.alumni_channels || '',
      payment_day: chapter.payment_day,
      payment_type: chapter.payment_type || 'annual',
      payment_amount: chapter.payment_amount || 299,
      payment_start_date: chapter.payment_start_date || '',
      last_payment_date: chapter.last_payment_date || '',
      next_payment_date: chapter.next_payment_date || '',
      check_in_frequency: chapter.check_in_frequency || 'biweekly',
    });
    setShowModal(true);
  }

  function getCompletionPercentage(chapter: ChapterWithOnboarding): number {
    const completed = ONBOARDING_STEPS.filter(step => 
      chapter[step.key as keyof ChapterWithOnboarding]
    ).length;
    return Math.round((completed / ONBOARDING_STEPS.length) * 100);
  }

  function getCompletedStepsCount(chapter: ChapterWithOnboarding): number {
    return ONBOARDING_STEPS.filter(step => 
      chapter[step.key as keyof ChapterWithOnboarding]
    ).length;
  }

  function getCategoryCompletedCount(chapter: ChapterWithOnboarding, category: string): number {
    return ONBOARDING_STEPS.filter(step => 
      step.category === category && chapter[step.key as keyof ChapterWithOnboarding]
    ).length;
  }

  function getCategoryTotalCount(category: string): number {
    return ONBOARDING_STEPS.filter(step => step.category === category).length;
  }

  function getProgressGradient(percentage: number): string {
    if (percentage < 25) return 'linear-gradient(90deg, #f97316, #fb923c)';
    if (percentage < 50) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
    if (percentage < 75) return 'linear-gradient(90deg, #10b981, #34d399)';
    return 'linear-gradient(90deg, #14b8a6, #2dd4bf)';
  }

  function getDaysUntilCheckIn(chapter: ChapterWithOnboarding): number | null {
    if (!chapter.next_check_in_date) return null;
    const next = new Date(chapter.next_check_in_date);
    const today = new Date();
    const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  function getDaysSinceActivity(chapter: ChapterWithOnboarding): number | null {
    if (!chapter.last_activity) return null;
    const last = new Date(chapter.last_activity);
    const today = new Date();
    return Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Filter chapters
  let filteredChapters = chapters.filter(c => {
    const matchesSearch = c.chapter_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.school && c.school.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.fraternity && c.fraternity.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // Apply quick filters
  if (quickFilter === 'overdue') {
    filteredChapters = filteredChapters.filter(c => {
      const days = getDaysUntilCheckIn(c);
      return days !== null && days < 0;
    });
  } else if (quickFilter === 'stalled') {
    filteredChapters = filteredChapters.filter(c => {
      const days = getDaysSinceActivity(c);
      return days !== null && days >= 7;
    });
  }

  // Stats
  const totalChapters = chapters.length;
  const activeChapters = chapters.filter(c => c.status === 'active').length;
  const onboardingChapters = chapters.filter(c => c.status === 'onboarding').length;
  const totalMRR = chapters.reduce((sum, c) => sum + (c.mrr || 0), 0);
  const overdueCheckIns = chapters.filter(c => {
    const days = getDaysUntilCheckIn(c);
    return days !== null && days < 0;
  }).length;

  const today = new Date();
  const currentDay = today.getDate();
  const upcomingPayments = chapters.filter(c => 
    c.payment_day && c.payment_day >= currentDay && c.status === 'active'
  ).length;

  const statusLabels: Record<Chapter['status'], string> = {
    onboarding: 'Onboarding',
    active: 'Active',
    at_risk: 'At Risk',
    churned: 'Churned',
  };

  const healthLabels: Record<Chapter['health'], string> = {
    good: 'Good',
    warning: 'Warning',
    critical: 'Critical',
  };

  const paymentTypeLabels: Record<Chapter['payment_type'], string> = {
    monthly: 'Monthly',
    one_time: 'One-Time',
    annual: 'Annual Commitment',
  };

  function formatPaymentDay(day: number | null): string {
    if (!day) return 'Not set';
    const suffix = day === 1 || day === 21 || day === 31 ? 'st' 
      : day === 2 || day === 22 ? 'nd' 
      : day === 3 || day === 23 ? 'rd' 
      : 'th';
    return `${day}${suffix}`;
  }

  // Group steps by category
  const stepsByCategory = {
    setup: ONBOARDING_STEPS.filter(s => s.category === 'setup'),
    alumni: ONBOARDING_STEPS.filter(s => s.category === 'alumni'),
    members: ONBOARDING_STEPS.filter(s => s.category === 'members'),
    training: ONBOARDING_STEPS.filter(s => s.category === 'training'),
    engagement: ONBOARDING_STEPS.filter(s => s.category === 'engagement'),
    social: ONBOARDING_STEPS.filter(s => s.category === 'social'),
  };

  const categoryLabels: Record<string, string> = {
    setup: '🚀 Setup',
    alumni: '👥 Alumni',
    members: '🎓 Members',
    training: '📚 Training',
    engagement: '💬 Engagement',
    social: '📱 Social',
  };

  // Generate confetti particles
  function generateConfetti(): ConfettiParticle[] {
    const colors = ['#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      scale: 0.5 + Math.random() * 0.5,
    }));
  }

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus" className="module-back">
              <ArrowLeft size={20} />
              Back to Nucleus
            </Link>
            <Link href="/workspace" className="module-back">
              <LayoutDashboard size={20} />
              Back to Workspace
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#ec489915', color: '#ec4899' }}>
              <HeartHandshake size={24} />
            </div>
            <div>
              <h1>Customer Success</h1>
              <p>Track chapter onboarding, engagement, and success metrics.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* Stats Row */}
        <div className="module-stats-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div className="module-stat">
            <span className="module-stat-value">{totalChapters}</span>
            <span className="module-stat-label">Total Chapters</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#10b981' }}>{activeChapters}</span>
            <span className="module-stat-label">Active</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#f59e0b' }}>{onboardingChapters}</span>
            <span className="module-stat-label">Onboarding</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">${totalMRR.toLocaleString()}</span>
            <span className="module-stat-label">Total MRR</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: overdueCheckIns > 0 ? '#ef4444' : '#8b5cf6' }}>
              {overdueCheckIns}
            </span>
            <span className="module-stat-label">Overdue Check-ins</span>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="module-actions-bar">
          <div className="module-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search chapters..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="module-actions">
            {/* Quick Filters */}
            <div className="cs-quick-filters">
              <button
                className={`cs-quick-filter ${quickFilter === 'all' ? 'active' : ''}`}
                onClick={() => setQuickFilter('all')}
              >
                All
              </button>
              <button
                className={`cs-quick-filter ${quickFilter === 'overdue' ? 'active' : ''}`}
                onClick={() => setQuickFilter('overdue')}
              >
                <AlertTriangle size={14} />
                Overdue Check-in
              </button>
              <button
                className={`cs-quick-filter ${quickFilter === 'stalled' ? 'active' : ''}`}
                onClick={() => setQuickFilter('stalled')}
              >
                <Clock size={14} />
                Stalled
              </button>
            </div>
            <select
              className="module-filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="onboarding">Onboarding</option>
              <option value="active">Active</option>
              <option value="at_risk">At Risk</option>
              <option value="churned">Churned</option>
            </select>
            <button className="module-primary-btn" onClick={() => setShowModal(true)}>
              <Plus size={18} />
              Add Chapter
            </button>
            <button 
              className="module-filter-btn" 
              onClick={() => setShowSettingsModal(true)}
              title="Settings"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* ═══════ Alumni Pipeline Overview Table ═══════ */}
        {Object.keys(alumniPipeline).length > 0 && (
          <div style={{ marginBottom: '20px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>📊 Alumni Outreach Pipeline</h3>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{Object.keys(alumniPipeline).length} chapters with alumni data</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chapter</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>Alumni</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#8b5cf6', fontSize: '0.7rem', textTransform: 'uppercase' }}>Phone</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#16a34a', fontSize: '0.7rem', textTransform: 'uppercase' }}>iMessage</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#d97706', fontSize: '0.7rem', textTransform: 'uppercase' }}>Contacted</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#2563eb', fontSize: '0.7rem', textTransform: 'uppercase' }}>Responded</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#059669', fontSize: '0.7rem', textTransform: 'uppercase' }}>Signed Up</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#374151', fontSize: '0.7rem', textTransform: 'uppercase' }}>Rate</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: '0.7rem', textTransform: 'uppercase' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {chapters
                    .filter(ch => alumniPipeline[ch.id])
                    .sort((a, b) => (alumniPipeline[b.id]?.total || 0) - (alumniPipeline[a.id]?.total || 0))
                    .map(ch => {
                      const p = alumniPipeline[ch.id];
                      if (!p) return null;
                      const responseRate = p.contacted > 0 ? Math.round((p.responded / p.contacted) * 100) : 0;
                      const followUpsDue = (p.touch2_due || 0) + (p.touch3_due || 0);

                      // Determine status chip
                      let statusLabel = 'New';
                      let statusColor = '#6b7280';
                      let statusBg = '#f3f4f6';
                      if (p.signed_up > 0 && p.contacted > 0 && p.touch1_ready === 0 && followUpsDue === 0) {
                        statusLabel = '✅ Complete'; statusColor = '#059669'; statusBg = '#d1fae5';
                      } else if (p.contacted > 0 && followUpsDue > 0) {
                        statusLabel = '🟡 Follow-ups'; statusColor = '#d97706'; statusBg = '#fef3c7';
                      } else if (p.contacted > 0) {
                        statusLabel = '🟢 Active'; statusColor = '#16a34a'; statusBg = '#dcfce7';
                      } else if (p.imessage > 0) {
                        statusLabel = '🔵 Ready'; statusColor = '#2563eb'; statusBg = '#dbeafe';
                      } else if (p.have_phone > 0 && p.imessage === 0) {
                        statusLabel = '🔴 Verify'; statusColor = '#dc2626'; statusBg = '#fee2e2';
                      }

                      return (
                        <tr key={ch.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px 16px', fontWeight: 500 }}>
                            <Link href={`/dashboard/clients/${ch.id}/alumni`} style={{ color: '#111827', textDecoration: 'none' }}>
                              {ch.chapter_name}
                              {ch.school && <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: '6px', fontSize: '0.75rem' }}>{ch.school}</span>}
                            </Link>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{p.total.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{p.have_phone.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{p.imessage.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d97706' }}>{p.contacted.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#2563eb' }}>{p.responded.toLocaleString()}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{p.signed_up}</td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: responseRate >= 20 ? '#16a34a' : responseRate >= 10 ? '#d97706' : '#6b7280' }}>
                            {p.contacted > 0 ? `${responseRate}%` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ padding: '3px 8px', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: 600, color: statusColor, backgroundColor: statusBg, whiteSpace: 'nowrap' }}>
                              {statusLabel}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            <Link
                              href={`/dashboard/clients/${ch.id}/alumni`}
                              style={{
                                padding: '4px 10px', borderRadius: '6px', border: '1px solid #e5e7eb',
                                background: '#fff', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600,
                                color: '#7c3aed', textDecoration: 'none', whiteSpace: 'nowrap',
                              }}
                            >
                              {p.touch1_ready > 0 ? `Send ${p.touch1_ready}` : followUpsDue > 0 ? `${followUpsDue} follow-ups` : 'View'}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  {/* Totals row */}
                  {(() => {
                    const totals = Object.values(alumniPipeline).reduce((acc, p) => ({
                      total: acc.total + p.total,
                      have_phone: acc.have_phone + p.have_phone,
                      imessage: acc.imessage + p.imessage,
                      contacted: acc.contacted + p.contacted,
                      responded: acc.responded + p.responded,
                      signed_up: acc.signed_up + p.signed_up,
                    }), { total: 0, have_phone: 0, imessage: 0, contacted: 0, responded: 0, signed_up: 0 });
                    const totalRate = totals.contacted > 0 ? Math.round((totals.responded / totals.contacted) * 100) : 0;
                    return (
                      <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 700, fontSize: '0.8125rem' }}>
                        <td style={{ padding: '10px 16px' }}>TOTAL</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{totals.total.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#8b5cf6' }}>{totals.have_phone.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#16a34a' }}>{totals.imessage.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d97706' }}>{totals.contacted.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#2563eb' }}>{totals.responded.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>{totals.signed_up}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{totals.contacted > 0 ? `${totalRate}%` : '—'}</td>
                        <td colSpan={2}></td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Chapters List */}
        <div className="chapters-list">
          {loading ? (
            <div className="module-loading">Loading...</div>
          ) : filteredChapters.length > 0 ? (
            filteredChapters.map((chapter, index) => {
              const percentage = getCompletionPercentage(chapter);
              const daysUntilCheckIn = getDaysUntilCheckIn(chapter);
              const isOverdue = daysUntilCheckIn !== null && daysUntilCheckIn < 0;
              const isCelebrating = celebratingChapter === chapter.id;
              
              return (
                <div 
                  key={chapter.id} 
                  ref={el => { chapterRefs.current[index] = el; }}
                  className={`chapter-card ${focusedIndex === index ? 'focused' : ''} ${isOverdue ? 'overdue' : ''} ${isCelebrating ? 'celebrating' : ''}`}
                >
                  {/* Confetti for celebration */}
                  {isCelebrating && (
                    <div className="confetti-container">
                      {generateConfetti().map(p => (
                        <div
                          key={p.id}
                          className="confetti-particle"
                          style={{
                            left: `${p.x}%`,
                            top: `${p.y}%`,
                            backgroundColor: p.color,
                            transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  
                  <div 
                    className="chapter-card-header"
                    onClick={() => {
                      setExpandedChapter(expandedChapter === chapter.id ? null : chapter.id);
                      if (!checkIns[chapter.id]) {
                        fetchCheckIns(chapter.id);
                      }
                      if (alumniCounts[chapter.id] === undefined) {
                        fetchAlumniCount(chapter.id);
                      }
                    }}
                  >
                    <div className="chapter-card-expand">
                      {expandedChapter === chapter.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                    <div className="chapter-card-info">
                      <h3>{chapter.chapter_name}</h3>
                      <span className="chapter-card-subtitle">
                        {chapter.fraternity}{chapter.fraternity && chapter.school ? ' • ' : ''}{chapter.school}
                        {alumniPipeline[chapter.id] && (
                          <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#9ca3af' }}>
                            {alumniPipeline[chapter.id].total} alumni
                            {alumniPipeline[chapter.id].contacted > 0 && <> · <span style={{ color: '#d97706' }}>{alumniPipeline[chapter.id].contacted} contacted</span></>}
                            {alumniPipeline[chapter.id].responded > 0 && <> · <span style={{ color: '#2563eb' }}>{alumniPipeline[chapter.id].responded} responded</span></>}
                            {alumniPipeline[chapter.id].signed_up > 0 && <> · <span style={{ color: '#16a34a' }}>{alumniPipeline[chapter.id].signed_up} signed up</span></>}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="chapter-card-progress">
                      <div className="progress-bar-animated">
                        <div 
                          className="progress-fill-animated"
                          style={{ 
                            width: `${percentage}%`,
                            background: getProgressGradient(percentage),
                          }}
                        />
                      </div>
                      <span className="progress-text">
                        {getCompletedStepsCount(chapter)}/{ONBOARDING_STEPS.length} steps
                      </span>
                    </div>
                    <span className={`module-status ${chapter.status}`}>{statusLabels[chapter.status]}</span>
                    <span 
                      className="cs-health-badge"
                      style={{
                        background: HEALTH_SCORE_COLORS[chapter.health === 'good' ? 'good' : chapter.health === 'warning' ? 'needs_attention' : 'at_risk'].bg,
                        color: HEALTH_SCORE_COLORS[chapter.health === 'good' ? 'good' : chapter.health === 'warning' ? 'needs_attention' : 'at_risk'].text,
                        boxShadow: `0 0 12px ${HEALTH_SCORE_COLORS[chapter.health === 'good' ? 'good' : chapter.health === 'warning' ? 'needs_attention' : 'at_risk'].glow}`,
                      }}
                    >
                      {healthLabels[chapter.health]}
                    </span>
                    {chapter.payment_day && (
                      <span 
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          fontWeight: 500,
                          borderRadius: '4px',
                          background: '#f3e8ff',
                          color: '#7c3aed',
                        }}
                        title={`Payment due on the ${formatPaymentDay(chapter.payment_day)}`}
                      >
                        <CreditCard size={12} />
                        {chapter.payment_day}
                      </span>
                    )}
                    <div className="chapter-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button 
                        className="module-table-action" 
                        onClick={() => {
                          setShowSubmissionModal(chapter.id);
                          fetchSubmission(chapter.id);
                        }}
                        title="View Submission"
                      >
                        <Eye size={14} />
                      </button>
                      <button 
                        className="module-table-action" 
                        onClick={() => generateOnboardingLink(chapter.id, !!chapter.onboarding_token)}
                        title={chapter.onboarding_token ? "Copy Link" : "Generate Link"}
                      >
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

                  {expandedChapter === chapter.id && (
                    <div className="chapter-card-body">
                      {/* Alumni Pipeline Section */}
                      {alumniPipeline[chapter.id] && (
                        <div style={{ padding: '16px 20px', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Users size={15} /> Alumni Pipeline
                            </h4>
                            <Link href={`/dashboard/clients/${chapter.id}/alumni`} style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              View Details <ExternalLink size={12} />
                            </Link>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                            {[
                              { label: 'Total', value: alumniPipeline[chapter.id].total, color: '#374151' },
                              { label: 'Phone', value: alumniPipeline[chapter.id].have_phone, color: '#8b5cf6' },
                              { label: 'iMessage', value: alumniPipeline[chapter.id].imessage, color: '#16a34a' },
                              { label: 'Contacted', value: alumniPipeline[chapter.id].contacted, color: '#d97706' },
                              { label: 'Responded', value: alumniPipeline[chapter.id].responded, color: '#2563eb' },
                              { label: 'Signed Up', value: alumniPipeline[chapter.id].signed_up, color: '#059669' },
                              { label: 'Response Rate', value: alumniPipeline[chapter.id].contacted > 0 ? `${Math.round((alumniPipeline[chapter.id].responded / alumniPipeline[chapter.id].contacted) * 100)}%` : '—', color: '#374151' },
                            ].map((stat) => (
                              <div key={stat.label} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>{stat.label}</div>
                              </div>
                            ))}
                          </div>
                          {(alumniPipeline[chapter.id].touch1_ready > 0 || alumniPipeline[chapter.id].touch2_due > 0 || alumniPipeline[chapter.id].touch3_due > 0) && (
                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
                              {alumniPipeline[chapter.id].touch1_ready > 0 && (
                                <span style={{ color: '#8b5cf6', fontWeight: 600 }}>
                                  {alumniPipeline[chapter.id].touch1_ready} ready for Touch 1
                                </span>
                              )}
                              {alumniPipeline[chapter.id].touch2_due > 0 && (
                                <span style={{ color: '#d97706', fontWeight: 600 }}>
                                  {alumniPipeline[chapter.id].touch2_due} due for Touch 2
                                </span>
                              )}
                              {alumniPipeline[chapter.id].touch3_due > 0 && (
                                <span style={{ color: '#2563eb', fontWeight: 600 }}>
                                  {alumniPipeline[chapter.id].touch3_due} due for Touch 3
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {alumniPipeline[chapter.id] === undefined && alumniCounts[chapter.id] === undefined && (
                        <div style={{ padding: '12px', background: '#f9fafb', borderRadius: '8px', marginBottom: '16px', fontSize: '0.8125rem', color: '#9ca3af', textAlign: 'center' }}>
                          Loading pipeline data...
                        </div>
                      )}

                      {/* Check-ins Section */}
                      <div className="cs-checkins-section">
                        <div className="cs-checkins-header">
                          <h4><MessageSquare size={16} /> Check-ins</h4>
                          <div className="cs-checkins-controls">
                            <select
                              value={chapter.check_in_frequency || 'biweekly'}
                              onChange={(e) => updateCheckInFrequency(chapter.id, e.target.value as CheckInFrequency)}
                              className="cs-frequency-select"
                            >
                              {Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                            <button 
                              className="cs-log-btn"
                              onClick={() => setShowCheckInModal(chapter.id)}
                            >
                              <Plus size={14} />
                              Log Check-in
                            </button>
                          </div>
                        </div>
                        
                        <div className="cs-next-checkin">
                          <Calendar size={14} />
                          <span>
                            {chapter.next_check_in_date ? (
                              <>
                                Next: {new Date(chapter.next_check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {daysUntilCheckIn !== null && (
                                  <span className={`cs-countdown ${daysUntilCheckIn < 0 ? 'overdue' : daysUntilCheckIn <= 3 ? 'soon' : ''}`}>
                                    {daysUntilCheckIn < 0 
                                      ? `(${Math.abs(daysUntilCheckIn)} days overdue)`
                                      : daysUntilCheckIn === 0 
                                        ? '(Today)'
                                        : `(in ${daysUntilCheckIn} days)`}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="cs-no-checkin">No check-ins scheduled</span>
                            )}
                          </span>
                        </div>

                        {checkIns[chapter.id] && checkIns[chapter.id].length > 0 && (
                          <div className="cs-recent-checkins">
                            <h5>Recent Check-ins</h5>
                            {checkIns[chapter.id].slice(0, 3).map(ci => (
                              <div key={ci.id} className="cs-checkin-item">
                                <span className="cs-checkin-date">
                                  {new Date(ci.check_in_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                                {ci.health_score && (
                                  <span 
                                    className="cs-checkin-health"
                                    style={{
                                      background: HEALTH_SCORE_COLORS[ci.health_score].bg,
                                      color: HEALTH_SCORE_COLORS[ci.health_score].text,
                                    }}
                                  >
                                    {HEALTH_SCORE_LABELS[ci.health_score]}
                                  </span>
                                )}
                                {ci.notes && (
                                  <span className="cs-checkin-notes">{ci.notes.slice(0, 50)}{ci.notes.length > 50 ? '...' : ''}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Onboarding Checklist */}
                      <div className="onboarding-checklist">
                        {Object.entries(stepsByCategory).map(([category, steps]) => {
                          const completedInCategory = getCategoryCompletedCount(chapter, category);
                          const totalInCategory = getCategoryTotalCount(category);
                          const categoryPercent = Math.round((completedInCategory / totalInCategory) * 100);
                          const isCategoryComplete = completedInCategory === totalInCategory;
                          const isCategoryCelebrating = celebratingCategory?.chapterId === chapter.id && celebratingCategory?.category === category;
                          
                          return (
                            <div 
                              key={category} 
                              className={`checklist-category ${isCategoryCelebrating ? 'celebrating' : ''}`}
                            >
                              <h4>
                                {categoryLabels[category]}
                                <span className="category-progress">{completedInCategory}/{totalInCategory}</span>
                              </h4>
                              <div className="category-progress-bar">
                                <div 
                                  className="category-progress-fill"
                                  style={{ 
                                    width: `${categoryPercent}%`,
                                    background: getProgressGradient(categoryPercent),
                                  }}
                                />
                              </div>
                              <div className="checklist-items">
                                {steps.map((step) => {
                                  const isChecked = !!chapter[step.key as keyof ChapterWithOnboarding];
                                  return (
                                    <label key={step.key} className={`checklist-item-animated ${isChecked ? 'checked' : ''}`}>
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleOnboardingStep(chapter, step.key, category)}
                                      />
                                      <span className="checkmark-animated">
                                        {isChecked && <Check size={12} />}
                                      </span>
                                      <span className="checklist-label">{step.label}</span>
                                    </label>
                                  );
                                })}
                              </div>
                              {category === 'alumni' && (
                                <Link
                                  href={`/dashboard/clients/${chapter.id}/alumni`}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginTop: '10px',
                                    padding: '10px 14px',
                                    borderRadius: '8px',
                                    background: '#f5f3ff',
                                    border: '1px solid #e9d5ff',
                                    textDecoration: 'none',
                                    color: '#7c3aed',
                                    fontSize: '0.8125rem',
                                    fontWeight: 500,
                                    transition: 'background 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#ede9fe'; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#f5f3ff'; }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>
                                    {alumniCounts[chapter.id] !== undefined
                                      ? `${alumniCounts[chapter.id]} alumni contact${alumniCounts[chapter.id] !== 1 ? 's' : ''}`
                                      : 'View alumni contacts'}
                                  </span>
                                  <ChevronRight size={16} />
                                </Link>
                              )}
                              {isCategoryCelebrating && (
                                <div className="category-confetti">
                                  {generateConfetti().slice(0, 20).map(p => (
                                    <div
                                      key={p.id}
                                      className="confetti-particle-mini"
                                      style={{
                                        left: `${p.x}%`,
                                        top: `${p.y}%`,
                                        backgroundColor: p.color,
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      
                      {chapter.contact_name && (
                        <div className="chapter-contact">
                          <strong>Contact:</strong> {chapter.contact_name}
                          {chapter.contact_email && ` • ${chapter.contact_email}`}
                          {chapter.contact_phone && ` • ${chapter.contact_phone}`}
                        </div>
                      )}
                      {chapter.alumni_channels && (
                        <div className="chapter-alumni-channels">
                          <strong>📱 Alumni Channels:</strong> {chapter.alumni_channels}
                        </div>
                      )}
                      {(chapter.payment_day || chapter.payment_type || chapter.payment_amount) && (
                        <div className="chapter-payment-info" style={{ 
                          marginTop: '12px',
                          padding: '12px 16px',
                          background: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <CreditCard size={16} style={{ color: '#8b5cf6' }} />
                            <strong style={{ color: '#374151' }}>Payment Info</strong>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '14px', color: '#64748b' }}>
                            <span>
                              <DollarSign size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                              <strong>${chapter.payment_amount || 299}</strong> ({paymentTypeLabels[chapter.payment_type || 'annual']})
                            </span>
                            {chapter.payment_day && (
                              <span>
                                <Calendar size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                Due: {formatPaymentDay(chapter.payment_day)} of each month
                              </span>
                            )}
                            {chapter.last_payment_date && (
                              <span>Last payment: {new Date(chapter.last_payment_date).toLocaleDateString()}</span>
                            )}
                            {chapter.next_payment_date && (
                              <span style={{ color: '#8b5cf6', fontWeight: 500 }}>
                                Next: {new Date(chapter.next_payment_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {chapter.next_action && (
                        <div className="chapter-next-action">
                          <strong>Next Action:</strong> {chapter.next_action}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="module-empty-state">
              <HeartHandshake size={48} />
              <h3>No chapters found</h3>
              <p>{quickFilter !== 'all' ? 'No chapters match the selected filter' : 'Add your first chapter to start tracking onboarding'}</p>
            </div>
          )}
        </div>
      </main>

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
            {toast.action && (
              <button className="toast-action" onClick={toast.action.onClick}>
                <Undo2 size={14} />
                {toast.action.label}
              </button>
            )}
            <button className="toast-dismiss" onClick={() => dismissToast(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add/Edit Chapter Modal */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => resetForm()}>
          <div className="module-modal module-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>{editingChapter ? 'Edit Chapter' : 'Add Chapter'}</h2>
              <button className="module-modal-close" onClick={() => resetForm()}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Chapter Name *</label>
                  <input
                    type="text"
                    value={formData.chapter_name}
                    onChange={(e) => setFormData({ ...formData, chapter_name: e.target.value })}
                    placeholder="e.g. Ole Miss Phi Delt"
                  />
                </div>
                <div className="module-form-group">
                  <label>Fraternity</label>
                  <input
                    type="text"
                    value={formData.fraternity}
                    onChange={(e) => setFormData({ ...formData, fraternity: e.target.value })}
                    placeholder="e.g. Phi Delta Theta"
                  />
                </div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>School</label>
                  <input
                    type="text"
                    value={formData.school}
                    onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                    placeholder="e.g. University of Mississippi"
                  />
                </div>
                <div className="module-form-group">
                  <label>MRR ($)</label>
                  <input
                    type="number"
                    value={formData.mrr}
                    onChange={(e) => setFormData({ ...formData, mrr: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Contact Name</label>
                  <input
                    type="text"
                    value={formData.contact_name}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    placeholder="Main contact person"
                  />
                </div>
                <div className="module-form-group">
                  <label>Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="module-form-group">
                  <label>Contact Phone</label>
                  <input
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Chapter['status'] })}
                  >
                    <option value="onboarding">Onboarding</option>
                    <option value="active">Active</option>
                    <option value="at_risk">At Risk</option>
                    <option value="churned">Churned</option>
                  </select>
                </div>
                <div className="module-form-group">
                  <label>Health</label>
                  <select
                    value={formData.health}
                    onChange={(e) => setFormData({ ...formData, health: e.target.value as Chapter['health'] })}
                  >
                    <option value="good">Good</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="module-form-group">
                  <label>Check-in Frequency</label>
                  <select
                    value={formData.check_in_frequency}
                    onChange={(e) => setFormData({ ...formData, check_in_frequency: e.target.value as CheckInFrequency })}
                  >
                    {Object.entries(CHECK_IN_FREQUENCY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Payment Tracking Section */}
              <div style={{ 
                marginTop: '16px', 
                marginBottom: '16px', 
                padding: '16px', 
                background: '#faf5ff', 
                borderRadius: '8px',
                border: '1px solid #e9d5ff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <CreditCard size={18} style={{ color: '#8b5cf6' }} />
                  <span style={{ fontWeight: 600, color: '#6b21a8' }}>Payment Tracking</span>
                </div>
                <div className="module-form-row">
                  <div className="module-form-group">
                    <label>Payment Day (1-31)</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.payment_day || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        payment_day: e.target.value ? parseInt(e.target.value) : null 
                      })}
                      placeholder="e.g. 15"
                    />
                  </div>
                  <div className="module-form-group">
                    <label>Payment Type</label>
                    <select
                      value={formData.payment_type}
                      onChange={(e) => setFormData({ ...formData, payment_type: e.target.value as Chapter['payment_type'] })}
                    >
                      <option value="annual">Annual Commitment ($299)</option>
                      <option value="monthly">Monthly</option>
                      <option value="one_time">One-Time</option>
                    </select>
                  </div>
                  <div className="module-form-group">
                    <label>Payment Amount ($)</label>
                    <input
                      type="number"
                      value={formData.payment_amount}
                      onChange={(e) => setFormData({ ...formData, payment_amount: parseFloat(e.target.value) || 299 })}
                      placeholder="299"
                    />
                  </div>
                </div>
                <div className="module-form-row">
                  <div className="module-form-group">
                    <label>Subscription Start Date</label>
                    <input
                      type="date"
                      value={formData.payment_start_date}
                      onChange={(e) => setFormData({ ...formData, payment_start_date: e.target.value })}
                    />
                  </div>
                  <div className="module-form-group">
                    <label>Last Payment Date</label>
                    <input
                      type="date"
                      value={formData.last_payment_date}
                      onChange={(e) => setFormData({ ...formData, last_payment_date: e.target.value })}
                    />
                  </div>
                  <div className="module-form-group">
                    <label>Next Payment Date</label>
                    <input
                      type="date"
                      value={formData.next_payment_date}
                      onChange={(e) => setFormData({ ...formData, next_payment_date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="module-form-group">
                <label>Next Action</label>
                <input
                  type="text"
                  value={formData.next_action}
                  onChange={(e) => setFormData({ ...formData, next_action: e.target.value })}
                  placeholder="What's the next step for this chapter?"
                />
              </div>
              <div className="module-form-group">
                <label>Alumni Communication Channels</label>
                <input
                  type="text"
                  value={formData.alumni_channels}
                  onChange={(e) => setFormData({ ...formData, alumni_channels: e.target.value })}
                  placeholder="e.g., GroupMe, Slack, Email Newsletter, Text Chain"
                />
              </div>
              <div className="module-form-group">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => resetForm()}>
                Cancel
              </button>
              <button
                className="module-primary-btn"
                onClick={editingChapter ? updateChapter : createChapter}
                disabled={!formData.chapter_name}
              >
                {editingChapter ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Check-in Modal */}
      {showCheckInModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowCheckInModal(null)}>
          <div className="module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>Log Check-in</h2>
              <button className="module-modal-close" onClick={() => setShowCheckInModal(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={checkInForm.date}
                  onChange={(e) => setCheckInForm({ ...checkInForm, date: e.target.value })}
                />
              </div>
              <div className="module-form-group">
                <label>Health Score</label>
                <div className="cs-health-options">
                  {(Object.keys(HEALTH_SCORE_LABELS) as HealthScore[]).map(score => (
                    <label 
                      key={score} 
                      className={`cs-health-option ${checkInForm.health_score === score ? 'selected' : ''}`}
                      style={{
                        background: checkInForm.health_score === score ? HEALTH_SCORE_COLORS[score].bg : 'transparent',
                        borderColor: HEALTH_SCORE_COLORS[score].bg,
                        color: checkInForm.health_score === score ? HEALTH_SCORE_COLORS[score].text : '#64748b',
                      }}
                    >
                      <input
                        type="radio"
                        name="health_score"
                        value={score}
                        checked={checkInForm.health_score === score}
                        onChange={() => setCheckInForm({ ...checkInForm, health_score: score })}
                      />
                      {HEALTH_SCORE_LABELS[score]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="module-form-group">
                <label>Notes</label>
                <textarea
                  value={checkInForm.notes}
                  onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                  placeholder="How did the check-in go? Any concerns or wins?"
                  rows={4}
                />
              </div>
              <div className="module-form-group">
                <label>Action Items (optional)</label>
                {checkInForm.action_items.map((item, index) => (
                  <div key={index} className="cs-action-item-input">
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => {
                        const newItems = [...checkInForm.action_items];
                        newItems[index] = e.target.value;
                        setCheckInForm({ ...checkInForm, action_items: newItems });
                      }}
                      placeholder="e.g., Follow up on alumni list upload"
                    />
                    {checkInForm.action_items.length > 1 && (
                      <button 
                        type="button"
                        className="cs-remove-action"
                        onClick={() => {
                          const newItems = checkInForm.action_items.filter((_, i) => i !== index);
                          setCheckInForm({ ...checkInForm, action_items: newItems });
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="cs-add-action"
                  onClick={() => setCheckInForm({ ...checkInForm, action_items: [...checkInForm.action_items, ''] })}
                >
                  <Plus size={14} />
                  Add Action Item
                </button>
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowCheckInModal(null)}>
                Cancel
              </button>
              <button
                className="module-primary-btn"
                onClick={() => submitCheckIn(showCheckInModal)}
              >
                Log Check-in
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* View Submission Modal */}
      {showSubmissionModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => { setShowSubmissionModal(null); setSubmissionData(null); }}>
          <div className="module-modal module-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>Onboarding Submission</h2>
              <button className="module-modal-close" onClick={() => { setShowSubmissionModal(null); setSubmissionData(null); }}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body cs-submission-view">
              {submissionData ? (
                <>
                  <div className="cs-submission-section">
                    <h4>Chapter Information</h4>
                    <div className="cs-submission-grid">
                      <div><strong>Chapter:</strong> {submissionData.chapter.chapter_name}</div>
                      <div><strong>University:</strong> {submissionData.chapter.school}</div>
                      <div><strong>Organization:</strong> {submissionData.chapter.fraternity}</div>
                      {submissionData.chapter.chapter_designation && (
                        <div><strong>Designation:</strong> {submissionData.chapter.chapter_designation}</div>
                      )}
                      {submissionData.chapter.year_founded && (
                        <div><strong>Founded:</strong> {submissionData.chapter.year_founded}</div>
                      )}
                      {submissionData.chapter.estimated_alumni && (
                        <div><strong>Estimated Alumni:</strong> {submissionData.chapter.estimated_alumni.toLocaleString()}</div>
                      )}
                    </div>
                  </div>

                  {submissionData.executives.length > 0 && (
                    <div className="cs-submission-section">
                      <h4>Executive Board ({submissionData.executives.length})</h4>
                      <div className="cs-executives-list">
                        {submissionData.executives.map(exec => (
                          <div key={exec.id} className="cs-executive-item">
                            <strong>{exec.full_name}</strong>
                            <span>{EXECUTIVE_POSITION_LABELS[exec.position]}{exec.custom_position ? ` (${exec.custom_position})` : ''}</span>
                            <a href={`mailto:${exec.email}`}>{exec.email}</a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {submissionData.outreach_channels.length > 0 && (
                    <div className="cs-submission-section">
                      <h4>Outreach Channels ({submissionData.outreach_channels.length})</h4>
                      <div className="cs-channels-list">
                        {submissionData.outreach_channels.map(channel => (
                          <div key={channel.id} className="cs-channel-item">
                            <strong>{OUTREACH_CHANNEL_LABELS[channel.channel_type]}</strong>
                            {channel.email_platform && <span>Platform: {channel.email_platform}</span>}
                            {channel.email_subscriber_count && <span>{channel.email_subscriber_count} subscribers</span>}
                            {channel.facebook_url && <a href={channel.facebook_url} target="_blank" rel="noopener noreferrer">View Group</a>}
                            {channel.facebook_member_count && <span>{channel.facebook_member_count} members</span>}
                            {channel.instagram_handle && <span>@{channel.instagram_handle}</span>}
                            {channel.instagram_follower_count && <span>{channel.instagram_follower_count} followers</span>}
                            {channel.linkedin_url && <a href={channel.linkedin_url} target="_blank" rel="noopener noreferrer">View Group</a>}
                            {channel.linkedin_member_count && <span>{channel.linkedin_member_count} members</span>}
                            {channel.website_url && <a href={channel.website_url} target="_blank" rel="noopener noreferrer">Visit Website</a>}
                            {channel.description && <p>{channel.description}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="cs-submission-section">
                    <h4>Additional Info</h4>
                    <div className="cs-submission-grid">
                      {submissionData.chapter.alumni_list_url && (
                        <div>
                          <strong>Alumni List:</strong>{' '}
                          <a href={submissionData.chapter.alumni_list_url} target="_blank" rel="noopener noreferrer">
                            Download <ExternalLink size={12} />
                          </a>
                        </div>
                      )}
                      {submissionData.chapter.scheduled_demo_time && (
                        <div><strong>Demo Scheduled:</strong> {new Date(submissionData.chapter.scheduled_demo_time).toLocaleString()}</div>
                      )}
                      {submissionData.chapter.instagram_handle && (
                        <div><strong>Instagram:</strong> @{submissionData.chapter.instagram_handle}</div>
                      )}
                      {submissionData.chapter.instagram_photo_url && (
                        <div>
                          <strong>Launch Photo:</strong>{' '}
                          <a href={submissionData.chapter.instagram_photo_url} target="_blank" rel="noopener noreferrer">
                            View <ExternalLink size={12} />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {submissionData.submitted_at && (
                    <div className="cs-submission-timestamp">
                      Submitted on {new Date(submissionData.submitted_at).toLocaleString()}
                    </div>
                  )}
                </>
              ) : (
                <div className="cs-submission-empty">
                  <p>No onboarding submission data available for this chapter.</p>
                  <p className="text-secondary">Generate an onboarding link and share it with the chapter president.</p>
                </div>
              )}
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => { setShowSubmissionModal(null); setSubmissionData(null); }}>
                Close
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Full Completion Celebration Modal */}
      {completedChapter && (
        <div className="cs-celebration-modal" onClick={() => setCompletedChapter(null)}>
          <div className="cs-celebration-content" onClick={(e) => e.stopPropagation()}>
            <div className="cs-celebration-confetti">
              {generateConfetti().map(p => (
                <div
                  key={p.id}
                  className="confetti-particle-large"
                  style={{
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    backgroundColor: p.color,
                    transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
                    animationDelay: `${Math.random() * 0.5}s`,
                  }}
                />
              ))}
            </div>
            <div className="cs-celebration-icon">
              <Sparkles size={48} />
            </div>
            <h2>🎉 Chapter Fully Onboarded!</h2>
            <p className="cs-celebration-chapter">{completedChapter.chapter_name}</p>
            <div className="cs-celebration-stats">
              <div>
                <strong>16/16</strong>
                <span>Steps Completed</span>
              </div>
              <div>
                <strong>{completedChapter.onboarding_started ? Math.ceil((Date.now() - new Date(completedChapter.onboarding_started).getTime()) / (1000 * 60 * 60 * 24)) : '--'}</strong>
                <span>Days to Complete</span>
              </div>
            </div>
            <button className="cs-celebration-close" onClick={() => setCompletedChapter(null)}>
              Awesome!
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setShowSettingsModal(false)}>
          <div className="module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>Onboarding Settings</h2>
              <button className="module-modal-close" onClick={() => setShowSettingsModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-group">
                <label>
                  <LinkIcon size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  Demo Booking Link
                </label>
                <input
                  type="url"
                  value={bookingLink}
                  onChange={(e) => setBookingLink(e.target.value)}
                  placeholder="https://calendar.google.com/calendar/appointments/..."
                />
                <span style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.5rem', display: 'block' }}>
                  This link will appear on all active onboarding forms for chapters to book demos.
                </span>
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => setShowSettingsModal(false)}>
                Cancel
              </button>
              <button
                className="module-primary-btn"
                onClick={saveBookingLink}
                disabled={savingSettings}
              >
                {savingSettings ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Chapter"
        message="Are you sure you want to delete this chapter? All onboarding progress will be lost."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => deleteConfirm.id && deleteChapter(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />
    </div>
  );
}
