'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { ChipRadio } from '@/components/ui/chip-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RevealGroup, RevealItem } from '@/components/motion/reveal';
import { createPackage, updatePackage, deletePackage, type PackageInput } from './actions';

export interface PackageCard extends PackageInput {
  id: string;
  priceLabel: string;
  subscriberCount: number;
}

interface Props {
  rows: PackageCard[];
  currencies: string[];
  defaultCurrency: string;
  labels: Record<string, string>;
}

export function PackageList({ rows, currencies, defaultCurrency, labels }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<PackageInput>({
    name: '',
    description: '',
    price: 0,
    currency: defaultCurrency as PackageInput['currency'],
    durationDays: 30,
    sessionsCount: null,
    isPublic: true,
    isActive: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const set = <K extends keyof PackageInput>(key: K, value: PackageInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function openAdd() {
    setEditingId(null);
    setValues({
      name: '',
      description: '',
      price: 0,
      currency: defaultCurrency as PackageInput['currency'],
      durationDays: 30,
      sessionsCount: null,
      isPublic: true,
      isActive: true,
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(row: PackageCard) {
    setEditingId(row.id);
    setValues({
      name: row.name,
      description: row.description ?? '',
      price: row.price,
      currency: row.currency,
      durationDays: row.durationDays,
      sessionsCount: row.sessionsCount ?? null,
      isPublic: row.isPublic,
      isActive: row.isActive,
    });
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    startBusy(async () => {
      const result = editingId
        ? await updatePackage({ ...values, id: editingId })
        : await createPackage(values);
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function remove(row: PackageCard) {
    const message =
      row.subscriberCount > 0
        ? labels.confirmDeactivate.replace('{name}', row.name)
        : labels.confirmDelete.replace('{name}', row.name);
    if (!confirm(message)) return;
    startBusy(async () => {
      await deletePackage({ id: row.id });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={openAdd}>
          <Plus />
          {labels.add}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title={labels.emptyTitle}
          description={labels.emptyDescription}
          action={
            <Button size="sm" onClick={openAdd}>
              {labels.add}
            </Button>
          }
        />
      ) : (
        <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <RevealItem key={row.id}>
              <Card className={row.isActive ? 'h-full' : 'h-full opacity-70'}>
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{row.name}</p>
                    <Badge variant={row.isPublic ? 'muted' : 'outline'} className="shrink-0 gap-1">
                      {row.isPublic ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                      {row.isPublic ? labels.public : labels.private}
                    </Badge>
                  </div>

                  <p className="font-display text-2xl font-semibold tabular-nums text-primary">
                    {row.priceLabel}
                  </p>

                  <p className="text-sm text-muted-foreground">
                    {labels.durationDays.replace('{days}', String(row.durationDays))}
                    {row.sessionsCount
                      ? ` · ${labels.sessions.replace('{n}', String(row.sessionsCount))}`
                      : ''}
                  </p>

                  {row.description ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {row.description}
                    </p>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between gap-1 pt-2">
                    <span className="text-xs text-muted-foreground">
                      {labels.subscribers.replace('{n}', String(row.subscriberCount))}
                    </span>
                    <span className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                        <Pencil />
                        {labels.edit}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={labels.delete}
                        onClick={() => remove(row)}
                        disabled={busy}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </span>
                  </div>
                </CardContent>
              </Card>
            </RevealItem>
          ))}
        </RevealGroup>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? labels.editTitle : labels.addTitle}</DialogTitle>
            <DialogDescription>{labels.formSubtitle}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label={labels.name} htmlFor="pk-name" required>
              <Input id="pk-name" value={values.name} onChange={(e) => set('name', e.target.value)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={labels.price} htmlFor="pk-price" required>
                <Input
                  id="pk-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={values.price}
                  onChange={(e) => set('price', Number(e.target.value))}
                />
              </Field>
              <Field label={labels.currency} required>
                <ChipRadio
                  value={values.currency}
                  onChange={(v) => set('currency', v as PackageInput['currency'])}
                  options={currencies.map((c) => ({ value: c, label: c }))}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={labels.duration} htmlFor="pk-duration" required>
                <Input
                  id="pk-duration"
                  type="number"
                  min={1}
                  value={values.durationDays}
                  onChange={(e) => set('durationDays', Number(e.target.value))}
                />
              </Field>
              <Field label={labels.sessionsCount} htmlFor="pk-sessions" hint={labels.sessionsHint}>
                <Input
                  id="pk-sessions"
                  type="number"
                  min={0}
                  value={values.sessionsCount ?? ''}
                  onChange={(e) =>
                    set('sessionsCount', e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </Field>
            </div>

            <Field label={labels.description} htmlFor="pk-desc">
              <Textarea
                id="pk-desc"
                rows={3}
                value={values.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>

            <div className="flex flex-col gap-3 rounded-md border border-border/60 p-4">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{labels.isPublic}</span>
                  <span className="block text-xs text-muted-foreground">{labels.isPublicHint}</span>
                </span>
                <Switch
                  checked={values.isPublic}
                  onCheckedChange={(checked) => set('isPublic', checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{labels.isActive}</span>
                <Switch
                  checked={values.isActive}
                  onCheckedChange={(checked) => set('isActive', checked)}
                />
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {labels.cancel}
            </Button>
            <Button onClick={save} loading={busy}>
              {labels.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
