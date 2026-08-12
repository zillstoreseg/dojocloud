'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { ChipSelect, ChipRadio } from '@/components/ui/chip-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/money';
import { cn } from '@/lib/utils';

interface Option {
  value: string;
  label: string;
}

/**
 * Directory filters, with the whole state in the URL.
 *
 * That is what makes a filtered view shareable, back-button-correct, and
 * indexable — the three things a marketplace's search page has to be. The
 * panel collapses on mobile because a visitor arriving from a search result
 * should see coaches first and controls second.
 */
export function DirectoryFilters({
  isAr,
  locale,
  total,
  specialtyOptions,
  countryOptions,
}: {
  isAr: boolean;
  locale: string;
  total: number;
  specialtyOptions: Option[];
  countryOptions: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startNav] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(params.get('q') ?? '');

  const t = (ar: string, en: string) => (isAr ? ar : en);

  const specialties = (params.get('specialty') ?? '').split(',').filter(Boolean);

  function apply(changes: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      const v = Array.isArray(value) ? value.join(',') : value;
      if (!v) next.delete(key);
      else next.set(key, v);
    }
    // Any filter change invalidates the current page number.
    next.delete('page');
    startNav(() => router.push(`${pathname}?${next.toString()}`));
  }

  const activeCount = ['specialty', 'country', 'trains', 'gender', 'minYears', 'certified', 'maxPrice']
    .filter((k) => params.get(k))
    .length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-56 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: q.trim() || null });
          }}
        >
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('ابحث باسم المدرب أو المدينة', 'Search by name or city')}
            className="ps-9"
          />
        </form>

        <Button
          variant={activeCount ? 'default' : 'outline'}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <SlidersHorizontal />
          {t('فلاتر', 'Filters')}
          {activeCount ? (
            <span className="rounded-full bg-primary-foreground/20 px-1.5 text-xs tabular-nums">
              {activeCount}
            </span>
          ) : null}
        </Button>

        <Select
          value={params.get('sort') ?? 'subscribers'}
          onValueChange={(value) => apply({ sort: value })}
        >
          <SelectTrigger className="w-auto min-w-40" aria-label={t('الترتيب', 'Sort')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="subscribers">{t('الأكثر اشتراكًا', 'Most subscribed')}</SelectItem>
            <SelectItem value="rating">{t('الأعلى تقييمًا', 'Top rated')}</SelectItem>
            <SelectItem value="experience">{t('الأكثر خبرة', 'Most experienced')}</SelectItem>
            <SelectItem value="price">{t('الأقل سعرًا', 'Lowest price')}</SelectItem>
            <SelectItem value="newest">{t('الأحدث', 'Newest')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-muted-foreground">
        {t(
          `${formatNumber(total, locale)} مدرب متاح`,
          `${formatNumber(total, locale)} coaches available`,
        )}
      </p>

      <div
        className={cn(
          'grid gap-4 rounded-lg border border-border/60 bg-card p-4 shadow-soft md:grid-cols-2',
          open ? 'block' : 'hidden',
        )}
      >
        <Field label={t('التخصص', 'Specialty')} className="md:col-span-2">
          <ChipSelect
            value={specialties}
            onChange={(v) => apply({ specialty: v })}
            options={specialtyOptions}
          />
        </Field>

        <Field label={t('الدولة', 'Country')}>
          <Select
            value={params.get('country') ?? 'ALL'}
            onValueChange={(value) => apply({ country: value === 'ALL' ? null : value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('كل الدول', 'All countries')}</SelectItem>
              {countryOptions.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('أقل خبرة', 'Minimum experience')}>
          <Select
            value={params.get('minYears') ?? 'ALL'}
            onValueChange={(value) => apply({ minYears: value === 'ALL' ? null : value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('أي خبرة', 'Any')}</SelectItem>
              {[1, 3, 5, 10].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {t(`${y}+ سنوات`, `${y}+ years`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('بيدرّب', 'Trains')}>
          <ChipRadio
            value={params.get('trains') ?? ''}
            onChange={(v) => apply({ trains: v || null })}
            options={[
              { value: '', label: t('الكل', 'Anyone') },
              { value: 'MALE', label: t('رجال', 'Men') },
              { value: 'FEMALE', label: t('سيدات', 'Women') },
            ]}
          />
        </Field>

        <Field label={t('نوع المدرب', 'Coach gender')}>
          <ChipRadio
            value={params.get('gender') ?? ''}
            onChange={(v) => apply({ gender: v || null })}
            options={[
              { value: '', label: t('الكل', 'Any') },
              { value: 'MALE', label: t('مدرب', 'Male') },
              { value: 'FEMALE', label: t('مدربة', 'Female') },
            ]}
          />
        </Field>

        <Field label={t('السعر', 'Price')}>
          <Select
            value={params.get('maxPrice') ?? 'ALL'}
            onValueChange={(value) => apply({ maxPrice: value === 'ALL' ? null : value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('أي سعر', 'Any price')}</SelectItem>
              {[500, 1000, 2000, 5000].map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {t(`حتى ${formatNumber(p, locale)}`, `Up to ${formatNumber(p, locale)}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('الشهادات', 'Certificates')}>
          <ChipRadio
            value={params.get('certified') ?? ''}
            onChange={(v) => apply({ certified: v || null })}
            options={[
              { value: '', label: t('الكل', 'All') },
              { value: 'yes', label: t('عنده شهادات معتمدة', 'Has approved certificates') },
            ]}
          />
        </Field>

        {activeCount ? (
          <div className="md:col-span-2">
            <Button
              variant="ghost"
              onClick={() => {
                setQ('');
                startNav(() => router.push(pathname));
              }}
            >
              <X />
              {t('امسح الفلاتر', 'Clear filters')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
