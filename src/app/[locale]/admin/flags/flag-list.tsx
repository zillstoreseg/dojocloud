'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toaster';
import { saveFlag, toggleFlagDefault, deleteFlag, removeUserOverride } from './actions';

export interface FlagView {
  key: string;
  name: string;
  description: string | null;
  type: 'BOOLEAN' | 'LIMIT';
  defaultEnabled: boolean;
  defaultLimit: number | null;
  category: string | null;
  isKillSwitch: boolean;
  planCount: number;
  overrides: Array<{ userId: string; email: string; enabled: boolean; limitValue: number | null; reason: string | null }>;
}

export function FlagList({ flags }: { flags: FlagView[] }) {
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = [...new Set(flags.map((f) => f.category ?? 'other'))];

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    startTransition(async () => {
      const result = await fn();
      toast({
        title: result.ok ? (result.message ?? '') : (result.error ?? ''),
        variant: result.ok ? 'success' : 'error',
      });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <FlagEditor
          trigger={
            <Button>
              <Plus />
              {isAr ? 'ميزة جديدة' : 'New flag'}
            </Button>
          }
        />
      </div>

      {categories.map((category) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base capitalize">{category}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الميزة' : 'Feature'}</TableHead>
                  <TableHead>{isAr ? 'النوع' : 'Type'}</TableHead>
                  <TableHead className="text-center">{isAr ? 'الافتراضي' : 'Default'}</TableHead>
                  <TableHead className="text-center">{isAr ? 'خطط' : 'Plans'}</TableHead>
                  <TableHead className="text-center">{isAr ? 'استثناءات' : 'Overrides'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags
                  .filter((f) => (f.category ?? 'other') === category)
                  .map((flag) => (
                    <Fragment key={flag.key}>
                      <TableRow>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 font-medium">
                                {flag.name}
                                {flag.isKillSwitch ? (
                                  <Badge variant="destructive" className="gap-1 text-[10px]">
                                    <AlertTriangle className="size-3" />
                                    {isAr ? 'مفتاح إيقاف' : 'kill switch'}
                                  </Badge>
                                ) : null}
                              </p>
                              <p className="text-xs text-muted-foreground" dir="ltr">
                                {flag.key}
                              </p>
                              {flag.description ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">{flag.description}</p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="muted">{flag.type}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={flag.defaultEnabled}
                            disabled={pending}
                            onCheckedChange={(v) => run(() => toggleFlagDefault({ key: flag.key, enabled: v }))}
                          />
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{flag.planCount}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpanded(expanded === flag.key ? null : flag.key)}
                          >
                            {flag.overrides.length}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <FlagEditor
                              flag={flag}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  {isAr ? 'تعديل' : 'Edit'}
                                </Button>
                              }
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={pending}
                              onClick={() => run(() => deleteFlag({ key: flag.key }))}
                            >
                              <Trash2 className="text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>

                      {expanded === flag.key && flag.overrides.length > 0 ? (
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={6}>
                            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                              {isAr ? 'استثناءات على مستوى المستخدم' : 'User-level overrides'}
                            </p>
                            <div className="space-y-1.5">
                              {flag.overrides.map((override) => (
                                <div
                                  key={override.userId}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2"
                                >
                                  <span className="text-sm" dir="ltr">
                                    {override.email}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={override.enabled ? 'success' : 'destructive'}>
                                      {override.enabled ? (isAr ? 'مفعّل' : 'on') : isAr ? 'معطّل' : 'off'}
                                    </Badge>
                                    {override.limitValue !== null ? (
                                      <Badge variant="muted">{override.limitValue}</Badge>
                                    ) : null}
                                    {override.reason ? (
                                      <span className="text-xs text-muted-foreground">{override.reason}</span>
                                    ) : null}
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      disabled={pending}
                                      onClick={() =>
                                        run(() =>
                                          removeUserOverride({ userId: override.userId, flagKey: flag.key }),
                                        )
                                      }
                                    >
                                      <X />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FlagEditor({ flag, trigger }: { flag?: FlagView; trigger: React.ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    key: flag?.key ?? '',
    name: flag?.name ?? '',
    description: flag?.description ?? '',
    type: flag?.type ?? ('BOOLEAN' as const),
    defaultEnabled: flag?.defaultEnabled ?? false,
    defaultLimit: flag?.defaultLimit ?? null,
    category: flag?.category ?? 'core',
    isKillSwitch: flag?.isKillSwitch ?? false,
  });

  function submit() {
    startTransition(async () => {
      const result = await saveFlag(form);
      toast({
        title: result.ok ? (result.message ?? '') : (result.error ?? ''),
        variant: result.ok ? 'success' : 'error',
      });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{flag ? (isAr ? 'تعديل الميزة' : 'Edit flag') : isAr ? 'ميزة جديدة' : 'New flag'}</DialogTitle>
          <DialogDescription>
            {isAr
              ? 'الافتراضي هنا هو الطبقة الأدنى؛ الخطة ثم استثناء المستخدم يفوقانه.'
              : 'The default here is the lowest layer; plan and user override outrank it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label={isAr ? 'المفتاح' : 'Key'} required hint="ai.workout_generation">
            <Input
              dir="ltr"
              value={form.key}
              disabled={Boolean(flag)}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
          </Field>
          <Field label={isAr ? 'الاسم' : 'Name'} required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={isAr ? 'الوصف' : 'Description'}>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isAr ? 'النوع' : 'Type'}>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as 'BOOLEAN' | 'LIMIT' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOOLEAN">{isAr ? 'تشغيل/إيقاف' : 'On / off'}</SelectItem>
                  <SelectItem value="LIMIT">{isAr ? 'حد رقمي' : 'Numeric limit'}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={isAr ? 'التصنيف' : 'Category'}>
              <Input dir="ltr" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
          </div>
          {form.type === 'LIMIT' ? (
            <Field label={isAr ? 'الحد الافتراضي' : 'Default limit'}>
              <Input
                type="number"
                dir="ltr"
                value={form.defaultLimit ?? ''}
                placeholder="∞"
                onChange={(e) =>
                  setForm({ ...form, defaultLimit: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </Field>
          ) : null}
          <label className="flex items-center justify-between gap-3 rounded-md border p-3">
            <span className="text-sm font-medium">{isAr ? 'مفعّلة افتراضيًا' : 'Enabled by default'}</span>
            <Switch
              checked={form.defaultEnabled}
              onCheckedChange={(v) => setForm({ ...form, defaultEnabled: v })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border p-3">
            <span>
              <span className="block text-sm font-medium">{isAr ? 'مفتاح إيقاف عام' : 'Kill switch'}</span>
              <span className="block text-xs text-muted-foreground">
                {isAr ? 'إطفاؤه يعطّل الميزة للجميع مهما كانت الخطة' : 'Turning it off disables the feature for everyone, regardless of plan'}
              </span>
            </span>
            <Switch checked={form.isKillSwitch} onCheckedChange={(v) => setForm({ ...form, isKillSwitch: v })} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button onClick={submit} loading={pending}>
            {isAr ? 'حفظ' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
