import { setRequestLocale } from 'next-intl/server';
import { Sparkles } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { FLAG_KEYS, resolveFlags } from '@/lib/flags';
import { aiStatus } from '@/lib/ai/client';
import { getQuota, QUOTA_KEYS } from '@/lib/quota';
import { TrainerPage } from '@/components/trainer/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatRing } from '@/components/ui/stat-ring';
import { AiStudio } from './ai-studio';

/**
 * Where a coach drafts with the assistant.
 *
 * The remaining-credits ring leads the screen because every action below costs
 * one, and a coach who discovers that after clicking has been surprised by
 * their own bill.
 */
export default async function AiStudioPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const [status, flags, quota, trainees, recent] = await Promise.all([
    aiStatus(user.id),
    resolveFlags(user.id),
    getQuota(user.trainerId, QUOTA_KEYS.AI_GENERATIONS),
    prisma.trainee.findMany({
      where: { trainerId: user.trainerId, status: { in: ['ACTIVE', 'PAUSED'] } },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, goal: true },
      take: 200,
    }),
    prisma.aiUsage.findMany({
      where: { trainerId: user.trainerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { feature: true, costUsd: true, success: true, createdAt: true },
    }),
  ]);

  if (!status.ready) {
    return (
      <TrainerPage title={isAr ? 'المساعد الذكي' : 'AI assistant'}>
        <EmptyState
          icon={<Sparkles />}
          title={isAr ? 'المساعد مش شغّال دلوقتي' : 'The assistant is off'}
          description={
            status.reason === 'NO_KEY'
              ? isAr
                ? 'إدارة المنصة لسه ما ضافتش مفتاح الـ AI. الميزة هتشتغل أول ما يتضاف.'
                : 'The platform has not added an AI key yet. The feature turns on as soon as it is.'
              : isAr
                ? 'الميزة متوقفة على مستوى المنصة.'
                : 'The feature is switched off platform-wide.'
          }
        />
      </TrainerPage>
    );
  }

  const canProgram = flags.get(FLAG_KEYS.AI_WORKOUT)?.enabled ?? false;
  const canNutrition = flags.get(FLAG_KEYS.AI_NUTRITION)?.enabled ?? false;

  return (
    <TrainerPage
      title={isAr ? 'المساعد الذكي' : 'AI assistant'}
      description={
        isAr
          ? 'المساعد بيكتب مسودة، وإنت اللي بتقرأها وتعدّلها وتقرر تحفظها. مفيش حاجة بتتكتب لمتدربك من غير موافقتك.'
          : 'The assistant writes a draft. You read it, edit it, and decide. Nothing reaches a trainee without your approval.'
      }
    >
      <Card>
        <CardContent className="flex flex-wrap items-center gap-6 p-6">
          <StatRing
            value={quota.limit ? quota.used / quota.limit : 0}
            size={92}
            tone={quota.exceeded ? 'destructive' : 'primary'}
            label={isAr ? 'من رصيد الشهر' : 'of this cycle'}
          >
            <span className="text-sm">{quota.used}</span>
          </StatRing>

          <div>
            <p className="text-sm text-muted-foreground">{isAr ? 'توليدات متبقية' : 'Generations left'}</p>
            <p className="font-display text-3xl font-bold tabular-nums">
              {quota.remaining ?? (isAr ? 'غير محدود' : 'Unlimited')}
            </p>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {status.model}
            </p>
          </div>

          {recent.length > 0 ? (
            <ul className="ms-auto space-y-1 text-xs text-muted-foreground">
              {recent.map((row, index) => (
                <li key={index} className="tabular-nums">
                  {row.feature} · ${Number(row.costUsd).toFixed(4)}
                  {row.success ? '' : ` · ${isAr ? 'فشل' : 'failed'}`}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <AiStudio
        locale={locale}
        trainees={trainees.map((t) => ({ id: t.id, name: t.fullName }))}
        canProgram={canProgram}
        canNutrition={canNutrition}
        exhausted={quota.exceeded}
      />
    </TrainerPage>
  );
}
