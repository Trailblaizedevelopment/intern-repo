'use client';

import React, { useState, useRef, useCallback, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

type TooltipSide = 'top' | 'bottom';
type TooltipAlign = 'start' | 'center' | 'end';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: TooltipSide;
  align?: TooltipAlign;
  className?: string;
  delayMs?: number;
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

export function Tooltip({
  content,
  children,
  side = 'bottom',
  align = 'center',
  className = '',
  delayMs = 0,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipId = useId();
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (delayRef.current) clearTimeout(delayRef.current);
    };
  }, []);

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const gap = 8;
    const top = side === 'bottom' ? rect.bottom + gap : rect.top - gap;
    let left = rect.left;

    if (align === 'center') left = rect.left + rect.width / 2;
    if (align === 'end') left = rect.right;

    const transform: string[] = [];
    if (align === 'center') transform.push('translateX(-50%)');
    if (align === 'end') transform.push('translateX(-100%)');
    if (side === 'top') transform.push('translateY(-100%)');

    setStyle({
      position: 'fixed',
      top,
      left,
      transform: transform.length > 0 ? transform.join(' ') : undefined,
      zIndex: 10000,
    });
  }, [side, align]);

  const show = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    const run = () => {
      updatePosition();
      setOpen(true);
    };
    if (delayMs > 0) delayRef.current = setTimeout(run, delayMs);
    else run();
  };

  const hide = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onReposition = () => updatePosition();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, updatePosition]);

  const childRef = (children as React.ReactElement & { ref?: React.Ref<HTMLElement> }).ref;

  const child = React.cloneElement(children, {
    ref: mergeRefs(anchorRef, childRef),
    'aria-describedby': open ? tooltipId : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hide();
    },
  });

  const tooltipNode =
    open && mounted
      ? createPortal(
          <div id={tooltipId} role="tooltip" className={`ui-tooltip ${className}`.trim()} style={style}>
            {content}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      {child}
      {tooltipNode}
    </>
  );
}
