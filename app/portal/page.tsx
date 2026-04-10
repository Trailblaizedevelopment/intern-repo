'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { 
  Employee, 
  ROLE_LABELS, 
  ROLE_PERMISSIONS 
} from '@/lib/supabase';
import {
  CheckCircle2,
  Circle,
  Clock,
  Mail,
  ArrowRight,
  Plus,
  Star,
  Target,
  TrendingUp,
  Calendar,
  Sparkles,
  Sun,
  CloudSun,
  Moon,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Send,
  UserPlus,
  CheckSquare,
  X,
  Check,
  Flame
} from 'lucide-react';

interface EmployeeTask {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'done';
  due_date: string;
}

interface PersonalLead {
  id: string;
  name: string;
  organization: string;
  status: string;
  last_contact: string;
}

interface PortalMessage {
  id: string;
  subject: string;
  sender_name?: string;
  sent_at: string;
  is_read: boolean;
}

interface DailyGoal {
  id: string;
  goals: string[];
  completed_goals: string[];
  mood: string;
  planned_focus_minutes: number;
  actual_focus_minutes: number;
}

export default function PortalDashboard() {
  const { profile, user } = useAuth();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [leads, setLeads] = useState<PersonalLead[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<PortalMessage[]>([]);
  const [dailyGoal, setDailyGoal] = useState<DailyGoal | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Focus timer state
  const [focusTime, setFocusTime] = useState(25 * 60); // 25 minutes in seconds
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [streak, setStreak] = useState(0);
  
  // New task quick add
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  
  // Greeting
  const [greeting, setGreeting] = useState('');
  const [greetingIcon, setGreetingIcon] = useState<React.ReactNode>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      setGreeting('Good morning');
      setGreetingIcon(<Sun size={24} />);
    } else if (hour < 17) {
      setGreeting('Good afternoon');
      setGreetingIcon(<CloudSun size={24} />);
    } else {
      setGreeting('Good evening');
      setGreetingIcon(<Moon size={24} />);
    }
    
    fetchEmployeeData();
  }, [user]);

  useEffect(() => {
    if (currentEmployee) {
      fetchTasks();
      fetchLeads();
      fetchMessages();
      fetchDailyGoal();
    }
  }, [currentEmployee]);

  // Focus timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && focusTime > 0) {
      interval = setInterval(() => {
        setFocusTime(prev => prev - 1);
      }, 1000);
    } else if (focusTime === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      setStreak(prev => prev + 1);
      // Could play a sound or show notification here
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, focusTime]);

  async function fetchEmployeeData() {
    if (!user) {
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/employees?email=${encodeURIComponent(user.email ?? '')}`);
    const result = await res.json();
    let data = result.data?.[0] ?? null;

    if (!data) {
      // Fallback: first active employee (demo mode)
      const fallbackRes = await fetch('/api/employees?status=active');
      const fallbackResult = await fallbackRes.json();
      data = fallbackResult.data?.[0] ?? null;
    }

    if (data) {
      setCurrentEmployee(data);
    }
    setLoading(false);
  }

  async function fetchTasks() {
    if (!currentEmployee) return;
    const params = new URLSearchParams({
      employee_id: currentEmployee.id,
      exclude_done: 'true',
      order_by: 'due_date',
      limit: '5',
    });
    const res = await fetch(`/api/portal/tasks?${params}`);
    const result = await res.json();
    setTasks(result.data || []);
  }

  async function fetchLeads() {
    if (!currentEmployee) return;
    const perms = ROLE_PERMISSIONS[currentEmployee.role] || [];
    if (!perms.includes('personal_leads') && !perms.includes('all')) return;

    const params = new URLSearchParams({
      employee_id: currentEmployee.id,
      exclude_statuses: 'converted,lost',
      order_by: 'last_contact',
      limit: '5',
    });
    const res = await fetch(`/api/portal/leads?${params}`);
    const result = await res.json();
    setLeads(result.data || []);
  }

  async function fetchMessages() {
    if (!currentEmployee) return;
    const params = new URLSearchParams({
      employee_id: currentEmployee.id,
      tab: 'inbox',
      is_read: 'false',
      limit: '3',
    });
    const res = await fetch(`/api/portal/messages?${params}`);
    const result = await res.json();
    setUnreadMessages(result.data || []);
  }

  async function fetchDailyGoal() {
    // portal_daily_goals doesn't have a dedicated API yet — skip for now
    // This table has no RLS-sensitive data; keeping as no-op until route is added
    setDailyGoal(null);
  }

  async function toggleTask(task: EmployeeTask) {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    await fetch(`/api/portal/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchTasks();
  }

  async function createQuickTask() {
    if (!currentEmployee || !quickTaskTitle.trim()) return;
    await fetch('/api/portal/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_id: currentEmployee.id,
        title: quickTaskTitle,
        priority: 'medium',
      }),
    });
    setQuickTaskTitle('');
    setShowQuickTask(false);
    fetchTasks();
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const resetTimer = () => {
    setFocusTime(25 * 60);
    setIsTimerRunning(false);
  };

  // Stats calculations
  const todaysTasks = tasks.length;
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;
  const activeleads = leads.length;
  const unreadCount = unreadMessages.length;

  const hasLeadsPermission = currentEmployee && 
    (ROLE_PERMISSIONS[currentEmployee.role]?.includes('personal_leads') || 
     ROLE_PERMISSIONS[currentEmployee.role]?.includes('all'));

  if (loading) {
    return (
      <div className="portal-loading">
        <div className="portal-loading-spinner" />
        <p>Loading your workspace...</p>
      </div>
    );
  }

  const firstName = currentEmployee?.name?.split(' ')[0] || profile?.name?.split(' ')[0] || 'there';

  return (
    <div className="portal-dashboard">
      {/* Welcome Header */}
      <header className="portal-welcome">
        <div className="portal-welcome-content">
          <div className="portal-welcome-icon">{greetingIcon}</div>
          <div className="portal-welcome-text">
            <h1>{greeting}, {firstName}</h1>
            <p>
              {currentEmployee ? (
                <>You&apos;re logged in as <strong>{ROLE_LABELS[currentEmployee.role]}</strong></>
              ) : (
                'Ready to make progress today?'
              )}
            </p>
          </div>
        </div>
        <div className="portal-welcome-date">
          <Calendar size={16} />
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        </div>
      </header>

      {/* Quick Stats */}
      <div className="portal-stats-grid">
        <div className="portal-stat-card">
          <div className="portal-stat-icon" style={{ background: '#dbeafe', color: '#2563eb' }}>
            <CheckSquare size={20} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-value">{todaysTasks}</span>
            <span className="portal-stat-label">Open Tasks</span>
          </div>
        </div>
        
        <div className="portal-stat-card">
          <div className="portal-stat-icon" style={{ background: '#fee2e2', color: '#dc2626' }}>
            <Clock size={20} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-value">{overdueTasks}</span>
            <span className="portal-stat-label">Overdue</span>
          </div>
        </div>
        
        <div className="portal-stat-card">
          <div className="portal-stat-icon" style={{ background: '#dcfce7', color: '#16a34a' }}>
            <Mail size={20} />
          </div>
          <div className="portal-stat-info">
            <span className="portal-stat-value">{unreadCount}</span>
            <span className="portal-stat-label">Unread</span>
          </div>
        </div>

        {hasLeadsPermission && (
          <div className="portal-stat-card">
            <div className="portal-stat-icon" style={{ background: '#fef3c7', color: '#d97706' }}>
              <Target size={20} />
            </div>
            <div className="portal-stat-info">
              <span className="portal-stat-value">{activeleads}</span>
              <span className="portal-stat-label">Active Leads</span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="portal-main-grid">
        {/* Left Column */}
        <div className="portal-col-main">
          {/* Today's Tasks */}
          <section className="portal-card">
            <div className="portal-card-header">
              <h2>
                <CheckSquare size={18} />
                Today&apos;s Tasks
              </h2>
              <div className="portal-card-actions">
                <button 
                  className="portal-add-btn"
                  onClick={() => setShowQuickTask(true)}
                >
                  <Plus size={16} />
                  Add Task
                </button>
              </div>
            </div>

            {showQuickTask && (
              <div className="portal-quick-add">
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createQuickTask()}
                  autoFocus
                />
                <button className="portal-quick-add-confirm" onClick={createQuickTask}>
                  <Check size={16} />
                </button>
                <button className="portal-quick-add-cancel" onClick={() => setShowQuickTask(false)}>
                  <X size={16} />
                </button>
              </div>
            )}

            <div className="portal-task-list">
              {tasks.length === 0 ? (
                <div className="portal-empty">
                  <Sparkles size={32} />
                  <p>No tasks for today. Nice work!</p>
                </div>
              ) : (
                tasks.map(task => (
                  <div key={task.id} className={`portal-task-item priority-${task.priority}`}>
                    <button 
                      className="portal-task-check"
                      onClick={() => toggleTask(task)}
                    >
                      <Circle size={18} />
                    </button>
                    <div className="portal-task-content">
                      <span className="portal-task-title">{task.title}</span>
                      {task.due_date && (
                        <span className={`portal-task-due ${new Date(task.due_date) < new Date() ? 'overdue' : ''}`}>
                          <Clock size={12} />
                          {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <span className={`portal-task-priority ${task.priority}`}>
                      {task.priority}
                    </span>
                  </div>
                ))
              )}
            </div>

            <Link href="/portal/tasks" className="portal-card-link">
              View All Tasks
              <ArrowRight size={14} />
            </Link>
          </section>

          {/* Inbox Preview */}
          <section className="portal-card">
            <div className="portal-card-header">
              <h2>
                <Mail size={18} />
                Inbox
                {unreadCount > 0 && (
                  <span className="portal-badge">{unreadCount} new</span>
                )}
              </h2>
            </div>

            <div className="portal-inbox-list">
              {unreadMessages.length === 0 ? (
                <div className="portal-empty">
                  <CheckCircle2 size={32} />
                  <p>You&apos;re all caught up!</p>
                </div>
              ) : (
                unreadMessages.map(msg => (
                  <div key={msg.id} className="portal-inbox-item">
                    <div className="portal-inbox-avatar">
                      {msg.sender_name?.charAt(0) || '?'}
                    </div>
                    <div className="portal-inbox-content">
                      <span className="portal-inbox-sender">{msg.sender_name}</span>
                      <span className="portal-inbox-subject">{msg.subject}</span>
                    </div>
                    <span className="portal-inbox-time">
                      {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>

            <Link href="/portal/inbox" className="portal-card-link">
              Open Inbox
              <ArrowRight size={14} />
            </Link>
          </section>
        </div>

        {/* Right Column */}
        <div className="portal-col-side">
          {/* Focus Timer */}
          <section className="portal-card portal-focus-card">
            <div className="portal-card-header">
              <h2>
                <Target size={18} />
                Focus Time
              </h2>
              {streak > 0 && (
                <span className="portal-streak">
                  <Flame size={14} />
                  {streak} streak
                </span>
              )}
            </div>

            <div className="portal-focus-timer">
              <div className={`portal-timer-display ${isTimerRunning ? 'running' : ''}`}>
                {formatTime(focusTime)}
              </div>
              <div className="portal-timer-controls">
                <button 
                  className={`portal-timer-btn ${isTimerRunning ? 'pause' : 'play'}`}
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                >
                  {isTimerRunning ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <button 
                  className="portal-timer-btn reset"
                  onClick={resetTimer}
                >
                  <RotateCcw size={18} />
                </button>
              </div>
              <p className="portal-focus-tip">
                25 minutes of focused work
              </p>
            </div>
          </section>

          {/* My Leads (Role-based) */}
          {hasLeadsPermission && leads.length > 0 && (
            <section className="portal-card">
              <div className="portal-card-header">
                <h2>
                  <UserPlus size={18} />
                  My Leads
                </h2>
              </div>

              <div className="portal-leads-list">
                {leads.slice(0, 4).map(lead => (
                  <div key={lead.id} className="portal-lead-item">
                    <div className="portal-lead-info">
                      <span className="portal-lead-name">{lead.name}</span>
                      <span className="portal-lead-org">{lead.organization}</span>
                    </div>
                    <span className={`portal-lead-status status-${lead.status}`}>
                      {lead.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>

              <Link href="/portal/leads" className="portal-card-link">
                View All Leads
                <ArrowRight size={14} />
              </Link>
            </section>
          )}

          {/* Quick Actions */}
          <section className="portal-card">
            <div className="portal-card-header">
              <h2>
                <Sparkles size={18} />
                Quick Actions
              </h2>
            </div>

            <div className="portal-quick-actions">
              <button className="portal-action-btn" onClick={() => setShowQuickTask(true)}>
                <Plus size={16} />
                New Task
              </button>
              <Link href="/portal/inbox?compose=true" className="portal-action-btn">
                <Send size={16} />
                Compose
              </Link>
              {hasLeadsPermission && (
                <Link href="/portal/leads?add=true" className="portal-action-btn">
                  <UserPlus size={16} />
                  Add Lead
                </Link>
              )}
              <Link href="/portal/projects" className="portal-action-btn">
                <TrendingUp size={16} />
                Projects
              </Link>
            </div>
          </section>

          {/* Recent Activity */}
          <section className="portal-card">
            <div className="portal-card-header">
              <h2>
                <Star size={18} />
                Recent Activity
              </h2>
            </div>

            <div className="portal-activity-list">
              <div className="portal-activity-item">
                <div className="portal-activity-dot" style={{ background: '#10b981' }} />
                <div className="portal-activity-content">
                  <span>Completed task &quot;Review Q4 metrics&quot;</span>
                  <span className="portal-activity-time">2 hours ago</span>
                </div>
              </div>
              <div className="portal-activity-item">
                <div className="portal-activity-dot" style={{ background: '#3b82f6' }} />
                <div className="portal-activity-content">
                  <span>New message from team</span>
                  <span className="portal-activity-time">4 hours ago</span>
                </div>
              </div>
              <div className="portal-activity-item">
                <div className="portal-activity-dot" style={{ background: '#f59e0b' }} />
                <div className="portal-activity-content">
                  <span>Lead status updated</span>
                  <span className="portal-activity-time">Yesterday</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
