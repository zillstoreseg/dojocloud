import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * A single headline number. Not a chart — the job here is one value plus its
 * direction of travel, so a plot would add nothing.
 */
export function StatCard({
  label,
  value,
  sublabel,
  change,
  /** Whether a rise is good; churn and cost invert this. */
  invert = false,
  icon,
  href,
}: {
  label: string;
  value: ReactNode;
  sublabel?: string;
  change?: number | null;
  invert?: boolean;
  icon?: ReactNode;
  href?: string;
}) {
  const positive = change !== null && change !== undefined ? (invert ? change < 0 : change > 0) : null;
  const flat = change === 0;

  const body = (
    <CardContent className="space-y-2 p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground/60">{icon}</span> : null}
      </div>
      <p className="stat-value">{value}</p>
      <div className="flex items-center gap-2 text-xs">
        {change !== null && change !== undefined ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              flat ? 'text-muted-foreground' : positive ? 'text-success' : 'text-destructive',
            )}
          >
            {flat ? (
              <Minus className="size-3" />
            ) : change > 0 ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {Math.abs(change)}%
          </span>
        ) : null}
        {sublabel ? <span className="text-muted-foreground">{sublabel}</span> : null}
      </div>
    </CardContent>
  );

  if (href) {
    return (
      <Card className="group transition-all duration-element ease-brand hover:-translate-y-1 hover:border-primary/40 hover:shadow-lift">
        <a href={href}>{body}</a>
      </Card>
    );
  }
  return <Card>{body}</Card>;
}

/** Horizontal funnel step with its conversion rate from the previous step. */
export function FunnelStep({
  label,
  value,
  rate,
  rateLabel,
  widthPercent,
  slot,
}: {
  label: string;
  value: string;
  rate?: number;
  rateLabel?: string;
  widthPercent: number;
  slot: 0 | 1 | 2 | 3;
}) {
  const colors = ['#1baf7a', '#2a78d6', '#eb6834', '#4a3aa7'];
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="font-semibold tabular-nums">{value}</span>
          {rate !== undefined ? (
            <span className="text-xs text-muted-foreground">
              {rate}% {rateLabel}
            </span>
          ) : null}
        </span>
      </div>
      <div className="h-8 w-full overflow-hidden rounded-md bg-muted">
        <div
          className="grow-bar h-full rounded-md"
          style={{
            width: `${Math.max(widthPercent, 2)}%`,
            background: colors[slot],
            animationDelay: `${slot * 90}ms`,
          }}
        />
      </div>
    </div>
  );
}
