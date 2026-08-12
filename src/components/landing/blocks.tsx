import {
  Award,
  CheckCircle2,
  Dumbbell,
  Instagram,
  Facebook,
  Youtube,
  MessageCircle,
  Music2,
  Quote,
  Star,
  ArrowRight,
} from 'lucide-react';
import type { BlockType } from '@prisma/client';
import { parseBlockProps, type BlockProps } from '@/lib/page-blocks';
import { specialtyLabel } from '@/lib/specialties';
import { countryLabel } from '@/lib/countries';
import { formatMoney, formatNumber } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Reveal } from '@/components/motion/reveal';
import { LeadForm } from './lead-form';
import { FaqList } from './faq-list';
import type { LandingContext, BlockNode } from './context';

/**
 * One renderer per block type, plus a dispatcher.
 *
 * These are server components with no state of their own, which is what lets
 * the builder preview and the published page share them exactly. The two
 * interactive pieces — the lead form and the FAQ accordion — are separate
 * client components so the rest stays static and cheap.
 */

function Section({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('px-5 py-14 md:py-20', className)}>
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </section>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  return (
    <div className="mb-8 space-y-2">
      {title ? <h2 className="font-display text-2xl font-semibold md:text-3xl">{title}</h2> : null}
      {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── blocks ──

function HeroBlock({ props, ctx }: { props: BlockProps['HERO']; ctx: LandingContext }) {
  const { coach, isAr, locale } = ctx;
  const centered = props.align === 'center';

  return (
    <section className="bg-contour relative overflow-hidden px-5 pb-16 pt-14 md:pb-24 md:pt-20">
      <div
        className="pointer-events-none absolute -top-32 start-1/4 size-96 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />
      <div
        className={cn(
          'relative mx-auto flex w-full max-w-4xl flex-col gap-10 md:flex-row md:items-center',
          centered && 'md:flex-col md:text-center',
        )}
      >
        <div className={cn('min-w-0 flex-1 space-y-5', centered && 'md:mx-auto md:max-w-2xl')}>
          <div
            className={cn('flex flex-wrap items-center gap-2', centered && 'md:justify-center')}
          >
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="size-3.5" />
              {isAr ? 'مدرب معتمد' : 'Verified coach'}
            </Badge>
            {coach.yearsExperience > 0 ? (
              <Badge variant="muted">
                {isAr
                  ? `${formatNumber(coach.yearsExperience, locale)} سنوات خبرة`
                  : `${coach.yearsExperience} yrs experience`}
              </Badge>
            ) : null}
          </div>

          <h1 className="font-display text-3xl font-bold leading-tight md:text-5xl">
            {props.headline || coach.fullName}
          </h1>
          {props.subheadline ? (
            <p className="max-w-xl text-lg text-muted-foreground">{props.subheadline}</p>
          ) : null}

          <div className={cn('flex flex-wrap gap-2 pt-1', centered && 'md:justify-center')}>
            {coach.specialties.slice(0, 4).map((s) => (
              <span
                key={s}
                className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
              >
                {specialtyLabel(s, locale)}
              </span>
            ))}
          </div>

          <div className={cn('flex flex-wrap gap-3 pt-2', centered && 'md:justify-center')}>
            <Button size="lg" asChild>
              <a href={props.ctaHref || `#subscribe`}>
                {props.ctaLabel || (isAr ? 'ابدأ معايا' : 'Start with me')}
                <ArrowRight className="rtl-flip" />
              </a>
            </Button>
          </div>

          {props.showStats ? (
            <dl
              className={cn(
                'flex flex-wrap gap-x-8 gap-y-3 pt-4 text-sm',
                centered && 'md:justify-center',
              )}
            >
              <div>
                <dt className="text-muted-foreground">{isAr ? 'متدربون' : 'Trainees'}</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {formatNumber(coach.traineesCount, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{isAr ? 'سنوات خبرة' : 'Experience'}</dt>
                <dd className="font-display text-xl font-semibold tabular-nums">
                  {formatNumber(coach.yearsExperience, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{isAr ? 'البلد' : 'Based in'}</dt>
                <dd className="font-display text-xl font-semibold">
                  {countryLabel(coach.country, locale)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        {props.imageUrl || coach.avatarUrl ? (
          <div className={cn('shrink-0', centered && 'md:mx-auto')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={props.imageUrl || coach.avatarUrl!}
              alt={coach.fullName}
              className="squircle size-56 object-cover shadow-lift md:size-72"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AboutBlock({ props, ctx }: { props: BlockProps['ABOUT']; ctx: LandingContext }) {
  const body = props.body || ctx.coach.bio || '';
  if (!body && !props.title) return null;
  return (
    <Section>
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        {props.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={props.imageUrl}
            alt=""
            className="squircle size-40 shrink-0 object-cover shadow-soft md:size-56"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <Heading title={props.title} />
          <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
    </Section>
  );
}

function StatsBlock({ props, ctx }: { props: BlockProps['STATS']; ctx: LandingContext }) {
  const items = props.items.length
    ? props.items
    : [
        { value: String(ctx.coach.yearsExperience), label: ctx.isAr ? 'سنوات خبرة' : 'Years' },
        { value: String(ctx.coach.traineesCount), label: ctx.isAr ? 'متدرب' : 'Trainees' },
      ];
  return (
    <Section className="bg-muted/40">
      <Heading title={props.title} />
      {/* Flex rather than a fixed grid: a coach with two stats should not get
          two empty columns of dead space next to them. */}
      <div className="flex flex-wrap justify-center gap-4">
        {items.map((item, i) => (
          <Reveal key={i} delay={i * 0.06} className="min-w-40 flex-1 basis-40 sm:max-w-64">
            <div className="h-full rounded-lg border border-border/60 bg-card p-5 text-center shadow-soft">
              <p className="font-display text-3xl font-bold tabular-nums text-primary">
                {item.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function ServicesBlock({ props }: { props: BlockProps['SERVICES'] }) {
  if (!props.items.length && !props.title) return null;
  return (
    <Section>
      <Heading title={props.title} />
      <div className="grid gap-4 md:grid-cols-2">
        {props.items.map((item, i) => (
          <Reveal key={i} delay={i * 0.06}>
            <div className="h-full rounded-lg border border-border/60 bg-card p-5 shadow-soft">
              <Dumbbell className="mb-3 size-5 text-primary" />
              <h3 className="font-display font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function PackagesBlock({ props, ctx }: { props: BlockProps['PACKAGES']; ctx: LandingContext }) {
  // An empty selection means "all public packages" so a newly created package
  // shows up without the coach having to come back and edit this block.
  const shown = props.packageIds.length
    ? ctx.packages.filter((p) => props.packageIds.includes(p.id))
    : ctx.packages;
  if (!shown.length) return null;

  return (
    <Section id="subscribe" className="bg-muted/40">
      <Heading title={props.title} subtitle={props.subtitle} />
      <div className="grid gap-4 md:grid-cols-3">
        {shown.map((pkg, i) => (
          <Reveal key={pkg.id} delay={i * 0.06}>
            <div className="flex h-full flex-col rounded-lg border border-border/60 bg-card p-5 shadow-soft">
              <h3 className="font-display text-lg font-semibold">{pkg.name}</h3>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-primary">
                {formatMoney(pkg.price, pkg.currency, ctx.locale)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ctx.isAr
                  ? `${formatNumber(pkg.durationDays, ctx.locale)} يوم`
                  : `${pkg.durationDays} days`}
                {pkg.sessionsCount
                  ? ctx.isAr
                    ? ` · ${formatNumber(pkg.sessionsCount, ctx.locale)} جلسة`
                    : ` · ${pkg.sessionsCount} sessions`
                  : ''}
              </p>
              {pkg.description ? (
                <p className="mt-3 text-sm text-muted-foreground">{pkg.description}</p>
              ) : null}
              {pkg.features.length ? (
                <ul className="mt-3 space-y-1.5 text-sm">
                  {pkg.features.map((f, j) => (
                    <li key={j} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="text-muted-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex-1" />
              <Button className="mt-5 w-full" asChild={!ctx.preview} disabled={ctx.preview}>
                {ctx.preview ? (
                  <span>{ctx.isAr ? 'اشترك' : 'Subscribe'}</span>
                ) : (
                  <a href={`/${ctx.locale}/join/${ctx.coach.username}?package=${pkg.id}`}>
                    {ctx.isAr ? 'اشترك' : 'Subscribe'}
                  </a>
                )}
              </Button>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function CertificatesBlock({
  props,
  ctx,
}: {
  props: BlockProps['CERTIFICATES'];
  ctx: LandingContext;
}) {
  if (!ctx.certificates.length) return null;
  return (
    <Section>
      <Heading title={props.title} subtitle={props.subtitle} />
      <div className="grid gap-3 sm:grid-cols-2">
        {ctx.certificates.map((cert, i) => (
          <Reveal key={cert.id} delay={i * 0.06}>
            <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-4 shadow-soft">
              <Award className="mt-0.5 size-5 shrink-0 text-brand-accent" />
              <div className="min-w-0">
                <p className="font-medium">{cert.title}</p>
                <p className="text-sm text-muted-foreground">
                  {[cert.issuer, cert.year ? String(cert.year) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function TransformationsBlock({
  props,
  ctx,
}: {
  props: BlockProps['TRANSFORMATIONS'];
  ctx: LandingContext;
}) {
  if (!ctx.transformations.length) return null;
  return (
    <Section className="bg-muted/40">
      <Heading title={props.title} subtitle={props.subtitle} />
      <div className="grid gap-5 md:grid-cols-2">
        {ctx.transformations.map((t, i) => (
          <Reveal key={t.id} delay={i * 0.06}>
            <figure className="overflow-hidden rounded-lg border border-border/60 bg-card shadow-soft">
              <div className="grid grid-cols-2">
                {[t.beforeUrl, t.afterUrl].map((url, j) => (
                  <div key={j} className="relative aspect-[3/4]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="size-full object-cover" />
                    <span className="absolute bottom-2 start-2 rounded bg-foreground/70 px-2 py-0.5 text-xs text-background">
                      {j === 0
                        ? ctx.isAr
                          ? 'قبل'
                          : 'Before'
                        : ctx.isAr
                          ? 'بعد'
                          : 'After'}
                    </span>
                  </div>
                ))}
              </div>
              <figcaption className="space-y-1 p-4">
                {t.title ? <p className="font-medium">{t.title}</p> : null}
                {t.durationWeeks ? (
                  <p className="text-xs text-muted-foreground">
                    {ctx.isAr
                      ? `في ${formatNumber(t.durationWeeks, ctx.locale)} أسبوع`
                      : `In ${t.durationWeeks} weeks`}
                  </p>
                ) : null}
                {t.story ? <p className="text-sm text-muted-foreground">{t.story}</p> : null}
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function GalleryBlock({ props }: { props: BlockProps['GALLERY'] }) {
  if (!props.images.length) return null;
  return (
    <Section>
      <Heading title={props.title} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {props.images.map((img, i) => (
          <Reveal key={i} delay={i * 0.06}>
            <figure className="overflow-hidden rounded-lg border border-border/60 shadow-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.caption} className="aspect-square w-full object-cover" />
              {img.caption ? (
                <figcaption className="bg-card p-2 text-center text-xs text-muted-foreground">
                  {img.caption}
                </figcaption>
              ) : null}
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/** Turns a YouTube or Vimeo watch URL into its embed form. */
function embedUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function VideoBlock({ props }: { props: BlockProps['VIDEO'] }) {
  const src = embedUrl(props.url);
  if (!src) return null;
  return (
    <Section>
      <Heading title={props.title} />
      <div className="overflow-hidden rounded-lg border border-border/60 shadow-lift">
        <iframe
          src={src}
          title={props.title || 'video'}
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>
      {props.caption ? (
        <p className="mt-2 text-center text-sm text-muted-foreground">{props.caption}</p>
      ) : null}
    </Section>
  );
}

function TestimonialsBlock({
  props,
  ctx,
}: {
  props: BlockProps['TESTIMONIALS'];
  ctx: LandingContext;
}) {
  if (!ctx.testimonials.length) return null;
  return (
    <Section className="bg-muted/40">
      <Heading title={props.title} subtitle={props.subtitle} />
      <div className="grid gap-4 md:grid-cols-2">
        {ctx.testimonials.map((t, i) => (
          <Reveal key={t.id} delay={i * 0.06}>
            <blockquote className="h-full rounded-lg border border-border/60 bg-card p-5 shadow-soft">
              <Quote className="mb-2 size-5 text-primary/40" />
              <p className="text-sm leading-relaxed">{t.body}</p>
              <footer className="mt-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{t.authorName}</p>
                  {t.authorRole ? (
                    <p className="text-xs text-muted-foreground">{t.authorRole}</p>
                  ) : null}
                </div>
                <div className="flex gap-0.5" aria-label={`${t.rating}/5`}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className={cn(
                        'size-3.5',
                        j < t.rating ? 'fill-brand-accent text-brand-accent' : 'text-border',
                      )}
                    />
                  ))}
                </div>
              </footer>
            </blockquote>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

function FaqBlock({ props }: { props: BlockProps['FAQ'] }) {
  if (!props.items.length) return null;
  return (
    <Section>
      <Heading title={props.title} />
      <FaqList items={props.items} />
    </Section>
  );
}

function ContactFormBlock({
  props,
  ctx,
}: {
  props: BlockProps['CONTACT_FORM'];
  ctx: LandingContext;
}) {
  return (
    <Section id="contact">
      <div className="mx-auto max-w-xl">
        <Heading title={props.title} subtitle={props.subtitle} />
        <LeadForm
          trainerUsername={ctx.coach.username}
          pageId={ctx.pageId}
          preview={ctx.preview}
          askGoal={props.askGoal}
          isAr={ctx.isAr}
          buttonLabel={props.buttonLabel}
          successMessage={props.successMessage}
        />
      </div>
    </Section>
  );
}

function WhatsappBlock({ props, ctx }: { props: BlockProps['CTA_WHATSAPP']; ctx: LandingContext }) {
  const phone = (props.phone || ctx.coach.phone).replace(/[^\d]/g, '');
  if (!phone) return null;
  const href = `https://wa.me/${phone}${
    props.prefilledMessage ? `?text=${encodeURIComponent(props.prefilledMessage)}` : ''
  }`;
  return (
    <Section className="bg-primary/5">
      <div className="flex flex-col items-center gap-4 text-center">
        {props.title ? (
          <h2 className="font-display text-2xl font-semibold md:text-3xl">{props.title}</h2>
        ) : null}
        {props.body ? <p className="max-w-lg text-muted-foreground">{props.body}</p> : null}
        <Button size="lg" asChild={!ctx.preview} disabled={ctx.preview}>
          {ctx.preview ? (
            <span>
              <MessageCircle />
              {props.buttonLabel || (ctx.isAr ? 'كلمني واتساب' : 'Message me')}
            </span>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              {props.buttonLabel || (ctx.isAr ? 'كلمني واتساب' : 'Message me')}
            </a>
          )}
        </Button>
      </div>
    </Section>
  );
}

const SOCIAL_ICONS: Record<string, typeof Instagram> = {
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
  tiktok: Music2,
  whatsapp: MessageCircle,
};

function SocialLinksBlock({
  props,
  ctx,
}: {
  props: BlockProps['SOCIAL_LINKS'];
  ctx: LandingContext;
}) {
  const entries = Object.entries(ctx.coach.socialLinks).filter(([, v]) => Boolean(v));
  if (!entries.length) return null;
  return (
    <Section className="py-10">
      <div className="flex flex-col items-center gap-4">
        {props.title ? <p className="text-sm text-muted-foreground">{props.title}</p> : null}
        <div className="flex flex-wrap justify-center gap-3">
          {entries.map(([key, url]) => {
            const Icon = SOCIAL_ICONS[key] ?? Instagram;
            return (
              <a
                key={key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={key}
                className="rounded-full border border-border/60 bg-card p-3 text-muted-foreground shadow-soft transition-colors hover:text-primary"
              >
                <Icon className="size-5" />
              </a>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function CustomHtmlBlock({ props }: { props: BlockProps['CUSTOM_HTML'] }) {
  if (!props.html.trim()) return null;
  // Only reachable on plans whose `pages.custom_html` flag is on, and the page
  // is served from our own origin under a strict CSP.
  return (
    <Section>
      <div dangerouslySetInnerHTML={{ __html: props.html }} />
    </Section>
  );
}

// ────────────────────────────────────────────────────────── dispatcher ──

export function LandingBlock({ node, ctx }: { node: BlockNode; ctx: LandingContext }) {
  const type = node.type as BlockType;
  const props = parseBlockProps(type, node.props);

  switch (type) {
    case 'HERO':
      return <HeroBlock props={props as BlockProps['HERO']} ctx={ctx} />;
    case 'ABOUT':
      return <AboutBlock props={props as BlockProps['ABOUT']} ctx={ctx} />;
    case 'STATS':
      return <StatsBlock props={props as BlockProps['STATS']} ctx={ctx} />;
    case 'SERVICES':
      return <ServicesBlock props={props as BlockProps['SERVICES']} />;
    case 'PACKAGES':
      return <PackagesBlock props={props as BlockProps['PACKAGES']} ctx={ctx} />;
    case 'CERTIFICATES':
      return <CertificatesBlock props={props as BlockProps['CERTIFICATES']} ctx={ctx} />;
    case 'TRANSFORMATIONS':
      return <TransformationsBlock props={props as BlockProps['TRANSFORMATIONS']} ctx={ctx} />;
    case 'GALLERY':
      return <GalleryBlock props={props as BlockProps['GALLERY']} />;
    case 'VIDEO':
      return <VideoBlock props={props as BlockProps['VIDEO']} />;
    case 'TESTIMONIALS':
      return <TestimonialsBlock props={props as BlockProps['TESTIMONIALS']} ctx={ctx} />;
    case 'FAQ':
      return <FaqBlock props={props as BlockProps['FAQ']} />;
    case 'CONTACT_FORM':
      return <ContactFormBlock props={props as BlockProps['CONTACT_FORM']} ctx={ctx} />;
    case 'CTA_WHATSAPP':
      return <WhatsappBlock props={props as BlockProps['CTA_WHATSAPP']} ctx={ctx} />;
    case 'SOCIAL_LINKS':
      return <SocialLinksBlock props={props as BlockProps['SOCIAL_LINKS']} ctx={ctx} />;
    case 'CUSTOM_HTML':
      return <CustomHtmlBlock props={props as BlockProps['CUSTOM_HTML']} />;
    default:
      return null;
  }
}
