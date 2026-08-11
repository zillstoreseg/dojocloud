'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SignOutButton({ label, locale }: { label: string; locale: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: `/${locale}` })}>
      <LogOut className="rtl-flip" />
      {label}
    </Button>
  );
}
