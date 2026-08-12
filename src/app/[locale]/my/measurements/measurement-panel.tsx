'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { Camera, Loader2, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toaster';
import { TimeSeriesChart, type ChartDatum } from '@/components/charts/charts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { addMeasurement, addProgressPhoto } from '../actions';

export interface MeasurementRow {
  id: string;
  takenAt: string;
  sortKey: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  neckCm: number | null;
  photos: string[];
  note: string | null;
}

type FieldKey = Exclude<keyof MeasurementRow, 'id' | 'takenAt' | 'sortKey' | 'photos' | 'note'>;

const FIELDS: { key: FieldKey; ar: string; en: string; unit: string }[] = [
  { key: 'weightKg', ar: 'الوزن', en: 'Weight', unit: 'kg' },
  { key: 'bodyFatPct', ar: 'نسبة الدهون', en: 'Body fat', unit: '%' },
  { key: 'waistCm', ar: 'الوسط', en: 'Waist', unit: 'cm' },
  { key: 'chestCm', ar: 'الصدر', en: 'Chest', unit: 'cm' },
  { key: 'hipsCm', ar: 'الأرداف', en: 'Hips', unit: 'cm' },
  { key: 'armCm', ar: 'الذراع', en: 'Arm', unit: 'cm' },
  { key: 'thighCm', ar: 'الفخذ', en: 'Thigh', unit: 'cm' },
  { key: 'neckCm', ar: 'الرقبة', en: 'Neck', unit: 'cm' },
];

/**
 * Weigh-ins, tape, and photos.
 *
 * The chart plots weight against waist together on purpose: a trainee whose
 * weight stalls while their waist drops is making progress the scale is hiding,
 * and that is the single most common reason someone quits a plan that is
 * working.
 */
export function MeasurementPanel({ locale, rows }: { locale: string; rows: MeasurementRow[] }) {
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const reduced = useReducedMotion();
  const photoInput = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [saving, startSaving] = useTransition();
  const [uploading, startUploading] = useTransition();

  const chartData: ChartDatum[] = [...rows]
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map((row) => ({
      date: row.sortKey,
      weight: row.weightKg ?? 0,
      waist: row.waistCm ?? 0,
    }));

  function save() {
    const numbers = Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => [key, Number(value)]),
    );

    startSaving(async () => {
      const result = await addMeasurement({ ...numbers, note: note || undefined });
      if (!result.ok) {
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      setValues({});
      setNote('');
      toast({ title: isAr ? 'اتسجّل القياس' : 'Measurement saved', variant: 'success' });
    });
  }

  function onPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const formData = new FormData();
    formData.append('photo', file);

    startUploading(async () => {
      const result = await addProgressPhoto(formData);
      toast(
        result.ok
          ? { title: isAr ? 'اترفعت الصورة' : 'Photo added', variant: 'success' }
          : { title: result.error ?? 'خطأ', variant: 'error' },
      );
    });
  }

  const photos = rows.flatMap((row) => row.photos.map((url) => ({ url, date: row.takenAt })));

  return (
    <div className="space-y-6">
      {/* ── new entry ── */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-display font-semibold">
            {isAr ? 'سجّل قياس جديد' : 'Record a measurement'}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`m-${field.key}`} className="text-xs">
                  {isAr ? field.ar : field.en} ({field.unit})
                </Label>
                <Input
                  id={`m-${field.key}`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={values[field.key] ?? ''}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-note" className="text-xs">
              {isAr ? 'ملاحظة' : 'Note'}
            </Label>
            <Input
              id="m-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isAr ? 'نمت كويس؟ صايم؟' : 'Slept well? Fasted?'}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />}
              {isAr ? 'احفظ' : 'Save'}
            </Button>

            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={onPhoto}
            />
            <Button
              variant="outline"
              onClick={() => photoInput.current?.click()}
              disabled={uploading || rows.length === 0}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
              {isAr ? 'أضِف صورة تقدم' : 'Add a progress photo'}
            </Button>
          </div>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {isAr
                ? 'الصورة بتتربط بآخر قياس، فسجّل قياس الأول.'
                : 'Photos attach to your latest measurement — record one first.'}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title={isAr ? 'لسه مفيش قياسات' : 'No measurements yet'}
          description={
            isAr
              ? 'أول قياس هو نقطة البداية اللي هتقيس عليها كل حاجة بعد كده.'
              : 'Your first entry becomes the baseline everything else is read against.'
          }
        />
      ) : (
        <>
          <motion.div
            initial={{ opacity: 0, y: reduced ? 0 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.38, ease: [0.32, 0.72, 0, 1] }}
          >
            <Card>
              <CardContent className="space-y-3 p-6">
                <div>
                  <h2 className="font-display font-semibold">
                    {isAr ? 'الوزن والوسط' : 'Weight and waist'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isAr
                      ? 'وزن ثابت مع وسط بينزل معناه إنك ماشي صح.'
                      : 'A flat weight with a shrinking waist means it is working.'}
                  </p>
                </div>
                <TimeSeriesChart
                  data={chartData}
                  series={[
                    { key: 'weight', label: isAr ? 'الوزن (كجم)' : 'Weight (kg)', slot: 0 },
                    { key: 'waist', label: isAr ? 'الوسط (سم)' : 'Waist (cm)', slot: 1 },
                  ]}
                />
              </CardContent>
            </Card>
          </motion.div>

          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? 'التاريخ' : 'Date'}</TableHead>
                    {FIELDS.map((field) => (
                      <TableHead key={field.key} className="text-center">
                        {isAr ? field.ar : field.en}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">
                        {row.takenAt}
                      </TableCell>
                      {FIELDS.map((field) => (
                        <TableCell key={field.key} className="text-center tabular-nums">
                          {row[field.key] ?? '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {photos.length > 0 ? (
            <div className="space-y-3">
              <h2 className="font-display font-semibold">
                {isAr ? 'صور التقدم' : 'Progress photos'}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {photos.map((photo) => (
                  <figure key={photo.url} className="space-y-1">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={photo.url}
                        alt=""
                        fill
                        sizes="200px"
                        className="object-cover"
                      />
                    </div>
                    <figcaption className="text-center text-xs text-muted-foreground tabular-nums">
                      {photo.date}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
