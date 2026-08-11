import type { ReactNode } from 'react';
import './globals.css';

/**
 * Root layout. The real <html>/<body> shell lives in [locale]/layout.tsx,
 * because `dir` and `lang` depend on the active locale.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
