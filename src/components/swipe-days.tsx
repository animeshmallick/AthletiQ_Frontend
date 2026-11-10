/**
 * A day-by-day view you can swipe: the content follows the finger, the edge shows which day is
 * next, and past a threshold the day slides out and the next one slides in from that side
 * (buttons that change the day get the same slide-in). Vertical scrolling is left alone.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '@/app/native';
import { cn } from '@/lib/utils';

/** How far (px) or how fast (px/ms) a swipe must go to change the day. */
const DISTANCE = 72;
const SPEED = 0.45;

export function SwipeDays({
  dayKey,
  direction,
  onStep,
  prevLabel,
  nextLabel,
  children,
  className,
}: {
  /** Changes when the day changes; replays the slide-in. */
  dayKey: string;
  /** The way the last change went (1 = forward, -1 = back), for the slide-in side. */
  direction: 1 | -1 | 0;
  onStep: (n: 1 | -1) => void;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<1 | -1 | 0>(0);
  const leavingRef = useRef<1 | -1 | 0>(0);
  const finishRef = useRef<(n: 1 | -1) => void>(() => {});
  const touch = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null } | null>(null);
  const [dragging, setDragging] = useState(false);

  // If the slide-out never reports finishing (tab hidden mid-swipe), change the day anyway.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => finishRef.current(leaving), 400);
    return () => clearTimeout(t);
  }, [leaving]);

  function finish(n: 1 | -1) {
    if (!leavingRef.current) return;
    leavingRef.current = 0;
    setLeaving(0);
    setDx(0);
    haptic();
    onStep(n);
  }

  useEffect(() => {
    finishRef.current = finish;
  });

  const style = leaving
    ? {
        transform: `translateX(${-leaving * 105}%)`,
        opacity: 0,
        transition: 'transform 200ms ease-in, opacity 200ms ease-in',
      }
    : {
        transform: `translateX(${dx}px)`,
        opacity: 1 - Math.min(Math.abs(dx) / 360, 0.45),
        transition: dragging
          ? 'none'
          : 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 260ms',
      };
  const peek = Math.min(Math.abs(dx) / DISTANCE, 1);

  return (
    <div
      className={cn('relative overflow-hidden', className)}
      data-slot="swipe-days"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t || leaving) return;
        touch.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: null };
      }}
      onTouchMove={(e) => {
        const s = touch.current;
        const t = e.touches[0];
        if (!s || !t) return;
        const mx = t.clientX - s.x;
        const my = t.clientY - s.y;
        if (!s.axis) {
          if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
          s.axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
          if (s.axis === 'x') setDragging(true);
        }
        // A little resistance, so it feels attached rather than loose.
        if (s.axis === 'x') setDx(mx * 0.85);
      }}
      onTouchEnd={() => {
        const s = touch.current;
        touch.current = null;
        setDragging(false);
        if (s?.axis !== 'x') return;
        const fast = Math.abs(dx) / Math.max(Date.now() - s.t, 1) > SPEED && Math.abs(dx) > 24;
        if (Math.abs(dx) > DISTANCE || fast) {
          leavingRef.current = dx < 0 ? 1 : -1;
          setLeaving(leavingRef.current);
        } else setDx(0);
      }}
      onTouchCancel={() => {
        touch.current = null;
        setDragging(false);
        setDx(0);
      }}
    >
      {/* Which day is next, revealed at the edge while dragging. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-3 left-0 flex items-center pl-1 text-[12px] font-semibold text-primary"
        style={{ opacity: dx > 0 ? peek : 0 }}
      >
        <ChevronLeft className="size-4" />
        {prevLabel}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute top-3 right-0 flex items-center pr-1 text-[12px] font-semibold text-primary"
        style={{ opacity: dx < 0 ? peek : 0 }}
      >
        {nextLabel}
        <ChevronRight className="size-4" />
      </div>

      <div
        style={style}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'transform' && leaving)
            finish(leaving);
        }}
      >
        <div
          key={dayKey}
          className={cn(
            direction === 1 && 'animate-day-next',
            direction === -1 && 'animate-day-prev',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
