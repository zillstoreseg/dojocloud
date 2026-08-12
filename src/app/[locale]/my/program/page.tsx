import { setRequestLocale } from 'next-intl/server';
import { Dumbbell } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireTraineePage, programPosition } from '@/lib/trainee/portal';
import { TraineePage } from '@/components/trainee/page-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const DAY_NAMES = {
  ar: ['اليوم 1', 'اليوم 2', 'اليوم 3', 'اليوم 4', 'اليوم 5', 'اليوم 6', 'اليوم 7'],
  en: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
};

export default async function MyProgramPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);
  const isAr = locale === 'ar';

  const program = await prisma.workoutProgram.findFirst({
    where: { traineeId: ctx.traineeId, isActive: true, isTemplate: false },
    orderBy: { createdAt: 'desc' },
    include: {
      weeks: {
        orderBy: { weekNumber: 'asc' },
        include: {
          days: {
            orderBy: { dayNumber: 'asc' },
            include: {
              items: {
                orderBy: { order: 'asc' },
                include: { exercise: { select: { nameAr: true, nameEn: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!program) {
    return (
      <TraineePage title={isAr ? 'برنامجي' : 'My program'}>
        <EmptyState
          icon={<Dumbbell />}
          title={isAr ? 'لسه مفيش برنامج' : 'No program yet'}
          description={
            isAr
              ? 'مدربك لسه بيجهّزه. هيوصلك إشعار أول ما يخلص.'
              : 'Your coach is still writing it. You’ll be notified when it’s ready.'
          }
        />
      </TraineePage>
    );
  }

  const current = programPosition(
    program.startDate ?? program.createdAt,
    program.weeksCount,
  );

  return (
    <TraineePage
      title={program.name}
      description={
        program.description ??
        (isAr
          ? `${program.weeksCount} أسابيع — إنت دلوقتي في الأسبوع ${current.weekNumber}.`
          : `${program.weeksCount} weeks — you're in week ${current.weekNumber}.`)
      }
    >
      <Tabs defaultValue={`w${current.weekNumber}`}>
        <TabsList className="flex-wrap">
          {program.weeks.map((week) => (
            <TabsTrigger key={week.id} value={`w${week.weekNumber}`}>
              {isAr ? `أسبوع ${week.weekNumber}` : `Week ${week.weekNumber}`}
              {week.weekNumber === current.weekNumber ? (
                <span className="ms-1 size-1.5 rounded-full bg-primary" aria-hidden />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {program.weeks.map((week) => (
          <TabsContent key={week.id} value={`w${week.weekNumber}`} className="space-y-3">
            {week.note ? <p className="text-sm text-muted-foreground">{week.note}</p> : null}

            <div className="grid gap-3 md:grid-cols-2">
              {week.days.map((day) => {
                const isToday =
                  week.weekNumber === current.weekNumber && day.dayNumber === current.dayNumber;

                return (
                  <Card key={day.id} className={isToday ? 'border-primary/50 shadow-lift' : ''}>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display font-semibold">
                          {day.title ?? DAY_NAMES[isAr ? 'ar' : 'en'][day.dayNumber - 1]}
                        </h3>
                        {isToday ? (
                          <Badge>{isAr ? 'النهارده' : 'Today'}</Badge>
                        ) : day.isRestDay ? (
                          <Badge variant="muted">{isAr ? 'راحة' : 'Rest'}</Badge>
                        ) : null}
                      </div>

                      {day.isRestDay || day.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {isAr ? 'يوم راحة' : 'Rest day'}
                        </p>
                      ) : (
                        <ul className="space-y-1.5 text-sm">
                          {day.items.map((item) => (
                            <li key={item.id} className="flex items-baseline justify-between gap-3">
                              <span className="min-w-0 truncate">
                                {isAr ? item.exercise.nameAr : item.exercise.nameEn}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {item.sets} × {item.reps}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {day.note ? (
                        <p className="text-xs text-muted-foreground">{day.note}</p>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </TraineePage>
  );
}
