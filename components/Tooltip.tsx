'use client';

import React, { useState, useRef, useCallback, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

type TooltipSide = 'top' | 'bottom' | 'left' | 'right';
type TooltipAlign = 'start' | 'center' | 'end';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: TooltipSide;
  align?: TooltipAlign;
  className?: string;
  compact?: boolean;
  delayMs?: number;
  /** Keep open while hovering tooltip content (e.g. scrollable descriptions). */
  interactive?: boolean;
  /** Delay before closing when pointer leaves both anchor and tooltip. */
  interactiveHideDelayMs?: number;
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
  compact = false,
  delayMs = 0,
  interactive = false,
  interactiveHideDelayMs = 200,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [positionStyle, setPositionStyle] = useState<React.CSSProperties>({});
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRef = useRef({ anchor: false, tooltip: false });

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
    const gap = interactive ? 0 : 8;
    const overlap = interactive ? 6 : 0;
    const transform: string[] = [];
    let top = 0;
    let left = 0;

    if (side === 'right') {
      left = rect.right + gap - overlap;
      if (align === 'end') top = rect.bottom;
      else if (align === 'center') {
        top = rect.top + rect.height / 2;
        transform.push('translateY(-50%)');
      } else top = rect.top;
    } else if (side === 'left') {
      left = rect.left - gap + overlap;
      transform.push('translateX(-100%)');
      if (align === 'end') top = rect.bottom;
      else if (align === 'center') {
        top = rect.top + rect.height / 2;
        transform.push('translateY(-50%)');
      } else top = rect.top;
    } else if (side === 'top') {
      top = rect.top - gap + overlap;
      if (align === 'end') left = rect.right;
      else if (align === 'center') left = rect.left + rect.width / 2;
      else left = rect.left;
      transform.push('translateY(-100%)');
      if (align === 'center') transform.push('translateX(-50%)');
      if (align === 'end') transform.push('translateX(-100%)');
    } else {
      top = rect.bottom + gap - overlap;
      if (align === 'end') left = rect.right;
      else if (align === 'center') left = rect.left + rect.width / 2;
      else left = rect.left;
      if (align === 'center') transform.push('translateX(-50%)');
      if (align === 'end') transform.push('translateX(-100%)');
    }

    setPositionStyle({
      position: 'fixed',
      top,
      left,
      transform: transform.length > 0 ? transform.join(' ') : undefined,
      zIndex: 10000,
    });
  }, [side, align, interactive]);

  const cancelScheduled = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    delayRef.current = null;
  };

  const scheduleClose = useCallback(() => {
    if (!interactive) return;
    cancelScheduled();
    delayRef.current = setTimeout(() => {
      if (!hoverRef.current.anchor && !hoverRef.current.tooltip) {
        setOpen(false);
      }
    }, interactiveHideDelayMs);
  }, [interactive, interactiveHideDelayMs]);

  const show = useCallback(() => {
    cancelScheduled();
    const run = () => {
      updatePosition();
      setOpen(true);
    };
    if (delayMs > 0) delayRef.current = setTimeout(run, delayMs);
    else run();
  }, [delayMs, updatePosition]);

  const hideImmediate = useCallback(() => {
    cancelScheduled();
    hoverRef.current.anchor = false;
    hoverRef.current.tooltip = false;
    setOpen(false);
  }, []);

  const onAnchorEnter = () => {
    hoverRef.current.anchor = true;
    cancelScheduled();
    show();
  };

  const onAnchorLeave = () => {
    hoverRef.current.anchor = false;
    if (interactive) scheduleClose();
    else hideImmediate();
  };

  const onTooltipEnter = () => {
    if (!interactive) return;
    hoverRef.current.tooltip = true;
    cancelScheduled();
  };

  const onTooltipLeave = () => {
    if (!interactive) return;
    hoverRef.current.tooltip = false;
    scheduleClose();
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
      onAnchorEnter();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      onAnchorLeave();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      onAnchorEnter();
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hideImmediate();
    },
  });

  const tooltipContent =
    typeof content === 'string' ? content.trim().replace(/\s+/g, ' ') : content;

  const tooltipClasses = [
    'ui-tooltip',
    compact ? 'ui-tooltip--compact' : '',
    interactive ? 'ui-tooltip--interactive' : '',
    interactive ? `ui-tooltip--side-${side}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const tooltipNode =
    open && mounted
      ? createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={tooltipClasses}
            data-side={side}
            style={{
              ...positionStyle,
              ...(compact
                ? { width: 'max-content', maxWidth: 'max-content' }
                : { width: 'max-content', maxWidth: 280 }),
            }}
            onMouseEnter={onTooltipEnter}
            onMouseLeave={onTooltipLeave}
          >
            {typeof tooltipContent === 'string' ? (
              <span className="ui-tooltip__label">{tooltipContent}</span>
            ) : (
              tooltipContent
            )}
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
