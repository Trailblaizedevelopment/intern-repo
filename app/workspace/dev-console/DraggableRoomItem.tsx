'use client';

import React, { useCallback, useRef } from 'react';

type DragZone = 'wall' | 'floor';

interface DraggableRoomItemProps {
  zone: DragZone;
  left: number;
  top?: number;
  bottom?: number;
  width?: string;
  horizontalOnly?: boolean;
  onMove: (pos: { left: number; top?: number; bottom?: number }) => void;
  className?: string;
  label: string;
  children: React.ReactNode;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function DraggableRoomItem({
  zone,
  left,
  top,
  bottom,
  width,
  horizontalOnly = false,
  onMove,
  className = '',
  label,
  children,
}: DraggableRoomItemProps) {
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0, left, top: top ?? 0, bottom: bottom ?? 34 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-no-drag]')) return;
      dragging.current = true;
      start.current = { x: e.clientX, y: e.clientY, left, top: top ?? 0, bottom: bottom ?? 34 };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [left, top, bottom]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const scene = (e.currentTarget as HTMLElement).closest('.brain-room-scene') as HTMLElement | null;
      if (!scene) return;

      const rect = scene.getBoundingClientRect();
      const dx = ((e.clientX - start.current.x) / rect.width) * 100;
      const nextLeft = clamp(start.current.left + dx, 3, 97);

      if (zone === 'wall' && !horizontalOnly) {
        const dy = ((e.clientY - start.current.y) / rect.height) * 100;
        const nextTop = clamp(start.current.top + dy, 4, 52);
        onMove({ left: nextLeft, top: nextTop });
        return;
      }

      if (zone === 'wall' && horizontalOnly) {
        onMove({ left: nextLeft });
        return;
      }

      const dy = ((start.current.y - e.clientY) / rect.height) * 100;
      const nextBottom = clamp(start.current.bottom + dy, 30, 38);
      onMove({ left: nextLeft, bottom: nextBottom });
    },
    [zone, onMove]
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragging.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const style: React.CSSProperties = horizontalOnly
    ? { left: `${left}%`, top: 0, bottom: 0, width: width ?? '22%', transform: 'translateX(-50%)' }
    : zone === 'wall'
      ? { left: `${left}%`, top: `${top ?? 0}%`, transform: 'translate(-50%, 0)' }
      : { left: `${left}%`, bottom: `${bottom ?? 34}%`, transform: 'translateX(-50%)' };

  return (
    <div
      className={`brain-room-draggable brain-room-draggable--${zone} ${className}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title={`Drag to move · ${label}`}
      role="group"
      aria-label={label}
    >
      <span className="brain-room-drag-handle" aria-hidden>
        ⠿
      </span>
      {children}
    </div>
  );
}
