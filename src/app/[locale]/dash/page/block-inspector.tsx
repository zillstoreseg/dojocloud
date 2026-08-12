'use client';

import { useState, useTransition, useRef, useCallback } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import type { BlockType } from '@prisma/client';
import { BLOCK_LABELS, BLOCK_HINTS, parseBlockProps } from '@/lib/page-blocks';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { ChipRadio, ChipSelect } from '@/components/ui/chip-select';
import { cn } from '@/lib/utils';
import type { BlockNode } from '@/components/landing/context';
import { updateBlockProps } from './actions';

type Props = Record<string, unknown>;

/**
 * Property editor for the selected block.
 *
 * Edits save on their own after a pause rather than behind a Save button: in a
 * builder with a live preview, an explicit save turns every tweak into a
 * two-step, and the preview stops being an accurate picture the moment the two
 * diverge. The saving indicator is what replaces the button.
 */
export function BlockInspector({
  block,
  isAr,
  packages,
  stats,
}: {
  block: BlockNode;
  isAr: boolean;
  packages: { id: string; label: string }[];
  stats: { views: number; leads: number };
}) {
  const type = block.type as BlockType;
  const [props, setProps] = useState<Props>(
    parseBlockProps(type, block.props) as unknown as Props,
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (next: Props) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        startBusy(async () => {
          const result = await updateBlockProps({ id: block.id, props: next });
          if (result.ok) {
            setError(null);
            setSaved(true);
            setTimeout(() => setSaved(false), 1600);
          } else {
            setError(result.error ?? null);
          }
        });
      }, 500);
    },
    [block.id],
  );

  const set = useCallback(
    (key: string, value: unknown) => {
      setProps((prev) => {
        const next = { ...prev, [key]: value };
        save(next);
        return next;
      });
    },
    [save],
  );

  const t = (ar: string, en: string) => (isAr ? ar : en);

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-semibold">{BLOCK_LABELS[type][isAr ? 'ar' : 'en']}</h2>
          <span
            className={cn(
              'flex items-center gap-1 text-xs transition-opacity',
              busy || saved ? 'opacity-100' : 'opacity-0',
            )}
          >
            {busy ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {t('بيحفظ…', 'Saving…')}
              </>
            ) : (
              <>
                <Check className="size-3 text-primary" />
                {t('اتحفظ', 'Saved')}
              </>
            )}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{BLOCK_HINTS[type][isAr ? 'ar' : 'en']}</p>
      </header>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      {type === 'HERO' ? (
        <>
          <Field label={t('العنوان', 'Headline')}>
            <Input
              value={String(props.headline ?? '')}
              onChange={(e) => set('headline', e.target.value)}
            />
          </Field>
          <Field label={t('السطر تحته', 'Subheadline')}>
            <Textarea
              rows={3}
              value={String(props.subheadline ?? '')}
              onChange={(e) => set('subheadline', e.target.value)}
            />
          </Field>
          <Field label={t('نص الزر', 'Button label')}>
            <Input
              value={String(props.ctaLabel ?? '')}
              onChange={(e) => set('ctaLabel', e.target.value)}
            />
          </Field>
          <Field label={t('رابط الزر', 'Button link')} hint={t('فاضي = ينزّل على الباقات', 'Empty scrolls to packages')}>
            <Input
              dir="ltr"
              value={String(props.ctaHref ?? '')}
              onChange={(e) => set('ctaHref', e.target.value)}
            />
          </Field>
          <Field label={t('صورة', 'Image URL')}>
            <Input
              dir="ltr"
              value={String(props.imageUrl ?? '')}
              onChange={(e) => set('imageUrl', e.target.value)}
            />
          </Field>
          <Field label={t('المحاذاة', 'Alignment')}>
            <ChipRadio
              value={String(props.align ?? 'start')}
              onChange={(v) => set('align', v)}
              options={[
                { value: 'start', label: t('لجنب', 'Side') },
                { value: 'center', label: t('في النص', 'Centered') },
              ]}
            />
          </Field>
          <ToggleRow
            label={t('اعرض الأرقام', 'Show stats')}
            checked={Boolean(props.showStats)}
            onChange={(v) => set('showStats', v)}
          />
        </>
      ) : null}

      {type === 'ABOUT' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <Field label={t('النص', 'Body')}>
            <Textarea
              rows={8}
              value={String(props.body ?? '')}
              onChange={(e) => set('body', e.target.value)}
            />
          </Field>
          <Field label={t('صورة', 'Image URL')}>
            <Input
              dir="ltr"
              value={String(props.imageUrl ?? '')}
              onChange={(e) => set('imageUrl', e.target.value)}
            />
          </Field>
        </>
      ) : null}

      {type === 'STATS' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <RepeatingList
            items={(props.items as { value: string; label: string }[]) ?? []}
            onChange={(items) => set('items', items)}
            blank={{ value: '', label: '' }}
            max={6}
            addLabel={t('أضف رقم', 'Add a stat')}
            render={(item, update) => (
              <>
                <Input
                  placeholder={t('الرقم', 'Value')}
                  value={item.value}
                  onChange={(e) => update({ ...item, value: e.target.value })}
                />
                <Input
                  placeholder={t('الوصف', 'Label')}
                  value={item.label}
                  onChange={(e) => update({ ...item, label: e.target.value })}
                />
              </>
            )}
          />
        </>
      ) : null}

      {type === 'SERVICES' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <RepeatingList
            items={(props.items as { title: string; body: string; icon: string }[]) ?? []}
            onChange={(items) => set('items', items)}
            blank={{ title: '', body: '', icon: '' }}
            max={9}
            addLabel={t('أضف خدمة', 'Add a service')}
            render={(item, update) => (
              <>
                <Input
                  placeholder={t('الخدمة', 'Title')}
                  value={item.title}
                  onChange={(e) => update({ ...item, title: e.target.value })}
                />
                <Textarea
                  rows={2}
                  placeholder={t('الوصف', 'Description')}
                  value={item.body}
                  onChange={(e) => update({ ...item, body: e.target.value })}
                />
              </>
            )}
          />
        </>
      ) : null}

      {type === 'PACKAGES' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <SubtitleField value={props} set={set} isAr={isAr} />
          <Field
            label={t('الباقات المعروضة', 'Packages shown')}
            hint={t('سيبها فاضية عشان تعرض كل باقاتك تلقائيًا', 'Leave empty to show them all')}
          >
            <ChipSelect
              value={(props.packageIds as string[]) ?? []}
              onChange={(v) => set('packageIds', v)}
              options={packages.map((p) => ({ value: p.id, label: p.label }))}
            />
          </Field>
        </>
      ) : null}

      {(type === 'CERTIFICATES' || type === 'TRANSFORMATIONS' || type === 'TESTIMONIALS') ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <SubtitleField value={props} set={set} isAr={isAr} />
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            {type === 'CERTIFICATES'
              ? t(
                  'البلوك ده بيعرض شهاداتك المعتمدة من الإدارة تلقائيًا.',
                  'This block lists your admin-approved certificates automatically.',
                )
              : t(
                  'المحتوى بيتسحب من بياناتك، مش من هنا.',
                  'The content comes from your own records, not from here.',
                )}
          </p>
        </>
      ) : null}

      {type === 'GALLERY' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <RepeatingList
            items={(props.images as { url: string; caption: string }[]) ?? []}
            onChange={(items) => set('images', items)}
            blank={{ url: '', caption: '' }}
            max={24}
            addLabel={t('أضف صورة', 'Add an image')}
            render={(item, update) => (
              <>
                <Input
                  dir="ltr"
                  placeholder="https://…"
                  value={item.url}
                  onChange={(e) => update({ ...item, url: e.target.value })}
                />
                <Input
                  placeholder={t('تعليق', 'Caption')}
                  value={item.caption}
                  onChange={(e) => update({ ...item, caption: e.target.value })}
                />
              </>
            )}
          />
        </>
      ) : null}

      {type === 'VIDEO' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <Field label={t('رابط الفيديو', 'Video URL')} hint="YouTube / Vimeo">
            <Input dir="ltr" value={String(props.url ?? '')} onChange={(e) => set('url', e.target.value)} />
          </Field>
          <Field label={t('تعليق', 'Caption')}>
            <Input
              value={String(props.caption ?? '')}
              onChange={(e) => set('caption', e.target.value)}
            />
          </Field>
        </>
      ) : null}

      {type === 'FAQ' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <RepeatingList
            items={(props.items as { q: string; a: string }[]) ?? []}
            onChange={(items) => set('items', items)}
            blank={{ q: '', a: '' }}
            max={20}
            addLabel={t('أضف سؤال', 'Add a question')}
            render={(item, update) => (
              <>
                <Input
                  placeholder={t('السؤال', 'Question')}
                  value={item.q}
                  onChange={(e) => update({ ...item, q: e.target.value })}
                />
                <Textarea
                  rows={3}
                  placeholder={t('الإجابة', 'Answer')}
                  value={item.a}
                  onChange={(e) => update({ ...item, a: e.target.value })}
                />
              </>
            )}
          />
        </>
      ) : null}

      {type === 'CONTACT_FORM' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <SubtitleField value={props} set={set} isAr={isAr} />
          <Field label={t('نص الزر', 'Button label')}>
            <Input
              value={String(props.buttonLabel ?? '')}
              onChange={(e) => set('buttonLabel', e.target.value)}
            />
          </Field>
          <Field label={t('رسالة بعد الإرسال', 'Success message')}>
            <Textarea
              rows={2}
              value={String(props.successMessage ?? '')}
              onChange={(e) => set('successMessage', e.target.value)}
            />
          </Field>
          <ToggleRow
            label={t('اسأل عن الهدف', 'Ask for their goal')}
            checked={Boolean(props.askGoal)}
            onChange={(v) => set('askGoal', v)}
          />
          <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            {t(
              `الصفحة جابت ${stats.views} زيارة و${stats.leads} عميل محتمل.`,
              `${stats.views} views and ${stats.leads} leads so far.`,
            )}
          </div>
        </>
      ) : null}

      {type === 'CTA_WHATSAPP' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <Field label={t('النص', 'Body')}>
            <Textarea
              rows={3}
              value={String(props.body ?? '')}
              onChange={(e) => set('body', e.target.value)}
            />
          </Field>
          <Field label={t('رقم واتساب', 'WhatsApp number')} hint={t('فاضي = رقمك المسجّل', 'Empty uses your account number')}>
            <Input dir="ltr" value={String(props.phone ?? '')} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label={t('نص الزر', 'Button label')}>
            <Input
              value={String(props.buttonLabel ?? '')}
              onChange={(e) => set('buttonLabel', e.target.value)}
            />
          </Field>
          <Field label={t('رسالة جاهزة', 'Prefilled message')}>
            <Textarea
              rows={2}
              value={String(props.prefilledMessage ?? '')}
              onChange={(e) => set('prefilledMessage', e.target.value)}
            />
          </Field>
        </>
      ) : null}

      {type === 'SOCIAL_LINKS' ? (
        <>
          <TitleField value={props} set={set} isAr={isAr} />
          <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            {t(
              'الروابط بتتسحب من إعدادات حسابك.',
              'The links come from your account settings.',
            )}
          </p>
        </>
      ) : null}

      {type === 'CUSTOM_HTML' ? (
        <Field label="HTML" hint={t('انتبه: الكود بيتعرض زي ما هو.', 'Rendered as-is.')}>
          <Textarea
            dir="ltr"
            rows={12}
            className="font-mono text-xs"
            value={String(props.html ?? '')}
            onChange={(e) => set('html', e.target.value)}
          />
        </Field>
      ) : null}
    </div>
  );
}

function TitleField({
  value,
  set,
  isAr,
}: {
  value: Props;
  set: (k: string, v: unknown) => void;
  isAr: boolean;
}) {
  return (
    <Field label={isAr ? 'العنوان' : 'Title'}>
      <Input value={String(value.title ?? '')} onChange={(e) => set('title', e.target.value)} />
    </Field>
  );
}

function SubtitleField({
  value,
  set,
  isAr,
}: {
  value: Props;
  set: (k: string, v: unknown) => void;
  isAr: boolean;
}) {
  return (
    <Field label={isAr ? 'سطر تعريفي' : 'Subtitle'}>
      <Input
        value={String(value.subtitle ?? '')}
        onChange={(e) => set('subtitle', e.target.value)}
      />
    </Field>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

/** Add/remove/edit rows for the blocks whose content is a list. */
function RepeatingList<T>({
  items,
  onChange,
  blank,
  max,
  addLabel,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  blank: T;
  max: number;
  addLabel: string;
  render: (item: T, update: (next: T) => void) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border/60 p-3">
          {render(item, (next) => onChange(items.map((row, j) => (j === i ? next : row))))}
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      ))}
      {items.length < max ? (
        <Button variant="outline" size="sm" className="w-full" onClick={() => onChange([...items, blank])}>
          <Plus />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}
