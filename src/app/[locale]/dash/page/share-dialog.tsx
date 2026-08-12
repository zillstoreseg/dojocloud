'use client';

import { useState } from 'react';
import { Check, Copy, Download, Share2, MessageCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { pageQrCode } from './share-actions';

/**
 * Share sheet for the coach's page: copy link, QR code, and a WhatsApp
 * hand-off. The QR is fetched on open rather than rendered up front — it is a
 * few kilobytes of SVG that most visits to this screen never need.
 */
export function ShareDialog({
  locale,
  username,
  isAr,
}: {
  locale: string;
  username: string;
  isAr: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ url: string; qr: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const t = (ar: string, en: string) => (isAr ? ar : en);

  async function load(next: boolean) {
    setOpen(next);
    if (!next || data) return;
    setLoading(true);
    setData(await pageQrCode(locale));
    setLoading(false);
  }

  function copy() {
    if (!data) return;
    navigator.clipboard.writeText(data.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <Dialog open={open} onOpenChange={load}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 />
          {t('شارك', 'Share')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('شارك صفحتك', 'Share your page')}</DialogTitle>
          <DialogDescription>
            {t(
              'حط الرابط في بايو الانستجرام، أو اطبع الكود في الجيم.',
              'Put the link in your bio, or print the code at your gym.',
            )}
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.qr}
                alt={t('كود QR لصفحتك', 'QR code for your page')}
                className="size-52 rounded-lg border border-border/60 bg-white p-2"
              />
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 p-2">
              <code className="min-w-0 flex-1 truncate text-xs" dir="ltr">
                {data.url}
              </code>
              <Button variant="ghost" size="sm" onClick={copy}>
                {copied ? <Check className="text-primary" /> : <Copy />}
                {copied ? t('اتنسخ', 'Copied') : t('انسخ', 'Copy')}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" asChild>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(data.url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle />
                  {t('واتساب', 'WhatsApp')}
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={data.qr} download={`${username}-qr.svg`}>
                  <Download />
                  {t('نزّل الكود', 'Download QR')}
                </a>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
