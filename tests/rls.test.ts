import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { withTenantRls, rlsStatus, rlsRoleIsExempt } from '@/lib/rls';

/**
 * Row-level security, tested against the real database.
 *
 * The point of this file is that it does not test application code. Every
 * query below deliberately omits the `trainerId` filter the application would
 * normally add — so anything it fails to return was withheld by PostgreSQL
 * itself. That is the only way to demonstrate a defence that is supposed to
 * survive an application bug.
 */

const TAG = `rlstest-${Date.now()}`;

async function makeTenant(name: string) {
  const user = await prisma.user.create({
    data: {
      email: `${TAG}-${name}@test.local`,
      passwordHash: await bcrypt.hash('x'.repeat(12), 4),
      role: 'TRAINER',
    },
    select: { id: true },
  });

  const profile = await prisma.trainerProfile.create({
    data: {
      userId: user.id,
      username: `${TAG}-${name}`,
      fullName: `${TAG} ${name}`,
      phone: '0100000000',
      country: 'EG',
      gender: 'MALE',
      trainsGenders: 'BOTH',
      yearsExperience: 1,
      approvalStatus: 'APPROVED',
    },
    select: { id: true },
  });

  const trainee = await prisma.trainee.create({
    data: { trainerId: profile.id, fullName: `${TAG} trainee of ${name}` },
    select: { id: true },
  });

  return { trainerId: profile.id, traineeId: trainee.id, userId: user.id };
}

let a: Awaited<ReturnType<typeof makeTenant>>;
let b: Awaited<ReturnType<typeof makeTenant>>;

beforeAll(async () => {
  a = await makeTenant('a');
  b = await makeTenant('b');
});

afterAll(async () => {
  await prisma.trainee.deleteMany({ where: { fullName: { startsWith: TAG } } });
  await prisma.trainerProfile.deleteMany({ where: { username: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
});

describe('policy installation', () => {
  it('connects as a role that policies actually apply to', async () => {
    // The single most consequential configuration mistake available here: a
    // superuser or BYPASSRLS role makes every policy below a no-op, silently.
    // If this fails, nothing else in this file proves anything.
    const role = await rlsRoleIsExempt();
    expect(
      role.exempt,
      `DATABASE_URL connects as "${role.role}", which bypasses RLS (superuser=${role.superuser}, bypassrls=${role.bypassRls})`,
    ).toBe(false);
  });

  it('is enabled and forced on the tenant tables', async () => {
    const status = await rlsStatus();
    const byTable = new Map(status.map((row) => [row.table, row]));

    for (const table of ['Trainee', 'WorkoutProgram', 'NutritionPlan', 'Lead', 'FoodScan']) {
      const row = byTable.get(table);
      expect(row, `${table} has no RLS`).toBeDefined();
      expect(row!.enabled, `${table} RLS not enabled`).toBe(true);
      // Without FORCE the policy would not apply to the owner, which is the
      // role the application connects as — i.e. it would do nothing at all.
      expect(row!.forced, `${table} RLS not forced`).toBe(true);
    }
  });
});

describe('reads', () => {
  it('returns only this tenant, with no filter in the query at all', async () => {
    const rows = await withTenantRls(a.trainerId, (tx) =>
      tx.trainee.findMany({ where: { fullName: { startsWith: TAG } } }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(a.traineeId);
  });

  it('hides the other tenant even when asked for their row by id', async () => {
    const row = await withTenantRls(a.trainerId, (tx) =>
      tx.trainee.findUnique({ where: { id: b.traineeId } }),
    );
    expect(row).toBeNull();
  });

  it('counts only this tenant', async () => {
    const count = await withTenantRls(b.trainerId, (tx) =>
      tx.trainee.count({ where: { fullName: { startsWith: TAG } } }),
    );
    expect(count).toBe(1);
  });
});

describe('writes', () => {
  it('cannot update another tenant row through updateMany', async () => {
    const result = await withTenantRls(a.trainerId, (tx) =>
      tx.trainee.updateMany({
        where: { id: b.traineeId },
        data: { fullName: `${TAG} hijacked` },
      }),
    );
    expect(result.count).toBe(0);

    const untouched = await prisma.trainee.findUnique({
      where: { id: b.traineeId },
      select: { fullName: true },
    });
    expect(untouched!.fullName).not.toContain('hijacked');
  });

  it('cannot delete another tenant row', async () => {
    const result = await withTenantRls(a.trainerId, (tx) =>
      tx.trainee.deleteMany({ where: { id: b.traineeId } }),
    );
    expect(result.count).toBe(0);
    expect(await prisma.trainee.findUnique({ where: { id: b.traineeId } })).not.toBeNull();
  });

  it('refuses a row created under a forged owner', async () => {
    // WITH CHECK is the half of the policy that stops a tenant writing rows
    // into someone else's account — the mirror of the read restriction.
    await expect(
      withTenantRls(a.trainerId, (tx) =>
        tx.trainee.create({
          data: { trainerId: b.trainerId, fullName: `${TAG} smuggled` },
        }),
      ),
    ).rejects.toThrow();

    const smuggled = await prisma.trainee.findFirst({
      where: { fullName: `${TAG} smuggled` },
      select: { id: true },
    });
    expect(smuggled).toBeNull();
  });
});

describe('the context does not leak', () => {
  it('leaves the connection unscoped after the transaction commits', async () => {
    await withTenantRls(a.trainerId, (tx) => tx.trainee.count());

    // The same pool, a query later: if SET LOCAL had escaped its transaction,
    // this would see only tenant A.
    const all = await prisma.trainee.count({ where: { fullName: { startsWith: TAG } } });
    expect(all).toBe(2);
  });

  it('leaves it unscoped after the transaction rolls back', async () => {
    await expect(
      withTenantRls(a.trainerId, async (tx) => {
        await tx.trainee.count();
        throw new Error('deliberate rollback');
      }),
    ).rejects.toThrow('deliberate rollback');

    const all = await prisma.trainee.count({ where: { fullName: { startsWith: TAG } } });
    expect(all).toBe(2);
  });
});

describe('input validation', () => {
  it('refuses an empty tenant id rather than running unscoped', async () => {
    await expect(withTenantRls('', async () => 1)).rejects.toThrow(/requires a trainerId/);
  });

  it('refuses a tenant id that is not a plain identifier', async () => {
    // The id reaches a SET statement, so the shape is checked even though it
    // comes from the session rather than from request input.
    await expect(withTenantRls("x'; DROP TABLE \"Trainee\"; --", async () => 1)).rejects.toThrow(
      /malformed/,
    );
  });
});
