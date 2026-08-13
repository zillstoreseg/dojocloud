# CoachMate — وثيقة متطلبات المنتج الكاملة (PRD)

**منصة SaaS عربية أولًا لإدارة المدربين الرياضيين ومتدربيهم**
النسخة 1.0 · مبنية من نظام عامل بالفعل، لا من تصوّر نظري.

---

## 0. كيف تستخدم هذه الوثيقة مع Manus AI

الوثيقة دي **مواصفة بناء تنفيذية**، مش عرض تسويقي. كل رقم فيها وكل معادلة وكل اسم جدول مأخوذ من نظام مبني ومُختبَر فعلًا، وده معناه إن أي انحراف عنها هو قرار واعٍ منك مش سهو.

**الطريقة الصحيحة لتغذيتها لـ Manus:**

1. **متديهاش كلها مرة واحدة** وتقول «ابنيلي ده». هيخرج هيكل سطحي. الوثيقة مقسّمة لـ **١١ مرحلة بناء** في القسم ١٧ — ادِّي مرحلة واحدة في كل مرة، مع الأقسام المرجعية اللي بتعتمد عليها.
2. **الأقسام ٤ (نموذج البيانات) و٥ (عزل البيانات) و٦ (الصلاحيات) تُقرأ مع كل مرحلة.** دي الأساس اللي لو اتبنى غلط، إعادة بنائه لاحقًا تعني إعادة كتابة المنتج.
3. **القسم ١٨ (المصايد) هو أثمن جزء في الوثيقة.** ١٤ خطأ حقيقي وقعت فيها أثناء البناء، كل واحد منها كان بيعدّي من الـ typecheck والـ lint بنجاح تام. اقرأه قبل ما تبدأ، مش بعد ما تقع فيهم.
4. **معايير القبول في القسم ١٦ مش اختيارية.** «الميزة اتبنت» تعني «الاختبار بتاعها بيعدّي»، مش «الكود موجود».

**التقنيات مثبّتة عمدًا** (القسم ٣). لو Manus اقترح بديل — Supabase بدل Prisma، أو Clerk بدل Auth.js — النظام هيشتغل، بس معادلات العزل والحصص في الوثيقة دي مكتوبة بلغة Prisma وPostgreSQL RLS وهتحتاج ترجمة كاملة.

---

## 1. المنتج

### 1.1 المشكلة

المدرب الرياضي المستقل اليوم بيدير شغله على **واتساب وإكسل**. النتيجة:

| المشكلة | الأثر الحقيقي |
|---|---|
| البرامج والتغذية في ملفات متفرقة | كل متدرب جديد = شغل من الصفر |
| مفيش نظام اشتراكات | بيفتكر مين دفع ومين لأ من الذاكرة، وبيخسر تجديدات |
| مفيش حضور رقمي | العميل الجديد بيجي بالصدفة أو بالمعرفة |
| التحصيل يدوي بالكامل | فلوس ضايعة ومتأخرة |
| مفيش متابعة يومية للمتدرب | المتدرب بيقع من البرنامج والمدرب مبيعرفش غير بعد شهر |

### 1.2 الحل

منصة **مش بتنظّم شغل المدرب بس — بتجيبله عملاء وتحصّله فلوسه.** ده الفرق اللي بيخلي الاشتراك يدفع نفسه، ومن غيره المنتج ده أداة إدارة تانية بين عشرات.

**أربع ركائز:**

1. **إدارة كاملة** — متدربين، برامج تدريب، أنظمة تغذية، قياسات، رسائل، باقات.
2. **حضور رقمي يجيب عملاء** — لاندينج بيدج ببانِي صفحات على `domain.com/c/{username}` + دليل مدربين عام بفلاتر (SEO).
3. **تحصيل حقيقي** — المتدرب يدفع عبر المنصة، الفلوس تدخل **محفظة المدرب**، ويسحبها ضمن حدود يضبطها الأدمن.
4. **مساعد ذكاء اصطناعي** — توليد برامج وأنظمة غذائية، و**تحليل صور الأكل** للمتدرب بحكم مبني على هدفه الشخصي.

### 1.3 المستخدمون الثلاثة

| الدور | مين هو | بيدخل فين | القيمة اللي بياخدها |
|---|---|---|---|
| **ADMIN** | مالك المنصة وفريقه | `/admin/*` | تحكم كامل في كل كيان + كل رقم في المنصة منفصلًا |
| **TRAINER** | المدرب المشترك | `/dash/*` | إدارة + تسويق + تحصيل |
| **TRAINEE** | متدرب تابع لمدرب | `/my/*` | متابعة يومية وتحليل أكل ومحادثة مدربه |

**قاعدة حاكمة: بيانات كل مدرب معزولة تمامًا عن أي مدرب تاني.** دي مش ميزة — دي شرط وجود المنتج، ومبنية على **ثلاث طبقات مستقلة** (القسم ٥).

### 1.4 مبادئ التصميم الحاكمة

هذه المبادئ تُطبَّق على كل شاشة، وأي انحراف عنها هو خطأ:

- **RTL أولًا** — العربية هي الافتراضي، والإنجليزية ترجمة. مش العكس.
- **الحركة تشرح، لا تبهر** — لو الأنيميشن مش بيوضح علاقة أو حالة، احذفه.
- **الحالة الفارغة مصمّمة** — كل قسم فاضي بيعرض رسمة وسبب وخطوة تالية، مش جملة رمادية.
- **القفل يبيع** — الميزة غير المتاحة في خطة المستخدم تظهر **مقفولة بسبب واضح**، متختفيش. الإخفاء لا يبيع ترقية.
- **لا رابط مكسور أبدًا** — أي عنصر تنقّل لمسار غير مبني يظهر معطّلًا بشارة «قريبًا».

---

## 2. البيزنس موديل

### 2.1 قنوات الدخل الخمس

| # | القناة | التفاصيل |
|---|---|---|
| 1 | **اشتراكات SaaS** | شهري/ربع سنوي/سنوي. القناة الأساسية. |
| 2 | **عمولة على مدفوعات المتدربين** | 5% في Starter، 3% في Pro، **0% في Elite وGym**. تُخصم لحظة اعتماد الأدمن للوصل. **دي أقوى محرّك ترقية في المنتج** — المدرب اللي بيحصّل كتير بيحسبها ويرقّي. |
| 3 | **باقات إضافية** | رصيد AI إضافي، متدربون إضافيون، تخزين، نطاق مخصص. |
| 4 | **الدليل (Marketplace)** | خانات «مميّز» مدفوعة + مصدر SEO يجيب زوار للمنصة كلها. |
| 5 | **White-label / Gym** | نطاق مخصص، هوية الجيم، مقاعد لعدة مدربين. |

### 2.2 الخطط الخمس (قيم فعلية من الـ seed)

| | **تجربة** | **Starter** | **Pro** ⭐ | **Elite** | **Gym/Team** |
|---|---|---|---|---|---|
| السعر EGP/شهر | 0 | 399 | 899 | 1,899 | 4,900 |
| USD | 0 | 10 | 24 | 49 | 129 |
| AED / SAR | 0 | 39 | 89 | 189 | 490 |
| فترة تجربة | 14 يوم | — | — | — | — |
| المتدربون | 3 | 15 | 60 | 200 | ∞ |
| صفحات الهبوط | 1 | 1 | 3 | ∞ | ∞ |
| التمارين | 30 | 150 | ∞ | ∞ | ∞ |
| أنظمة التغذية | 5 | 25 | ∞ | ∞ | ∞ |
| توليدات AI/شهر | 10 | 40 | 300 | 1,000 | 5,000 |
| **العمولة** | 0% | **5%** | **3%** | **0%** | **0%** |
| مقاعد مدربين | 1 | 1 | 1 | 3 | حسب الاتفاق |
| إزالة علامة المنصة | ✗ | ✗ | ✓ | ✓ | ✓ |
| نطاق مخصص | ✗ | ✗ | ✗ | ✓ | ✓ |
| CRM للـ Leads | ✗ | أساسي | كامل | كامل+أتمتة | + توزيع فريق |

> **كل رقم في الجدول ده قيمة في الداتابيز يعدّلها الأدمن من `/admin/plans` بلا كود.** الجدول ده حالة ابتدائية (seed)، مش ثوابت في الكود.

**العملات:** `Plan.prices` حقل `Json` بالشكل `{ "EGP": 899, "AED": 89, "SAR": 89, "USD": 24 }`. العملة تُقترح من دولة المدرب عبر `currencyForCountry()` مع مبدّل يدوي.

### 2.3 حلقات النمو المبنية داخل المنتج

| الحلقة | كيف تشتغل |
|---|---|
| **اللاندينج** | كل صفحة مدرب في الخطط الدنيا تحمل «مدعوم من CoachMate» → كل زائر إعلان مجاني، وإخفاء العلامة سبب ترقية |
| **الدليل** | `/coaches` يجيب زيارات SEO → Leads للمدربين → المدرب كسب → مبيلغيش اشتراكه |
| **المتدرب → مدرب** | نسبة من المتدربين مدربون محتملون → دعوة مدمجة في بوابة المتدرب |
| **الإحالة** | مدرب يدعو مدرب = **شهر مجاني للطرفين** (مبني: `lib/referrals.ts`) |
| **الاحتفاظ** | تنبيهات تجديد + تقرير شهري «كسبت كذا، جددوا كذا» على البريد |

### 2.4 المقاييس اللي الأدمن لازم يشوفها

MRR · ARR · ARPU · Churn · LTV · تحويل زائر→مسجّل→مدفوع · تحويل التجربة · **هامش الربح الصافي لكل خطة** (الإيراد − تكلفة AI الفعلية − تخزين − رسوم البوابة) · إيراد كل مدرب · Cohort retention · **التزامات المحفظة** (فلوس محصَّلة مستحقّة للمدربين — **لا تُحسب ربحًا**).

---

## 3. التقنيات (مثبّتة)

| العنصر | الاختيار | ليه ده بالذات |
|---|---|---|
| Framework | **Next.js 15** (App Router, RSC, Server Actions) | Server Actions تلغي طبقة API كاملة، والـ RSC بيخلي العزل يتنفّذ على السيرفر افتراضيًا |
| Language | **TypeScript** (strict) | |
| DB | **PostgreSQL 16** | **RLS** — طبقة العزل الثالثة مستحيلة من غيره |
| ORM | **Prisma 6** | Client Extensions = حقن `trainerId` تلقائيًا |
| Auth | **Auth.js (NextAuth v5)** — Credentials + JWT | |
| UI | **Tailwind CSS** + shadcn/ui + lucide-react | |
| i18n | **next-intl v4** + مقطع `[locale]` | |
| Validation | **Zod 3.25** (مشتركة client/server) | ⚠️ اقرأ القسم 18.2 |
| Charts | **Recharts** | |
| Motion | **Framer Motion** (`motion/react` v13) | |
| Drag & Drop | **@dnd-kit** | باني البرامج + باني الصفحات |
| Tables | **TanStack Table** | كل جداول الأدمن |
| Images | **sharp** | تصغير ونزع EXIF — إلزامي لصور الأكل |
| AI | **@anthropic-ai/sdk** — model `claude-opus-5` | |
| Passwords | **bcryptjs**, cost 12 | |
| Storage | تجريد `lib/storage.ts`: قرص محلي ⇄ S3 | |
| Tests | **Vitest** (وحدة + تكامل بداتابيز حقيقية) + **Playwright** | |
| Analytics | **تتبّع داخلي في الداتابيز** — بلا طرف ثالث | |

### 3.1 بنية المسارات

```
app/[locale]/
├── (public)         الرئيسية · /login · /register · /forgot · /reset · /p/[slug]
├── coaches/         دليل المدربين بفلاتر
├── c/[username]/    لاندينج المدرب العامة
├── join/[username]/ رحلة اشتراك المتدرب
├── onboarding/      certificates · pending · plan · plan/[id]/pay · plan/[id]/review
├── admin/           ٢١ شاشة
├── dash/            ١٤ شاشة
└── my/              ٨ شاشات
app/api/
├── auth/[...nextauth]
├── admin/export/[entity]     تصدير CSV
└── cron/subscriptions        محميّ بـ CRON_SECRET
```

### 3.2 طبقة الخدمات — `src/lib/`

٥٦ وحدة. المحورية منها:

| الملف | المسؤولية |
|---|---|
| `authz.ts` | `requireUser/requireAdmin/requireTrainer/requireTrainee` + `trainerDb()` |
| `ownership.ts` | `assertOwnsTrainee` · `assertOwns` · `toActionError` |
| `flags.ts` | محلّل الـ feature flags بثلاث أولويات |
| `quota.ts` | `assertQuota` · `getAllQuotas` · `resetCounters` |
| `nutrition.ts` | BMR/TDEE/الماكروز/**حكم الوجبة** — دوال نقيّة |
| `wallet.ts` | دفتر أستاذ append-only |
| `ai/client.ts` | **الباب الوحيد** لأي نداء AI |
| `ai/food-scan.ts` | تحضير الصورة + التحليل + إعادة الحساب |
| `rls.ts` | `withTenantRls` · `rlsRoleIsExempt` |
| `rate-limit.ts` | حد المحاولات كصفوف في الداتابيز |
| `billing.ts` | `addInterval` · `daysRemaining` |
| `money.ts` | `planPrice` · `applyCoupon` · `formatMoney` |
| `crypto.ts` | AES-256-GCM لأسرار الإعدادات |

---

## 4. نموذج البيانات

**٧٥ موديل + ٢٧ enum** في `schema.prisma` (~1,545 سطر). التالي هو الهيكل الكامل بالحقول الحرجة.

### 4.1 الهوية

```prisma
User          id, email @unique, phone, passwordHash, role: Role,
              adminRoleId?, locale, status: UserStatus, lastLoginAt,
              referredById?, referralCode @unique
AdminRole     name, permissions: String[]     // صلاحيات دقيقة للأدمن المساعد
TrainerProfile
              userId @unique, username @unique,   // ← رابط اللاندينج
              fullName, specialties: Specialty[], phone, country, gender,
              trainsGenders: TrainsGenders, yearsExperience, bio, avatar,
              approvalStatus: ApprovalStatus, rejectionReason,
              isFeatured, featuredUntil,
              // عدّادات مُشتقّة للدليل — تُحدَّث عند الحدث لا عند القراءة:
              activeTraineesCount, approvedCertificatesCount,
              ratingAvg, ratingCount, startingPrice, languages: String[]
UsernameHistory  oldUsername, trainerId    // ← لإعادة توجيه 301
Certificate   trainerId, title, issuer, year, fileUrl, status, reviewNote
PasswordResetToken  tokenHash, userId, expiresAt, usedAt
RateLimitHit  key, ip, createdAt
```

**فهارس إلزامية على `TrainerProfile`:** مركّب على `(approvalStatus, isFeatured, activeTraineesCount)` و**GIN على `specialties`**. من غيرهم الدليل بيبطّأ عند أول ٥٠٠ مدرب.

**قواعد `username`:** حروف صغيرة/أرقام/شرطة، 3–30، **قائمة كلمات محجوزة** (`admin, api, coaches, dash, my, login, c, p, static, join, onboarding, register, forgot, reset`)، قابل للتغيير **مرة كل 30 يوم** مع 301 من القديم.

### 4.2 الاشتراكات والمال

```prisma
Plan          name: Json{ar,en}, prices: Json,   // متعدد العملات
              interval: BillingInterval, trialDays,
              maxTrainees?, maxLandingPages?, maxExercises?,
              maxNutritionPlans?, maxTrainerSeats,
              aiCreditsPerCycle, storageMb, commissionPercent,
              features: Json, isActive, isPopular, isPublic, sortOrder
Subscription  trainerId, planId, status: SubscriptionStatus,
              startsAt, endsAt, trialEndsAt?, autoRenew, couponId?
Payment       subscriptionId, amount, currency, method: PaymentMethod,
              receiptUrl, reference, status: PaymentStatus,
              reviewedById?, reviewedAt?, adminNote, providerRef
Coupon        code @unique, type: CouponType, value, planIds: String[],
              maxRedemptions, usedCount, expiresAt
CostRecord    kind: CostKind (AI|STORAGE|GATEWAY), amount, refId, date
UsageCounter  subscriptionId, key, used, periodStart, periodEnd
```

`SubscriptionStatus`: `TRIALING | PENDING_PAYMENT | ACTIVE | PAST_DUE | EXPIRED | CANCELLED`

### 4.3 المحفظة والسحوبات

```prisma
Wallet        trainerId @unique, currency, balance: Decimal,
              pendingBalance: Decimal, lifetimeEarned, lifetimeWithdrawn, isFrozen
WalletTransaction
              walletId, type: WalletTxType, amount: Decimal, currency,
              balanceAfter: Decimal, availableAt?, refType, refId,
              note, createdById
PayoutRequest trainerId, amount, currency, method: PayoutMethod,
              destination: Json,   // ← مشفَّر
              status: PayoutStatus, adminNote, proofUrl,
              reviewedById?, reviewedAt?, paidAt?
```

`WalletTxType`: `CREDIT | HOLD_RELEASE | COMMISSION_FEE | PAYOUT | REFUND | ADJUSTMENT`
`PayoutMethod`: `BANK | INSTAPAY | VODAFONE_CASH | WISE | OTHER`
`PayoutStatus`: `PENDING | APPROVED | PAID | REJECTED`

> **`WalletTransaction` دفتر append-only: ممنوع `update` وممنوع `delete` عليه إطلاقًا.** التصحيح بقيد `ADJUSTMENT` معاكس. **الثابتة المُختبَرة:** `balance + pendingBalance == Σ(كل القيود)` لكل محفظة.

### 4.4 التدريب

```prisma
Trainee       userId?, trainerId, gender, birthDate, height, startWeight,
              goal: TrainingGoal, activityLevel: ActivityLevel,
              medicalNotes, injuries, status: TraineeStatus,
              startDate, renewalDate
TrainerPackage    trainerId, name, price, durationDays, sessionsCount, isPublic
TraineeSubscription  traineeId, packageId, receiptUrl, amount,
                     status, startsAt, endsAt, approvedById?
TraineeIntake     traineeId, version, submittedAt,
                  goal, targetWeight, weight, height, gender, birthDate,
                  activityLevel, isAthlete, sportType, sportLevel: SportLevel,
                  trainingDaysPerWeek, sessionMinutes, trainingPlace: TrainingPlace,
                  equipment[], injuries[], medicalConditions[], medications,
                  allergies, dietPreference: DietPreference, dislikedFoods[],
                  mealsPerDay, sleepHours, waterLiters, smokes, workSchedule,
                  stressLevel, previousExperienceYears, notes,
                  // ← محسوبة ومخزَّنة وقت الإرسال:
                  bmi, bmr, tdee, calorieTarget, proteinG, carbsG, fatG
Exercise      trainerId?, name: Json{ar,en}, muscleGroup: MuscleGroup,
              equipment: Equipment, difficulty: Difficulty,
              videoUrl, imageUrl, instructions, isPublic
WorkoutProgram → WorkoutWeek → WorkoutDay → WorkoutItem
WorkoutLog    traineeId, workoutItemId, setsDone, repsDone, weightUsed, notes, date
FoodItem      name: Json{ar,en}, kcal, protein, carbs, fat, per100g, isPublic
NutritionPlan → Meal → MealItem
Measurement   traineeId, weight, bodyFat, مقاسات..., photos[], date
Conversation / Message      trainerId, traineeId, body, readAt
Notification  userId, type: NotificationType, title, body, href, readAt, idempotencyKey
```

### 4.5 تحليل صور الأكل

```prisma
FoodScan  traineeId, trainerId, imageUrl, thumbUrl,
          status: ScanStatus (PENDING|DONE|FAILED), mealType: MealType,
          items: Json[],   // {name, grams, kcal, protein, carbs, fat, confidence}
          totals: Json, verdict: MealVerdict, verdictReason: Json{ar,en},
          nutritionPlanId?, mealId?,
          calorieBudgetAtScan, consumedBeforeScan,   // ← لقطة وقت الفحص
          aiUsageId?, loggedAt?
```

`MealVerdict`: `FITS | OVER | UNDER | OFF_PLAN`

> **`calorieBudgetAtScan` و`consumedBeforeScan` لقطتان مخزَّنتان.** بدونهما، فتح فحص قديم يعيد حسابه بأرقام النهارده ويغيّر الحكم — يعني سجل بيكذب على نفسه.

### 4.6 اللاندينج والتسويق

```prisma
LandingPage  trainerId, title, slug, seoDescription, ogImage,
             theme: Json, status: PageStatus, publishedAt, viewsCount
PageBlock    pageId, type: BlockType, order, props: Json, isVisible
Lead         trainerId, pageId?, name, phone, goal, message, source,
             utmSource, utmMedium, utmCampaign, status: LeadStatus,
             convertedTraineeId?
Testimonial     trainerId, author, body, rating, isVisible
Transformation  trainerId, beforeUrl, afterUrl, story, durationWeeks
```

`BlockType` (١٥ نوع): `HERO · ABOUT · STATS · SERVICES · PACKAGES · CERTIFICATES · TRANSFORMATIONS · GALLERY · VIDEO · TESTIMONIALS · FAQ · CONTACT_FORM · CTA_WHATSAPP · SOCIAL_LINKS · CUSTOM_HTML`

### 4.7 النظام والتحليلات

```prisma
PageView   path, trainerId?, sessionId, referrer,
           utmSource/Medium/Campaign, country, device, browser
AiUsage    userId, trainerId, feature, model,
           inputTokens, outputTokens, costEstimate: Decimal, success
AuditLog   actorId, action, entity, entityId, before: Json, after: Json, ip
EmailLog   to, subject, template, status (SENT|SKIPPED|FAILED), error
AppSetting key @unique, value    // ← مشفّر للأسرار
StaticPage slug @unique, title: Json, content: Json{ar,en}, isPublished
Announcement  title: Json, body: Json, level, startsAt, endsAt, isActive
FeatureFlag / PlanFeature / UserFeatureOverride
```

---

## 5. عزل البيانات — ثلاث طبقات

**ده أهم قسم في الوثيقة.** المنتج بيخزّن بيانات صحية وأجسام وصور لأشخاص حقيقيين تحت مدربين متنافسين. تسريب واحد = نهاية المنتج.

**المبدأ الحاكم: لا endpoint ولا server action يقبل `trainerId` من العميل. أبدًا. يُشتق دائمًا من الجلسة.**

### الطبقة 1 — حرّاس الملكية (`lib/ownership.ts` + `lib/authz.ts`)

كل server action بيبدأ بواحد من دول:

```ts
const { trainerId } = await requireTrainer();          // مدرب معتمد ونشط
await assertOwnsTrainee(trainerId, traineeId);         // بيرمي لو مش بتاعه
await assertOwns('workoutProgram', programId, trainerId);
```

### الطبقة 2 — امتداد Prisma (`trainerDb()`)

```ts
const db = await trainerDb();
// كل استعلام على كيان تشغيلي بيتحقن فيه where.trainerId تلقائيًا
const trainees = await db.trainee.findMany();  // ← مفلترة بالفعل
```

الطبقة دي **بتمسك النسيان**: لو مطوّر نسي الحارس، الامتداد لسه بيفلتر.

### الطبقة 3 — PostgreSQL RLS

Migration بتفعّل `ENABLE ROW LEVEL SECURITY` **و`FORCE`** على ١٥ جدول تشغيلي، بسياسة:

```sql
current_setting('app.trainer_id', true) IS NULL
  OR "trainerId" = current_setting('app.trainer_id', true)
```

والاتصال بيتغلّف بـ `withTenantRls(trainerId, fn)` اللي بتعمل `SET LOCAL app.trainer_id`.

### ⚠️ المصيدة القاتلة

> **PostgreSQL بيعفي الـ superuser وأي دور بـ `BYPASSRLS` من كل سياسة — في صمت تام. مفيش تحذير، مفيش خطأ، السياسات متسطبة وولا واحدة شغالة.**

ده حصل معايا فعليًا: السياسات كانت متسطبة صح، والاختبارات كانت **بتفشل ٦ من ١١**، والسبب إن دور الداتابيز كان `rolsuper = t`.

**العلاج الإلزامي (تلات حتت):**

1. دور التطبيق يتعمل `NOSUPERUSER NOBYPASSRLS`، والسكربت **يشيل الصفتين دول من دور موجود قبل كده**.
2. دالة `rlsRoleIsExempt()` تُعرض في شاشة صحة النظام `/admin/system`.
3. **أول assertion في ملف اختبارات RLS هو إن الدور مش معفيّ** — من غير كده الاختبارات بتعدّي وهي مش بتثبت حاجة.
4. الـ CI **يعمل دوره الخاص** بنفس الصفات — مش `postgres`.

### اختبار العزل الإلزامي

`tests/data-isolation.test.ts`: مدرب (أ) **لا يقرأ ولا يعدّل ولا يحذف** متدربًا أو تمرينًا أو برنامجًا أو نظامًا غذائيًا أو صفحة أو Lead أو رسالة لمدرب (ب) — **عبر كل server action موجود**، مش عيّنة.

---

## 6. المصادقة والصلاحيات

### 6.1 الجلسة

Auth.js v5، Credentials + JWT. الـ JWT بيحمل: `id, role, trainerId?, traineeId?, adminRoleId?, locale`.

> ⚠️ **الـ JWT claims لقطات، مش حقيقة حيّة.** المدرب اللي اعتُمد بعد ما سجّل دخول، توكنه لسه بيقول `PENDING`. لذلك: **ممنوع بناء بوابة على claim متغيّر.** حالة الاعتماد والاشتراك تُقرأ من الداتابيز في `trainerGate()`.

### 6.2 آلة حالة بوابة المدرب (`lib/trainer/gate.ts`)

```
مش مدرب                                → notFound()
approvalStatus === PENDING             → /onboarding/pending
approvalStatus === REJECTED            → /onboarding/pending (بالسبب)
مفيش شهادات مرفوعة                     → /onboarding/certificates
مفيش اشتراك                            → /onboarding/plan
PENDING_PAYMENT بلا دفعة               → /onboarding/plan/{id}/pay
PENDING_PAYMENT بدفعة PENDING          → /onboarding/plan/{id}/review
EXPIRED | CANCELLED                    → /onboarding/plan
ACTIVE | TRIALING                      → اللوحة ✓
```

مستخرجة كدالة نقيّة عشان تتغطّى باختبار من غير رندر.

### 6.3 صلاحيات الأدمن المساعد

`AdminRole.permissions: String[]` بمفاتيح دقيقة، و`requireAdmin(permission?)` بتفرضها. مثال: `activations.review`, `plans.write`, `payouts.approve`, `settings.write`, `users.impersonate`.

### 6.4 الأمان التشغيلي

| الآلية | التفصيل |
|---|---|
| **كلمات السر** | bcrypt cost 12 + `DUMMY_HASH` يُقارن به عند عدم وجود المستخدم — **منعًا لتسريب وجود البريد عبر فرق التوقيت** |
| **استعادة السر** | توكن **مُهشَّم** في الداتابيز، صالح ساعة، **يحرق كل إخوته** عند الاستخدام. `requestPasswordReset` **بترجع نفس الرد** سواء البريد موجود أو لأ |
| **حد المحاولات** | **صفوف في الداتابيز مش Map في الذاكرة** — لأن Map بيضيع مع كل إعادة تشغيل وبيفشل مع أكتر من عملية. حدود لـ: login, passwordReset, passwordResetIp, lead, receipt, message |
| **أسرار الإعدادات** | AES-256-GCM بمفتاح من البيئة. تُفكّ عند العرض فقط وتُسجَّل في التدقيق |
| **بيانات التحويل** | `PayoutRequest.destination` مشفّرة، تُفكّ عند فتح الطلب فقط + قيد تدقيق |
| **الرفع** | تحقق نوع وحجم + اسم UUID + **نزع EXIF** (بما فيه الموقع الجغرافي) |
| **التدقيق** | `AuditLog` لكل تغيير إداري: قبل/بعد + IP + الفاعل |

---

## 7. Feature Flags والحصص

### 7.1 محلّل الأولويات الثلاث

```
افتراضي عام (FeatureFlag.defaultEnabled)
  ← تُغلَب بـ  الخطة (PlanFeature)
      ← تُغلَب بـ  المستخدم (UserFeatureOverride، بصلاحية اختيارية)
```

مع **كاش داخل الطلب** عبر React `cache`. نوعان: `BOOLEAN` و`LIMIT` (بقيمة رقمية).

### 7.2 المفاتيح المبنية (٢٢)

```
ai.enabled · ai.workout_generation · ai.nutrition_generation
ai.progress_summary · ai.food_scan · ai.food_scan.daily (LIMIT، افتراضي 5)
builder.enabled · builder.remove_branding · builder.custom_html · builder.custom_domain
directory.listing · directory.featured
leads.crm · messaging.enabled · trainee.portal · data.export · team.seats (LIMIT)
trial · starter · pro · elite · gym          ← مفاتيح تعريف الخطط
```

### 7.3 الحصص (`lib/quota.ts`)

```ts
QUOTA_KEYS = {
  TRAINEES: 'trainees.active',      LANDING_PAGES: 'landing.pages',
  EXERCISES: 'exercises',           NUTRITION_PLANS: 'nutrition.plans',
  AI_GENERATIONS: 'ai.generations', STORAGE_MB: 'storage.mb',
}
```

- `assertQuota(trainerId, key)` **قبل أي إنشاء**.
- `null` = غير محدود.
- **تجاوز الحصة = رسالة ترقية بزر، مش رسالة خطأ.** ده فرق تحويل حقيقي.
- `resetCounters` عند تفعيل/تجديد الاشتراك.

---

## 8. لوحة تحكم الأدمن (٢١ شاشة)

**أولوية قصوى: تحكم كامل في كل جزئية + إحصائيات منفصلة لكل شيء.**

### 8.1 مركز التفعيلات — `/admin/activations`

قلب التشغيل اليومي. خمس تبويبات، كل واحد بعدّاد معلّق في السايدبار:

1. **اعتماد المدربين** — بيانات كاملة + قبول/رفض بسبب
2. **مراجعة الشهادات** — عارض ملفات مدمج
3. **تفعيل مدفوعات المدربين** — عرض الوصل + المبلغ + الخطة → موافقة تعمل: تفعيل + حساب `endsAt` + **تصفير `UsageCounter`** + إشعار + `AuditLog`
4. **مراجعة اشتراكات المتدربين** — الموافقة **بتضيف الفلوس لمحفظة المدرب** (القسم 11)
5. **مراجعة صفحات الهبوط** — إخفاء المحتوى المخالف

### 8.2 التحليلات — ست شاشات منفصلة

| المسار | المحتوى |
|---|---|
| `/admin` | KPIs حية: MRR، إيراد اليوم/الشهر، مشتركون نشطون، تجارب جارية، معلّق للمراجعة، زوار اليوم + رسم بمدى زمني ومقارنة بالفترة السابقة |
| `/admin/analytics/revenue` | إيراد حسب الخطة/العملة/الدولة/طريقة الدفع · مقبول vs مرفوض · متوسط قيمة الاشتراك · إيراد مؤجل |
| `/admin/analytics/profit` | **الإيراد + العمولة − تكلفة AI الفعلية − تخزين − رسوم البوابة = صافي الربح والهامش %** لكل خطة ولكل مدرب · «أكثر الخطط ربحية» · «مدربون تكلفتهم أعلى من إيرادهم» · **سطر منفصل لالتزامات المحفظة** |
| `/admin/analytics/subscriptions` | جديد/مجدَّد/ملغى/منتهٍ يوميًا · Churn · تحويل التجربة → مدفوع · Cohort retention |
| `/admin/analytics/traffic` | زيارات/جلسات/زوار فريدون · أكثر الصفحات · **أداء كل لاندينج مدرب على حدة** · مصادر UTM · الدول والأجهزة · **قمع: زائر → Lead → متدرب مدفوع** |
| `/admin/analytics/ai` | عدد التوليدات · التوكنز · **التكلفة بالدولار** · أكثر المستخدمين استهلاكًا · معدل الفشل |

### 8.3 باقي الشاشات

`/admin/trainers` · `/admin/trainees` · `/admin/plans` · `/admin/payments` · `/admin/payouts` · `/admin/flags` · `/admin/library/exercises` · `/admin/library/foods` · `/admin/pages` (صفحات الهبوط) · `/admin/static-pages` · `/admin/food-scans` (عيّنة مراجعة + معدل فشل + تكلفة) · `/admin/audit` · `/admin/settings` · `/admin/design` (دليل أسلوب حي) · `/admin/system` (صحة النظام)

**كل جدول:** بحث + فلاتر + فرز + تحديد متعدد + إجراءات جماعية + **تصدير CSV** (`/api/admin/export/[entity]`) + سجل تغييرات.

### 8.4 شاشة صحة النظام — `/admin/system`

**دي شاشة لأشياء بتفشل من غير ما حد يشوف خطأ:**

| الفحص | الحالة الخطرة |
|---|---|
| **دور الداتابيز** | معفيّ من RLS → العزل واهم |
| **مفتاح AI** | غير مضبوط → الميزة مقفولة بصمت |
| **البريد** | `none` → كل الإشعارات مش بتوصل |
| **CRON_SECRET** | غير مضبوط → التجديدات والإفراج مش شغالين |
| **التخزين** | `local` على أكتر من خادم → ملفات ضايعة |
| **المهام المجدولة** | آخر تشغيل ناجح |

### 8.5 عمليات

سجل التدقيق · **انتحال شخصية مستخدم للدعم** (بقيد تدقيق وبانر تحذيري ظاهر) · سجل البريد · **وضع الصيانة** · بانر إعلان · تعديل الهوية (اسم/لوجو/ألوان/سوشيال) · بيانات الدفع اليدوي · مفتاح Claude ونموذجه وسعره · SEO عام.

### 8.6 مفاتيح الإعدادات (`AppSetting`) — ٤٧ مفتاح

```
brand.*     name, logo_url, primary_color, accent_color,
            tagline_ar/en, support_email, support_phone
app.*       default_locale, default_currency, currencies,
            maintenance_mode, allow_trainer_signup
ai.*        api_key(🔒), model, effort,
            input_price_per_mtok, output_price_per_mtok
payment.*   active_provider, instructions_ar/en, bank_name, bank_account,
            instapay, vodafone_cash, kashier_api_key(🔒), ziina_api_key(🔒)
payout.*    enabled, min_amount, max_per_request, max_per_month,
            hold_days, methods
email.*     provider, from, resend_api_key(🔒),
            smtp_host, smtp_port, smtp_user, smtp_password(🔒), notify_types
referral.*  enabled, reward_days
seo.*       title_ar/en, description_ar/en, og_image
```
🔒 = مشفّر بـ AES-256-GCM

---

## 9. رحلة المدرب

```
تسجيل → رفع شهادات → انتظار الاعتماد → اختيار خطة (إجباري)
     → رفع وصل → قيد المراجعة → تفعيل الأدمن → اللوحة
```

### 9.1 التسجيل — `/register`

الاسم الكامل · البريد · الهاتف · **التخصص (متعدد)** · الدولة · النوع · **يدرّب رجال/سيدات/الاثنين** · **سنوات الخبرة** · كلمة السر · **كود إحالة اختياري**.

> ⚠️ كود الإحالة بيوصل عبر `?ref=`. **لازم يتقرا في `useEffect` مش في `useState` initializer** — الـ initializer بيتنفّذ على السيرفر وبيرجع فاضي، وReact **مش** بتعيد تشغيله عند الـ hydration. المصيدة دي بتخلي كل الإحالات تضيع بصمت (18.5).

### 9.2 الشهادات — `/onboarding/certificates`

رفع متعدد + عنوان وجهة إصدار وسنة، برسالة صريحة: «سيتم مراجعتها واعتمادها من الإدارة».

### 9.3 اختيار الخطة والدفع

- بطاقات من `prisma.plan` (`isActive && isPublic`)، العملة مقترحة من الدولة.
- كوبون **يُتحقّق منه على السيرفر** (نشط، غير منتهٍ، ضمن `planIds`، `usedCount < maxRedemptions`).
- **خطة تجربة** (`trialDays > 0` وسعرها صفر) → تُفعَّل فورًا `TRIALING` + `resetCounters`، بلا دفع.
- غير كده → `PENDING_PAYMENT` → صفحة دفع فيها **تعليمات التحويل من الإعدادات + زر نسخ لكل رقم** → رفع الوصل → `Payment(PENDING)`.

### 9.4 طبقة مزوّد الدفع

```ts
export interface PaymentProvider {
  key: 'manual' | 'kashier' | 'ziina';
  createCheckout(i: CheckoutInput): Promise<CheckoutResult>;
  handleWebhook?(req: Request): Promise<PaymentEvent>;
}
```

`ManualProvider` هو التنفيذ الآن. `kashier.ts` و`ziina.ts` **هيكلان يرميان `NotConfiguredError`** — الشكل يُبنى من البداية عشان إضافتهما لاحقًا متلمسش أي واجهة.

### 9.5 لوحة المدرب — ١٤ شاشة

| المسار | المحتوى |
|---|---|
| `/dash` | حالة الاشتراك · تاريخ التجديد · **حلقات الحصص** (`StatRing`) · **ودجت التجديدات القادمة ٧/١٤/٣٠ يوم** · الخطوات التالية بحالات فارغة مرسومة |
| `/dash/trainees` + `/[id]` | قائمة بفلاتر وبحث · ملف كامل: الهدف، القياسات، البرنامج، التغذية، الاشتراك، التجديد، الملاحظات الطبية |
| `/dash/exercises` | مكتبة المدرب + المكتبة العامة (٣٦ تمرين مبذور) بفلترة، ونسخ من العامة للخاصة |
| `/dash/programs` + `/[id]` | باني البرنامج: أسابيع ← أيام ← تمارين بالسحب والإفلات · إسناد لمتدرب · نسخ كقالب |
| `/dash/nutrition` + `/[id]` | وجبات ← أصناف من `FoodItem` (٣٤ صنف مبذور) بمجاميع سعرات وماكروز حيّة |
| `/dash/packages` | باقات المدرب (اسم، سعر، مدة، جلسات، عامة/خاصة) |
| `/dash/page` | **باني الصفحات** (القسم 10) |
| `/dash/leads` | CRM بحالات وتحويل لمتدرب |
| `/dash/messages` | محادثات المتدربين |
| `/dash/wallet` | **المحفظة** (القسم 11) |
| `/dash/ai` | توليد برنامج/نظام غذائي + عدّاد الرصيد |
| `/dash/billing` | الخطة · الحصص · سجل المدفوعات · ترقية/تجديد |
| `/dash/settings` | البروفايل · الـ username · كلمة السر · اللغة |

---

## 10. باني الصفحات و`/c/{username}` والدليل

**«أهم ميزة في المشروع».**

### 10.1 المحرر — `/dash/page`

ثلاثة أعمدة: **مكتبة البلوكات (سحب) · معاينة حية · خصائص البلوك**.

- ١٥ نوع بلوك (القسم 4.6). `PACKAGES` مربوط بـ`TrainerPackage`، `CERTIFICATES` بالشهادات المعتمدة.
- `CUSTOM_HTML` **لـ Elite فقط** (flag `builder.custom_html`).
- ثيم: لون أساسي، خط، زوايا، داكن/فاتح، غلاف.
- معاينة موبايل/تابلت/ديسكتوب. مسودة/نشر.
- **حركة السحب:** رفع البلوك + ظل + خط إدراج متحرك + ارتداد عند الإفلات.

### 10.2 الصفحة العامة — `/{locale}/c/{username}`

- **SSR كامل** لأجل الـ SEO + `generateMetadata`.
- **صورة OG ديناميكية** عبر `next/og` (اسم المدرب + تخصصه + صورته).
- زر مشاركة: نسخ + **QR code** + معاينة سوشيال + روابط واتساب/انستجرام.
- نموذج التواصل ينشئ `Lead` + إشعار فوري للمدرب.
- **كل زيارة تُسجَّل في `PageView`** — تظهر للمدرب وللأدمن.
- زر «اشترك مع المدرب» → `/join/{username}`.
- علامة «مدعوم من CoachMate» تظهر إلا لو flag `builder.remove_branding` مفعّل.

### 10.3 دليل المدربين — `/{locale}/coaches`

**بطاقة كل مدرب:** الصورة · الاسم · شرائح التخصصات · **سنوات الخبرة** · **عدد الشهادات المعتمدة** · **عدد المشتركين** · الدولة · «يبدأ من {سعر}» · شارتا «معتمد» و«مميّز».

**فلاتر الزائر:** التخصص (متعدد) · الدولة · سنوات الخبرة (مدى) · يدرّب رجال/سيدات/الاثنين · لديه شهادات معتمدة · نطاق السعر · اللغة · التقييم.
**الترتيب:** الأكثر اشتراكًا / الأعلى تقييمًا / الأكثر خبرة / الأحدث — و**«المميّز» أولًا دائمًا**.

**الأداء (حرج):**
- الحالة **في الـ URL** (قابلة للمشاركة وصديقة للـ SEO) عبر `lib/list-params.ts`.
- **الفلترة على أعمدة مُحدَّثة مسبقًا على `TrainerProfile`** — لا تجميع وقت القراءة أبدًا. العدّادات تُحدَّث عند حدث الاعتماد/الاشتراك/الإلغاء.
- `sitemap.xml` يضم كل بروفايل.

**الحركة:** كشف متدرّج للبطاقات + **انتقال `layoutId` مشترك** من البطاقة إلى `/c/{username}` — التفصيلة اللي بتخلي التجربة تبان مصنوعة مش مركّبة.

---

## 11. رحلة المتدرب والمحفظة

### 11.1 `/{locale}/join/{username}` — أربع خطوات

```
اختيار الباقة → استبيان الالتحاق (Stepper) → مراجعة → رفع وصل → قيد المراجعة
```

**الاستبيان** (`TraineeIntake`، ~٣٠ حقل — القسم 4.4): الهدف، الوزن الحالي والمستهدف، الطول، النوع، تاريخ الميلاد، مستوى النشاط، رياضي؟ نوع الرياضة ومستواها، أيام وأوقات التدريب، مكان التدريب، الأدوات، الإصابات، الحالات الطبية، الأدوية، الحساسية، تفضيل النظام الغذائي، أطعمة مكروهة، عدد الوجبات، النوم، الماء، التدخين، نظام العمل، مستوى التوتر، سنوات الخبرة.

> **وقت الإرسال تُحسب وتُخزَّن `bmi, bmr, tdee, calorieTarget, proteinG, carbsG, fatG`.** دي مرجع حكم الوجبة لاحقًا.

### 11.2 المحفظة — `lib/wallet.ts`

**عند موافقة الأدمن على وصل اشتراك متدرب، داخل معاملة واحدة (transaction):**

1. تفعيل اشتراك المتدرب.
2. قيد **`CREDIT`** بقيمة `amount − commissionAmount` إلى **`pendingBalance`** مع `availableAt = now + payout.hold_days` (افتراضي 7 أيام).
3. قيد **`COMMISSION_FEE`** مرجعي يغذّي تقرير الأرباح.
4. إشعار: «دخل حسابك {مبلغ}، متاح للسحب في {تاريخ}».

**Cron يومي** ينفّذ `HOLD_RELEASE` للمبالغ الناضجة (`pendingBalance` → `balance`)، **مع فحص كسول عند فتح المحفظة** تحسّبًا لتعطّل الـ cron.

**التحقق قبل إنشاء طلب سحب — ست شروط:**
```
payout.enabled  ·  !wallet.isFrozen  ·  amount ≤ balance
amount ≥ payout.min_amount  ·  amount ≤ payout.max_per_request
مجموع الشهر ≤ payout.max_per_month  ·  لا يوجد طلب PENDING آخر
```
عند الإنشاء **يُخصم المبلغ فورًا** إلى المحجوز (منع السحب المزدوج)، وعند الرفض يُعاد.

**الدقة:** كل المبالغ `Decimal` بعملة صريحة. **لا خلط عملات داخل محفظة واحدة.**

**قسم الأدمن `/admin/payouts`:** طلبات السحب (بيانات التحويل تُفكّ عند الفتح فقط + قيد تدقيق، رفع **إثبات التحويل**) · أرصدة كل المدربين · **تسوية يدوية بسبب إلزامي** · إعدادات الحدود · **تقرير الالتزامات** · تجميد محفظة.

### 11.3 بوابة المتدرب — `/my/*` (٨ شاشات)

`/my` (تمرين اليوم + ميزانية السعرات + الالتزام) · `/my/program` · `/my/nutrition` · `/my/scan` · `/my/measurements` · `/my/messages` · `/my/subscription` · `/my/notifications`

---

## 12. طبقة الذكاء الاصطناعي

### 12.1 الباب الوحيد — `lib/ai/client.ts`

**كل نداء AI في المنتج بيمرّ من `runAi()`. مفيش استثناء.**

```ts
export interface RunAiInput<T> {
  trainerId: string;
  userId: string;
  /** صاحب الأعلام. الافتراضي userId؛ نداء يبدأه متدرب
      يمرّر معرّف المدرب — المتدرب ملوش خطة أصلًا. */
  flagUserId?: string;
  feature: string;
  flag: string;
  call: (client, model) => Promise<{ parsed: T; inputTokens: number; outputTokens: number }>;
}
```

التسلسل الملزم: **فحص الـ flag → التحقق من الحصة → النداء → كتابة صف `AiUsage` → حساب التكلفة**.
الحصة **تُتحقَّق قبل** النداء و**تُستهلك بعده**. **الفشل كمان بيكتب `AiUsage`** بـ`success: false` وتكلفة صفر — عشان معدل الفشل يبقى مقيس.

**النموذج:** `claude-opus-5` · مخرجات مهيكلة (structured outputs) · سعر افتراضي $5/$25 لكل مليون توكن قابل للتعديل من الإعدادات.

### 12.2 تحليل صور الأكل — `lib/ai/food-scan.ts`

```
كاميرا (<input capture>)
  → sharp: .rotate() ثم تصغير ≤1568px + نزع EXIF
  → فحص flag ai.food_scan + الحد اليومي ai.food_scan.daily (5)
  → نداء رؤية بمخرج مهيكل
  → قائمة مكوّنات بالجرامات والسعرات والماكروز ودرجة ثقة
  → تخزين FoodScan + AiUsage
  → ⚠️ الحكم يُحسب في الكود، مش في الموديل
```

> **الترتيب مهم:** `.rotate()` **قبل** الـ resize. نزع الـ EXIF بيمسح اتجاه الصورة، فصورة موبايل بتتقلب ٩٠ درجة والموديل بيحلل طبق مقلوب.

**قواعد:**
- **الـ prompt بيمنع الموديل صراحةً من الحكم على الوجبة.** الحكم من `judgeMeal()` في الكود عشان يبقى قابل للاختبار والتفسير.
- **المتدرب يصحّح الجرامات → إعادة حساب خطية محليًا بلا نداء AI جديد** (`rescaleItem`).
- **الخصوصية:** يُرسَل للموديل الصورة + JSON مختصر بالأهداف فقط. **بلا اسم ولا بيانات شخصية.**
- **درجة الثقة الإجمالية موزونة بحصة السعرات** لا بمتوسط بسيط — صنف بـ٥ سعرات مش زي صنف بـ٦٠٠.
- **من يدفع:** رصيد AI الخاص بخطة **المدرب**، مع حد يومي لكل متدرب. التكلفة تظهر منسوبة للمدرب في تقرير الأرباح — وده بيخليها **سبب ترقية** لا عبء على المنصة.
- **إخلاء مسؤولية ظاهر:** تقديري وليس طبيًا.

**الواجهة:** معاينة فورية → حالة «بحلّل…» بـshimmer ونبض → بطاقة نتيجة فيها **حلقات ماكروز** + تفصيل لكل صنف بجرامات قابلة للتعديل + شريط حكم ملوّن + زر «أضِف ليومي».

### 12.3 التوليد — `lib/ai/generate.ts`

توليد برنامج تدريبي ونظام غذائي. **الموديل بيختار التمارين والأطعمة بالـ id من مكتبة مُمرَّرة له** — مش بيخترع أسماء. المخرج **مسودة تُعرض للمدرب للمراجعة قبل الحفظ** (human-in-the-loop).

---

## 13. محرك التغذية — `lib/nutrition.ts`

دوال **نقيّة بالكامل** ومغطّاة باختبارات. دي مرجع الحكم في كل المنتج.

### 13.1 المعادلات (قيم فعلية)

**BMR — Mifflin-St Jeor:**
```
base = 10×الوزن(كجم) + 6.25×الطول(سم) − 5×العمر
ذكر:  base + 5        أنثى: base − 161
```

**TDEE** = `BMR × معامل النشاط`:
| المستوى | المعامل |
|---|---|
| SEDENTARY | 1.2 |
| LIGHT | 1.375 |
| MODERATE | 1.55 |
| HIGH | 1.725 |
| ATHLETE | 1.9 |

**هدف السعرات** = `TDEE × (1 + تعديل الهدف)`:
| الهدف | التعديل |
|---|---|
| LOSE_FAT | **−20%** |
| BUILD_MUSCLE | **+10%** |
| STRENGTH / ENDURANCE | +5% |
| RECOMP / GENERAL_HEALTH / REHAB | 0% |

> التعديلات محافظة عمدًا. أي رقم أعنف = ادّعاء تغذوي المنتج ملوش حق يعمله لوحده.

**الماكروز** — **البروتين مربوط بوزن الجسم مش بنسبة من السعرات:**
| الهدف | بروتين ج/كجم | حصة الدهون من الباقي |
|---|---|---|
| LOSE_FAT | 2.2 | 30% |
| RECOMP | 2.2 | 28% |
| BUILD_MUSCLE | 2.0 | 25% |
| STRENGTH | 2.0 | 28% |
| REHAB | 1.8 | 30% |
| ENDURANCE | 1.6 | 25% |
| GENERAL_HEALTH | 1.6 | 30% |

الكربوهيدرات = الباقي. `KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 }`.

> **ليه البروتين بالوزن؟** نسبة مئوية من هدف تنشيف منخفض بتسيب بروتين قليل جدًا لحماية الكتلة العضلية — ده عيب أغلب الأنظمة المولّدة آليًا.
> **حماية إلزامية:** لو البروتين لوحده تجاوز هدف السعرات، **ثبّت عند صفر** بدل ما تطلع كربوهيدرات سالبة.

### 13.2 حكم الوجبة — `judgeMeal()`

```
expectedShare  = هدف السعرات ÷ عدد الوجبات
remainingAfter = الهدف − المستهلك اليوم − سعرات الوجبة
deviation      = (سعرات الوجبة − expectedShare) ÷ expectedShare
VERDICT_TOLERANCE = 0.10
```

**ترتيب القرار — الترتيب نفسه جزء من المواصفة:**

```
1. صنف يمنعه المدرب أو يخالف تفضيله   → OFF_PLAN
2. dailyTarget ≤ 0                     → FITS   ← ⚠️ حرج، اقرأ تحت
3. remainingAfter < 0                  → OVER
4. deviation > +10%                    → OVER
5. deviation < −10% والهدف بناء/قوة    → UNDER
6. غير ذلك                             → FITS
```

> ⚠️ **الشرط رقم 2 هو أخطر سطر في الملف كله.** من غيره: متدرب بيانات ملفه ناقصة → `dailyTarget = 0` → `remainingAfter` سالب دايمًا → **كل وجبة يصوّرها بيتقاله سعراتك عالية**. اتهام مبني على بيانات ناقصة، والمستخدم بيصدّقه. اكتشفته بتجربة حقيقية في المتصفح، والـ typecheck والـ lint عدّوه بنجاح تام.
> **الشرط 5** بيقول إن الأكل الأقل من المتوقع مش مشكلة تستاهل تنبيه لو الهدف تنشيف.

### 13.3 صياغة الرسالة — `lib/verdict.ts`

**الرسالة النهائية تُصاغ في الكود، مش من الموديل** — عشان نفس الوجبة تدّي نفس الكلمات بالظبط في كل مرة. رسالة مختلفة لكل حكم × كل هدف، **ورسالة منفصلة تمامًا لحالة «ملفك ناقص»** بدل ادّعاء أي حكم.

---

## 14. نظام التصميم

**«أهم شيء في المشروع كله الـ UI/UX».** التصميم يُبنى **كنظام مكتوب أولًا**، وكل شاشة تتولّد منه — لا تصميم مرتجل لكل صفحة.

### 14.1 مفهوم البراند

CoachMate = **الرفيق المحترف**: قوة بلا صراخ، دفء بلا طفولية. **الهروب من كليشيه الجيم** (أسود + أخضر نيون + صور عضلات) نحو مظهر **رياضي-تحريري**: مساحات واسعة، طباعة قوية، لون أرضي دافئ، وتفاصيل صغيرة متكرّرة تصنع التوقيع.

### 14.2 اللوحة اللونية

| الدور | فاتح | داكن |
|---|---|---|
| `--brand` | `#0F7A5E` أخضر صنوبري عميق | `#2FA383` |
| `--brand-accent` | `#E8913A` كهرماني | `#F0A455` |
| `--bg` | `#F8F6F1` **عاجي دافئ** | `#0C1512` أخضر شبه أسود |
| `--surface` | `#FFFFFF` | `#131F1B` |
| `--ink` | `#0B1F1A` | `#EAF1EE` |
| `--muted` | `#5C6B66` | `#93A39D` |

- **العاجي بدل الأبيض الصافي** هو أول ما بيميّز المنصة بصريًا عن بحر منتجات الـ SaaS.
- **لا أسود صافٍ ولا أبيض صافٍ** — إجهاد بصري أقل.
- `success/warning/danger/info` **tokens منفصلة، مش مشتقة من البراند**.
- كل قيمة **CSS custom property** يقودها `AppSetting` → الأدمن يغيّر الهوية بلا كود، والوضع الداكن يحوّل **الأدوار** لا الألوان.
- **لوحة الرسوم منفصلة عمدًا** ومتحقَّق منها لعمى الألوان: `#1baf7a, #2a78d6, #eb6834, #4a3aa7` فاتح · `#199e70, #3987e5, #d95926, #9085e9` داكن.
- **تباين إلزامي:** نص عادي ≥ 4.5:1، كبير ≥ 3:1، حدود تفاعلية ≥ 3:1. **مُختبَر آليًا** في `tests/design-tokens.test.ts`.

### 14.3 الطباعة

- **العناوين: `Readex Pro`** — عربي/لاتيني من تصميم واحد، هندسي دافئ، **وغير مستهلك زي Cairo/Tajawal**.
- **النصوص: `IBM Plex Sans Arabic`** — قراءة عالية في الأحجام الصغيرة والجداول.
- **الأرقام: `tabular-nums` دائمًا** في الجداول والـKPIs، بأرقام لاتينية عبر `ar-EG-u-nu-latn`.
- **self-hosted** عبر `next/font/local` من woff2 داخل المستودع. بلا CDN، بلا FOUT، CLS ≈ 0.
- سلّم modular (1.25) بـ`clamp()`. **للعربي: `line-height` أوسع (1.75 نص / 1.2 عناوين) و`letter-spacing: 0`** — الـ tracking السالب بيشوّه العربي.

### 14.4 العناصر التوقيعية

- **`StatRing`** — حلقة تقدّم متكرّرة عبر المنتج كله: حصص الخطة، التزام المتدرب، اكتمال الملف، ماكروز الوجبة. **تكرارها هو اللي بيصنع هوية.**
- **خلفية Contour** (خطوط تضاريس SVG خفيفة) تعني «الرحلة/التقدّم» — في الـhero والحالات الفارغة.
- صور شخصية **squircle** بشارة اعتماد، وشرائح تخصص بلون مشتق.
- بطاقات نصف قطرها 18px، **ظلال متعدّدة الطبقات ناعمة بدل الحدود الصلبة**.
- **حالات فارغة مرسومة (SVG inline)** لكل قسم.

### 14.5 الحركة — `lib/motion.ts`

**مدد موحّدة:** 120ms (micro) · 220ms (عنصر) · 380ms (انتقال صفحة). Easing واحد `cubic-bezier(.32,.72,0,1)` + spring للسحب.

| النمط | التطبيق |
|---|---|
| **Stagger reveal** | شبكات البطاقات، 60ms بين العناصر، مرة واحدة عبر `useInView` |
| **Shared layout (`layoutId`)** | بطاقة الدليل ⇄ صفحة `/c/{username}` |
| **AnimatedNumber** | كل KPI بيعدّ تصاعديًا عند أول ظهور |
| **السحب** | رفع + ظل + خط إدراج + ارتداد |
| **Optimistic UI** | skeleton → مؤشر → علامة صح + toast قابل للتراجع |
| **انتقال الصفحات** | `template.tsx`: fade + رفع 8px |
| **حالة التحليل** | shimmer + نبض على الصورة |

**إلزامي:** `prefers-reduced-motion` → **كل شيء يختصر إلى opacity فقط**.
**الأداء:** `transform`/`opacity` فقط. **بلا حركة على عناصر فوق الطية** تؤخّر LCP.

### 14.6 مكتبة المكوّنات

**الأساس:** Alert · Avatar · Badge · Button · Card · Checkbox · Dialog · DropdownMenu · Input · Label · Select · Separator · Skeleton · Switch · Table · Tabs · Toaster
**التوقيعية:** **StatRing/MacroRings** · **AnimatedNumber** · **Reveal** · **Stepper** · **EmptyState** · **ChipSelect** · FilterBar · CoachCard · FileDropzone · ReceiptPreview · MoneyPill · MacroBar · Marquee

---

## 15. i18n و RTL

- `next-intl v4` + مقطع `[locale]`، القيم `ar | en`، **الافتراضي `ar`**.
- `dir="rtl"` على `<html>` للعربية.
- **منطق اتجاهي فقط:** `ms-/me-/ps-/pe-/text-start/text-end`. **ممنوع `ml-/mr-/left/right`.**
- انعكاس الأيقونات الاتجاهية **وانعكاس اتجاه الحركة نفسها** في RTL.
- **الأرقام لاتينية دائمًا** حتى في العربية (`ar-EG-u-nu-latn`) — الأرقام الهندية بتربك في السياق المالي.
- التواريخ والعملات عبر `Intl` بالـlocale الصحيح.
- **المحتوى ثنائي اللغة في الداتابيز** حقول `Json{ar,en}`: أسماء الخطط والتمارين والأطعمة والصفحات الثابتة وأسباب الأحكام.

---

## 16. معايير القبول

**«الميزة اتبنت» = «الاختبار بتاعها بيعدّي». مش «الكود موجود».**

### 16.1 اختبارات إلزامية (Vitest — بداتابيز حقيقية لا mocks)

| الملف | يثبت |
|---|---|
| `data-isolation.test.ts` | **مدرب (أ) لا يقرأ/يعدّل/يحذف أي كيان لمدرب (ب) عبر كل server action** |
| `rls.test.ts` | السياسات **نافذة فعلًا** — و**أول assertion: الدور غير معفيّ** |
| `wallet.test.ts` | `balance + pending == Σ(القيود)` · الحدود الستة · منع السحب المزدوج |
| `nutrition.test.ts` | BMR/TDEE/الهدف لحالات مرجعية · الماكروز لكل هدف · **الحكم عند حدود ±10% وعند `dailyTarget = 0`** |
| `billing.test.ts` | `addInterval` لكل فترة · **التجديد المبكر يمدّ من `endsAt` لا من اليوم** |
| `food-scan.test.ts` | إعادة الحساب الخطية · الثقة الموزونة · تحضير الصورة |
| `trainer-gate.test.ts` | كل حالة في آلة الحالة |
| `crypto.test.ts` | التشفير/الفك · **بما فيه القيمة الفارغة** |
| `referrals.test.ts` | المكافأة تُمنح **مرة واحدة** وتمتدّ من `endsAt` |
| `auth-recovery.test.ts` | التوكن مهشَّم · صالح ساعة · يحرق إخوته · لا يكشف وجود البريد |
| `design-tokens.test.ts` | نسب التباين لكل token في الوضعين |
| `intake-schema.test.ts` / `register-schema.test.ts` | تحقق Zod |

### 16.2 E2E (Playwright) — الرحلة الكاملة

```
تسجيل مدرب → شهادات → اعتماد الأدمن → اختيار خطة → رفع وصل → تفعيل
→ بناء برنامج → بناء لاندينج ونشرها
→ زائر يفتح /ar/coaches ويفلتر بالتخصص وسنوات الخبرة ويضغط على المدرب
→ /ar/c/{username} → اشتراك: باقة → استبيان → وصل → اعتماد الأدمن
→ ظهور المبلغ في محفظة المدرب كـ«محجوز»
→ طلب سحب فوق الحد يُرفض وتحت الحد يُقبل → الأدمن يعتمده ويرفع الإثبات
→ دخول المتدرب: تسجيل تمرين + قياس + رفع صورة وجبة والحصول على حكم
```

### 16.3 التحقق البصري

لقطات لكل لوحة في `/ar` و`/en` × فاتح وداكن × **390px و1024px و1600px** · فحص تباين لكل token · تشغيل بـ`prefers-reduced-motion: reduce` والتأكد إن **مفيش حاجة بتتحرك غير الشفافية** · **Lighthouse: LCP ≤ 2.5s و CLS ≤ 0.1** على الرئيسية والدليل.

### 16.4 قاعدة تحقق حاكمة

> **كل مرحلة تُتحقَّق في متصفح حقيقي، مش على الـ typecheck.**
> أربعة من أخطر ستة أخطاء في المشروع ده (القسم 18) كانت **بتعدّي typecheck وlint وكل الاختبارات بنجاح تام** — واتكشفت بالتشغيل والنقر فقط.

---

## 17. ترتيب البناء — ١١ مرحلة

**مرحلة واحدة في كل مرة. متفتحش مرحلة قبل ما اللي قبلها تعدّي `typecheck + lint + build + test` وتتشاف في المتصفح.**

| # | المرحلة | تُعتبر منجزة عندما |
|---|---|---|
| **1** | **الأساس** — Next.js + Prisma (الاسكيما كاملة) + Auth.js + i18n/RTL + UI kit + seed | التسجيل والدخول يشتغلوا، `/ar` و`/en` صح |
| **2** | **لوحة الأدمن — الهيكل** — التفعيلات، المدربون، الخطط، المدفوعات، Flags، الإعدادات، التدقيق، تصدير CSV | الأدمن يعتمد مدربًا فعلًا |
| **3** | **نظام التصميم** — tokens، الخطوط، الحركة، المكوّنات التوقيعية، `/admin/design` | دليل الأسلوب الحي شغّال واختبار التباين بيعدّي |
| **4** | **تسجيل المدرب والاعتماد** — التسجيل، الشهادات، صفحة الانتظار | الرحلة من التسجيل للاعتماد كاملة |
| **5** | **الاشتراكات** — اختيار الخطة، الدفع اليدوي، الفوترة، الحصص، cron التجديد | المدرب المعتمد يوصل لوحته باشتراك حقيقي |
| **6** | **نواة التدريب** — **حارس «قريبًا» و404 أولًا** · المتدربون · التمارين · البرامج · التغذية · الباقات · `lib/nutrition.ts` | **لا رابط مكسور في أي قائمة** · اختبار العزل بيعدّي |
| **7** | **باني الصفحات + `/c/{username}`** | صفحة منشورة بـSEO وOG · نموذج ينشئ Lead · الزيارة تُسجَّل |
| **8** | **الدليل + رحلة المتدرب** — `/coaches` بالفلاتر · `/join/{username}` · الاستبيان | الرحلة من الدليل للاشتراك كاملة |
| **9** | **المحفظة والسحوبات** | الرصيد يدخل عند الاعتماد · اختبار الثابتة بيعدّي |
| **10** | **بوابة المتدرب + AI** — البوابة كاملة + **تحليل صور الأكل** + التوليد + التكلفة | المتدرب يصوّر وجبة وياخد حكم مبني على هدفه |
| **11** | **الإتمام** — البريد · الإحالة · **RLS** · استعادة السر · حد المحاولات · المراسلة · الصفحات القانونية · E2E · `/admin/system` | كل اختبارات القسم 16 بتعدّي |

**كل مرحلة = كوميت مستقل + لقطات شاشة.**

---

## 18. المصايد — ١٤ خطأ حقيقي وقعت فيها

**اقرأ ده قبل ما تبدأ.** كل واحد من دول عدّى الـ typecheck والـ lint بنجاح تام.

### 18.1 🔴 RLS كان مُعطّلًا بالكامل وأنا فاكره شغّال
السياسات متسطبة صح، والاختبارات **بتفشل ٦ من ١١**. السبب: دور الداتابيز كان `rolsuper = t`. **بوستجرس بيعفي الـ superuser من كل سياسة في صمت.** كان هيعدّي على أي جهاز دوره عادي وأنا مصدّق إن العزل شغال.
**العلاج:** الدور `NOSUPERUSER NOBYPASSRLS` + فحص في `/admin/system` + **أول assertion في ملف الاختبار** + دور خاص للـ CI.

### 18.2 🔴 `zodOutputFormat` بيكسر مع Zod 3
الـ SDK بيستورد `zod` من جذر المشروع وبينادي `z.toJSONSchema` اللي موجودة في **Zod 4 بس**. المشروع على Zod 3.25 (وZod 4 موجودة في `zod/v4`).
**العلاج:** أعِد تنفيذ `outputFormat()` مقابل `zod/v4` صراحةً + `transformJSONSchema` من الـ SDK.
**النتيجة الملزمة:** سكيماتك في `lib/ai/*` بقت **Zod 4**، **وممنوع تتداخل جوّه سكيما Zod 3**. تحقق من المسودات بسكيماتها الخاصة.

### 18.3 🔴 حكم الوجبة كان بيتّهم متدربًا ملوش هدف
`dailyTarget = 0` → `remainingAfter < 0` دايمًا → **كل وجبة OVER**. اقرأ 13.2.

### 18.4 🔴 رسالة خطأ Anthropic الخام وصلت للمستخدم
`toActionError` كان بيمرّر رسالة الاستثناء زي ما هي، فظهر JSON بـ401 في الـ toast.
**العلاج:** خلّي `aiError()` **كليّة** — ترجع اعتذارًا عامًا لأي حاجة مش متعرَّف عليها.

### 18.5 🔴 كل الإحالات كانت بتضيع بصمت
`?ref=` كان بيتقرا في `useState` initializer محروس بـ`typeof window` → بيرجع `''` على السيرفر، **وReact مش بتعيد تشغيل الـ initializers عند الـ hydration**.
**العلاج:** اقراه في `useEffect`.

### 18.6 🔴 كلمة السر ظهرت في الـ URL
نموذج الدخول من غير `method` → الإرسال **قبل الـ hydration** بيبقى GET، والباسورد بيروح في شريط العنوان وسجلات السيرفر.
**العلاج:** `method="post"` على كل نموذج حساس. دايمًا.

### 18.7 🔴 مسح أي سرّ إداري بيكسّر أربع صفحات بـ500
`encryptSecret('')` بيدّي نص مشفّر فاضي، و`decryptSecret` كان بيرفضه بـ`!dataHex`.
**العلاج:** `dataHex === undefined` مش `!dataHex` + رجوع للقيم الافتراضية.

### 18.8 🟠 حد المحاولات كـ Map في الذاكرة = مش موجود
بيتصفّر مع كل نشر، وبيفشل تمامًا مع أكتر من عملية. **خزّنه كصفوف.**

### 18.9 🟠 `.rotate()` لازم قبل الـ resize
نزع الـ EXIF بيمسح الاتجاه → صور الموبايل بتتقلب ٩٠ درجة والموديل بيحلل طبق مقلوب.

### 18.10 🟠 حالة الاعتماد من الـ JWT = بوابة مكسورة
الـ claims لقطة وقت الدخول. المدرب اللي اتعتمد لسه توكنه بيقول `PENDING`. **اقرأ من الداتابيز.**

### 18.11 🟠 `AiUsage` لازم يتكتب عند الفشل كمان
لو الفشل مش بيتسجّل، «معدل الفشل» في لوحة الأدمن بيبقى صفر دايمًا وهو كذب.

### 18.12 🟠 الفحص المتزامن الأول بيسرق مكافأة الإحالة مرتين
**العلاج:** اطلب حق المكافأة بـ`updateMany` مشروط **قبل** ما تلمس الاشتراكات، وامتدّ من `endsAt` الحالي مش من النهارده.

### 18.13 🟡 وحدات تستورد `next-auth` مش قابلة للاختبار
Vitest مش هيقدر يحمّلها. **افصل الدوال النقيّة** (`password.ts` بعيد عن `auth.ts`).
وكمان: **Vitest مش بيحمّل `.env` تلقائيًا** — محتاج `setupFiles`.

### 18.14 🟡 عدّادات الدليل تُحدَّث عند الحدث لا عند القراءة
`COUNT(*)` وقت قراءة الدليل بيموت عند أول ٥٠٠ مدرب. حدّث الأعمدة عند الاعتماد/الاشتراك/الإلغاء.

---

## 19. النشر

**بنية بسيطة تكفي أول بضع مئات من المدربين:** صندوق واحد، Ubuntu 22.04/24.04، التطبيق والداتابيز مع بعض.

| المكوّن | التفصيل |
|---|---|
| **Runtime** | Node 22 + pnpm + systemd unit |
| **DB** | PostgreSQL 16 — **الدور `NOSUPERUSER NOBYPASSRLS`** |
| **Proxy** | nginx + certbot، `client_max_body_size 15m`، `X-Forwarded-For` |
| **التخزين** | `/srv/app/shared/uploads` مرتبط رمزيًا للـ checkout → **بيعيش بعد كل نشر** |
| **البيئة** | `/srv/app/shared/.env` بصلاحية 600، خارج الـ checkout |
| **Cron** | يومي: انتهاء الاشتراكات + تنبيهات ٧/٣/١ + `HOLD_RELEASE` — محميّ بـ`CRON_SECRET` |
| **CI/CD** | GitHub Actions: verify (migrate + seed + typecheck + lint + test + build) ثم deploy عبر SSH |
| **النشر** | fetch → reset → migrate deploy → build → restart → **فحص صحة** → **رجوع تلقائي للكوميت السابق عند الفشل** |

**قواعد إلزامية:**
- الـ CI **يعمل دوره الخاص** `NOSUPERUSER NOBYPASSRLS` — تشغيله كـ`postgres` بيخلي اختبارات RLS تعدّي وهي مش بتثبت حاجة.
- `prisma migrate deploy` **أبدًا مش `migrate dev`** في الإنتاج.
- **مفتاح النشر يتولّد على السيرفر** ويروح لأسرار GitHub مباشرة، **ومبيعديش على أي محادثة**.
- **نسخ احتياطي يومي للداتابيز منقول خارج الصندوق.** نسخة عايشة على نفس الجهاز اللي بتنسخه مش نسخة احتياطية.

**متغيرات البيئة:**
```
DATABASE_URL · AUTH_SECRET · SETTINGS_ENCRYPTION_KEY (32 بايت hex)
CRON_SECRET · NEXT_PUBLIC_APP_URL · STORAGE_DRIVER (local|s3)
S3_* (عند الحاجة)
```
> **مفتاح Anthropic مش في `.env`** — في `AppSetting` مشفّر، عشان الأدمن يغيّره من اللوحة بلا نشر.

---

## 20. خارج النطاق (Backlog)

| البند | السبب |
|---|---|
| بوابات دفع آلية (Kashier/Ziina) | الواجهة مبنية، التنفيذ مؤجّل. الدفع اليدوي شغّال |
| واتساب API | تكلفة واعتماد مقابل قيمة أقل من الدليل |
| تطبيق موبايل أصلي | الويب متجاوب وبيدعم الكاميرا |
| بيئة staging | صندوق تاني — لما كل نشر لبرودكشن يبطّل يبقى مقبول |
| نشر بلا انقطاع | `restart` بيقطع ثوانٍ. عمليتين خلف nginx بيحلّوها، وصندوق واحد مبيبررش ده |
| شحن السجلات وتنبيهات التعطّل | `journalctl` على الصندوق هو كل اللي موجود |
| تقييمات المتدربين للمدربين | الحقول موجودة (`ratingAvg`, `ratingCount`)، الواجهة لأ |
| نطاقات مخصصة للـ Elite | الـ flag موجود، التوجيه لأ |

---

## 21. ملخص تنفيذي في عشرة سطور

1. **ثلاثة أدوار ببيانات معزولة بثلاث طبقات مستقلة** — الحرّاس، امتداد Prisma، وPostgreSQL RLS.
2. **الأدمن يتحكم في كل كيان ويشوف كل رقم منفصلًا** — بما فيه **هامش الربح لكل خطة ولكل مدرب**.
3. **المدرب يمرّ ببوابة إجبارية:** اعتماد ← شهادات ← خطة ← دفع ← تفعيل.
4. **الدفع يدوي بوصل ومراجعة**، خلف واجهة مزوّد مجرّدة جاهزة للبوابات الآلية.
5. **المحفظة دفتر أستاذ append-only** بثابتة مُختبَرة، والفلوس تدخل بالصافي بعد العمولة مع حجز ٧ أيام.
6. **باني الصفحات و`/c/{username}` والدليل** هم محرّك النمو، مش ميزات إضافية.
7. **الذكاء الاصطناعي بيمرّ من باب واحد** بحصة وتكلفة مقيسة، و**تحليل صور الأكل حكمه محسوب في الكود** مش في الموديل.
8. **محرك التغذية دوال نقيّة مُختبَرة** — Mifflin-St Jeor، البروتين بالوزن مش بالنسبة، وتسامح ±10%.
9. **التصميم نظام مكتوب** بلوحة عاجية-صنوبرية وخطوط عربية مميّزة وحركة موحّدة المدد، مش تصميم لكل شاشة.
10. **الميزة مبنية لما اختبارها يعدّي وتتشاف في متصفح حقيقي** — مش لما الكود يكمبايل.

---

*الوثيقة دي مستخرجة من نظام عامل: ~٧٥ موديل، ٤٣ شاشة، ٥٦ وحدة خدمة، ١٢ ملف اختبار، و٧ migrations.*
