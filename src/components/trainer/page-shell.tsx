import type { ReactNode } from 'react';
import { AppTopbar } from '@/components/app/topbar';
import { cn } from '@/lib/utils';

/** Standard chrome for a trainer dashboard page. Mirrors `AdminPage`. */
export function TrainerPage({
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
      <AppTopbar title={title} settingsHref="/dash/settings" homeHref="/dash" />
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

export function TrainerSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
