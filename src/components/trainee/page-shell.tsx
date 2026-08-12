import type { ReactNode } from 'react';
import { AppTopbar } from '@/components/app/topbar';
import { cn } from '@/lib/utils';

/** Standard chrome for a trainee portal page. Mirrors `TrainerPage`. */
export function TraineePage({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <AppTopbar title={title} settingsHref="/my/subscription" homeHref="/my" />
      <main className={cn('flex-1 space-y-6 p-4 md:p-6', className)}>
        {description || actions ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : <div />}
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}
        {children}
      </main>
    </>
  );
}
