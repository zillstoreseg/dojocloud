'use client';

import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { riseIn, fadeIn, staggerParent, transition } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Reveals its children once, when they first scroll into view.
 *
 * `once` is deliberate: content that re-animates every time it re-enters the
 * viewport turns scrolling back up into a light show.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'header';
}) {
  const reduced = useReducedMotion();
  const Component = motion[Tag];

  return (
    <Component
      className={className}
      variants={reduced ? fadeIn : riseIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ ...transition.page, delay }}
    >
      {children}
    </Component>
  );
}

/**
 * Staggers its direct `RevealItem` children. Use for grids and lists so the
 * eye is led across them instead of hit with all of it at once.
 */
export function RevealGroup({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'section';
}) {
  const Component = motion[Tag];
  return (
    <Component
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </Component>
  );
}

export function RevealItem({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const reduced = useReducedMotion();
  const Component = motion[Tag];
  return (
    <Component className={cn(className)} variants={reduced ? fadeIn : riseIn}>
      {children}
    </Component>
  );
}
