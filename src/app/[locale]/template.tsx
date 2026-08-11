'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { transition } from '@/lib/motion';

/**
 * Page transition. A `template` (not a `layout`) remounts on every navigation,
 * which is exactly the hook this needs.
 *
 * Deliberately small — 8px and a fade. Anything larger turns every click into
 * a wait, and the transition would start competing with the content it is
 * supposed to introduce.
 */
export default function LocaleTemplate({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.page}
    >
      {children}
    </motion.div>
  );
}
