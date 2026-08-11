'use client';

import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, Wallet, Users, Camera } from 'lucide-react';
import { StatRing } from '@/components/ui/stat-ring';
import { transition, STAGGER } from '@/lib/motion';

/**
 * The hero's product proof: three floating cards that show what the app
 * actually does — trainees under management, money landing in the coach's
 * wallet, and a food photo being scored.
 *
 * They drift very slightly out of phase with each other. The drift is small
 * enough to read as "alive" rather than as an animation, and it is dropped
 * entirely under `prefers-reduced-motion`.
 */
export function HeroPanel({
  isAr,
  labels,
}: {
  isAr: boolean;
  labels: { trainees: string; wallet: string; scan: string; adherence: string; verdict: string };
}) {
  const reduced = useReducedMotion();

  const float = (delay: number) =>
    reduced
      ? {}
      : {
          animate: { y: [0, -8, 0] },
          transition: { duration: 6, delay, repeat: Infinity, ease: 'easeInOut' as const },
        };

  return (
    <div className="relative mx-auto w-full max-w-md" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Soft brand glow behind the stack. */}
      <div
        className="pointer-events-none absolute -inset-8 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className="relative space-y-3">
        {/* Trainees + adherence ring */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition.page, delay: STAGGER }}
        >
          <motion.div
            className="flex items-center gap-4 rounded-lg border border-border/60 bg-card p-4 shadow-lift"
            {...float(0)}
          >
            <StatRing value={0.78} size={64} thickness={7} tone="primary" label={labels.adherence}>
              <span className="text-sm">78%</span>
            </StatRing>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                {labels.trainees}
              </p>
              <p className="font-display text-2xl font-semibold tabular-nums">42</p>
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-success rtl-flip" />
          </motion.div>
        </motion.div>

        {/* Wallet credit */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition.page, delay: STAGGER * 3 }}
          className="ms-6"
        >
          <motion.div
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-4 shadow-lift"
            {...float(1.4)}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
              <Wallet className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">{labels.wallet}</p>
              <p className="font-display text-lg font-semibold tabular-nums" dir="ltr">
                + 1,750 EGP
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Food scan verdict */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...transition.page, delay: STAGGER * 5 }}
        >
          <motion.div
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-4 shadow-lift"
            {...float(2.8)}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Camera className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">{labels.scan}</p>
              <p className="truncate text-sm font-medium text-success">{labels.verdict}</p>
            </div>
            <span className="shrink-0 font-display text-sm font-semibold tabular-nums" dir="ltr">
              610 kcal
            </span>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
