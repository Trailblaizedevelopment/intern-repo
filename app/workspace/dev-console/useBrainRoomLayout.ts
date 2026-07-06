'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_LAYOUT,
  loadBrainRoomLayout,
  saveBrainRoomLayout,
  type BrainRoomLayout,
  type WallItemLayout,
  type WindowLayout,
} from './brain-room-layout';

export function useBrainRoomLayout() {
  const [layout, setLayout] = useState<BrainRoomLayout>(DEFAULT_LAYOUT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLayout(loadBrainRoomLayout());
    setHydrated(true);
  }, []);

  const updateWindow = useCallback((id: string, patch: Partial<WindowLayout>) => {
    setLayout(prev => {
      const next: BrainRoomLayout = {
        ...prev,
        windows: prev.windows.map(w => (w.id === id ? { ...w, ...patch } : w)),
      };
      saveBrainRoomLayout(next);
      return next;
    });
  }, []);

  const updateWallItem = useCallback(
    (key: keyof BrainRoomLayout['wall'], patch: Partial<WallItemLayout>) => {
      setLayout(prev => {
        const next: BrainRoomLayout = {
          ...prev,
          wall: { ...prev.wall, [key]: { ...prev.wall[key], ...patch } },
        };
        saveBrainRoomLayout(next);
        return next;
      });
    },
    []
  );

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    saveBrainRoomLayout(DEFAULT_LAYOUT);
  }, []);

  return { layout, hydrated, updateWindow, updateWallItem, resetLayout };
}
