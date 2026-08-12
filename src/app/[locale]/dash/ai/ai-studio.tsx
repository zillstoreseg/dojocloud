'use client';

import { useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Apple, Check, Dumbbell, Loader2, Sparkles, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import type { WorkoutProgramDraft, NutritionPlanDraft } from '@/lib/ai/generate';
import {
  draftProgram,
  draftNutritionPlan,
  saveProgramDraft,
  saveNutritionDraft,
} from './actions';

interface Props {
  locale: string;
  trainees: { id: string; name: string }[];
  canProgram: boolean;
  canNutrition: boolean;
  exhausted: boolean;
}

/**
 * Draft, review, accept.
 *
 * The draft is rendered in full — every week, every day, every set — because
 * "review before saving" is only meaningful if the coach can actually see what
 * they are approving. A summary with a Save button would be a rubber stamp
 * with extra steps.
 */
export function AiStudio({ locale, trainees, canProgram, canNutrition, exhausted }: Props) {
  const isAr = locale === 'ar';

  return (
    <Tabs defaultValue="program">
      <TabsList>
        <TabsTrigger value="program">
          <Dumbbell className="size-4" />
          {isAr ? 'برنامج تدريبي' : 'Training program'}
        </TabsTrigger>
        <TabsTrigger value="nutrition">
          <Apple className="size-4" />
          {isAr ? 'نظام غذائي' : 'Nutrition plan'}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="program">
        <ProgramDrafter
          isAr={isAr}
          trainees={trainees}
          enabled={canProgram}
          exhausted={exhausted}
        />
      </TabsContent>

      <TabsContent value="nutrition">
        <NutritionDrafter
          isAr={isAr}
          trainees={trainees}
          enabled={canNutrition}
          exhausted={exhausted}
        />
      </TabsContent>
    </Tabs>
  );
}

function Gate({ isAr, enabled, exhausted }: { isAr: boolean; enabled: boolean; exhausted: boolean }) {
  if (!enabled) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          {isAr
            ? 'الميزة دي مش في باقتك الحالية — رقّي باقتك عشان تستخدمها.'
            : 'This is not part of your current plan — upgrade to use it.'}
        </AlertDescription>
      </Alert>
    );
  }
  if (exhausted) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          {isAr
            ? 'خلص رصيد التوليد بتاع الشهر ده. هيتجدد مع دورة اشتراكك الجديدة.'
            : 'You are out of generations this cycle. It resets with your next billing period.'}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function TraineePicker({
  isAr,
  trainees,
  value,
  onChange,
}: {
  isAr: boolean;
  trainees: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={isAr ? 'المتدرب' : 'Trainee'}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={isAr ? 'اختار متدرب' : 'Pick a trainee'} />
        </SelectTrigger>
        <SelectContent>
          {trainees.map((trainee) => (
            <SelectItem key={trainee.id} value={trainee.id}>
              {trainee.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function Thinking({ isAr, what }: { isAr: boolean; what: string }) {
  const reduced = useReducedMotion();
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" />
          {isAr ? `بنكتب ${what}…` : `Drafting ${what}…`}
        </p>
        <div className="space-y-2">
          {[0, 1, 2, 3].map((index) => (
            <motion.div
              key={index}
              className="h-4 rounded bg-muted"
              style={{ width: `${90 - index * 12}%` }}
              animate={reduced ? undefined : { opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: index * 0.14 }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {isAr
            ? 'بياخد من ٢٠ لـ ٦٠ ثانية. سيبها شغالة.'
            : 'This takes 20–60 seconds. Leave it running.'}
        </p>
      </CardContent>
    </Card>
  );
}

function ProgramDrafter({
  isAr,
  trainees,
  enabled,
  exhausted,
}: {
  isAr: boolean;
  trainees: { id: string; name: string }[];
  enabled: boolean;
  exhausted: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [traineeId, setTraineeId] = useState('');
  const [weeks, setWeeks] = useState(4);
  const [draft, setDraft] = useState<WorkoutProgramDraft | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [busy, startBusy] = useTransition();

  function generate() {
    setDraft(null);
    startBusy(async () => {
      const result = await draftProgram({ traineeId, weeks });
      if (!result.ok || !result.draft) {
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      setDraft(result.draft);
      setCost(result.costUsd ?? null);
    });
  }

  function accept() {
    if (!draft) return;
    startBusy(async () => {
      const result = await saveProgramDraft({ traineeId, draft });
      if (!result.ok) {
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      toast({ title: isAr ? 'اتحفظ البرنامج' : 'Program saved', variant: 'success' });
      router.push(`/dash/programs/${result.id}`);
    });
  }

  const gate = <Gate isAr={isAr} enabled={enabled} exhausted={exhausted} />;

  return (
    <div className="space-y-4">
      {gate}

      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <TraineePicker isAr={isAr} trainees={trainees} value={traineeId} onChange={setTraineeId} />
          <Field label={isAr ? 'عدد الأسابيع' : 'Weeks'}>
            <Input
              type="number"
              min={1}
              max={12}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value) || 4)}
            />
          </Field>
          <Button
            variant="brand"
            onClick={generate}
            disabled={!enabled || exhausted || busy || !traineeId}
          >
            {busy && !draft ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isAr ? 'اكتب مسودة' : 'Draft it'}
          </Button>
        </CardContent>
      </Card>

      {busy && !draft ? <Thinking isAr={isAr} what={isAr ? 'البرنامج' : 'the program'} /> : null}

      {draft ? (
        <Card className="border-brand/40">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-semibold">{draft.name}</h2>
                  <Badge variant="warning">{isAr ? 'مسودة' : 'Draft'}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{draft.description}</p>
                {cost !== null ? (
                  <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                    ${cost.toFixed(4)}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                  <X />
                  {isAr ? 'ارميها' : 'Discard'}
                </Button>
                <Button onClick={accept} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}
                  {isAr ? 'اعتمدها' : 'Accept'}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {draft.weeks.map((week) => (
                <div key={week.weekNumber} className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {isAr ? `الأسبوع ${week.weekNumber}` : `Week ${week.weekNumber}`}
                    {week.note ? (
                      <span className="ms-2 font-normal text-muted-foreground">{week.note}</span>
                    ) : null}
                  </h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {week.days.map((day) => (
                      <div key={day.dayNumber} className="rounded-lg border p-3">
                        <p className="mb-1.5 text-sm font-medium">
                          {day.title || (isAr ? `اليوم ${day.dayNumber}` : `Day ${day.dayNumber}`)}
                        </p>
                        {day.isRestDay || day.items.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {isAr ? 'راحة' : 'Rest'}
                          </p>
                        ) : (
                          <ul className="space-y-1 text-xs">
                            {day.items.map((item, index) => (
                              <li key={index} className="flex justify-between gap-2">
                                <span className="min-w-0 truncate text-muted-foreground">
                                  {item.note || `#${index + 1}`}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {item.sets} × {item.reps}
                                  {item.rpe ? ` @${item.rpe}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'بعد الاعتماد هتفتح على باني البرنامج وتقدر تعدّل كل تمرين.'
                : 'Accepting opens the builder, where every exercise stays editable.'}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function NutritionDrafter({
  isAr,
  trainees,
  enabled,
  exhausted,
}: {
  isAr: boolean;
  trainees: { id: string; name: string }[];
  enabled: boolean;
  exhausted: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [traineeId, setTraineeId] = useState('');
  const [override, setOverride] = useState('');
  const [draft, setDraft] = useState<NutritionPlanDraft | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [busy, startBusy] = useTransition();

  const totals = draft
    ? draft.meals.reduce(
        (acc, meal) => {
          for (const item of meal.items) {
            acc.kcal += item.kcal;
            acc.protein += item.protein;
            acc.carbs += item.carbs;
            acc.fat += item.fat;
          }
          return acc;
        },
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      )
    : null;

  function generate() {
    setDraft(null);
    startBusy(async () => {
      const result = await draftNutritionPlan({
        traineeId,
        calorieTarget: override ? Number(override) : null,
      });
      if (!result.ok || !result.draft) {
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      setDraft(result.draft);
      setCost(result.costUsd ?? null);
    });
  }

  function accept() {
    if (!draft || !totals) return;
    startBusy(async () => {
      const result = await saveNutritionDraft({
        traineeId,
        // The plan's targets are what it actually adds up to, not what was
        // asked for — a coach reading it later should see the real numbers.
        calorieTarget: Math.round(totals.kcal),
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat),
        draft,
      });
      if (!result.ok) {
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      toast({ title: isAr ? 'اتحفظ النظام' : 'Plan saved', variant: 'success' });
      router.push(`/dash/nutrition/${result.id}`);
    });
  }

  return (
    <div className="space-y-4">
      <Gate isAr={isAr} enabled={enabled} exhausted={exhausted} />

      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-[1fr_160px_auto] sm:items-end">
          <TraineePicker isAr={isAr} trainees={trainees} value={traineeId} onChange={setTraineeId} />
          <Field
            label={isAr ? 'هدف السعرات' : 'Calorie target'}
            hint={isAr ? 'سيبها فاضية للحساب التلقائي' : 'Leave empty to compute it'}
          >
            <Input
              type="number"
              inputMode="numeric"
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder={isAr ? 'تلقائي' : 'Auto'}
            />
          </Field>
          <Button
            variant="brand"
            onClick={generate}
            disabled={!enabled || exhausted || busy || !traineeId}
          >
            {busy && !draft ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {isAr ? 'اكتب مسودة' : 'Draft it'}
          </Button>
        </CardContent>
      </Card>

      {busy && !draft ? <Thinking isAr={isAr} what={isAr ? 'النظام' : 'the plan'} /> : null}

      {draft && totals ? (
        <Card className="border-brand/40">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-semibold">{draft.name}</h2>
                  <Badge variant="warning">{isAr ? 'مسودة' : 'Draft'}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{draft.description}</p>
                <p className="mt-1 text-sm tabular-nums">
                  {Math.round(totals.kcal)} {isAr ? 'سعر' : 'kcal'} · {isAr ? 'بروتين' : 'P'}{' '}
                  {Math.round(totals.protein)} · {isAr ? 'كارب' : 'C'} {Math.round(totals.carbs)} ·{' '}
                  {isAr ? 'دهون' : 'F'} {Math.round(totals.fat)}
                </p>
                {cost !== null ? (
                  <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                    ${cost.toFixed(4)}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                  <X />
                  {isAr ? 'ارميها' : 'Discard'}
                </Button>
                <Button onClick={accept} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}
                  {isAr ? 'اعتمدها' : 'Accept'}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {draft.meals.map((meal, index) => (
                <div key={index} className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-medium">
                    {meal.name}
                    {meal.timeHint ? (
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        {meal.timeHint}
                      </span>
                    ) : null}
                  </p>
                  <ul className="space-y-1 text-xs">
                    {meal.items.map((item, itemIndex) => (
                      <li key={itemIndex} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{item.foodName}</span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {item.qty}
                          {item.unit} · {Math.round(item.kcal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {meal.note ? (
                    <p className="mt-2 text-xs text-muted-foreground">{meal.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
