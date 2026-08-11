'use client';

import { Fragment, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toaster';
import { setPlanFeature } from './actions';

interface PlanRow {
  id: string;
  name: string;
  features: Array<{ flagKey: string; enabled: boolean; limitValue: number | null }>;
}

interface FlagRow {
  key: string;
  name: string;
  type: 'BOOLEAN' | 'LIMIT';
  category: string | null;
  defaultEnabled: boolean;
}

/**
 * The plan × feature grid. Toggling a cell writes a PlanFeature row, which the
 * flag resolver reads as the middle layer between the global default and any
 * per-user override.
 */
export function PlanFeatureMatrix({ plans, flags }: { plans: PlanRow[]; flags: FlagRow[] }) {
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const featureFor = (plan: PlanRow, flagKey: string) =>
    plan.features.find((f) => f.flagKey === flagKey);

  function toggle(planId: string, flagKey: string, enabled: boolean, limitValue: number | null) {
    startTransition(async () => {
      const result = await setPlanFeature({ planId, flagKey, enabled, limitValue });
      if (!result.ok) toast({ title: result.error ?? '', variant: 'error' });
      router.refresh();
    });
  }

  const categories = [...new Set(flags.map((f) => f.category ?? 'other'))];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isAr ? 'مصفوفة المميزات لكل خطة' : 'Feature matrix by plan'}</CardTitle>
        <CardDescription>
          {isAr
            ? 'الترتيب: الافتراضي العام ← الخطة ← استثناء المستخدم. آخر طبقة هي التي تفوز.'
            : 'Layering: global default → plan → user override. The last layer wins.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">{isAr ? 'الميزة' : 'Feature'}</TableHead>
              {plans.map((plan) => (
                <TableHead key={plan.id} className="text-center">
                  {plan.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <Fragment key={category}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={plans.length + 1} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {category}
                  </TableCell>
                </TableRow>
                {flags
                  .filter((f) => (f.category ?? 'other') === category)
                  .map((flag) => (
                    <TableRow key={flag.key}>
                      <TableCell>
                        <p className="text-sm font-medium">{flag.name}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">
                          {flag.key}
                        </p>
                      </TableCell>
                      {plans.map((plan) => {
                        const feature = featureFor(plan, flag.key);
                        const enabled = feature?.enabled ?? flag.defaultEnabled;
                        return (
                          <TableCell key={plan.id} className="text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              <Switch
                                checked={enabled}
                                disabled={pending}
                                onCheckedChange={(v) => toggle(plan.id, flag.key, v, feature?.limitValue ?? null)}
                              />
                              {flag.type === 'LIMIT' && enabled ? (
                                <Input
                                  type="number"
                                  min={0}
                                  dir="ltr"
                                  className="h-7 w-16 text-center text-xs"
                                  defaultValue={feature?.limitValue ?? ''}
                                  placeholder="∞"
                                  onBlur={(e) =>
                                    toggle(
                                      plan.id,
                                      flag.key,
                                      true,
                                      e.target.value === '' ? null : Number(e.target.value),
                                    )
                                  }
                                />
                              ) : null}
                              {!feature ? (
                                <Badge variant="muted" className="text-[10px]">
                                  {isAr ? 'افتراضي' : 'default'}
                                </Badge>
                              ) : null}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
