'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useInView, useMotionValue, useSpring, useReducedMotion } from 'motion/react';
import { intlLocale } from '@/lib/money';

/**
 * Counts a headline figure up the first time it is seen.
 *
 * The count is cosmetic, so the final value is rendered into the DOM up front
 * and the animation only overwrites it while running — a screen reader, or a
 * user who asked for reduced motion, gets the real number immediately.
 *
 * Props are plain values rather than a formatter callback: this is a client
 * component and functions cannot cross the server boundary.
 */
export function AnimatedNumber({
  value,
  locale,
  currency,
  maximumFractionDigits = 0,
  className,
}: {
  value: number;
  locale: string;
  /** Set to format as money instead of a plain number. */
  currency?: string;
  maximumFractionDigits?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(
        intlLocale(locale),
        currency
          ? { style: 'currency', currency, maximumFractionDigits }
          : { maximumFractionDigits },
      ),
    [locale, currency, maximumFractionDigits],
  );

  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (inView && !reduced) motionValue.set(value);
  }, [inView, reduced, value, motionValue]);

  useEffect(() => {
    if (reduced) return;
    return spring.on('change', (latest) => {
      if (ref.current) ref.current.textContent = formatter.format(Math.round(latest));
    });
  }, [spring, formatter, reduced]);

  return (
    <span ref={ref} className={className}>
      {formatter.format(value)}
    </span>
  );
}
