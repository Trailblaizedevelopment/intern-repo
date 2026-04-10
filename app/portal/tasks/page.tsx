'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Employee } from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
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
  Ticket
} from 'lucide-react';

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
  ticket?: { id: string; number: number; title: string; status: string } | null;
}

type FilterType = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';
type SortType = 'due_date' | 'priority' | 'created_at';

export default function TasksPage() {
  const { user } = useAuth();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('due_date');
  const [showCompleted, setShowCompleted] = useState(false);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as Task['priority'],
    due_date: '',
    category: 'general'
  });

  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const fetchEmployee = useCallback(async () => {
    if (!user) return;

    const res = await fetch(`/api/employees?email=${encodeURIComponent(user.email ?? '')}`);
    const result = await res.json();
    const data = result.data?.[0] ?? null;

    if (data) {
      setCurrentEmployee(data);
    } else {
      // Fallback: first active employee (demo mode)
      const fallbackRes = await fetch('/api/employees?status=active&limit=1');
      const fallbackResult = await fallbackRes.json();
      const fallback = fallbackResult.data?.[0] ?? null;
      if (fallback) setCurrentEmployee(fallback);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  const fetchTasks = useCallback(async () => {
    if (!currentEmployee) return;

    try {
      const params = new URLSearchParams({ employee_id: currentEmployee.id });
      const res = await fetch(`/api/workspace/tasks?${params}`);
      const result = await res.json();

      if (result.error) {
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
  }, [currentEmployee, showCompleted]);

  useEffect(() => {
    if (currentEmployee) fetchTasks();
  }, [currentEmployee, fetchTasks]);

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
        }),
      });

      const result = await res.json();
      if (result.error) {
        setError(result.error.message);
        return;
      }

      setTasks(prev => [result.data, ...prev]);
      setNewTask({ title: '', description: '', priority: 'medium', due_date: '', category: 'general' });
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

  const priorityColors = {
    low: { bg: '#f3f4f6', text: '#6b7280' },
    medium: { bg: '#dbeafe', text: '#2563eb' },
    high: { bg: '#fef3c7', text: '#d97706' },
    urgent: { bg: '#fee2e2', text: '#dc2626' }
  };

  if (loading) {
    return (
      <div className="portal-loading">
        <div className="portal-loading-spinner" />
        <p>Loading tasks...</p>
      </div>
    );
  }

  return (
    <div className="tasks-page">
      {/* Header */}
      <header className="tasks-header">
        <div className="tasks-header-left">
          <h1>
            <ListTodo size={24} />
            My Tasks
          </h1>
          <span className="tasks-count">{tasks.filter(t => t.status !== 'done').length} active</span>
        </div>
        <button
          className="tasks-new-btn"
          onClick={() => setShowNewTask(true)}
        >
          <Plus size={18} />
          New Task
        </button>
      </header>

      {/* Error Banner */}
      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Stats Row */}
      <div className="tasks-stats">
        <div className="tasks-stat">
          <Inbox size={18} />
          <span className="tasks-stat-value">{todoTasks.length}</span>
          <span className="tasks-stat-label">To Do</span>
        </div>
        <div className="tasks-stat">
          <Clock size={18} />
          <span className="tasks-stat-value">{inProgressTasks.length}</span>
          <span className="tasks-stat-label">In Progress</span>
        </div>
        <div className="tasks-stat overdue">
          <AlertCircle size={18} />
          <span className="tasks-stat-value">{overdueCount}</span>
          <span className="tasks-stat-label">Overdue</span>
        </div>
        <div className="tasks-stat">
          <Calendar size={18} />
          <span className="tasks-stat-value">{todayCount}</span>
          <span className="tasks-stat-label">Due Today</span>
        </div>
      </div>

      {/* Filters */}
      <div className="tasks-filters">
        <div className="tasks-filter-tabs">
          {[
            { id: 'all', label: 'All Tasks', icon: ListTodo },
            { id: 'today', label: 'Today', icon: Calendar },
            { id: 'upcoming', label: 'Upcoming', icon: Clock },
            { id: 'overdue', label: 'Overdue', icon: AlertCircle },
            { id: 'completed', label: 'Completed', icon: CheckCircle2 },
          ].map(tab => (
            <button
              key={tab.id}
              className={`tasks-filter-tab ${filter === tab.id ? 'active' : ''}`}
              onClick={() => setFilter(tab.id as FilterType)}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tasks-filter-actions">
          <select
            className="tasks-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortType)}
          >
            <option value="due_date">Sort by Due Date</option>
            <option value="priority">Sort by Priority</option>
            <option value="created_at">Sort by Created</option>
          </select>

          <label className="tasks-show-completed">
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
      <div className="tasks-list-container">
        {filteredTasks.length === 0 ? (
          <div className="tasks-empty">
            <CheckSquare size={48} />
            <h3>No tasks found</h3>
            <p>{filter === 'all' ? 'Add your first task to get started' : `No ${filter} tasks`}</p>
            <button onClick={() => setShowNewTask(true)}>
              <Plus size={16} />
              Add Task
            </button>
          </div>
        ) : (
          <div className="tasks-list">
            {filteredTasks.map(task => {
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';

              return (
                <div
                  key={task.id}
                  className={`tasks-item ${task.status === 'done' ? 'completed' : ''} ${isOverdue ? 'overdue' : ''}`}
                >
                  <button
                    className={`tasks-item-check ${task.status === 'done' ? 'checked' : ''}`}
                    onClick={() => toggleTask(task)}
                  >
                    {task.status === 'done' ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>

                  <div className="tasks-item-content">
                    <span className="tasks-item-title">{task.title}</span>
                    {task.description && (
                      <span className="tasks-item-desc">{task.description}</span>
                    )}
                    <div className="tasks-item-meta">
                      {task.due_date && (
                        <span className={`tasks-item-due ${isOverdue ? 'overdue' : ''}`}>
                          <Calendar size={12} />
                          {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                      <span className="tasks-item-category">{task.category}</span>
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

                  <div className="tasks-item-right">
                    <span
                      className="tasks-item-priority"
                      style={{
                        background: priorityColors[task.priority].bg,
                        color: priorityColors[task.priority].text
                      }}
                    >
                      <Flag size={12} />
                      {task.priority}
                    </span>

                    <select
                      className="tasks-item-status"
                      value={task.status}
                      onChange={(e) => updateTaskStatus(task, e.target.value as Task['status'])}
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="done">Done</option>
                    </select>

                    <div className="tasks-item-actions">
                      <button
                        className="tasks-item-action"
                        onClick={() => setEditingTask(task)}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        className="tasks-item-action delete"
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

      {/* New Task Modal */}
      {showNewTask && (
        <ModalOverlay className="tasks-modal-overlay" onClose={() => setShowNewTask(false)}>
          <div className="tasks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tasks-modal-header">
              <h3>New Task</h3>
              <button onClick={() => setShowNewTask(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="tasks-modal-body">
              <div className="tasks-form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="What needs to be done?"
                  autoFocus
                />
              </div>

              <div className="tasks-form-group">
                <label>Description (optional)</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Add more details..."
                  rows={3}
                />
              </div>

              <div className="tasks-form-row">
                <div className="tasks-form-group">
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

                <div className="tasks-form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="tasks-form-group">
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
            </div>

            <div className="tasks-modal-footer">
              <button
                className="tasks-modal-cancel"
                onClick={() => setShowNewTask(false)}
              >
                Cancel
              </button>
              <button
                className="tasks-modal-submit"
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
        <ModalOverlay className="tasks-modal-overlay" onClose={() => setEditingTask(null)}>
          <div className="tasks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tasks-modal-header">
              <h3>Edit Task</h3>
              <button onClick={() => setEditingTask(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="tasks-modal-body">
              <div className="tasks-form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                />
              </div>

              <div className="tasks-form-group">
                <label>Description</label>
                <textarea
                  value={editingTask.description || ''}
                  onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="tasks-form-row">
                <div className="tasks-form-group">
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

                <div className="tasks-form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={editingTask.due_date || ''}
                    onChange={(e) => setEditingTask({ ...editingTask, due_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="tasks-form-group">
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
            </div>

            <div className="tasks-modal-footer">
              <button
                className="tasks-modal-cancel"
                onClick={() => setEditingTask(null)}
              >
                Cancel
              </button>
              <button
                className="tasks-modal-submit"
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
