'use client';

import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { RoadmapTicket, Employee, SortKey, SortDir } from './types';
import { statusPill, priorityDot, sprintBadgeLabel, projectColor } from './utils';

interface ListViewProps {
  tickets: RoadmapTicket[];
  employees: Employee[];
  onTicketClick: (t: RoadmapTicket) => void;
}

// ── Priority chip ────────────────────────────────────────────────────────────
function PriorityChip({ priority }: { priority: RoadmapTicket['priority'] }) {
  switch (priority) {
    case 'critical':
      return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-red-700">🔴 Critical</span>;
    case 'high':
      return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-orange-600">🟠 High</span>;
    case 'medium':
      return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-yellow-600">🟡 Medium</span>;
    case 'low':
      return <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-400">⚪ Low</span>;
    default:
      return <span className="text-gray-300 text-[11px]">—</span>;
  }
}

// ── Sprint / Due cell ────────────────────────────────────────────────────────
function SprintDueCell({ ticket }: { ticket: RoadmapTicket }) {
  const badge = sprintBadgeLabel(ticket.sprint);
  if (badge) {
    const cls = badge === 'S1'
      ? 'bg-blue-100 text-blue-700'
      : 'bg-purple-100 text-purple-700';
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
        {badge}
      </span>
    );
  }
  if (ticket.due_date) {
    return <span className="text-gray-600 text-xs">{ticket.due_date.slice(0, 10)}</span>;
  }
  return <span className="text-gray-300 text-xs">—</span>;
}

export function ListView({ tickets, employees, onTicketClick }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]));

  // Determine if we should show "Sprint" header vs "Due Date"
  const noDueDateCount = tickets.filter(t => !t.due_date).length;
  const showSprintHeader = tickets.length === 0 || noDueDateCount / tickets.length > 0.7;

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...tickets].sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    switch (sortKey) {
      case 'number': va = a.number; vb = b.number; break;
      case 'title': va = a.title.toLowerCase(); vb = b.title.toLowerCase(); break;
      case 'project': va = (a.project ?? '').toLowerCase(); vb = (b.project ?? '').toLowerCase(); break;
      case 'priority': {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
        va = order[a.priority ?? 'none'] ?? 4;
        vb = order[b.priority ?? 'none'] ?? 4;
        break;
      }
      case 'status': va = (a.status ?? '').toLowerCase(); vb = (b.status ?? '').toLowerCase(); break;
      case 'sprint': va = (a.sprint ?? '').toLowerCase(); vb = (b.sprint ?? '').toLowerCase(); break;
      case 'due_date': va = a.barEnd; vb = b.barEnd; break;
      case 'assignee': va = empMap[a.assignee_id ?? ''] ?? ''; vb = empMap[b.assignee_id ?? ''] ?? ''; break;
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp size={12} className="text-gray-300" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-gray-600" />
      : <ChevronDown size={12} className="text-gray-600" />;
  };

  const Th = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:bg-gray-100"
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1">{label}<SortIcon col={col} /></span>
    </th>
  );

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No tickets match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
          <tr>
            <Th col="number" label="#" />
            <Th col="title" label="Title" />
            <Th col="project" label="Project" />
            <Th col="priority" label="Priority" />
            <Th col="status" label="Status" />
            <Th col="sprint" label={showSprintHeader ? 'Sprint' : 'Sprint / Due'} />
            {!showSprintHeader && <Th col="due_date" label="Due Date" />}
            <Th col="assignee" label="Assignee" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((ticket) => {
            const assigneeName = ticket.assignee_id
              ? (empMap[ticket.assignee_id] ?? ticket.assignee_id.slice(-6))
              : '—';
            const color = projectColor(ticket.project ?? '');
            return (
              <tr
                key={ticket.id}
                style={{ borderLeft: `4px solid ${color}` }}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors duration-100"
                onClick={() => onTicketClick(ticket)}
              >
                {/* Number */}
                <td className="px-3 py-2 text-xs font-mono text-gray-400 whitespace-nowrap">{ticket.number}</td>

                {/* Title */}
                <td className="px-3 py-2 max-w-xs">
                  <div className="flex items-center gap-2">
                    <span className={`flex-shrink-0 w-2 h-2 rounded-full ${priorityDot(ticket.priority)}`} />
                    <span className="truncate font-medium text-gray-900">{ticket.title}</span>
                  </div>
                </td>

                {/* Project */}
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">{ticket.project ?? '—'}</td>

                {/* Priority */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <PriorityChip priority={ticket.priority} />
                </td>

                {/* Status pill */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusPill(ticket.status)}`}>
                    {ticket.status?.replace(/_/g, ' ') ?? '—'}
                  </span>
                </td>

                {/* Sprint / Due */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <SprintDueCell ticket={ticket} />
                </td>

                {/* Due Date column (only shown if !showSprintHeader) */}
                {!showSprintHeader && (
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                    {ticket.due_date ? ticket.due_date.slice(0, 10) : <span className="text-gray-300">—</span>}
                  </td>
                )}

                {/* Assignee */}
                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">{assigneeName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
