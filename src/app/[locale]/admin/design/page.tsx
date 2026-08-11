import { setRequestLocale } from 'next-intl/server';
import { Inbox, Sparkles } from 'lucide-react';
import { requireAdminPage } from '@/lib/authz';
import { AdminPage, AdminSection } from '@/components/admin/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { StatRing, MacroRings } from '@/components/ui/stat-ring';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { LogoMark } from '@/components/brand/logo';

/**
 * Living style guide.
 *
 * Every token and primitive rendered from the real source, so drift shows up
 * here before it shows up in the product. It also doubles as the contrast
 * check surface — the swatches below are the exact values shipped.
 */
export default async function DesignSystemPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('settings.write', locale);

  const isAr = locale === 'ar';

  const swatches = [
    { token: '--primary', className: 'bg-primary text-primary-foreground', ar: 'أساسي', en: 'Primary' },
    { token: '--brand-accent', className: 'bg-brand text-brand-foreground', ar: 'كهرماني', en: 'Accent' },
    { token: '--background', className: 'bg-background text-foreground border', ar: 'الخلفية', en: 'Background' },
    { token: '--card', className: 'bg-card text-card-foreground border', ar: 'سطح', en: 'Surface' },
    { token: '--muted', className: 'bg-muted text-muted-foreground', ar: 'خافت', en: 'Muted' },
    { token: '--accent', className: 'bg-accent text-accent-foreground', ar: 'تظليل', en: 'Accent tint' },
    { token: '--success', className: 'bg-success text-success-foreground', ar: 'نجاح', en: 'Success' },
    { token: '--warning', className: 'bg-warning text-warning-foreground', ar: 'تحذير', en: 'Warning' },
    { token: '--destructive', className: 'bg-destructive text-destructive-foreground', ar: 'خطر', en: 'Danger' },
    { token: '--info', className: 'bg-info text-info-foreground', ar: 'معلومة', en: 'Info' },
  ];

  const chartSlots = [
    { light: '#1baf7a', dark: '#199e70' },
    { light: '#2a78d6', dark: '#3987e5' },
    { light: '#eb6834', dark: '#d95926' },
    { light: '#4a3aa7', dark: '#9085e9' },
  ];

  return (
    <AdminPage
      title={isAr ? 'نظام التصميم' : 'Design system'}
      description={
        isAr
          ? 'المصدر الوحيد للألوان والخطوط والحركة. أي شاشة جديدة تُبنى من هنا.'
          : 'The single source for colour, type and motion. Every new screen is built from this.'
      }
    >
      <AdminSection
        title={isAr ? 'الهوية' : 'Identity'}
        description={
          isAr
            ? 'العلامة هي حلقة التقدّم نفسها مصغّرة — نفس الفكرة في الشعار وفي كل شاشة.'
            : 'The mark is the progress ring in miniature — the same idea in the logo and on every screen.'
        }
      >
        <Card>
          <CardContent className="flex flex-wrap items-center gap-8 p-6">
            <LogoMark className="size-16 text-primary" />
            <LogoMark className="size-10 text-primary" />
            <LogoMark className="size-6 text-primary" />
            <div className="flex items-center gap-4 rounded-lg bg-foreground p-4">
              <LogoMark className="size-10 text-background" />
            </div>
          </CardContent>
        </Card>
      </AdminSection>

      <AdminSection
        title={isAr ? 'الألوان' : 'Colour'}
        description={
          isAr
            ? 'كل قيمة HSL يقودها إعداد البراند، فتغيير اللون من الإعدادات يغيّر المنتج كله.'
            : 'Every HSL value is driven by the brand settings, so changing it there re-themes the product.'
        }
      >
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {swatches.map((swatch) => (
            <div key={swatch.token} className={`rounded-lg p-4 ${swatch.className}`}>
              <p className="text-sm font-medium">{isAr ? swatch.ar : swatch.en}</p>
              <p className="mt-6 font-mono text-[11px] opacity-80" dir="ltr">
                {swatch.token}
              </p>
            </div>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-sm font-medium">
              {isAr ? 'لوحة الرسوم البيانية (منفصلة عن البراند)' : 'Chart palette (kept apart from brand)'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'أربع خانات بترتيب ثابت، متحقَّق منها لعمى الألوان في الوضعين. لا تُشتق من لون البراند حتى لا ينهار التمييز عند تغييره.'
                : 'Four slots in a fixed order, validated for colour-vision deficiency in both themes. Deliberately not derived from the brand colour, so changing it cannot break series separation.'}
            </p>
            <div className="flex flex-wrap gap-3">
              {chartSlots.map((slot, index) => (
                <div key={slot.light} className="flex items-center gap-2">
                  <span
                    className="size-8 rounded-md dark:hidden"
                    style={{ background: slot.light }}
                    aria-hidden
                  />
                  <span
                    className="hidden size-8 rounded-md dark:block"
                    style={{ background: slot.dark }}
                    aria-hidden
                  />
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                    slot {index}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </AdminSection>

      <AdminSection
        title={isAr ? 'الطباعة' : 'Typography'}
        description={
          isAr
            ? 'Readex Pro للعناوين (عربي ولاتيني من تصميم واحد) و IBM Plex Sans Arabic للنصوص.'
            : 'Readex Pro for headings — one design for Arabic and Latin — and IBM Plex Sans Arabic for body text.'
        }
      >
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-display-xl font-semibold">
              {isAr ? 'مدربك معاك في أي وقت' : 'Your coach, anytime'}
            </p>
            <p className="text-display-md font-semibold">
              {isAr ? 'عنوان قسم' : 'Section heading'}
            </p>
            <p className="text-base">
              {isAr
                ? 'نص الفقرة العادي، بارتفاع سطر أوسع للعربي حتى تتنفّس الحروف المتصلة.'
                : 'Regular body copy, with wider leading in Arabic so joined letterforms can breathe.'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isAr ? 'نص ثانوي بلون خافت.' : 'Secondary copy in the muted tone.'}
            </p>
            <p className="stat-value" dir="ltr">
              1,234,567
            </p>
          </CardContent>
        </Card>
      </AdminSection>

      <AdminSection
        title={isAr ? 'العنصر التوقيعي: حلقة التقدّم' : 'Signature: the progress ring'}
        description={
          isAr
            ? 'يُستخدم لكل «كذا من كذا»: حصص الخطة، التزام المتدرب، ماكروز الوجبة.'
            : 'Used for every "x of y": plan quota, trainee adherence, meal macros.'
        }
      >
        <Card>
          <CardContent className="flex flex-wrap items-center gap-10 p-6">
            <StatRing value={0.32} tone="primary" label={isAr ? 'الحصة' : 'Quota'}>
              32%
            </StatRing>
            <StatRing value={0.78} tone="success" label={isAr ? 'الالتزام' : 'Adherence'}>
              78%
            </StatRing>
            <StatRing value={0.96} tone="warning" label={isAr ? 'قرب النفاد' : 'Near limit'}>
              96%
            </StatRing>
            <StatRing value={1} tone="destructive" label={isAr ? 'تجاوز' : 'Over'}>
              112%
            </StatRing>
            <MacroRings
              macros={[
                { label: isAr ? 'بروتين' : 'Protein', value: 118, target: 150, tone: 'primary' },
                { label: isAr ? 'كارب' : 'Carbs', value: 210, target: 240, tone: 'info' },
                { label: isAr ? 'دهون' : 'Fat', value: 74, target: 65, tone: 'warning' },
              ]}
            />
          </CardContent>
        </Card>
      </AdminSection>

      <AdminSection title={isAr ? 'الأزرار والشارات' : 'Buttons & badges'}>
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button>{isAr ? 'أساسي' : 'Default'}</Button>
              <Button variant="brand">
                <Sparkles />
                {isAr ? 'كهرماني' : 'Brand'}
              </Button>
              <Button variant="outline">{isAr ? 'محدّد' : 'Outline'}</Button>
              <Button variant="secondary">{isAr ? 'ثانوي' : 'Secondary'}</Button>
              <Button variant="ghost">{isAr ? 'شفاف' : 'Ghost'}</Button>
              <Button variant="destructive">{isAr ? 'حذف' : 'Destructive'}</Button>
              <Button loading>{isAr ? 'جارٍ الحفظ' : 'Saving'}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{isAr ? 'افتراضي' : 'Default'}</Badge>
              <Badge variant="muted">{isAr ? 'خافت' : 'Muted'}</Badge>
              <Badge variant="success">{isAr ? 'معتمد' : 'Approved'}</Badge>
              <Badge variant="warning">{isAr ? 'قيد المراجعة' : 'Pending'}</Badge>
              <Badge variant="destructive">{isAr ? 'مرفوض' : 'Rejected'}</Badge>
            </div>
          </CardContent>
        </Card>
      </AdminSection>

      <AdminSection title={isAr ? 'الحركة' : 'Motion'}>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="space-y-2 p-6">
              <p className="text-sm font-medium">{isAr ? 'عدّاد تصاعدي' : 'Count-up'}</p>
              <p className="stat-value text-primary">
                <AnimatedNumber value={128460} locale={locale} />
              </p>
              <p className="text-xs text-muted-foreground">
                {isAr ? 'يعمل مرة واحدة عند أول ظهور' : 'Runs once, on first sight'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 p-6">
              <p className="text-sm font-medium">{isAr ? 'حالة تحميل' : 'Loading state'}</p>
              <div className="shimmer h-4 w-full rounded bg-muted" />
              <div className="shimmer h-4 w-2/3 rounded bg-muted" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-6 text-sm">
              <p className="font-medium">{isAr ? 'المدد والمنحنى' : 'Durations & curve'}</p>
              <ul className="space-y-1 text-muted-foreground" dir="ltr">
                <li>micro — 120ms</li>
                <li>element — 220ms</li>
                <li>page — 380ms</li>
                <li>cubic-bezier(.32,.72,0,1)</li>
              </ul>
            </CardContent>
          </Card>
        </div>
        <Alert variant="warning">
          <Sparkles />
          <div>
            <AlertTitle>{isAr ? 'قاعدة غير قابلة للتفاوض' : 'A non-negotiable'}</AlertTitle>
            <AlertDescription>
              {isAr
                ? 'مع prefers-reduced-motion لا يتحرك أي شيء سوى الشفافية — مطبَّق عالميًا في globals.css.'
                : 'Under prefers-reduced-motion nothing moves but opacity — enforced globally in globals.css.'}
            </AlertDescription>
          </div>
        </Alert>
      </AdminSection>

      <AdminSection title={isAr ? 'الحالة الفارغة' : 'Empty state'}>
        <EmptyState
          icon={<Inbox />}
          title={isAr ? 'لا يوجد شيء هنا بعد' : 'Nothing here yet'}
          description={
            isAr
              ? 'كل قائمة فاضية تعرض علامة مرسومة وخطوة تالية، لأنها غالبًا أول شاشة يراها المستخدم الجديد.'
              : 'Every empty list gets a drawn mark and a next step — it is usually the first screen a new user sees.'
          }
          action={<Button size="sm">{isAr ? 'إضافة أول عنصر' : 'Add the first one'}</Button>}
        />
      </AdminSection>
    </AdminPage>
  );
}
