import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/** Feature flags, with the default (free-tier) behaviour. */
const FLAGS: Array<{
  key: string;
  name: string;
  description: string;
  type: 'BOOLEAN' | 'LIMIT';
  defaultEnabled: boolean;
  defaultLimit?: number;
  category: string;
  isKillSwitch?: boolean;
}> = [
  { key: 'ai.enabled', name: 'الذكاء الاصطناعي', description: 'المفتاح الرئيسي لكل ميزات الـ AI — إطفاؤه يعطّلها للجميع', type: 'BOOLEAN', defaultEnabled: true, category: 'ai', isKillSwitch: true },
  { key: 'ai.workout_generation', name: 'توليد برامج تدريبية', description: 'توليد برنامج تدريبي كامل للمتدرب', type: 'BOOLEAN', defaultEnabled: false, category: 'ai' },
  { key: 'ai.nutrition_generation', name: 'توليد أنظمة تغذية', description: 'توليد نظام غذائي بالسعرات والماكروز', type: 'BOOLEAN', defaultEnabled: false, category: 'ai' },
  { key: 'ai.progress_summary', name: 'تلخيص تقدم المتدرب', description: 'ملخص ذكي لتقدم المتدرب من قياساته وسجلاته', type: 'BOOLEAN', defaultEnabled: false, category: 'ai' },
  { key: 'builder.enabled', name: 'باني الصفحات', description: 'إنشاء وتحرير صفحة الهبوط', type: 'BOOLEAN', defaultEnabled: true, category: 'builder' },
  { key: 'builder.custom_html', name: 'بلوك HTML مخصص', description: 'إضافة كود HTML مخصص داخل الصفحة', type: 'BOOLEAN', defaultEnabled: false, category: 'builder' },
  { key: 'builder.remove_branding', name: 'إخفاء علامة المنصة', description: 'إخفاء «مدعوم من» أسفل صفحة المدرب', type: 'BOOLEAN', defaultEnabled: false, category: 'builder' },
  { key: 'builder.custom_domain', name: 'نطاق مخصص', description: 'ربط نطاق المدرب الخاص بصفحته', type: 'BOOLEAN', defaultEnabled: false, category: 'builder' },
  { key: 'leads.crm', name: 'إدارة العملاء المحتملين', description: 'متابعة الـ Leads بحالات وملاحظات', type: 'BOOLEAN', defaultEnabled: false, category: 'growth' },
  { key: 'directory.listing', name: 'الظهور في دليل المدربين', description: 'إدراج المدرب في الدليل العام', type: 'BOOLEAN', defaultEnabled: true, category: 'growth' },
  { key: 'directory.featured', name: 'ظهور مميز في الدليل', description: 'إبراز المدرب في مقدمة نتائج الدليل', type: 'BOOLEAN', defaultEnabled: false, category: 'growth' },
  { key: 'messaging.enabled', name: 'المراسلة', description: 'محادثة بين المدرب والمتدرب', type: 'BOOLEAN', defaultEnabled: true, category: 'core' },
  { key: 'trainee.portal', name: 'بوابة المتدرب', description: 'حساب ودخول مستقل للمتدرب', type: 'BOOLEAN', defaultEnabled: true, category: 'core' },
  { key: 'data.export', name: 'تصدير البيانات', description: 'تصدير الجداول إلى CSV', type: 'BOOLEAN', defaultEnabled: false, category: 'core' },
  { key: 'team.seats', name: 'مقاعد الفريق', description: 'إضافة مدربين مساعدين تحت نفس الحساب', type: 'LIMIT', defaultEnabled: false, defaultLimit: 1, category: 'team' },
];

/**
 * The commercial model: a free trial that converts, three paid tiers where the
 * platform fee on trainee payments drops as the tier rises, and a team plan.
 */
const PLANS: Array<{
  key: string;
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  taglineEn: string;
  prices: Record<string, number>;
  interval: 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  trialDays: number;
  maxTrainees: number | null;
  maxLandingPages: number | null;
  maxExercises: number | null;
  maxNutritionPlans: number | null;
  maxTrainerSeats: number;
  aiCreditsPerCycle: number;
  storageMb: number;
  commissionPercent: number;
  isPopular: boolean;
  sortOrder: number;
  highlights: { ar: string[]; en: string[] };
  flags: Record<string, boolean | number>;
}> = [
  {
    key: 'trial',
    nameAr: 'تجربة مجانية',
    nameEn: 'Free trial',
    taglineAr: 'جرّب كل شيء 14 يوم',
    taglineEn: 'Try everything for 14 days',
    prices: { EGP: 0, AED: 0, SAR: 0, USD: 0 },
    interval: 'MONTHLY',
    trialDays: 14,
    maxTrainees: 3,
    maxLandingPages: 1,
    maxExercises: 30,
    maxNutritionPlans: 5,
    maxTrainerSeats: 1,
    aiCreditsPerCycle: 10,
    storageMb: 200,
    commissionPercent: 0,
    isPopular: false,
    sortOrder: 0,
    highlights: {
      ar: ['3 متدربين', 'صفحة هبوط واحدة', '10 توليدات AI', 'بدون بطاقة ائتمان'],
      en: ['3 trainees', '1 landing page', '10 AI generations', 'No credit card'],
    },
    flags: { 'ai.workout_generation': true, 'ai.nutrition_generation': true, 'leads.crm': true },
  },
  {
    key: 'starter',
    nameAr: 'المبتدئ',
    nameEn: 'Starter',
    taglineAr: 'لبداية احترافية',
    taglineEn: 'A professional start',
    prices: { EGP: 399, AED: 39, SAR: 39, USD: 10 },
    interval: 'MONTHLY',
    trialDays: 0,
    maxTrainees: 15,
    maxLandingPages: 1,
    maxExercises: 150,
    maxNutritionPlans: 25,
    maxTrainerSeats: 1,
    aiCreditsPerCycle: 40,
    storageMb: 1000,
    commissionPercent: 5,
    isPopular: false,
    sortOrder: 1,
    highlights: {
      ar: ['15 متدرب', 'صفحة هبوط بعلامة المنصة', '40 توليد AI شهريًا', 'نسبة 5% على مدفوعات المتدربين'],
      en: ['15 trainees', 'Landing page with our badge', '40 AI generations/mo', '5% fee on trainee payments'],
    },
    flags: { 'ai.workout_generation': true, 'ai.nutrition_generation': true, 'leads.crm': true },
  },
  {
    key: 'pro',
    nameAr: 'الاحترافي',
    nameEn: 'Pro',
    taglineAr: 'الأنسب للمدرب المتفرغ',
    taglineEn: 'Best for full-time coaches',
    prices: { EGP: 899, AED: 89, SAR: 89, USD: 24 },
    interval: 'MONTHLY',
    trialDays: 0,
    maxTrainees: 60,
    maxLandingPages: 3,
    maxExercises: null,
    maxNutritionPlans: null,
    maxTrainerSeats: 1,
    aiCreditsPerCycle: 300,
    storageMb: 5000,
    commissionPercent: 3,
    isPopular: true,
    sortOrder: 2,
    highlights: {
      ar: ['60 متدرب', '3 صفحات بدون علامة المنصة', '300 توليد AI شهريًا', 'CRM كامل للعملاء المحتملين', 'نسبة 3% فقط'],
      en: ['60 trainees', '3 pages, no badge', '300 AI generations/mo', 'Full leads CRM', 'Only 3% fee'],
    },
    flags: {
      'ai.workout_generation': true,
      'ai.nutrition_generation': true,
      'ai.progress_summary': true,
      'leads.crm': true,
      'builder.remove_branding': true,
      'data.export': true,
    },
  },
  {
    key: 'elite',
    nameAr: 'النخبة',
    nameEn: 'Elite',
    taglineAr: 'بدون نسبة على مدفوعاتك',
    taglineEn: 'Zero fee on your payments',
    prices: { EGP: 1899, AED: 189, SAR: 189, USD: 49 },
    interval: 'MONTHLY',
    trialDays: 0,
    maxTrainees: 200,
    maxLandingPages: null,
    maxExercises: null,
    maxNutritionPlans: null,
    maxTrainerSeats: 3,
    aiCreditsPerCycle: 1000,
    storageMb: 20000,
    commissionPercent: 0,
    isPopular: false,
    sortOrder: 3,
    highlights: {
      ar: ['200 متدرب', 'صفحات غير محدودة', 'نطاق مخصص', '1000 توليد AI', '0% نسبة على المدفوعات', '3 مقاعد مدربين'],
      en: ['200 trainees', 'Unlimited pages', 'Custom domain', '1000 AI generations', '0% payment fee', '3 coach seats'],
    },
    flags: {
      'ai.workout_generation': true,
      'ai.nutrition_generation': true,
      'ai.progress_summary': true,
      'leads.crm': true,
      'builder.remove_branding': true,
      'builder.custom_html': true,
      'builder.custom_domain': true,
      'directory.featured': true,
      'data.export': true,
      'team.seats': 3,
    },
  },
  {
    key: 'gym',
    nameAr: 'الجيم / الفريق',
    nameEn: 'Gym / Team',
    taglineAr: 'لعدة مدربين تحت إدارة واحدة',
    taglineEn: 'Several coaches, one account',
    prices: { EGP: 4900, AED: 490, SAR: 490, USD: 129 },
    interval: 'MONTHLY',
    trialDays: 0,
    maxTrainees: null,
    maxLandingPages: null,
    maxExercises: null,
    maxNutritionPlans: null,
    maxTrainerSeats: 10,
    aiCreditsPerCycle: 5000,
    storageMb: 100000,
    commissionPercent: 0,
    isPopular: false,
    sortOrder: 4,
    highlights: {
      ar: ['متدربون غير محدودين', '10 مقاعد مدربين', 'هوية الجيم الكاملة', 'مدير حساب مخصص'],
      en: ['Unlimited trainees', '10 coach seats', 'Full gym branding', 'Dedicated account manager'],
    },
    flags: {
      'ai.workout_generation': true,
      'ai.nutrition_generation': true,
      'ai.progress_summary': true,
      'leads.crm': true,
      'builder.remove_branding': true,
      'builder.custom_html': true,
      'builder.custom_domain': true,
      'directory.featured': true,
      'data.export': true,
      'team.seats': 10,
    },
  },
];

/** A starter exercise library so a new trainer is productive on day one. */
const EXERCISES: Array<[string, string, string, string, string]> = [
  ['بنش برس بالبار', 'Barbell Bench Press', 'CHEST', 'BARBELL', 'INTERMEDIATE'],
  ['بنش برس دمبل', 'Dumbbell Bench Press', 'CHEST', 'DUMBBELL', 'BEGINNER'],
  ['بنش مائل دمبل', 'Incline Dumbbell Press', 'CHEST', 'DUMBBELL', 'INTERMEDIATE'],
  ['تفتيح كابل', 'Cable Fly', 'CHEST', 'CABLE', 'BEGINNER'],
  ['ضغط', 'Push-up', 'CHEST', 'BODYWEIGHT', 'BEGINNER'],
  ['عقلة', 'Pull-up', 'BACK', 'BODYWEIGHT', 'ADVANCED'],
  ['سحب أرضي', 'Seated Cable Row', 'BACK', 'CABLE', 'BEGINNER'],
  ['سحب أمامي', 'Lat Pulldown', 'BACK', 'MACHINE', 'BEGINNER'],
  ['تجديف بالبار', 'Barbell Row', 'BACK', 'BARBELL', 'INTERMEDIATE'],
  ['رفعة ميتة', 'Deadlift', 'BACK', 'BARBELL', 'ADVANCED'],
  ['ضغط كتف بالبار', 'Overhead Press', 'SHOULDERS', 'BARBELL', 'INTERMEDIATE'],
  ['ضغط كتف دمبل', 'Dumbbell Shoulder Press', 'SHOULDERS', 'DUMBBELL', 'BEGINNER'],
  ['رفرفة جانبي', 'Lateral Raise', 'SHOULDERS', 'DUMBBELL', 'BEGINNER'],
  ['رفرفة خلفي', 'Rear Delt Fly', 'SHOULDERS', 'DUMBBELL', 'BEGINNER'],
  ['بايسبس بالبار', 'Barbell Curl', 'BICEPS', 'BARBELL', 'BEGINNER'],
  ['بايسبس دمبل', 'Dumbbell Curl', 'BICEPS', 'DUMBBELL', 'BEGINNER'],
  ['مطرقة', 'Hammer Curl', 'BICEPS', 'DUMBBELL', 'BEGINNER'],
  ['ترايسبس كابل', 'Triceps Pushdown', 'TRICEPS', 'CABLE', 'BEGINNER'],
  ['ترايسبس خلف الرأس', 'Overhead Triceps Extension', 'TRICEPS', 'DUMBBELL', 'BEGINNER'],
  ['غطس', 'Dips', 'TRICEPS', 'BODYWEIGHT', 'INTERMEDIATE'],
  ['سكوات بالبار', 'Barbell Squat', 'QUADS', 'BARBELL', 'INTERMEDIATE'],
  ['سكوات أمامي', 'Front Squat', 'QUADS', 'BARBELL', 'ADVANCED'],
  ['ليج برس', 'Leg Press', 'QUADS', 'MACHINE', 'BEGINNER'],
  ['طعن', 'Walking Lunge', 'QUADS', 'DUMBBELL', 'BEGINNER'],
  ['تمديد رجل', 'Leg Extension', 'QUADS', 'MACHINE', 'BEGINNER'],
  ['رفعة ميتة رومانية', 'Romanian Deadlift', 'HAMSTRINGS', 'BARBELL', 'INTERMEDIATE'],
  ['ثني رجل', 'Leg Curl', 'HAMSTRINGS', 'MACHINE', 'BEGINNER'],
  ['هيب ثرست', 'Hip Thrust', 'GLUTES', 'BARBELL', 'INTERMEDIATE'],
  ['رفع سمانة واقف', 'Standing Calf Raise', 'CALVES', 'MACHINE', 'BEGINNER'],
  ['بلانك', 'Plank', 'ABS', 'BODYWEIGHT', 'BEGINNER'],
  ['كرانش', 'Crunch', 'ABS', 'BODYWEIGHT', 'BEGINNER'],
  ['رفع أرجل معلق', 'Hanging Leg Raise', 'ABS', 'BODYWEIGHT', 'ADVANCED'],
  ['بيربي', 'Burpee', 'FULL_BODY', 'BODYWEIGHT', 'INTERMEDIATE'],
  ['جري على المشاية', 'Treadmill Run', 'CARDIO', 'CARDIO_MACHINE', 'BEGINNER'],
  ['دراجة ثابتة', 'Stationary Bike', 'CARDIO', 'CARDIO_MACHINE', 'BEGINNER'],
  ['نط الحبل', 'Jump Rope', 'CARDIO', 'OTHER', 'BEGINNER'],
];

/** Per 100 g / 100 ml. */
const FOODS: Array<[string, string, number, number, number, number, string]> = [
  ['صدور فراخ', 'Chicken Breast', 165, 31, 0, 3.6, 'بروتين'],
  ['لحم بقري مفروم', 'Ground Beef', 250, 26, 0, 17, 'بروتين'],
  ['سمك بلطي', 'Tilapia', 128, 26, 0, 2.7, 'بروتين'],
  ['سلمون', 'Salmon', 208, 20, 0, 13, 'بروتين'],
  ['تونة معلبة', 'Canned Tuna', 116, 26, 0, 1, 'بروتين'],
  ['بيض كامل', 'Whole Egg', 155, 13, 1.1, 11, 'بروتين'],
  ['بياض بيض', 'Egg White', 52, 11, 0.7, 0.2, 'بروتين'],
  ['جبنة قريش', 'Cottage Cheese', 98, 11, 3.4, 4.3, 'ألبان'],
  ['زبادي يوناني', 'Greek Yogurt', 59, 10, 3.6, 0.4, 'ألبان'],
  ['لبن كامل الدسم', 'Whole Milk', 61, 3.2, 4.8, 3.3, 'ألبان'],
  ['أرز أبيض مطبوخ', 'White Rice (cooked)', 130, 2.7, 28, 0.3, 'نشويات'],
  ['أرز بني مطبوخ', 'Brown Rice (cooked)', 111, 2.6, 23, 0.9, 'نشويات'],
  ['شوفان', 'Oats', 389, 17, 66, 7, 'نشويات'],
  ['بطاطس', 'Potato', 77, 2, 17, 0.1, 'نشويات'],
  ['بطاطا حلوة', 'Sweet Potato', 86, 1.6, 20, 0.1, 'نشويات'],
  ['مكرونة مطبوخة', 'Pasta (cooked)', 131, 5, 25, 1.1, 'نشويات'],
  ['عيش بلدي', 'Baladi Bread', 275, 9, 55, 1.5, 'نشويات'],
  ['فول مدمس', 'Fava Beans', 110, 7.6, 19, 0.4, 'بقوليات'],
  ['عدس مطبوخ', 'Lentils (cooked)', 116, 9, 20, 0.4, 'بقوليات'],
  ['حمص', 'Chickpeas', 164, 8.9, 27, 2.6, 'بقوليات'],
  ['زيت زيتون', 'Olive Oil', 884, 0, 0, 100, 'دهون'],
  ['لوز', 'Almonds', 579, 21, 22, 50, 'دهون'],
  ['زبدة فول سوداني', 'Peanut Butter', 588, 25, 20, 50, 'دهون'],
  ['أفوكادو', 'Avocado', 160, 2, 9, 15, 'دهون'],
  ['موز', 'Banana', 89, 1.1, 23, 0.3, 'فواكه'],
  ['تفاح', 'Apple', 52, 0.3, 14, 0.2, 'فواكه'],
  ['برتقال', 'Orange', 47, 0.9, 12, 0.1, 'فواكه'],
  ['فراولة', 'Strawberry', 32, 0.7, 7.7, 0.3, 'فواكه'],
  ['بروكلي', 'Broccoli', 34, 2.8, 7, 0.4, 'خضروات'],
  ['سبانخ', 'Spinach', 23, 2.9, 3.6, 0.4, 'خضروات'],
  ['خيار', 'Cucumber', 15, 0.7, 3.6, 0.1, 'خضروات'],
  ['طماطم', 'Tomato', 18, 0.9, 3.9, 0.2, 'خضروات'],
  ['سلطة خضراء', 'Green Salad', 17, 1.4, 3.3, 0.2, 'خضروات'],
  ['واي بروتين', 'Whey Protein', 380, 80, 8, 4, 'مكملات'],
];

async function main() {
  console.log('▸ Seeding…');

  // ── Admin roles ────────────────────────────────────────────────────────
  const { SYSTEM_ROLES } = await import('../src/lib/permissions');
  for (const [name, def] of Object.entries(SYSTEM_ROLES)) {
    await prisma.adminRole.upsert({
      where: { name },
      create: { name, description: def.description, permissions: def.permissions, isSystem: true },
      update: { description: def.description, permissions: def.permissions },
    });
  }
  console.log(`  ✓ ${Object.keys(SYSTEM_ROLES).length} admin roles`);

  // ── Super admin ────────────────────────────────────────────────────────
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@coachmate.app').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'ADMIN',
      status: 'ACTIVE',
      locale: 'ar',
      // No adminRole => super admin with every permission.
    },
    update: { role: 'ADMIN', status: 'ACTIVE' },
  });
  console.log(`  ✓ admin: ${adminEmail} / ${adminPassword}`);

  // ── Feature flags ──────────────────────────────────────────────────────
  for (const flag of FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        type: flag.type,
        defaultEnabled: flag.defaultEnabled,
        defaultLimit: flag.defaultLimit,
        category: flag.category,
        isKillSwitch: flag.isKillSwitch ?? false,
      },
      update: { name: flag.name, description: flag.description, category: flag.category },
    });
  }
  console.log(`  ✓ ${FLAGS.length} feature flags`);

  // ── Plans + their flag matrix ──────────────────────────────────────────
  for (const plan of PLANS) {
    const created = await prisma.plan.upsert({
      where: { key: plan.key },
      create: {
        key: plan.key,
        nameAr: plan.nameAr,
        nameEn: plan.nameEn,
        taglineAr: plan.taglineAr,
        taglineEn: plan.taglineEn,
        prices: plan.prices as Prisma.InputJsonValue,
        interval: plan.interval,
        trialDays: plan.trialDays,
        maxTrainees: plan.maxTrainees,
        maxLandingPages: plan.maxLandingPages,
        maxExercises: plan.maxExercises,
        maxNutritionPlans: plan.maxNutritionPlans,
        maxTrainerSeats: plan.maxTrainerSeats,
        aiCreditsPerCycle: plan.aiCreditsPerCycle,
        storageMb: plan.storageMb,
        commissionPercent: plan.commissionPercent,
        highlights: plan.highlights as Prisma.InputJsonValue,
        isPopular: plan.isPopular,
        sortOrder: plan.sortOrder,
      },
      update: {
        nameAr: plan.nameAr,
        nameEn: plan.nameEn,
        prices: plan.prices as Prisma.InputJsonValue,
        highlights: plan.highlights as Prisma.InputJsonValue,
        sortOrder: plan.sortOrder,
      },
    });

    for (const [flagKey, value] of Object.entries(plan.flags)) {
      await prisma.planFeature.upsert({
        where: { planId_flagKey: { planId: created.id, flagKey } },
        create: {
          planId: created.id,
          flagKey,
          enabled: typeof value === 'boolean' ? value : true,
          limitValue: typeof value === 'number' ? value : null,
        },
        update: {
          enabled: typeof value === 'boolean' ? value : true,
          limitValue: typeof value === 'number' ? value : null,
        },
      });
    }
  }
  console.log(`  ✓ ${PLANS.length} plans with feature matrix`);

  // ── Public exercise library ────────────────────────────────────────────
  for (const [nameAr, nameEn, muscleGroup, equipment, difficulty] of EXERCISES) {
    const existing = await prisma.exercise.findFirst({
      where: { nameEn, trainerId: null },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.exercise.create({
      data: {
        nameAr,
        nameEn,
        muscleGroup: muscleGroup as never,
        equipment: equipment as never,
        difficulty: difficulty as never,
        isPublic: true,
        trainerId: null,
      },
    });
  }
  console.log(`  ✓ ${EXERCISES.length} public exercises`);

  // ── Public food library ────────────────────────────────────────────────
  for (const [nameAr, nameEn, kcal, protein, carbs, fat, category] of FOODS) {
    const existing = await prisma.foodItem.findFirst({
      where: { nameEn, trainerId: null },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.foodItem.create({
      data: { nameAr, nameEn, kcal, protein, carbs, fat, category, unit: 'g', baseQty: 100, isPublic: true },
    });
  }
  console.log(`  ✓ ${FOODS.length} public foods`);

  // ── Static pages ───────────────────────────────────────────────────────
  const pages = [
    { slug: 'terms', titleAr: 'الشروط والأحكام', titleEn: 'Terms of Service' },
    { slug: 'privacy', titleAr: 'سياسة الخصوصية', titleEn: 'Privacy Policy' },
    { slug: 'about', titleAr: 'من نحن', titleEn: 'About Us' },
    { slug: 'faq', titleAr: 'الأسئلة الشائعة', titleEn: 'FAQ' },
  ];
  for (const page of pages) {
    await prisma.staticPage.upsert({
      where: { slug: page.slug },
      create: { ...page, contentAr: 'المحتوى قابل للتعديل من لوحة الإدارة.', contentEn: 'Editable from the admin panel.' },
      update: {},
    });
  }
  console.log(`  ✓ ${pages.length} static pages`);

  // ── Default settings ───────────────────────────────────────────────────
  const settings: Array<[string, string, string]> = [
    ['brand.name', 'CoachMate', 'brand'],
    ['brand.tagline_ar', 'مدربك معاك في أي وقت', 'brand'],
    ['brand.tagline_en', 'Your coach, anytime', 'brand'],
    ['app.default_currency', 'EGP', 'app'],
    ['payment.instructions_ar', 'حوّل المبلغ على إنستاباي أو فودافون كاش ثم ارفع صورة الإيصال، وسيتم تفعيل اشتراكك خلال 24 ساعة.', 'payment'],
    ['payment.instructions_en', 'Transfer the amount via InstaPay or Vodafone Cash, upload the receipt, and your subscription will be activated within 24 hours.', 'payment'],
    ['ai.model', 'claude-opus-5', 'ai'],
    ['ai.input_price_per_mtok', '5', 'ai'],
    ['ai.output_price_per_mtok', '25', 'ai'],
  ];
  for (const [key, value, category] of settings) {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value, category, isEncrypted: false },
      update: {},
    });
  }
  console.log(`  ✓ ${settings.length} settings`);

  console.log('▸ Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
