'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { RoadmapTicket, Employee } from './types';
import {
  ganttDays, daysBetween, formatDate, parseDate, sprintBand,
  priorityDot, projectColor, GANTT_START, DAY_WIDTH, SPRINT1_END, SPRINT2_END, clamp,
} from './utils';

const ROW_HEIGHT = 36;
const LEFT_WIDTH = 240;

interface GanttViewProps {
  tickets: RoadmapTicket[];
  employees: Employee[];
  onTicketClick: (t: RoadmapTicket) => void;
  onReschedule: (ticketId: string, newEnd: string) => void;
}

interface DragState {
  ticketId: string;
  startX: number;
  originalEnd: string;
  currentEnd: string;
}

interface MilestonePopover {
  sprint: 1 | 2;
  x: number;
  y: number;
}

// Column background per band
function dayBg(day: string): string {
  const band = sprintBand(day);
  if (band === 'sprint1') return 'rgba(239,246,255,0.7)';
  if (band === 'sprint2') return 'rgba(245,243,255,0.5)';
  return '#ffffff';
}

// Vertical line inside a row (today / milestones)
function RowLine({ x, color, zIndex = 5 }: { x: number; color: string; zIndex?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        bottom: 0,
        width: 1,
        background: color,
        pointerEvents: 'none',
        zIndex,
      }}
    />
  );
}

export function GanttView({ tickets, employees: _employees, onTicketClick, onReschedule }: GanttViewProps) {
  const days = ganttDays();
  const totalWidth = days.length * DAY_WIDTH;
  const today = formatDate(new Date());
  const todayIdx = daysBetween(GANTT_START, today);
  const sprint1EndIdx = daysBetween(GANTT_START, SPRINT1_END); // 4
  const sprint2EndIdx = daysBetween(GANTT_START, SPRINT2_END); // 14

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragEnd, setDragEnd] = useState<Record<string, string>>({});
  const [milestonePopover, setMilestonePopover] = useState<MilestonePopover | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Group tickets by project
  const projectGroups = tickets.reduce<Record<string, RoadmapTicket[]>>((acc, t) => {
    const key = t.project ?? 'No Project';
    (acc[key] = acc[key] ?? []).push(t);
    return acc;
  }, {});
  const projectNames = Object.keys(projectGroups).sort();

  type RowItem = { type: 'header'; project: string } | { type: 'ticket'; ticket: RoadmapTicket };
  const rows: RowItem[] = [];
  for (const proj of projectNames) {
    rows.push({ type: 'header', project: proj });
    if (!collapsed[proj]) {
      for (const t of projectGroups[proj]) rows.push({ type: 'ticket', ticket: t });
    }
  }

  const getBarEnd = (id: string, fallback: string) => dragEnd[id] ?? fallback;

  // Sprint ticket lists for the milestone popover
  const sprintTickets = (sprintNum: 1 | 2) =>
    tickets.filter(t => {
      const s = (t.sprint ?? '').toLowerCase();
      const n = sprintNum.toString();
      return (
        s.includes(`sprint ${n}`) ||
        s.includes(`sprint${n}`) ||
        new RegExp(`\\bsprint.{0,3}${n}\\b`).test(s)
      );
    });

  return (
    <div
      className="relative select-none overflow-auto bg-white"
      style={{ maxHeight: 'calc(100vh - 240px)' }}
    >
      {/* ── STICKY HEADER ────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-20 flex"
        style={{ minWidth: LEFT_WIDTH + totalWidth }}
      >
        {/* Corner cell — sticky left AND top */}
        <div
          className="sticky left-0 z-30 bg-white border-r border-b border-gray-200 flex items-end px-3 pb-1.5 flex-shrink-0"
          style={{ width: LEFT_WIDTH }}
        >
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticket</span>
        </div>

        {/* Sprint bands + day numbers */}
        <div className="flex-shrink-0" style={{ width: totalWidth }}>
          {/* Sprint band row */}
          <div className="flex" style={{ height: 20 }}>
            <div
              className="bg-blue-50 border-b border-r border-blue-200 flex items-center justify-center gap-1.5 flex-shrink-0"
              style={{ width: 5 * DAY_WIDTH }}
            >
              <span className="bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded">Sprint 1</span>
              <span className="text-[10px] text-blue-500 hidden sm:inline">Mar 17–21</span>
            </div>
            <div
              className="bg-purple-50 border-b border-r border-purple-200 flex items-center justify-center gap-1.5 flex-shrink-0"
              style={{ width: 10 * DAY_WIDTH }}
            >
              <span className="bg-purple-600 text-white text-xs font-semibold px-2 py-0.5 rounded">Sprint 2</span>
              <span className="text-[10px] text-purple-500 hidden sm:inline">Mar 22–31</span>
            </div>
            <div
              className="bg-white border-b border-gray-200 flex items-center justify-center flex-shrink-0"
              style={{ width: 7 * DAY_WIDTH }}
            >
              <span className="bg-gray-400 text-white text-xs font-semibold px-2 py-0.5 rounded">Post-Sprint</span>
            </div>
          </div>

          {/* Day number row — milestone diamonds live here */}
          <div className="flex bg-white border-b border-gray-200" style={{ height: 36 }}>
            {days.map((day) => {
              const band = sprintBand(day);
              const bg =
                band === 'sprint1' ? 'bg-blue-50'
                  : band === 'sprint2' ? 'bg-purple-50'
                    : 'bg-white';
              const isToday = day === today;
              const isSprint1End = day === SPRINT1_END;
              const isSprint2End = day === SPRINT2_END;
              return (
                <div
                  key={day}
                  style={{ width: DAY_WIDTH, flexShrink: 0 }}
                  className={`flex items-center justify-center border-r border-gray-100 ${bg} relative`}
                >
                  <span className={`text-[11px] font-mono ${isToday ? 'text-red-600 font-bold' : 'text-gray-400'}`}>
                    {parseInt(day.slice(8, 10), 10)}
                  </span>

                  {/* Sprint 1 End milestone diamond */}
                  {isSprint1End && (
                    <div
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45 shadow-sm cursor-pointer hover:opacity-80 transition-opacity z-10"
                      title="Sprint 1 End — Mar 21"
                      onClick={e => {
                        e.stopPropagation();
                        setMilestonePopover(mp => mp?.sprint === 1 ? null : { sprint: 1, x: e.clientX, y: e.clientY });
                      }}
                    />
                  )}

                  {/* Sprint 2 End milestone diamond */}
                  {isSprint2End && (
                    <div
                      className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-purple-600 rotate-45 shadow-sm cursor-pointer hover:opacity-80 transition-opacity z-10"
                      title="Sprint 2 End — Mar 31"
                      onClick={e => {
                        e.stopPropagation();
                        setMilestonePopover(mp => mp?.sprint === 2 ? null : { sprint: 2, x: e.clientX, y: e.clientY });
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── BODY ROWS ────────────────────────────────────────────────────── */}
      <div style={{ minWidth: LEFT_WIDTH + totalWidth }}>
        {rows.map((row) => {
          if (row.type === 'header') {
            const color = projectColor(row.project);
            return (
              <div key={`h-${row.project}`} className="flex" style={{ height: ROW_HEIGHT }}>
                {/* Left label — sticky */}
                <div
                  className="sticky left-0 z-10 bg-gray-50 border-r border-b border-gray-200 flex items-center gap-1.5 px-2 cursor-pointer hover:bg-gray-100 transition-colors flex-shrink-0"
                  style={{ width: LEFT_WIDTH, borderLeft: `3px solid ${color}` }}
                  onClick={() => setCollapsed(c => ({ ...c, [row.project]: !c[row.project] }))}
                >
                  {collapsed[row.project]
                    ? <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />
                    : <ChevronDown size={13} className="text-gray-400 flex-shrink-0" />
                  }
                  <span className="text-xs font-semibold text-gray-700 truncate">{row.project}</span>
                  <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
                    {projectGroups[row.project]?.length}
                  </span>
                </div>

                {/* Gantt area for header row */}
                <div
                  className="relative border-b border-gray-200 bg-gray-50/80 flex-shrink-0"
                  style={{ width: totalWidth }}
                >
                  {/* Column backgrounds */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {days.map(day => (
                      <div
                        key={day}
                        style={{ width: DAY_WIDTH, flexShrink: 0, background: dayBg(day), borderRight: '1px solid #f3f4f6' }}
                      />
                    ))}
                  </div>
                  {/* Today line */}
                  {todayIdx >= 0 && todayIdx < days.length && (
                    <RowLine x={todayIdx * DAY_WIDTH + DAY_WIDTH / 2} color="rgba(248,113,113,0.6)" />
                  )}
                  {/* Milestone lines */}
                  <RowLine x={sprint1EndIdx * DAY_WIDTH + DAY_WIDTH / 2} color="rgba(239,68,68,0.25)" zIndex={4} />
                  <RowLine x={sprint2EndIdx * DAY_WIDTH + DAY_WIDTH / 2} color="rgba(147,51,234,0.25)" zIndex={4} />
                </div>
              </div>
            );
          }

          // Ticket row
          const t = row.ticket;
          const barEnd = getBarEnd(t.id, t.barEnd);
          const startIdx = daysBetween(GANTT_START, t.barStart);
          const endIdx = daysBetween(GANTT_START, barEnd);
          const barLeft = Math.max(0, startIdx) * DAY_WIDTH + 2;
          const barWidth = Math.max(DAY_WIDTH, (endIdx - Math.max(0, startIdx) + 1) * DAY_WIDTH - 4);
          const isDragging = !!dragEnd[t.id];
          const barColor = projectColor(t.project ?? '');

          return (
            <div key={`t-${t.id}`} className="flex group" style={{ height: ROW_HEIGHT }}>
              {/* Left label — sticky */}
              <div
                className="sticky left-0 z-10 bg-white border-r border-b border-gray-100 flex items-center gap-2 px-4 cursor-pointer group-hover:bg-gray-50 transition-colors flex-shrink-0"
                style={{ width: LEFT_WIDTH }}
                onClick={() => onTicketClick(t)}
              >
                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${priorityDot(t.priority)}`} />
                <span className="text-[11px] font-mono text-gray-400 flex-shrink-0">#{t.number}</span>
                <span className="text-xs font-medium text-gray-700 truncate">{t.title}</span>
              </div>

              {/* Gantt cell */}
              <div
                className="relative border-b border-gray-100 group-hover:bg-gray-50/30 transition-colors flex-shrink-0"
                style={{ width: totalWidth }}
              >
                {/* Column backgrounds */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {days.map(day => (
                    <div
                      key={day}
                      style={{ width: DAY_WIDTH, flexShrink: 0, background: dayBg(day), borderRight: '1px solid #f3f4f6' }}
                    />
                  ))}
                </div>

                {/* Today line */}
                {todayIdx >= 0 && todayIdx < days.length && (
                  <RowLine x={todayIdx * DAY_WIDTH + DAY_WIDTH / 2} color="rgba(248,113,113,0.6)" />
                )}
                {/* Milestone lines */}
                <RowLine x={sprint1EndIdx * DAY_WIDTH + DAY_WIDTH / 2} color="rgba(239,68,68,0.2)" zIndex={4} />
                <RowLine x={sprint2EndIdx * DAY_WIDTH + DAY_WIDTH / 2} color="rgba(147,51,234,0.2)" zIndex={4} />

                {/* Gantt bar */}
                <div
                  style={{
                    position: 'absolute',
                    left: barLeft,
                    top: (ROW_HEIGHT - 22) / 2,
                    width: barWidth,
                    height: 22,
                    backgroundColor: barColor,
                    borderRadius: 4,
                    opacity: isDragging ? 0.85 : 0.88,
                    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.12)',
                    zIndex: 6,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: isDragging ? 'none' : 'opacity 0.1s, box-shadow 0.1s',
                  }}
                  onClick={e => { e.stopPropagation(); onTicketClick(t); }}
                >
                  <span className="text-[10px] font-mono text-white/70 ml-1.5 flex-shrink-0">#{t.number}</span>
                  <span className="text-[11px] font-medium text-white ml-1 truncate flex-1">{t.title}</span>

                  {/* Right-edge drag handle */}
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 10,
                      cursor: 'ew-resize',
                      zIndex: 7,
                      flexShrink: 0,
                    }}
                    className="hover:bg-black/10 rounded-r transition-colors"
                    onPointerDown={e => {
                      e.stopPropagation();
                      // Capture so pointer events keep arriving even outside the element
                      e.currentTarget.setPointerCapture(e.pointerId);
                      dragRef.current = {
                        ticketId: t.id,
                        startX: e.clientX,
                        originalEnd: barEnd,
                        currentEnd: barEnd,
                      };
                    }}
                    onPointerMove={e => {
                      if (!dragRef.current || dragRef.current.ticketId !== t.id) return;
                      const deltaX = e.clientX - dragRef.current.startX;
                      const deltaDays = Math.round(deltaX / DAY_WIDTH);
                      const newMs = parseDate(dragRef.current.originalEnd).getTime() + deltaDays * 86400000;
                      const newEnd = clamp(formatDate(new Date(newMs)));
                      if (newEnd !== dragRef.current.currentEnd) {
                        dragRef.current.currentEnd = newEnd;
                        setDragEnd(prev => ({ ...prev, [t.id]: newEnd }));
                      }
                    }}
                    onPointerUp={e => {
                      e.stopPropagation();
                      if (!dragRef.current || dragRef.current.ticketId !== t.id) return;
                      const { currentEnd, originalEnd, ticketId } = dragRef.current;
                      dragRef.current = null;
                      if (currentEnd !== originalEnd) {
                        onReschedule(ticketId, currentEnd);
                      }
                      setDragEnd(prev => {
                        const next = { ...prev };
                        delete next[ticketId];
                        return next;
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {/* Bottom padding */}
        <div style={{ height: 8 }} />
      </div>

      {/* ── MILESTONE POPOVER ────────────────────────────────────────────── */}
      {milestonePopover && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-64"
          style={{
            left: Math.min(milestonePopover.x + 8, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 272),
            top: milestonePopover.y + 8,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-800">
              {milestonePopover.sprint === 1
                ? '🔴 Sprint 1 End — Mar 21'
                : '🟣 Sprint 2 End — Mar 31'}
            </p>
            <button
              className="text-gray-400 hover:text-gray-600 text-sm leading-none"
              onClick={() => setMilestonePopover(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            {sprintTickets(milestonePopover.sprint).length} tickets in sprint
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {sprintTickets(milestonePopover.sprint).slice(0, 20).map(t => (
              <li
                key={t.id}
                className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 cursor-pointer py-0.5"
                onClick={() => { setMilestonePopover(null); onTicketClick(t); }}
              >
                <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${priorityDot(t.priority)}`} />
                <span className="truncate">#{t.number} {t.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
