'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, CheckSquare, Plus, Search, Filter, X, Trash2, Edit2, Check, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { supabase, Task } from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';
import { SkeletonTable } from '@/components/Skeleton';

export default function OperationsModule() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignee: '',
    priority: 'medium' as Task['priority'],
    status: 'todo' as Task['status'],
    due_date: '',
  });

  // Fetch tasks
  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tasks:', error);
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  }

  // Create task
  async function createTask() {
    if (!supabase) return;
    const { error } = await supabase
      .from('tasks')
      .insert([formData]);

    if (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task');
    } else {
      resetForm();
      fetchTasks();
    }
  }

  // Update task
  async function updateTask() {
    if (!supabase || !editingTask) return;

    const { error } = await supabase
      .from('tasks')
      .update(formData)
      .eq('id', editingTask.id);

    if (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task');
    } else {
      resetForm();
      fetchTasks();
    }
  }

  // Quick complete task
  async function toggleTaskComplete(task: Task) {
    if (!supabase) return;
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    const { error } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', task.id);

    if (error) {
      console.error('Error updating task:', error);
    } else {
      fetchTasks();
    }
  }

  // Delete task
  async function deleteTask(id: string) {
    if (!supabase) return;

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
    } else {
      fetchTasks();
    }
    setDeleteConfirm({ show: false, id: null });
  }

  function resetForm() {
    setFormData({
      title: '',
      description: '',
      assignee: '',
      priority: 'medium',
      status: 'todo',
      due_date: '',
    });
    setEditingTask(null);
    setShowModal(false);
  }

  function openEditModal(task: Task) {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      assignee: task.assignee || '',
      priority: task.priority,
      status: task.status,
      due_date: task.due_date || '',
    });
    setShowModal(true);
  }

  // Filter tasks
  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.assignee && t.assignee.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Calculate stats
  const openTasks = tasks.filter(t => t.status === 'todo').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const dueToday = tasks.filter(t => {
    if (!t.due_date) return false;
    const due = new Date(t.due_date).toDateString();
    const today = new Date().toDateString();
    return due === today;
  }).length;
  const completed = tasks.filter(t => t.status === 'done').length;

  const priorityLabels: Record<Task['priority'], string> = {
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };

  const statusLabels: Record<Task['status'], string> = {
    todo: 'To Do',
    in_progress: 'In Progress',
    done: 'Done',
  };

  return (
    <div className="module-page">
      {/* Header */}
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
            <div className="module-icon" style={{ backgroundColor: '#8b5cf615', color: '#8b5cf6' }}>
              <CheckSquare size={24} />
            </div>
            <div>
              <h1>Operations & Tasks</h1>
              <p>Coordinate day-to-day activities and keep the business running smoothly.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="module-main">
        {/* Stats Row */}
        <div className="module-stats-row">
          <div className="module-stat">
            <span className="module-stat-value">{openTasks}</span>
            <span className="module-stat-label">Open Tasks</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{inProgress}</span>
            <span className="module-stat-label">In Progress</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{dueToday}</span>
            <span className="module-stat-label">Due Today</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{completed}</span>
            <span className="module-stat-label">Completed</span>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="module-actions-bar">
          <div className="module-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="module-actions">
            <button className="module-filter-btn">
              <Filter size={16} />
              Filter
            </button>
            <button className="module-primary-btn" onClick={() => setShowModal(true)}>
              <Plus size={18} />
              Add Task
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="module-table-container">
          {loading ? (
            <SkeletonTable rows={5} cols={7} />
          ) : filteredTasks.length > 0 ? (
            <table className="module-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Task</th>
                  <th>Assignee</th>
                  <th>Priority</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => (
                  <tr key={task.id} className={task.status === 'done' ? 'completed-row' : ''}>
                    <td>
                      <button
                        className={`task-checkbox ${task.status === 'done' ? 'checked' : ''}`}
                        onClick={() => toggleTaskComplete(task)}
                      >
                        {task.status === 'done' && <Check size={14} />}
                      </button>
                    </td>
                    <td className="module-table-name">{task.title}</td>
                    <td>{task.assignee || '—'}</td>
                    <td>
                      <span className={`module-priority ${task.priority}`}>{priorityLabels[task.priority]}</span>
                    </td>
                    <td>{task.due_date || '—'}</td>
                    <td>
                      <span className={`module-status ${task.status}`}>{statusLabels[task.status]}</span>
                    </td>
                    <td>
                      <div className="module-table-actions">
                        <button className="module-table-action" onClick={() => openEditModal(task)}>
                          <Edit2 size={14} />
                        </button>
                        <button className="module-table-action delete" onClick={() => setDeleteConfirm({ show: true, id: task.id })}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="module-empty-state">
              <CheckSquare size={48} />
              <h3>No tasks yet</h3>
              <p>Create tasks to track your operations</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => resetForm()}>
          <div className="module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>{editingTask ? 'Edit Task' : 'Add Task'}</h2>
              <button className="module-modal-close" onClick={() => resetForm()}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-group">
                <label>Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="What needs to be done?"
                />
              </div>
              <div className="module-form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add details..."
                  rows={3}
                />
              </div>
              <div className="module-form-group">
                <label>Assignee</label>
                <input
                  type="text"
                  value={formData.assignee}
                  onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                  placeholder="Who's responsible?"
                />
              </div>
              <div className="module-form-group">
                <label>Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as Task['priority'] })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="module-form-group">
                <label>Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Task['status'] })}
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div className="module-form-group">
                <label>Due Date</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => resetForm()}>
                Cancel
              </button>
              <button
                className="module-primary-btn"
                onClick={editingTask ? updateTask : createTask}
                disabled={!formData.title}
              >
                {editingTask ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Task"
        message="Are you sure you want to delete this task?"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => deleteConfirm.id && deleteTask(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />
    </div>
  );
}
