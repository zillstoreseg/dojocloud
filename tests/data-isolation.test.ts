import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, tenantDb } from '@/lib/prisma';
import { assertOwns, assertOwnsTrainee, AuthzError } from '@/lib/ownership';

/**
 * The isolation test the whole tenancy design exists to satisfy: trainer A must
 * not be able to read, modify or delete anything belonging to trainer B.
 *
 * It runs against the real database rather than a mock, because both defences
 * being tested — the `assertOwns*` guards and the `tenantDb()` Prisma extension
 * — are only meaningful in terms of the queries they actually emit. A mocked
 * client would happily agree with a broken filter.
 *
 * Fixtures are created under a unique prefix and torn down at the end, so the
 * test is safe to run against a seeded development database.
 */

const TAG = `isolation-${Date.now()}`;

interface Tenant {
  userId: string;
  trainerId: string;
  traineeId: string;
  exerciseId: string;
  programId: string;
  nutritionPlanId: string;
  packageId: string;
}

async function makeTenant(slug: string): Promise<Tenant> {
  const user = await prisma.user.create({
    data: {
      email: `${slug}.${TAG}@example.test`,
      passwordHash: 'not-a-real-hash',
      role: 'TRAINER',
    },
  });

  const trainer = await prisma.trainerProfile.create({
    data: {
      userId: user.id,
      username: `${slug}-${TAG}`,
      fullName: `Coach ${slug}`,
      specialties: ['MUSCLE_GAIN'],
      phone: `+2010000${Math.floor(Math.random() * 100000)}`,
      country: 'EG',
      gender: 'MALE',
      trainsGenders: 'BOTH',
      yearsExperience: 5,
      approvalStatus: 'APPROVED',
    },
  });

  const [trainee, exercise, program, nutritionPlan, pkg] = await Promise.all([
    prisma.trainee.create({
      data: { trainerId: trainer.id, fullName: `Trainee of ${slug}` },
    }),
    prisma.exercise.create({
      data: {
        trainerId: trainer.id,
        nameAr: `تمرين ${slug}`,
        nameEn: `Exercise ${slug}`,
        muscleGroup: 'CHEST',
      },
    }),
    prisma.workoutProgram.create({
      data: { trainerId: trainer.id, name: `Program ${slug}` },
    }),
    prisma.nutritionPlan.create({
      data: { trainerId: trainer.id, name: `Plan ${slug}` },
    }),
    prisma.trainerPackage.create({
      data: { trainerId: trainer.id, name: `Package ${slug}`, price: 500, durationDays: 30 },
    }),
  ]);

  return {
    userId: user.id,
    trainerId: trainer.id,
    traineeId: trainee.id,
    exerciseId: exercise.id,
    programId: program.id,
    nutritionPlanId: nutritionPlan.id,
    packageId: pkg.id,
  };
}

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await makeTenant('alpha');
  b = await makeTenant('beta');
});

afterAll(async () => {
  // TrainerProfile cascades to every owned row, and User cascades to the profile.
  await prisma.user.deleteMany({ where: { id: { in: [a?.userId, b?.userId].filter(Boolean) } } });
  await prisma.$disconnect();
});

describe('ownership guards', () => {
  it('lets a trainer through to their own rows', async () => {
    await expect(assertOwnsTrainee(a.trainerId, a.traineeId)).resolves.toBe(a.traineeId);
    await expect(assertOwns('exercise', a.trainerId, a.exerciseId)).resolves.toBe(a.exerciseId);
    await expect(assertOwns('workoutProgram', a.trainerId, a.programId)).resolves.toBe(a.programId);
    await expect(assertOwns('nutritionPlan', a.trainerId, a.nutritionPlanId)).resolves.toBe(
      a.nutritionPlanId,
    );
    await expect(assertOwns('trainerPackage', a.trainerId, a.packageId)).resolves.toBe(a.packageId);
  });

  it("refuses a trainee that belongs to another trainer", async () => {
    await expect(assertOwnsTrainee(a.trainerId, b.traineeId)).rejects.toBeInstanceOf(AuthzError);
  });

  it.each([
    ['exercise', 'exerciseId'],
    ['workoutProgram', 'programId'],
    ['nutritionPlan', 'nutritionPlanId'],
    ['trainerPackage', 'packageId'],
  ] as const)('refuses another trainer\'s %s', async (model, key) => {
    await expect(assertOwns(model, a.trainerId, b[key])).rejects.toBeInstanceOf(AuthzError);
  });

  it('reports a cross-tenant hit as NOT_FOUND, not FORBIDDEN', async () => {
    // Otherwise the error itself confirms the row exists, which is an id oracle.
    const error = await assertOwns('exercise', a.trainerId, b.exerciseId).catch((e) => e);
    expect(error).toBeInstanceOf(AuthzError);
    expect((error as AuthzError).code).toBe('NOT_FOUND');
  });
});

describe('tenantDb() scoping', () => {
  it('hides other tenants from findMany', async () => {
    const rows = await tenantDb(a.trainerId).trainee.findMany();
    expect(rows.map((r) => r.id)).toContain(a.traineeId);
    expect(rows.map((r) => r.id)).not.toContain(b.traineeId);
  });

  it('returns null from findFirst for another tenant even when the id is given', async () => {
    const row = await tenantDb(a.trainerId).trainee.findFirst({ where: { id: b.traineeId } });
    expect(row).toBeNull();
  });

  it('returns null from findUnique for another tenant', async () => {
    const row = await tenantDb(a.trainerId).workoutProgram.findUnique({
      where: { id: b.programId },
    });
    expect(row).toBeNull();
  });

  it('counts only the caller\'s rows', async () => {
    const count = await tenantDb(a.trainerId).trainee.count({ where: { id: b.traineeId } });
    expect(count).toBe(0);
  });

  it('cannot update another tenant\'s row', async () => {
    await expect(
      tenantDb(a.trainerId).trainee.update({
        where: { id: b.traineeId },
        data: { fullName: 'hijacked' },
      }),
    ).rejects.toThrow();

    const untouched = await prisma.trainee.findUnique({ where: { id: b.traineeId } });
    expect(untouched?.fullName).toBe('Trainee of beta');
  });

  it('cannot delete another tenant\'s row', async () => {
    await expect(
      tenantDb(a.trainerId).nutritionPlan.delete({ where: { id: b.nutritionPlanId } }),
    ).rejects.toThrow();

    const alive = await prisma.nutritionPlan.findUnique({ where: { id: b.nutritionPlanId } });
    expect(alive).not.toBeNull();
  });

  it('does not let a bulk write reach across tenants', async () => {
    const result = await tenantDb(a.trainerId).trainee.updateMany({
      where: { id: b.traineeId },
      data: { notes: 'hijacked' },
    });
    expect(result.count).toBe(0);

    const alive = await prisma.trainee.findUnique({ where: { id: b.traineeId } });
    expect(alive?.notes).toBeNull();
  });

  it('does not let a bulk delete reach across tenants', async () => {
    const result = await tenantDb(a.trainerId).exercise.deleteMany({
      where: { id: b.exerciseId },
    });
    expect(result.count).toBe(0);
    expect(await prisma.exercise.findUnique({ where: { id: b.exerciseId } })).not.toBeNull();
  });

  it('stamps the caller as owner on create, ignoring a forged trainerId', async () => {
    const forged = await tenantDb(a.trainerId).trainee.create({
      // A client-supplied trainerId is exactly the attack the extension exists
      // to neutralise: it must lose to the session-derived one.
      data: { fullName: `Forged ${TAG}`, trainerId: b.trainerId },
    });
    expect(forged.trainerId).toBe(a.trainerId);
    await prisma.trainee.delete({ where: { id: forged.id } });
  });

  it('refuses to build a client without a trainerId', () => {
    expect(() => tenantDb('')).toThrow();
  });
});
