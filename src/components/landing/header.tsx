'use client';

import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'motion/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Sticky header for a coach's public page, with a reading-progress bar.
 *
 * It starts transparent over the hero and gains its surface once the visitor
 * scrolls past it, so the hero is not boxed in by chrome on first paint. The
 * progress bar is spring-smoothed rather than bound directly to scroll, which
 * is the difference between "it tracks the scrollbar" and "it feels attached".
 */
export function LandingHeader({
  name,
  avatarUrl,
  username,
  locale,
  isAr,
  joinLabel,
}: {
  name: string;
  avatarUrl: string | null;
  username: string;
  locale: string;
  isAr: boolean;
  joinLabel: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.3 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-colors duration-200',
        scrolled ? 'border-b border-border/60 bg-background/85 backdrop-blur' : 'bg-transparent',
      )}
    >
      <motion.div
        className="absolute inset-x-0 bottom-0 h-0.5 origin-[0%] bg-primary"
        style={{ scaleX: progress }}
        aria-hidden
      />
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="squircle size-8 shrink-0 object-cover" />
          ) : null}
          <span
            className={cn(
              'truncate font-display font-semibold transition-opacity duration-200',
              scrolled ? 'opacity-100' : 'opacity-0 md:opacity-100',
            )}
          >
            {name}
          </span>
        </div>

        <Button size="sm" asChild>
          <a href={`/${locale}/join/${username}`}>
            {joinLabel}
            <ArrowRight className="rtl-flip" />
          </a>
        </Button>
      </div>
      <span className="sr-only">{isAr ? 'صفحة المدرب' : 'Coach page'}</span>
    </header>
  );
}
