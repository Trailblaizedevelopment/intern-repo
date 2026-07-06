'use client';

import React from 'react';
import type { BrainRoomLayout } from './brain-room-layout';
import { BrainRoomClock } from './BrainRoomClock';
import { BrainWindowView } from './BrainWindowView';
import { DraggableRoomItem } from './DraggableRoomItem';
import { skyColorsForPhase } from './brain-room-day-night';
import { useDayNightCycle } from './useDayNightCycle';

interface ConnectorStatus {
  id: string;
  label: string;
  available: boolean;
  toolCount: number;
}

interface BrainOfficeSceneProps {
  connectors: ConnectorStatus[];
  layout: BrainRoomLayout;
  onWindowMove: (id: string, left: number) => void;
  onWallMove: (key: keyof BrainRoomLayout['wall'], pos: { left: number; top?: number }) => void;
}

const POSTER = (
  <svg width={18} height={15} viewBox="0 0 6 5" aria-hidden>
    <rect width={6} height={5} rx={0.8} fill="#78350F" />
    <rect x={0.6} y={0.6} width={4.8} height={3.8} rx={0.4} fill="#FFFFFF" />
    <rect x={1.2} y={1.2} width={1.4} height={2.4} rx={0.3} fill="#4338CA" />
    <rect x={3.2} y={1.2} width={1.4} height={2.4} rx={0.3} fill="#059669" />
  </svg>
);

const LAMP = (
  <svg width={20} height={28} viewBox="0 0 10 14" aria-hidden>
    <ellipse cx={5} cy={3} rx={4} ry={3} fill="#FDE68A" />
    <rect x={4.2} y={5.5} width={1.6} height={6} rx={0.6} fill="#78716C" />
    <ellipse cx={5} cy={12.5} rx={3.5} ry={1.2} fill="#57534E" />
  </svg>
);

export function BrainOfficeScene({
  connectors,
  layout,
  onWindowMove,
  onWallMove,
}: BrainOfficeSceneProps) {
  const liveConnectors = connectors.filter(c => c.available);
  const dayNight = useDayNightCycle();
  const sky = skyColorsForPhase(dayNight.phase);

  return (
    <div className={`brain-office brain-office--${dayNight.phase}`} style={{ '--sky-glow': sky.glow } as React.CSSProperties}>
      <div className="brain-office-wall" />
      <div className="brain-office-wall-accent" />
      <div className="brain-office-window-light" />
      <div className="brain-office-floor" />
      <div className="brain-office-baseboard" />

      <div className="brain-office-wall-layer">
        <BrainWindowView dayNight={dayNight} windows={layout.windows} onWindowMove={onWindowMove} />

        <DraggableRoomItem zone="wall" left={layout.wall.poster.left} top={layout.wall.poster.top} label="Poster" onMove={p => onWallMove('poster', p)}>
          {POSTER}
        </DraggableRoomItem>

        <DraggableRoomItem zone="wall" left={layout.wall.lamp.left} top={layout.wall.lamp.top} label="Lamp" onMove={p => onWallMove('lamp', p)}>
          {LAMP}
          <div className={`brain-office-lamp-glow${dayNight.lampOn ? ' brain-office-lamp-glow--on' : ''}`} />
        </DraggableRoomItem>

        <DraggableRoomItem zone="wall" left={layout.wall.clock.left} top={layout.wall.clock.top} label="Clock" onMove={p => onWallMove('clock', p)}>
          <BrainRoomClock phase={dayNight.phase} />
        </DraggableRoomItem>

        <DraggableRoomItem zone="wall" left={layout.wall.connectors.left} top={layout.wall.connectors.top} label="Connectors" onMove={p => onWallMove('connectors', p)}>
          <div className="brain-office-connector-rail">
            {liveConnectors.map(c => (
              <span key={c.id} className="brain-office-chip" title={c.label}>
                {c.id.slice(0, 3)}
              </span>
            ))}
          </div>
        </DraggableRoomItem>
      </div>
    </div>
  );
}
