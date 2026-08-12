-- Row-level security: the third layer behind the guards in lib/authz.ts and the
-- tenant-scoped Prisma client.
--
-- The design point is the policy predicate. It reads:
--
--     current_setting('app.trainer_id', true) IS NULL      -- no tenant declared
--     OR "trainerId" = current_setting('app.trainer_id', true)
--
-- which means the database enforces the tenant boundary *whenever a tenant
-- context has been declared*, and stays out of the way otherwise. That
-- asymmetry is deliberate. The admin panel legitimately reads across every
-- coach, and cron jobs legitimately touch rows belonging to nobody in
-- particular; a policy that denied those would have to be bypassed so often
-- that it would end up disabled. What this buys instead is a hard guarantee on
-- the paths that matter most: any query wrapped in `withTenantRls()` cannot
-- return another coach's row even if the application forgets its own filter,
-- because Postgres will not hand it over.
--
-- FORCE is required: the application connects as the table owner, and owners
-- are exempt from their own policies without it.

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Certificate', 'Trainee', 'TrainerPackage', 'Exercise', 'WorkoutProgram',
    'NutritionPlan', 'LandingPage', 'Lead', 'Testimonial', 'Transformation',
    'Subscription', 'FoodScan', 'Wallet', 'PageView', 'Conversation'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING (
        current_setting('app.trainer_id', true) IS NULL
        OR current_setting('app.trainer_id', true) = ''
        OR "trainerId" = current_setting('app.trainer_id', true)
      )
      WITH CHECK (
        current_setting('app.trainer_id', true) IS NULL
        OR current_setting('app.trainer_id', true) = ''
        OR "trainerId" = current_setting('app.trainer_id', true)
      )
    $f$, t);
  END LOOP;
END $$;
