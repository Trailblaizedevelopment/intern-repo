import type { RoadmapTicket } from './types';

// 3-week view: Mar 17 – Apr 7 (22 days)
export const GANTT_START = '2026-03-17';
export const GANTT_END = '2026-04-07';
export const SPRINT1_END = '2026-03-21';
export const SPRINT2_END = '2026-03-31';
export const DAY_WIDTH = 40; // px per day

/** Parse YYYY-MM-DD or ISO string → Date (UTC midnight) */
export function parseDate(s: string): Date {
  const d = s.slice(0, 10);
  return new Date(d + 'T00:00:00Z');
}

/** Format Date → YYYY-MM-DD */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Clamp a YYYY-MM-DD string within the gantt window */
export function clamp(date: string): string {
  if (date < GANTT_START) return GANTT_START;
  if (date > GANTT_END) return GANTT_END;
  return date;
}

/** Number of days between two YYYY-MM-DD strings (b - a) */
export function daysBetween(a: string, b: string): number {
  const msA = parseDate(a).getTime();
  const msB = parseDate(b).getTime();
  return Math.round((msB - msA) / 86400000);
}

/** Derive bar end date from ticket fields */
export function computeBarEnd(ticket: {
  due_date: string | null;
  sprint: string | null;
  priority: string | null;
}): string {
  if (ticket.due_date) return ticket.due_date.slice(0, 10);
  if (ticket.sprint) {
    const s = ticket.sprint.toLowerCase();
    if (s.includes('sprint 1') || s.includes('sprint1') || s.includes('mar 17') || /\bsprint.{0,3}1\b/.test(s)) {
      return SPRINT1_END;
    }
    if (s.includes('sprint 2') || s.includes('sprint2') || s.includes('mar 22') || /\bsprint.{0,3}2\b/.test(s)) {
      return SPRINT2_END;
    }
  }
  if (ticket.priority === 'critical') return SPRINT1_END;
  return SPRINT2_END;
}

/** Build full RoadmapTicket from raw DB row */
export function buildTicket(raw: Omit<RoadmapTicket, 'barStart' | 'barEnd'>): RoadmapTicket {
  const barEnd = clamp(computeBarEnd(raw));
  const rawStart = raw.created_at.slice(0, 10);
  const barStart = clamp(rawStart < barEnd ? rawStart : barEnd);
  return { ...raw, barStart, barEnd };
}

/** Priority color (Tailwind bg class) */
export function priorityColor(priority: string | null): string {
  switch (priority) {
    case 'critical': return 'bg-red-500';
    case 'high':     return 'bg-orange-500';
    case 'medium':   return 'bg-yellow-400';
    case 'low':      return 'bg-gray-400';
    default:         return 'bg-gray-300';
  }
}

/** Priority dot color */
export function priorityDot(priority: string | null): string {
  switch (priority) {
    case 'critical': return 'bg-red-500';
    case 'high':     return 'bg-orange-500';
    case 'medium':   return 'bg-yellow-400';
    case 'low':      return 'bg-gray-400';
    default:         return 'bg-gray-300';
  }
}

/** Status pill styling */
export function statusPill(status: string | null): string {
  switch (status) {
    case 'open':        return 'bg-blue-100 text-blue-800';
    case 'in_progress': return 'bg-purple-100 text-purple-800';
    case 'in_review':   return 'bg-yellow-100 text-yellow-800';
    case 'done':
    case 'resolved':    return 'bg-green-100 text-green-800';
    case 'backlog':     return 'bg-gray-100 text-gray-600';
    default:            return 'bg-gray-100 text-gray-600';
  }
}

/** Generate array of 22 days YYYY-MM-DD strings */
export function ganttDays(): string[] {
  const days: string[] = [];
  const start = parseDate(GANTT_START);
  for (let i = 0; i < 22; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    days.push(formatDate(d));
  }
  return days;
}

export function sprintBand(day: string): 'sprint1' | 'sprint2' | 'post' {
  if (day >= '2026-03-17' && day <= '2026-03-21') return 'sprint1';
  if (day >= '2026-03-22' && day <= '2026-03-31') return 'sprint2';
  return 'post';
}

export function bandBg(band: 'sprint1' | 'sprint2' | 'post'): string {
  switch (band) {
    case 'sprint1': return 'bg-blue-50';
    case 'sprint2': return 'bg-purple-50';
    default: return 'bg-white';
  }
}

export function sprintLabel(sprint: string | null): string {
  if (!sprint) return '—';
  const s = sprint.toLowerCase();
  if (s.includes('sprint 1') || s.includes('sprint1') || /\bsprint.{0,3}1\b/.test(s)) return 'Sprint 1';
  if (s.includes('sprint 2') || s.includes('sprint2') || /\bsprint.{0,3}2\b/.test(s)) return 'Sprint 2';
  return sprint;
}
