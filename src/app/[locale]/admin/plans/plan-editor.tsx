'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { SUPPORTED_CURRENCIES } from '@/lib/money';
import { savePlan, type PlanInput } from './actions';

const EMPTY: PlanInput = {
  key: '',
  nameAr: '',
  nameEn: '',
  taglineAr: '',
  taglineEn: '',
  prices: { EGP: 0, AED: 0, SAR: 0, USD: 0 },
  interval: 'MONTHLY',
  trialDays: 0,
  maxTrainees: 10,
  maxLandingPages: 1,
  maxExercises: 100,
  maxNutritionPlans: 20,
  maxTrainerSeats: 1,
  aiCreditsPerCycle: 0,
  storageMb: 500,
  commissionPercent: 0,
  highlightsAr: [''],
  highlightsEn: [''],
  isActive: true,
  isPublic: true,
  isPopular: false,
  sortOrder: 0,
};

/** `null` in a limit field means unlimited; the UI uses an empty input for it. */
function LimitInput({
  value,
  onChange,
  label,
  hint,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  hint: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        min={0}
        value={value === null ? '' : value}
        placeholder="∞"
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </Field>
  );
}

export function PlanEditor({ plan, trigger }: { plan?: PlanInput; trigger: React.ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PlanInput>(plan ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof PlanInput>(key: K, value: PlanInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await savePlan(form);
      if (result.ok) {
        toast({ title: result.message ?? '', variant: 'success' });
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? null);
      }
    });
  }

  function setHighlight(lang: 'ar' | 'en', index: number, value: string) {
    const key = lang === 'ar' ? 'highlightsAr' : 'highlightsEn';
    const next = [...form[key]];
    next[index] = value;
    set(key, next);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {plan?.id ? (isAr ? 'تعديل الخطة' : 'Edit plan') : isAr ? 'خطة جديدة' : 'New plan'}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? 'كل رقم هنا يسري فورًا على المدربين الجدد، والحدود تُطبَّق على المشتركين الحاليين عند التجديد.'
              : 'Every value applies immediately to new trainers; limits apply to existing subscribers on renewal.'}
          </DialogDescription>
        </DialogHeader>

        {error ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

        <div className="space-y-6">
          {/* Identity */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isAr ? 'الاسم بالعربية' : 'Arabic name'} required>
              <Input value={form.nameAr} onChange={(e) => set('nameAr', e.target.value)} />
            </Field>
            <Field label={isAr ? 'الاسم بالإنجليزية' : 'English name'} required>
              <Input value={form.nameEn} onChange={(e) => set('nameEn', e.target.value)} dir="ltr" />
            </Field>
            <Field label={isAr ? 'الوصف المختصر (عربي)' : 'Tagline (Arabic)'}>
              <Input value={form.taglineAr ?? ''} onChange={(e) => set('taglineAr', e.target.value)} />
            </Field>
            <Field label={isAr ? 'الوصف المختصر (إنجليزي)' : 'Tagline (English)'}>
              <Input value={form.taglineEn ?? ''} onChange={(e) => set('taglineEn', e.target.value)} dir="ltr" />
            </Field>
            <Field
              label={isAr ? 'مفتاح الخطة' : 'Plan key'}
              required
              hint={isAr ? 'معرّف ثابت يُستخدم في الكود، لا يُترجم' : 'Stable identifier used in code'}
            >
              <Input value={form.key} onChange={(e) => set('key', e.target.value)} dir="ltr" placeholder="pro" />
            </Field>
            <Field label={isAr ? 'دورة الفوترة' : 'Billing interval'}>
              <Select value={form.interval} onValueChange={(v) => set('interval', v as PlanInput['interval'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MONTHLY">{isAr ? 'شهري' : 'Monthly'}</SelectItem>
                  <SelectItem value="QUARTERLY">{isAr ? 'كل 3 شهور' : 'Quarterly'}</SelectItem>
                  <SelectItem value="YEARLY">{isAr ? 'سنوي' : 'Yearly'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Prices */}
          <div>
            <Label className="mb-2 block">{isAr ? 'الأسعار حسب العملة' : 'Prices by currency'}</Label>
            <div className="grid gap-3 sm:grid-cols-4">
              {SUPPORTED_CURRENCIES.map((currency) => (
                <Field key={currency} label={currency}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    dir="ltr"
                    value={form.prices[currency] ?? 0}
                    onChange={(e) =>
                      set('prices', { ...form.prices, [currency]: Number(e.target.value) })
                    }
                  />
                </Field>
              ))}
            </div>
          </div>

          {/* Quotas */}
          <div>
            <Label className="mb-2 block">
              {isAr ? 'الحدود (اتركه فارغًا = غير محدود)' : 'Limits (empty = unlimited)'}
            </Label>
            <div className="grid gap-3 sm:grid-cols-3">
              <LimitInput
                label={isAr ? 'المتدربون' : 'Trainees'}
                hint={isAr ? 'نشطون في نفس الوقت' : 'Active at once'}
                value={form.maxTrainees}
                onChange={(v) => set('maxTrainees', v)}
              />
              <LimitInput
                label={isAr ? 'صفحات الهبوط' : 'Landing pages'}
                hint={isAr ? 'عدد الصفحات' : 'Page count'}
                value={form.maxLandingPages}
                onChange={(v) => set('maxLandingPages', v)}
              />
              <LimitInput
                label={isAr ? 'التمارين المخصصة' : 'Custom exercises'}
                hint={isAr ? 'خارج المكتبة العامة' : 'Beyond the public library'}
                value={form.maxExercises}
                onChange={(v) => set('maxExercises', v)}
              />
              <LimitInput
                label={isAr ? 'أنظمة التغذية' : 'Nutrition plans'}
                hint={isAr ? 'قوالب وخطط' : 'Templates and plans'}
                value={form.maxNutritionPlans}
                onChange={(v) => set('maxNutritionPlans', v)}
              />
              <Field label={isAr ? 'رصيد AI شهريًا' : 'AI credits / cycle'}>
                <Input
                  type="number"
                  min={0}
                  dir="ltr"
                  value={form.aiCreditsPerCycle}
                  onChange={(e) => set('aiCreditsPerCycle', Number(e.target.value))}
                />
              </Field>
              <Field label={isAr ? 'التخزين (ميجابايت)' : 'Storage (MB)'}>
                <Input
                  type="number"
                  min={0}
                  dir="ltr"
                  value={form.storageMb}
                  onChange={(e) => set('storageMb', Number(e.target.value))}
                />
              </Field>
              <Field label={isAr ? 'مقاعد المدربين' : 'Coach seats'}>
                <Input
                  type="number"
                  min={1}
                  dir="ltr"
                  value={form.maxTrainerSeats}
                  onChange={(e) => set('maxTrainerSeats', Number(e.target.value))}
                />
              </Field>
              <Field
                label={isAr ? 'نسبة المنصة %' : 'Platform fee %'}
                hint={isAr ? 'على مدفوعات المتدربين' : 'On trainee payments'}
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  dir="ltr"
                  value={form.commissionPercent}
                  onChange={(e) => set('commissionPercent', Number(e.target.value))}
                />
              </Field>
              <Field label={isAr ? 'أيام التجربة' : 'Trial days'}>
                <Input
                  type="number"
                  min={0}
                  max={90}
                  dir="ltr"
                  value={form.trialDays}
                  onChange={(e) => set('trialDays', Number(e.target.value))}
                />
              </Field>
            </div>
          </div>

          {/* Marketing bullets */}
          <div className="grid gap-4 sm:grid-cols-2">
            {(['ar', 'en'] as const).map((lang) => {
              const key = lang === 'ar' ? 'highlightsAr' : 'highlightsEn';
              return (
                <div key={lang} className="space-y-2">
                  <Label>
                    {lang === 'ar'
                      ? isAr ? 'مميزات الخطة (عربي)' : 'Highlights (Arabic)'
                      : isAr ? 'مميزات الخطة (إنجليزي)' : 'Highlights (English)'}
                  </Label>
                  {form[key].map((item, index) => (
                    <div key={index} className="flex gap-1">
                      <Input
                        value={item}
                        dir={lang === 'ar' ? 'rtl' : 'ltr'}
                        onChange={(e) => setHighlight(lang, index, e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => set(key, form[key].filter((_, i) => i !== index))}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => set(key, [...form[key], ''])}>
                    <Plus />
                    {isAr ? 'إضافة ميزة' : 'Add highlight'}
                  </Button>
                </div>
              );
            })}
          </div>

          {/* Visibility */}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { key: 'isActive' as const, ar: 'الخطة مفعّلة', en: 'Plan is active' },
              { key: 'isPublic' as const, ar: 'تظهر في صفحة الأسعار', en: 'Visible on pricing page' },
              { key: 'isPopular' as const, ar: 'الأكثر اختيارًا', en: 'Most popular' },
            ].map((row) => (
              <label key={row.key} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <span className="text-sm font-medium">{isAr ? row.ar : row.en}</span>
                <Switch checked={form[row.key]} onCheckedChange={(v) => set(row.key, v)} />
              </label>
            ))}
            <Field label={isAr ? 'ترتيب العرض' : 'Sort order'}>
              <Input
                type="number"
                min={0}
                dir="ltr"
                value={form.sortOrder}
                onChange={(e) => set('sortOrder', Number(e.target.value))}
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={submit} loading={pending}>
            {isAr ? 'حفظ الخطة' : 'Save plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
