import { setRequestLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { requireTraineePage } from '@/lib/trainee/portal';
import { TraineePage } from '@/components/trainee/page-shell';
import { formatDate, decimalToNumber } from '@/lib/money';
import { MeasurementPanel, type MeasurementRow } from './measurement-panel';

export default async function MeasurementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { ctx } = await requireTraineePage(locale);
  const isAr = locale === 'ar';

  const measurements = await prisma.measurement.findMany({
    where: { traineeId: ctx.traineeId },
    orderBy: { takenAt: 'desc' },
    take: 60,
  });

  const rows: MeasurementRow[] = measurements.map((m) => ({
    id: m.id,
    takenAt: formatDate(m.takenAt, locale),
    // Sortable key for the chart, which needs order rather than a display string.
    sortKey: m.takenAt.toISOString().slice(0, 10),
    weightKg: m.weightKg ? decimalToNumber(m.weightKg) : null,
    bodyFatPct: m.bodyFatPct ? decimalToNumber(m.bodyFatPct) : null,
    chestCm: m.chestCm ? decimalToNumber(m.chestCm) : null,
    waistCm: m.waistCm ? decimalToNumber(m.waistCm) : null,
    hipsCm: m.hipsCm ? decimalToNumber(m.hipsCm) : null,
    armCm: m.armCm ? decimalToNumber(m.armCm) : null,
    thighCm: m.thighCm ? decimalToNumber(m.thighCm) : null,
    neckCm: m.neckCm ? decimalToNumber(m.neckCm) : null,
    photos: m.photos,
    note: m.note,
  }));

  return (
    <TraineePage
      title={isAr ? 'قياساتي' : 'My measurements'}
      description={
        isAr
          ? 'الميزان وحده بيكدب. القياسات والصور بيوروا اللي الميزان بيخبّيه.'
          : 'The scale alone lies. Tape and photos show what it hides.'
      }
    >
      <MeasurementPanel locale={locale} rows={rows} />
    </TraineePage>
  );
}
