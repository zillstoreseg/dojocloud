# CoachMate

An Arabic-first SaaS platform for personal trainers. A coach manages their trainees, writes their programs and nutrition, publishes a landing page that brings them clients, and collects their money — and their trainees follow all of it from a phone, including photographing a meal to find out whether it fits their goal.

Three roles, three surfaces, one codebase:

| Surface | Route | Who |
|---|---|---|
| Admin panel | `/{locale}/admin` | The platform owner |
| Coach dashboard | `/{locale}/dash` | An approved, subscribed trainer |
| Trainee portal | `/{locale}/my` | A trainee with a login |
| Public | `/{locale}`, `/{locale}/coaches`, `/{locale}/c/{username}`, `/{locale}/join/{username}`, `/{locale}/p/{slug}` | Anyone |

---

## Running it

Requires Node 22+, pnpm, and PostgreSQL 16.

```bash
pnpm install
cp .env.example .env          # then fill in the values below
service postgresql start      # or however your machine starts it
pnpm prisma migrate deploy
pnpm db:seed                  # flags, plans, exercise + food libraries, admin
pnpm tsx prisma/demo.ts       # optional: coaches, trainees, payments to click through
pnpm dev
```

Seeded admin: `admin@coachmate.app` / `Admin@12345`.
Demo coach: `ahmed.fitness@demo.coachmate.app` / `Demo@12345`.

### Environment

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | **Must not be a superuser or `BYPASSRLS` role** — see [Data isolation](#data-isolation) |
| `AUTH_SECRET` | yes | 16+ chars; signs the session JWT |
| `SETTINGS_ENCRYPTION_KEY` | yes | 64 hex chars (32 bytes); encrypts secrets in `AppSetting` |
| `CRON_SECRET` | production | Without it nothing expires and no wallet hold matures |
| `STORAGE_DRIVER` | no | `local` (default) or `s3` |
| `S3_*` | if s3 | Endpoint, region, bucket, keys, public URL |
| `NEXT_PUBLIC_APP_URL` | production | Absolute URLs in emails, OG images and invite links |

Everything else — brand colours, payment instructions, the Claude API key, email provider, payout limits, referral rewards — is an `AppSetting` edited from `/admin/settings`, not an environment variable. Changing the platform's name or identity never requires a deploy.

---

## Architecture

Next.js 15 App Router with React Server Components and Server Actions; Prisma 6 on PostgreSQL; Auth.js v5 with credentials and a JWT session; `next-intl` for Arabic (default, RTL) and English.

```
src/app/[locale]/
  (public)        home, pricing, login, register
  c/[username]    a coach's published landing page
  coaches         the public directory, with visitor filters
  join/[username] package → intake questionnaire → receipt
  admin           the platform owner's panel
  dash            the coach's dashboard
  my              the trainee's portal
src/lib/
  authz, ownership       who may touch what
  password, password-reset  hashing, and the recovery flow
  rate-limit             throttling that survives a deploy
  messaging              coach ↔ trainee threads
  prisma                 client + the tenant-scoped extension
  rls                    PostgreSQL row-level security
  flags, quota           feature gating and plan limits
  nutrition, verdict     energy targets and the meal verdict — pure, tested
  wallet                 the append-only coach ledger
  ai/                    Claude: client, food scan, program & plan drafting
  email/                 provider abstraction, templates, logging
  referrals              coach-invites-coach
  payments/              provider abstraction (manual today, gateways later)
```

### A few decisions worth knowing

**The session is a snapshot.** The JWT carries `role`, `approvalStatus` and ids, and they are all frozen at sign-in. Nothing that can change while a user is signed in is ever gated on a claim — an admin approving a coach who is already logged in must not leave them locked out until they sign out and back in. Every such decision reads the row.

**The meal verdict is arithmetic, not an opinion.** Claude reads the photograph: what is on the plate, roughly how much, and the macros. Whether that meal fits is computed in `lib/nutrition.ts` from the trainee's own targets and phrased in `lib/verdict.ts`. Both are pure and tested at their boundaries, so the same plate and the same budget always produce the same verdict and the same sentence. A model asked "is this good for me?" would answer differently for identical meals, and would teach a trainee to re-photograph until it said something kind.

**AI drafts, humans decide.** Program and nutrition generation return a draft rendered in full for the coach to read. Nothing is written until they accept, and on acceptance every exercise and food id is re-verified against what that coach may actually use — the model picks from their library by id, so a hallucinated id is dropped rather than trusted.

**The wallet is an append-only ledger.** `WalletTransaction` rows are never updated or deleted; a correction is an opposing `ADJUSTMENT`. `post()` computes the balance snapshot itself so a caller cannot record a balance that never existed, and a tested invariant asserts `balance + pendingBalance == Σ(transactions)` after every operation.

**Credential forms post.** `method="post"` on the sign-in and reset forms even though the submit is handled in JavaScript: before React hydrates, a form with no method submits as a GET and appends every field to the URL — putting a password into browser history, the referrer header, and the server's access log.

**Rate limiting is rows, not a Map.** The obvious in-memory limiter is per-process: it resets on every deploy and behind two instances a limit of five becomes ten. For a contact form that is sloppy; on a login endpoint the throttle simply does not exist. Hits are rows and the limit is a count over a window, which also removes the read-modify-write that would let two simultaneous requests both read "4".

**Money is `Decimal`, dates are formatted explicitly.** `toLocaleDateString('ar-EG-u-nu-latn')` embeds U+200F marks that the bidi algorithm reorders against neighbouring text — the same date rendered "12/08/2026" in one column and "122026/8/" in another. `formatDate` in `lib/money.ts` builds the string by hand.

---

## Data isolation

Three independent layers. Each assumes the one above it may have been forgotten.

1. **Guards** — `lib/authz.ts` and `lib/ownership.ts`. Every server action derives `trainerId` from the session; no endpoint accepts it from request input. A cross-tenant id is reported as `NOT_FOUND` rather than `FORBIDDEN`, so the error is not an oracle for which ids exist.
2. **The tenant client** — `tenantDb(trainerId)` in `lib/prisma.ts` rewrites every query on a tenant-owned model to carry the filter, and stamps the owner on create. A missing `where` clause cannot leak.
3. **Row-level security** — policies on fifteen tables, enforced for any query wrapped in `withTenantRls()`.

### The RLS caveat, in plain terms

PostgreSQL exempts superusers and `BYPASSRLS` roles from every policy **unconditionally and silently**. A deployment that connects as `postgres` has all the policies installed, all the tests passing on someone else's machine, and no database-level isolation whatsoever.

So: `DATABASE_URL` must point at a role with neither attribute.

```sql
CREATE ROLE coachmate LOGIN PASSWORD '…';   -- not SUPERUSER, not BYPASSRLS
```

`/admin/system` shows the connecting role and whether it is exempt, and `tests/rls.test.ts` fails loudly if it is — the first assertion in that file checks the role, because if it is exempt nothing else in the file proves anything.

The policy predicate is `current_setting('app.trainer_id') IS NULL OR "trainerId" = current_setting('app.trainer_id')`. That asymmetry is deliberate: the admin panel legitimately reads across every coach and cron jobs touch rows belonging to nobody, so a policy that denied them would end up disabled. What it buys instead is a hard guarantee on the paths wrapped in `withTenantRls()` — Postgres will not hand over another coach's row even if the application forgets its own filter.

---

## Testing

```bash
pnpm test          # Vitest — 223 tests, several against a real database
pnpm test:e2e      # Playwright — route sweep + the full journey
pnpm typecheck
pnpm lint
```

The unit suite covers what is worth proving in isolation: password recovery (a link that works twice, a link that outlives its replacement, a token readable from a dump, a throttle that can be walked past); the flag resolver's three layers, quota arithmetic, `endsAt` for every billing interval, BMR/TDEE/macro splits against known reference cases, the meal verdict at each of its boundaries, the wallet invariant under double-credit and double-spend, referral rewards under concurrent approval, and data isolation — coach A cannot read, update or delete anything of coach B's through any path.

The E2E suite covers what only a browser can. `routes.spec.ts` opens every surface in both locales and fails on a console error; `journey.spec.ts` walks the whole arc — directory → landing page → intake → receipt → admin approval → coach's wallet credited → trainee signs in and sees targets computed from their own answers.

Some tests write real rows and clean up after themselves. They share a database, which is why Playwright runs with a single worker.

### What is not covered

A successful AI generation or meal reading needs a real Anthropic key. The plumbing around it is verified — flag, quota, image resize and EXIF strip, request shape, usage row, cost attribution, and the failure path — but the model's response itself has never been exercised in CI.

---

## Operations

A daily `POST /api/cron/subscriptions` with `Authorization: Bearer $CRON_SECRET` does four things: expires subscriptions past their end date, sends 7/3/1-day reminders to coaches, sends the same to trainees and their coach for trainee renewals, and releases matured wallet holds. It is safe to run more than once a day — every reminder is idempotent on a payload key, and the hold release re-checks inside its transaction. Coaches also get a lazy release when they open their wallet, so a missed run delays a ledger entry rather than someone's money.

`/admin/system` is the screen for everything that fails quietly: the database role's RLS exemption, which tables carry policies, whether an AI key is set and at what price, the email provider and its failure count, whether `CRON_SECRET` exists, and whether storage is local (lost on every deploy) or S3.

---

## Business model

Five revenue lines: SaaS subscriptions; a commission on trainee payments that falls from 5% to 3% to 0% as the plan rises, which is what makes upgrading pay for itself; add-ons; paid placement in the public directory; and a white-label gym plan.

Four growth loops are built into the product rather than bolted on: every landing page on a lower plan carries a "powered by" badge, so each visitor is an advertisement and removing it is a reason to upgrade; the public directory earns SEO traffic and routes leads to coaches, so a coach who is earning does not churn; trainees use the app daily and some of them are coaches in waiting; and a coach who invites a coach earns both of them a free month once the invited one pays.

---

## Licence

Private.
