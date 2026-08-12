'use client';

import { Award, MapPin, Star, Users, ArrowRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, formatNumber } from '@/lib/money';
import { transition, STAGGER, coachLayoutId } from '@/lib/motion';
import { cn, initials } from '@/lib/utils';

export interface DirectoryCoach {
  id: string;
  username: string;
  fullName: string;
  bio: string | null;
  avatarUrl: string | null;
  countryLabel: string;
  city: string | null;
  yearsExperience: number;
  specialties: string[];
  trainsGenders: string;
  isFeatured: boolean;
  traineesCount: number;
  certificatesCount: number;
  rating: number | null;
  ratingCount: number;
  startingPrice: number | null;
  startingCurrency: string | null;
}

/**
 * The directory grid.
 *
 * Each card carries a `layoutId` matching the one on the coach's own page, so
 * moving from the grid to a profile is a continuous motion rather than a cut.
 * That single detail is most of what makes the directory feel built rather
 * than assembled — and it is dropped entirely under reduced motion.
 */
export function CoachDirectory({
  coaches,
  locale,
  isAr,
}: {
  coaches: DirectoryCoach[];
  locale: string;
  isAr: boolean;
}) {
  const reduced = useReducedMotion();

  if (coaches.length === 0) {
    return (
      <EmptyState
        title={isAr ? 'مفيش مدرب بالمواصفات دي' : 'No coach matches those filters'}
        description={
          isAr
            ? 'جرّب توسّع الفلاتر شوية — شيل التخصص أو ارفع حد السعر.'
            : 'Try widening the filters — drop a specialty or raise the price cap.'
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {coaches.map((coach, i) => (
        <motion.article
          key={coach.id}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition.page, delay: Math.min(i, 8) * STAGGER }}
          whileHover={reduced ? undefined : { y: -4 }}
          className={cn(
            'group flex h-full flex-col rounded-lg border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift',
            coach.isFeatured ? 'border-brand-accent/50' : 'border-border/60',
          )}
        >
          <div className="flex items-start gap-3">
            <motion.div layoutId={reduced ? undefined : coachLayoutId(coach.username)}>
              {coach.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coach.avatarUrl}
                  alt=""
                  className="squircle size-16 shrink-0 object-cover"
                />
              ) : (
                <span className="squircle flex size-16 shrink-0 items-center justify-center bg-primary/10 font-display text-lg font-semibold text-primary">
                  {initials(coach.fullName)}
                </span>
              )}
            </motion.div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="truncate font-display font-semibold">{coach.fullName}</h2>
                {coach.isFeatured ? (
                  <Badge variant="warning" className="shrink-0">
                    {isAr ? 'مميّز' : 'Featured'}
                  </Badge>
                ) : null}
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" />
                {[coach.city, coach.countryLabel].filter(Boolean).join('، ')}
              </p>
              {coach.rating ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs">
                  <Star className="size-3 fill-brand-accent text-brand-accent" />
                  <span className="font-medium tabular-nums">{coach.rating.toFixed(1)}</span>
                  <span className="text-muted-foreground">
                    ({formatNumber(coach.ratingCount, locale)})
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {coach.specialties.slice(0, 3).map((s) => (
              <span
                key={s}
                className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {s}
              </span>
            ))}
          </div>

          {coach.bio ? (
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{coach.bio}</p>
          ) : null}

          <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <div className="flex items-center gap-1">
              <Users className="size-3.5 text-muted-foreground" />
              <dt className="sr-only">{isAr ? 'متدربون' : 'Trainees'}</dt>
              <dd className="font-medium tabular-nums">
                {formatNumber(coach.traineesCount, locale)}
              </dd>
            </div>
            <div className="flex items-center gap-1">
              <Award className="size-3.5 text-muted-foreground" />
              <dt className="sr-only">{isAr ? 'شهادات' : 'Certificates'}</dt>
              <dd className="font-medium tabular-nums">
                {formatNumber(coach.certificatesCount, locale)}
              </dd>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <dt>{isAr ? 'خبرة' : 'Experience'}</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {isAr
                  ? `${formatNumber(coach.yearsExperience, locale)} سنة`
                  : `${coach.yearsExperience}y`}
              </dd>
            </div>
          </dl>

          <div className="flex-1" />

          <div className="mt-4 flex items-end justify-between gap-2 border-t border-border/60 pt-4">
            <div>
              {coach.startingPrice && coach.startingCurrency ? (
                <>
                  <p className="text-xs text-muted-foreground">{isAr ? 'يبدأ من' : 'From'}</p>
                  <p className="font-display font-semibold tabular-nums text-primary">
                    {formatMoney(coach.startingPrice, coach.startingCurrency, locale)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {isAr ? 'اسأله عن الأسعار' : 'Ask about pricing'}
                </p>
              )}
            </div>
            <Button size="sm" asChild>
              <Link href={`/c/${coach.username}`}>
                {isAr ? 'شوف الملف' : 'View profile'}
                <ArrowRight className="rtl-flip" />
              </Link>
            </Button>
          </div>
        </motion.article>
      ))}
    </div>
  );
}
