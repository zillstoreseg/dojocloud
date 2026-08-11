'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Download, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface FilterDef {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}

interface Props {
  searchPlaceholder?: string;
  filters?: FilterDef[];
  /**
   * Entity key for `/api/admin/export/{entity}`. When set, an export button
   * downloads the current filter set as CSV.
   */
  exportEntity?: string;
  showDateRange?: boolean;
}

export function DataTableToolbar({ searchPlaceholder, filters = [], exportEntity, showDateRange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const push = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      // Any filter change invalidates the current page offset.
      params.delete('page');
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams],
  );

  // Debounced search so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (query === current) return;
    const timer = setTimeout(() => {
      push((params) => (query ? params.set('q', query) : params.delete('q')));
    }, 350);
    return () => clearTimeout(timer);
  }, [query, push, searchParams]);

  const activeFilters = filters.filter((f) => searchParams.get(f.key));
  const hasDateRange = searchParams.get('from') || searchParams.get('to');
  const hasAny = query || activeFilters.length > 0 || hasDateRange;

  function exportCsv() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    window.location.href = `/api/admin/export/${exportEntity}?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder ?? (isAr ? 'بحث…' : 'Search…')}
          className="ltr:pl-9 rtl:pr-9"
        />
      </div>

      {filters.map((filter) => (
        <Select
          key={filter.key}
          value={searchParams.get(filter.key) ?? 'ALL'}
          onValueChange={(value) =>
            push((params) => (value === 'ALL' ? params.delete(filter.key) : params.set(filter.key, value)))
          }
        >
          <SelectTrigger className="w-auto min-w-36">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{filter.label}: {isAr ? 'الكل' : 'All'}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {showDateRange ? (
        <div className="flex items-center gap-1">
          <Input
            type="date"
            className="w-auto"
            value={searchParams.get('from') ?? ''}
            onChange={(e) => push((p) => (e.target.value ? p.set('from', e.target.value) : p.delete('from')))}
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="date"
            className="w-auto"
            value={searchParams.get('to') ?? ''}
            onChange={(e) => push((p) => (e.target.value ? p.set('to', e.target.value) : p.delete('to')))}
          />
        </div>
      ) : null}

      {hasAny ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery('');
            startTransition(() => router.push(pathname));
          }}
        >
          <X />
          {isAr ? 'مسح' : 'Clear'}
        </Button>
      ) : null}

      {exportEntity ? (
        <Button variant="outline" size="sm" onClick={exportCsv} loading={pending}>
          <Download />
          {isAr ? 'تصدير CSV' : 'Export CSV'}
        </Button>
      ) : null}
    </div>
  );
}
