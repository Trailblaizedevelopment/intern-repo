'use client';

import React, { useMemo } from 'react';
import type { Facing } from './useBrainRoomMovement';

export type BrainMood = 'idle' | 'thinking' | 'working' | 'celebrating';

/** Violet blob-bot palette — morphic pixel entity. */
const C: Record<string, string> = {
  B: '#6366F1',
  b: '#4338CA',
  L: '#818CF8',
  l: '#A5B4FC',
  W: '#EEF2FF',
  E: '#C7D2FE',
  P: '#312E81',
  A: '#4F46E5',
  H: '#DDD6FE',
  G: '#34D399',
  g: '#059669',
  R: '#F472B6',
  r: '#FB7185',
  S: '#FDE68A',
  s: '#FBBF24',
};

const BASE_BLOB = [
  '....................',
  '.........AA.........',
  '.........bb.........',
  '.......bbbbbb.......',
  '.....bbbbbbbbbb.....',
  '....bbbbbbbbbbbb....',
  '...bbbbbbbbbbbbbb...',
  '...bbbbLLLLLLbbbb...',
  '..bbbbLBBBBBBLbbbb..',
  '..bbbbbbbbbbbbbbbb..',
  '..bbbbbbbbbbbbbbbb..',
  '..bbbbbbbbbbbbbbbb..',
  '..bbbbbbbbbbbbbbbb..',
  '...bbbbbbbbbbbbbb...',
  '...bbbbbbbbbbbbbb...',
  '....bbbbbbbbbbbb....',
  '.....bbbbbbbbbb.....',
  '......bbbbbbbb......',
  '....................',
  '....................',
];

/** Walk morph — squash & stretch wobble. */
const WALK_MORPH: [string[], string[]] = [
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
    '......bbbbbbbb......',
    '.....bbbbbbbbbb.....',
    '....bbbbbbbbbbbb....',
    '.....bbbbbbbbbb.....',
    '......bbbbbbbb......',
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
    '....................',
    '.......bbbbbb.......',
    '......bbbbbbbb......',
    '.......bbbbbb.......',
    '....................',
    '....................',
  ],
];

const MOOD_FACE: Record<BrainMood, string[]> = {
  idle: [
    '....................',
    '.........HH.........',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..bbbbWWWWWWWWbbbb..',
    '..bbbWEP....PEWbbb..',
    '..bbbbbbbbbbbbbbbb..',
    '..bbb..bbbbbb..bbb..',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  thinking: [
    '.........SS.........',
    '.........AA.........',
    '.........HH.........',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..bbbbWWWWWWWWbbbb..',
    '..bbbWE......EWbbb..',
    '..bbbb..PP..bbbbbb..',
    '..bbbbbbbbbbbbbbbb..',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  working: [
    '....................',
    '.........AA.........',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..bbbG........Gbbb..',
    '..bbbbWWWWWWWWbbbb..',
    '..bbbPP......PPbbb..',
    '..bbbbPPPPPPPPbbbb..',
    '..bbbbbbbbbbbbbbbb..',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
  ],
  celebrating: [
    '.........SS.........',
    '.........AA.........',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '..bbbbRRRRRRRRbbbb..',
    '..bbbRr......rRbbb..',
    '..bbbbrrrrrrrrbbbb..',
    '..bbbbbbbbbbbbbbbb..',
    '....................',
    '....................',
    '....................',
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
}

export function BrainCharacterSprite({
  mood,
  poke,
  facing,
  isWalking,
  walkFrame,
}: BrainCharacterSpriteProps) {
  const pixels = useMemo(() => {
    if (isWalking) {
      return mergeSprites(BASE_BLOB, MOOD_FACE.idle, WALK_MORPH[walkFrame]);
    }
    return mergeSprites(BASE_BLOB, MOOD_FACE[mood]);
  }, [isWalking, mood, walkFrame]);

  const bob = !isWalking && (mood === 'thinking' || mood === 'celebrating');
  const pulse = !isWalking && mood === 'working';
  const walkClass = isWalking ? ` brain-char--walk brain-char--walk-${facing}` : '';

  return (
    <div
      className={`brain-char brain-char--blob brain-char--${mood}${bob ? ' brain-char--bob' : ''}${pulse ? ' brain-char--pulse' : ''}${walkClass}`}
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
          <span className="brain-char-thought-dot brain-char-thought-dot--lg">?</span>
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
