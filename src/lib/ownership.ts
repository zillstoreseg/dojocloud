import { prisma } from './prisma';

/**
 * Authorisation failures, as a thrown error rather than a return value, so a
 * server action that forgets to check cannot silently continue.
 *
 * Lives here rather than in `authz.ts` because everything in this file is
 * session-free: it takes a `trainerId` and asks the database a question. That
 * keeps the ownership rules importable from tests without pulling in
 * `next-auth`, which cannot load outside a request.
 */
export class AuthzError extends Error {
  constructor(
    message: string,
    readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND',
  ) {
    super(message);
    this.name = 'AuthzError';
  }
}

/** Models that carry a `trainerId` and can therefore be ownership-checked. */
export type OwnedModel =
  | 'workoutProgram'
  | 'nutritionPlan'
  | 'landingPage'
  | 'exercise'
  | 'trainerPackage'
  | 'lead';

/**
 * Asserts the given trainee belongs to the given trainer.
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

/**
 * Generic ownership assertion for any tenant-owned model.
 *
 * Deliberately reports a miss as NOT_FOUND rather than FORBIDDEN: a trainer
 * probing ids should not be able to tell "exists but is someone else's" from
 * "does not exist".
 */
export async function assertOwns(
  model: OwnedModel,
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
