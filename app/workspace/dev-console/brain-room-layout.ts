export const LAYOUT_STORAGE_KEY = 'brain-room-layout-v2';
export const FLOOR_TOP_PERCENT = 66;

export interface WindowLayout {
  id: string;
  left: number;
  width: number;
}

export interface PointLayout {
  left: number;
}

export interface WallItemLayout extends PointLayout {
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
    if (!raw) {
      const legacy = localStorage.getItem('brain-room-layout-v1');
      if (legacy) {
        const parsed = JSON.parse(legacy) as { windows?: WindowLayout[]; wall?: BrainRoomLayout['wall'] };
        if (parsed.windows?.length === 3 && parsed.wall) {
          return { version: 2, windows: parsed.windows, wall: parsed.wall };
        }
      }
      return DEFAULT_LAYOUT;
    }
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
