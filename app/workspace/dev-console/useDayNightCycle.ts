'use client';

import { useEffect, useState } from 'react';
import { getDayNightState, type DayNightState } from './brain-room-day-night';

const TICK_MS = 30_000;

export function useDayNightCycle(): DayNightState {
  const [state, setState] = useState<DayNightState>(() => getDayNightState());

  useEffect(() => {
    setState(getDayNightState());
    const id = setInterval(() => setState(getDayNightState()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return state;
}
