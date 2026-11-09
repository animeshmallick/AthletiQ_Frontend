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
      {/* Same mark as the app icon: a sprinter inside a gold track ring, with a spark. */}
      <svg viewBox="100 110 840 840" className="size-[1.6rem] drop-shadow-sm" fill="none">
        <path
          d="M712 181.6A400 400 0 1 1 172.8 316"
          stroke="#fbbf24"
          strokeWidth="56"
          strokeLinecap="round"
        />
        <g
          transform="translate(512 528) scale(.86) translate(-540 -512)"
          stroke="#fff"
          strokeWidth="104"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M636 360 L506 566" />
          <path d="M626 382 L742 444 L810 360" />
          <path d="M612 388 L500 440 L414 410" />
          <path d="M506 566 L672 600 L640 778" />
          <path d="M506 566 L420 706 L270 740" />
          <circle cx="692" cy="236" r="88" fill="#fff" stroke="none" />
        </g>
        <path
          d="M850 136l15.3 38.7 38.7 15.3-38.7 15.3-15.3 38.7-15.3-38.7-38.7-15.3 38.7-15.3z"
          fill="#fbbf24"
        />
      </svg>
    </span>
  );
}
