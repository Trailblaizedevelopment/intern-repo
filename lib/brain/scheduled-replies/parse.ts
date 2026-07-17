/**
 * Parse Slack "wake/ready/remind at 6am" style prompts into a due timestamp.
 * TRA-921
 */

export function getScheduleTimezone(): string {
  return (
    process.env.BRAIN_SCHEDULE_TIMEZONE?.trim() ||
    process.env.BRAIN_BRIEFING_TIMEZONE?.trim() ||
    'America/New_York'
  );
}

export interface ParsedScheduleIntent {
  dueAt: Date;
  label: string;
  kind: 'remind' | 'wake_ready';
}

const CANCEL_RE =
  /\b(cancel|never\s*mind|nvm)\b.{0,40}\b(reminder|ping|follow[-\s]?up|wake|6\s*am)\b|\b(cancel|never\s*mind|nvm)\s+(the\s+)?(reminder|ping|follow[-\s]?up)\b/i;

const SCHEDULE_VERB_RE =
  /\b(remind\s+me|ping\s+me|wake\s*(me\s*)?up|i('?ll| will)\s+(wake|be\s+ready|be\s+back|check\s+in)|see\s+you|check\s+in|ready\s+at|back\s+at|follow\s*up)\b/i;

const TIME_RE =
  /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b|\b(?:at\s+)?(\d{1,2}):(\d{2})\b/i;

const TOMORROW_RE = /\btomorrow\b/i;
const TODAY_RE = /\btoday\b/i;

export function isCancelScheduleIntent(message: string): boolean {
  return CANCEL_RE.test(message.trim());
}

export function isScheduleFollowUpIntent(message: string): boolean {
  const text = message.trim();
  if (!text || isCancelScheduleIntent(text)) return false;
  if (!SCHEDULE_VERB_RE.test(text)) return false;
  return TIME_RE.test(text);
}

function zonedParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
  };
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 4; i++) {
    const local = zonedParts(guess, timeZone);
    const targetMins = hour * 60 + minute;
    const localMins = local.hour * 60 + local.minute;
    let deltaMin = targetMins - localMins;
    const localKey = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
    if (localKey < dateKey) deltaMin += 24 * 60;
    if (localKey > dateKey) deltaMin -= 24 * 60;
    guess = new Date(guess.getTime() + deltaMin * 60_000);
  }
  return guess;
}

function addLocalDays(
  year: number,
  month: number,
  day: number,
  days: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function parseClock(text: string): { hour24: number; minute: number; label: string } | null {
  const match = text.match(TIME_RE);
  if (!match) return null;

  // 24h form: 18:30
  if (match[4] != null && match[5] != null) {
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) return null;
    return {
      hour24: hour,
      minute,
      label: `${hour}:${String(minute).padStart(2, '0')}`,
    };
  }

  const hourRaw = parseInt(match[1], 10);
  const minute = match[2] != null ? parseInt(match[2], 10) : 0;
  const ampm = (match[3] || '').toLowerCase().replace(/\./g, '');
  if (Number.isNaN(hourRaw) || Number.isNaN(minute) || minute > 59) return null;

  let hour24: number;
  if (ampm.startsWith('a')) {
    if (hourRaw < 1 || hourRaw > 12) return null;
    hour24 = hourRaw % 12;
  } else if (ampm.startsWith('p')) {
    if (hourRaw < 1 || hourRaw > 12) return null;
    hour24 = (hourRaw % 12) + 12;
  } else if (hourRaw >= 0 && hourRaw <= 23) {
    // Bare hour: treat 1–11 as morning (wake/ready default), 12 as noon, 13–23 as 24h
    hour24 = hourRaw === 12 ? 12 : hourRaw;
  } else {
    return null;
  }

  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const displayHour = hour24 % 12 || 12;
  return {
    hour24,
    minute,
    label: minute
      ? `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`
      : `${displayHour} ${suffix}`,
  };
}

/** Parse a schedule follow-up intent. Returns null when not a schedule ask. */
export function parseScheduleFollowUpIntent(
  message: string,
  now: Date = new Date(),
  timeZone: string = getScheduleTimezone()
): ParsedScheduleIntent | null {
  const text = message.trim();
  if (!isScheduleFollowUpIntent(text)) return null;

  const clock = parseClock(text);
  if (!clock) return null;

  const local = zonedParts(now, timeZone);
  let target = { year: local.year, month: local.month, day: local.day };

  if (TOMORROW_RE.test(text)) {
    target = addLocalDays(target.year, target.month, target.day, 1);
  } else if (!TODAY_RE.test(text)) {
    // If that clock time already passed locally, roll to tomorrow
    const candidate = zonedDateTimeToUtc(
      target.year,
      target.month,
      target.day,
      clock.hour24,
      clock.minute,
      timeZone
    );
    if (candidate.getTime() <= now.getTime() + 60_000) {
      target = addLocalDays(target.year, target.month, target.day, 1);
    }
  }

  const dueAt = zonedDateTimeToUtc(
    target.year,
    target.month,
    target.day,
    clock.hour24,
    clock.minute,
    timeZone
  );

  const kind: ParsedScheduleIntent['kind'] = /\b(remind|ping)\b/i.test(text)
    ? 'remind'
    : 'wake_ready';

  const dueLocal = zonedParts(dueAt, timeZone);
  const nowKey = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
  const dueKey = `${dueLocal.year}-${String(dueLocal.month).padStart(2, '0')}-${String(dueLocal.day).padStart(2, '0')}`;
  const dayLabel = TOMORROW_RE.test(text)
    ? 'tomorrow'
    : dueKey === nowKey
      ? 'today'
      : 'tomorrow';

  return {
    dueAt,
    label: `${dayLabel} ${clock.label}`.replace(/\s+/g, ' ').trim(),
    kind,
  };
}

export function formatScheduledDueLabel(dueAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(dueAt);
}

export function buildScheduledReplyBody(kind: ParsedScheduleIntent['kind']): string {
  if (kind === 'remind') {
    return [
      '*Scheduled check-in*',
      '',
      "I'm here — what do you want to ship or check next?",
    ].join('\n');
  }
  return [
    '*Good morning — scheduled check-in*',
    '',
    "You said you'd be ready. What's first — ticket status, Cursor handoff, or pipeline?",
  ].join('\n');
}
