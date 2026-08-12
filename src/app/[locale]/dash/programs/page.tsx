import { setRequestLocale } from 'next-intl/server';
import { requireTrainerStage } from '@/lib/trainer/gate';
import { prisma } from '@/lib/prisma';
import { GOAL_LABELS, label as pickLabel } from '@/lib/training';
import { TrainerPage } from '@/components/trainer/page-shell';
import { ProgramList, type ProgramCard } from './program-list';

export default async function ProgramsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user } = await requireTrainerStage(locale);
  const isAr = locale === 'ar';

  const [programs, trainees] = await Promise.all([
    prisma.workoutProgram.findMany({
      where: { trainerId: user.trainerId },
      orderBy: { createdAt: 'desc' },
      include: {
        trainee: { select: { fullName: true } },
        weeks: { select: { _count: { select: { days: true } }, days: { select: { _count: { select: { items: true } } } } } },
      },
    }),
    prisma.trainee.findMany({
      where: { trainerId: user.trainerId, status: 'ACTIVE' },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true },
    }),
  ]);

  const rows: ProgramCard[] = programs.map((program) => ({
    id: program.id,
    name: program.name,
    goalLabel: pickLabel(GOAL_LABELS, program.goal, locale),
    weeksCount: program.weeksCount,
    // Summed in memory: the counts are already loaded and a program has at
    // most 52 weeks, so a second round trip would cost more than it saves.
    exerciseCount: program.weeks.reduce(
      (sum, week) => sum + week.days.reduce((s, day) => s + day._count.items, 0),
      0,
    ),
    isTemplate: program.isTemplate,
    traineeName: program.trainee?.fullName ?? null,
  }));

  return (
    <TrainerPage
      title={isAr ? 'البرامج' : 'Programs'}
      description={
        isAr
          ? 'ابنِ برنامجًا لمتدرب بعينه، أو قالبًا تعيد استخدامه مع أكتر من واحد.'
          : 'Build a program for one trainee, or a template you reuse with many.'
      }
    >
      <ProgramList
        rows={rows}
        goals={Object.keys(GOAL_LABELS).map((value) => ({
          value,
          label: pickLabel(GOAL_LABELS, value, locale),
        }))}
        trainees={trainees.map((t) => ({ value: t.id, label: t.fullName }))}
        labels={
          isAr
            ? {
                add: 'برنامج جديد',
                addTitle: 'برنامج جديد',
                formSubtitle: 'هنجهّزلك هيكل البرنامج بالأسابيع والأيام، وتملأه بالتمارين.',
                name: 'اسم البرنامج',
                goal: 'الهدف',
                weeksCount: 'عدد الأسابيع',
                weeksHint: 'كل أسبوع هيتقسم ٧ أيام',
                isTemplate: 'خليه قالبًا',
                isTemplateHint: 'القالب مش مربوط بمتدرب، وتنسخه لأي حد',
                trainee: 'المتدرب',
                traineeHint: 'اختياري — تقدر تربطه لاحقًا',
                description: 'الوصف',
                template: 'قالب',
                unassigned: 'غير مربوط',
                weeks: '{n} أسابيع',
                exercises: '{n} تمرين',
                duplicate: 'نسخة',
                delete: 'حذف',
                create: 'أنشئ وابدأ',
                cancel: 'إلغاء',
                generic: 'حدث خطأ غير متوقع، حاول مرة أخرى',
                confirmDelete: 'حذف برنامج «{name}»؟',
                emptyTitle: 'لسه مفيش برامج',
                emptyDescription: 'ابنِ أول برنامج، وابدأ تحطّ فيه تمارين متدربيك.',
              }
            : {
                add: 'New program',
                addTitle: 'New program',
                formSubtitle: 'We lay out the weeks and days; you fill in the exercises.',
                name: 'Program name',
                goal: 'Goal',
                weeksCount: 'Weeks',
                weeksHint: 'Each week is split into 7 days',
                isTemplate: 'Make it a template',
                isTemplateHint: 'A template is unassigned and can be copied to anyone',
                trainee: 'Trainee',
                traineeHint: 'Optional — you can assign it later',
                description: 'Description',
                template: 'Template',
                unassigned: 'Unassigned',
                weeks: '{n} weeks',
                exercises: '{n} exercises',
                duplicate: 'Duplicate',
                delete: 'Delete',
                create: 'Create and start',
                cancel: 'Cancel',
                generic: 'Something went wrong, please try again',
                confirmDelete: 'Delete the “{name}” program?',
                emptyTitle: 'No programs yet',
                emptyDescription: 'Build your first program and start adding exercises.',
              }
        }
      />
    </TrainerPage>
  );
}
