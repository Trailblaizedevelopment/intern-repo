'use client';

import React from 'react';
import type { SkyPhase } from './brain-room-day-night';
import { useEasternClock } from './useEasternClock';

interface BrainRoomClockProps {
  phase: SkyPhase;
}

export function BrainRoomClock({ phase }: BrainRoomClockProps) {
  const { time, tzLabel, date } = useEasternClock();

  return (
    <div className={`brain-room-clock brain-room-clock--${phase}`} aria-label={`Eastern time: ${time} ${tzLabel}`}>
      <div className="brain-room-clock-bezel">
        <div className="brain-room-clock-display">
          <span className="brain-room-clock-time">{time}</span>
          <span className="brain-room-clock-meta">
            <span className="brain-room-clock-tz">{tzLabel}</span>
            <span className="brain-room-clock-date">{date}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
