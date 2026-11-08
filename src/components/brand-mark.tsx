import { cn } from '@/lib/utils';

/** The AthletiQ mark: gradient tile with the glyph and a soft highlight. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-linear-to-br from-indigo-500 via-primary to-violet-600 shadow-e1 ring-1 ring-white/20 ring-inset',
        'after:absolute after:inset-0 after:-translate-x-full after:bg-linear-to-r after:from-transparent after:via-white/35 after:to-transparent after:transition-transform after:duration-700 group-hover:after:translate-x-full',
        className,
      )}
    >
      {/* Same mark as the app icon: forward-leaning "A", rising swoosh and spark. */}
      <svg viewBox="200 200 720 620" className="size-[1.45rem] drop-shadow-sm" fill="none">
        <path
          d="M330 772 548 254 736 772"
          stroke="#fff"
          strokeWidth="120"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M390 640C500 628 640 580 796 444"
          stroke="#fbbf24"
          strokeWidth="70"
          strokeLinecap="round"
        />
        <path d="M830 236l24 62 62 24-62 24-24 62-24-62-62-24 62-24z" fill="#fbbf24" />
      </svg>
    </span>
  );
}
