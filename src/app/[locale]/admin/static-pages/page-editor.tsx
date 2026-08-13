'use client';

import { useState, useTransition } from 'react';
import { ExternalLink, Loader2, Lock, Plus, Save, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { saveStaticPage, deleteStaticPage, type StaticPageInput } from './actions';

export interface StaticPageRow extends StaticPageInput {
  updatedAt: string;
  /** Terms and privacy cannot be deleted, only hidden. */
  protected: boolean;
}

const BLANK: StaticPageInput = {
  slug: '',
  titleAr: '',
  titleEn: '',
  contentAr: '',
  contentEn: '',
  status: 'DRAFT',
};

export function PageEditor({ locale, rows }: { locale: string; rows: StaticPageRow[] }) {
  const isAr = locale === 'ar';
  const [selected, setSelected] = useState<string>(rows[0]?.slug ?? '__new');

  const active =
    selected === '__new'
      ? { ...BLANK, updatedAt: '', protected: false }
      : (rows.find((row) => row.slug === selected) ?? { ...BLANK, updatedAt: '', protected: false });

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit">
        <CardContent className="space-y-1 p-2">
          {rows.map((row) => (
            <button
              key={row.slug}
              type="button"
              onClick={() => setSelected(row.slug)}
              className={`flex w-full items-center gap-2 rounded-lg p-3 text-start transition-colors hover:bg-accent/50 ${
                selected === row.slug ? 'bg-accent' : ''
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {isAr ? row.titleAr : row.titleEn}
                </span>
                <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                  /p/{row.slug}
                </span>
              </span>
              {row.protected ? <Lock className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              {row.status !== 'PUBLISHED' ? <Badge variant="muted">{row.status}</Badge> : null}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSelected('__new')}
            className={`flex w-full items-center gap-2 rounded-lg p-3 text-start text-sm text-muted-foreground transition-colors hover:bg-accent/50 ${
              selected === '__new' ? 'bg-accent' : ''
            }`}
          >
            <Plus className="size-4" />
            {isAr ? 'صفحة جديدة' : 'New page'}
          </button>
        </CardContent>
      </Card>

      <PageForm
        key={selected}
        isAr={isAr}
        locale={locale}
        initial={active}
        isNew={selected === '__new'}
        onSaved={(slug) => setSelected(slug)}
      />
    </div>
  );
}

function PageForm({
  isAr,
  locale,
  initial,
  isNew,
  onSaved,
}: {
  isAr: boolean;
  locale: string;
  initial: StaticPageRow;
  isNew: boolean;
  onSaved: (slug: string) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<StaticPageInput>({
    slug: initial.slug,
    titleAr: initial.titleAr,
    titleEn: initial.titleEn,
    contentAr: initial.contentAr,
    contentEn: initial.contentEn,
    status: initial.status,
  });
  const [saving, startSaving] = useTransition();
  const [removing, startRemoving] = useTransition();

  const set = <K extends keyof StaticPageInput>(key: K, value: StaticPageInput[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function save() {
    startSaving(async () => {
      const result = await saveStaticPage(draft);
      if (!result.ok) {
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      toast({ title: isAr ? 'اتحفظت الصفحة' : 'Page saved', variant: 'success' });
      onSaved(draft.slug);
    });
  }

  function remove() {
    startRemoving(async () => {
      const result = await deleteStaticPage(draft.slug);
      toast(
        result.ok
          ? { title: isAr ? 'اتحذفت الصفحة' : 'Page deleted', variant: 'success' }
          : { title: result.error ?? 'خطأ', variant: 'error' },
      );
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <Field
            label={isAr ? 'الرابط (slug)' : 'Slug'}
            htmlFor="p-slug"
            required
            hint={isAr ? 'حروف إنجليزية صغيرة وأرقام وشرطة' : 'Lowercase letters, digits, hyphens'}
          >
            <Input
              id="p-slug"
              dir="ltr"
              value={draft.slug}
              disabled={!isNew}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
            />
          </Field>

          <Field label={isAr ? 'الحالة' : 'Status'}>
            <Select
              value={draft.status}
              onValueChange={(value) => set('status', value as StaticPageInput['status'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLISHED">{isAr ? 'منشورة' : 'Published'}</SelectItem>
                <SelectItem value="DRAFT">{isAr ? 'مسودة' : 'Draft'}</SelectItem>
                <SelectItem value="HIDDEN">{isAr ? 'مخفية' : 'Hidden'}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Tabs defaultValue="ar">
          <TabsList>
            <TabsTrigger value="ar">العربية</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>

          <TabsContent value="ar" className="space-y-4">
            <Field label="العنوان" htmlFor="p-title-ar" required>
              <Input
                id="p-title-ar"
                value={draft.titleAr}
                onChange={(e) => set('titleAr', e.target.value)}
              />
            </Field>
            <Field
              label="المحتوى"
              htmlFor="p-content-ar"
              required
              hint="سطر فاضي بين كل فقرة والتانية"
            >
              <Textarea
                id="p-content-ar"
                rows={16}
                value={draft.contentAr}
                onChange={(e) => set('contentAr', e.target.value)}
              />
            </Field>
          </TabsContent>

          <TabsContent value="en" className="space-y-4">
            <Field label="Title" htmlFor="p-title-en" required>
              <Input
                id="p-title-en"
                dir="ltr"
                value={draft.titleEn}
                onChange={(e) => set('titleEn', e.target.value)}
              />
            </Field>
            <Field
              label="Content"
              htmlFor="p-content-en"
              required
              hint="Leave a blank line between paragraphs"
            >
              <Textarea
                id="p-content-en"
                dir="ltr"
                rows={16}
                value={draft.contentEn}
                onChange={(e) => set('contentEn', e.target.value)}
              />
            </Field>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {isAr ? 'احفظ' : 'Save'}
          </Button>

          {!isNew ? (
            <Button variant="ghost" asChild>
              <a href={`/${locale}/p/${draft.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink />
                {isAr ? 'اعرضها' : 'View'}
              </a>
            </Button>
          ) : null}

          {!isNew && !initial.protected ? (
            <Button variant="ghost" className="ms-auto text-destructive" onClick={remove} disabled={removing}>
              {removing ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {isAr ? 'احذف' : 'Delete'}
            </Button>
          ) : null}

          {initial.protected ? (
            <p className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" />
              {isAr ? 'صفحة أساسية — تتخفي ولا تتحذف' : 'Core page — can be hidden, not deleted'}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
