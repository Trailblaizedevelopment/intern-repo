'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Employee } from '@/lib/supabase';
import { useUserRole } from '../hooks/useUserRole';
import {
  CheckCircle2,
  Circle,
  Plus,
  Calendar,
  Clock,
  Trash2,
  Edit3,
  X,
  Check,
  AlertCircle,
  Flag,
  ListTodo,
  Inbox,
  CheckSquare,
  Users,
  User,
  Ticket,
  ChevronDown,
  ChevronRight,
  Trophy,
  Link2
} from 'lucide-react';
import ModalOverlay from '@/components/ModalOverlay';

interface Task {
  id: string;
  employee_id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'done';
  due_date: string | null;
  ticket_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  employee?: { id: string; name: string; email: string; role: string } | null;
  ticket?: { id: string; number: number; title: string; status: string } | null;
}

interface TicketOption {
  id: string;
  number: number;
  title: string;
  status: string;
}

type FilterType = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';
type SortType = 'due_date' | 'priority' | 'created_at';
type ViewScope = 'mine' | 'team';

export default function TasksPage() {
  const { user } = useAuth();
  const { roleLabel } = useUserRole();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weeklyCompleted, setWeeklyCompleted] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('due_date');
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewScope, setViewScope] = useState<ViewScope>('mine');
  const [showWeeklySummary, setShowWeeklySummary] = useState(true);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    due_date: '',
    category: 'general',
    ticket_id: ''
  });

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [tickets, setTickets] = useState<TicketOption[]>([]);

  const fetchEmployee = useCallback(async () => {
    if (!user) return;

    const res = await fetch(`/api/employees?email=${encodeURIComponent(user.email ?? '')}`);
    const result = await res.json();
    const data = result.data?.[0] ?? null;

    if (data) {
      setCurrentEmployee(data);
    } else {
      const fallbackRes = await fetch('/api/employees?status=active');
      const fallbackResult = await fallbackRes.json();
      if (fallbackResult.data?.[0]) setCurrentEmployee(fallbackResult.data[0]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const fetchTasks = useCallback(async () => {
    if (!currentEmployee) return;

    try {
      const params = new URLSearchParams();
      if (viewScope === 'mine') {
        params.set('employee_id', currentEmployee.id);
      }
      if (!showCompleted) {
        // Fetch non-done tasks; completed ones come from weekly summary
      }

      const res = await fetch(`/api/workspace/tasks?${params}`);
      const result = await res.json();

      if (result.error) {
        console.error('Error fetching tasks:', result.error);
        setError(result.error.message);
        return;
      }

      const allTasks: Task[] = result.data || [];
      if (!showCompleted) {
        setTasks(allTasks.filter(t => t.status !== 'done'));
      } else {
        setTasks(allTasks);
      }
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError('Failed to load tasks');
    }
  }, [currentEmployee, viewScope, showCompleted]);

  const fetchWeeklyCompleted = useCallback(async () => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    try {
      const params = new URLSearchParams({
        status: 'done',
        completed_since: monday.toISOString(),
      });
      const res = await fetch(`/api/workspace/tasks?${params}`);
      const result = await res.json();

      if (!result.error) {
        setWeeklyCompleted(result.data || []);
      }
    } catch (err) {
      console.error('Error fetching weekly completed:', err);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets?status=active');
      const result = await res.json();
      if (result.data) {
        setTickets(result.data.map((t: TicketOption) => ({
          id: t.id, number: t.number, title: t.title, status: t.status
        })));
      }
    } catch {
      // Tickets are optional, don't block on failure
    }
  }, []);

  useEffect(() => {
    if (currentEmployee) {
      fetchTasks();
      fetchWeeklyCompleted();
      fetchTickets();
    }
  }, [currentEmployee, fetchTasks, fetchWeeklyCompleted, fetchTickets]);

  async function createTask() {
    if (!currentEmployee || !newTask.title.trim()) return;

    try {
      const res = await fetch('/api/workspace/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: currentEmployee.id,
          title: newTask.title.trim(),
          description: newTask.description.trim() || null,
          priority: newTask.priority,
          due_date: newTask.due_date || null,
          category: newTask.category,
          ticket_id: newTask.ticket_id || null,
        }),
      });

      const result = await res.json();
      if (result.error) {
        setError(result.error.message);
        return;
      }

      setTasks(prev => [result.data, ...prev]);
      setNewTask({ title: '', description: '', priority: 'medium', due_date: '', category: 'general', ticket_id: '' });
      setShowNewTask(false);
      setError(null);
    } catch (err) {
      console.error('Error creating task:', err);
      setError('Failed to create task');
    }
  }

  async function updateTask() {
    if (!editingTask) return;

    try {
      const res = await fetch(`/api/workspace/tasks/${editingTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingTask.title,
          description: editingTask.description,
          priority: editingTask.priority,
          due_date: editingTask.due_date || null,
          category: editingTask.category,
          ticket_id: editingTask.ticket_id || null,
        }),
      });

      const result = await res.json();
      if (result.error) {
        setError(result.error.message);
        return;
      }

      setTasks(prev => prev.map(t => t.id === editingTask.id ? result.data : t));
      setEditingTask(null);
      setError(null);
    } catch (err) {
      console.error('Error updating task:', err);
      setError('Failed to update task');
    }
  }

  async function toggleTask(task: Task) {
    const newStatus = task.status === 'done' ? 'todo' : 'done';

    try {
      const res = await fetch(`/api/workspace/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await res.json();
      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (newStatus === 'done' && !showCompleted) {
        setTasks(prev => prev.filter(t => t.id !== task.id));
        setWeeklyCompleted(prev => [result.data, ...prev]);
      } else {
        setTasks(prev => prev.map(t => t.id === task.id ? result.data : t));
      }
    } catch (err) {
      console.error('Error toggling task:', err);
      setError('Failed to update task');
    }
  }

  async function deleteTask(task: Task) {
    try {
      const res = await fetch(`/api/workspace/tasks/${task.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (err) {
      console.error('Error deleting task:', err);
      setError('Failed to delete task');
    }
  }

  async function updateTaskStatus(task: Task, status: Task['status']) {
    try {
      const res = await fetch(`/api/workspace/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const result = await res.json();
      if (result.error) {
        setError(result.error.message);
        return;
      }

      if (status === 'done' && !showCompleted) {
        setTasks(prev => prev.filter(t => t.id !== task.id));
        setWeeklyCompleted(prev => [result.data, ...prev]);
      } else {
        setTasks(prev => prev.map(t => t.id === task.id ? result.data : t));
      }
    } catch (err) {
      console.error('Error updating task status:', err);
      setError('Failed to update task');
    }
  }

  const getFilteredTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    let filtered = [...tasks];

    switch (filter) {
      case 'today':
        filtered = filtered.filter(t => {
          if (!t.due_date) return false;
          const due = new Date(t.due_date);
          due.setHours(0, 0, 0, 0);
          return due.getTime() === today.getTime();
        });
        break;
      case 'upcoming':
        filtered = filtered.filter(t => {
          if (!t.due_date) return false;
          const due = new Date(t.due_date);
          return due >= today && due <= nextWeek;
        });
        break;
      case 'overdue':
        filtered = filtered.filter(t => {
          if (!t.due_date || t.status === 'done') return false;
          return new Date(t.due_date) < today;
        });
        break;
      case 'completed':
        filtered = filtered.filter(t => t.status === 'done');
        break;
    }

    filtered.sort((a, b) => {
      if (sortBy === 'priority') {
        const order = { urgent: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      }
      if (sortBy === 'due_date') {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return filtered;
  };

  const filteredTasks = getFilteredTasks();
  const todoTasks = filteredTasks.filter(t => t.status === 'todo');
  const inProgressTasks = filteredTasks.filter(t => t.status === 'in_progress');

  const overdueCount = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length;
  const todayCount = tasks.filter(t => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date);
    return due.toDateString() === new Date().toDateString() && t.status !== 'done';
  }).length;

  // Group weekly completed by employee
  const weeklyByEmployee = weeklyCompleted.reduce<Record<string, { name: string; tasks: Task[] }>>((acc, task) => {
    const name = task.employee?.name || 'Unknown';
    const key = task.employee_id;
    if (!acc[key]) acc[key] = { name, tasks: [] };
    acc[key].tasks.push(task);
    return acc;
  }, {});

  const priorityColors = {
    low: { bg: '#f3f4f6', text: '#6b7280' },
    medium: { bg: '#dbeafe', text: '#2563eb' },
    high: { bg: '#fef3c7', text: '#d97706' },
    urgent: { bg: '#fee2e2', text: '#dc2626' }
  };

  if (loading) {
    return (
      <div className="ws-loading">
        <div className="ws-loading-spinner" />
        <p>Loading tasks...</p>
      </div>
    );
  }

  return (
    <div className="ws-subpage">
      {/* Header */}
      <header className="ws-subpage-header">
        <div className="ws-subpage-header-left">
          <h1>
            <ListTodo size={24} />
            Tasks
          </h1>
          <span className="ws-subpage-count">{tasks.filter(t => t.status !== 'done').length} active</span>
        </div>
        <div className="ws-subpage-header-right" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div className="ws-scope-toggle">
            <button
              className={`ws-scope-btn ${viewScope === 'mine' ? 'active' : ''}`}
              onClick={() => setViewScope('mine')}
            >
              <User size={14} />
              My Tasks
            </button>
            <button
              className={`ws-scope-btn ${viewScope === 'team' ? 'active' : ''}`}
              onClick={() => setViewScope('team')}
            >
              <Users size={14} />
              Team
            </button>
          </div>
          <button
            className="ws-add-btn"
            onClick={() => setShowNewTask(true)}
          >
            <Plus size={18} />
            New Task
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="ws-error-banner" style={{ background: '#fef2f2', color: '#b91c1c', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Stats Row */}
      <div className="ws-subpage-stats">
        <div className="ws-subpage-stat">
          <Inbox size={18} />
          <span className="ws-subpage-stat-value">{todoTasks.length}</span>
          <span className="ws-subpage-stat-label">To Do</span>
        </div>
        <div className="ws-subpage-stat">
          <Clock size={18} />
          <span className="ws-subpage-stat-value">{inProgressTasks.length}</span>
          <span className="ws-subpage-stat-label">In Progress</span>
        </div>
        <div className={`ws-subpage-stat ${overdueCount > 0 ? 'warning' : ''}`}>
          <AlertCircle size={18} />
          <span className="ws-subpage-stat-value">{overdueCount}</span>
          <span className="ws-subpage-stat-label">Overdue</span>
        </div>
        <div className="ws-subpage-stat">
          <Calendar size={18} />
          <span className="ws-subpage-stat-value">{todayCount}</span>
          <span className="ws-subpage-stat-label">Due Today</span>
        </div>
      </div>

      {/* Filters */}
      <div className="ws-subpage-filters">
        <div className="ws-filter-tabs">
          {[
            { id: 'all', label: 'All Tasks', icon: ListTodo },
            { id: 'today', label: 'Today', icon: Calendar },
            { id: 'upcoming', label: 'Upcoming', icon: Clock },
            { id: 'overdue', label: 'Overdue', icon: AlertCircle },
            { id: 'completed', label: 'Completed', icon: CheckCircle2 },
          ].map(tab => (
            <button
              key={tab.id}
              className={`ws-filter-tab ${filter === tab.id ? 'active' : ''}`}
              onClick={() => setFilter(tab.id as FilterType)}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ws-filter-actions">
          <select
            className="ws-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortType)}
          >
            <option value="due_date">Sort by Due Date</option>
            <option value="priority">Sort by Priority</option>
            <option value="created_at">Sort by Created</option>
          </select>

          <label className="ws-show-completed">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Show completed
          </label>
        </div>
      </div>

      {/* Task List */}
      <div className="ws-subpage-list">
        {filteredTasks.length === 0 ? (
          <div className="ws-subpage-empty">
            <CheckSquare size={48} />
            <h3>No tasks found</h3>
            <p>{filter === 'all' ? 'Add your first task to get started' : `No ${filter} tasks`}</p>
            <button onClick={() => setShowNewTask(true)}>
              <Plus size={16} />
              Add Task
            </button>
          </div>
        ) : (
          <div className="ws-tasks-full-list">
            {filteredTasks.map(task => {
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

              return (
                <div
                  key={task.id}
                  className={`ws-task-full-item ${task.status === 'done' ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`}
                >
                  <button
                    className={`ws-task-check ${task.status === 'done' ? 'checked' : ''}`}
                    onClick={() => toggleTask(task)}
                  >
                    {task.status === 'done' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>

                  <div className="ws-task-full-content">
                    <span className="ws-task-full-title">{task.title}</span>
                    {task.description && (
                      <span className="ws-task-full-desc">{task.description}</span>
                    )}
                    <div className="ws-task-full-meta">
                      {viewScope === 'team' && task.employee && (
                        <span className="ws-task-full-owner">
                          <User size={12} />
                          {task.employee.name}
                        </span>
                      )}
                      {task.due_date && (
                        <span className={`ws-task-full-due ${isOverdue ? 'overdue' : ''}`}>
                          <Calendar size={12} />
                          {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                      <span className="ws-task-full-category">{task.category}</span>
                      {task.ticket && (
                        <a
                          href={`/workspace/tickets?ticket=${task.ticket.id}`}
                          className="ws-task-ticket-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Ticket size={12} />
                          #{task.ticket.number}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="ws-task-full-right">
                    <span
                      className="ws-task-full-priority"
                      style={{
                        background: priorityColors[task.priority].bg,
                        color: priorityColors[task.priority].text
                      }}
                    >
                      <Flag size={12} />
                      {task.priority}
                    </span>

                    <select
                      className="ws-task-full-status"
                      value={task.status}
                      onChange={(e) => updateTaskStatus(task, e.target.value as Task['status'])}
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>

                    <div className="ws-task-full-actions">
                      <button
                        className="ws-task-full-action"
                        onClick={() => setEditingTask(task)}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className="ws-task-full-action delete"
                        onClick={() => deleteTask(task)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed This Week */}
      {weeklyCompleted.length > 0 && (
        <div className="ws-weekly-summary">
          <button
            className="ws-weekly-summary-toggle"
            onClick={() => setShowWeeklySummary(!showWeeklySummary)}
          >
            {showWeeklySummary ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Trophy size={16} />
            <span>Completed This Week</span>
            <span className="ws-weekly-count">{weeklyCompleted.length}</span>
          </button>

          {showWeeklySummary && (
            <div className="ws-weekly-groups">
              {Object.entries(weeklyByEmployee)
                .sort(([, a], [, b]) => b.tasks.length - a.tasks.length)
                .map(([empId, group]) => (
                  <div key={empId} className="ws-weekly-group">
                    <div className="ws-weekly-group-header">
                      <span className="ws-weekly-group-name">{group.name}</span>
                      <span className="ws-weekly-group-count">{group.tasks.length} completed</span>
                    </div>
                    <div className="ws-weekly-group-tasks">
                      {group.tasks.map(task => (
                        <div key={task.id} className="ws-weekly-task">
                          <CheckCircle2 size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                          <span className="ws-weekly-task-title">{task.title}</span>
                          {task.completed_at && (
                            <span className="ws-weekly-task-date">
                              {new Date(task.completed_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {task.ticket && (
                            <a
                              href={`/workspace/tickets?ticket=${task.ticket.id}`}
                              className="ws-task-ticket-link"
                            >
                              <Ticket size={11} />
                              #{task.ticket.number}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* New Task Modal */}
      {showNewTask && (
        <ModalOverlay className="ws-modal-overlay" onClose={() => setShowNewTask(false)}>
          <div className="ws-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ws-modal-header">
              <h3>New Task</h3>
              <button onClick={() => setShowNewTask(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="ws-modal-body">
              <div className="ws-form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="What needs to be done?"
                  autoFocus
                />
              </div>

              <div className="ws-form-group">
                <label>Description (optional)</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Add more details..."
                  rows={3}
                />
              </div>

              <div className="ws-form-row">
                <div className="ws-form-group">
                  <label>Priority</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as Task['priority'] })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="ws-form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="ws-form-row">
                <div className="ws-form-group">
                  <label>Category</label>
                  <select
                    value={newTask.category}
                    onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                  >
                    <option value="general">General</option>
                    <option value="outreach">Outreach</option>
                    <option value="engineering">Engineering</option>
                    <option value="content">Content</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="ws-form-group">
                  <label>
                    <Link2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                    Link Ticket (optional)
                  </label>
                  <select
                    value={newTask.ticket_id}
                    onChange={(e) => setNewTask({ ...newTask, ticket_id: e.target.value })}
                  >
                    <option value="">None</option>
                    {tickets.map(t => (
                      <option key={t.id} value={t.id}>#{t.number} — {t.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="ws-modal-footer">
              <button
                className="ws-modal-cancel"
                onClick={() => setShowNewTask(false)}
              >
                Cancel
              </button>
              <button
                className="ws-modal-submit"
                onClick={createTask}
                disabled={!newTask.title.trim()}
              >
                <Check size={16} />
                Create Task
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <ModalOverlay className="ws-modal-overlay" onClose={() => setEditingTask(null)}>
          <div className="ws-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ws-modal-header">
              <h3>Edit Task</h3>
              <button onClick={() => setEditingTask(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="ws-modal-body">
              <div className="ws-form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                />
              </div>

              <div className="ws-form-group">
                <label>Description</label>
                <textarea
                  value={editingTask.description || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="ws-form-row">
                <div className="ws-form-group">
                  <label>Priority</label>
                  <select
                    value={editingTask.priority}
                    onChange={(e) => setEditingTask({ ...editingTask, priority: e.target.value as Task['priority'] })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="ws-form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={editingTask.due_date || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="ws-form-row">
                <div className="ws-form-group">
                  <label>Category</label>
                  <select
                    value={editingTask.category || 'general'}
                    onChange={(e) => setEditingTask({ ...editingTask, category: e.target.value })}
                  >
                    <option value="general">General</option>
                    <option value="outreach">Outreach</option>
                    <option value="engineering">Engineering</option>
                    <option value="content">Content</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="ws-form-group">
                  <label>
                    <Link2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                    Link Ticket
                  </label>
                  <select
                    value={editingTask.ticket_id || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, ticket_id: e.target.value || null })}
                  >
                    <option value="">None</option>
                    {tickets.map(t => (
                      <option key={t.id} value={t.id}>#{t.number} — {t.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="ws-modal-footer">
              <button
                className="ws-modal-cancel"
                onClick={() => setEditingTask(null)}
              >
                Cancel
              </button>
              <button
                className="ws-modal-submit"
                onClick={updateTask}
              >
                <Check size={16} />
                Save Changes
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
