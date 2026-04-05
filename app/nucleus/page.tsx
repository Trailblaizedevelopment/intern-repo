'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { 
  Users, 
  TrendingUp, 
  CheckSquare, 
  ArrowRight,
  ArrowUp,
  ArrowDown,
  DollarSign,
  GraduationCap,
  HeartHandshake,
  Building2,
  Rocket,
  LogOut,
  Shield,
  Clock,
  Flame,
  Target,
  AlertTriangle,
  CheckCircle,
  Activity,
  Star,
  Zap,
  Wallet,
  LayoutDashboard
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ModuleStats {
  employees: {
    total: number;
    active: number;
    onboarding: number;
    newThisWeek: number;
  };
  fundraising: {
    total: number;
    hot: number;
    needsFollowup: number;
    investors: number;
  };
  pipeline: {
    value: number;
    active: number;
    wonThisMonth: number;
    avgDealSize: number;
  };
  operations: {
    open: number;
    inProgress: number;
    dueToday: number;
    completed: number;
  };
  customerSuccess: {
    total: number;
    active: number;
    onboarding: number;
    mrr: number;
  };
  enterprise: {
    active: number;
    inNegotiation: number;
    value: number;
    pending: number;
  };
  finance: {
    activeSubscriptions: number;
    expectedThisMonth: number;
    annualCommitments: number;
    upcomingCount: number;
  };
}

export default function Nucleus() {
  const { profile, signOut, isAdmin } = useAuth();
  const [stats, setStats] = useState<ModuleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [outreachStats, setOutreachStats] = useState<{
    chapters: { id: string; name: string; school: string; total: number; contacted: number; responded: number; signed_up: number; touch1_ready: number; touch2_due: number; touch3_due: number }[];
    totals: { sends_today: number; responses_today: number; signups_today: number; followups_due: number };
  } | null>(null);

  // Fetch all stats on mount
  useEffect(() => {
    fetchAllStats();
  }, []);

  async function fetchOutreachOverview() {
    if (!supabase) return;
    try {
      // Get all chapters with alumni
      const { data: chapters } = await supabase.from('chapters').select('id, chapter_name, school');
      if (!chapters) return;

      const chapterStats = await Promise.all(
        chapters.map(async (ch) => {
          const res = await fetch(`/api/alumni/stats?chapter_id=${ch.id}`);
          const json = await res.json();
          if (!json.data || json.data.total === 0) return null;
          return {
            id: ch.id,
            name: ch.chapter_name,
            school: ch.school || '',
            total: json.data.total,
            contacted: json.data.contacted,
            responded: json.data.responded,
            signed_up: json.data.signed_up,
            touch1_ready: json.data.touch1_ready,
            touch2_due: json.data.touch2_due,
            touch3_due: json.data.touch3_due,
          };
        })
      );

      const active = chapterStats.filter(Boolean) as NonNullable<typeof chapterStats[number]>[];
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      // Get today's daily log
      const { data: todayLog } = await supabase
        .from('outreach_daily_log')
        .select('sends_count, responses_count, signups_count')
        .gte('date', todayStart.toISOString().split('T')[0]);

      const sends_today = (todayLog || []).reduce((s, r) => s + (r.sends_count || 0), 0);
      const responses_today = (todayLog || []).reduce((s, r) => s + (r.responses_count || 0), 0);
      const signups_today = (todayLog || []).reduce((s, r) => s + (r.signups_count || 0), 0);
      const followups_due = active.reduce((s, ch) => s + ch.touch2_due + ch.touch3_due, 0);

      setOutreachStats({
        chapters: active.sort((a, b) => (b.touch1_ready + b.touch2_due + b.touch3_due) - (a.touch1_ready + a.touch2_due + a.touch3_due)),
        totals: { sends_today, responses_today, signups_today, followups_due },
      });
    } catch (err) {
      console.error('Failed to fetch outreach overview:', err);
    }
  }

  async function fetchAllStats() {
    if (!supabase) {
      setLoading(false);
      return;
    }

    try {
      const [
        employeesRes,
        contactsRes,
        dealsApiRes,
        tasksRes,
        chaptersRes,
        contractsRes
      ] = await Promise.all([
        supabase.from('employees').select('*'),
        supabase.from('network_contacts').select('*'),
        fetch('/api/pipeline/deals').then(r => r.ok ? r.json() : []),
        supabase.from('tasks').select('*'),
        supabase.from('chapters').select('*'),
        supabase.from('enterprise_contracts').select('*')
      ]);

      const employees = employeesRes.data || [];
      const contacts = contactsRes.data || [];
      const deals = Array.isArray(dealsApiRes) ? dealsApiRes : [];
      const tasks = tasksRes.data || [];
      const chapters = chaptersRes.data || [];
      const contracts = contractsRes.data || [];

      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const today = now.toDateString();

      setStats({
        employees: {
          total: employees.length,
          active: employees.filter(e => e.status === 'active').length,
          onboarding: employees.filter(e => e.status === 'onboarding').length,
          newThisWeek: employees.filter(e => new Date(e.start_date) >= weekAgo).length,
        },
        fundraising: {
          total: contacts.length,
          hot: contacts.filter(c => c.priority === 'hot').length,
          needsFollowup: contacts.filter(c => c.next_followup_date && new Date(c.next_followup_date) <= now).length,
          investors: contacts.filter(c => ['investor', 'angel', 'vc'].includes(c.contact_type)).length,
        },
        pipeline: {
          value: deals.filter(d => !['closed_lost', 'hold_off'].includes(d.stage)).reduce((sum, d) => sum + (d.value || 0), 0),
          active: deals.filter(d => !['closed_won', 'closed_lost', 'hold_off'].includes(d.stage)).length,
          wonThisMonth: deals.filter(d => {
            if (d.stage !== 'closed_won') return false;
            const created = new Date(d.created_at);
            return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
          }).length,
          avgDealSize: (() => {
            const relevantDeals = deals.filter(d => !['closed_lost', 'hold_off'].includes(d.stage));
            return relevantDeals.length > 0 ? relevantDeals.reduce((sum, d) => sum + (d.value || 0), 0) / relevantDeals.length : 0;
          })(),
        },
        operations: {
          open: tasks.filter(t => t.status === 'todo').length,
          inProgress: tasks.filter(t => t.status === 'in_progress').length,
          dueToday: tasks.filter(t => t.due_date && new Date(t.due_date).toDateString() === today).length,
          completed: tasks.filter(t => t.status === 'done').length,
        },
        customerSuccess: {
          total: chapters.length,
          active: chapters.filter(c => c.status === 'active').length,
          onboarding: chapters.filter(c => c.status === 'onboarding').length,
          mrr: chapters.reduce((sum, c) => sum + (c.mrr || 0), 0),
        },
        enterprise: {
          active: contracts.filter(c => c.stage === 'signed').length,
          inNegotiation: contracts.filter(c => ['negotiation', 'contract_sent'].includes(c.stage)).length,
          value: contracts.filter(c => c.stage === 'signed').reduce((sum, c) => sum + (c.value || 0), 0),
          pending: contracts.filter(c => c.stage === 'contract_sent').length,
        },
        finance: (() => {
          // Calculate from chapter subscription data (Stripe info)
          const chaptersWithPayments = chapters.filter((c: { payment_day?: number; payment_start_date?: string; next_payment_date?: string }) => 
            c.payment_day || c.payment_start_date || c.next_payment_date
          );
          const activeSubscriptions = chaptersWithPayments.filter((c: { status: string }) => c.status === 'active').length;
          
          // Upcoming payments this month
          const upcomingThisMonth = chaptersWithPayments.filter((c: { next_payment_date?: string }) => {
            if (!c.next_payment_date) return false;
            const nextDate = new Date(c.next_payment_date);
            return nextDate.getMonth() === now.getMonth() && nextDate.getFullYear() === now.getFullYear() && nextDate >= now;
          });
          const expectedThisMonth = upcomingThisMonth.reduce((sum: number, c: { payment_amount?: number }) => sum + (c.payment_amount || 0), 0);
          
          // Annual commitments
          const annualCommitments = chaptersWithPayments
            .filter((c: { payment_type?: string; status: string }) => c.payment_type === 'annual' && c.status === 'active')
            .reduce((sum: number, c: { payment_amount?: number }) => sum + (c.payment_amount || 0), 0);
          
          return {
            activeSubscriptions,
            expectedThisMonth,
            annualCommitments,
            upcomingCount: upcomingThisMonth.length,
          };
        })(),
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: number): string {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toFixed(0)}`;
  }

  // Calculate company-wide stats
  const companyStats = [
    { 
      label: 'Total MRR', 
      value: stats ? formatCurrency(stats.customerSuccess.mrr) : '—',
      icon: DollarSign,
      color: '#10b981',
      trend: '+12%'
    },
    { 
      label: 'Pipeline', 
      value: stats ? formatCurrency(stats.pipeline.value) : '—',
      icon: TrendingUp,
      color: '#f59e0b',
      trend: '+8%'
    },
    { 
      label: 'Active Chapters', 
      value: stats?.customerSuccess.active ?? '—',
      icon: GraduationCap,
      color: '#8b5cf6',
      trend: '+2'
    },
    { 
      label: 'Team Size', 
      value: stats?.employees.active ?? '—',
      icon: Users,
      color: '#3b82f6',
      trend: null
    },
  ];

  const modules = [
    {
      title: 'Sales Pipeline',
      description: 'Track deals and manage opportunities.',
      icon: TrendingUp,
      href: '/nucleus/pipeline',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      stats: stats?.pipeline ? [
        { label: 'Pipeline', value: formatCurrency(stats.pipeline.value), icon: DollarSign },
        { label: 'Active', value: stats.pipeline.active, icon: Activity, color: '#3b82f6' },
        { label: 'Won', value: stats.pipeline.wonThisMonth, icon: CheckCircle, color: '#10b981' },
      ] : [],
      highlight: stats?.pipeline.avgDealSize ? { 
        text: `${formatCurrency(stats.pipeline.avgDealSize)} avg deal`, 
        type: 'info' 
      } : null,
    },
    {
      title: 'Customer Success',
      description: 'Track chapter onboarding and health.',
      icon: HeartHandshake,
      href: '/nucleus/customer-success',
      color: '#ec4899',
      gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
      stats: stats?.customerSuccess ? [
        { label: 'Chapters', value: stats.customerSuccess.total, icon: GraduationCap },
        { label: 'Active', value: stats.customerSuccess.active, icon: CheckCircle, color: '#10b981' },
        { label: 'MRR', value: formatCurrency(stats.customerSuccess.mrr), icon: DollarSign, color: '#10b981' },
      ] : [],
      highlight: stats?.customerSuccess.onboarding ? { 
        text: `${stats.customerSuccess.onboarding} onboarding`, 
        type: 'info' 
      } : null,
    },
    {
      title: 'Finance',
      description: 'Track chapter payments and revenue.',
      icon: Wallet,
      href: '/nucleus/finance',
      color: '#10b981',
      gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      stats: stats?.finance ? [
        { label: 'Subscriptions', value: stats.finance.activeSubscriptions, icon: Activity },
        { label: 'This Month', value: formatCurrency(stats.finance.expectedThisMonth), icon: TrendingUp, color: '#10b981' },
        { label: 'Annual', value: formatCurrency(stats.finance.annualCommitments), icon: DollarSign, color: '#8b5cf6' },
      ] : [],
      highlight: stats?.finance.upcomingCount ? { 
        text: `${stats.finance.upcomingCount} payment${stats.finance.upcomingCount !== 1 ? 's' : ''} due this month`, 
        type: 'info' 
      } : null,
    },
    {
      title: 'Operations & Tasks',
      description: 'Coordinate activities and track progress.',
      icon: CheckSquare,
      href: '/nucleus/operations',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
      stats: stats?.operations ? [
        { label: 'Open', value: stats.operations.open, icon: CheckSquare },
        { label: 'In Progress', value: stats.operations.inProgress, icon: Activity, color: '#3b82f6' },
        { label: 'Done', value: stats.operations.completed, icon: CheckCircle, color: '#10b981' },
      ] : [],
      highlight: stats?.operations.dueToday ? { 
        text: `${stats.operations.dueToday} due today`, 
        type: stats.operations.dueToday > 0 ? 'warning' : 'success' 
      } : null,
    },
    {
      title: 'Enterprise Contracts',
      description: 'Manage IFCs and large partnerships.',
      icon: Building2,
      href: '/nucleus/enterprise',
      color: '#06b6d4',
      gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
      stats: stats?.enterprise ? [
        { label: 'Signed', value: stats.enterprise.active, icon: CheckCircle, color: '#10b981' },
        { label: 'Negotiating', value: stats.enterprise.inNegotiation, icon: Activity, color: '#f59e0b' },
        { label: 'Value', value: formatCurrency(stats.enterprise.value), icon: DollarSign },
      ] : [],
      highlight: stats?.enterprise.pending ? { 
        text: `${stats.enterprise.pending} pending signature`, 
        type: 'warning' 
      } : null,
    },
    {
      title: 'Fundraising & Network',
      description: 'Build relationships and manage your network.',
      icon: Rocket,
      href: '/nucleus/fundraising',
      color: '#10b981',
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      stats: stats?.fundraising ? [
        { label: 'Contacts', value: stats.fundraising.total, icon: Users },
        { label: 'Hot Leads', value: stats.fundraising.hot, icon: Flame, color: '#ef4444' },
        { label: 'Investors', value: stats.fundraising.investors, icon: Target, color: '#8b5cf6' },
      ] : [],
      highlight: stats?.fundraising.needsFollowup ? { 
        text: `${stats.fundraising.needsFollowup} need follow-up`, 
        type: stats.fundraising.needsFollowup > 0 ? 'warning' : 'success' 
      } : null,
    },
    {
      title: 'Employees & Onboarding',
      description: 'Manage team members and track onboarding progress.',
      icon: Users,
      href: '/nucleus/employees',
      color: '#3b82f6',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      stats: stats?.employees ? [
        { label: 'Total', value: stats.employees.total, icon: Users },
        { label: 'Active', value: stats.employees.active, icon: CheckCircle, color: '#10b981' },
        { label: 'Onboarding', value: stats.employees.onboarding, icon: Clock, color: '#f59e0b' },
      ] : [],
      highlight: stats?.employees.newThisWeek ? { 
        text: `${stats.employees.newThisWeek} new this week`, 
        type: 'success' 
      } : null,
    },
    {
      title: 'Ambassador Tracker',
      description: 'Track student ambassadors per school — contact, status, and notes.',
      icon: Star,
      href: '/nucleus/ambassadors',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      stats: [],
      highlight: null,
    },
  ];

  // Calculate urgent items for attention banner
  const urgentItems = [];
  if (stats?.fundraising.needsFollowup && stats.fundraising.needsFollowup > 0) {
    urgentItems.push({ text: `${stats.fundraising.needsFollowup} contacts need follow-up`, href: '/nucleus/fundraising' });
  }
  if (stats?.operations.dueToday && stats.operations.dueToday > 0) {
    urgentItems.push({ text: `${stats.operations.dueToday} tasks due today`, href: '/nucleus/operations' });
  }

  return (
    <div className="nucleus">
      {/* Main Content */}
      <main className="nucleus-main nucleus-main--compact">

        {/* Modules Grid */}
        <section className="nucleus-modules">
          <h2 className="nucleus-section-title">Modules</h2>
          <div className="nucleus-modules-grid">
            {modules.map((module, index) => (
              <Link key={index} href={module.href} className="nucleus-module-card-enhanced" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div 
                  className="nucleus-module-icon-enhanced" 
                  style={{ background: module.gradient, flexShrink: 0 }}
                >
                  <module.icon size={24} color="white" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 className="nucleus-module-title-enhanced" style={{ marginBottom: '2px' }}>{module.title}</h3>
                  <p className="nucleus-module-description-enhanced" style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280' }}>{module.description}</p>
                </div>
                <ArrowRight size={18} style={{ color: '#d1d5db', flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="nucleus-footer">
        <p>Trailblaize Nucleus · Internal Use Only</p>
      </footer>
    </div>
  );
}
