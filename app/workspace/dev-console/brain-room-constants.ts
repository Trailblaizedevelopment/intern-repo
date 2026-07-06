import type { BrainMood } from './BrainCharacterSprite';

/** Horizontal wander bounds (% of scene width). Character `left` is centered on anchor. */
export const WANDER_LEFT = 22;
export const WANDER_RIGHT = 78;
export const WANDER_CENTER = 50;

export const MOOD_ANCHOR: Record<BrainMood, number> = {
  idle: WANDER_CENTER,
  thinking: WANDER_RIGHT,
  working: WANDER_RIGHT,
  celebrating: WANDER_CENTER,
};

export const WALK_SPEED = 0.42;
export const WALK_FRAME_MS = 165;
export const MOVE_TICK_MS = 32;
export const ARRIVAL_THRESHOLD = 0.45;
