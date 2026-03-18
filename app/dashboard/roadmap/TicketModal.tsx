'use client';

import React, { useState, useCallback } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { RawTicket, Employee } from './types';
import { priorityDot, projectColor } from './utils';
import { useToast } from '@/components/Toast';

const STATUSES = [
  'backlog', 'open', 'todo', 'in_progress', 'in_review', 'done', 'resolved', 'canceled',
] as const;

const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

const SPRINTS = ['Sprint 1', 'Sprint 2'] as const;

interface TicketModalProps {
  ticket: RawTicket;
  employees: Employee[];
  onClose: () => void;
  onUpdate: (updated: RawTicket) => void;
}

export function TicketModal({ ticket, employees, onClose, onUpdate }: TicketModalProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Local editable state — initialized once from prop
  const [local, setLocal] = useState({
    status: ticket.status ?? '',
    priority: ticket.priority ?? '',
    sprint: ticket.sprint ?? '',
    due_date: ticket.due_date?.slice(0, 10) ?? '',
    assignee_id: ticket.assignee_id ?? '',
  });

  const save = useCallback(async (field: string, value: string) => {
    setSaving(field);
    setSaveError(null);
    try {
      const res = await fetch(`/api/roadmap/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as RawTicket;
      onUpdate(updated);
      showToast('Saved ✓', 'success');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
      showToast('Save failed', 'error');
    } finally {
      setSaving(null);
    }
  }, [ticket.id, onUpdate, showToast]);

  const handleChange = useCallback((field: string, value: string) => {
    setLocal(prev => ({ ...prev, [field]: value }));
    void save(field, value);
  }, [save]);

  const color = projectColor(ticket.project ?? '');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between p-5 border-b border-gray-100"
          style={{ borderLeft: `4px solid ${color}` }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <span className={`mt-1.5 flex-shrink-0 w-2.5 h-2.5 rounded-full ${priorityDot(ticket.priority)}`} />
            <div className="min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">
                #{ticket.number} · {ticket.project ?? 'No Project'}
              </p>
              <h2 className="text-base font-semibold text-gray-900 leading-snug">{ticket.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-3 p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Description (read-only) */}
          {ticket.description && (
            <p className="text-sm text-gray-500 leading-relaxed line-clamp-3 bg-gray-50 rounded-lg px-3 py-2.5">
              {ticket.description}
            </p>
          )}

          {/* Save error */}
          {saveError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={14} />
              {saveError}
            </div>
          )}

          {/* Editable fields grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Status
              </label>
              <select
                value={local.status}
                onChange={e => handleChange('status', e.target.value)}
                disabled={saving === 'status'}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 disabled:opacity-50 transition-colors"
              >
                <option value="">—</option>
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Priority
              </label>
              <select
                value={local.priority}
                onChange={e => handleChange('priority', e.target.value)}
                disabled={saving === 'priority'}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 disabled:opacity-50 transition-colors"
              >
                <option value="">—</option>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Sprint */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Sprint
              </label>
              <select
                value={local.sprint}
                onChange={e => handleChange('sprint', e.target.value)}
                disabled={saving === 'sprint'}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 disabled:opacity-50 transition-colors"
              >
                <option value="">None</option>
                {SPRINTS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Due Date
              </label>
              <input
                type="date"
                value={local.due_date}
                onChange={e => handleChange('due_date', e.target.value)}
                disabled={saving === 'due_date'}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 disabled:opacity-50 transition-colors"
              />
            </div>

            {/* Assignee */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Assignee
              </label>
              <select
                value={local.assignee_id}
                onChange={e => handleChange('assignee_id', e.target.value)}
                disabled={saving === 'assignee_id'}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 disabled:opacity-50 transition-colors"
              >
                <option value="">Unassigned</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Labels (read-only) */}
          {ticket.labels && ticket.labels.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Labels</p>
              <div className="flex flex-wrap gap-1.5">
                {ticket.labels.map(l => (
                  <span key={l} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{l}</span>
                ))}
              </div>
            </div>
          )}

          {/* Saving indicator */}
          {saving && (
            <p className="text-xs text-gray-400 animate-pulse">Saving…</p>
          )}
        </div>
      </div>
    </div>
  );
}
