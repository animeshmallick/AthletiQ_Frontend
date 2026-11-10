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

type Tone = 'primary' | 'success' | 'warning';
const TONES: Record<
  Tone,
  { gradient: string; soft: string; text: string; color: string; glow: string }
> = {
  primary: {
    gradient: 'bg-gradient-to-r from-primary via-primary to-violet-500',
    soft: 'bg-primary/8 border-primary/25',
    text: 'text-primary',
    color: 'var(--color-primary)',
    glow: 'shadow-[0_6px_20px_-4px_var(--color-primary)]',
  },
  success: {
    gradient: 'bg-gradient-to-r from-emerald-600 via-success to-teal-500',
    soft: 'bg-success/10 border-success/30',
    text: 'text-success',
    color: 'var(--color-success)',
    glow: 'shadow-[0_6px_20px_-4px_var(--color-success)]',
  },
  warning: {
    gradient: 'bg-gradient-to-r from-amber-500 via-warning to-orange-400',
    soft: 'bg-warning/12 border-warning/40',
    text: 'text-warning-foreground dark:text-warning',
    color: 'var(--color-warning)',
    glow: 'shadow-[0_6px_20px_-4px_var(--color-warning)]',
  },
};

export function SlideToConfirm({
  label,
  onConfirm,
  disabled = false,
  tone = 'primary',
  doneLabel = 'Switching…',
  className,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  tone?: Tone;
  /** Shown in the track once confirmed. */
  doneLabel?: string;
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
  const t = TONES[tone];
  const fill = t.gradient;
  const soft = t.soft;
  const text = t.text;

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
        'shadow-[inset_0_1px_3px_rgb(0_0_0/0.08)]',
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
              '--shimmer': t.color,
            } as CSSProperties
          }
        >
          {label}
        </span>
      </span>
      {done && (
        <span className="absolute inset-0 flex animate-[page-in_260ms_ease-out] items-center justify-center pl-10 text-[14px] font-semibold text-white">
          {doneLabel}
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
          [
            'ring-1 ring-white/40',
            t.glow,
            'before:pointer-events-none before:absolute before:inset-x-1.5 before:top-1 before:h-1/2 before:rounded-full before:bg-gradient-to-b before:from-white/45 before:to-transparent',
          ],
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
          <Check className={cn('size-5', done && 'animate-[pop_360ms_ease-out_both]')} />
        ) : (
          <ArrowRight className={cn('size-5', !dragging && 'slide-nudge')} />
        )}
      </button>
    </div>
  );
}
