'use client';

import { useState } from 'react';
import { Check, Copy, Gift } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * The coach's invite code.
 *
 * Sits on the billing screen deliberately: it is the one place a coach is
 * already thinking about what their subscription costs, which is exactly when
 * "invite another coach and you both get a free month" is worth reading.
 */
export function ReferralCard({
  locale,
  code,
  rewardDays,
  invited,
  rewarded,
  signupUrl,
}: {
  locale: string;
  code: string;
  rewardDays: number;
  invited: number;
  rewarded: number;
  signupUrl: string;
}) {
  const isAr = locale === 'ar';
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  function copy(value: string, which: 'code' | 'link') {
    navigator.clipboard.writeText(value).then(
      () => {
        setCopied(which);
        setTimeout(() => setCopied(null), 2000);
      },
      () => undefined,
    );
  }

  return (
    <Card className="overflow-hidden border-brand/30">
      <div className="h-1 w-full bg-brand" />
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-brand/10 p-2.5 text-brand">
              <Gift className="size-5" />
            </span>
            <div>
              <h3 className="font-display font-semibold">
                {isAr ? 'ادعُ مدرب، خُد شهر مجاني' : 'Invite a coach, get a free month'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? `أول ما المدرب اللي دعوته يدفع اشتراكه، بنمدّ اشتراكك ${rewardDays} يوم — واشتراكه كمان.`
                  : `When a coach you invited pays their first subscription, we extend your plan by ${rewardDays} days — and theirs.`}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Badge variant="muted">
              {isAr ? `${invited} مدعو` : `${invited} invited`}
            </Badge>
            <Badge variant={rewarded > 0 ? 'success' : 'muted'}>
              {isAr ? `${rewarded} اشترك` : `${rewarded} paid`}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code
            className="rounded-lg border bg-muted/60 px-4 py-2 font-mono text-lg font-semibold tracking-widest"
            dir="ltr"
          >
            {code}
          </code>
          <Button variant="outline" size="sm" onClick={() => copy(code, 'code')}>
            {copied === 'code' ? <Check className="text-success" /> : <Copy />}
            {isAr ? 'انسخ الكود' : 'Copy code'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => copy(signupUrl, 'link')}>
            {copied === 'link' ? <Check className="text-success" /> : <Copy />}
            {isAr ? 'انسخ رابط الدعوة' : 'Copy invite link'}
          </Button>
        </div>

        <p className="truncate text-xs text-muted-foreground" dir="ltr">
          {signupUrl}
        </p>
      </CardContent>
    </Card>
  );
}
