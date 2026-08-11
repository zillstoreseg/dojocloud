import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The empty state every list falls back to.
 *
 * A drawn mark plus a next action, not a bare sentence — an empty screen is
 * usually the first one a new user sees, so it is the wrong place to look
 * unfinished. The contour mark is the same motif as the marketing hero.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      <div className="bg-contour pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="relative flex flex-col items-center gap-3">
        {icon ? (
          <span className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground [&>svg]:size-6">
            {icon}
          </span>
        ) : null}
        <div className="space-y-1">
          <p className="font-display text-base font-semibold">{title}</p>
          {description ? (
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}
