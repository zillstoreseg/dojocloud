/**
 * Demo dataset for local development and screenshots.
 *
 * Creates a realistic slice of the platform — approved and pending trainers,
 * trainees, payments in several states, landing-page traffic, leads and AI
 * usage — so every dashboard and report has something to show.
 *
 * Run with: pnpm tsx prisma/demo.ts
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Demo@12345';

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 864e5);
}

function pick<T>(items: readonly T[], index: number): T {
  return items[index % items.length];
}

/** Deterministic pseudo-random so repeated runs produce comparable charts. */
function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

const TRAINERS = [
  { name: 'أحمد سيد', username: 'ahmed-fitness', country: 'مصر', city: 'القاهرة', gender: 'MALE', trains: 'BOTH', years: 8, specialties: ['MUSCLE_GAIN', 'BODYBUILDING', 'NUTRITION'], plan: 'pro', approved: true },
  { name: 'منة الله حسن', username: 'mennah-coach', country: 'مصر', city: 'الإسكندرية', gender: 'FEMALE', trains: 'FEMALE', years: 5, specialties: ['WEIGHT_LOSS', 'PRE_POSTNATAL'], plan: 'starter', approved: true },
  { name: 'خالد العتيبي', username: 'khaled-pt', country: 'السعودية', city: 'الرياض', gender: 'MALE', trains: 'MALE', years: 12, specialties: ['POWERLIFTING', 'BODYBUILDING', 'SPORTS_PERFORMANCE'], plan: 'elite', approved: true },
  { name: 'سارة المنصوري', username: 'sara-wellness', country: 'الإمارات', city: 'دبي', gender: 'FEMALE', trains: 'BOTH', years: 6, specialties: ['YOGA', 'PILATES', 'POSTURE'], plan: 'pro', approved: true },
  { name: 'محمود رفعت', username: 'mahmoud-coach', country: 'مصر', city: 'الجيزة', gender: 'MALE', trains: 'BOTH', years: 3, specialties: ['GENERAL_FITNESS', 'WEIGHT_LOSS'], plan: 'trial', approved: true },
  { name: 'ياسمين عبد الله', username: 'yasmin-fit', country: 'مصر', city: 'المنصورة', gender: 'FEMALE', trains: 'FEMALE', years: 4, specialties: ['WEIGHT_LOSS', 'CALISTHENICS'], plan: null, approved: false },
  { name: 'عبد الرحمن الشامي', username: 'abdelrahman-strength', country: 'السعودية', city: 'جدة', gender: 'MALE', trains: 'MALE', years: 7, specialties: ['CROSSFIT', 'ENDURANCE'], plan: null, approved: false },
] as const;

const TRAINEE_NAMES = [
  'محمد علي', 'فاطمة الزهراء', 'عمر حسن', 'نورهان سمير', 'كريم مصطفى',
  'هدى إبراهيم', 'يوسف طارق', 'مريم أحمد', 'زياد فتحي', 'ليلى ناصر',
  'حسام الدين', 'رنا وليد', 'أنس عادل', 'دينا فاروق', 'باسل نبيل',
  'شيماء رمضان', 'طارق عصام', 'أميرة سليم', 'مازن حاتم', 'سلمى جمال',
];

const GOALS = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'RECOMPOSITION', 'GENERAL_HEALTH', 'STRENGTH'] as const;
const SOURCES = ['instagram', 'tiktok', 'facebook', 'direct', 'google', 'whatsapp'];
const DEVICES = ['mobile', 'desktop', 'tablet'];
const COUNTRIES = ['EG', 'SA', 'AE', 'KW', 'QA'];

async function main() {
  console.log('▸ Seeding demo data…');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const rand = seededRandom(42);

  const plans = await prisma.plan.findMany();
  const planByKey = new Map(plans.map((p) => [p.key, p]));
  if (plans.length === 0) {
    console.error('  ✗ No plans found — run `pnpm db:seed` first.');
    process.exit(1);
  }

  let trainerIndex = 0;
  for (const t of TRAINERS) {
    trainerIndex += 1;
    const email = `${t.username.replace(/-/g, '.')}@demo.coachmate.app`;

    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, role: 'TRAINER', status: 'ACTIVE', locale: 'ar', phone: `+2010000000${trainerIndex}` },
      update: {},
    });

    const trainer = await prisma.trainerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        username: t.username,
        fullName: t.name,
        specialties: t.specialties as never,
        phone: `+2010000000${trainerIndex}`,
        country: t.country,
        city: t.city,
        gender: t.gender as never,
        trainsGenders: t.trains as never,
        yearsExperience: t.years,
        bio: `مدرب معتمد بخبرة ${t.years} سنوات. أساعدك توصل لهدفك بخطة مبنية على وضعك ووقتك، مش على برنامج جاهز.`,
        approvalStatus: t.approved ? 'APPROVED' : 'PENDING',
        approvedAt: t.approved ? daysAgo(60 - trainerIndex * 5) : null,
        createdAt: daysAgo(70 - trainerIndex * 5),
      },
      update: {},
    });

    // Certificates — approved trainers have reviewed ones, pending trainers don't.
    const certCount = 1 + (trainerIndex % 3);
    for (let c = 0; c < certCount; c++) {
      const title = pick(
        ['شهادة مدرب شخصي معتمد (ISSA)', 'دبلومة التغذية الرياضية', 'شهادة NASM CPT', 'تدريب تأهيلي متقدم'],
        trainerIndex + c,
      );
      const exists = await prisma.certificate.findFirst({ where: { trainerId: trainer.id, title } });
      if (exists) continue;
      await prisma.certificate.create({
        data: {
          trainerId: trainer.id,
          title,
          issuer: pick(['ISSA', 'NASM', 'ACE', 'الاتحاد المصري لكمال الأجسام'], trainerIndex + c),
          year: 2018 + ((trainerIndex + c) % 7),
          fileUrl: '/uploads/demo/certificate-sample.png',
          status: t.approved ? 'APPROVED' : 'PENDING',
        },
      });
    }

    if (!t.plan) continue;

    // Subscription + payment history.
    const plan = planByKey.get(t.plan);
    if (!plan) continue;
    const prices = plan.prices as Record<string, number>;
    const amount = prices.EGP ?? 0;

    const existingSub = await prisma.subscription.findFirst({ where: { trainerId: trainer.id } });
    const startsAt = daysAgo(55 - trainerIndex * 4);
    const subscription =
      existingSub ??
      (await prisma.subscription.create({
        data: {
          trainerId: trainer.id,
          planId: plan.id,
          status: t.plan === 'trial' ? 'TRIALING' : 'ACTIVE',
          currency: 'EGP',
          amount,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 864e5 * (trainerIndex % 3 === 0 ? 2 : 1)),
          trialEndsAt: t.plan === 'trial' ? new Date(startsAt.getTime() + 14 * 864e5) : null,
          createdAt: startsAt,
        },
      }));

    if (amount > 0) {
      const paymentCount = 1 + (trainerIndex % 3);
      const existingPayments = await prisma.payment.count({ where: { subscriptionId: subscription.id } });
      for (let p = existingPayments; p < paymentCount; p++) {
        const reviewedAt = daysAgo(50 - p * 15 - trainerIndex);
        await prisma.payment.create({
          data: {
            subscriptionId: subscription.id,
            amount,
            currency: 'EGP',
            method: pick(['INSTAPAY', 'VODAFONE_CASH', 'MANUAL_TRANSFER', 'BANK_TRANSFER'] as const, trainerIndex + p),
            status: 'APPROVED',
            receiptUrl: '/uploads/demo/receipt-sample.png',
            reference: `TRX${100000 + trainerIndex * 100 + p}`,
            reviewedAt,
            createdAt: new Date(reviewedAt.getTime() - 864e5),
          },
        });
      }
    }

    // Trainees, with a spread of renewal dates so the renewals widget has content.
    const traineeCount = t.plan === 'elite' ? 9 : t.plan === 'pro' ? 6 : t.plan === 'starter' ? 4 : 2;
    const existingTrainees = await prisma.trainee.count({ where: { trainerId: trainer.id } });
    for (let i = existingTrainees; i < traineeCount; i++) {
      const nameIndex = (trainerIndex * 7 + i) % TRAINEE_NAMES.length;
      const startDate = daysAgo(40 - i * 3);
      const trainee = await prisma.trainee.create({
        data: {
          trainerId: trainer.id,
          fullName: TRAINEE_NAMES[nameIndex],
          phone: `+2011${String(1000000 + trainerIndex * 100 + i).slice(0, 7)}`,
          gender: i % 3 === 0 ? 'FEMALE' : 'MALE',
          birthDate: new Date(1990 + (i % 15), i % 12, 1 + (i % 27)),
          heightCm: 160 + (i % 25),
          startWeightKg: 65 + (i % 35),
          goal: pick(GOALS, trainerIndex + i),
          activityLevel: pick(['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE'] as const, i),
          status: i === traineeCount - 1 && trainerIndex % 3 === 0 ? 'EXPIRED' : 'ACTIVE',
          startDate,
          // Some renew within the week so the "expiring soon" list is populated.
          renewalDate: new Date(Date.now() + ((i % 5) * 6 - 3) * 864e5),
          createdAt: startDate,
        },
      });

      // Measurements trace a plausible downward or upward trend.
      for (let m = 0; m < 4; m++) {
        await prisma.measurement.create({
          data: {
            traineeId: trainee.id,
            takenAt: daysAgo(35 - m * 9),
            weightKg: Number((65 + (i % 35) - m * 1.4).toFixed(1)),
            bodyFatPct: Number((28 - m * 0.9).toFixed(1)),
            waistCm: Number((90 - m * 1.6).toFixed(1)),
          },
        });
      }
    }

    // A landing page with a few blocks, published for approved trainers.
    const existingPage = await prisma.landingPage.findFirst({ where: { trainerId: trainer.id } });
    if (!existingPage) {
      const page = await prisma.landingPage.create({
        data: {
          trainerId: trainer.id,
          title: `${t.name} — تدريب شخصي`,
          seoDescription: `تدريب شخصي أونلاين مع ${t.name}. خطط تدريب وتغذية مصممة لهدفك.`,
          status: t.approved ? 'PUBLISHED' : 'DRAFT',
          publishedAt: t.approved ? daysAgo(45) : null,
          theme: { primary: '158 64% 40%', font: 'cairo', radius: 'lg', mode: 'light' } as Prisma.InputJsonValue,
          createdAt: daysAgo(50),
        },
      });

      const blocks: Array<{ type: string; props: Record<string, unknown> }> = [
        { type: 'HERO', props: { headline: `ابدأ رحلتك مع ${t.name}`, sub: `خبرة ${t.years} سنوات في ${t.specialties.length} تخصصات`, ctaLabel: 'اشترك الآن' } },
        { type: 'ABOUT', props: { title: 'نبذة عني', body: `مدرب معتمد بخبرة ${t.years} سنوات.` } },
        { type: 'STATS', props: { items: [{ label: 'متدرب', value: traineeCount * 12 }, { label: 'سنوات خبرة', value: t.years }, { label: 'شهادة', value: certCount }] } },
        { type: 'PACKAGES', props: {} },
        { type: 'TRANSFORMATIONS', props: {} },
        { type: 'TESTIMONIALS', props: {} },
        { type: 'CONTACT_FORM', props: { title: 'ابدأ معايا' } },
        { type: 'CTA_WHATSAPP', props: { phone: `+2010000000${trainerIndex}` } },
      ];
      await prisma.pageBlock.createMany({
        data: blocks.map((b, order) => ({
          pageId: page.id,
          type: b.type as never,
          order,
          props: b.props as Prisma.InputJsonValue,
        })),
      });

      // Traffic against the page, weighted toward recent days.
      const viewRows: Prisma.PageViewCreateManyInput[] = [];
      for (let d = 44; d >= 0; d--) {
        const base = t.approved ? 3 + Math.floor(rand() * 10) : 0;
        const count = Math.max(0, base + (d < 14 ? Math.floor(rand() * 8) : 0));
        for (let v = 0; v < count; v++) {
          viewRows.push({
            path: `/ar/c/${t.username}`,
            trainerId: trainer.id,
            pageId: page.id,
            sessionId: `demo-${trainer.id}-${d}-${Math.floor(v / 2)}`,
            referrer: null,
            utmSource: pick(SOURCES, d + v),
            country: pick(COUNTRIES, d + v),
            device: pick(DEVICES, v),
            browser: 'Chrome',
            createdAt: daysAgo(d),
          });
        }
      }
      if (viewRows.length) await prisma.pageView.createMany({ data: viewRows });

      // Leads, a slice of which converted.
      const leadCount = t.approved ? 4 + (trainerIndex % 5) : 0;
      for (let l = 0; l < leadCount; l++) {
        await prisma.lead.create({
          data: {
            trainerId: trainer.id,
            pageId: page.id,
            name: pick(TRAINEE_NAMES, trainerIndex * 3 + l),
            phone: `+2012${String(2000000 + l * 37 + trainerIndex).slice(0, 7)}`,
            goal: pick(['خسارة وزن', 'زيادة عضلية', 'لياقة عامة', 'تأهيل إصابة'], l),
            message: 'حابب أعرف تفاصيل الاشتراك والباقات المتاحة.',
            source: 'landing',
            utmSource: pick(SOURCES, l),
            status: l % 3 === 0 ? 'CONVERTED' : l % 3 === 1 ? 'CONTACTED' : 'NEW',
            createdAt: daysAgo(30 - l * 4),
          },
        });
      }
    }

    // Trainer packages for trainees to subscribe to.
    const existingPackages = await prisma.trainerPackage.count({ where: { trainerId: trainer.id } });
    if (existingPackages === 0) {
      await prisma.trainerPackage.createMany({
        data: [
          { trainerId: trainer.id, name: 'باقة شهر', price: 800, currency: 'EGP', durationDays: 30, sortOrder: 0 },
          { trainerId: trainer.id, name: 'باقة 3 شهور', price: 2100, currency: 'EGP', durationDays: 90, sortOrder: 1 },
          { trainerId: trainer.id, name: 'باقة 6 شهور', price: 3900, currency: 'EGP', durationDays: 180, sortOrder: 2 },
        ],
      });
    }

    // AI usage, priced the same way the runtime prices it.
    const aiCalls = t.plan === 'elite' ? 40 : t.plan === 'pro' ? 22 : t.plan === 'starter' ? 8 : 3;
    const existingAi = await prisma.aiUsage.count({ where: { trainerId: trainer.id } });
    for (let a = existingAi; a < aiCalls; a++) {
      const inputTokens = 1800 + Math.floor(rand() * 2500);
      const outputTokens = 900 + Math.floor(rand() * 2200);
      const costUsd = (inputTokens / 1e6) * 5 + (outputTokens / 1e6) * 25;
      await prisma.aiUsage.create({
        data: {
          userId: user.id,
          trainerId: trainer.id,
          feature: pick(['workout_generation', 'nutrition_generation', 'progress_summary'], a),
          model: 'claude-opus-5',
          inputTokens,
          outputTokens,
          costUsd,
          success: a % 17 !== 0,
          durationMs: 3000 + Math.floor(rand() * 9000),
          createdAt: daysAgo(Math.floor(rand() * 30)),
        },
      });
    }

    console.log(`  ✓ ${t.name} (/c/${t.username}) — ${t.plan ?? 'no plan'}`);
  }

  // A couple of payments left pending so the activations centre has work to do.
  const activeSubs = await prisma.subscription.findMany({ where: { status: 'ACTIVE' }, take: 2 });
  for (const sub of activeSubs) {
    const pending = await prisma.payment.count({ where: { subscriptionId: sub.id, status: 'PENDING' } });
    if (pending > 0) continue;
    await prisma.payment.create({
      data: {
        subscriptionId: sub.id,
        amount: sub.amount,
        currency: sub.currency,
        method: 'INSTAPAY',
        status: 'PENDING',
        receiptUrl: '/uploads/demo/receipt-sample.png',
        reference: `TRX${Math.floor(Math.random() * 900000 + 100000)}`,
        payerNote: 'حوّلت المبلغ النهارده الصبح، الإيصال مرفق.',
        createdAt: daysAgo(1),
      },
    });
  }

  // Pending trainee subscriptions for the fourth activations tab.
  const trainees = await prisma.trainee.findMany({ take: 3, include: { trainer: true } });
  for (const trainee of trainees) {
    const pkg = await prisma.trainerPackage.findFirst({ where: { trainerId: trainee.trainerId } });
    if (!pkg) continue;
    const exists = await prisma.traineeSubscription.count({ where: { traineeId: trainee.id, status: 'PENDING' } });
    if (exists > 0) continue;
    await prisma.traineeSubscription.create({
      data: {
        traineeId: trainee.id,
        packageId: pkg.id,
        amount: pkg.price,
        currency: pkg.currency,
        method: 'VODAFONE_CASH',
        receiptUrl: '/uploads/demo/receipt-sample.png',
        status: 'PENDING',
        createdAt: daysAgo(2),
      },
    });
  }

  // Storage cost records, so the profit report has a non-AI cost line.
  const costExists = await prisma.costRecord.count({ where: { kind: 'STORAGE' } });
  if (costExists === 0) {
    const allPlans = await prisma.plan.findMany({ select: { id: true } });
    await prisma.costRecord.createMany({
      data: allPlans.map((plan, i) => ({
        kind: 'STORAGE' as const,
        amountUsd: 0.4 + i * 0.35,
        planId: plan.id,
        note: 'Object storage, monthly',
        occurredAt: daysAgo(10),
      })),
    });
  }

  const counts = {
    trainers: await prisma.trainerProfile.count(),
    trainees: await prisma.trainee.count(),
    payments: await prisma.payment.count(),
    views: await prisma.pageView.count(),
    leads: await prisma.lead.count(),
    ai: await prisma.aiUsage.count(),
  };
  console.log('▸ Demo data ready:', counts);
  console.log(`▸ Trainer login: ahmed.fitness@demo.coachmate.app / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
