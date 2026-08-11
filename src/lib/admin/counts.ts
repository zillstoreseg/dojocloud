import { cache } from 'react';
import { prisma } from '@/lib/prisma';

export interface PendingCounts {
  trainers: number;
  certificates: number;
  payments: number;
  traineePayments: number;
  pages: number;
  total: number;
}

/**
 * Everything waiting on an admin decision. Drives the sidebar badges and the
 * activations centre tab counters.
 */
export const getPendingCounts = cache(async (): Promise<PendingCounts> => {
  const [trainers, certificates, payments, traineePayments, pages] = await Promise.all([
    prisma.trainerProfile.count({ where: { approvalStatus: 'PENDING' } }),
    prisma.certificate.count({ where: { status: 'PENDING' } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.traineeSubscription.count({ where: { status: 'PENDING' } }),
    prisma.landingPage.count({ where: { status: 'PUBLISHED', trainer: { approvalStatus: 'PENDING' } } }),
  ]);

  return {
    trainers,
    certificates,
    payments,
    traineePayments,
    pages,
    total: trainers + certificates + payments + traineePayments,
  };
});
