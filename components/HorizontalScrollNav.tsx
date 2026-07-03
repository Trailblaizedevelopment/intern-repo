'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalScrollNavProps {
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
  controlsClassName?: string;
  /** CSS selector for one scroll step (e.g. a Kanban column). */
  itemSelector?: string;
  /** Fixed pixel scroll step when itemSelector is not used. */
  scrollAmount?: number;
  ariaLabel?: string;
}

export function HorizontalScrollNav({
  children,
  className = '',
  viewportClassName = '',
  controlsClassName = '',
  itemSelector,
  scrollAmount,
  ariaLabel = 'Scroll horizontally',
}: HorizontalScrollNavProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    updateScrollState();
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);

    el.addEventListener('scroll', updateScrollState, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', updateScrollState);
    };
  }, [updateScrollState, children]);

  const getScrollStep = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return scrollAmount ?? 320;

    if (itemSelector) {
      const item = el.querySelector(itemSelector) as HTMLElement | null;
      if (item) {
        const styles = getComputedStyle(el);
        const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
        return item.offsetWidth + gap;
      }
    }

    return scrollAmount ?? Math.round(el.clientWidth * 0.85);
  }, [itemSelector, scrollAmount]);

  const scrollByStep = (direction: -1 | 1) => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * getScrollStep(), behavior: 'smooth' });
  };

  const showControls = canScrollLeft || canScrollRight;

  return (
    <div className={`hscroll-nav ${className}`.trim()}>
      <div
        ref={viewportRef}
        className={`hscroll-nav__viewport ${viewportClassName}`.trim()}
        role="region"
        aria-label={ariaLabel}
      >
        {children}
      </div>
      {showControls && (
        <div className={`hscroll-nav__controls ${controlsClassName}`.trim()}>
          <button
            type="button"
            className="hscroll-nav__btn"
            onClick={() => scrollByStep(-1)}
            disabled={!canScrollLeft}
            aria-label="Scroll left"
          >
            <ChevronLeft size={18} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            className="hscroll-nav__btn"
            onClick={() => scrollByStep(1)}
            disabled={!canScrollRight}
            aria-label="Scroll right"
          >
            <ChevronRight size={18} strokeWidth={2.25} />
          </button>
        </div>
      )}
    </div>
  );
}
