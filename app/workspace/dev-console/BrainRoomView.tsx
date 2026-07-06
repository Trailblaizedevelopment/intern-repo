'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { BrainCharacterSprite, type BrainMood } from './BrainCharacterSprite';
import { BrainOfficeScene } from './BrainOfficeScene';
import { useBrainRoomLayout } from './useBrainRoomLayout';
import { useBrainRoomMovement } from './useBrainRoomMovement';
import type { AgentRunStats } from './AgentRunsPanel';

interface ConnectorStatus {
  id: string;
  label: string;
  available: boolean;
  toolCount: number;
}

interface BrainRoomViewProps {
  agentRunStats: AgentRunStats;
  activeTasks: number;
  connectors: ConnectorStatus[];
  runningNow: number;
}

function deriveMood(runningNow: number, activeTasks: number): BrainMood {
  if (runningNow > 0) return 'thinking';
  if (activeTasks > 0) return 'working';
  return 'idle';
}

const MOOD_COPY: Record<BrainMood, string[]> = {
  idle: ['Resting… ping me in Slack!', 'Systems nominal.', 'Grabbing coffee…'],
  thinking: ['Processing your request…', 'Calling tools…', 'Reading the board…'],
  working: ['Orchestrating a task…', 'Cursor might be busy.', 'Long-running goal in progress.'],
  celebrating: ['Done!', 'That run finished.', 'Nice — check Ops for details.'],
};

export function BrainRoomView({ agentRunStats, activeTasks, connectors, runningNow }: BrainRoomViewProps) {
  const [poke, setPoke] = useState(false);
  const [bubbleIdx, setBubbleIdx] = useState(0);
  const [flashCelebrate, setFlashCelebrate] = useState(false);

  const { layout, updateWindow, updateWallItem, resetLayout } = useBrainRoomLayout();

  const mood = useMemo(
    () => (flashCelebrate ? 'celebrating' : deriveMood(runningNow, activeTasks)),
    [runningNow, activeTasks, flashCelebrate]
  );

  const { posX, facing, isWalking, walkFrame } = useBrainRoomMovement({ mood });

  const copy = MOOD_COPY[mood];
  const bubble = copy[bubbleIdx % copy.length];

  useEffect(() => {
    const id = setInterval(() => setBubbleIdx(i => i + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const prevRunning = React.useRef(runningNow);
  useEffect(() => {
    if (prevRunning.current > 0 && runningNow === 0) {
      setFlashCelebrate(true);
      const t = setTimeout(() => setFlashCelebrate(false), 3000);
      prevRunning.current = runningNow;
      return () => clearTimeout(t);
    }
    prevRunning.current = runningNow;
  }, [runningNow]);

  const handlePoke = useCallback(() => {
    setPoke(true);
    setTimeout(() => setPoke(false), 600);
  }, []);

  return (
    <div className="dev-console-room" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
      <div className="brain-room-scene">
        <BrainOfficeScene
          connectors={connectors}
          layout={layout}
          onWindowMove={(id, left) => updateWindow(id, { left })}
          onWallMove={(key, pos) => updateWallItem(key, pos)}
        />

        <div className="brain-room-character-layer">
          <div className="brain-room-character" style={{ left: `${posX}%` }}>
            <div className="brain-room-bubble">{bubble}</div>
            <button
              type="button"
              className="brain-room-character-hit"
              onClick={handlePoke}
              aria-label="Poke Brain"
            >
              <BrainCharacterSprite
                mood={mood}
                poke={poke}
                facing={facing}
                isWalking={isWalking}
                walkFrame={walkFrame}
              />
            </button>
            <span className="brain-room-label">Trailblaize Brain</span>
          </div>
        </div>
      </div>

      <div className="dev-console-room-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '14px 18px', borderTop: '1px solid #E5E7EB', background: '#FAFAFA' }}>
        <StatusChip label="Live runs" value={String(runningNow)} accent={runningNow > 0 ? '#4F46E5' : '#9CA3AF'} />
        <StatusChip label="Active tasks" value={String(activeTasks)} accent={activeTasks > 0 ? '#B45309' : '#9CA3AF'} />
        <StatusChip label="24h runs" value={String(agentRunStats.runs24h)} accent="#4338CA" />
        <StatusChip label="Success" value={`${agentRunStats.successRate24h}%`} accent="#059669" />
        <div className="dev-console-room-slack-hint" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#6B7280' }}>
          <MessageSquare size={14} />
          Chat in Slack to interact
        </div>
      </div>

      <p className="dev-console-room-footer" style={{ margin: 0, padding: '10px 18px 14px', fontSize: '0.6875rem', color: '#9CA3AF', lineHeight: 1.5 }}>
        Drag ⠿ handles to arrange the room — layout saves automatically.{' '}
        <button type="button" onClick={resetLayout} style={{ background: 'none', border: 'none', padding: 0, color: '#92400E', cursor: 'pointer', fontSize: 'inherit' }}>
          Reset layout
        </button>
      </p>

      <style jsx global>{`
        .brain-room-scene {
          position: relative;
          height: 360px;
          overflow: hidden;
          background: #DDD0C0;
        }

        .brain-office {
          position: absolute;
          inset: 0;
        }
        .brain-office-wall {
          position: absolute;
          inset: 0 0 34%;
          background: #F5F0E8;
          transition: background 3s ease;
        }
        .brain-office--dawn .brain-office-wall { background: #F0E8DC; }
        .brain-office--day .brain-office-wall { background: #FAF7F2; }
        .brain-office--dusk .brain-office-wall { background: #EDE4D4; }
        .brain-office--night .brain-office-wall { background: #DDD0C0; }
        .brain-office-wall::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            repeating-linear-gradient(
              0deg,
              transparent 0px,
              transparent 7px,
              rgba(120, 90, 60, 0.04) 7px,
              rgba(120, 90, 60, 0.04) 8px
            ),
            repeating-linear-gradient(
              90deg,
              transparent 0px,
              transparent 15px,
              rgba(120, 90, 60, 0.03) 15px,
              rgba(120, 90, 60, 0.03) 16px
            );
          image-rendering: pixelated;
          pointer-events: none;
        }
        .brain-office-window-light {
          position: absolute;
          inset: 0 0 34% 0;
          background: repeating-linear-gradient(
            90deg,
            var(--sky-glow, rgba(255, 220, 160, 0.12)) 0%,
            transparent 18%,
            var(--sky-glow, rgba(255, 220, 160, 0.08)) 19.5%,
            transparent 32.5%,
            var(--sky-glow, rgba(255, 220, 160, 0.06)) 44%,
            transparent 55%,
            var(--sky-glow, rgba(255, 220, 160, 0.08)) 62%,
            transparent 75%,
            var(--sky-glow, rgba(255, 220, 160, 0.1)) 76.5%,
            transparent 100%
          );
          pointer-events: none;
          z-index: 1;
          transition: background 3s ease;
          opacity: 0.9;
        }
        .brain-office-wall-accent {
          position: absolute;
          left: 0;
          right: 0;
          top: 38%;
          height: 6px;
          background: #C4A574;
          opacity: 0.65;
        }
        .brain-office-floor {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 34%;
          background: #A68452;
          background-image: repeating-linear-gradient(
            90deg,
            #B8956A 0px,
            #B8956A 14px,
            #9A7548 14px,
            #9A7548 15px,
            #A68452 15px,
            #A68452 29px,
            #8B6B42 29px,
            #8B6B42 30px
          );
          image-rendering: pixelated;
        }
        .brain-office-floor::after {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent 0px,
            transparent 23px,
            rgba(60, 40, 20, 0.12) 23px,
            rgba(60, 40, 20, 0.12) 24px
          );
          pointer-events: none;
        }
        .brain-office-baseboard {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 34%;
          height: 5px;
          background: #8B6914;
          z-index: 5;
        }

        .brain-office-wall-layer {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 34%;
          z-index: 2;
          overflow: hidden;
          pointer-events: none;
        }
        .brain-office-wall-layer > * {
          pointer-events: auto;
        }

        .brain-room-draggable {
          position: absolute;
          z-index: 3;
          cursor: grab;
          touch-action: none;
        }
        .brain-room-draggable:active {
          cursor: grabbing;
          z-index: 25;
        }
        .brain-room-drag-handle {
          position: absolute;
          top: 2px;
          right: 2px;
          font-size: 0.5625rem;
          color: rgba(90, 70, 50, 0.45);
          opacity: 0;
          transition: opacity 0.15s;
          line-height: 1;
          pointer-events: none;
          z-index: 2;
        }
        .brain-room-draggable:hover .brain-room-drag-handle {
          opacity: 1;
        }

        .brain-room-character-layer {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 40%;
          z-index: 15;
          pointer-events: none;
        }

        /* Floor-to-ceiling pixel windows (3 draggable) */
        .brain-windows-row {
          position: absolute;
          inset: 0;
        }
        .brain-window-slot {
          z-index: 3;
        }
        .brain-window-slot .brain-window {
          position: absolute;
          inset: 0;
          width: 100%;
          left: 0;
        }
        .brain-window {
          z-index: 1;
        }
        .brain-window-frame {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 6;
        }
        .brain-window-frame--outer {
          border: 4px solid #78350F;
          box-shadow: inset 0 0 0 2px #92400E, inset 0 0 0 4px #57534E;
          image-rendering: pixelated;
        }
        .brain-window-frame--inner {
          inset: 6px;
          border: 2px solid #A68452;
        }
        .brain-window-glass {
          position: absolute;
          inset: 8px;
          overflow: hidden;
          background: #0f172a;
          image-rendering: pixelated;
        }
        .brain-window-sky-bands {
          position: absolute;
          inset: 0;
        }
        .brain-window-sky-band {
          position: absolute;
          left: 0;
          right: 0;
          transition: background 3s ease;
        }
        .brain-window-mullion {
          position: absolute;
          background: #92400E;
          z-index: 6;
          pointer-events: none;
          image-rendering: pixelated;
        }
        .brain-window-mullion--v {
          top: 8px;
          bottom: 8px;
          left: 50%;
          width: 2px;
          transform: translateX(-50%);
        }
        .brain-window-mullion--v2 {
          top: 8px;
          bottom: 8px;
          left: 33%;
          width: 2px;
        }
        .brain-window-mullion--h {
          left: 8px;
          right: 8px;
          top: 45%;
          height: 2px;
        }
        .brain-window--full .brain-window-mullion--v2 { display: block; }
        .brain-window--medium .brain-window-mullion--v2,
        .brain-window--compact .brain-window-mullion--v2 { display: none; }
        .brain-pixel-sun,
        .brain-pixel-moon {
          position: absolute;
          left: 55%;
          transform: translateX(-50%);
          image-rendering: pixelated;
          transition: top 3s ease;
          z-index: 2;
        }
        .brain-window-star {
          position: absolute;
          background: white;
          image-rendering: pixelated;
          animation: star-twinkle 2.4s ease-in-out infinite;
        }
        .brain-pixel-cloud {
          position: absolute;
          left: -40px;
          image-rendering: pixelated;
          animation: cloud-drift 42s linear infinite;
          z-index: 3;
        }
        .brain-window-bird {
          position: absolute;
          animation: bird-fly 18s linear infinite;
          z-index: 4;
          image-rendering: pixelated;
        }
        .brain-window-bird::before {
          content: 'v';
          font-family: ui-monospace, monospace;
          font-size: 0.5rem;
          font-weight: 700;
          color: #1e293b;
        }
        .brain-window-bird--a { top: 28%; }
        .brain-window-bird--b { top: 38%; animation-delay: -9s; animation-duration: 22s; }
        .brain-window-hills-svg {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 12%;
          height: 22%;
          width: 100%;
          z-index: 1;
        }
        .brain-window-treeline {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 11%;
          height: 12%;
          z-index: 2;
        }
        .brain-window-tree {
          position: absolute;
          bottom: 0;
          width: 6px;
          height: 10px;
          background: #14532d;
          image-rendering: pixelated;
          clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
        }
        .brain-window--night .brain-window-tree { background: #0f172a; }
        .brain-window-city-glow {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 12%;
          height: 6%;
          background: repeating-linear-gradient(
            90deg,
            transparent 0px,
            transparent 6px,
            rgba(253, 224, 71, 0.4) 6px,
            rgba(253, 224, 71, 0.4) 8px
          );
          image-rendering: pixelated;
          animation: city-flicker 4s step-end infinite;
          z-index: 2;
        }
        .brain-window-reflection {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.04) 0px,
            rgba(255, 255, 255, 0.04) 2px,
            transparent 2px,
            transparent 6px
          );
          pointer-events: none;
          z-index: 5;
        }

        .brain-office-connector-rail {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .brain-office-lamp-glow {
          position: absolute;
          bottom: -20px;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 40px;
          background: radial-gradient(ellipse, rgba(253, 230, 138, 0.25) 0%, transparent 70%);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.4s;
        }
        .brain-office-lamp-glow--on {
          opacity: 1;
        }

        .brain-room-clock {
          position: relative;
          top: auto;
          right: auto;
        }
        .brain-room-clock-bezel {
          padding: 3px;
          background: #1f2937;
          border: 3px solid #374151;
          box-shadow:
            inset 0 0 0 1px #111827,
            0 2px 0 #111827,
            0 0 10px rgba(0, 0, 0, 0.35);
          image-rendering: pixelated;
        }
        .brain-room-clock-display {
          background: #0a0f1a;
          padding: 6px 10px;
          min-width: 118px;
          border: 2px solid #111827;
        }
        .brain-room-clock-time {
          display: block;
          font-family: ui-monospace, 'Courier New', monospace;
          font-size: 0.8125rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.06em;
          color: #34d399;
          text-shadow: 0 0 8px rgba(52, 211, 153, 0.45);
          line-height: 1.2;
          image-rendering: pixelated;
        }
        .brain-room-clock-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 3px;
          gap: 8px;
        }
        .brain-room-clock-tz {
          font-family: ui-monospace, monospace;
          font-size: 0.5rem;
          font-weight: 700;
          color: #6ee7b7;
          letter-spacing: 0.08em;
        }
        .brain-room-clock-date {
          font-family: ui-monospace, monospace;
          font-size: 0.5rem;
          color: #059669;
          opacity: 0.85;
          white-space: nowrap;
        }
        .brain-room-clock--dusk .brain-room-clock-time,
        .brain-room-clock--night .brain-room-clock-time {
          color: #fde68a;
          text-shadow: 0 0 10px rgba(253, 230, 138, 0.5);
        }
        .brain-room-clock--dusk .brain-room-clock-tz,
        .brain-room-clock--night .brain-room-clock-tz {
          color: #fcd34d;
        }
        .brain-room-clock--dawn .brain-room-clock-time {
          color: #fb923c;
          text-shadow: 0 0 8px rgba(251, 146, 60, 0.4);
        }

        .brain-office-chip {
          font-size: 0.5rem;
          font-weight: 700;
          padding: 2px 5px;
          background: #059669;
          color: white;
          border-radius: 3px;
          font-family: ui-monospace, monospace;
          text-transform: uppercase;
          box-shadow: 0 1px 0 rgba(0,0,0,0.2);
        }

        .brain-room-character {
          position: absolute;
          bottom: 32%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0;
          z-index: 10;
          transition: left 0.05s linear;
          pointer-events: none;
        }
        .brain-room-character-hit {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          pointer-events: auto;
          line-height: 0;
        }
        .brain-room-character-hit:focus-visible {
          outline: 2px solid #C4A574;
          outline-offset: 3px;
        }
        .brain-room-bubble {
          position: absolute;
          bottom: 100%;
          margin-bottom: 8px;
          max-width: 220px;
          padding: 8px 12px;
          background: white;
          border-radius: 12px;
          font-size: 0.75rem;
          color: #374151;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          white-space: nowrap;
          z-index: 6;
        }
        .brain-room-bubble::after {
          content: '';
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: white;
        }
        .brain-room-label {
          margin-top: 4px;
          font-size: 0.625rem;
          font-weight: 600;
          color: #57534E;
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
        }

        .brain-char {
          position: relative;
          flex-shrink: 0;
        }
        .brain-char svg {
          display: block;
          image-rendering: pixelated;
        }
        .brain-char--blob .brain-char-body {
          transform-origin: center bottom;
        }
        .brain-char--pulse {
          animation: blob-pulse 1.1s ease-in-out infinite;
        }
        @keyframes blob-pulse {
          0%, 100% { transform: scale(1, 1); }
          50% { transform: scale(1.04, 0.96); }
        }
        .brain-char--walk {
          animation: walk-bob 0.165s steps(1) infinite;
        }
        .brain-char--bob {
          animation: brain-bob 0.7s ease-in-out infinite;
        }
        .brain-char--lean {
          animation: brain-lean 1.4s ease-in-out infinite;
        }
        .brain-char--celebrating.brain-char--bob {
          animation: brain-celebrate 0.42s ease-in-out infinite;
        }
        .brain-char--walk-left .brain-char-body {
          transform: rotate(-3deg);
        }
        .brain-char--walk-right .brain-char-body {
          transform: rotate(3deg);
        }
        .brain-char-body {
          transform-origin: center bottom;
          image-rendering: pixelated;
        }
        .brain-char-body--poke {
          animation: char-poke-hop 0.45s ease;
        }
        @keyframes char-poke-hop {
          0%, 100% { transform: translateY(0); }
          35% { transform: translateY(-10px); }
          55% { transform: translateY(-2px); }
        }
        .brain-char-thought {
          position: absolute;
          top: -28px;
          right: -6px;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          pointer-events: none;
        }
        .brain-char-thought-dot {
          background: white;
          border-radius: 50%;
          opacity: 0.85;
        }
        .brain-char-thought-dot--sm { width: 4px; height: 4px; animation: thought-float 1.2s ease-in-out infinite; }
        .brain-char-thought-dot--md { width: 7px; height: 7px; animation: thought-float 1.2s ease-in-out 0.15s infinite; }
        .brain-char-thought-dot--lg {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          color: #4338CA;
          animation: thought-float 1.2s ease-in-out 0.3s infinite;
        }
        .brain-char-sparkle {
          position: absolute;
          top: -8px;
          left: -10px;
          font-size: 1rem;
          color: #FDE68A;
          animation: sparkle-spin 0.8s linear infinite;
          pointer-events: none;
        }

        @keyframes walk-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        @keyframes brain-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes brain-lean {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-2px) rotate(-2deg); }
        }
        @keyframes brain-celebrate {
          0%, 100% { transform: translateY(0) scale(1); }
          40% { transform: translateY(-10px) scale(1.04); }
        }
        @keyframes thought-float {
          0%, 100% { opacity: 0.45; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes sparkle-spin {
          0% { transform: rotate(0deg) scale(1); opacity: 1; }
          50% { transform: rotate(180deg) scale(1.2); opacity: 0.7; }
          100% { transform: rotate(360deg) scale(1); opacity: 1; }
        }
        @keyframes cloud-drift {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(100% + 120%)); }
        }
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes bird-fly {
          0% { left: -10%; transform: scaleX(1); }
          49% { transform: scaleX(1); }
          50% { left: 110%; transform: scaleX(-1); }
          99% { transform: scaleX(-1); }
          100% { left: -10%; transform: scaleX(1); }
        }
        @keyframes city-flicker {
          0%, 70%, 100% { opacity: 0.6; }
          75% { opacity: 0.9; }
          80% { opacity: 0.5; }
        }
        @keyframes shooting-star {
          0%, 88%, 100% { opacity: 0; transform: translate(0, 0); }
          90% { opacity: 1; transform: translate(0, 0); }
          94% { opacity: 0; transform: translate(-40px, 30px); }
        }
        @keyframes brain-poke {
          0%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .brain-room-character { transition: none; }
          .brain-office-wall,
          .brain-office-window-light,
          .brain-window-sky,
          .brain-window-sun,
          .brain-window-moon { transition: none; }
          .brain-char--walk,
          .brain-char--bob,
          .brain-char--pulse,
          .brain-char--lean,
          .brain-char--celebrating.brain-char--bob,
          .brain-char-body--poke,
          .brain-char-thought-dot,
          .brain-char-sparkle,
          .brain-pixel-cloud,
          .brain-window-star,
          .brain-window-bird,
          .brain-window-city-glow {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function StatusChip({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.625rem', color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: accent }}>{value}</div>
    </div>
  );
}
