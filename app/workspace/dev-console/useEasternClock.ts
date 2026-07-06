'use client';

import { useEffect, useState } from 'react';

const TZ = 'America/New_York';

export interface EasternClock {
  /** e.g. "5:42:18 PM" */
  time: string;
  /** e.g. "EDT" or "EST" */
  tzLabel: string;
  /** e.g. "Mon, Jul 6" */
  date: string;
}

function formatEastern(now: Date): EasternClock {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  const tzLabel =
    new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      timeZoneName: 'short',
    })
      .formatToParts(now)
      .find(p => p.type === 'timeZoneName')?.value ?? 'ET';

  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(now);

  return { time, tzLabel, date };
}

export function useEasternClock(tickMs = 1000): EasternClock {
  const [clock, setClock] = useState<EasternClock>(() => formatEastern(new Date()));

  useEffect(() => {
    setClock(formatEastern(new Date()));
    const id = setInterval(() => setClock(formatEastern(new Date())), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  return clock;
}
