'use client';

import React, { useMemo } from 'react';
import type { Facing } from './useBrainRoomMovement';

export type BrainMood = 'idle' | 'thinking' | 'working' | 'celebrating';

/** Pixel palette — light brown complexion, nappy brown hair, anime-professional vibe. */
const C: Record<string, string> = {
  S: '#D4A574',
  s: '#B8896A',
  T: '#E8C9A0',
  H: '#3D2914',
  h: '#5C4033',
  L: '#6B5040',
  E: '#FAF8F5',
  e: '#A0826D',
  p: '#2D1810',
  g: '#DDD0C0',
  W: '#4338CA',
  w: '#312E81',
  C: '#EDE9FE',
  B: '#374151',
  b: '#1F2937',
  R: '#C9887E',
  M: '#7A5C44',
  m: '#5C4033',
  P: '#292524',
  O: '#2D1810',
};

/** Front-facing body — slightly refined hair volume + outline. */
const BASE_FRONT = [
  '....................',
  '....hhhhhhhhhh......',
  '..hhLLhLLhLLhLLhh...',
  '.hhHHHHHHHHHHHHhh...',
  '.hHHHssSSSSSSssHHh..',
  '.hHHsSSSSSSSSSSsHh..',
  '.hHHsSSSSSSSSSSsHh..',
  '.hHHsSSSSSSSSSSsHh..',
  '..hhssSSSSSSSSssh...',
  '...hssSSSSSSSSssh...',
  '...hhSSSSSSSSSShh...',
  '..WWWWCCCCCCWWWW....',
  '.WWWWWWWWWWWWWWWW...',
  '.WWWWwwWWwwWWWWWW...',
  '.WWss......ssWWWW...',
  '..BB........BB......',
  '..BB........BB......',
  '..bB........Bb......',
  '..PP........PP......',
  '....................',
];

/** Front-facing walk leg frames. */
const WALK_FRONT: [string[], string[]] = [
  [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..BB........BB......',
    '..bB........PP......',
    '..PP........bB......',
    '....................',
    '....................',
  ],
  [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '.WWss......ssWW.....',
    '..BB........BB......',
    '..PP........bB......',
    '..bB........PP......',
    '....................',
    '....................',
  ],
];

const MOOD_FACE: Record<BrainMood, string[]> = {
  idle: [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....EEeEg....EEeEg..',
    '....EEeEg....EEeEg..',
    '....OEsR......OEsR..',
    '.....MsR......MsR...',
    '.....RR........RR...',
    '....................',
    '....................',
    '....................',
    '....................',
    '..ss........ss......',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  thinking: [
    '....................',
    '.........TT.........',
    '........TTTT........',
    '.......TT..TT.......',
    '....................',
    '....................',
    '....EeEg.....EeEg...',
    '....EeEE.....EeEE...',
    '.....mM.......mM....',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..ss...ss....ss.....',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  working: [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....EpEg.....EpEg...',
    '....EpEg.....EpEg...',
    '.....mM.......mM....',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '...ss.........S.....',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  celebrating: [
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....mMMm.....mMMm...',
    '....mMMm.....mMMm...',
    '.....MM.......MM....',
    '.....RR......RR.....',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    'ssss........ssss....',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
};

type Pixel = { x: number; y: number; fill: string };

function mergeSprites(base: string[], ...overlays: string[][]): Pixel[] {
  const grid: (string | null)[][] = base.map(row =>
    [...row].map(ch => (C[ch] ? ch : null))
  );
  for (const overlay of overlays) {
    overlay.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (C[ch]) grid[y][x] = ch;
      });
    });
  }
  const out: Pixel[] = [];
  grid.forEach((row, y) => {
    row.forEach((ch, x) => {
      if (ch && C[ch]) out.push({ x, y, fill: C[ch] });
    });
  });
  return out;
}

const SPRITE_W = 20;
const SPRITE_H = 20;
const SCALE = 5;

interface BrainCharacterSpriteProps {
  mood: BrainMood;
  poke: boolean;
  facing: Facing;
  isWalking: boolean;
  walkFrame: 0 | 1;
  posX: number;
  deskZone: { min: number; max: number };
}

export function BrainCharacterSprite({
  mood,
  poke,
  facing,
  isWalking,
  walkFrame,
  posX,
  deskZone,
}: BrainCharacterSpriteProps) {
  const atDesk = posX >= deskZone.min && posX <= deskZone.max && !isWalking;

  const pixels = useMemo(() => {
    if (isWalking) {
      return mergeSprites(BASE_FRONT, MOOD_FACE.idle, WALK_FRONT[walkFrame]);
    }
    return mergeSprites(BASE_FRONT, MOOD_FACE[mood]);
  }, [isWalking, mood, walkFrame]);

  const bob = !isWalking && (mood === 'thinking' || mood === 'celebrating');
  const lean = !isWalking && mood === 'working' && atDesk;
  const walkClass = isWalking ? ` brain-char--walk brain-char--walk-${facing}` : '';

  return (
    <div
      className={`brain-char brain-char--${mood}${bob ? ' brain-char--bob' : ''}${lean ? ' brain-char--lean' : ''}${walkClass}`}
      style={{ width: SPRITE_W * SCALE, height: SPRITE_H * SCALE }}
    >
      <div className={`brain-char-body${poke ? ' brain-char-body--poke' : ''}`}>
        <svg
          width={SPRITE_W * SCALE}
          height={SPRITE_H * SCALE}
          viewBox={`0 0 ${SPRITE_W} ${SPRITE_H}`}
          shapeRendering="crispEdges"
          aria-hidden
        >
          {pixels.map(({ x, y, fill }) => (
            <rect key={`${x}-${y}-${walkFrame}`} x={x} y={y} width={1} height={1} fill={fill} />
          ))}
        </svg>
      </div>
      {!isWalking && mood === 'thinking' && (
        <div className="brain-char-thought" aria-hidden>
          <span className="brain-char-thought-dot brain-char-thought-dot--sm" />
          <span className="brain-char-thought-dot brain-char-thought-dot--md" />
          <span className="brain-char-thought-dot brain-char-thought-dot--lg">…</span>
        </div>
      )}
      {!isWalking && mood === 'celebrating' && (
        <div className="brain-char-sparkle" aria-hidden>
          ✦
        </div>
      )}
    </div>
  );
}
