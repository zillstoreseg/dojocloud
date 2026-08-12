import { getLocale } from 'next-intl/server';
import { Compass, Home } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { getBrand } from '@/lib/settings';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * 404 on the product's own identity rather than the framework default.
 *
 * A missing page is one of the few screens a user reaches by accident, so it
 * is worth making it look deliberate and offering a way out.
 */
export default async function NotFound() {
  // `not-found.tsx` receives no params, so the locale comes from the request.
  const locale = await getLocale();
  const brand = await getBrand();
  const isAr = locale === 'ar';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      <div className="bg-contour pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-lg space-y-6">
        <div className="flex justify-center">
          <Link href="/" className="text-primary">
            <Logo name={brand.name} />
          </Link>
        </div>

        <EmptyState
          icon={<Compass />}
          title={isAr ? 'الصفحة دي مش موجودة' : 'This page does not exist'}
          description={
            isAr
              ? 'يمكن الرابط اتغيّر أو الصفحة اتشالت. جرّب ترجع للرئيسية.'
              : 'The link may have changed, or the page may have been removed.'
          }
          action={
            <Button asChild>
              <Link href="/">
                <Home />
                {isAr ? 'الرئيسية' : 'Home'}
              </Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
