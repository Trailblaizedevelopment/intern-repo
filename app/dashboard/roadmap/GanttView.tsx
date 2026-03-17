'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RoadmapTicket, Employee } from './types';
import {
  ganttDays, daysBetween, formatDate, parseDate, sprintBand,
  priorityDot, projectColor, GANTT_START, DAY_WIDTH, SPRINT1_END, SPRINT2_END, clamp,
} from './utils';

const ROW_HEIGHT = 36;
const LEFT_WIDTH = 240;
const HEADER_H = 56; // Sprint band (20px) + day row (36px)

interface MilestoneTooltipState {
  sprint: 1 | 2;
  x: number;
  y: number;
}

interface GanttViewProps {
  tickets: RoadmapTicket[];
  employees: Employee[];
  onTicketClick: (t: RoadmapTicket) => void;
  onReschedule: (ticketId: string, newEnd: string) => void;
}

interface DragState {
  ticketId: string;
  startMouseX: number;
  originalEnd: string;
  currentEnd: string;
}

export function GanttView({ tickets, employees, onTicketClick, onReschedule }: GanttViewProps) {
  const days = ganttDays();
  const totalWidth = days.length * DAY_WIDTH;
  const today = formatDate(new Date());

  // Collapse state per project name
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const [milestone, setMilestone] = useState<MilestoneTooltipState | null>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);

  // Sync scroll between left and right columns
  const syncScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const src = e.currentTarget;
    const other = src === rightRef.current ? leftRef.current : rightRef.current;
    if (other) other.scrollTop = src.scrollTop;
  }, []);

  // Group tickets by project
  const projectGroups = tickets.reduce<Record<string, RoadmapTicket[]>>((acc, t) => {
    const key = t.project ?? 'No Project';
    (acc[key] = acc[key] || []).push(t);
    return acc;
  }, {});
  const projectNames = Object.keys(projectGroups).sort();

  // Build flat list of visible rows for positioning
  type RowItem = { type: 'header'; project: string } | { type: 'ticket'; ticket: RoadmapTicket };
  const rows: RowItem[] = [];
  for (const proj of projectNames) {
    rows.push({ type: 'header', project: proj });
    if (!collapsed[proj]) {
      for (const t of projectGroups[proj]) {
        rows.push({ type: 'ticket', ticket: t });
      }
    }
  }

  const totalHeight = rows.length * ROW_HEIGHT;

  // Today column index
  const todayIdx = daysBetween(GANTT_START, today);

  // Drag handlers
  const handleBarMouseDown = useCallback((e: React.MouseEvent, ticket: RoadmapTicket) => {
    e.stopPropagation();
    const currentEnd = drag?.ticketId === ticket.id ? drag.currentEnd : ticket.barEnd;
    setDrag({ ticketId: ticket.id, startMouseX: e.clientX, originalEnd: currentEnd, currentEnd });
  }, [drag]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const deltaX = e.clientX - drag.startMouseX;
      const deltaDays = Math.round(deltaX / DAY_WIDTH);
      const origMs = parseDate(drag.originalEnd).getTime();
      const newMs = origMs + deltaDays * 86400000;
      const newEnd = clamp(formatDate(new Date(newMs)));
      setDrag(d => d ? { ...d, currentEnd: newEnd } : null);
    };
    const onUp = () => {
      if (drag) {
        if (drag.currentEnd !== drag.originalEnd) {
          onReschedule(drag.ticketId, drag.currentEnd);
        }
        setDrag(null);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, onReschedule]);

  const getTicketEnd = (ticket: RoadmapTicket) =>
    drag?.ticketId === ticket.id ? drag.currentEnd : ticket.barEnd;

  // Sprint 1/2 ticket lists for milestone tooltips
  const sprint1Tickets = tickets.filter(t => {
    const s = (t.sprint ?? '').toLowerCase();
    return s.includes('sprint 1') || s.includes('sprint1') || /\bsprint.{0,3}1\b/.test(s);
  });
  const sprint2Tickets = tickets.filter(t => {
    const s = (t.sprint ?? '').toLowerCase();
    return s.includes('sprint 2') || s.includes('sprint2') || /\bsprint.{0,3}2\b/.test(s);
  });

  if (tickets.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No tickets match the current filters.
      </div>
    );
  }

  return (
    <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white select-none">
      {/* Left: project groups + ticket names */}
      <div style={{ width: LEFT_WIDTH, minWidth: LEFT_WIDTH }} className="flex flex-col border-r border-gray-200 bg-white">
        {/* Header spacer */}
        <div style={{ height: HEADER_H }} className="border-b border-gray-200 flex items-end px-3 pb-1.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticket</span>
        </div>
        {/* Rows */}
        <div
          ref={leftRef}
          className="overflow-y-auto overflow-x-hidden flex-1"
          onScroll={syncScroll}
          style={{ maxHeight: 'calc(100vh - 260px)' }}
        >
          {rows.map((row) => {
            if (row.type === 'header') {
              const color = projectColor(row.project);
              return (
                <div
                  key={`h-${row.project}`}
                  style={{ height: ROW_HEIGHT, borderLeft: `4px solid ${color}` }}
                  className="flex items-center gap-1.5 px-2 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors duration-100"
                  onClick={() => setCollapsed(c => ({ ...c, [row.project]: !c[row.project] }))}
                >
                  <ChevronDown
                    size={14}
                    className="text-gray-400 flex-shrink-0 transition-transform duration-200"
                    style={{ transform: collapsed[row.project] ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  />
                  <span className="text-xs font-semibold text-gray-700 truncate">{row.project}</span>
                  <span className="ml-auto text-xs text-gray-400 flex-shrink-0">{projectGroups[row.project]?.length}</span>
                </div>
              );
            }
            const t = row.ticket;
            return (
              <div
                key={`t-${t.id}`}
                style={{ height: ROW_HEIGHT, paddingLeft: 16 }}
                className="flex items-center gap-2 pr-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors duration-100"
                onClick={() => onTicketClick(t)}
              >
                <span className={`flex-shrink-0 w-2 h-2 rounded-full ${priorityDot(t.priority)}`} />
                <span className="text-xs font-medium text-gray-700 truncate">{t.title}</span>
              </div>
            );
          })}
          {/* Bottom padding row */}
          <div style={{ height: 8 }} />
        </div>
      </div>

      {/* Right: timeline */}
      <div className="flex-1 overflow-x-auto">
        <div style={{ width: totalWidth, position: 'relative' }}>
          {/* Sprint band header */}
          <div style={{ height: 20, display: 'flex', position: 'sticky', top: 0, zIndex: 10 }}>
            {/* Sprint 1: days 0-4 (Mar 17-21) = 5 days */}
            <div
              style={{ width: 5 * DAY_WIDTH }}
              className="bg-blue-50 border-b border-r border-blue-200 flex items-center justify-center gap-1.5"
            >
              <span className="bg-blue-600 text-white text-xs font-semibold px-2 py-0.5 rounded">Sprint 1</span>
              <span className="text-[10px] text-blue-500 hidden sm:inline">Mar 17–21</span>
            </div>
            {/* Sprint 2: days 5-14 (Mar 22-31) = 10 days */}
            <div
              style={{ width: 10 * DAY_WIDTH }}
              className="bg-purple-50 border-b border-r border-purple-200 flex items-center justify-center gap-1.5"
            >
              <span className="bg-purple-600 text-white text-xs font-semibold px-2 py-0.5 rounded">Sprint 2</span>
              <span className="text-[10px] text-purple-500 hidden sm:inline">Mar 22–31</span>
            </div>
            {/* Post: days 15-21 (Apr 1-7) = 7 days */}
            <div
              style={{ width: 7 * DAY_WIDTH }}
              className="bg-white border-b border-gray-200 flex items-center justify-center gap-1"
            >
              <span className="bg-gray-400 text-white text-xs font-semibold px-2 py-0.5 rounded">Post-Sprint</span>
            </div>
          </div>

          {/* Day headers */}
          <div style={{ height: 36, display: 'flex', position: 'sticky', top: 20, zIndex: 10, background: 'white', borderBottom: '1px solid #e5e7eb' }}>
            {days.map((day) => {
              const band = sprintBand(day);
              const bg = band === 'sprint1' ? 'bg-blue-50' : band === 'sprint2' ? 'bg-purple-50' : 'bg-white';
              const dayNum = parseInt(day.slice(8, 10), 10);
              const isToday = day === today;
              return (
                <div
                  key={day}
                  style={{ width: DAY_WIDTH, flexShrink: 0, position: 'relative' }}
                  className={`flex items-center justify-center border-r border-gray-100 ${bg}`}
                >
                  <span className={`text-[11px] font-mono ${isToday ? 'text-red-600 font-bold' : 'text-gray-400'}`}>{dayNum}</span>
                  {isToday && (
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-red-400" style={{ height: 4 }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Gantt body */}
          <div
            ref={rightRef}
            className="overflow-y-auto overflow-x-hidden"
            onScroll={syncScroll}
            style={{ maxHeight: 'calc(100vh - 260px)', position: 'relative' }}
          >
            {/* Background grid + sprint bands */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none' }}>
              {days.map((day) => {
                const band = sprintBand(day);
                // sprint1: bg-blue-50/60, sprint2: bg-purple-50/40, post: white
                const bg = band === 'sprint1'
                  ? 'rgba(239,246,255,0.6)'
                  : band === 'sprint2'
                    ? 'rgba(245,243,255,0.4)'
                    : '#ffffff';
                return (
                  <div
                    key={day}
                    style={{ width: DAY_WIDTH, flexShrink: 0, background: bg, borderRight: '1px solid #f3f4f6', height: totalHeight + 8 }}
                  />
                );
              })}
            </div>

            {/* Today vertical line */}
            {todayIdx >= 0 && todayIdx < days.length && (
              <div
                style={{
                  position: 'absolute',
                  left: todayIdx * DAY_WIDTH + DAY_WIDTH / 2,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: 'rgba(248,113,113,0.8)',
                  pointerEvents: 'none',
                  zIndex: 5,
                  height: totalHeight + 8,
                }}
              />
            )}

            {/* Milestone: Sprint 1 End (Mar 21 = day 4) */}
            <MilestoneMark
              dayIdx={4}
              colorClass="bg-red-500"
              borderColorClass="border-red-400"
              totalHeight={totalHeight}
              label="Sprint 1 End"
              onClick={(x, y) => setMilestone(ms => ms?.sprint === 1 ? null : { sprint: 1, x, y })}
            />

            {/* Milestone: Sprint 2 End (Mar 31 = day 14) */}
            <MilestoneMark
              dayIdx={14}
              colorClass="bg-purple-600"
              borderColorClass="border-purple-500"
              totalHeight={totalHeight}
              label="Sprint 2 End"
              onClick={(x, y) => setMilestone(ms => ms?.sprint === 2 ? null : { sprint: 2, x, y })}
            />

            {/* Rows */}
            {rows.map((row, i) => {
              const top = i * ROW_HEIGHT;
              if (row.type === 'header') {
                return (
                  <div
                    key={`hr-${row.project}`}
                    style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_HEIGHT }}
                    className="border-b border-gray-200 bg-gray-50/80"
                  />
                );
              }
              const t = row.ticket;
              const barEnd = getTicketEnd(t);
              const startIdx = daysBetween(GANTT_START, t.barStart);
              const endIdx = daysBetween(GANTT_START, barEnd);
              const barLeft = Math.max(0, startIdx) * DAY_WIDTH;
              const barWidth = Math.max(DAY_WIDTH * 0.5, (endIdx - Math.max(0, startIdx) + 1) * DAY_WIDTH - 4);
              const isDragging = drag?.ticketId === t.id;
              const barColor = projectColor(t.project ?? '');

              return (
                <div
                  key={`tr-${t.id}`}
                  style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_HEIGHT }}
                  className="border-b border-gray-100 transition-colors duration-100 hover:bg-gray-50/60"
                >
                  {/* Bar */}
                  <div
                    style={{
                      position: 'absolute',
                      left: barLeft + 2,
                      top: (ROW_HEIGHT - 20) / 2,
                      width: barWidth,
                      height: 20,
                      borderRadius: 2,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      zIndex: 6,
                      boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.2)' : undefined,
                      opacity: isDragging ? 0.85 : 0.9,
                      transition: isDragging ? 'none' : 'opacity 0.1s, box-shadow 0.1s',
                      backgroundColor: barColor,
                    }}
                    className="flex items-center overflow-hidden"
                    onMouseDown={e => handleBarMouseDown(e, t)}
                    onClick={e => {
                      if (!isDragging && Math.abs(e.movementX) < 2) {
                        onTicketClick(t);
                      }
                    }}
                  >
                    {/* Priority dot on left edge */}
                    <span
                      className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ml-1 ${priorityDot(t.priority)}`}
                      style={{ opacity: 1, border: '1px solid rgba(255,255,255,0.5)' }}
                    />
                    {/* Ticket number */}
                    <span className="text-[10px] font-mono text-white/70 ml-1 flex-shrink-0 leading-none">
                      #{t.number}
                    </span>
                    {/* Ticket title */}
                    <span className="text-[11px] font-medium text-white ml-1 truncate leading-none">
                      {t.title}
                    </span>
                  </div>
                </div>
              );
            })}
            {/* Bottom padding */}
            <div style={{ height: totalHeight + 8 }} />
          </div>
        </div>
      </div>

      {/* Milestone tooltip */}
      {milestone && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-64"
          style={{ left: Math.min(milestone.x, window.innerWidth - 270), top: milestone.y + 8 }}
        >
          <p className="text-xs font-semibold text-gray-700 mb-2">
            {milestone.sprint === 1 ? 'Sprint 1 (Mar 17–21)' : 'Sprint 2 (Mar 22–31)'} — {milestone.sprint === 1 ? sprint1Tickets.length : sprint2Tickets.length} tickets
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {(milestone.sprint === 1 ? sprint1Tickets : sprint2Tickets).map(t => (
              <li key={t.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${priorityDot(t.priority)}`} />
                <span className="truncate">#{t.number} {t.title}</span>
              </li>
            ))}
          </ul>
          <button
            className="mt-2 text-xs text-gray-400 hover:text-gray-600"
            onClick={() => setMilestone(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function MilestoneMark({
  dayIdx,
  colorClass,
  borderColorClass,
  totalHeight,
  label,
  onClick,
}: {
  dayIdx: number;
  colorClass: string;
  borderColorClass: string;
  totalHeight: number;
  label: string;
  onClick: (x: number, y: number) => void;
}) {
  const cx = dayIdx * DAY_WIDTH + DAY_WIDTH / 2;
  return (
    <>
      {/* Vertical dashed line */}
      <div
        style={{
          position: 'absolute',
          left: cx,
          top: 0,
          width: 1,
          height: totalHeight + 8,
          borderLeft: '2px dashed',
          pointerEvents: 'none',
          zIndex: 4,
          opacity: 0.4,
        }}
        className={borderColorClass}
      />
      {/* Diamond w-3 h-3 rotate-45 shadow-sm */}
      <div
        style={{
          position: 'absolute',
          left: cx - 6,
          top: 4,
          width: 12,
          height: 12,
          transform: 'rotate(45deg)',
          cursor: 'pointer',
          zIndex: 8,
        }}
        className={`${colorClass} shadow-sm hover:opacity-80 transition-opacity`}
        title={label}
        onClick={e => onClick(e.clientX, e.clientY)}
      />
    </>
  );
}
