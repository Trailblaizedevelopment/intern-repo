/**
 * Linq line management utilities.
 * Use these instead of hardcoded LINES arrays when building outreach batches.
 * Server-side only.
 */

export interface LinqLineConfig {
  line_number: number;
  label: string;
  line_phone: string;
  daily_limit: number;
  is_paused: boolean;
  pause_reason: string | null;
}

const DEFAULT_LINES: LinqLineConfig[] = [
  { line_number: 1, label: 'Owen', line_phone: '+16462101111', daily_limit: 45, is_paused: false, pause_reason: null },
  { line_number: 2, label: 'Adam', line_phone: '+16462668785', daily_limit: 45, is_paused: false, pause_reason: null },
  { line_number: 3, label: 'Ford', line_phone: '+16462442696', daily_limit: 45, is_paused: false, pause_reason: null },
];

/**
 * Fetch line configs from the DB (falls back to defaults if table missing).
 * Returns all lines including paused ones — callers filter as needed.
 */
export async function fetchLineConfigs(): Promise<LinqLineConfig[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/linq/lines`, {
      headers: { 'x-api-key': process.env.INTERNAL_API_KEY || '' },
      cache: 'no-store',
    });
    if (!res.ok) return DEFAULT_LINES;
    const json = await res.json();
    return json.data || DEFAULT_LINES;
  } catch {
    return DEFAULT_LINES;
  }
}

/**
 * Returns only active (non-paused) lines, with quota redistributed.
 *
 * Total pool = sum of daily_limit across all lines (default 135).
 * Active lines split the total pool evenly, capped at 50 per line for safety.
 *
 * Example: Owen paused (45) → Adam and Ford each get 67 (135/2 = 67.5, floored to 67).
 * If only 1 line active: that line gets min(total_pool, 50) contacts.
 */
export function getActiveLines(lines: LinqLineConfig[]): Array<LinqLineConfig & { effective_limit: number }> {
  const active = lines.filter(l => !l.is_paused);
  if (active.length === 0) return [];

  const totalPool = lines.reduce((sum, l) => sum + l.daily_limit, 0);
  const perLine = Math.floor(totalPool / active.length);
  const MAX_PER_LINE = 50; // hard safety cap

  return active.map(line => ({
    ...line,
    effective_limit: Math.min(perLine, MAX_PER_LINE),
  }));
}
