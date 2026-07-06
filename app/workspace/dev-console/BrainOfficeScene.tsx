'use client';

import React, { useMemo } from 'react';
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

const P: Record<string, string> = {
  '.': '',
  y: '#FDE68A',
  Y: '#F59E0B',
  f: '#78716C',
  F: '#57534E',
  t: '#92400E',
  T: '#78350F',
  u: '#EDE9FE',
  U: '#FFFFFF',
  p: '#C4A574',
};

type Pixel = { x: number; y: number; fill: string };

function parseGrid(rows: string[]): Pixel[] {
  const out: Pixel[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const fill = P[ch];
      if (fill) out.push({ x, y, fill });
    });
  });
  return out;
}

function PixelSvg({ rows, scale }: { rows: string[]; scale: number }) {
  const w = rows[0]?.length ?? 0;
  const h = rows.length;
  const pixels = useMemo(() => parseGrid(rows), [rows]);
  return (
    <svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" style={{ display: 'block', imageRendering: 'pixelated' }} aria-hidden>
      {pixels.map(({ x, y, fill }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />
      ))}
    </svg>
  );
}

const LAMP = ['....yy....', '...yyyy...', '..yyyyyy..', '....ff....', '....ff....', '...ffff...', '..ffffff..'];
const POSTER = ['tttttt', 'tUUUUt', 'tUpUtU', 'tUUUUt', 'tttttt'];

export function BrainOfficeScene({ connectors, layout, onWindowMove, onWallMove }: BrainOfficeSceneProps) {
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
          <PixelSvg rows={POSTER} scale={3} />
        </DraggableRoomItem>

        <DraggableRoomItem zone="wall" left={layout.wall.lamp.left} top={layout.wall.lamp.top} label="Lamp" onMove={p => onWallMove('lamp', p)}>
          <PixelSvg rows={LAMP} scale={2} />
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
