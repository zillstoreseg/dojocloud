import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Running work under PostgreSQL row-level security.
 *
 * The third and last layer of tenant isolation, behind the explicit guards in
 * `authz.ts` and the query-rewriting client in `prisma.ts`. Those two are
 * application code and can be forgotten; this one cannot be, because the
 * database refuses to return the row.
 *
 * It is opt-in by transaction rather than global, and the reason is worth
 * being clear about. The setting has to be `SET LOCAL` inside a transaction so
 * it cannot leak to the next request that borrows the same pooled connection —
 * which means the guarantee only exists inside a transaction, and a global
 * policy that denied everything outside one would break the admin panel and
 * every cron job. So: wrap the code paths where a leak would be worst, and get
 * a guarantee the application cannot undermine.
 *
 * @example
 * const trainees = await withTenantRls(user.trainerId, (tx) =>
 *   tx.trainee.findMany(),   // no `where` — the database supplies the boundary
 * );
 */
export async function withTenantRls<T>(
  trainerId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> {
  if (!trainerId) throw new Error('withTenantRls() requires a trainerId');

  // The id comes from the session, never from request input, but it is
  // interpolated into a SET statement — so it is validated rather than trusted.
  // cuid()s are alphanumeric; anything else is a bug or an attack.
  if (!/^[a-z0-9_-]{1,64}$/i.test(trainerId)) {
    throw new Error('withTenantRls() received a malformed trainerId');
  }

  return prisma.$transaction(
    async (tx) => {
      // SET LOCAL is scoped to this transaction and is discarded on commit or
      // rollback, so a pooled connection never carries one request's tenant
      // into the next.
      await tx.$executeRaw`SELECT set_config('app.trainer_id', ${trainerId}, true)`;
      return work(tx);
    },
    { timeout: options?.timeout ?? 15_000 },
  );
}

/**
 * Whether the connecting role is exempt from row-level security.
 *
 * This is the check that matters most, and the one that is easiest to lose.
 * PostgreSQL exempts superusers and `BYPASSRLS` roles from every policy
 * unconditionally — no error, no warning, the policies simply do not apply. A
 * deployment that connects as `postgres` has all the policies installed, all
 * the tests passing on someone else's machine, and no isolation whatsoever.
 *
 * So the application asks the database directly, and the admin panel shows the
 * answer. `DATABASE_URL` must point at a role with neither attribute.
 */
export async function rlsRoleIsExempt(): Promise<{
  role: string;
  superuser: boolean;
  bypassRls: boolean;
  exempt: boolean;
}> {
  const [row] = await prisma.$queryRaw<
    { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
  >`
    SELECT rolname, rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `;

  const superuser = Boolean(row?.rolsuper);
  const bypassRls = Boolean(row?.rolbypassrls);

  return {
    role: row?.rolname ?? 'unknown',
    superuser,
    bypassRls,
    exempt: superuser || bypassRls,
  };
}

/**
 * Whether RLS policies are actually installed on this database.
 *
 * Surfaced in the admin panel: a deployment restored from a dump taken before
 * the policies existed would silently lose the third layer, and "silently" is
 * the part worth fixing.
 */
export async function rlsStatus(): Promise<{ table: string; enabled: boolean; forced: boolean }[]> {
  const rows = await prisma.$queryRaw<
    { tablename: string; rowsecurity: boolean; forcerowsecurity: boolean }[]
  >`
    SELECT c.relname AS tablename,
           c.relrowsecurity AS rowsecurity,
           c.relforcerowsecurity AS forcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ORDER BY c.relname
  `;

  return rows.map((row) => ({
    table: row.tablename,
    enabled: row.rowsecurity,
    forced: row.forcerowsecurity,
  }));
}
