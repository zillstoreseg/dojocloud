import { setRequestLocale } from 'next-intl/server';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { AdminPage } from '@/components/admin/page-shell';
import { formatDate } from '@/lib/money';
import { PageEditor, type StaticPageRow } from './page-editor';

export default async function AdminStaticPagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('content.write', locale);

  const isAr = locale === 'ar';

  const pages = await prisma.staticPage.findMany({ orderBy: { slug: 'asc' } });

  const rows: StaticPageRow[] = pages.map((page) => ({
    slug: page.slug,
    titleAr: page.titleAr,
    titleEn: page.titleEn,
    contentAr: page.contentAr,
    contentEn: page.contentEn,
    status: page.status,
    updatedAt: formatDate(page.updatedAt, locale),
    protected: page.slug === 'terms' || page.slug === 'privacy',
  }));

  return (
    <AdminPage
      title={isAr ? 'الصفحات الثابتة' : 'Static pages'}
      description={
        isAr
          ? 'الشروط والخصوصية ومن نحن والأسئلة الشائعة. بتظهر على /p/{الرابط} وفي فوتر الموقع.'
          : 'Terms, privacy, about and FAQ. They render at /p/{slug} and link from the site footer.'
      }
    >
      <PageEditor locale={locale} rows={rows} />
    </AdminPage>
  );
}
