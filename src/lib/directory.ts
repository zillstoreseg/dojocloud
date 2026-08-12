import { prisma } from './prisma';

/**
 * Keeps `TrainerProfile`'s denormalised directory columns true.
 *
 * The public directory filters and sorts on subscriber count, certificate
 * count and starting price. Computing those per request means a join and an
 * aggregate across every coach on every page of results, which is the shape of
 * query that is fine with fifty coaches and unusable with five thousand. They
 * are written here instead, at the moments they actually change — an approval,
 * a subscription, a cancellation, a package edit — and this is the only writer.
 *
 * It is deliberately a full recompute from the source rows rather than an
 * increment: a counter that drifts is worse than one that costs a query, and a
 * recompute makes the drift self-healing the next time anything touches it.
 */
export async function syncDirectoryCounters(trainerId: string): Promise<void> {
  const [trainees, certificates, cheapest] = await Promise.all([
    prisma.trainee.count({ where: { trainerId, status: 'ACTIVE' } }),
    prisma.certificate.count({ where: { trainerId, status: 'APPROVED' } }),
    prisma.trainerPackage.findFirst({
      where: { trainerId, isActive: true, isPublic: true },
      orderBy: { price: 'asc' },
      select: { price: true, currency: true },
    }),
  ]);

  await prisma.trainerProfile.update({
    where: { id: trainerId },
    data: {
      activeTraineesCount: trainees,
      approvedCertificatesCount: certificates,
      startingPrice: cheapest?.price ?? null,
      startingCurrency: cheapest?.currency ?? null,
    },
  });
}

/** Backfill for every coach — used by the seed and by a repair command. */
export async function syncAllDirectoryCounters(): Promise<number> {
  const trainers = await prisma.trainerProfile.findMany({ select: { id: true } });
  for (const trainer of trainers) {
    await syncDirectoryCounters(trainer.id);
  }
  return trainers.length;
}
