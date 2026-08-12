'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { transition } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * Accordion for the FAQ block. Native `<details>` would be simpler, but it
 * cannot animate its own height, and an FAQ that snaps open reads as unpolished
 * next to the rest of the page.
 */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const reduced = useReducedMotion();

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-card shadow-soft">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 p-4 text-start transition-colors hover:bg-accent/50"
            >
              <span className="font-medium">{item.q}</span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  isOpen && 'rotate-180',
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={transition.element}
                  className="overflow-hidden"
                >
                  <p className="whitespace-pre-line px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
