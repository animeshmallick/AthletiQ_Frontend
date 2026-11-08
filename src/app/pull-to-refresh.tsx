/**
 * Pull-to-refresh for touch screens, like native apps: pull down at the top of a screen to refetch
 * its data (no full page reload, no lost state). Ignored while a dialog/sheet is open or when the
 * gesture starts inside something that scrolls on its own.
 */
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { haptic } from './native';

const TRIGGER = 72; // px of pull needed to refresh
const MAX = 110;

function scrollsItself(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  for (let n: Element | null = target; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollTop > 0) return true;
  }
  return false;
}

export function PullToRefresh() {
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<{ y: number; x: number } | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (refreshing || window.scrollY > 0 || e.touches.length !== 1) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      if (scrollsItself(e.target)) return;
      start.current = { y: e.touches[0]!.clientY, x: e.touches[0]!.clientX };
    };
    const onMove = (e: TouchEvent) => {
      if (!start.current) return;
      const dy = e.touches[0]!.clientY - start.current.y;
      const dx = Math.abs(e.touches[0]!.clientX - start.current.x);
      if (dy <= 0 || dx > dy) {
        start.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      // Rubber-band resistance: the further you pull, the harder it gets.
      const next = Math.min(MAX, dy * 0.5);
      pullRef.current = next;
      setPull(next);
    };
    const onEnd = () => {
      if (!start.current) return;
      start.current = null;
      if (pullRef.current >= TRIGGER) {
        setRefreshing(true);
        haptic();
        void qc
          .refetchQueries({ type: 'active' })
          .finally(() => setTimeout(() => setRefreshing(false), 300));
      }
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [qc, refreshing]);

  const shown = refreshing ? TRIGGER * 0.8 : pull;
  if (shown <= 0) return null;
  const ready = pull >= TRIGGER;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(3.25rem+env(safe-area-inset-top))] z-40 flex justify-center lg:hidden"
      style={{ transform: `translateY(${shown - 44}px)` }}
    >
      <div
        className={cn(
          'flex size-10 items-center justify-center rounded-full border bg-card text-primary shadow-e2 transition-colors',
          ready && 'bg-primary text-primary-foreground',
        )}
        style={{ opacity: Math.min(1, shown / 40) }}
      >
        {refreshing ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <ArrowDown
            className="size-5 transition-transform duration-200"
            style={{ transform: `rotate(${ready ? 180 : (pull / TRIGGER) * 150}deg)` }}
          />
        )}
        <span className="sr-only">{refreshing ? 'Refreshing' : 'Pull to refresh'}</span>
      </div>
    </div>
  );
}
