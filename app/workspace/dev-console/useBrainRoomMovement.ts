'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ARRIVAL_THRESHOLD,
  DESK_ZONE,
  MOOD_ANCHOR,
  MOVE_TICK_MS,
  ROOM_ANCHORS,
  WALK_FRAME_MS,
  WALK_SPEED,
} from './brain-room-constants';
import type { BrainMood } from './BrainCharacterSprite';

export type Facing = 'left' | 'right';

interface UseBrainRoomMovementOptions {
  mood: BrainMood;
}

export function useBrainRoomMovement({ mood }: UseBrainRoomMovementOptions) {
  const [posX, setPosX] = useState<number>(ROOM_ANCHORS.center);
  const [facing, setFacing] = useState<Facing>('right');
  const [isWalking, setIsWalking] = useState(false);
  const [walkFrame, setWalkFrame] = useState<0 | 1>(0);
  const [idleWanderTarget, setIdleWanderTarget] = useState<number>(ROOM_ANCHORS.center);

  const moodTarget = useMemo(() => {
    if (mood === 'idle') return idleWanderTarget;
    return MOOD_ANCHOR[mood];
  }, [mood, idleWanderTarget]);

  useEffect(() => {
    if (mood !== 'idle') return;
    const id = setInterval(() => {
      setIdleWanderTarget(t =>
        t === ROOM_ANCHORS.center ? ROOM_ANCHORS.wander : ROOM_ANCHORS.center
      );
    }, 12_000);
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

  return { posX, facing, isWalking, walkFrame, deskZone: DESK_ZONE };
}
