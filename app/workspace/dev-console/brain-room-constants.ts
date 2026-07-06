import type { BrainMood } from './BrainCharacterSprite';

/** Horizontal anchors (% of scene width). Character `left` is centered on anchor. */
export const ROOM_ANCHORS = {
  wander: 35,
  center: 50,
  work: 68,
} as const;

export const MOOD_ANCHOR: Record<BrainMood, number> = {
  idle: ROOM_ANCHORS.center,
  thinking: ROOM_ANCHORS.work,
  working: ROOM_ANCHORS.work,
  celebrating: ROOM_ANCHORS.center,
};

/** Spot where character faces forward while thinking/working. */
export const DESK_ZONE = { min: 60, max: 76 } as const;

export const WALK_SPEED = 0.42;
export const WALK_FRAME_MS = 165;
export const MOVE_TICK_MS = 32;
export const ARRIVAL_THRESHOLD = 0.45;
