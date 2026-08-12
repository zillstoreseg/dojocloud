'use client';

import { AppTopbar, ImpersonationBanner } from '@/components/app/topbar';

/** Admin flavour of the shared top bar. */
export function AdminTopbar({ title }: { title: string }) {
  return <AppTopbar title={title} settingsHref="/admin/settings" homeHref="/admin" />;
}

export { ImpersonationBanner };
