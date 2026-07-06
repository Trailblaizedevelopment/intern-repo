'use client';

import { useEffect, useState } from 'react';
import {
  ARRIVAL_THRESHOLD,
  MOOD_ANCHOR,
  MOVE_TICK_MS,
  WALK_FRAME_MS,
  WALK_SPEED,
  WANDER_CENTER,
  WANDER_LEFT,
  WANDER_RIGHT,
} from './brain-room-constants';
import type { BrainMood } from './BrainCharacterSprite';

export type Facing = 'left' | 'right';

interface UseBrainRoomMovementOptions {
  mood: BrainMood;
}

export function useBrainRoomMovement({ mood }: UseBrainRoomMovementOptions) {
  const [posX, setPosX] = useState<number>(WANDER_CENTER);
  const [facing, setFacing] = useState<Facing>('right');
  const [isWalking, setIsWalking] = useState(false);
  const [walkFrame, setWalkFrame] = useState<0 | 1>(0);
  const [idleWanderTarget, setIdleWanderTarget] = useState<number>(WANDER_LEFT);

  const moodTarget = mood === 'idle' ? idleWanderTarget : MOOD_ANCHOR[mood];

  useEffect(() => {
    if (mood !== 'idle') return;
    const id = setInterval(() => {
      setIdleWanderTarget(t => (t === WANDER_LEFT ? WANDER_RIGHT : WANDER_LEFT));
    }, 10_000);
    return () => clearInterval(id);
  }, [mood]);

  useEffect(() => {
    const id = setInterval(() => {
      setPosX(prev => {
        const diff = moodTarget - prev;
        if (Math.abs(diff) < ARRIVAL_THRESHOLD) {
          setIsWalking(false);
          return moodTarget;
        }
        setIsWalking(true);
        setFacing(diff > 0 ? 'right' : 'left');
        return prev + Math.sign(diff) * Math.min(WALK_SPEED, Math.abs(diff));
      });
    }, MOVE_TICK_MS);
    return () => clearInterval(id);
  }, [moodTarget]);

  useEffect(() => {
    if (!isWalking) return;
    const id = setInterval(() => setWalkFrame(f => (f === 0 ? 1 : 0)), WALK_FRAME_MS);
    return () => clearInterval(id);
  }, [isWalking]);

  return { posX, facing, isWalking, walkFrame };
}
