'use client';

import { type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check } from 'lucide-react';
import { transition } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface Step {
  key: string;
  label: string;
}

/**
 * Progress header for multi-step flows — trainer sign-up and the trainee
 * intake questionnaire both use it.
 *
 * The connector fill is a scaleX so it works in both directions without a
 * second rule: `transform-origin` follows the writing direction via the
 * `origin-left rtl:origin-right` pair.
 */
export function StepperHeader({
  steps,
  current,
  className,
}: {
  steps: Step[];
  /** Zero-based index of the active step. */
  current: number;
  className?: string;
}) {
  return (
    <ol className={cn('flex w-full items-center gap-1', className)}>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.key} className="flex flex-1 items-center gap-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors duration-element',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary text-primary',
                  !done && !active && 'border-border text-muted-foreground',
                )}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="size-4" /> : index + 1}
              </span>
              <span
                className={cn(
                  'hidden max-w-24 text-center text-[0.7rem] leading-tight sm:block',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <div className="mb-6 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className={cn(
                    'h-full origin-left rounded-full bg-primary transition-transform duration-page ease-brand rtl:origin-right',
                    done ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Slides the active step's panel in from the direction of travel, so going
 * back visibly reverses. `direction` is +1 forward, −1 backward.
 */
export function StepPanel({
  stepKey,
  direction,
  children,
}: {
  stepKey: string;
  direction: 1 | -1;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const offset = reduced ? 0 : 24 * direction;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: offset }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -offset }}
        transition={transition.element}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
