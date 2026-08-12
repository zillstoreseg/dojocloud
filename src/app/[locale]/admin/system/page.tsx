import { setRequestLocale } from 'next-intl/server';
import { AlertTriangle, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { requireAdminPage } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getSettings } from '@/lib/settings';
import { rlsStatus, rlsRoleIsExempt } from '@/lib/rls';
import { aiConfig } from '@/lib/ai/client';
import { env } from '@/lib/env';
import { AdminPage } from '@/components/admin/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/money';

type Level = 'ok' | 'warn' | 'bad';

interface Check {
  label: string;
  value: string;
  level: Level;
  detail?: string;
}

const ICONS: Record<Level, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
};

const TONES: Record<Level, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
};

/**
 * Whether the platform is actually configured, as opposed to merely deployed.
 *
 * Every check here is one that fails quietly. A superuser database role leaves
 * row-level security installed and inert; a missing AI key disables a feature
 * coaches are paying for; an unset cron secret means nothing expires and no
 * wallet hold ever matures. None of these produce an error anybody sees, which
 * is exactly why they need a screen.
 */
export default async function SystemHealthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('settings.write', locale);

  const isAr = locale === 'ar';

  const [role, tables, ai, emailSettings, recentEmails, lastCron] = await Promise.all([
    rlsRoleIsExempt(),
    rlsStatus(),
    aiConfig(),
    getSettings('email'),
    prisma.emailLog.groupBy({ by: ['status'], _count: true }),
    prisma.notification.findFirst({
      where: { type: 'SUBSCRIPTION_EXPIRING' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  const forced = tables.filter((t) => t.forced).length;
  const emailProvider = emailSettings['email.provider'] ?? 'none';
  const emailFailures = recentEmails.find((row) => row.status === 'FAILED')?._count ?? 0;

  const checks: Check[] = [
    {
      label: isAr ? 'دور قاعدة البيانات' : 'Database role',
      value: role.role,
      level: role.exempt ? 'bad' : 'ok',
      detail: role.exempt
        ? isAr
          ? 'الدور ده بيتخطى سياسات العزل تمامًا — كل حماية RLS معطّلة فعليًا.'
          : 'This role bypasses every isolation policy — RLS is effectively off.'
        : isAr
          ? 'سياسات العزل بتتطبق على الدور ده.'
          : 'Isolation policies apply to this role.',
    },
    {
      label: isAr ? 'عزل الصفوف (RLS)' : 'Row-level security',
      value: isAr ? `${forced} جدول` : `${forced} tables`,
      level: forced === 0 ? 'bad' : forced < 10 ? 'warn' : 'ok',
      detail: isAr
        ? 'الجداول اللي عليها سياسة عزل مفعّلة ومفروضة.'
        : 'Tables with an enabled and forced isolation policy.',
    },
    {
      label: isAr ? 'مفتاح الذكاء الاصطناعي' : 'AI key',
      value: ai ? ai.model : isAr ? 'غير مضبوط' : 'Not set',
      level: ai ? 'ok' : 'warn',
      detail: ai
        ? isAr
          ? `التسعير: $${ai.inputPricePerMTok} إدخال / $${ai.outputPricePerMTok} إخراج لكل مليون توكن.`
          : `Pricing: $${ai.inputPricePerMTok} in / $${ai.outputPricePerMTok} out per Mtok.`
        : isAr
          ? 'كل ميزات الـ AI متوقفة لحد ما يتضاف مفتاح.'
          : 'Every AI feature is off until a key is added.',
    },
    {
      label: isAr ? 'البريد' : 'Email',
      value: emailProvider,
      level: emailProvider === 'none' ? 'warn' : emailFailures > 0 ? 'warn' : 'ok',
      detail:
        emailProvider === 'none'
          ? isAr
            ? 'الإشعارات بتتسجّل جوه التطبيق بس، ومفيش بريد بيتبعت.'
            : 'Notifications stay in-app; no mail is being sent.'
          : emailFailures > 0
            ? isAr
              ? `${emailFailures} رسالة فشلت — راجع الإعدادات.`
              : `${emailFailures} messages failed — check the configuration.`
            : isAr
              ? 'البريد مضبوط وشغّال.'
              : 'Configured and sending.',
    },
    {
      label: isAr ? 'سر المهام المجدولة' : 'Cron secret',
      value: env.CRON_SECRET ? (isAr ? 'مضبوط' : 'Set') : isAr ? 'غير مضبوط' : 'Not set',
      level: env.CRON_SECRET ? 'ok' : 'bad',
      detail: env.CRON_SECRET
        ? isAr
          ? `آخر تنبيه تجديد: ${lastCron ? formatDateTime(lastCron.createdAt, locale) : '—'}`
          : `Last renewal reminder: ${lastCron ? formatDateTime(lastCron.createdAt, locale) : '—'}`
        : isAr
          ? 'من غيره الاشتراكات مش بتنتهي والمحفظة مش بتفك الحجز.'
          : 'Without it nothing expires and no wallet hold matures.',
    },
    {
      label: isAr ? 'التخزين' : 'Storage',
      value: env.STORAGE_DRIVER,
      level: env.STORAGE_DRIVER === 'local' ? 'warn' : 'ok',
      detail:
        env.STORAGE_DRIVER === 'local'
          ? isAr
            ? 'التخزين المحلي بيضيع مع كل نشر جديد — استخدم S3 في الإنتاج.'
            : 'Local storage is lost on every deploy — use S3 in production.'
          : isAr
            ? 'التخزين على S3.'
            : 'Backed by S3.',
    },
  ];

  const broken = checks.filter((check) => check.level === 'bad');

  return (
    <AdminPage
      title={isAr ? 'حالة النظام' : 'System health'}
      description={
        isAr
          ? 'الحاجات اللي بتفشل في صمت. كل بند هنا لو غلط، مفيش رسالة خطأ هتظهر لحد.'
          : 'The things that fail quietly. Every item here breaks without anyone seeing an error.'
      }
    >
      {broken.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>
            {isAr ? 'في حاجات محتاجة تظبيط' : 'Configuration needs attention'}
          </AlertTitle>
          <AlertDescription>
            {broken.map((check) => check.label).join(isAr ? '، ' : ', ')}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {checks.map((check) => {
          const Icon = ICONS[check.level];
          return (
            <Card key={check.label}>
              <CardContent className="flex items-start gap-3 p-5">
                <Icon className={`mt-0.5 size-5 shrink-0 ${TONES[check.level]}`} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="font-medium">{check.label}</p>
                    <Badge variant="muted" className="font-mono text-[0.7rem]">
                      {check.value}
                    </Badge>
                  </div>
                  {check.detail ? (
                    <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h2 className="font-display font-semibold">
              {isAr ? 'الجداول المحميّة' : 'Protected tables'}
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tables.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {isAr ? 'مفيش سياسات مثبّتة.' : 'No policies installed.'}
              </p>
            ) : (
              tables.map((table) => (
                <Badge key={table.table} variant={table.forced ? 'success' : 'warning'}>
                  {table.table}
                </Badge>
              ))
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? 'العزل بيتفرض على أي استعلام جوه withTenantRls؛ لوحة الأدمن والمهام المجدولة بتقرأ عبر كل المدربين بشكل مقصود.'
              : 'Isolation is enforced for any query inside withTenantRls; the admin panel and cron jobs read across coaches by design.'}
          </p>
        </CardContent>
      </Card>
    </AdminPage>
  );
}
