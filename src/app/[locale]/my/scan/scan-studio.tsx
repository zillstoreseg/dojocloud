'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Camera, Check, Flag, Loader2, Minus, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MacroRings, StatRing } from '@/components/ui/stat-ring';
import { useToast } from '@/components/ui/toaster';
import { EmptyState } from '@/components/ui/empty-state';
import { VERDICT_LABELS } from '@/lib/verdict';
import type { FoodScanItem } from '@/lib/ai/food-scan';
import { cn } from '@/lib/utils';
import { correctScan, reportScan, scanMeal, toggleScanLogged } from './actions';

export interface ScanCard {
  id: string;
  title: string | null;
  imageUrl: string;
  thumbUrl: string | null;
  items: FoodScanItem[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  verdict: 'FITS' | 'OVER' | 'UNDER' | 'OFF_PLAN';
  reason: string;
  logged: boolean;
  reported: boolean;
  createdAt: string;
}

interface Props {
  locale: string;
  allowance: { enabled: boolean; used: number; limit: number | null; remaining: number | null };
  budget: { target: number; consumed: number; remaining: number; source: string };
  scans: ScanCard[];
}

const VERDICT_BAR: Record<ScanCard['verdict'], string> = {
  FITS: 'bg-success',
  OVER: 'bg-destructive',
  UNDER: 'bg-warning',
  OFF_PLAN: 'bg-warning',
};

const VERDICT_BADGE: Record<ScanCard['verdict'], 'success' | 'destructive' | 'warning'> = {
  FITS: 'success',
  OVER: 'destructive',
  UNDER: 'warning',
  OFF_PLAN: 'warning',
};

/**
 * The meal scanner.
 *
 * Two things drive the design. First, the wait: a vision call takes seconds,
 * and an unexplained pause in front of cooling food feels much longer than it
 * is — so the photo appears immediately and shimmers while it is being read.
 * Second, correction: the portion estimate is the part most likely to be wrong,
 * so adjusting it is one tap, and it recomputes without another API call.
 */
export function ScanStudio({ locale, allowance, budget, scans }: Props) {
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const reduced = useReducedMotion();
  const fileInput = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [pending, startTransition] = useTransition();

  const outOfScans = allowance.remaining !== null && allowance.remaining <= 0;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    // The local preview goes up before the upload starts, so the screen
    // responds to the shutter rather than to the network.
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setAnalysing(true);

    const formData = new FormData();
    formData.append('photo', file);

    const result = await scanMeal(formData);

    setAnalysing(false);
    URL.revokeObjectURL(localUrl);
    setPreview(null);

    if (!result.ok) {
      toast({ title: result.error ?? (isAr ? 'حصل خطأ' : 'Something went wrong'), variant: 'error' });
      return;
    }

    toast({
      title: isAr ? 'خلصنا التحليل' : 'Reading complete',
      description: isAr ? 'راجع الجرامات لو حابب تظبطها' : 'Adjust the grams if they look off',
      variant: 'success',
    });
  }

  function onLog(scan: ScanCard) {
    startTransition(async () => {
      const result = await toggleScanLogged(scan.id, !scan.logged);
      if (!result.ok) {
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      toast({
        title: scan.logged
          ? isAr
            ? 'شيلناها من يومك'
            : 'Removed from today'
          : isAr
            ? 'اتضافت ليومك'
            : 'Added to today',
        variant: 'success',
      });
    });
  }

  return (
    <div className="space-y-6">
      {/* ── the day, so the verdict below has a context ── */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-wrap items-center gap-6 p-6">
          <StatRing
            value={budget.target > 0 ? budget.consumed / budget.target : 0}
            size={92}
            tone={budget.remaining < 0 ? 'destructive' : 'primary'}
            label={isAr ? 'من ميزانية اليوم' : 'of today'}
          >
            <span className="text-sm">{budget.consumed}</span>
          </StatRing>

          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {isAr ? 'فاضلك النهارده' : 'Left today'}
            </p>
            <p
              className={cn(
                'font-display text-3xl font-bold tabular-nums',
                budget.remaining < 0 && 'text-destructive',
              )}
            >
              {budget.remaining} <span className="text-base font-normal">{isAr ? 'سعر' : 'kcal'}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {budget.source === 'plan'
                ? isAr
                  ? 'من خطة مدربك'
                  : 'From your coach’s plan'
                : budget.source === 'computed'
                  ? isAr
                    ? 'محسوبة من بياناتك وهدفك'
                    : 'Computed from your data and goal'
                  : isAr
                    ? 'مفيش هدف محدد لسه'
                    : 'No target set yet'}
            </p>
          </div>

          <div className="ms-auto text-end">
            <p className="text-xs text-muted-foreground">
              {isAr ? 'تحليلات النهارده' : 'Scans today'}
            </p>
            <p className="font-display text-xl font-semibold tabular-nums">
              {allowance.used}
              {allowance.limit !== null ? ` / ${allowance.limit}` : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── the shutter ── */}
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={onPick}
      />

      <AnimatePresence mode="wait">
        {analysing && preview ? (
          <motion.div
            key="analysing"
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22, ease: [0.32, 0.72, 0, 1] }}
          >
            <Card className="overflow-hidden">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt=""
                  className="size-full object-cover"
                />
                <motion.div
                  className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent"
                  animate={reduced ? undefined : { opacity: [0.5, 0.9, 0.5] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                {!reduced ? (
                  <motion.div
                    className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent"
                    initial={{ x: '-120%' }}
                    animate={{ x: '320%' }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                  />
                ) : null}
                <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 p-4 text-sm font-medium">
                  <Loader2 className="size-4 animate-spin" />
                  {isAr ? 'بنقرا الطبق…' : 'Reading the plate…'}
                </div>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="shutter"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
          >
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <div className="rounded-full bg-primary/10 p-4 text-primary">
                  <Camera className="size-7" />
                </div>
                <p className="font-display text-lg font-semibold">
                  {isAr ? 'صوّر الطبق' : 'Photograph the plate'}
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {isAr
                    ? 'خلي الطبق كله في الصورة، ولو تقدر حط شوكة أو كوباية جنبه عشان الحجم يبان.'
                    : 'Fit the whole plate in frame; a fork or glass beside it helps the size read true.'}
                </p>
                <Button
                  size="lg"
                  onClick={() => fileInput.current?.click()}
                  disabled={outOfScans || analysing}
                >
                  <Camera />
                  {isAr ? 'افتح الكاميرا' : 'Open camera'}
                </Button>
                {outOfScans ? (
                  <p className="text-xs text-destructive">
                    {isAr
                      ? `وصلت الحد اليومي (${allowance.limit}). جرّب تاني بكرة.`
                      : `Daily limit reached (${allowance.limit}). Try again tomorrow.`}
                  </p>
                ) : allowance.remaining !== null ? (
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? `فاضلك ${allowance.remaining} تحليل النهارده`
                      : `${allowance.remaining} scans left today`}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── results ── */}
      {scans.length === 0 && !analysing ? (
        <EmptyState
          title={isAr ? 'لسه مصورتش أي وجبة' : 'No meals scanned yet'}
          description={
            isAr
              ? 'أول صورة هتوريك سعرات الوجبة وماكروزها، وهل هي مناسبة لهدفك ولا لأ.'
              : 'Your first photo shows the meal’s calories and macros, and whether they fit your goal.'
          }
        />
      ) : null}

      <div className="space-y-4">
        {scans.map((scan, index) => (
          <ScanResultCard
            key={scan.id}
            scan={scan}
            index={index}
            isAr={isAr}
            pending={pending}
            onLog={() => onLog(scan)}
          />
        ))}
      </div>
    </div>
  );
}

function ScanResultCard({
  scan,
  index,
  isAr,
  pending,
  onLog,
}: {
  scan: ScanCard;
  index: number;
  isAr: boolean;
  pending: boolean;
  onLog: () => void;
}) {
  const { toast } = useToast();
  const reduced = useReducedMotion();
  const [grams, setGrams] = useState<number[]>(scan.items.map((item) => item.grams));
  const [saving, startSaving] = useTransition();

  const dirty = grams.some((value, i) => value !== scan.items[i]?.grams);

  function bump(index: number, delta: number) {
    setGrams((prev) =>
      prev.map((value, i) => (i === index ? Math.max(0, Math.round(value + delta)) : value)),
    );
  }

  function save() {
    startSaving(async () => {
      const result = await correctScan({ scanId: scan.id, grams });
      toast(
        result.ok
          ? {
              title: isAr ? 'حسبناها من تاني' : 'Recalculated',
              description: isAr ? 'من غير أي تحليل جديد' : 'No new analysis needed',
              variant: 'success',
            }
          : { title: result.error ?? 'خطأ', variant: 'error' },
      );
    });
  }

  function report() {
    startSaving(async () => {
      const result = await reportScan(scan.id);
      toast(
        result.ok
          ? {
              title: isAr ? 'بلّغنا مدربك' : 'Reported',
              description: isAr ? 'هنراجع التحليل ده' : 'We’ll review this reading',
              variant: 'success',
            }
          : { title: result.error ?? 'خطأ', variant: 'error' },
      );
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: reduced ? 0 : 0.38, delay: reduced ? 0 : index * 0.06, ease: [0.32, 0.72, 0, 1] }}
    >
      <Card className="overflow-hidden">
        <div className={cn('h-1.5 w-full', VERDICT_BAR[scan.verdict])} />
        <CardContent className="grid gap-6 p-5 md:grid-cols-[200px_1fr]">
          <div className="space-y-2">
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
              <Image
                src={scan.thumbUrl ?? scan.imageUrl}
                alt={scan.title ?? ''}
                fill
                sizes="200px"
                className="object-cover"
              />
            </div>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {scan.createdAt}
            </p>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-lg font-semibold">{scan.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {isAr ? 'ثقة التقدير' : 'Confidence'}: {Math.round(scan.confidence * 100)}%
                </p>
              </div>
              <Badge variant={VERDICT_BADGE[scan.verdict]}>
                {VERDICT_LABELS[scan.verdict][isAr ? 'ar' : 'en']}
              </Badge>
            </div>

            <p className="rounded-lg bg-muted/60 p-3 text-sm leading-relaxed">{scan.reason}</p>

            <div className="flex flex-wrap items-center gap-6">
              <div className="text-center">
                <p className="font-display text-3xl font-bold tabular-nums">{scan.kcal}</p>
                <p className="text-xs text-muted-foreground">{isAr ? 'سعر حراري' : 'kcal'}</p>
              </div>
              <MacroRings
                size={64}
                macros={[
                  {
                    label: isAr ? 'بروتين' : 'Protein',
                    value: scan.protein,
                    target: Math.max(scan.protein, 60),
                    tone: 'primary',
                  },
                  {
                    label: isAr ? 'كارب' : 'Carbs',
                    value: scan.carbs,
                    target: Math.max(scan.carbs, 120),
                    tone: 'brand',
                  },
                  {
                    label: isAr ? 'دهون' : 'Fat',
                    value: scan.fat,
                    target: Math.max(scan.fat, 40),
                    tone: 'info',
                  },
                ]}
              />
            </div>

            {/* Portion correction — the one number most likely to be wrong. */}
            <ul className="divide-y rounded-lg border">
              {scan.items.map((item, i) => (
                <li key={`${scan.id}-${i}`} className="flex items-center gap-3 p-3">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {isAr ? item.nameAr : item.nameEn}
                  </span>
                  <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                    {Math.round(item.kcal * (item.grams > 0 ? grams[i]! / item.grams : 1))}{' '}
                    {isAr ? 'سعر' : 'kcal'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => bump(i, -10)}
                      aria-label={isAr ? 'أقل' : 'Less'}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-14 text-center text-sm tabular-nums">{grams[i]}غ</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => bump(i, 10)}
                      aria-label={isAr ? 'أكتر' : 'More'}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2">
              {dirty ? (
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {isAr ? 'احسبها من تاني' : 'Recalculate'}
                </Button>
              ) : null}
              {dirty ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setGrams(scan.items.map((item) => item.grams))}
                >
                  <RotateCcw />
                  {isAr ? 'رجّعها' : 'Reset'}
                </Button>
              ) : null}

              <Button
                size="sm"
                variant={scan.logged ? 'secondary' : 'default'}
                onClick={onLog}
                disabled={pending}
              >
                <Check />
                {scan.logged
                  ? isAr
                    ? 'محسوبة في يومك'
                    : 'Counted today'
                  : isAr
                    ? 'أضِفها ليومي'
                    : 'Add to my day'}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                className="ms-auto"
                onClick={report}
                disabled={saving || scan.reported}
              >
                <Flag />
                {scan.reported
                  ? isAr
                    ? 'اتبلّغ عنها'
                    : 'Reported'
                  : isAr
                    ? 'التحليل غلط'
                    : 'Reading is wrong'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
