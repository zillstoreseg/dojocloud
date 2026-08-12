'use client';

import { useState, useTransition } from 'react';
import { Phone, Mail, MessageCircle, UserPlus, Trash2, ChevronDown } from 'lucide-react';
import type { LeadStatus } from '@prisma/client';
import { Link, useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChipRadio } from '@/components/ui/chip-select';
import { RevealGroup, RevealItem } from '@/components/motion/reveal';
import { cn } from '@/lib/utils';
import { convertLead, deleteLead, setLeadNote, setLeadStatus } from './actions';

export interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  goal: string | null;
  message: string | null;
  note: string | null;
  status: LeadStatus;
  source: string | null;
  convertedTraineeId: string | null;
  createdAt: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted' | 'default'> = {
  NEW: 'default',
  CONTACTED: 'warning',
  CONVERTED: 'success',
  LOST: 'muted',
};

/**
 * Leads as cards rather than a table row: the useful actions here — call,
 * WhatsApp, convert — are all one tap, and a phone number that needs a row
 * expanded before it can be dialled is a phone number that does not get dialled.
 */
export function LeadList({
  rows,
  locale,
  statusLabels,
}: {
  rows: LeadRow[];
  locale: string;
  statusLabels: Record<string, string>;
}) {
  const isAr = locale === 'ar';
  return (
    <RevealGroup className="grid gap-3 md:grid-cols-2" as="div">
      {rows.map((lead) => (
        <RevealItem key={lead.id}>
          <LeadCard lead={lead} isAr={isAr} statusLabels={statusLabels} />
        </RevealItem>
      ))}
    </RevealGroup>
  );
}

function LeadCard({
  lead,
  isAr,
  statusLabels,
}: {
  lead: LeadRow;
  isAr: boolean;
  statusLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(lead.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const tel = lead.phone.replace(/[^\d+]/g, '');
  const wa = lead.phone.replace(/[^\d]/g, '');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startBusy(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? (isAr ? 'حصل خطأ' : 'Something went wrong'));
      else router.refresh();
    });
  }

  return (
    <Card className={cn('h-full', lead.status === 'LOST' && 'opacity-60')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{lead.name}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {lead.phone}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[lead.status] ?? 'muted'}>
            {statusLabels[lead.status] ?? lead.status}
          </Badge>
        </div>

        {lead.goal ? (
          <p className="text-sm">
            <span className="text-muted-foreground">{isAr ? 'هدفه: ' : 'Goal: '}</span>
            {lead.goal}
          </p>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`tel:${tel}`}>
              <Phone />
              {isAr ? 'اتصل' : 'Call'}
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle />
              {isAr ? 'واتساب' : 'WhatsApp'}
            </a>
          </Button>
          {lead.email ? (
            <Button variant="outline" size="sm" asChild>
              <a href={`mailto:${lead.email}`}>
                <Mail />
                {isAr ? 'إيميل' : 'Email'}
              </a>
            </Button>
          ) : null}

          {lead.convertedTraineeId ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dash/trainees/${lead.convertedTraineeId}`}>
                <UserPlus />
                {isAr ? 'افتح ملفه' : 'Open profile'}
              </Link>
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => run(() => convertLead({ id: lead.id }))}>
              <UserPlus />
              {isAr ? 'حوّله لمتدرب' : 'Convert'}
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="ms-auto"
          >
            {isAr ? 'تفاصيل' : 'Details'}
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        </div>

        {open ? (
          <div className="space-y-3 border-t border-border/60 pt-3">
            {lead.message ? (
              <p className="whitespace-pre-line rounded-md bg-muted/50 p-3 text-sm">
                {lead.message}
              </p>
            ) : null}

            <ChipRadio
              value={lead.status}
              onChange={(v) => run(() => setLeadStatus({ id: lead.id, status: v as LeadStatus }))}
              options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
            />

            <div className="space-y-2">
              <Textarea
                rows={2}
                value={note}
                placeholder={isAr ? 'ملاحظاتك عنه…' : 'Your notes…'}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => {
                  if (note !== (lead.note ?? '')) run(() => setLeadNote({ id: lead.id, note }));
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {lead.createdAt}
                  {lead.source ? ` · ${lead.source}` : ''}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(isAr ? `تحذف ${lead.name}؟` : `Delete ${lead.name}?`)) return;
                    run(() => deleteLead({ id: lead.id }));
                  }}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
