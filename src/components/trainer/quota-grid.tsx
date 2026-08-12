import { StatRing, type RingTone } from '@/components/ui/stat-ring';
import { Card, CardContent } from '@/components/ui/card';
import { QUOTA_KEYS, type QuotaStatus } from '@/lib/quota';
import { formatNumber } from '@/lib/money';

const LABELS: Record<string, { ar: string; en: string }> = {
  [QUOTA_KEYS.TRAINEES]: { ar: 'المتدربون', en: 'Trainees' },
  [QUOTA_KEYS.LANDING_PAGES]: { ar: 'صفحات الهبوط', en: 'Landing pages' },
  [QUOTA_KEYS.EXERCISES]: { ar: 'التمارين', en: 'Exercises' },
  [QUOTA_KEYS.NUTRITION_PLANS]: { ar: 'أنظمة التغذية', en: 'Nutrition plans' },
  [QUOTA_KEYS.AI_GENERATIONS]: { ar: 'توليدات الذكاء الاصطناعي', en: 'AI generations' },
  [QUOTA_KEYS.STORAGE_MB]: { ar: 'التخزين (ميجابايت)', en: 'Storage (MB)' },
};

/** Colour follows how close to the limit the trainer is, not the metric. */
function toneFor(quota: QuotaStatus): RingTone {
  if (quota.limit === null) return 'primary';
  if (quota.exceeded) return 'destructive';
  if (quota.percent >= 80) return 'warning';
  return 'primary';
}

/**
 * The plan's limits as a row of progress rings — the same signature figure
 * used for adherence and macros, so "how much is left" always looks the same.
 */
export function QuotaGrid({ quotas, locale }: { quotas: QuotaStatus[]; locale: string }) {
  const isAr = locale === 'ar';

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {quotas.map((quota) => {
        const label = LABELS[quota.key];
        const unlimited = quota.limit === null;
        return (
          <Card key={quota.key}>
            <CardContent className="flex items-center gap-4 p-5">
              <StatRing
                value={unlimited ? 0 : quota.percent / 100}
                size={72}
                thickness={7}
                tone={toneFor(quota)}
                ariaLabel={`${isAr ? label?.ar : label?.en}: ${quota.used}${unlimited ? '' : ` / ${quota.limit}`}`}
              >
                <span className="text-xs">{unlimited ? '∞' : `${quota.percent}%`}</span>
              </StatRing>
              <div className="min-w-0">
                <p className="truncate text-sm text-muted-foreground">
                  {isAr ? label?.ar : label?.en}
                </p>
                <p className="font-display text-lg font-semibold tabular-nums">
                  {formatNumber(quota.used, locale)}
                  {unlimited ? (
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      / {isAr ? 'غير محدود' : 'unlimited'}
                    </span>
                  ) : (
                    <span className="text-sm font-normal text-muted-foreground">
                      {' '}
                      / {formatNumber(quota.limit ?? 0, locale)}
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
