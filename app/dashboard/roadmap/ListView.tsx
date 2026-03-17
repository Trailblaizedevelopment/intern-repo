'use client';

import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { RoadmapTicket, Employee, SortKey, SortDir } from './types';
import { statusPill, priorityDot, sprintLabel } from './utils';

interface ListViewProps {
  tickets: RoadmapTicket[];
  employees: Employee[];
  onTicketClick: (t: RoadmapTicket) => void;
}

export function ListView({ tickets, employees, onTicketClick }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]));

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
        const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
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
      className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:bg-gray-50"
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
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <Th col="number" label="#" />
            <Th col="title" label="Title" />
            <Th col="project" label="Project" />
            <Th col="priority" label="Priority" />
            <Th col="status" label="Status" />
            <Th col="sprint" label="Sprint" />
            <Th col="due_date" label="Due Date" />
            <Th col="assignee" label="Assignee" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((ticket, idx) => {
            const assigneeName = ticket.assignee_id
              ? (empMap[ticket.assignee_id] ?? ticket.assignee_id.slice(-6))
              : '—';
            return (
              <tr
                key={ticket.id}
                className={`cursor-pointer border-b border-gray-100 hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                onClick={() => onTicketClick(ticket)}
              >
                <td className="px-3 py-2.5 text-gray-400 font-mono text-xs">{ticket.number}</td>
                <td className="px-3 py-2.5 max-w-xs">
                  <div className="flex items-center gap-2">
                    <span className={`flex-shrink-0 w-2 h-2 rounded-full ${priorityDot(ticket.priority)}`} />
                    <span className="truncate text-gray-900 font-medium">{ticket.title}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{ticket.project ?? '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="capitalize text-gray-700">{ticket.priority ?? 'none'}</span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusPill(ticket.status)}`}>
                    {ticket.status?.replace(/_/g, ' ') ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{sprintLabel(ticket.sprint)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">
                  {ticket.due_date ? ticket.due_date.slice(0, 10) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{assigneeName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
