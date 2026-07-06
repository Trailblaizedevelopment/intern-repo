'use client';

import React, { useMemo } from 'react';
import type { WindowLayout } from './brain-room-layout';
import { DraggableRoomItem } from './DraggableRoomItem';
import {
  moonPosition,
  skyColorsForPhase,
  sunPosition,
  type DayNightState,
} from './brain-room-day-night';

interface BrainWindowViewProps {
  dayNight: DayNightState;
  windows: WindowLayout[];
  onWindowMove: (id: string, left: number) => void;
}

function starStyle(i: number, variant: number): React.CSSProperties {
  const left = ((i * 47 + variant * 17 + 13) % 88) + 6;
  const top = ((i * 31 + variant * 11 + 7) % 52) + 6;
  const size = (i + variant) % 3 === 0 ? 2 : 1;
  const delay = ((i + variant) % 7) * 0.35;
  return { left: `${left}%`, top: `${top}%`, width: size, height: size, animationDelay: `${delay}s` };
}

function PixelSun({ top, phase }: { top: number; phase: string }) {
  const color = phase === 'dawn' || phase === 'dusk' ? '#FB923C' : '#FDE047';
  return (
    <svg className="brain-pixel-sun" style={{ top: `${top}%` }} width={20} height={20} viewBox="0 0 5 5" shapeRendering="crispEdges" aria-hidden>
      {[[2, 0], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={1} height={1} fill={color} />
      ))}
    </svg>
  );
}

function PixelMoon({ top }: { top: number }) {
  return (
    <svg className="brain-pixel-moon" style={{ top: `${top}%` }} width={16} height={16} viewBox="0 0 4 4" shapeRendering="crispEdges" aria-hidden>
      <rect x={1} y={0} width={2} height={1} fill="#F1F5F9" />
      <rect x={0} y={1} width={3} height={2} fill="#F1F5F9" />
      <rect x={1} y={3} width={2} height={1} fill="#F1F5F9" />
      <rect x={2} y={1} width={1} height={1} fill="#94A3B8" />
    </svg>
  );
}

function PixelCloud({ style }: { style: React.CSSProperties }) {
  return (
    <svg className="brain-pixel-cloud" style={style} width={32} height={12} viewBox="0 0 8 3" shapeRendering="crispEdges" aria-hidden>
      <rect x={2} y={0} width={4} height={1} fill="rgba(255,255,255,0.92)" />
      <rect x={1} y={1} width={6} height={1} fill="rgba(255,255,255,0.92)" />
      <rect x={0} y={2} width={8} height={1} fill="rgba(255,255,255,0.92)" />
    </svg>
  );
}

function PixelFrame() {
  return (
    <>
      <div className="brain-window-frame brain-window-frame--outer" />
      <div className="brain-window-frame brain-window-frame--inner" />
      <div className="brain-window-mullion brain-window-mullion--v" />
      <div className="brain-window-mullion brain-window-mullion--h" />
    </>
  );
}

function PixelSkyBands({ colors }: { colors: ReturnType<typeof skyColorsForPhase> }) {
  const bands = [
    { h: 22, c: colors.top },
    { h: 18, c: colors.mid },
    { h: 16, c: colors.horizon },
    { h: 44, c: colors.ground },
  ];
  let y = 0;
  return (
    <div className="brain-window-sky-bands">
      {bands.map((b, i) => {
        const top = y;
        y += b.h;
        return <div key={i} className="brain-window-sky-band" style={{ top: `${top}%`, height: `${b.h}%`, background: b.c }} />;
      })}
    </div>
  );
}

function PixelHills({ phase }: { phase: string }) {
  const isNight = phase === 'night';
  const back = isNight ? '#0F172A' : '#15803D';
  const front = isNight ? '#020617' : '#166534';
  return (
    <svg className="brain-window-hills-svg" viewBox="0 0 16 6" preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden>
      <rect x={0} y={3} width={16} height={3} fill={front} />
      <rect x={0} y={2} width={4} height={1} fill={back} />
      <rect x={3} y={1} width={5} height={2} fill={back} />
      <rect x={7} y={2} width={5} height={1} fill={back} />
      <rect x={11} y={1} width={5} height={2} fill={back} />
    </svg>
  );
}

function PixelWindowPane({ dayNight, win, index }: { dayNight: DayNightState; win: WindowLayout; index: number }) {
  const sky = skyColorsForPhase(dayNight.phase);
  const sunTop = sunPosition(dayNight.cycle, dayNight.phase) + index * 5;
  const moonTop = moonPosition(dayNight.cycle, dayNight.phase) + index * 4;
  const stars = useMemo(() => Array.from({ length: 14 }, (_, i) => i), []);

  return (
    <div className={`brain-window brain-window--${dayNight.phase} brain-window--medium`}>
      <PixelFrame />
      <div className="brain-window-glass">
        <PixelSkyBands colors={sky} />
        {dayNight.starsVisible && stars.map(i => <span key={i} className="brain-window-star" style={starStyle(i, index)} />)}
        {dayNight.sunVisible && <PixelSun top={sunTop} phase={dayNight.phase} />}
        {dayNight.moonVisible && <PixelMoon top={moonTop} />}
        {(dayNight.phase === 'day' || dayNight.phase === 'dawn') && (
          <>
            <PixelCloud style={{ top: '14%', animationDuration: `${40 + index * 5}s`, animationDelay: `${index * -5}s` }} />
            <PixelCloud style={{ top: '26%', animationDuration: `${52 + index * 3}s`, animationDelay: `${-12 - index * 4}s` }} />
          </>
        )}
        {dayNight.birdsActive && index === 0 && (
          <>
            <div className="brain-window-bird brain-window-bird--a" />
            <div className="brain-window-bird brain-window-bird--b" />
          </>
        )}
        {dayNight.phase === 'night' && <div className="brain-window-city-glow" style={{ animationDelay: `${index}s` }} />}
        <PixelHills phase={dayNight.phase} />
        <div className="brain-window-reflection" />
      </div>
    </div>
  );
}

export function BrainWindowView({ dayNight, windows, onWindowMove }: BrainWindowViewProps) {
  return (
    <div className="brain-windows-row">
      {windows.map((win, index) => (
        <DraggableRoomItem
          key={win.id}
          zone="wall"
          horizontalOnly
          left={win.left}
          width={`${win.width}%`}
          label={`Window ${index + 1}`}
          className="brain-window-slot"
          onMove={({ left }) => onWindowMove(win.id, left)}
        >
          <PixelWindowPane dayNight={dayNight} win={win} index={index} />
        </DraggableRoomItem>
      ))}
    </div>
  );
}
