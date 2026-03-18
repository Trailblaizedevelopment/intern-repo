'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown, MoreHorizontal, ExternalLink, ArrowRight, Link2 } from 'lucide-react';
import type { RoadmapTicket, Employee, SortKey, SortDir } from './types';
import { statusPill, priorityDot, sprintBadgeLabel, projectColor, STATUS_NEXT } from './utils';
import { useToast } from '@/components/Toast';

interface ListViewProps {
  tickets: RoadmapTicket[];
  employees: Employee[];
  totalCount: number;
  onTicketClick: (t: RoadmapTicket) => void;
  onStatusChange: (ticketId: string, newStatus: string) => Promise<void>;
}

// ── Priority chip ────────────────────────────────────────────────────────────
function PriorityChip({ priority }: { priority: RoadmapTicket['priority'] }) {
  switch (priority) {
    case 'critical': return <span className="text-[11px] font-medium text-red-700">🔴 Critical</span>;
    case 'high':     return <span className="text-[11px] font-medium text-orange-600">🟠 High</span>;
    case 'medium':   return <span className="text-[11px] font-medium text-yellow-600">🟡 Medium</span>;
    case 'low':      return <span className="text-[11px] font-medium text-gray-400">⚪ Low</span>;
    default:         return <span className="text-gray-300 text-[11px]">—</span>;
  }
}

// ── Sprint badge ─────────────────────────────────────────────────────────────
function SprintBadge({ ticket }: { ticket: RoadmapTicket }) {
  const badge = sprintBadgeLabel(ticket.sprint);
  if (badge) {
    const cls = badge === 'S1' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
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

// ── Row action menu ───────────────────────────────────────────────────────────
function RowActions({
  ticket,
  onOpen,
  onNextStatus,
}: {
  ticket: RoadmapTicket;
  onOpen: () => void;
  onNextStatus: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const nextStatus = ticket.status ? STATUS_NEXT[ticket.status] : null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const copyLink = () => {
    const url = `${window.location.origin}/dashboard/roadmap?ticket=${ticket.id}`;
    void navigator.clipboard.writeText(url).then(() => showToast('Link copied!', 'success'));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="Row actions"
      >
        <MoreHorizontal size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-xl z-30 py-1">
          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
            onClick={() => { setOpen(false); onOpen(); }}
          >
            <ExternalLink size={12} className="text-gray-400" />
            Open editor
          </button>

          {nextStatus && (
            <button
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
              onClick={() => { setOpen(false); onNextStatus(); }}
            >
              <ArrowRight size={12} className="text-gray-400" />
              → {nextStatus.replace(/_/g, ' ')}
            </button>
          )}

          <button
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 text-left"
            onClick={copyLink}
          >
            <Link2 size={12} className="text-gray-400" />
            Copy link
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main list view ────────────────────────────────────────────────────────────
export function ListView({ tickets, employees, totalCount, onTicketClick, onStatusChange }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('number');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]));

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...tickets].sort((a, b) => {
    let va: string | number = '';
    let vb: string | number = '';
    switch (sortKey) {
      case 'number':   va = a.number;                           vb = b.number;               break;
      case 'title':    va = a.title.toLowerCase();              vb = b.title.toLowerCase();  break;
      case 'project':  va = (a.project ?? '').toLowerCase();    vb = (b.project ?? '').toLowerCase(); break;
      case 'priority': {
        const ord: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
        va = ord[a.priority ?? 'none'] ?? 4;
        vb = ord[b.priority ?? 'none'] ?? 4;
        break;
      }
      case 'status':   va = (a.status ?? '').toLowerCase();     vb = (b.status ?? '').toLowerCase();  break;
      case 'sprint':   va = (a.sprint ?? '').toLowerCase();     vb = (b.sprint ?? '').toLowerCase();  break;
      case 'due_date': va = a.barEnd;                           vb = b.barEnd;               break;
      case 'assignee': va = empMap[a.assignee_id ?? ''] ?? '';  vb = empMap[b.assignee_id ?? ''] ?? ''; break;
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

  const Th = ({ col, label, className = '' }: { col: SortKey; label: string; className?: string }) => (
    <th
      className={`px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 ${className}`}
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1">{label}<SortIcon col={col} /></span>
    </th>
  );

  const handleNextStatus = useCallback(async (ticket: RoadmapTicket) => {
    const next = ticket.status ? STATUS_NEXT[ticket.status] : null;
    if (!next) return;
    await onStatusChange(ticket.id, next);
  }, [onStatusChange]);

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <tr>
              <Th col="number" label="#" />
              <Th col="title" label="Title" />
              {/* Desktop-only columns */}
              <Th col="project" label="Project" className="hidden md:table-cell" />
              <Th col="priority" label="Priority" className="hidden md:table-cell" />
              <Th col="status" label="Status" className="hidden md:table-cell" />
              <Th col="sprint" label="Sprint" className="hidden md:table-cell" />
              <Th col="assignee" label="Assignee" className="hidden md:table-cell" />
              {/* Actions column (no sort) */}
              <th className="px-2 py-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(ticket => {
              const assigneeName = ticket.assignee_id
                ? (empMap[ticket.assignee_id] ?? ticket.assignee_id.slice(-6))
                : '—';
              const color = projectColor(ticket.project ?? '');

              return (
                <tr
                  key={ticket.id}
                  style={{ borderLeft: `3px solid ${color}` }}
                  className="group cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors duration-100"
                  onClick={() => onTicketClick(ticket)}
                >
                  {/* # */}
                  <td className="px-3 py-2 text-xs font-mono text-gray-400 whitespace-nowrap">
                    {ticket.number}
                  </td>

                  {/* Title — on mobile, includes status+priority below */}
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1 ${priorityDot(ticket.priority)}`} />
                      <div>
                        <p className="font-medium text-gray-900 line-clamp-2 text-sm leading-snug">{ticket.title}</p>
                        {/* Mobile: status + priority stacked below title */}
                        <div className="mt-1 flex items-center gap-2 md:hidden flex-wrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusPill(ticket.status)}`}>
                            {ticket.status?.replace(/_/g, ' ') ?? '—'}
                          </span>
                          <PriorityChip priority={ticket.priority} />
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Project (desktop only) */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500 hidden md:table-cell">
                    {ticket.project ?? '—'}
                  </td>

                  {/* Priority (desktop only) */}
                  <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">
                    <PriorityChip priority={ticket.priority} />
                  </td>

                  {/* Status (desktop only) */}
                  <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusPill(ticket.status)}`}>
                      {ticket.status?.replace(/_/g, ' ') ?? '—'}
                    </span>
                  </td>

                  {/* Sprint (desktop only) */}
                  <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">
                    <SprintBadge ticket={ticket} />
                  </td>

                  {/* Assignee (desktop only) */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 hidden md:table-cell">
                    {assigneeName}
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-2 text-right">
                    <RowActions
                      ticket={ticket}
                      onOpen={() => onTicketClick(ticket)}
                      onNextStatus={() => void handleNextStatus(ticket)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Row count footer */}
      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
        Showing <span className="font-medium text-gray-600">{sorted.length}</span> of{' '}
        <span className="font-medium text-gray-600">{totalCount}</span> ticket{totalCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
