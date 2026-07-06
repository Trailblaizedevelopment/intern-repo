const TZ = 'America/New_York';

export function getBrainTimezone(): string {
  return process.env.BRAIN_BRIEFING_TIMEZONE || TZ;
}

/** YYYY-MM-DD in company timezone. */
export function formatDateKey(date: Date, timeZone = getBrainTimezone()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    date
  );
}

export function formatDateLabel(date: Date, timeZone = getBrainTimezone()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** Local hour (0–23) and minute in company timezone. */
export function getLocalParts(date: Date, timeZone = getBrainTimezone()): { hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Mon';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour, minute, weekday: weekdayMap[weekdayStr] ?? 1 };
}

/** True when within the morning briefing window (weekdays ~8:30 ET). */
export function isMorningBriefingWindow(
  date: Date,
  targetHour = parseInt(process.env.BRAIN_BRIEFING_HOUR || '8', 10),
  targetMinute = parseInt(process.env.BRAIN_BRIEFING_MINUTE || '30', 10),
  timeZone = getBrainTimezone()
): boolean {
  const { hour, minute, weekday } = getLocalParts(date, timeZone);
  if (weekday === 0 || weekday === 6) return false;
  const nowMins = hour * 60 + minute;
  const targetMins = targetHour * 60 + targetMinute;
  return nowMins >= targetMins - 5 && nowMins <= targetMins + 10;
}

/** Start of calendar day N days ago in ET, as ISO UTC boundary for Linear filters. */
export function dayBoundsIso(daysAgo: number, timeZone = getBrainTimezone()): { start: string; end: string } {
  const now = new Date();
  const todayKey = formatDateKey(now, timeZone);
  const [y, m, d] = todayKey.split('-').map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(utcMidnight);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
