'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  DollarSign,
  Plus,
  Search,
  X,
  Trash2,
  Edit2,
  TrendingUp,
  TrendingDown,
  Calendar,
  CreditCard,
  Building2,
  ChevronDown,
  Filter,
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  CalendarDays,
  Receipt,
  AlertTriangle,
  Repeat,
  LayoutDashboard,
  Undo2,
  ChevronRight,
  History,
} from 'lucide-react';
import { supabase, Chapter, Deal } from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import AccountingTab from './AccountingTab';
import ModalOverlay from '@/components/ModalOverlay';

interface Payment {
  id: string;
  chapter_id: string;
  amount: number;
  payment_date: string;
  payment_method: 'card' | 'bank_transfer' | 'check' | 'cash' | 'other';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  reference_number?: string;
  notes?: string;
  period_start?: string;
  period_end?: string;
  created_at: string;
  chapter?: {
    id: string;
    chapter_name: string;
    school?: string;
    fraternity?: string;
    contact_name?: string;
    contact_email?: string;
  };
}

type TimeRange = 'week' | 'month' | 'quarter' | 'year' | 'all';
type ActiveTab = 'dashboard' | 'payments' | 'schedule' | 'accounting';

interface StripeData {
  payouts: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    arrival_date: number;
    description: string | null;
    bank_last4: string | null;
  }>;
  charges: Array<{
    id: string;
    amount: number;
    currency: string;
    created: number;
    description: string;
    customer_email: string | null;
  }>;
}

// Temporary stub — Forge is completing this component
function FinanceDashboard({ chapters, deals, stripeData, stripeLoading, stripeError, formatCurrency }: {
  chapters: unknown[];
  deals: unknown[];
  stripeData: unknown;
  stripeLoading: boolean;
  stripeError: string | null;
  formatCurrency: (n: number) => string;
}) {
  return (
    <div className="finance-section">
      <p style={{ color: '#94a3b8', padding: '2rem' }}>Finance dashboard loading...</p>
    </div>
  );
}

export default function FinanceModule() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterChapter, setFilterChapter] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [formData, setFormData] = useState({
    chapter_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'card' as Payment['payment_method'],
    status: 'completed' as Payment['status'],
    reference_number: '',
    notes: '',
    period_start: '',
    period_end: '',
    setup_subscription: true,
    subscription_type: 'annual' as Chapter['payment_type'],
    subscription_payment_day: '',
  });

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmingChapter, setConfirmingChapter] = useState<Chapter | null>(null);
  const [confirmForm, setConfirmForm] = useState({
    payment_method: 'card' as Payment['payment_method'],
    date_received: new Date().toISOString().split('T')[0],
  });
  const [recentConfirmations, setRecentConfirmations] = useState<Array<{
    paymentId: string;
    chapterId: string;
    chapterName: string;
    amount: number;
    previousLastPayment: string | null;
    previousNextPayment: string | null;
    confirmedAt: Date;
  }>>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stripeData, setStripeData] = useState<StripeData | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [chapterPaymentHistory, setChapterPaymentHistory] = useState<Record<string, Payment[]>>({});

  useEffect(() => {
    fetchData();
    fetchDeals();
    fetchStripeData();
  }, []);

  async function fetchData() {
    setLoading(true);
    await Promise.all([fetchPayments(), fetchChapters()]);
    setLoading(false);
  }

  async function fetchDeals() {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('deals')
      .select('id, stage, value')
      .not('stage', 'in', '(closed_won,closed_lost)');
    if (!error && data) setDeals(data as Deal[]);
  }

  async function fetchStripeData() {
    setStripeLoading(true);
    setStripeError(null);
    try {
      const res = await fetch('/api/finance/stripe');
      const json = await res.json();
      if (json.error) {
        setStripeError(json.error);
      } else {
        setStripeData(json);
      }
    } catch {
      setStripeError('Failed to reach Stripe API');
    } finally {
      setStripeLoading(false);
    }
  }

  async function fetchPayments() {
    if (!supabase) return;
    
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        chapter:chapters(id, chapter_name, school, fraternity, contact_name, contact_email)
      `)
      .order('payment_date', { ascending: false });

    if (!error) {
      setPayments(data || []);
    }
  }

  async function fetchChapters() {
    if (!supabase) return;
    
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .order('chapter_name');

    if (!error) {
      setChapters(data || []);
    }
  }

  async function createPayment() {
    if (!supabase) {
      alert('Database not connected');
      return;
    }

    if (!formData.chapter_id || !formData.amount) {
      alert('Chapter and amount are required');
      return;
    }

    const { error } = await supabase
      .from('payments')
      .insert([{
        chapter_id: formData.chapter_id,
        amount: parseFloat(formData.amount),
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
        status: formData.status,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null,
        period_start: formData.period_start || null,
        period_end: formData.period_end || null,
      }]);

    if (error) {
      console.error('Error creating payment:', error);
      alert(`Failed to record payment: ${error.message}`);
      return;
    }

    const isCompleted = formData.status === 'completed';

    if (chapterNeedsSubscription && formData.setup_subscription && isCompleted) {
      const paymentDay = formData.subscription_payment_day
        ? parseInt(formData.subscription_payment_day)
        : new Date(formData.payment_date).getDate();

      const subType = formData.subscription_type;
      const amount = parseFloat(formData.amount);

      const tempChapter = {
        ...selectedChapterInfo!,
        payment_type: subType,
        payment_amount: amount,
        payment_day: paymentDay,
      };
      const nextPaymentDate = calculateNextPaymentDate(tempChapter, formData.payment_date);

      await supabase
        .from('chapters')
        .update({
          last_payment_date: formData.payment_date,
          payment_type: subType,
          payment_amount: amount,
          payment_day: paymentDay,
          payment_start_date: formData.payment_date,
          next_payment_date: nextPaymentDate,
        })
        .eq('id', formData.chapter_id);
    } else if (selectedChapterInfo && isCompleted) {
      const chapterUpdate: Record<string, string | null> = {
        last_payment_date: formData.payment_date,
      };

      if (selectedChapterInfo.next_payment_date && selectedChapterInfo.payment_type !== 'one_time') {
        chapterUpdate.next_payment_date = calculateNextPaymentDate(
          selectedChapterInfo,
          formData.payment_date
        );
      } else if (selectedChapterInfo.payment_type === 'one_time') {
        chapterUpdate.next_payment_date = null;
      }

      await supabase
        .from('chapters')
        .update(chapterUpdate)
        .eq('id', formData.chapter_id);
    } else {
      await supabase
        .from('chapters')
        .update({ last_payment_date: formData.payment_date })
        .eq('id', formData.chapter_id);
    }

    resetForm();
    await fetchData();
  }

  async function updatePayment() {
    if (!supabase || !editingPayment) return;

    const { error } = await supabase
      .from('payments')
      .update({
        chapter_id: formData.chapter_id,
        amount: parseFloat(formData.amount),
        payment_date: formData.payment_date,
        payment_method: formData.payment_method,
        status: formData.status,
        reference_number: formData.reference_number || null,
        notes: formData.notes || null,
        period_start: formData.period_start || null,
        period_end: formData.period_end || null,
      })
      .eq('id', editingPayment.id);

    if (error) {
      console.error('Error updating payment:', error);
      alert(`Failed to update payment: ${error.message}`);
    } else {
      resetForm();
      fetchPayments();
    }
  }

  async function deletePayment(id: string) {
    if (!supabase) return;

    const { error } = await supabase
      .from('payments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting payment:', error);
      alert('Failed to delete payment');
    } else {
      fetchPayments();
    }
    setDeleteConfirm({ show: false, id: null });
  }

  function resetForm() {
    setFormData({
      chapter_id: '',
      amount: '',
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'card',
      status: 'completed',
      reference_number: '',
      notes: '',
      period_start: '',
      period_end: '',
      setup_subscription: true,
      subscription_type: 'annual',
      subscription_payment_day: '',
    });
    setEditingPayment(null);
    setShowModal(false);
  }

  function openEditModal(payment: Payment) {
    setEditingPayment(payment);
    setFormData({
      chapter_id: payment.chapter_id,
      amount: payment.amount.toString(),
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      status: payment.status,
      reference_number: payment.reference_number || '',
      notes: payment.notes || '',
      period_start: payment.period_start || '',
      period_end: payment.period_end || '',
      setup_subscription: false,
      subscription_type: 'annual',
      subscription_payment_day: '',
    });
    setShowModal(true);
  }

  const selectedChapterInfo = useMemo(() => {
    if (!formData.chapter_id) return null;
    return chapters.find(c => c.id === formData.chapter_id) || null;
  }, [formData.chapter_id, chapters]);

  const chapterNeedsSubscription = useMemo(() => {
    if (!selectedChapterInfo) return false;
    return !selectedChapterInfo.payment_start_date &&
           !selectedChapterInfo.next_payment_date &&
           !selectedChapterInfo.payment_day;
  }, [selectedChapterInfo]);

  function openConfirmModal(chapter: Chapter) {
    setConfirmingChapter(chapter);
    setConfirmForm({
      payment_method: 'card',
      date_received: new Date().toISOString().split('T')[0],
    });
    setShowConfirmModal(true);
  }

  function calculateNextPaymentDate(chapter: Chapter, fromDate: string): string | null {
    if (chapter.payment_type === 'one_time') return null;

    const date = new Date(fromDate);
    if (chapter.payment_type === 'monthly') {
      date.setMonth(date.getMonth() + 1);
    } else if (chapter.payment_type === 'annual') {
      date.setFullYear(date.getFullYear() + 1);
    }

    if (chapter.payment_day) {
      const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(chapter.payment_day, lastDayOfMonth));
    }

    return date.toISOString().split('T')[0];
  }

  async function confirmPayment() {
    if (!supabase || !confirmingChapter) return;

    const chapter = confirmingChapter;
    const amount = chapter.payment_amount || 0;
    const nextPayment = calculateNextPaymentDate(chapter, confirmForm.date_received);

    const { data: paymentData, error: paymentError } = await supabase
      .from('payments')
      .insert([{
        chapter_id: chapter.id,
        amount,
        payment_date: confirmForm.date_received,
        payment_method: confirmForm.payment_method,
        status: 'completed',
        notes: 'Manually confirmed payment',
        period_start: chapter.next_payment_date || confirmForm.date_received,
        period_end: nextPayment || confirmForm.date_received,
      }])
      .select()
      .single();

    if (paymentError) {
      console.error('Error confirming payment:', paymentError);
      alert(`Failed to confirm payment: ${paymentError.message}`);
      return;
    }

    const updateData: Record<string, string | null> = {
      last_payment_date: confirmForm.date_received,
    };
    if (chapter.payment_type !== 'one_time') {
      updateData.next_payment_date = nextPayment;
    } else {
      updateData.next_payment_date = null;
    }

    const { error: chapterError } = await supabase
      .from('chapters')
      .update(updateData)
      .eq('id', chapter.id);

    if (chapterError) {
      console.error('Error updating chapter:', chapterError);
      alert(`Payment recorded but failed to update chapter dates: ${chapterError.message}`);
    }

    setRecentConfirmations(prev => [...prev, {
      paymentId: paymentData.id,
      chapterId: chapter.id,
      chapterName: chapter.chapter_name,
      amount,
      previousLastPayment: chapter.last_payment_date,
      previousNextPayment: chapter.next_payment_date,
      confirmedAt: new Date(),
    }]);

    setShowConfirmModal(false);
    setConfirmingChapter(null);
    setChapterPaymentHistory(prev => {
      const copy = { ...prev };
      delete copy[chapter.id];
      return copy;
    });
    await fetchData();
  }

  async function undoConfirmation(confirmation: typeof recentConfirmations[0]) {
    if (!supabase) return;

    const { error: deleteError } = await supabase
      .from('payments')
      .delete()
      .eq('id', confirmation.paymentId);

    if (deleteError) {
      console.error('Error undoing confirmation:', deleteError);
      alert(`Failed to undo confirmation: ${deleteError.message}`);
      return;
    }

    const { error: revertError } = await supabase
      .from('chapters')
      .update({
        last_payment_date: confirmation.previousLastPayment,
        next_payment_date: confirmation.previousNextPayment,
      })
      .eq('id', confirmation.chapterId);

    if (revertError) {
      console.error('Error reverting chapter dates:', revertError);
      alert(`Payment deleted but failed to revert chapter dates: ${revertError.message}`);
    }

    setRecentConfirmations(prev => prev.filter(c => c.paymentId !== confirmation.paymentId));
    setChapterPaymentHistory(prev => {
      const copy = { ...prev };
      delete copy[confirmation.chapterId];
      return copy;
    });
    await fetchData();
  }

  async function fetchChapterPayments(chapterId: string) {
    if (!supabase) return;
    if (chapterPaymentHistory[chapterId]) return;

    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('chapter_id', chapterId)
      .eq('status', 'completed')
      .order('payment_date', { ascending: false })
      .limit(10);

    if (!error && data) {
      setChapterPaymentHistory(prev => ({ ...prev, [chapterId]: data }));
    }
  }

  function toggleChapterHistory(chapterId: string) {
    if (expandedChapterId === chapterId) {
      setExpandedChapterId(null);
    } else {
      setExpandedChapterId(chapterId);
      fetchChapterPayments(chapterId);
    }
  }

  // Calculate date range based on selected time range
  const dateRange = useMemo(() => {
    const now = new Date();
    const end = now;
    let start: Date;

    switch (timeRange) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = new Date(0);
    }

    return { start, end };
  }, [timeRange]);

  // Filter payments
  const filteredPayments = useMemo(() => {
    return payments.filter((payment) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        payment.chapter?.chapter_name?.toLowerCase().includes(searchLower) ||
        payment.chapter?.school?.toLowerCase().includes(searchLower) ||
        payment.reference_number?.toLowerCase().includes(searchLower) ||
        payment.notes?.toLowerCase().includes(searchLower);

      // Status filter
      const matchesStatus = filterStatus === 'all' || payment.status === filterStatus;

      // Chapter filter
      const matchesChapter = filterChapter === 'all' || payment.chapter_id === filterChapter;

      // Date range filter
      const paymentDate = new Date(payment.payment_date);
      const matchesDate = timeRange === 'all' || 
        (paymentDate >= dateRange.start && paymentDate <= dateRange.end);

      return matchesSearch && matchesStatus && matchesChapter && matchesDate;
    });
  }, [payments, searchQuery, filterStatus, filterChapter, timeRange, dateRange]);

  // Calculate metrics
  const metrics = useMemo(() => {
    const completedPayments = filteredPayments.filter(p => p.status === 'completed');
    const totalRevenue = completedPayments.reduce((sum, p) => sum + p.amount, 0);
    const pendingPayments = filteredPayments.filter(p => p.status === 'pending');
    const pendingAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // Calculate previous period for comparison
    const periodLength = dateRange.end.getTime() - dateRange.start.getTime();
    const prevStart = new Date(dateRange.start.getTime() - periodLength);
    const prevEnd = dateRange.start;
    
    const prevPeriodPayments = payments.filter(p => {
      const date = new Date(p.payment_date);
      return date >= prevStart && date < prevEnd && p.status === 'completed';
    });
    const prevRevenue = prevPeriodPayments.reduce((sum, p) => sum + p.amount, 0);
    
    const revenueChange = prevRevenue > 0 
      ? ((totalRevenue - prevRevenue) / prevRevenue * 100)
      : totalRevenue > 0 ? 100 : 0;

    // Unique paying chapters
    const payingChapters = new Set(completedPayments.map(p => p.chapter_id)).size;

    // Average payment amount
    const avgPayment = completedPayments.length > 0 
      ? totalRevenue / completedPayments.length 
      : 0;

    return {
      totalRevenue,
      pendingAmount,
      pendingCount: pendingPayments.length,
      revenueChange,
      payingChapters,
      avgPayment,
      totalPayments: completedPayments.length,
    };
  }, [filteredPayments, payments, dateRange]);

  // Calculate schedule data from chapters (Stripe subscription info)
  const scheduleData = useMemo(() => {
    const now = new Date();
    
    // Chapters with payment info
    const chaptersWithPayments = chapters.filter(c => 
      c.payment_start_date || c.next_payment_date || c.payment_day
    );

    // Upcoming payments (next 30 days)
    const upcomingPayments = chaptersWithPayments
      .filter(c => c.next_payment_date)
      .map(c => ({
        chapter: c,
        dueDate: new Date(c.next_payment_date!),
        daysUntil: Math.ceil((new Date(c.next_payment_date!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .filter(p => p.daysUntil >= 0 && p.daysUntil <= 30)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    // Overdue payments
    const overduePayments = chaptersWithPayments
      .filter(c => c.next_payment_date && new Date(c.next_payment_date) < now)
      .map(c => ({
        chapter: c,
        dueDate: new Date(c.next_payment_date!),
        daysOverdue: Math.ceil((now.getTime() - new Date(c.next_payment_date!).getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    // Monthly recurring revenue from subscriptions
    const monthlyRecurring = chaptersWithPayments
      .filter(c => c.payment_type === 'monthly' && c.status === 'active')
      .reduce((sum, c) => sum + (c.payment_amount || 0), 0);

    const annualRecurring = chaptersWithPayments
      .filter(c => c.payment_type === 'annual' && c.status === 'active')
      .reduce((sum, c) => sum + (c.payment_amount || 0), 0);

    // Expected this month
    const expectedThisMonth = upcomingPayments
      .filter(p => p.dueDate.getMonth() === now.getMonth())
      .reduce((sum, p) => sum + (p.chapter.payment_amount || 0), 0);

    return {
      chaptersWithPayments,
      upcomingPayments,
      overduePayments,
      monthlyRecurring,
      annualRecurring,
      expectedThisMonth,
      totalSubscriptions: chaptersWithPayments.filter(c => c.status === 'active').length,
    };
  }, [chapters]);

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getOrdinalSuffix(day: number): string {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  const statusConfig = {
    completed: { label: 'Completed', color: '#10b981', bg: '#ecfdf5', icon: CheckCircle },
    pending: { label: 'Pending', color: '#f59e0b', bg: '#fffbeb', icon: Clock },
    failed: { label: 'Failed', color: '#ef4444', bg: '#fef2f2', icon: AlertCircle },
    refunded: { label: 'Refunded', color: '#6b7280', bg: '#f3f4f6', icon: RefreshCw },
  };

  const methodLabels: Record<Payment['payment_method'], string> = {
    card: 'Stripe',
    bank_transfer: 'Wire Transfer',
    check: 'Check',
    cash: 'Cash',
    other: 'Other',
  };

  const confirmMethodLabels: Record<string, string> = {
    card: 'Stripe',
    bank_transfer: 'Wire Transfer',
    check: 'Check',
    other: 'Other',
  };

  const lastPaymentMethodByChapter = useMemo(() => {
    const result: Record<string, Payment['payment_method']> = {};
    for (const p of payments) {
      if (p.status === 'completed' && !result[p.chapter_id]) {
        result[p.chapter_id] = p.payment_method;
      }
    }
    return result;
  }, [payments]);

  return (
    <div className="finance-page">
      {/* Header */}
      <header className="finance-header">
        <div className="finance-header-left">
          <Link href="/nucleus" className="finance-back-btn">
            <ArrowLeft size={20} />
          </Link>
          <Link href="/workspace" className="finance-back-btn" title="Back to Workspace">
            <LayoutDashboard size={20} />
          </Link>
          <div className="finance-header-icon">
            <DollarSign size={24} />
          </div>
          <div>
            <h1>Finance</h1>
            <p>Track chapter payments and revenue</p>
          </div>
        </div>
        <button className="finance-add-btn" onClick={() => setShowModal(true)}>
          <Plus size={18} />
          Record Payment
        </button>
      </header>

      {/* Tab Navigation */}
      <div className="finance-tabs">
        <button
          className={`finance-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </button>
        <button 
          className={`finance-tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          <CalendarDays size={18} />
          Payment Schedule
          {scheduleData.overduePayments.length > 0 && (
            <span className="finance-tab-badge">{scheduleData.overduePayments.length}</span>
          )}
        </button>
        <button 
          className={`finance-tab ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          <Receipt size={18} />
          Payment History
        </button>
        <button
          className={`finance-tab ${activeTab === 'accounting' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounting')}
        >
          <DollarSign size={18} />
          Accounting
        </button>
      </div>

      {/* Dashboard View */}
      {activeTab === 'dashboard' && (
        <FinanceDashboard
          chapters={chapters}
          deals={deals}
          stripeData={stripeData}
          stripeLoading={stripeLoading}
          stripeError={stripeError}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Schedule View */}
      {activeTab === 'schedule' && (
        <div className="finance-schedule">
          {/* Schedule Metrics */}
          <div className="schedule-metrics">
            <div className="schedule-metric-card">
              <div className="schedule-metric-icon subscriptions">
                <Repeat size={20} />
              </div>
              <div className="schedule-metric-content">
                <span className="schedule-metric-value">{scheduleData.totalSubscriptions}</span>
                <span className="schedule-metric-label">Active Subscriptions</span>
              </div>
            </div>
            <div className="schedule-metric-card">
              <div className="schedule-metric-icon expected">
                <Calendar size={20} />
              </div>
              <div className="schedule-metric-content">
                <span className="schedule-metric-value">{formatCurrency(scheduleData.expectedThisMonth)}</span>
                <span className="schedule-metric-label">Expected This Month</span>
              </div>
            </div>
            <div className="schedule-metric-card">
              <div className="schedule-metric-icon annual">
                <DollarSign size={20} />
              </div>
              <div className="schedule-metric-content">
                <span className="schedule-metric-value">{formatCurrency(scheduleData.annualRecurring)}</span>
                <span className="schedule-metric-label">Annual Commitments</span>
              </div>
            </div>
            {scheduleData.overduePayments.length > 0 && (
              <div className="schedule-metric-card overdue">
                <div className="schedule-metric-icon overdue-icon">
                  <AlertTriangle size={20} />
                </div>
                <div className="schedule-metric-content">
                  <span className="schedule-metric-value">{scheduleData.overduePayments.length}</span>
                  <span className="schedule-metric-label">Overdue Payments</span>
                </div>
              </div>
            )}
          </div>

          {/* Recent Confirmations Banner */}
          {recentConfirmations.length > 0 && (
            <div className="confirmations-banner">
              {recentConfirmations.map((conf) => (
                <div key={conf.paymentId} className="confirmation-item">
                  <CheckCircle size={16} />
                  <span>Payment confirmed for <strong>{conf.chapterName}</strong> — {formatCurrency(conf.amount)}</span>
                  <button className="confirmation-undo-btn" onClick={() => undoConfirmation(conf)}>
                    <Undo2 size={14} />
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Overdue Section */}
          {scheduleData.overduePayments.length > 0 && (
            <div className="schedule-section overdue-section">
              <div className="schedule-section-header">
                <AlertTriangle size={18} />
                <h3>Overdue Payments</h3>
                <span className="schedule-count">{scheduleData.overduePayments.length}</span>
              </div>
              <div className="schedule-list">
                {scheduleData.overduePayments.map((item) => (
                  <div key={item.chapter.id} className="schedule-item overdue has-action">
                    <div className="schedule-item-left">
                      <div className="schedule-item-chapter">
                        <span className="schedule-chapter-name">{item.chapter.chapter_name}</span>
                        {item.chapter.school && (
                          <span className="schedule-chapter-school">{item.chapter.school}</span>
                        )}
                      </div>
                    </div>
                    <div className="schedule-item-center">
                      <span className="schedule-amount">{formatCurrency(item.chapter.payment_amount || 0)}</span>
                      <span className="schedule-type">
                        {item.chapter.payment_type === 'monthly' ? 'Monthly' : 
                         item.chapter.payment_type === 'annual' ? 'Annual' : 'One-time'}
                      </span>
                    </div>
                    <div className="schedule-item-right">
                      <span className="schedule-overdue-badge">
                        {item.daysOverdue} day{item.daysOverdue !== 1 ? 's' : ''} overdue
                      </span>
                      <span className="schedule-date">Due: {formatDate(item.chapter.next_payment_date!)}</span>
                    </div>
                    <div className="schedule-item-actions">
                      <button
                        className="schedule-confirm-btn"
                        onClick={() => openConfirmModal(item.chapter)}
                        title="Confirm payment received"
                      >
                        <CheckCircle size={16} />
                        Confirm
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          <div className="schedule-section">
            <div className="schedule-section-header">
              <Calendar size={18} />
              <h3>Upcoming Payments</h3>
              <span className="schedule-count">{scheduleData.upcomingPayments.length}</span>
            </div>
            {scheduleData.upcomingPayments.length === 0 ? (
              <div className="schedule-empty">
                <Calendar size={32} />
                <p>No upcoming payments in the next 30 days</p>
              </div>
            ) : (
              <div className="schedule-list">
                {scheduleData.upcomingPayments.map((item) => (
                  <div key={item.chapter.id} className="schedule-item has-action">
                    <div className="schedule-item-left">
                      <div className="schedule-item-chapter">
                        <span className="schedule-chapter-name">{item.chapter.chapter_name}</span>
                        {item.chapter.school && (
                          <span className="schedule-chapter-school">{item.chapter.school}</span>
                        )}
                      </div>
                    </div>
                    <div className="schedule-item-center">
                      <span className="schedule-amount">{formatCurrency(item.chapter.payment_amount || 0)}</span>
                      <span className="schedule-type">
                        {item.chapter.payment_type === 'monthly' ? 'Monthly' : 
                         item.chapter.payment_type === 'annual' ? 'Annual' : 'One-time'}
                      </span>
                    </div>
                    <div className="schedule-item-right">
                      <span className={`schedule-days-badge ${item.daysUntil <= 7 ? 'soon' : ''}`}>
                        {item.daysUntil === 0 ? 'Today' : 
                         item.daysUntil === 1 ? 'Tomorrow' : 
                         `In ${item.daysUntil} days`}
                      </span>
                      <span className="schedule-date">{formatDate(item.chapter.next_payment_date!)}</span>
                    </div>
                    <div className="schedule-item-actions">
                      <button
                        className="schedule-confirm-btn upcoming"
                        onClick={() => openConfirmModal(item.chapter)}
                        title="Confirm early payment received"
                      >
                        <CheckCircle size={16} />
                        Confirm
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All Subscriptions */}
          <div className="schedule-section">
            <div className="schedule-section-header">
              <Building2 size={18} />
              <h3>All Chapter Subscriptions</h3>
              <span className="schedule-count">{scheduleData.chaptersWithPayments.length}</span>
            </div>
            {scheduleData.chaptersWithPayments.length === 0 ? (
              <div className="schedule-empty">
                <CreditCard size={32} />
                <p>No chapters with payment information yet</p>
                <span>Add payment details in Customer Success to track schedules</span>
              </div>
            ) : (
              <div className="schedule-table-container">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Chapter</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Payment Day</th>
                      <th>Started</th>
                      <th>Last Payment</th>
                      <th>Next Payment</th>
                      <th>Last Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleData.chaptersWithPayments.map((chapter) => {
                      const isOverdue = chapter.next_payment_date && new Date(chapter.next_payment_date) < new Date();
                      const isExpanded = expandedChapterId === chapter.id;
                      const historyEntries = chapterPaymentHistory[chapter.id] || [];
                      const lastMethod = lastPaymentMethodByChapter[chapter.id];
                      return (
                        <React.Fragment key={chapter.id}>
                          <tr className={`${isOverdue ? 'overdue-row' : ''} ${isExpanded ? 'expanded-row' : ''}`}>
                            <td className="schedule-table-expand">
                              <button
                                className={`expand-btn ${isExpanded ? 'expanded' : ''}`}
                                onClick={() => toggleChapterHistory(chapter.id)}
                                title="View payment history"
                              >
                                <ChevronRight size={16} />
                              </button>
                            </td>
                            <td>
                              <div className="schedule-table-chapter">
                                <span className="chapter-name">{chapter.chapter_name}</span>
                                {chapter.school && <span className="chapter-school">{chapter.school}</span>}
                              </div>
                            </td>
                            <td>
                              <span className={`schedule-type-badge ${chapter.payment_type}`}>
                                {chapter.payment_type === 'monthly' ? 'Monthly' : 
                                 chapter.payment_type === 'annual' ? 'Annual' : 'One-time'}
                              </span>
                            </td>
                            <td className="schedule-table-amount">
                              {formatCurrency(chapter.payment_amount || 0)}
                            </td>
                            <td className="schedule-table-day">
                              {chapter.payment_day ? `${chapter.payment_day}${getOrdinalSuffix(chapter.payment_day)}` : '—'}
                            </td>
                            <td>{chapter.payment_start_date ? formatDate(chapter.payment_start_date) : '—'}</td>
                            <td>{chapter.last_payment_date ? formatDate(chapter.last_payment_date) : '—'}</td>
                            <td className={isOverdue ? 'overdue-date' : ''}>
                              {chapter.payment_type === 'one_time' && !chapter.next_payment_date
                                ? <span className="paid-complete-badge">Paid</span>
                                : chapter.next_payment_date ? formatDate(chapter.next_payment_date) : '—'}
                            </td>
                            <td>
                              {lastMethod ? (
                                <span className="method-badge">
                                  <CreditCard size={12} />
                                  {confirmMethodLabels[lastMethod] || methodLabels[lastMethod]}
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              <span className={`chapter-status-badge ${chapter.status}`}>
                                {chapter.status}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="history-expansion-row">
                              <td colSpan={10}>
                                <div className="chapter-history-panel">
                                  <div className="chapter-history-header">
                                    <History size={16} />
                                    <span>Payment History — {chapter.chapter_name}</span>
                                  </div>
                                  {historyEntries.length === 0 ? (
                                    <div className="chapter-history-empty">
                                      No payment records found
                                    </div>
                                  ) : (
                                    <table className="chapter-history-table">
                                      <thead>
                                        <tr>
                                          <th>Date</th>
                                          <th>Amount</th>
                                          <th>Method</th>
                                          <th>Reference</th>
                                          <th>Notes</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {historyEntries.map((p) => (
                                          <tr key={p.id}>
                                            <td>{formatDate(p.payment_date)}</td>
                                            <td className="schedule-table-amount">{formatCurrency(p.amount)}</td>
                                            <td>
                                              <span className="method-badge small">
                                                <CreditCard size={11} />
                                                {confirmMethodLabels[p.payment_method] || methodLabels[p.payment_method]}
                                              </span>
                                            </td>
                                            <td className="finance-table-ref">{p.reference_number || '—'}</td>
                                            <td className="history-notes">{p.notes || '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payment History View */}
      {activeTab === 'payments' && (
        <>
          {/* Time Range Selector */}
          <div className="finance-time-selector">
            {(['week', 'month', 'quarter', 'year', 'all'] as TimeRange[]).map((range) => (
              <button
                key={range}
                className={`finance-time-btn ${timeRange === range ? 'active' : ''}`}
                onClick={() => setTimeRange(range)}
              >
                {range === 'all' ? 'All Time' : range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>

          {/* Metrics Cards */}
          <div className="finance-metrics">
            <div className="finance-metric-card primary">
              <div className="finance-metric-icon">
                <DollarSign size={24} />
              </div>
              <div className="finance-metric-content">
                <span className="finance-metric-label">Total Revenue</span>
                <span className="finance-metric-value">{formatCurrency(metrics.totalRevenue)}</span>
                {timeRange !== 'all' && (
                  <span className={`finance-metric-change ${metrics.revenueChange >= 0 ? 'positive' : 'negative'}`}>
                    {metrics.revenueChange >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(metrics.revenueChange).toFixed(1)}% vs prev
                  </span>
                )}
              </div>
            </div>

            <div className="finance-metric-card">
              <div className="finance-metric-icon pending">
                <Clock size={24} />
              </div>
              <div className="finance-metric-content">
                <span className="finance-metric-label">Pending</span>
                <span className="finance-metric-value">{formatCurrency(metrics.pendingAmount)}</span>
                <span className="finance-metric-sub">{metrics.pendingCount} payment{metrics.pendingCount !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="finance-metric-card">
              <div className="finance-metric-icon chapters">
                <Building2 size={24} />
              </div>
              <div className="finance-metric-content">
                <span className="finance-metric-label">Paying Chapters</span>
                <span className="finance-metric-value">{metrics.payingChapters}</span>
                <span className="finance-metric-sub">of {chapters.length} total</span>
              </div>
            </div>

            <div className="finance-metric-card">
              <div className="finance-metric-icon avg">
                <TrendingUp size={24} />
              </div>
              <div className="finance-metric-content">
                <span className="finance-metric-label">Avg Payment</span>
                <span className="finance-metric-value">{formatCurrency(metrics.avgPayment)}</span>
                <span className="finance-metric-sub">{metrics.totalPayments} payments</span>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="finance-filters">
        <div className="finance-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search payments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="finance-search-clear">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="finance-filter-group">
          <div className="finance-filter">
            <Filter size={16} />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <ChevronDown size={16} />
          </div>

          <div className="finance-filter">
            <Building2 size={16} />
            <select
              value={filterChapter}
              onChange={(e) => setFilterChapter(e.target.value)}
            >
              <option value="all">All Chapters</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.chapter_name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} />
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="finance-table-container">
        {loading ? (
          <div className="finance-loading">
            <RefreshCw size={24} className="spin" />
            <span>Loading payments...</span>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="finance-empty">
            <DollarSign size={48} />
            <h3>No payments found</h3>
            <p>
              {payments.length === 0
                ? 'Record your first payment to start tracking revenue.'
                : 'Try adjusting your filters to see more results.'}
            </p>
            {payments.length === 0 && (
              <button className="finance-add-btn" onClick={() => setShowModal(true)}>
                <Plus size={18} />
                Record Payment
              </button>
            )}
          </div>
        ) : (
          <table className="finance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Chapter</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => {
                const status = statusConfig[payment.status];
                const StatusIcon = status.icon;
                
                return (
                  <tr key={payment.id}>
                    <td className="finance-table-date">
                      <Calendar size={14} />
                      {formatDate(payment.payment_date)}
                    </td>
                    <td className="finance-table-chapter">
                      <div className="finance-chapter-info">
                        <span className="finance-chapter-name">
                          {payment.chapter?.chapter_name || 'Unknown Chapter'}
                        </span>
                        {payment.chapter?.school && (
                          <span className="finance-chapter-school">{payment.chapter.school}</span>
                        )}
                      </div>
                    </td>
                    <td className="finance-table-amount">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="finance-table-method">
                      <CreditCard size={14} />
                      {methodLabels[payment.payment_method]}
                    </td>
                    <td>
                      <span 
                        className="finance-status-badge"
                        style={{ background: status.bg, color: status.color }}
                      >
                        <StatusIcon size={14} />
                        {status.label}
                      </span>
                    </td>
                    <td className="finance-table-ref">
                      {payment.reference_number || '—'}
                    </td>
                    <td className="finance-table-actions">
                      <button
                        className="finance-action-btn edit"
                        onClick={() => openEditModal(payment)}
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="finance-action-btn delete"
                        onClick={() => setDeleteConfirm({ show: true, id: payment.id })}
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary Footer */}
      <div className="finance-summary">
        <span>
          Showing {filteredPayments.length} of {payments.length} payments
        </span>
        <span className="finance-summary-total">
          Total: {formatCurrency(filteredPayments.filter(p => p.status === 'completed').reduce((s, p) => s + p.amount, 0))}
        </span>
      </div>
        </>
      )}

      {/* Accounting View */}
      {activeTab === 'accounting' && (
        <AccountingTab payments={payments} />
      )}

      {/* Confirm Payment Modal */}
      {showConfirmModal && confirmingChapter && (
        <ModalOverlay className="finance-modal-overlay" onClose={() => setShowConfirmModal(false)}>
          <div className="confirm-payment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-top">
              <div className="confirm-modal-icon-wrap">
                <CheckCircle size={28} />
              </div>
              <h2>Confirm Payment</h2>
              <p className="confirm-modal-subtitle">
                {confirmingChapter.chapter_name}
                {confirmingChapter.school && ` — ${confirmingChapter.school}`}
              </p>
              <div className="confirm-modal-amount">
                {formatCurrency(confirmingChapter.payment_amount || 0)}
              </div>
            </div>

            <div className="confirm-modal-body">
              <div className="confirm-form-group">
                <label>Payment Method</label>
                <select
                  value={confirmForm.payment_method}
                  onChange={(e) => setConfirmForm({ ...confirmForm, payment_method: e.target.value as Payment['payment_method'] })}
                >
                  <option value="card">Stripe</option>
                  <option value="check">Check</option>
                  <option value="bank_transfer">Wire Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="confirm-form-group">
                <label>Date Received</label>
                <input
                  type="date"
                  value={confirmForm.date_received}
                  onChange={(e) => setConfirmForm({ ...confirmForm, date_received: e.target.value })}
                />
              </div>
            </div>

            <div className="confirm-modal-footer">
              <button className="finance-btn-secondary" onClick={() => setShowConfirmModal(false)}>
                Cancel
              </button>
              <button className="confirm-payment-btn" onClick={confirmPayment}>
                <CheckCircle size={16} />
                Confirm Payment
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Payment Modal */}
      {showModal && (
        <ModalOverlay className="finance-modal-overlay" onClose={() => resetForm()}>
          <div className="finance-modal" onClick={(e) => e.stopPropagation()}>
            <div className="finance-modal-header">
              <h2>{editingPayment ? 'Edit Payment' : 'Record Payment'}</h2>
              <button className="finance-modal-close" onClick={resetForm}>
                <X size={20} />
              </button>
            </div>

            <div className="finance-modal-body">
              <div className="finance-form-row">
                <div className="finance-form-group full">
                  <label>Chapter *</label>
                  <select
                    value={formData.chapter_id}
                    onChange={(e) => setFormData({ ...formData, chapter_id: e.target.value })}
                    required
                  >
                    <option value="">Select a chapter...</option>
                    {chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.chapter_name} {chapter.school ? `- ${chapter.school}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="finance-form-row">
                <div className="finance-form-group">
                  <label>Amount *</label>
                  <div className="finance-input-with-icon">
                    <DollarSign size={16} />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>
                <div className="finance-form-group">
                  <label>Payment Date</label>
                  <input
                    type="date"
                    value={formData.payment_date}
                    onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="finance-form-row">
                <div className="finance-form-group">
                  <label>Payment Method</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as Payment['payment_method'] })}
                  >
                    <option value="card">Stripe</option>
                    <option value="check">Check</option>
                    <option value="bank_transfer">Wire Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="finance-form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Payment['status'] })}
                  >
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </div>
              </div>

              <div className="finance-form-row">
                <div className="finance-form-group full">
                  <label>Reference Number</label>
                  <input
                    type="text"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="Transaction ID or check number"
                  />
                </div>
              </div>

              <div className="finance-form-row">
                <div className="finance-form-group">
                  <label>Period Start</label>
                  <input
                    type="date"
                    value={formData.period_start}
                    onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                  />
                </div>
                <div className="finance-form-group">
                  <label>Period End</label>
                  <input
                    type="date"
                    value={formData.period_end}
                    onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                  />
                </div>
              </div>

              <div className="finance-form-row">
                <div className="finance-form-group full">
                  <label>Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Additional notes about this payment..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Subscription Setup — appears when the chapter has no active subscription */}
              {!editingPayment && chapterNeedsSubscription && formData.chapter_id && (
                <div className="subscription-setup">
                  <div className="subscription-setup-toggle">
                    <label className="subscription-toggle-label">
                      <input
                        type="checkbox"
                        checked={formData.setup_subscription}
                        onChange={(e) => setFormData({ ...formData, setup_subscription: e.target.checked })}
                      />
                      <CalendarDays size={16} />
                      <span>Set up payment schedule for this chapter</span>
                    </label>
                    <span className="subscription-setup-hint">
                      This chapter has no active subscription. Enable to track future payments.
                    </span>
                  </div>

                  {formData.setup_subscription && (
                    <div className="subscription-setup-fields">
                      <div className="finance-form-row">
                        <div className="finance-form-group">
                          <label>Subscription Type</label>
                          <select
                            value={formData.subscription_type}
                            onChange={(e) => setFormData({ ...formData, subscription_type: e.target.value as Chapter['payment_type'] })}
                          >
                            <option value="annual">Annual</option>
                            <option value="monthly">Monthly</option>
                            <option value="one_time">One-time</option>
                          </select>
                        </div>
                        <div className="finance-form-group">
                          <label>Payment Day</label>
                          <input
                            type="number"
                            min="1"
                            max="31"
                            value={formData.subscription_payment_day}
                            onChange={(e) => setFormData({ ...formData, subscription_payment_day: e.target.value })}
                            placeholder={formData.payment_date ? `${new Date(formData.payment_date).getDate()} (from payment date)` : 'Day of month (1-31)'}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="finance-modal-footer">
              <button className="finance-btn-secondary" onClick={resetForm}>
                Cancel
              </button>
              <button
                className="finance-btn-primary"
                onClick={editingPayment ? updatePayment : createPayment}
              >
                {editingPayment ? 'Update Payment' : 'Record Payment'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Payment"
        message="Are you sure you want to delete this payment record? This action cannot be undone."
        confirmText="Delete"
        onConfirm={() => deleteConfirm.id && deletePayment(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />

      <style jsx>{`
        .finance-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          padding: 2rem;
        }

        .finance-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .finance-header-left {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .finance-back-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: white;
          border: 1px solid #e5e7eb;
          color: #6b7280;
          transition: all 0.2s;
        }

        .finance-back-btn:hover {
          background: #f9fafb;
          color: #374151;
        }

        .finance-header-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        }

        .finance-header h1 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .finance-header p {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0;
        }

        .finance-add-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }

        .finance-add-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        }

        .finance-time-selector {
          display: flex;
          gap: 0.5rem;
          background: white;
          padding: 0.5rem;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          margin-bottom: 1.5rem;
          width: fit-content;
        }

        .finance-time-btn {
          padding: 0.5rem 1rem;
          background: transparent;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
        }

        .finance-time-btn:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .finance-time-btn.active {
          background: #10b981;
          color: white;
        }

        .finance-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .finance-metric-card {
          background: white;
          border-radius: 16px;
          padding: 1.25rem;
          border: 1px solid #e5e7eb;
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .finance-metric-card.primary {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none;
        }

        .finance-metric-card.primary .finance-metric-label,
        .finance-metric-card.primary .finance-metric-value,
        .finance-metric-card.primary .finance-metric-change {
          color: white;
        }

        .finance-metric-card.primary .finance-metric-icon {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .finance-metric-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: #ecfdf5;
          color: #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .finance-metric-icon.pending {
          background: #fffbeb;
          color: #f59e0b;
        }

        .finance-metric-icon.chapters {
          background: #eff6ff;
          color: #3b82f6;
        }

        .finance-metric-icon.avg {
          background: #faf5ff;
          color: #8b5cf6;
        }

        .finance-metric-content {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .finance-metric-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .finance-metric-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
        }

        .finance-metric-change {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .finance-metric-change.positive {
          color: #10b981;
        }

        .finance-metric-change.negative {
          color: #ef4444;
        }

        .finance-metric-sub {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .finance-filters {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .finance-search {
          flex: 1;
          max-width: 400px;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 0.625rem 1rem;
        }

        .finance-search svg {
          color: #9ca3af;
          flex-shrink: 0;
        }

        .finance-search input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 0.875rem;
          color: #374151;
        }

        .finance-search input::placeholder {
          color: #9ca3af;
        }

        .finance-search-clear {
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 0;
          display: flex;
        }

        .finance-search-clear:hover {
          color: #6b7280;
        }

        .finance-filter-group {
          display: flex;
          gap: 0.75rem;
        }

        .finance-filter {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 0.625rem 0.75rem;
          color: #6b7280;
        }

        .finance-filter select {
          border: none;
          outline: none;
          background: transparent;
          font-size: 0.875rem;
          color: #374151;
          cursor: pointer;
          padding-right: 0.5rem;
          -webkit-appearance: none;
          appearance: none;
        }

        .finance-table-container {
          background: white;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .finance-loading,
        .finance-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          color: #6b7280;
          text-align: center;
        }

        .finance-loading svg,
        .finance-empty svg {
          margin-bottom: 1rem;
          opacity: 0.5;
        }

        .finance-empty h3 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #374151;
          margin: 0 0 0.5rem 0;
        }

        .finance-empty p {
          margin: 0 0 1.5rem 0;
          max-width: 300px;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        .finance-table {
          width: 100%;
          border-collapse: collapse;
        }

        .finance-table th {
          text-align: left;
          padding: 1rem 1.25rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .finance-table td {
          padding: 1rem 1.25rem;
          font-size: 0.875rem;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
        }

        .finance-table tr:last-child td {
          border-bottom: none;
        }

        .finance-table tr:hover td {
          background: #f9fafb;
        }

        .finance-table-date {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #6b7280;
        }

        .finance-chapter-info {
          display: flex;
          flex-direction: column;
        }

        .finance-chapter-name {
          font-weight: 500;
          color: #111827;
        }

        .finance-chapter-school {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .finance-table-amount {
          font-weight: 600;
          color: #10b981;
        }

        .finance-table-method {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #6b7280;
        }

        .finance-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .finance-table-ref {
          color: #9ca3af;
          font-family: monospace;
          font-size: 0.8125rem;
        }

        .finance-table-actions {
          display: flex;
          gap: 0.5rem;
        }

        .finance-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: #f3f4f6;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
        }

        .finance-action-btn:hover {
          background: #e5e7eb;
          color: #374151;
        }

        .finance-action-btn.delete:hover {
          background: #fef2f2;
          color: #ef4444;
        }

        .finance-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .finance-summary-total {
          font-weight: 600;
          color: #10b981;
        }

        /* Modal Styles */
        .finance-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 2rem;
        }

        .finance-modal {
          background: white;
          border-radius: 20px;
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .finance-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .finance-modal-header h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .finance-modal-close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: none;
          background: #f3f4f6;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
        }

        .finance-modal-close:hover {
          background: #e5e7eb;
          color: #374151;
        }

        .finance-modal-body {
          padding: 1.5rem;
          overflow-y: auto;
        }

        .finance-form-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .finance-form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .finance-form-group.full {
          grid-column: span 2;
        }

        .finance-form-group label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #374151;
        }

        .finance-form-group input,
        .finance-form-group select,
        .finance-form-group textarea {
          padding: 0.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.875rem;
          color: #374151;
          transition: all 0.2s;
        }

        .finance-form-group input:focus,
        .finance-form-group select:focus,
        .finance-form-group textarea:focus {
          outline: none;
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }

        .finance-input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .finance-input-with-icon svg {
          position: absolute;
          left: 0.75rem;
          color: #9ca3af;
        }

        .finance-input-with-icon input {
          padding-left: 2.5rem;
          width: 100%;
        }

        .finance-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1.25rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .finance-btn-secondary {
          padding: 0.75rem 1.25rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-weight: 500;
          font-size: 0.875rem;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .finance-btn-secondary:hover {
          background: #f9fafb;
          border-color: #d1d5db;
        }

        .finance-btn-primary {
          padding: 0.75rem 1.25rem;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.875rem;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .finance-btn-primary:hover {
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }

        /* Tab Navigation */
        .finance-tabs {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          background: white;
          padding: 0.5rem;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          width: fit-content;
        }

        .finance-tab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.25rem;
          border: none;
          border-radius: 8px;
          font-size: 0.875rem;
          font-weight: 500;
          color: #6b7280;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
        }

        .finance-tab:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .finance-tab.active {
          background: #10b981;
          color: white;
        }

        .finance-tab-badge {
          background: #ef4444;
          color: white;
          padding: 0.125rem 0.5rem;
          border-radius: 10px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .finance-tab.active .finance-tab-badge {
          background: white;
          color: #ef4444;
        }

        /* Schedule Styles */
        .finance-schedule {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .schedule-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .schedule-metric-card {
          background: white;
          border-radius: 12px;
          padding: 1rem 1.25rem;
          border: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .schedule-metric-card.overdue {
          background: #fef2f2;
          border-color: #fecaca;
        }

        .schedule-metric-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .schedule-metric-icon.subscriptions {
          background: #eff6ff;
          color: #3b82f6;
        }

        .schedule-metric-icon.expected {
          background: #ecfdf5;
          color: #10b981;
        }

        .schedule-metric-icon.annual {
          background: #faf5ff;
          color: #8b5cf6;
        }

        .schedule-metric-icon.overdue-icon {
          background: #fee2e2;
          color: #ef4444;
        }

        .schedule-metric-content {
          display: flex;
          flex-direction: column;
        }

        .schedule-metric-value {
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
        }

        .schedule-metric-label {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .schedule-section {
          background: white;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .schedule-section.overdue-section {
          border-color: #fecaca;
        }

        .schedule-section-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }

        .overdue-section .schedule-section-header {
          background: #fef2f2;
          border-bottom-color: #fecaca;
          color: #dc2626;
        }

        .schedule-section-header h3 {
          font-size: 0.9375rem;
          font-weight: 600;
          color: #374151;
          margin: 0;
          flex: 1;
        }

        .overdue-section .schedule-section-header h3 {
          color: #dc2626;
        }

        .schedule-count {
          background: #e5e7eb;
          padding: 0.25rem 0.625rem;
          border-radius: 10px;
          font-size: 0.75rem;
          font-weight: 600;
          color: #374151;
        }

        .overdue-section .schedule-count {
          background: #fee2e2;
          color: #dc2626;
        }

        .schedule-list {
          display: flex;
          flex-direction: column;
        }

        .schedule-item {
          display: grid;
          grid-template-columns: 1fr 150px 150px;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #f3f4f6;
          align-items: center;
        }

        .schedule-item:last-child {
          border-bottom: none;
        }

        .schedule-item.overdue {
          background: #fef2f2;
        }

        .schedule-item-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .schedule-item-chapter {
          display: flex;
          flex-direction: column;
        }

        .schedule-chapter-name {
          font-weight: 500;
          color: #111827;
        }

        .schedule-chapter-school {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .schedule-item-center {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .schedule-amount {
          font-weight: 600;
          color: #10b981;
          font-size: 1rem;
        }

        .schedule-type {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .schedule-item-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .schedule-days-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 10px;
          font-size: 0.75rem;
          font-weight: 500;
          background: #ecfdf5;
          color: #10b981;
        }

        .schedule-days-badge.soon {
          background: #fffbeb;
          color: #f59e0b;
        }

        .schedule-overdue-badge {
          padding: 0.25rem 0.75rem;
          border-radius: 10px;
          font-size: 0.75rem;
          font-weight: 500;
          background: #fee2e2;
          color: #dc2626;
        }

        .schedule-date {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-top: 0.25rem;
        }

        .schedule-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem 2rem;
          color: #9ca3af;
          text-align: center;
        }

        .schedule-empty svg {
          margin-bottom: 0.75rem;
          opacity: 0.5;
        }

        .schedule-empty p {
          margin: 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .schedule-empty span {
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }

        .schedule-table-container {
          overflow-x: auto;
        }

        .schedule-table {
          width: 100%;
          border-collapse: collapse;
        }

        .schedule-table th {
          text-align: left;
          padding: 0.875rem 1rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .schedule-table td {
          padding: 0.875rem 1rem;
          font-size: 0.875rem;
          color: #374151;
          border-bottom: 1px solid #f3f4f6;
        }

        .schedule-table tr:last-child td {
          border-bottom: none;
        }

        .schedule-table tr:hover td {
          background: #f9fafb;
        }

        .schedule-table tr.overdue-row td {
          background: #fef2f2;
        }

        .schedule-table-chapter {
          display: flex;
          flex-direction: column;
        }

        .schedule-table-chapter .chapter-name {
          font-weight: 500;
          color: #111827;
        }

        .schedule-table-chapter .chapter-school {
          font-size: 0.75rem;
          color: #9ca3af;
        }

        .schedule-table-amount {
          font-weight: 600;
          color: #10b981;
        }

        .schedule-table-day {
          color: #6b7280;
        }

        .schedule-type-badge {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .schedule-type-badge.monthly {
          background: #eff6ff;
          color: #3b82f6;
        }

        .schedule-type-badge.annual {
          background: #faf5ff;
          color: #8b5cf6;
        }

        .schedule-type-badge.one_time {
          background: #f3f4f6;
          color: #6b7280;
        }

        .chapter-status-badge {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .chapter-status-badge.active {
          background: #ecfdf5;
          color: #10b981;
        }

        .chapter-status-badge.onboarding {
          background: #eff6ff;
          color: #3b82f6;
        }

        .chapter-status-badge.at_risk {
          background: #fffbeb;
          color: #f59e0b;
        }

        .chapter-status-badge.churned {
          background: #f3f4f6;
          color: #6b7280;
        }

        .overdue-date {
          color: #dc2626;
          font-weight: 500;
        }

        /* Subscription Setup in Record Payment Modal */
        .subscription-setup {
          margin-top: 0.5rem;
          padding-top: 1rem;
          border-top: 1px dashed #e5e7eb;
        }

        .subscription-setup-toggle {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .subscription-toggle-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
        }

        .subscription-toggle-label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: #10b981;
          cursor: pointer;
        }

        .subscription-toggle-label svg {
          color: #10b981;
        }

        .subscription-setup-hint {
          font-size: 0.75rem;
          color: #9ca3af;
          margin-left: 1.625rem;
        }

        .subscription-setup-fields {
          margin-top: 1rem;
          padding: 1rem;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 10px;
        }

        .subscription-setup-fields .finance-form-row {
          margin-bottom: 0;
        }

        /* Confirmations Banner */
        .confirmations-banner {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .confirmation-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-radius: 10px;
          font-size: 0.875rem;
          color: #065f46;
        }

        .confirmation-item svg {
          flex-shrink: 0;
          color: #10b981;
        }

        .confirmation-item span {
          flex: 1;
        }

        .confirmation-undo-btn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          background: white;
          border: 1px solid #a7f3d0;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #065f46;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .confirmation-undo-btn:hover {
          background: #d1fae5;
          border-color: #6ee7b7;
        }

        /* Schedule item with action column */
        .schedule-item.has-action {
          grid-template-columns: 1fr 150px 150px auto;
        }

        .schedule-item-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        .schedule-confirm-btn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 1rem;
          background: #10b981;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .schedule-confirm-btn:hover {
          background: #059669;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
          transform: translateY(-1px);
        }

        .schedule-confirm-btn:active {
          transform: translateY(0);
        }

        .schedule-confirm-btn.upcoming {
          background: white;
          color: #10b981;
          border: 1px solid #d1fae5;
        }

        .schedule-confirm-btn.upcoming:hover {
          background: #ecfdf5;
          border-color: #10b981;
        }

        /* Confirm Payment Modal */
        .confirm-payment-modal {
          background: white;
          border-radius: 20px;
          width: 100%;
          max-width: 420px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
        }

        .confirm-modal-top {
          padding: 2rem 1.5rem 1.25rem;
          text-align: center;
          border-bottom: 1px solid #f3f4f6;
        }

        .confirm-modal-icon-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 56px;
          height: 56px;
          border-radius: 16px;
          background: #ecfdf5;
          color: #10b981;
          margin-bottom: 1rem;
        }

        .confirm-modal-top h2 {
          font-size: 1.25rem;
          font-weight: 700;
          color: #111827;
          margin: 0 0 0.375rem 0;
        }

        .confirm-modal-subtitle {
          font-size: 0.875rem;
          color: #6b7280;
          margin: 0 0 0.75rem 0;
        }

        .confirm-modal-amount {
          font-size: 1.75rem;
          font-weight: 700;
          color: #10b981;
        }

        .confirm-modal-body {
          padding: 1.25rem 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .confirm-form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .confirm-form-group label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #374151;
        }

        .confirm-form-group select,
        .confirm-form-group input {
          padding: 0.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          font-size: 0.875rem;
          color: #374151;
          transition: all 0.2s;
        }

        .confirm-form-group select:focus,
        .confirm-form-group input:focus {
          outline: none;
          border-color: #10b981;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
        }

        .confirm-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          padding: 1.25rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .confirm-payment-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 0.875rem;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .confirm-payment-btn:hover {
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
          transform: translateY(-1px);
        }

        .confirm-payment-btn:active {
          transform: translateY(0);
        }

        /* Expand button in subscriptions table */
        .schedule-table-expand {
          width: 40px;
          padding: 0.875rem 0.5rem 0.875rem 1rem !important;
        }

        .expand-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: #9ca3af;
          cursor: pointer;
          transition: all 0.2s;
        }

        .expand-btn:hover {
          background: #f3f4f6;
          color: #374151;
        }

        .expand-btn.expanded {
          color: #10b981;
          transform: rotate(90deg);
        }

        .expanded-row td {
          border-bottom-color: transparent !important;
        }

        /* Payment History Expansion */
        .history-expansion-row td {
          padding: 0 !important;
          background: #f9fafb;
        }

        .chapter-history-panel {
          padding: 0.75rem 1.25rem 1.25rem;
          margin: 0 1rem 0.75rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
        }

        .chapter-history-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding-bottom: 0.75rem;
          margin-bottom: 0.75rem;
          border-bottom: 1px solid #f3f4f6;
          font-size: 0.8125rem;
          font-weight: 600;
          color: #374151;
        }

        .chapter-history-header svg {
          color: #6b7280;
        }

        .chapter-history-empty {
          padding: 1.5rem;
          text-align: center;
          color: #9ca3af;
          font-size: 0.8125rem;
        }

        .chapter-history-table {
          width: 100%;
          border-collapse: collapse;
        }

        .chapter-history-table th {
          text-align: left;
          padding: 0.5rem 0.75rem;
          font-size: 0.6875rem;
          font-weight: 600;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px solid #f3f4f6;
        }

        .chapter-history-table td {
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
          color: #374151;
          border-bottom: 1px solid #f9fafb;
        }

        .chapter-history-table tr:last-child td {
          border-bottom: none;
        }

        .history-notes {
          color: #9ca3af;
          font-size: 0.75rem;
          max-width: 200px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Method Badge */
        .method-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.25rem 0.625rem;
          background: #f3f4f6;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #6b7280;
        }

        .method-badge.small {
          padding: 0.125rem 0.5rem;
          font-size: 0.6875rem;
        }

        /* Paid Complete Badge (one-time) */
        .paid-complete-badge {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          background: #ecfdf5;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          color: #10b981;
        }

        @media (max-width: 1024px) {
          .finance-metrics {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .finance-page {
            padding: 1rem;
          }

          .finance-header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
          }

          .finance-metrics {
            grid-template-columns: 1fr;
          }

          .finance-filters {
            flex-direction: column;
            align-items: stretch;
          }

          .finance-search {
            max-width: none;
          }

          .finance-filter-group {
            flex-direction: column;
          }

          .finance-time-selector {
            width: 100%;
            overflow-x: auto;
          }

          .finance-table-container {
            overflow-x: auto;
          }

          .finance-table {
            min-width: 700px;
          }

          .finance-form-row {
            grid-template-columns: 1fr;
          }

          .finance-form-group.full {
            grid-column: span 1;
          }

          .finance-tabs {
            width: 100%;
          }

          .schedule-item {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }

          .schedule-item.has-action {
            grid-template-columns: 1fr;
          }

          .schedule-item-center,
          .schedule-item-right {
            align-items: flex-start;
          }

          .schedule-item-actions {
            justify-content: flex-start;
          }

          .schedule-table {
            min-width: 900px;
          }
        }
      `}</style>
    </div>
  );
}
