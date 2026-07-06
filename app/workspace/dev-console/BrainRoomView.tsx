'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import type { AgentRunStats } from './AgentRunsPanel';

type BrainMood = 'idle' | 'thinking' | 'working' | 'celebrating';

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
  idle: ['Resting… ping me in Slack!', 'Systems nominal.', 'Waiting for a thread.'],
  thinking: ['Processing your request…', 'Calling tools…', 'Reading the board…'],
  working: ['Orchestrating a task…', 'Cursor might be busy.', 'Long-running goal in progress.'],
  celebrating: ['Done!', 'That run finished.', 'Nice — check Ops for details.'],
};

/** CSS pixel-art Brain avatar (4×4 scaled blocks). */
function PixelBrain({ mood, poke }: { mood: BrainMood; poke: boolean }) {
  const bounce = mood === 'thinking' || poke;
  return (
    <div
      className={`pixel-brain pixel-brain--${mood}${poke ? ' pixel-brain--poke' : ''}`}
      style={{
        width: 64,
        height: 64,
        imageRendering: 'pixelated',
        position: 'relative',
        animation: bounce ? 'brain-bob 0.6s ease-in-out infinite' : undefined,
      }}
    >
      <div className="pixel-brain-body" />
      <div className="pixel-brain-eye pixel-brain-eye--l" />
      <div className="pixel-brain-eye pixel-brain-eye--r" />
      {mood === 'thinking' && <div className="pixel-brain-thought">…</div>}
    </div>
  );
}

export function BrainRoomView({ agentRunStats, activeTasks, connectors, runningNow }: BrainRoomViewProps) {
  const [poke, setPoke] = useState(false);
  const [bubbleIdx, setBubbleIdx] = useState(0);
  const [flashCelebrate, setFlashCelebrate] = useState(false);

  const mood = useMemo(
    () => (flashCelebrate ? 'celebrating' : deriveMood(runningNow, activeTasks)),
    [runningNow, activeTasks, flashCelebrate]
  );

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
      return () => clearTimeout(t);
    }
    prevRunning.current = runningNow;
  }, [runningNow]);

  const handlePoke = useCallback(() => {
    setPoke(true);
    setTimeout(() => setPoke(false), 600);
  }, []);

  const liveConnectors = connectors.filter(c => c.available);

  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
      {/* Room scene */}
      <div className="brain-room-scene">
        <div className="brain-room-sky" />
        <div className="brain-room-floor" />

        {/* Desk + monitors */}
        <div className="brain-room-desk">
          <div className={`brain-room-monitor ${runningNow > 0 ? 'brain-room-monitor--on' : ''}`}>
            <span>{runningNow > 0 ? 'RUN' : 'ops'}</span>
          </div>
          <div className={`brain-room-monitor brain-room-monitor--sm ${activeTasks > 0 ? 'brain-room-monitor--on' : ''}`}>
            <span>{activeTasks}</span>
          </div>
        </div>

        {/* Connector shelves */}
        <div className="brain-room-shelf">
          {liveConnectors.map(c => (
            <span key={c.id} className="brain-room-chip" title={c.label}>
              {c.id.slice(0, 3)}
            </span>
          ))}
        </div>

        {/* Character */}
        <button type="button" className="brain-room-character" onClick={handlePoke} aria-label="Poke Brain">
          <div className="brain-room-bubble">{bubble}</div>
          <PixelBrain mood={mood} poke={poke} />
          <span className="brain-room-label">Trailblaize Brain</span>
        </button>
      </div>

      {/* Status strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '14px 18px', borderTop: '1px solid #E5E7EB', background: '#FAFAFA' }}>
        <StatusChip label="Live runs" value={String(runningNow)} accent={runningNow > 0 ? '#4F46E5' : '#9CA3AF'} />
        <StatusChip label="Active tasks" value={String(activeTasks)} accent={activeTasks > 0 ? '#B45309' : '#9CA3AF'} />
        <StatusChip label="24h runs" value={String(agentRunStats.runs24h)} accent="#4338CA" />
        <StatusChip label="Success" value={`${agentRunStats.successRate24h}%`} accent="#059669" />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#6B7280' }}>
          <MessageSquare size={14} />
          Chat in Slack to interact
        </div>
      </div>

      <p style={{ margin: 0, padding: '10px 18px 14px', fontSize: '0.6875rem', color: '#9CA3AF', lineHeight: 1.5 }}>
        Brain Room v0 — pixel home for the agent. Mood reflects live ops data. Click Brain to poke. More interactivity coming soon.
      </p>

      <style jsx global>{`
        .brain-room-scene {
          position: relative;
          height: 320px;
          overflow: hidden;
          background: #1e1b4b;
        }
        .brain-room-sky {
          position: absolute;
          inset: 0 0 40%;
          background: linear-gradient(180deg, #312e81 0%, #4338ca 55%, #6366f1 100%);
        }
        .brain-room-floor {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 42%;
          background: repeating-linear-gradient(
            90deg,
            #4c1d95 0px,
            #4c1d95 16px,
            #5b21b6 16px,
            #5b21b6 32px
          );
          border-top: 4px solid #7c3aed;
        }
        .brain-room-desk {
          position: absolute;
          bottom: 28%;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }
        .brain-room-desk::after {
          content: '';
          position: absolute;
          bottom: -12px;
          left: -20px;
          right: -20px;
          height: 12px;
          background: #6d28d9;
          border-radius: 2px;
        }
        .brain-room-monitor {
          width: 56px;
          height: 40px;
          background: #1f2937;
          border: 3px solid #374151;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: ui-monospace, monospace;
          font-size: 0.625rem;
          font-weight: 700;
          color: #374151;
        }
        .brain-room-monitor--sm {
          width: 36px;
          height: 28px;
          font-size: 0.5625rem;
        }
        .brain-room-monitor--on {
          color: #34d399;
          box-shadow: 0 0 12px rgba(52, 211, 153, 0.5);
          animation: monitor-flicker 2s ease-in-out infinite;
        }
        .brain-room-shelf {
          position: absolute;
          bottom: 52%;
          right: 12%;
          display: flex;
          gap: 4px;
        }
        .brain-room-chip {
          font-size: 0.5rem;
          font-weight: 700;
          padding: 2px 5px;
          background: #059669;
          color: white;
          border-radius: 3px;
          font-family: ui-monospace, monospace;
          text-transform: uppercase;
        }
        .brain-room-character {
          position: absolute;
          bottom: 18%;
          left: 50%;
          transform: translateX(-50%);
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0;
        }
        .brain-room-bubble {
          position: absolute;
          bottom: 100%;
          margin-bottom: 8px;
          max-width: 200px;
          padding: 8px 12px;
          background: white;
          border-radius: 12px;
          font-size: 0.75rem;
          color: #374151;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          white-space: nowrap;
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
          margin-top: 6px;
          font-size: 0.6875rem;
          font-weight: 600;
          color: #e9d5ff;
        }
        .pixel-brain-body {
          width: 48px;
          height: 44px;
          margin: 8px auto 0;
          background: #7c3aed;
          border-radius: 50% 50% 45% 45%;
          box-shadow: inset -4px -4px 0 #5b21b6, inset 4px 4px 0 #a78bfa;
        }
        .pixel-brain-eye {
          position: absolute;
          width: 8px;
          height: 10px;
          background: white;
          border-radius: 2px;
          top: 28px;
        }
        .pixel-brain-eye--l { left: 18px; }
        .pixel-brain-eye--r { right: 18px; }
        .pixel-brain--thinking .pixel-brain-eye {
          animation: blink 1.2s step-end infinite;
        }
        .pixel-brain-thought {
          position: absolute;
          top: -4px;
          right: -8px;
          font-size: 1.25rem;
          color: white;
          animation: thought-float 1s ease-in-out infinite;
        }
        @keyframes brain-bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        @keyframes blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95% { transform: scaleY(0.1); }
        }
        @keyframes thought-float {
          0%, 100% { opacity: 0.4; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-4px); }
        }
        @keyframes monitor-flicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
        .pixel-brain--poke {
          animation: brain-poke 0.5s ease !important;
        }
        @keyframes brain-poke {
          0%, 100% { transform: scale(1); }
          40% { transform: scale(1.15) rotate(-5deg); }
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
