/** Human-readable labels for brain_automations schedules. */

export interface AutomationConfig {
  timezone?: string;
  hour?: number;
  minute?: number;
  description?: string;
}

function parseConfig(raw: unknown): AutomationConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  return {
    timezone: typeof c.timezone === 'string' ? c.timezone : undefined,
    hour: typeof c.hour === 'number' ? c.hour : undefined,
    minute: typeof c.minute === 'number' ? c.minute : undefined,
    description: typeof c.description === 'string' ? c.description : undefined,
  };
}

function formatClockTime(hour: number, minute: number): string {
  const h12 = hour % 12 || 12;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const m = minute.toString().padStart(2, '0');
  return `${h12}:${m} ${ampm}`;
}

function timezoneShortLabel(tz: string): string {
  if (tz === 'America/New_York') return 'ET';
  if (tz === 'America/Chicago') return 'CT';
  if (tz === 'America/Denver') return 'MT';
  if (tz === 'America/Los_Angeles') return 'PT';
  return tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
}

/** Parse day-of-week field from standard 5-field cron (minute hour dom month dow). */
function cronDayLabel(dow: string | undefined): string | null {
  if (!dow || dow === '*') return 'Every day';
  if (dow === '1-5' || dow === 'MON-FRI') return 'Weekdays';
  if (dow === '0,6' || dow === '6,0') return 'Weekends';
  if (dow === '1') return 'Mondays';
  if (dow === '5') return 'Fridays';
  return null;
}

export function formatAutomationSchedule(
  schedule: string | null,
  kind: string,
  configRaw: unknown
): string {
  if (kind === 'manual') return 'Manual trigger only';

  const config = parseConfig(configRaw);
  if (config?.description) return config.description;

  const parts = (schedule || '').trim().split(/\s+/);
  const dayLabel = cronDayLabel(parts[4]);

  if (config?.hour != null && config.minute != null) {
    const tz = config.timezone || 'America/New_York';
    const time = formatClockTime(config.hour, config.minute);
    const tzLabel = timezoneShortLabel(tz);
    const prefix = dayLabel ?? 'Scheduled';
    return `${prefix} at ${time} ${tzLabel}`;
  }

  if (parts.length >= 2) {
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    if (!Number.isNaN(minute) && !Number.isNaN(hour)) {
      const prefix = dayLabel ?? 'Scheduled';
      return `${prefix} at ${formatClockTime(hour, minute)} UTC`;
    }
  }

  return schedule || 'Scheduled';
}

export function automationDisplayName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function getLocalParts(
  date: Date,
  timeZone: string
): { hour: number; minute: number; weekday: number; dateKey: string } {
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

  return {
    hour,
    minute,
    weekday: weekdayMap[weekdayStr] ?? 1,
    dateKey: formatDateKey(date, timeZone),
  };
}

function parseAllowedWeekdays(schedule: string | null): Set<number> {
  const dow = (schedule || '').trim().split(/\s+/)[4];
  if (!dow || dow === '*') return new Set([0, 1, 2, 3, 4, 5, 6]);
  if (dow === '1-5' || dow.toUpperCase() === 'MON-FRI') return new Set([1, 2, 3, 4, 5]);
  if (dow === '0,6' || dow === '6,0') return new Set([0, 6]);
  const days = new Set<number>();
  for (const part of dow.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(n => parseInt(n, 10));
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        for (let i = a; i <= b; i++) days.add(i);
      }
    } else {
      const n = parseInt(part, 10);
      if (!Number.isNaN(n)) days.add(n);
    }
  }
  return days.size > 0 ? days : new Set([1, 2, 3, 4, 5]);
}

/** UTC instant for a local date + clock time in an IANA timezone. */
function zonedDateTimeToUtc(dateKey: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  let guess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  for (let i = 0; i < 4; i++) {
    const local = getLocalParts(guess, timeZone);
    const targetMins = hour * 60 + minute;
    const localMins = local.hour * 60 + local.minute;
    let deltaMin = targetMins - localMins;
    if (local.dateKey < dateKey) deltaMin += 24 * 60;
    if (local.dateKey > dateKey) deltaMin -= 24 * 60;
    guess = new Date(guess.getTime() + deltaMin * 60_000);
  }
  return guess;
}

/** Next scheduled run after `from`. Returns null if disabled or manual. */
export function computeNextAutomationRun(
  schedule: string | null,
  kind: string,
  configRaw: unknown,
  enabled: boolean,
  from: Date = new Date()
): Date | null {
  if (!enabled || kind === 'manual') return null;

  const config = parseConfig(configRaw);
  const targetHour = config?.hour ?? 8;
  const targetMinute = config?.minute ?? 30;
  const tz = config?.timezone ?? 'America/New_York';
  const allowed = parseAllowedWeekdays(schedule);

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const probe = new Date(from.getTime() + dayOffset * 86400000);
    const dateKey = formatDateKey(probe, tz);
    const weekday = getLocalParts(probe, tz).weekday;
    if (!allowed.has(weekday)) continue;

    const runAt = zonedDateTimeToUtc(dateKey, targetHour, targetMinute, tz);
    if (runAt > from) return runAt;
  }
  return null;
}

export function formatAutomationDateTime(iso: string, configRaw: unknown): string {
  const config = parseConfig(configRaw);
  const tz = config?.timezone ?? 'America/New_York';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}
