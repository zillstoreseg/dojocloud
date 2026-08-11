import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Models that are owned by a single trainer. Any query issued through
 * `tenantDb()` is force-scoped to that trainer, so a missing `where` clause in
 * a server action cannot leak another trainer's data.
 */
const TENANT_MODELS = [
  'certificate',
  'trainee',
  'trainerPackage',
  'exercise',
  'workoutProgram',
  'nutritionPlan',
  'landingPage',
  'lead',
  'testimonial',
  'transformation',
  'subscription',
] as const;

const TENANT_MODEL_SET: ReadonlySet<string> = new Set(TENANT_MODELS);

/**
 * Second line of defence behind the explicit guards in `authz.ts`.
 *
 * Returns a Prisma client whose reads and writes on tenant-owned models always
 * carry `trainerId`. Prefer this over the bare `prisma` client in every
 * trainer-facing server action; use the bare client only for admin-scope work
 * and for models that are not tenant-owned.
 */
export function tenantDb(trainerId: string) {
  if (!trainerId) throw new Error('tenantDb() requires a trainerId');

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelKey = model ? model.charAt(0).toLowerCase() + model.slice(1) : '';
          if (!TENANT_MODEL_SET.has(modelKey)) return query(args);

          const a = args as Record<string, unknown>;

          // Reads and bulk writes: narrow the filter.
          if (
            operation === 'findFirst' ||
            operation === 'findFirstOrThrow' ||
            operation === 'findMany' ||
            operation === 'findUnique' ||
            operation === 'findUniqueOrThrow' ||
            operation === 'updateMany' ||
            operation === 'deleteMany' ||
            operation === 'count' ||
            operation === 'aggregate' ||
            operation === 'groupBy'
          ) {
            a.where = { ...((a.where as object) ?? {}), trainerId };
          }

          // Single-row writes: narrow the target and stamp the owner.
          if (operation === 'update' || operation === 'delete') {
            a.where = { ...((a.where as object) ?? {}), trainerId };
          }
          if (operation === 'create') {
            a.data = { ...((a.data as object) ?? {}), trainerId };
          }
          if (operation === 'createMany') {
            const data = a.data;
            a.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as object), trainerId }))
              : { ...((data as object) ?? {}), trainerId };
          }
          if (operation === 'upsert') {
            a.where = { ...((a.where as object) ?? {}), trainerId };
            a.create = { ...((a.create as object) ?? {}), trainerId };
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
