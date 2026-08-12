'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, Copy, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChipRadio } from '@/components/ui/chip-select';
import { cn } from '@/lib/utils';
import { submitReceipt } from '../../actions';

interface Props {
  locale: string;
  subscriptionId: string;
  instructions: {
    text: string;
    accounts: { label: string; value: string }[];
  };
  labels: Record<string, string>;
}

/** Copy button that confirms in place rather than firing a toast for one word. */
function CopyValue({ value, copiedLabel }: { value: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {copied ? copiedLabel : null}
    </Button>
  );
}

export function ReceiptForm({ locale, subscriptionId, instructions, labels }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('INSTAPAY');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  function onSubmit() {
    setError(null);
    if (!file) {
      setError(labels.pickFile);
      return;
    }

    const formData = new FormData();
    formData.set('subscriptionId', subscriptionId);
    formData.set('receipt', file);
    formData.set('reference', reference);
    formData.set('method', method);

    startSubmit(async () => {
      const result = await submitReceipt(formData);
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        if (result.next) router.push(`/${locale}${result.next}`);
        return;
      }
      router.push(`/${locale}${result.next}`);
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

      {/* Where to send the money */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-display font-semibold">{labels.transferTo}</h2>
          {instructions.text ? (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{instructions.text}</p>
          ) : null}

          {instructions.accounts.length > 0 ? (
            <ul className="space-y-2">
              {instructions.accounts.map((account) => (
                <li
                  key={account.label}
                  className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/40 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{account.label}</p>
                    {/* Wraps rather than truncates: an IBAN the payer cannot
                        read in full is not something they can check against
                        their banking app. */}
                    <p className="break-all font-medium tabular-nums" dir="ltr">
                      {account.value}
                    </p>
                  </div>
                  <CopyValue value={account.value} copiedLabel={labels.copied} />
                </li>
              ))}
            </ul>
          ) : (
            <Alert variant="warning">
              <AlertCircle />
              <AlertDescription>{labels.noAccounts}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Proof of transfer */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-display font-semibold">{labels.uploadReceipt}</h2>

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) setFile(dropped);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors duration-element ease-brand',
              dragging
                ? 'border-primary bg-accent'
                : 'border-input hover:border-primary/50 hover:bg-accent/40',
            )}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Upload className="size-5" />
            </span>
            <span className="text-sm font-medium">{file ? file.name : labels.dropzone}</span>
            <span className="text-xs text-muted-foreground">{labels.dropzoneHint}</span>
          </label>

          <Field label={labels.method}>
            <ChipRadio
              value={method}
              onChange={setMethod}
              options={[
                { value: 'INSTAPAY', label: labels.methodInstapay },
                { value: 'VODAFONE_CASH', label: labels.methodVodafone },
                { value: 'BANK_TRANSFER', label: labels.methodBank },
                { value: 'MANUAL_TRANSFER', label: labels.methodOther },
              ]}
            />
          </Field>

          <Field label={labels.reference} htmlFor="reference" hint={labels.referenceHint}>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              dir="ltr"
              className="max-w-72"
            />
          </Field>

          <Button type="button" onClick={onSubmit} loading={submitting}>
            {labels.submit}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
