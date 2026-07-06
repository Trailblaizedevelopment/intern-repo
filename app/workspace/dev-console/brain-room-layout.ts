export const LAYOUT_STORAGE_KEY = 'brain-room-layout-v2';

export interface WindowLayout {
  id: string;
  left: number;
  width: number;
}

export interface WallItemLayout {
  left: number;
  top: number;
}

export interface BrainRoomLayout {
  version: 2;
  windows: WindowLayout[];
  wall: {
    poster: WallItemLayout;
    lamp: WallItemLayout;
    clock: WallItemLayout;
    connectors: WallItemLayout;
  };
}

export const DEFAULT_LAYOUT: BrainRoomLayout = {
  version: 2,
  windows: [
    { id: 'w-1', left: 8, width: 24 },
    { id: 'w-2', left: 38, width: 24 },
    { id: 'w-3', left: 68, width: 24 },
  ],
  wall: {
    poster: { left: 52, top: 18 },
    lamp: { left: 92, top: 10 },
    clock: { left: 84, top: 8 },
    connectors: { left: 78, top: 48 },
  },
};

export function loadBrainRoomLayout(): BrainRoomLayout {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as BrainRoomLayout;
    if (parsed.version !== 2 || !parsed.windows || parsed.windows.length !== 3) {
      return DEFAULT_LAYOUT;
    }
    return parsed;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveBrainRoomLayout(layout: BrainRoomLayout): void {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}
