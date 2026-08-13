import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { getBrand } from '@/lib/settings';
import { Logo } from '@/components/brand/logo';

/**
 * The public footer.
 *
 * Its job is not decoration: a platform that holds health data, food
 * photographs and payment receipts needs its terms and privacy policy
 * reachable from every public page, and "reachable" means a link somebody can
 * actually find. The pages are read from the database, so an owner who adds
 * one gets it here without a deploy.
 */
export async function SiteFooter({ locale }: { locale: string }) {
  const isAr = locale === 'ar';

  const [brand, pages] = await Promise.all([
    getBrand(),
    prisma.staticPage.findMany({
      where: { status: 'PUBLISHED' },
      select: { slug: true, titleAr: true, titleEn: true },
      orderBy: { slug: 'asc' },
    }),
  ]);

  const product = [
    { href: '/coaches', ar: 'دليل المدربين', en: 'Coach directory' },
    { href: '/register', ar: 'سجّل كمدرب', en: 'Join as a coach' },
    { href: '/login', ar: 'تسجيل الدخول', en: 'Sign in' },
  ];

  return (
    <footer className="border-t bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-3 sm:col-span-2 md:col-span-2">
            <Logo name={brand.name} />
            <p className="max-w-sm text-sm text-muted-foreground">
              {isAr ? brand.taglineAr : brand.taglineEn}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isAr ? 'المنصة' : 'Product'}
            </p>
            <ul className="space-y-1.5">
              {product.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {isAr ? item.ar : item.en}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isAr ? 'قانوني' : 'Legal'}
            </p>
            <ul className="space-y-1.5">
              {pages.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`/p/${page.slug}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {isAr ? page.titleAr : page.titleEn}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {brand.name}
          </p>
          {brand.supportEmail ? (
            <a
              href={`mailto:${brand.supportEmail}`}
              className="text-xs text-muted-foreground hover:text-primary"
              dir="ltr"
            >
              {brand.supportEmail}
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
