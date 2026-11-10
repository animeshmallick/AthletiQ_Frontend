/**
 * Slide to confirm: drag the handle all the way to the end and let go to confirm; letting go
 * earlier springs it back. Keyboard users focus it and press Enter (or Space) instead.
 */
import { ArrowRight, Check } from 'lucide-react';
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { haptic } from '@/app/native';
import { cn } from '@/lib/utils';

const KNOB = 48; // px
const PAD = 4; // px around the knob
/** How far (share of the track) counts as "at the end". */
const DONE_AT = 0.92;

export function SlideToConfirm({
  label,
  onConfirm,
  disabled = false,
  tone = 'primary',
  className,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'success';
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; pos: number } | null>(null);
  const [pos, setPos] = useState(0);
  const [max, setMax] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [armed, setArmed] = useState(false);

  const progress = max > 0 ? pos / max : 0;
  const fill = tone === 'success' ? 'bg-success' : 'bg-primary';
  const soft =
    tone === 'success' ? 'bg-success/10 border-success/30' : 'bg-primary/8 border-primary/25';
  const text = tone === 'success' ? 'text-success' : 'text-primary';

  function confirm() {
    if (done || disabled) return;
    setDone(true);
    setPos(max);
    haptic();
    onConfirm();
  }

  function down(e: PointerEvent<HTMLButtonElement>) {
    if (disabled || done) return;
    const width = track.current?.clientWidth ?? 0;
    setMax(Math.max(width - KNOB - PAD * 2, 1));
    start.current = { x: e.clientX, pos };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return;
    const next = Math.min(Math.max(s.pos + e.clientX - s.x, 0), max);
    setPos(next);
    const nowArmed = next / max >= DONE_AT;
    if (nowArmed !== armed) {
      setArmed(nowArmed);
      if (nowArmed) haptic();
    }
  }
  function up() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (pos / max >= DONE_AT) confirm();
    else {
      setPos(0); // springs back
      setArmed(false);
    }
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      confirm();
    }
  }

  return (
    <div
      ref={track}
      className={cn(
        'relative h-14 w-full touch-none overflow-hidden rounded-full border select-none',
        soft,
        disabled && 'opacity-60',
        className,
      )}
    >
      {/* The trail filling in behind the handle. */}
      <div
        aria-hidden
        className={cn('absolute inset-y-0 left-0 rounded-full', fill)}
        style={{
          width: pos + KNOB + PAD * 2,
          opacity: 0.18 + progress * 0.82,
          transition: dragging
            ? 'none'
            : 'width 420ms cubic-bezier(0.34, 1.32, 0.64, 1), opacity 300ms',
        }}
      />
      {/* Label, with a shimmer inviting the slide; fades as the handle passes. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center pl-12 text-[14px] font-semibold',
          text,
        )}
        style={{ opacity: done ? 0 : 1 - Math.min(progress * 1.6, 1) }}
      >
        <span
          className="slide-shimmer"
          style={
            {
              '--shimmer': tone === 'success' ? 'var(--color-success)' : 'var(--color-primary)',
            } as CSSProperties
          }
        >
          {label}
        </span>
      </span>
      {done && (
        <span className="absolute inset-0 flex items-center justify-center text-[14px] font-semibold text-primary-foreground">
          Switching…
        </span>
      )}
      <button
        type="button"
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={done ? 'Confirmed' : `${Math.round(progress * 100)}%`}
        disabled={disabled}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        className={cn(
          'absolute top-1 left-1 flex cursor-grab items-center justify-center rounded-full text-primary-foreground shadow-e2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing',
          fill,
          armed && 'scale-105',
        )}
        style={{
          width: KNOB,
          height: KNOB,
          transform: `translate3d(${pos}px, 0, 0)`,
          transition: dragging ? 'none' : 'transform 420ms cubic-bezier(0.34, 1.32, 0.64, 1)',
        }}
      >
        {done || armed ? (
          <Check className="size-5" />
        ) : (
          <ArrowRight className={cn('size-5', !dragging && 'slide-nudge')} />
        )}
      </button>
    </div>
  );
}
