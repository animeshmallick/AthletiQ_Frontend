/**
 * A day-by-day view you can swipe, with Material 3 motion that also feels at home on iOS:
 *  - Drag: the content follows the finger with rubber-band resistance and lifts slightly.
 *  - Edge: a round chevron chip grows in from the side; it fills (with a haptic tick) once letting
 *    go will change the day — like Android's predictive back.
 *  - Change: a shared-axis transition — the old day accelerates out, the new one decelerates in
 *    from the side the user moved towards, its rows settling in one after another.
 *  - Not far enough: a soft spring back.
 * Arrows and "Today" get the same entrance. Vertical scrolling is untouched; reduced-motion
 * settings shorten everything to an instant change.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '@/app/native';
import { cn } from '@/lib/utils';

/** Past this share of the width (or a quick flick), letting go changes the day. */
const ARM_RATIO = 0.18;
const FLICK_SPEED = 0.5; // px per ms
/** Material 3 easing. */
const EMPHASIZED_ACCELERATE = 'cubic-bezier(0.3, 0, 0.8, 0.15)';
const SPRING = 'cubic-bezier(0.34, 1.32, 0.64, 1)';

/** iOS-style rubber band: easy at first, heavier the further it's pulled. */
function rubberBand(dx: number, width: number) {
  const d = Math.abs(dx);
  const pulled = (1 - 1 / ((d * 0.8) / width + 1)) * width;
  return Math.sign(dx) * pulled;
}

export function SwipeDays({
  dayKey,
  direction,
  onStep,
  prevLabel,
  nextLabel,
  children,
  className,
}: {
  /** Changes when the day changes; replays the entrance. */
  dayKey: string;
  /** The way the last change went (1 = forward, -1 = back): the side the new day enters from. */
  direction: 1 | -1 | 0;
  onStep: (n: 1 | -1) => void;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [width, setWidth] = useState(360);
  const [dragging, setDragging] = useState(false);
  const [armed, setArmed] = useState(false);
  const [leaving, setLeaving] = useState<1 | -1 | 0>(0);
  const leavingRef = useRef<1 | -1 | 0>(0);
  const finishRef = useRef<(n: 1 | -1) => void>(() => {});
  const touch = useRef<{
    x: number;
    y: number;
    t: number;
    lastX: number;
    lastT: number;
    axis: 'x' | 'y' | null;
  } | null>(null);

  // If the exit never reports finishing (e.g. the tab was hidden mid-swipe), change anyway.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => finishRef.current(leaving), 360);
    return () => clearTimeout(t);
  }, [leaving]);

  function finish(n: 1 | -1) {
    if (!leavingRef.current) return;
    leavingRef.current = 0;
    setLeaving(0);
    setDx(0);
    setArmed(false);
    onStep(n);
  }
  useEffect(() => {
    finishRef.current = finish;
  });

  const progress = Math.min(Math.abs(dx) / (width * ARM_RATIO), 1);

  const content = leaving
    ? {
        transform: `translate3d(${-leaving * 38}%, 0, 0) scale(0.97)`,
        opacity: 0,
        transition: `transform 200ms ${EMPHASIZED_ACCELERATE}, opacity 160ms linear`,
      }
    : {
        transform: `translate3d(${dx}px, 0, 0) scale(${1 - progress * 0.025})`,
        opacity: 1 - progress * 0.25,
        transition: dragging ? 'none' : `transform 460ms ${SPRING}, opacity 300ms ease-out`,
      };

  const chip = (side: 'prev' | 'next') => {
    const active = side === 'prev' ? dx > 0 : dx < 0;
    const p = active ? progress : 0;
    const label = side === 'prev' ? prevLabel : nextLabel;
    return (
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-6 z-10 flex flex-col items-center gap-1',
          side === 'prev' ? 'left-1.5' : 'right-1.5',
        )}
        style={{
          opacity: p,
          transform: `translate3d(${(side === 'prev' ? -1 : 1) * (1 - p) * 18}px, 0, 0) scale(${0.6 + p * 0.4})`,
          transition: dragging ? 'none' : 'opacity 200ms, transform 300ms ease-out',
        }}
      >
        <span
          className={cn(
            'flex size-9 items-center justify-center rounded-full border shadow-e2 backdrop-blur transition-[background-color,color,border-color,transform] duration-200',
            active && armed
              ? 'scale-110 border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card/90 text-primary',
          )}
        >
          {side === 'prev' ? (
            <ChevronLeft className="size-5" />
          ) : (
            <ChevronRight className="size-5" />
          )}
        </span>
        <span className="rounded-full bg-card/90 px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-primary shadow-e1">
          {label}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={box}
      className={cn('relative overflow-hidden', className)}
      data-slot="swipe-days"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t || leaving) return;
        const now = Date.now();
        if (box.current) setWidth(box.current.clientWidth || 360);
        touch.current = {
          x: t.clientX,
          y: t.clientY,
          t: now,
          lastX: t.clientX,
          lastT: now,
          axis: null,
        };
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
        if (s.axis !== 'x') return;
        const next = rubberBand(mx, width);
        const nowArmed = Math.abs(next) >= width * ARM_RATIO;
        if (nowArmed !== armed) {
          setArmed(nowArmed);
          if (nowArmed) haptic(); // a tick as it arms, like a detent
        }
        s.lastX = t.clientX;
        s.lastT = Date.now();
        setDx(next);
      }}
      onTouchEnd={() => {
        const s = touch.current;
        touch.current = null;
        setDragging(false);
        if (s?.axis !== 'x') return;
        const elapsed = Math.max(Date.now() - s.t, 1);
        const flick = Math.abs(s.lastX - s.x) / elapsed > FLICK_SPEED && Math.abs(dx) > 20;
        if (armed || flick) {
          leavingRef.current = dx < 0 ? 1 : -1;
          setLeaving(leavingRef.current);
        } else {
          setDx(0);
          setArmed(false);
        }
      }}
      onTouchCancel={() => {
        touch.current = null;
        setDragging(false);
        setArmed(false);
        setDx(0);
      }}
    >
      {chip('prev')}
      {chip('next')}

      <div
        style={{ ...content, willChange: dragging || leaving ? 'transform, opacity' : undefined }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === 'transform' && leaving)
            finish(leaving);
        }}
      >
        <div
          key={dayKey}
          data-day-enter={direction === 1 ? 'next' : direction === -1 ? 'prev' : undefined}
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
