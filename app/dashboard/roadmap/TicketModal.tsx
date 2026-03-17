'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { RoadmapTicket, Employee } from './types';
import { statusPill, priorityDot, sprintLabel } from './utils';

interface TicketModalProps {
  ticket: RoadmapTicket;
  employees: Employee[];
  onClose: () => void;
}

export function TicketModal({ ticket, employees, onClose }: TicketModalProps) {
  const assignee = employees.find(e => e.id === ticket.assignee_id);
  const assigneeName = assignee?.name ?? (ticket.assignee_id ? ticket.assignee_id.slice(-6) : 'Unassigned');

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
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`mt-1.5 flex-shrink-0 w-2.5 h-2.5 rounded-full ${priorityDot(ticket.priority)}`} />
            <div className="min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">#{ticket.number}</p>
              <h2 className="text-base font-semibold text-gray-900 leading-snug">{ticket.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 ml-3 p-1 rounded hover:bg-gray-100 transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {ticket.description && (
            <p className="text-sm text-gray-600 leading-relaxed">{ticket.description}</p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Status</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusPill(ticket.status)}`}>
                {ticket.status?.replace(/_/g, ' ') ?? '—'}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Priority</p>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <span className={`w-2 h-2 rounded-full ${priorityDot(ticket.priority)}`} />
                {ticket.priority ?? 'none'}
              </span>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Sprint</p>
              <p className="text-sm text-gray-700">{sprintLabel(ticket.sprint)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Project</p>
              <p className="text-sm text-gray-700">{ticket.project ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Assignee</p>
              <p className="text-sm text-gray-700">{assigneeName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Due Date</p>
              <p className="text-sm text-gray-700">{ticket.due_date ? ticket.due_date.slice(0, 10) : '—'}</p>
            </div>
          </div>

          {ticket.labels && ticket.labels.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Labels</p>
              <div className="flex flex-wrap gap-1.5">
                {ticket.labels.map(l => (
                  <span key={l} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{l}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
