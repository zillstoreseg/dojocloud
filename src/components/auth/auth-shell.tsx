import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { Logo } from '@/components/brand/logo';
import { cn } from '@/lib/utils';

/**
 * Shared frame for every unauthenticated screen: sign in, sign up, and the
 * onboarding steps a trainer walks before their dashboard exists.
 *
 * The contour motif from the marketing hero carries through, so the moment
 * someone crosses from the landing page into the product does not feel like
 * landing on a different site.
 */
export function AuthShell({
  brandName,
  title,
  description,
  children,
  footer,
  width = 'md',
}: {
  brandName: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl';
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4 py-10">
      <div className="bg-contour pointer-events-none absolute inset-0" aria-hidden />

      <div
        className={cn(
          'relative w-full space-y-6',
          width === 'md' && 'max-w-md',
          width === 'lg' && 'max-w-2xl',
          width === 'xl' && 'max-w-3xl',
        )}
      >
        <div className="flex justify-center">
          <Link href="/" className="text-primary">
            <Logo name={brandName} markClassName="size-8" className="gap-2.5" />
          </Link>
        </div>

        <div className="space-y-1.5 text-center">
          <h1 className="text-display-sm font-semibold">{title}</h1>
          {description ? <p className="text-muted-foreground">{description}</p> : null}
        </div>

        {children}

        {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
