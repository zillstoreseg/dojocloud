import { forbidden, notFound, redirect } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from './auth';
import { prisma, tenantDb } from './prisma';
import { hasPermission, type Permission } from './permissions';

export class AuthzError extends Error {
  constructor(
    message: string,
    readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND',
  ) {
    super(message);
    this.name = 'AuthzError';
  }
}

export type SessionUser = Session['user'];

/** Returns the session user or throws. Use in server actions. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new AuthzError('Not signed in', 'UNAUTHENTICATED');
  if (session.user.status === 'SUSPENDED') throw new AuthzError('Account suspended', 'FORBIDDEN');
  return session.user;
}

/** Redirects to /login instead of throwing. Use in page components. */
export async function requireUserPage(locale = 'ar'): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect(`/${locale}/login`);
  if (session.user.status === 'SUSPENDED') redirect(`/${locale}/login?error=suspended`);
  return session.user;
}

export async function requireAdmin(permission?: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new AuthzError('Admin only', 'FORBIDDEN');
  if (permission && !hasPermission(user, permission)) {
    throw new AuthzError(`Missing permission: ${permission}`, 'FORBIDDEN');
  }
  return user;
}

export async function requireAdminPage(permission?: Permission, locale = 'ar'): Promise<SessionUser> {
  const user = await requireUserPage(locale);
  if (user.role !== 'ADMIN') notFound();
  if (permission && !hasPermission(user, permission)) forbidden();
  return user;
}

/**
 * Trainer guard. `trainerId` is always taken from the session — never from
 * request input — which is what makes cross-tenant access impossible.
 */
export async function requireTrainer(): Promise<SessionUser & { trainerId: string }> {
  const user = await requireUser();
  if (user.role !== 'TRAINER' || !user.trainerId) {
    throw new AuthzError('Trainer only', 'FORBIDDEN');
  }
  return user as SessionUser & { trainerId: string };
}

/** Redirecting trainer guard for page components. */
export async function requireTrainerPage(
  locale = 'ar',
): Promise<SessionUser & { trainerId: string }> {
  const user = await requireUserPage(locale);
  if (user.role !== 'TRAINER' || !user.trainerId) notFound();
  return user as SessionUser & { trainerId: string };
}

/**
 * Reads the trainer's approval status from the database.
 *
 * The session carries an `approvalStatus` claim, but it is a snapshot taken
 * when the JWT was minted: an admin approving a trainer who is already signed
 * in does not update their token. Using the claim to gate anything would keep
 * a freshly approved trainer locked out until they signed out and back in — so
 * every decision that turns on approval reads the row instead.
 */
export async function isApprovedTrainer(trainerId: string): Promise<boolean> {
  const profile = await prisma.trainerProfile.findUnique({
    where: { id: trainerId },
    select: { approvalStatus: true },
  });
  return profile?.approvalStatus === 'APPROVED';
}

/** Trainer guard that also requires an approved account and an active subscription. */
export async function requireActiveTrainer(): Promise<SessionUser & { trainerId: string }> {
  const user = await requireTrainer();
  if (!(await isApprovedTrainer(user.trainerId))) {
    throw new AuthzError('Account pending approval', 'FORBIDDEN');
  }
  const sub = await prisma.subscription.findFirst({
    where: { trainerId: user.trainerId, status: { in: ['ACTIVE', 'TRIALING'] } },
    select: { id: true },
  });
  if (!sub) throw new AuthzError('No active subscription', 'FORBIDDEN');
  return user;
}

export async function requireTrainee(): Promise<SessionUser & { traineeId: string }> {
  const user = await requireUser();
  if (user.role !== 'TRAINEE' || !user.traineeId) {
    throw new AuthzError('Trainee only', 'FORBIDDEN');
  }
  return user as SessionUser & { traineeId: string };
}

/** Convenience: the tenant-scoped Prisma client for the signed-in trainer. */
export async function trainerDb() {
  const user = await requireTrainer();
  return { db: tenantDb(user.trainerId), user };
}

/**
 * Asserts the given trainee belongs to the signed-in trainer.
 * Returns the trainee id so callers can chain.
 */
export async function assertOwnsTrainee(trainerId: string, traineeId: string): Promise<string> {
  const found = await prisma.trainee.findFirst({
    where: { id: traineeId, trainerId },
    select: { id: true },
  });
  if (!found) throw new AuthzError('Trainee not found for this trainer', 'NOT_FOUND');
  return found.id;
}

/** Generic ownership assertion for any tenant-owned model. */
export async function assertOwns(
  model: 'workoutProgram' | 'nutritionPlan' | 'landingPage' | 'exercise' | 'trainerPackage' | 'lead',
  trainerId: string,
  id: string,
): Promise<string> {
  // @ts-expect-error — delegate lookup is dynamic but constrained by the union above.
  const found = await prisma[model].findFirst({ where: { id, trainerId }, select: { id: true } });
  if (!found) throw new AuthzError(`${model} not found for this trainer`, 'NOT_FOUND');
  return (found as { id: string }).id;
}

/** Maps an AuthzError to a serialisable result for server actions. */
export function toActionError(error: unknown): { ok: false; error: string; code?: string } {
  if (error instanceof AuthzError) {
    return { ok: false, error: error.message, code: error.code };
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return { ok: false, error: message };
}
