import { cn } from '@/lib/utils';

/**
 * The logomark: an open progress ring with a rising chevron inside it.
 *
 * It is the `StatRing` reduced to its smallest form on purpose — the mark and
 * the product's signature figure are the same idea, so the brand is present on
 * every screen that shows progress, not only in the header.
 *
 * Colours come from `currentColor` and the brand accent variable, so the mark
 * re-themes with the admin's brand settings and works on any surface.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('size-8', className)}
      aria-hidden
      focusable="false"
    >
      {/* Open ring — the gap is what keeps it from reading as a generic badge. */}
      <path
        d="M26.5 10.5A12 12 0 1 0 28 16"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Rising chevron: progress, and the tick of an approved plan. */}
      <path
        d="M10.5 18.5 15 13.5l3.5 3.5 5-6"
        stroke="hsl(var(--brand-accent))"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark plus wordmark, for headers and the sidebar. */
export function Logo({
  name,
  className,
  markClassName,
}: {
  name: string;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className={cn('size-7 text-primary', markClassName)} />
      <span className="font-display text-lg font-semibold tracking-tight">{name}</span>
    </span>
  );
}
