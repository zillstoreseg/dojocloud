'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PageMeta } from '@/lib/list-params';

export function DataTablePagination({ meta }: { meta: PageMeta }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const isAr = locale === 'ar';

  function goto(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.push(`${pathname}?${params.toString()}`);
  }

  if (meta.total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {isAr
          ? `عرض ${meta.from}–${meta.to} من ${meta.total}`
          : `Showing ${meta.from}–${meta.to} of ${meta.total}`}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => goto(meta.page - 1)}
        >
          <ChevronRight className="ltr:hidden" />
          <ChevronLeft className="rtl:hidden" />
          {isAr ? 'السابق' : 'Previous'}
        </Button>
        <span className="px-3 text-muted-foreground">
          {meta.page} / {meta.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= meta.totalPages}
          onClick={() => goto(meta.page + 1)}
        >
          {isAr ? 'التالي' : 'Next'}
          <ChevronLeft className="ltr:hidden" />
          <ChevronRight className="rtl:hidden" />
        </Button>
      </div>
    </div>
  );
}

/** Clickable column header that toggles sort direction in the URL. */
export function SortableHeader({ field, children }: { field: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = searchParams.get('sort') === field;
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', field);
    params.set('dir', active && dir === 'desc' ? 'asc' : 'desc');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-foreground"
    >
      {children}
      <span className={active ? 'text-primary' : 'text-muted-foreground/40'}>
        {active && dir === 'asc' ? '↑' : '↓'}
      </span>
    </button>
  );
}
