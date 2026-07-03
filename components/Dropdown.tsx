'use client';

import React, { useState, useRef, useCallback, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

type DropdownAlign = 'start' | 'end';

interface DropdownProps {
  trigger: React.ReactElement;
  children: React.ReactNode;
  align?: DropdownAlign;
  className?: string;
  panelClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

export function Dropdown({
  trigger,
  children,
  align = 'end',
  className = '',
  panelClassName = '',
  open: controlledOpen,
  onOpenChange,
}: DropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange]
  );

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    setCoords({
      top: rect.bottom + gap,
      left: align === 'end' ? rect.right : rect.left,
    });
  }, [align]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();
    const onScroll = () => updatePosition();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);

    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, setOpen, updatePosition]);

  const triggerRef = (trigger as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref;

  const triggerElement = React.cloneElement(trigger, {
    ref: mergeRefs(anchorRef, triggerRef),
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    'aria-controls': open ? panelId : undefined,
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e);
      setOpen(!open);
    },
  });

  const panel =
    open && mounted
      ? createPortal(
          <div
            id={panelId}
            ref={panelRef}
            role="dialog"
            className={`dropdown-panel ${panelClassName}`.trim()}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: align === 'end' ? 'translateX(-100%)' : undefined,
              zIndex: 10000,
            }}
          >
            {children}
          </div>,
          document.body
        )
      : null;

  if (className) {
    return (
      <div className={className}>
        {triggerElement}
        {panel}
      </div>
    );
  }

  return (
    <>
      {triggerElement}
      {panel}
    </>
  );
}
