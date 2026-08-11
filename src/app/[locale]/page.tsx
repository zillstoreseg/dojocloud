import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, BarChart3, Bot, CreditCard, Globe, Sparkles, Users } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getBrand } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { planPrice, formatMoney } from '@/lib/money';

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

  const plans = await prisma.plan.findMany({
    where: { isActive: true, isPublic: true },
    orderBy: { sortOrder: 'asc' },
    take: 4,
  });

  const features = [
    { icon: Users, ar: 'إدارة كاملة للمتدربين', en: 'Complete trainee management', descAr: 'ملف لكل متدرب، برامجه، تغذيته، قياساته، وتاريخ تجديده في مكان واحد.', descEn: 'Every trainee’s profile, program, nutrition, measurements and renewal date in one place.' },
    { icon: Globe, ar: 'صفحة خاصة بك تجلب لك عملاء', en: 'Your own page that brings clients', descAr: 'ابنِ بورتفوليو احترافي بالسحب والإفلات وشاركه على السوشيال، والزوار يشتركون منه مباشرة.', descEn: 'Build a professional portfolio by drag & drop, share it, and let visitors subscribe from it.' },
    { icon: Bot, ar: 'مساعد ذكاء اصطناعي', en: 'AI assistant', descAr: 'ولّد برامج تدريب وأنظمة تغذية في ثوانٍ، وراجعها وعدّلها قبل الاعتماد.', descEn: 'Generate workout and nutrition plans in seconds, then review and edit before approving.' },
    { icon: CreditCard, ar: 'اشتراكات وتجديدات منظمة', en: 'Organised subscriptions', descAr: 'باقاتك، مدفوعات متدربيك، وتنبيهات التجديد قبل انتهاء الاشتراك.', descEn: 'Your packages, trainee payments, and renewal alerts before subscriptions lapse.' },
    { icon: BarChart3, ar: 'أرقامك واضحة', en: 'Clear numbers', descAr: 'زيارات صفحتك، العملاء المحتملون، ومعدل تحويلهم لمتدربين فعليين.', descEn: 'Page visits, leads, and how many convert into paying trainees.' },
    { icon: Sparkles, ar: 'عربي بالكامل', en: 'Fully Arabic', descAr: 'واجهة عربية RTL بالكامل مع دعم الإنجليزية، مصممة للسوق المصري والخليجي.', descEn: 'A full RTL Arabic interface with English support, built for the Egyptian and Gulf market.' },
  ];

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="text-lg font-bold text-primary">
            {brand.name}
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
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

      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-accent/40 to-background">
        <div className="container flex flex-col items-center gap-6 py-20 text-center md:py-28">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Sparkles className="size-3.5" />
            {isAr ? 'منصة المدربين العرب' : 'The platform for Arab coaches'}
          </Badge>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            {isAr ? brand.taglineAr || 'مدربك معاك في أي وقت' : brand.taglineEn || 'Your coach, anytime'}
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            {isAr
              ? 'أدِر متدربيك، ابنِ صفحتك الخاصة اللي بتجيبلك عملاء جدد، وولّد برامج التدريب والتغذية بالذكاء الاصطناعي — كل ده من مكان واحد.'
              : 'Manage your trainees, build a page that brings you new clients, and generate training and nutrition plans with AI — all in one place.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/register">
                {isAr ? 'ابدأ مجانًا 14 يوم' : 'Start 14 days free'}
                <ArrowLeft className="rtl-flip" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/coaches">{tNav('coaches')}</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {isAr ? 'بدون بطاقة ائتمان — ألغِ في أي وقت' : 'No credit card — cancel anytime'}
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="container py-20">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold">{isAr ? 'كل اللي محتاجه في مكان واحد' : 'Everything you need, in one place'}</h2>
          <p className="mt-2 text-muted-foreground">
            {isAr ? 'مش بس تنظيم — المنصة بتساعدك تكسب أكتر' : 'Not just organisation — the platform helps you earn more'}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.en} className="transition-shadow hover:shadow-md">
              <CardContent className="space-y-3 p-6">
                <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </div>
                <h3 className="font-semibold">{isAr ? f.ar : f.en}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{isAr ? f.descAr : f.descEn}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t bg-muted/30 py-20">
        <div className="container">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold">{tPlans('choosePlan')}</h2>
            <p className="mt-2 text-muted-foreground">{tPlans('choosePlanSubtitle')}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const price = planPrice(plan.prices, 'EGP');
              const highlights = (plan.highlights as { ar?: string[]; en?: string[] } | null) ?? {};
              const items = (isAr ? highlights.ar : highlights.en) ?? [];
              return (
                <Card key={plan.id} className={plan.isPopular ? 'relative border-primary shadow-lg' : 'relative'}>
                  {/* Physical centring works identically in both directions. */}
                  {plan.isPopular ? (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                      {tPlans('mostPopular')}
                    </Badge>
                  ) : null}
                  <CardContent className="space-y-4 p-6">
                    <div>
                      <h3 className="text-lg font-bold">{isAr ? plan.nameAr : plan.nameEn}</h3>
                      <p className="text-sm text-muted-foreground">{isAr ? plan.taglineAr : plan.taglineEn}</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{price === 0 ? (isAr ? 'مجانًا' : 'Free') : formatMoney(price, 'EGP', locale)}</span>
                      {price > 0 ? <span className="text-sm text-muted-foreground">/{tPlans('perMonth')}</span> : null}
                    </div>
                    <ul className="space-y-2 text-sm">
                      {items.map((item) => (
                        <li key={item} className="flex gap-2 text-muted-foreground">
                          <span className="text-primary">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Button className="w-full" variant={plan.isPopular ? 'default' : 'outline'} asChild>
                      <Link href="/register">{tPlans('selectPlan')}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} {brand.name}</p>
          <div className="flex gap-4">
            <Link href="/p/terms" className="hover:text-foreground">{isAr ? 'الشروط' : 'Terms'}</Link>
            <Link href="/p/privacy" className="hover:text-foreground">{isAr ? 'الخصوصية' : 'Privacy'}</Link>
            <Link href="/p/faq" className="hover:text-foreground">{isAr ? 'الأسئلة الشائعة' : 'FAQ'}</Link>
          </div>
        </div>
      </footer>
      <span className="sr-only">{t('appName')}</span>
    </main>
  );
}
