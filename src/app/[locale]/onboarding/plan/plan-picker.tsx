'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { AlertCircle, Check, Sparkles, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChipRadio } from '@/components/ui/chip-select';
import { formatMoney } from '@/lib/money';
import { transition, STAGGER } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { selectPlan, validateCoupon } from './actions';

export interface PlanOption {
  id: string;
  key: string;
  name: string;
  tagline: string | null;
  /** Price per supported currency, already read out of the plan's price map. */
  prices: Record<string, number>;
  interval: string;
  trialDays: number;
  isPopular: boolean;
  highlights: string[];
}

interface Props {
  locale: string;
  plans: PlanOption[];
  currencies: string[];
  defaultCurrency: string;
  labels: Record<string, string>;
}

export function PlanPicker({ locale, plans, currencies, defaultCurrency, labels }: Props) {
  const router = useRouter();
  const [currency, setCurrency] = useState(defaultCurrency);
  const [selected, setSelected] = useState<string | null>(
    plans.find((p) => p.isPopular)?.id ?? plans[0]?.id ?? null,
  );
  const [code, setCode] = useState('');
  const [coupon, setCoupon] = useState<{ amount: number; discount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const plan = plans.find((p) => p.id === selected) ?? null;
  const basePrice = plan ? (plan.prices[currency] ?? 0) : 0;
  const finalPrice = coupon ? coupon.amount : basePrice;

  function pick(id: string) {
    setSelected(id);
    // A coupon is validated against one plan, so switching plans drops it.
    setCoupon(null);
    setError(null);
  }

  function onApplyCoupon() {
    if (!plan || code.trim().length === 0) return;
    setError(null);
    startCheck(async () => {
      const result = await validateCoupon({ code, planId: plan.id, currency });
      if (!result.ok) {
        setCoupon(null);
        setError(result.error ?? labels.generic);
        return;
      }
      setCoupon({ amount: result.amount ?? 0, discount: result.discount ?? 0 });
    });
  }

  function onConfirm() {
    if (!plan) return;
    setError(null);
    startSubmit(async () => {
      const result = await selectPlan({
        planId: plan.id,
        currency: currency as never,
        couponCode: coupon ? code.trim() : '',
      });
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        return;
      }
      router.push(`/${locale}${result.next}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {currencies.length > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-sm text-muted-foreground">{labels.currency}</span>
          <ChipRadio
            value={currency}
            onChange={(next) => {
              setCurrency(next);
              setCoupon(null);
            }}
            options={currencies.map((c) => ({ value: c, label: c }))}
          />
        </div>
      ) : null}

      {/* Three across at most: five plans in four columns orphans the last
          one, and narrower than this the feature lists stop being readable. */}
      <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((option, index) => {
          const price = option.prices[currency] ?? 0;
          const active = option.id === selected;
          return (
            <motion.button
              key={option.id}
              type="button"
              onClick={() => pick(option.id)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...transition.page, delay: index * STAGGER }}
              className="text-start"
              aria-pressed={active}
            >
              <Card
                className={cn(
                  'relative h-full transition-all duration-element ease-brand',
                  active
                    ? 'border-primary shadow-lift ring-2 ring-primary/30'
                    : 'hover:-translate-y-1 hover:border-primary/40 hover:shadow-lift',
                )}
              >
                {option.isPopular ? (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 shadow-soft">
                    {labels.mostPopular}
                  </Badge>
                ) : null}
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold">{option.name}</h3>
                      {option.tagline ? (
                        <p className="text-sm text-muted-foreground">{option.tagline}</p>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        'mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-micro',
                        active ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                      )}
                      aria-hidden
                    >
                      {active ? <Check className="size-3" /> : null}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-3xl font-semibold tabular-nums">
                      {price === 0 ? labels.free : formatMoney(price, currency, locale)}
                    </span>
                    {price > 0 ? (
                      <span className="text-sm text-muted-foreground">/{labels.perMonth}</span>
                    ) : null}
                  </div>

                  {price === 0 && option.trialDays > 0 ? (
                    <p className="flex items-center gap-1.5 text-sm text-primary">
                      <Sparkles className="size-3.5" />
                      {labels.trialFor.replace('{days}', String(option.trialDays))}
                    </p>
                  ) : null}

                  <ul className="space-y-2 text-sm">
                    {option.highlights.map((item) => (
                      <li key={item} className="flex gap-2 text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.button>
          );
        })}
      </div>

      {/* Coupon + confirm */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="coupon" className="text-sm font-medium">
              {labels.coupon}
            </label>
            <div className="flex gap-2">
              <Input
                id="coupon"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={labels.couponPlaceholder}
                dir="ltr"
                className="max-w-56"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onApplyCoupon}
                loading={checking}
                disabled={code.trim().length === 0}
              >
                <Tag />
                {labels.apply}
              </Button>
            </div>
            {coupon ? (
              <p className="text-xs font-medium text-success">
                {labels.discountApplied.replace(
                  '{amount}',
                  formatMoney(coupon.discount, currency, locale),
                )}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-end">
              <p className="text-xs text-muted-foreground">{labels.total}</p>
              <p className="font-display text-2xl font-semibold tabular-nums">
                {finalPrice === 0 ? labels.free : formatMoney(finalPrice, currency, locale)}
              </p>
            </div>
            <Button size="lg" onClick={onConfirm} loading={submitting} disabled={!plan}>
              {finalPrice === 0 ? labels.startTrial : labels.continueToPayment}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
