'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { transition } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { uploadCertificate, deleteCertificate, resubmitForReview } from '@/app/[locale]/register/actions';

export interface CertificateRow {
  id: string;
  title: string;
  issuer: string | null;
  year: number | null;
  fileUrl: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
}

interface Props {
  locale: string;
  certificates: CertificateRow[];
  /** True once the trainer has been rejected and is fixing their submission. */
  isResubmission: boolean;
  labels: Record<string, string>;
}

const STATUS_VARIANT = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
} as const;

export function CertificateManager({ locale, certificates, isResubmission, labels }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [finishing, startFinish] = useTransition();

  function reset() {
    setFile(null);
    setTitle('');
    setIssuer('');
    setYear('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function onUpload() {
    setError(null);
    if (!file) {
      setError(labels.pickFile);
      return;
    }
    if (title.trim().length < 2) {
      setError(labels.needTitle);
      return;
    }

    const formData = new FormData();
    formData.set('file', file);
    formData.set('title', title.trim());
    formData.set('issuer', issuer.trim());
    if (year) formData.set('year', year);

    startUpload(async () => {
      const result = await uploadCertificate(formData);
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        return;
      }
      reset();
      router.refresh();
    });
  }

  function onDelete(id: string) {
    setError(null);
    setBusyId(id);
    startUpload(async () => {
      const result = await deleteCertificate({ id });
      setBusyId(null);
      if (!result.ok) {
        setError(result.error ?? labels.generic);
        return;
      }
      router.refresh();
    });
  }

  function onFinish() {
    setError(null);
    startFinish(async () => {
      if (isResubmission) {
        const result = await resubmitForReview();
        if (!result.ok) {
          setError(result.error ?? labels.generic);
          return;
        }
      }
      router.push(`/${locale}/onboarding/pending`);
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

      {/* ── Upload form ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 p-6">
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
              dragging ? 'border-primary bg-accent' : 'border-input hover:border-primary/50 hover:bg-accent/40',
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Upload className="size-5" />
            </span>
            <span className="text-sm font-medium">{file ? file.name : labels.dropzone}</span>
            <span className="text-xs text-muted-foreground">{labels.dropzoneHint}</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={labels.certTitle} htmlFor="cert-title" required className="sm:col-span-2">
              <Input
                id="cert-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={labels.certTitlePlaceholder}
              />
            </Field>
            <Field label={labels.certYear} htmlFor="cert-year">
              <Input
                id="cert-year"
                type="number"
                min={1950}
                max={new Date().getFullYear()}
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </Field>
          </div>

          <Field label={labels.certIssuer} htmlFor="cert-issuer">
            <Input
              id="cert-issuer"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder={labels.certIssuerPlaceholder}
            />
          </Field>

          <Button type="button" onClick={onUpload} loading={uploading && busyId === null}>
            {labels.addCertificate}
          </Button>
        </CardContent>
      </Card>

      {/* ── Uploaded so far ─────────────────────────────────────── */}
      {certificates.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={labels.emptyTitle}
          description={labels.emptyDescription}
        />
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {certificates.map((certificate) => (
              <motion.li
                key={certificate.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={transition.element}
              >
                <Card>
                  <CardContent className="flex items-center gap-3 p-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{certificate.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[certificate.issuer, certificate.year].filter(Boolean).join(' · ') ||
                          labels.noIssuer}
                      </p>
                      {certificate.reviewNote ? (
                        <p className="mt-1 text-xs text-destructive">{certificate.reviewNote}</p>
                      ) : null}
                    </div>
                    <Badge variant={STATUS_VARIANT[certificate.status]}>
                      {labels[`status${certificate.status}`]}
                    </Badge>
                    <a
                      href={certificate.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline-offset-2 hover:underline"
                    >
                      {labels.view}
                    </a>
                    {certificate.status === 'PENDING' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={labels.remove}
                        onClick={() => onDelete(certificate.id)}
                        disabled={uploading}
                      >
                        {busyId === certificate.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 className="text-destructive" />
                        )}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{labels.reviewNotice}</p>
        <Button
          type="button"
          onClick={onFinish}
          loading={finishing}
          disabled={certificates.length === 0}
        >
          {isResubmission ? labels.resubmit : labels.finish}
        </Button>
      </div>
    </div>
  );
}
