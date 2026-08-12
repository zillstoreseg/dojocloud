'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { THEME_RADIUS, type PageTheme } from '@/lib/page-blocks';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChipRadio } from '@/components/ui/chip-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { updatePageSettings } from './actions';
import type { BuilderPage } from './page-builder';

/**
 * Preset primaries rather than a colour picker.
 *
 * A free picker is how landing pages end up unreadable; every preset here has
 * been checked for contrast against both the light and dark page surfaces.
 */
const PRESETS: { value: string; label: { ar: string; en: string } }[] = [
  { value: '', label: { ar: 'ألوان المنصة', en: 'Platform' } },
  { value: '164 78% 27%', label: { ar: 'صنوبري', en: 'Pine' } },
  { value: '199 82% 30%', label: { ar: 'أزرق عميق', en: 'Deep blue' } },
  { value: '258 60% 42%', label: { ar: 'بنفسجي', en: 'Violet' } },
  { value: '18 74% 40%', label: { ar: 'نحاسي', en: 'Copper' } },
  { value: '345 62% 40%', label: { ar: 'توتي', en: 'Berry' } },
  { value: '200 12% 24%', label: { ar: 'رمادي فحمي', en: 'Charcoal' } },
];

export function PageSettings({
  page,
  theme: initialTheme,
  isAr,
}: {
  page: BuilderPage;
  theme: PageTheme;
  isAr: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(page.title);
  const [seoTitle, setSeoTitle] = useState(page.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(page.seoDescription ?? '');
  const [theme, setTheme] = useState(initialTheme);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const t = (ar: string, en: string) => (isAr ? ar : en);

  function save() {
    setError(null);
    startBusy(async () => {
      const result = await updatePageSettings({
        pageId: page.id,
        title,
        seoTitle,
        seoDescription,
        theme,
      });
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
        router.refresh();
      } else {
        setError(result.error ?? t('حصل خطأ', 'Something went wrong'));
      }
    });
  }

  return (
    <div className="space-y-4 p-4">
      <h2 className="font-display font-semibold">{t('إعدادات الصفحة', 'Page settings')}</h2>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Field label={t('اسم الصفحة', 'Page name')} hint={t('داخلي، الزائر مش بيشوفه', 'Internal only')}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <div className="space-y-4 rounded-md border border-border/60 p-3">
        <p className="eyebrow">{t('الظهور في جوجل والسوشيال', 'Search & social')}</p>
        <Field label={t('عنوان SEO', 'SEO title')} hint={`${seoTitle.length}/60`}>
          <Input
            value={seoTitle}
            maxLength={80}
            onChange={(e) => setSeoTitle(e.target.value)}
            placeholder={t('فاضي = اسمك وتخصصك', 'Empty uses your name and specialty')}
          />
        </Field>
        <Field label={t('وصف SEO', 'SEO description')} hint={`${seoDescription.length}/160`}>
          <Textarea
            rows={3}
            maxLength={200}
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          {t(
            'صورة المشاركة بتتولّد تلقائيًا باسمك وتخصصك وأرقامك.',
            'Your share image is generated automatically.',
          )}
        </p>
      </div>

      <div className="space-y-3 rounded-md border border-border/60 p-3">
        <p className="eyebrow">{t('الشكل', 'Look')}</p>

        <Field label={t('اللون الأساسي', 'Primary colour')}>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setTheme({ ...theme, primary: preset.value })}
                aria-label={preset.label[isAr ? 'ar' : 'en']}
                title={preset.label[isAr ? 'ar' : 'en']}
                className={cn(
                  'size-8 rounded-full border-2 transition-transform hover:scale-110',
                  theme.primary === preset.value ? 'border-foreground' : 'border-transparent',
                )}
                style={{
                  background: preset.value
                    ? `hsl(${preset.value})`
                    : 'linear-gradient(135deg, hsl(164 78% 27%), hsl(30 79% 57%))',
                }}
              />
            ))}
          </div>
        </Field>

        <Field label={t('الوضع', 'Mode')}>
          <ChipRadio
            value={theme.mode}
            onChange={(v) => setTheme({ ...theme, mode: v as PageTheme['mode'] })}
            options={[
              { value: 'light', label: t('فاتح', 'Light') },
              { value: 'dark', label: t('داكن', 'Dark') },
            ]}
          />
        </Field>

        <Field label={t('الزوايا', 'Corners')}>
          <ChipRadio
            value={theme.radius}
            onChange={(v) => setTheme({ ...theme, radius: v as PageTheme['radius'] })}
            options={(Object.keys(THEME_RADIUS) as PageTheme['radius'][]).map((key) => ({
              value: key,
              label:
                key === 'sharp'
                  ? t('حادة', 'Sharp')
                  : key === 'soft'
                    ? t('ناعمة', 'Soft')
                    : t('دائرية', 'Round'),
            }))}
          />
        </Field>
      </div>

      <Button className="w-full" onClick={save} disabled={busy}>
        {saved ? <Check /> : null}
        {saved ? t('اتحفظ', 'Saved') : t('احفظ', 'Save')}
      </Button>
    </div>
  );
}
