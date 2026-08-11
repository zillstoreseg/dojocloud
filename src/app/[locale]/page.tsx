import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  ArrowLeft,
  BadgeCheck,
  BarChart3,
  Bot,
  Camera,
  Check,
  Globe,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Logo, LogoMark } from '@/components/brand/logo';
import { HeroPanel } from '@/components/marketing/hero-panel';
import { getBrand } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { planPrice, formatMoney, formatNumber } from '@/lib/money';
import { specialtyLabel } from '@/lib/specialties';
import { countryLabel, COUNTRIES } from '@/lib/countries';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [t, tPlans, tNav, brand] = await Promise.all([
    getTranslations('common'),
    getTranslations('plans'),
    getTranslations('nav'),
    getBrand(),
  ]);
  const isAr = locale === 'ar';

  // Everything below the hero is real data, so the marketing page is never a
  // prettier fiction than the product.
  const [plans, coaches, trainerCount, traineeCount, exerciseCount] = await Promise.all([
    prisma.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: { sortOrder: 'asc' },
      take: 4,
    }),
    prisma.trainerProfile.findMany({
      where: { approvalStatus: 'APPROVED', isListed: true },
      orderBy: [{ isFeatured: 'desc' }, { yearsExperience: 'desc' }],
      take: 4,
      select: {
        id: true,
        username: true,
        fullName: true,
        specialties: true,
        yearsExperience: true,
        country: true,
        avatarUrl: true,
        _count: { select: { trainees: true, certificates: true } },
      },
    }),
    prisma.trainerProfile.count({ where: { approvalStatus: 'APPROVED' } }),
    prisma.trainee.count(),
    prisma.exercise.count({ where: { isPublic: true } }),
  ]);

  // Countries we ship localised pricing and dial codes for, minus the
  // "other" catch-all — a real figure, not a marketing round number.
  const countryCount = COUNTRIES.filter((c) => c.code !== 'OTHER').length;

  const pillars = [
    {
      icon: Globe,
      ar: 'صفحتك الخاصة تجيبلك عملاء',
      en: 'A page of your own that brings clients',
      descAr: 'ابنِ بورتفوليو احترافي بالسحب والإفلات على coachmate.app/c/اسمك، وشاركه على السوشيال، والزوار يشتركون منه مباشرة.',
      descEn: 'Build a portfolio by drag & drop at coachmate.app/c/your-name, share it, and let visitors subscribe straight from it.',
      tone: 'primary' as const,
    },
    {
      icon: Wallet,
      ar: 'محفظة تحصّل فلوسك',
      en: 'A wallet that collects your money',
      descAr: 'المتدرب يشترك ويرفع الإيصال، الإدارة تراجع، والمبلغ يدخل محفظتك — وتسحبه وقت ما تحب.',
      descEn: 'Your trainee subscribes and uploads a receipt, admin reviews it, and the money lands in your wallet — withdraw whenever you like.',
      tone: 'brand' as const,
    },
    {
      icon: Camera,
      ar: 'متدربك يصوّر أكله والنظام يحكم',
      en: 'Your trainee photographs a meal, the app judges it',
      descAr: 'صورة واحدة تكفي: سعرات ومكوّنات دقيقة، وحكم فوري هل تناسب هدفه والخطة اللي بعتهاله ولا لأ.',
      descEn: 'One photo is enough: exact calories and contents, plus an instant verdict on whether it fits their goal and your plan.',
      tone: 'primary' as const,
    },
    {
      icon: Users,
      ar: 'كل متدرب في مكان واحد',
      en: 'Every trainee in one place',
      descAr: 'الهدف والقياسات والبرنامج والتغذية وميعاد التجديد — بدون واتساب وإكسل.',
      descEn: 'Goal, measurements, program, nutrition and renewal date — no more WhatsApp and spreadsheets.',
      tone: 'primary' as const,
    },
    {
      icon: Bot,
      ar: 'مساعد ذكاء اصطناعي',
      en: 'AI assistant',
      descAr: 'ولّد برامج تدريب وأنظمة تغذية في ثوانٍ، وراجعها وعدّلها قبل ما تعتمدها.',
      descEn: 'Generate training and nutrition plans in seconds, then review and edit before you approve.',
      tone: 'primary' as const,
    },
    {
      icon: BarChart3,
      ar: 'أرقامك واضحة',
      en: 'Your numbers, clearly',
      descAr: 'زيارات صفحتك، العملاء المحتملون، ونسبة تحويلهم لمتدربين فعليين — رقم رقم.',
      descEn: 'Page visits, leads, and how many convert into paying trainees — figure by figure.',
      tone: 'primary' as const,
    },
  ];

  const steps = [
    {
      ar: 'سجّل وارفع شهاداتك',
      en: 'Sign up and upload your certificates',
      descAr: 'الإدارة تراجع شهاداتك وتعتمد حسابك، فالمتدرب يشوف مدرب موثوق لا مجرد إعلان.',
      descEn: 'We review your certificates and approve your account, so trainees see a verified coach — not an ad.',
    },
    {
      ar: 'ابنِ صفحتك واختر خطتك',
      en: 'Build your page and pick your plan',
      descAr: 'باني صفحات بالسحب والإفلات، وباقاتك وأسعارك أنت اللي تحطها.',
      descEn: 'A drag & drop page builder, with your own packages and prices.',
    },
    {
      ar: 'استقبل مشتركين واقبض',
      en: 'Get subscribers and get paid',
      descAr: 'من دليل المدربين أو من رابطك، والفلوس تدخل محفظتك بعد اعتماد الإيصال.',
      descEn: 'From the coach directory or your own link — and the money lands in your wallet once the receipt clears.',
    },
  ];

  return (
    <main className="min-h-screen">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link href="/" className="text-primary">
            <Logo name={brand.name} />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/coaches">{tNav('coaches')}</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{tNav('login')}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">{tNav('register')}</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border/60">
        {/* Contour motif: the visual shorthand for a journey. */}
        <div className="bg-contour mask-fade-b pointer-events-none absolute inset-0" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" aria-hidden />

        <div className="container relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col items-start gap-6 text-start">
            <Reveal>
              <Badge variant="secondary" className="gap-1.5 border border-border/60 px-3 py-1">
                <Sparkles className="size-3.5 text-brand" />
                {isAr ? 'منصة المدربين العرب' : 'The platform for Arab coaches'}
              </Badge>
            </Reveal>

            <Reveal delay={0.05}>
              <h1 className="max-w-xl text-display-xl font-semibold">
                {isAr ? (
                  <>
                    مدربك معاك{' '}
                    <span className="relative inline-block text-primary">
                      في أي وقت
                      {/* Hand-drawn underline: the one deliberately imperfect
                          stroke in an otherwise precise system. */}
                      <svg
                        className="absolute inset-x-0 -bottom-1 w-full text-brand"
                        viewBox="0 0 200 10"
                        fill="none"
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <path
                          d="M2 7c40-5 90-6 196-3"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </>
                ) : (
                  <>
                    Your coach, <span className="text-primary">anytime</span>
                  </>
                )}
              </h1>
            </Reveal>

            <Reveal delay={0.1}>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
                {isAr
                  ? 'منصة كاملة للمدرب: تدير متدربيك، تبني صفحتك اللي بتجيبلك عملاء جدد، وتقبض فلوسك من محفظتك — ومتدربك يصوّر أكله ويعرف على طول لو مناسب لهدفه.'
                  : 'A complete platform for coaches: manage your trainees, build the page that brings you new clients, and collect your money from your wallet — while your trainee photographs a meal and instantly knows if it fits their goal.'}
              </p>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/register">
                    {isAr ? 'ابدأ مجانًا ١٤ يوم' : 'Start 14 days free'}
                    <ArrowLeft className="rtl-flip" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/coaches">{isAr ? 'تصفّح المدربين' : 'Browse coaches'}</Link>
                </Button>
              </div>
            </Reveal>

            <Reveal delay={0.2}>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="size-4 text-success" />
                {isAr ? 'بدون بطاقة ائتمان — ألغِ في أي وقت' : 'No credit card — cancel anytime'}
              </p>
            </Reveal>
          </div>

          <HeroPanel
            isAr={isAr}
            labels={{
              trainees: isAr ? 'متدربون نشطون' : 'Active trainees',
              wallet: isAr ? 'دخل محفظتك' : 'Landed in your wallet',
              scan: isAr ? 'تحليل وجبة' : 'Meal scan',
              adherence: isAr ? 'الالتزام' : 'Adherence',
              verdict: isAr ? 'مناسبة لهدفك' : 'Fits your goal',
            }}
          />
        </div>
      </section>

      {/* ── Proof strip ────────────────────────────────────────── */}
      <section className="border-b border-border/60 bg-card/50">
        <div className="container grid grid-cols-2 gap-6 py-8 md:grid-cols-4">
          {[
            { value: trainerCount, ar: 'مدرب معتمد', en: 'Verified coaches' },
            { value: traineeCount, ar: 'متدرب', en: 'Trainees' },
            { value: exerciseCount, ar: 'تمرين جاهز', en: 'Ready-made exercises' },
            { value: countryCount, ar: 'دولة مدعومة', en: 'Countries supported' },
          ].map((stat) => (
            <div key={stat.en} className="text-center">
              <p className="font-display text-3xl font-semibold tabular-nums text-primary">
                <AnimatedNumber value={stat.value} locale={locale} />
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{isAr ? stat.ar : stat.en}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pillars ────────────────────────────────────────────── */}
      <section className="container py-20 md:py-28">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <p className="eyebrow">{isAr ? 'ليه CoachMate' : 'Why CoachMate'}</p>
          <h2 className="mt-3 text-display-md font-semibold">
            {isAr ? 'مش بس تنظيم — المنصة بتكسّبك' : 'Not just organisation — it earns for you'}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {isAr
              ? 'كل ميزة هنا موجودة عشان تجيبلك مشترك، أو توفرلك وقت، أو تحصّلك فلوس.'
              : 'Every feature here exists to win you a subscriber, save you time, or collect your money.'}
          </p>
        </Reveal>

        <RevealGroup className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <RevealItem key={pillar.en}>
              <Card className="group h-full transition-all duration-element ease-brand hover:-translate-y-1 hover:shadow-lift">
                <CardContent className="space-y-3 p-6">
                  <div
                    className={
                      pillar.tone === 'brand'
                        ? 'flex size-11 items-center justify-center rounded-md bg-brand/15 text-brand transition-transform duration-element ease-brand group-hover:scale-105'
                        : 'flex size-11 items-center justify-center rounded-md bg-accent text-accent-foreground transition-transform duration-element ease-brand group-hover:scale-105'
                    }
                  >
                    <pillar.icon className="size-5" />
                  </div>
                  <h3 className="text-base font-semibold">{isAr ? pillar.ar : pillar.en}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {isAr ? pillar.descAr : pillar.descEn}
                  </p>
                </CardContent>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section className="border-y border-border/60 bg-card/50 py-20 md:py-24">
        <div className="container">
          <Reveal className="mx-auto mb-14 max-w-2xl text-center">
            <p className="eyebrow">{isAr ? 'ثلاث خطوات' : 'Three steps'}</p>
            <h2 className="mt-3 text-display-md font-semibold">
              {isAr ? 'من التسجيل لأول اشتراك' : 'From sign-up to your first subscriber'}
            </h2>
          </Reveal>

          <RevealGroup className="grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <RevealItem key={step.en} className="relative">
                {/* Connector, drawn only between cards and only on wide screens. */}
                {index < steps.length - 1 ? (
                  <span
                    className="absolute top-6 hidden h-px w-full bg-gradient-to-r from-border to-transparent md:block ltr:start-16 rtl:end-16 rtl:bg-gradient-to-l"
                    aria-hidden
                  />
                ) : null}
                <div className="relative space-y-3">
                  <span className="flex size-12 items-center justify-center rounded-full border-2 border-primary/25 bg-background font-display text-lg font-semibold text-primary">
                    {formatNumber(index + 1, locale)}
                  </span>
                  <h3 className="text-base font-semibold">{isAr ? step.ar : step.en}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {isAr ? step.descAr : step.descEn}
                  </p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── Coach directory teaser ─────────────────────────────── */}
      {coaches.length > 0 ? (
        <section className="container py-20 md:py-28">
          <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <p className="eyebrow">{isAr ? 'دليل المدربين' : 'Coach directory'}</p>
              <h2 className="mt-3 text-display-md font-semibold">
                {isAr ? 'اختر مدربك بالفلاتر' : 'Filter your way to the right coach'}
              </h2>
              <p className="mt-3 text-muted-foreground">
                {isAr
                  ? 'فلتر بالتخصص وسنوات الخبرة والشهادات وعدد المشتركين، وشوف كل بيانات المدرب قبل ما تشترك.'
                  : 'Filter by specialty, years of experience, certificates and subscriber count — and see everything about a coach before you subscribe.'}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/coaches">
                {isAr ? 'كل المدربين' : 'All coaches'}
                <ArrowLeft className="rtl-flip" />
              </Link>
            </Button>
          </Reveal>

          <RevealGroup className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {coaches.map((coach) => (
              <RevealItem key={coach.id}>
                <Link href={`/c/${coach.username}`} className="block h-full">
                  <Card className="h-full transition-all duration-element ease-brand hover:-translate-y-1 hover:border-primary/40 hover:shadow-lift">
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-12 rounded-xl">
                          <AvatarImage src={coach.avatarUrl ?? undefined} alt="" />
                          <AvatarFallback className="rounded-xl bg-accent text-accent-foreground">
                            {coach.fullName.slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1 truncate font-medium">
                            {coach.fullName}
                            <BadgeCheck className="size-4 shrink-0 text-primary" />
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {countryLabel(coach.country, locale)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {coach.specialties.slice(0, 2).map((specialty) => (
                          <Badge key={specialty} variant="muted" className="text-[11px] font-normal">
                            {specialtyLabel(specialty, locale)}
                          </Badge>
                        ))}
                      </div>

                      <dl className="flex items-center gap-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                        <div>
                          <dt className="sr-only">{isAr ? 'سنوات الخبرة' : 'Experience'}</dt>
                          <dd>
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatNumber(coach.yearsExperience, locale)}
                            </span>{' '}
                            {isAr ? 'سنة' : 'yrs'}
                          </dd>
                        </div>
                        <div>
                          <dt className="sr-only">{isAr ? 'مشتركون' : 'Subscribers'}</dt>
                          <dd>
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatNumber(coach._count.trainees, locale)}
                            </span>{' '}
                            {isAr ? 'مشترك' : 'subs'}
                          </dd>
                        </div>
                        <div>
                          <dt className="sr-only">{isAr ? 'شهادات' : 'Certificates'}</dt>
                          <dd>
                            <span className="font-semibold tabular-nums text-foreground">
                              {formatNumber(coach._count.certificates, locale)}
                            </span>{' '}
                            {isAr ? 'شهادة' : 'certs'}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>
      ) : null}

      {/* ── Pricing ────────────────────────────────────────────── */}
      <section className="border-t border-border/60 bg-card/50 py-20 md:py-28">
        <div className="container">
          <Reveal className="mx-auto mb-14 max-w-2xl text-center">
            <p className="eyebrow">{isAr ? 'الأسعار' : 'Pricing'}</p>
            <h2 className="mt-3 text-display-md font-semibold">{tPlans('choosePlan')}</h2>
            <p className="mt-3 text-muted-foreground">{tPlans('choosePlanSubtitle')}</p>
          </Reveal>

          <RevealGroup className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const price = planPrice(plan.prices, 'EGP');
              const highlights = (plan.highlights as { ar?: string[]; en?: string[] } | null) ?? {};
              const items = (isAr ? highlights.ar : highlights.en) ?? [];
              return (
                <RevealItem key={plan.id}>
                  <Card
                    className={
                      plan.isPopular
                        ? 'relative border-primary/50 shadow-lift lg:-mt-4 lg:pb-4'
                        : 'relative'
                    }
                  >
                    {/* Physical centring works identically in both directions. */}
                    {plan.isPopular ? (
                      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 shadow-soft">
                        {tPlans('mostPopular')}
                      </Badge>
                    ) : null}
                    <CardContent className="space-y-4 p-6">
                      <div>
                        <h3 className="text-lg font-semibold">{isAr ? plan.nameAr : plan.nameEn}</h3>
                        <p className="text-sm text-muted-foreground">
                          {isAr ? plan.taglineAr : plan.taglineEn}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-3xl font-semibold tabular-nums">
                          {price === 0
                            ? isAr
                              ? 'مجانًا'
                              : 'Free'
                            : formatMoney(price, 'EGP', locale)}
                        </span>
                        {price > 0 ? (
                          <span className="text-sm text-muted-foreground">
                            /{tPlans('perMonth')}
                          </span>
                        ) : null}
                      </div>
                      <ul className="space-y-2 text-sm">
                        {items.map((item) => (
                          <li key={item} className="flex gap-2 text-muted-foreground">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full"
                        variant={plan.isPopular ? 'default' : 'outline'}
                        asChild
                      >
                        <Link href="/register">{tPlans('selectPlan')}</Link>
                      </Button>
                    </CardContent>
                  </Card>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </div>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────── */}
      <section className="border-t border-border/60">
        <div className="container py-20">
          <Reveal>
            <div className="bg-contour relative overflow-hidden rounded-xl border border-border/60 bg-card px-6 py-14 text-center shadow-soft md:px-12">
              <LogoMark className="mx-auto size-10 text-primary" />
              <h2 className="mt-5 text-display-sm font-semibold">
                {isAr ? 'ابدأ النهارده، وخلي صفحتك تشتغل لك' : 'Start today and let your page work for you'}
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
                {isAr
                  ? '١٤ يوم مجانًا، بدون بطاقة ائتمان. ارفع شهاداتك واتعمد، وابدأ تستقبل مشتركين.'
                  : '14 days free, no credit card. Upload your certificates, get verified, and start taking subscribers.'}
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/register">
                    {tNav('register')}
                    <ArrowLeft className="rtl-flip" />
                  </Link>
                </Button>
                <Button size="lg" variant="ghost" asChild>
                  <Link href="/coaches">{tNav('coaches')}</Link>
                </Button>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-border/60 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <LogoMark className="size-5 text-primary" />
            {/* A year takes no thousands separator. */}
            <p>
              © {new Date().getFullYear()} {brand.name}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/coaches" className="transition-colors hover:text-foreground">
              {tNav('coaches')}
            </Link>
            <Link href="/p/terms" className="transition-colors hover:text-foreground">
              {isAr ? 'الشروط' : 'Terms'}
            </Link>
            <Link href="/p/privacy" className="transition-colors hover:text-foreground">
              {isAr ? 'الخصوصية' : 'Privacy'}
            </Link>
            <Link href="/p/faq" className="transition-colors hover:text-foreground">
              {isAr ? 'الأسئلة الشائعة' : 'FAQ'}
            </Link>
          </div>
        </div>
      </footer>
      <span className="sr-only">{t('appName')}</span>
    </main>
  );
}
