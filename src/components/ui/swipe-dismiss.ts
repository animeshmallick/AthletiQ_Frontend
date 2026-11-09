import { useRef, type PointerEvent } from 'react';

/** How far down (px) a sheet must be dragged to close; anything less springs back. */
const CLOSE_AT = 90;
/** Only drags that start this close to the sheet's top edge (the handle area) count. */
const HANDLE_ZONE = 44;

const phone = () => window.matchMedia?.('(max-width: 639px)').matches ?? false;

/**
 * Swipe-down-to-dismiss for phone bottom sheets: drag the handle area down and let go to close
 * (closing goes through Escape, so Radix and the back-button history stay in sync). Touch only;
 * desktop dialogs and mouse users are unaffected.
 */
export function useSwipeDismiss() {
  const start = useRef<{ y: number; id: number } | null>(null);
  const dy = useRef(0);

  const reset = (el: HTMLElement) => {
    el.style.transition = 'transform 180ms ease-out';
    el.style.transform = '';
    start.current = null;
    dy.current = 0;
  };

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== 'touch' || !phone()) return;
      const el = e.currentTarget;
      if (e.clientY - el.getBoundingClientRect().top > HANDLE_ZONE) return;
      start.current = { y: e.clientY, id: e.pointerId };
      el.style.transition = 'none';
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (!start.current || e.pointerId !== start.current.id) return;
      dy.current = Math.max(0, e.clientY - start.current.y);
      e.currentTarget.style.transform = `translateY(${dy.current}px)`;
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      if (!start.current) return;
      const el = e.currentTarget;
      const close = dy.current > CLOSE_AT;
      reset(el);
      if (close) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    },
    onPointerCancel(e: PointerEvent<HTMLElement>) {
      if (start.current) reset(e.currentTarget);
    },
  };
}
