'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

export type RingTone = 'primary' | 'brand' | 'success' | 'warning' | 'destructive' | 'info';

const TONE_VAR: Record<RingTone, string> = {
  primary: 'var(--primary)',
  brand: 'var(--brand-accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  info: 'var(--info)',
};

/**
 * The product's signature figure: a progress ring.
 *
 * It shows up wherever something is "x out of y" — plan quota, trainee
 * adherence, profile completion, a meal's macros. Reusing one shape for all of
 * them is what turns a set of screens into a recognisable product.
 *
 * `value` is a 0–1 fraction. Values above 1 (over quota, over calories) clamp
 * the arc but the caller is expected to switch `tone` to say so.
 */
export function StatRing({
  value,
  size = 96,
  thickness = 9,
  tone = 'primary',
  label,
  children,
  className,
  ariaLabel,
}: {
  value: number;
  size?: number;
  thickness?: number;
  tone?: RingTone;
  /** Small caption under the centred content. */
  label?: string;
  /** Centred content — usually the raw figure. */
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const reduced = useReducedMotion();
  const clamped = Math.min(Math.max(value, 0), 1);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `${Math.round(clamped * 100)}%`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          stroke="hsl(var(--muted))"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          stroke={`hsl(${TONE_VAR[tone]})`}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduced ? circumference * (1 - clamped) : circumference }}
          whileInView={{ strokeDashoffset: circumference * (1 - clamped) }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: reduced ? 0 : 0.9, ease: [0.32, 0.72, 0, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-center leading-none">
        {children ? <span className="font-display font-semibold tabular-nums">{children}</span> : null}
        {label ? <span className="text-[0.65rem] text-muted-foreground">{label}</span> : null}
      </div>
    </div>
  );
}

/**
 * Three rings side by side for protein / carbs / fat. Used by the nutrition
 * plan view and by the food-scan result card, so both read identically.
 */
export function MacroRings({
  macros,
  size = 72,
  className,
}: {
  macros: { label: string; value: number; target: number; tone: RingTone }[];
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-4', className)}>
      {macros.map((macro) => (
        <StatRing
          key={macro.label}
          size={size}
          thickness={7}
          tone={macro.tone}
          value={macro.target > 0 ? macro.value / macro.target : 0}
          label={macro.label}
          ariaLabel={`${macro.label}: ${Math.round(macro.value)} / ${Math.round(macro.target)}`}
        >
          <span className="text-sm">{Math.round(macro.value)}</span>
        </StatRing>
      ))}
    </div>
  );
}
