'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { Camera, Check, Eye, EyeOff, KeyRound, Link2, Loader2, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChipSelect, ChipRadio } from '@/components/ui/chip-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import { initials } from '@/lib/utils';
import {
  updateProfile,
  updateAvatar,
  changeUsername,
  changePassword,
  setDirectoryListing,
  type ProfileInput,
} from './actions';

export type ProfileValues = ProfileInput;

interface Props {
  locale: string;
  values: ProfileValues;
  email: string;
  username: string;
  avatarUrl: string | null;
  country: string;
  isListed: boolean;
  cooldownDaysLeft: number;
  pageUrlBase: string;
  specialties: { value: string; label: string }[];
}

export function SettingsPanel({
  locale,
  values,
  email,
  username,
  avatarUrl,
  isListed,
  cooldownDaysLeft,
  pageUrlBase,
  specialties,
}: Props) {
  const isAr = locale === 'ar';

  return (
    <Tabs defaultValue="profile">
      <TabsList>
        <TabsTrigger value="profile">{isAr ? 'ملفي' : 'Profile'}</TabsTrigger>
        <TabsTrigger value="page">{isAr ? 'الرابط والظهور' : 'Handle & visibility'}</TabsTrigger>
        <TabsTrigger value="security">{isAr ? 'الأمان' : 'Security'}</TabsTrigger>
      </TabsList>

      <TabsContent value="profile">
        <ProfileTab
          isAr={isAr}
          values={values}
          avatarUrl={avatarUrl}
          specialties={specialties}
        />
      </TabsContent>

      <TabsContent value="page">
        <HandleTab
          isAr={isAr}
          username={username}
          isListed={isListed}
          cooldownDaysLeft={cooldownDaysLeft}
          pageUrlBase={pageUrlBase}
        />
      </TabsContent>

      <TabsContent value="security">
        <SecurityTab isAr={isAr} email={email} />
      </TabsContent>
    </Tabs>
  );
}

function ProfileTab({
  isAr,
  values,
  avatarUrl,
  specialties,
}: {
  isAr: boolean;
  values: ProfileValues;
  avatarUrl: string | null;
  specialties: { value: string; label: string }[];
}) {
  const { toast } = useToast();
  const avatarInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ProfileValues>(values);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();
  const [uploading, startUpload] = useTransition();

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  function save() {
    setErrors({});
    startSaving(async () => {
      const result = await updateProfile(draft);
      if (!result.ok) {
        if (result.field) setErrors({ [result.field]: result.error ?? '' });
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      toast({ title: isAr ? 'اتحفظت بياناتك' : 'Profile saved', variant: 'success' });
    });
  }

  function onAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    // Shown immediately; the upload replaces it with the stored URL.
    const preview = URL.createObjectURL(file);
    setAvatar(preview);

    const formData = new FormData();
    formData.append('avatar', file);

    startUpload(async () => {
      const result = await updateAvatar(formData);
      if (!result.ok) {
        setAvatar(avatarUrl);
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
        return;
      }
      toast({ title: isAr ? 'اتغيّرت صورتك' : 'Photo updated', variant: 'success' });
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-5 p-6">
          <div className="squircle relative size-24 shrink-0 bg-muted">
            {avatar ? (
              <Image src={avatar} alt="" fill sizes="96px" className="object-cover" unoptimized />
            ) : (
              <div className="flex size-full items-center justify-center font-display text-2xl font-semibold text-muted-foreground">
                {initials(draft.fullName || '؟')}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="font-display font-semibold">{isAr ? 'صورتك' : 'Your photo'}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {isAr
                ? 'دي أول حاجة الزائر بيشوفها في الدليل. صورة واضحة لوشك بتفرق كتير.'
                : 'The first thing a visitor sees in the directory. A clear photo of your face matters.'}
            </p>
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onAvatar}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => avatarInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
              {isAr ? 'غيّر الصورة' : 'Change photo'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={isAr ? 'الاسم بالكامل' : 'Full name'} htmlFor="s-name" required error={errors.fullName}>
              <Input
                id="s-name"
                value={draft.fullName}
                onChange={(e) => set('fullName', e.target.value)}
              />
            </Field>
            <Field label={isAr ? 'رقم الهاتف' : 'Phone'} htmlFor="s-phone" required error={errors.phone}>
              <Input
                id="s-phone"
                dir="ltr"
                inputMode="tel"
                value={draft.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </Field>
            <Field label={isAr ? 'المدينة' : 'City'} htmlFor="s-city">
              <Input id="s-city" value={draft.city ?? ''} onChange={(e) => set('city', e.target.value)} />
            </Field>
            <Field
              label={isAr ? 'سنوات الخبرة' : 'Years of experience'}
              htmlFor="s-years"
              required
              error={errors.yearsExperience}
            >
              <Input
                id="s-years"
                type="number"
                min={0}
                max={60}
                value={draft.yearsExperience}
                onChange={(e) => set('yearsExperience', Number(e.target.value) || 0)}
              />
            </Field>
          </div>

          <Field
            label={isAr ? 'تخصصاتك' : 'Your specialties'}
            required
            error={errors.specialties}
            hint={isAr ? 'من واحد إلى ستة — دي اللي الزوار بيفلتروا بيها' : 'One to six — visitors filter on these'}
          >
            <ChipSelect
              options={specialties}
              value={draft.specialties}
              max={6}
              onChange={(next) => set('specialties', next as ProfileValues['specialties'])}
            />
          </Field>

          <Field label={isAr ? 'بتدرّب مين؟' : 'Who do you train?'} required>
            <ChipRadio
              value={draft.trainsGenders}
              onChange={(next) => set('trainsGenders', next as ProfileValues['trainsGenders'])}
              options={[
                { value: 'MALE', label: isAr ? 'رجال' : 'Men' },
                { value: 'FEMALE', label: isAr ? 'سيدات' : 'Women' },
                { value: 'BOTH', label: isAr ? 'الاثنين' : 'Both' },
              ]}
            />
          </Field>

          <Field label={isAr ? 'نبذة عنك' : 'About you'} htmlFor="s-bio">
            <Textarea
              id="s-bio"
              rows={4}
              maxLength={1000}
              value={draft.bio ?? ''}
              onChange={(e) => set('bio', e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['instagram', 'Instagram'],
                ['tiktok', 'TikTok'],
                ['youtube', 'YouTube'],
                ['whatsapp', isAr ? 'واتساب' : 'WhatsApp'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label} htmlFor={`s-${key}`}>
                <Input
                  id={`s-${key}`}
                  dir="ltr"
                  value={(draft[key] as string) ?? ''}
                  onChange={(e) => set(key, e.target.value)}
                />
              </Field>
            ))}
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {isAr ? 'احفظ' : 'Save'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function HandleTab({
  isAr,
  username,
  isListed,
  cooldownDaysLeft,
  pageUrlBase,
}: {
  isAr: boolean;
  username: string;
  isListed: boolean;
  cooldownDaysLeft: number;
  pageUrlBase: string;
}) {
  const { toast } = useToast();
  const [handle, setHandle] = useState(username);
  const [listed, setListed] = useState(isListed);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [toggling, startToggle] = useTransition();

  const locked = cooldownDaysLeft > 0;

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await changeUsername({ username: handle });
      if (!result.ok) {
        setError(result.error ?? 'خطأ');
        return;
      }
      toast({ title: isAr ? 'اتغيّر رابطك' : 'Handle changed', variant: 'success' });
    });
  }

  function toggle(next: boolean) {
    setListed(next);
    startToggle(async () => {
      const result = await setDirectoryListing(next);
      if (!result.ok) {
        setListed(!next);
        toast({ title: result.error ?? 'خطأ', variant: 'error' });
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="font-display font-semibold">{isAr ? 'رابط صفحتك' : 'Your page handle'}</h2>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? 'الرابط ده اللي بتشاركه. تغييره بيكسر أي لينك قديم منشور، فتقدر تغيّره مرة كل شهر بس.'
                : 'This is the link you share. Changing it breaks anything already pointing at the old one, so it can change once a month.'}
            </p>
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {locked ? (
            <Alert variant="warning">
              <AlertDescription>
                {isAr
                  ? `غيّرته قريب. تقدر تغيّره تاني بعد ${cooldownDaysLeft} يوم.`
                  : `Recently changed. You can change it again in ${cooldownDaysLeft} days.`}
              </AlertDescription>
            </Alert>
          ) : null}

          <Field label={isAr ? 'اسم المستخدم' : 'Handle'} htmlFor="s-handle">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground" dir="ltr">
                /c/
              </span>
              <Input
                id="s-handle"
                dir="ltr"
                value={handle}
                disabled={locked}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
              />
            </div>
          </Field>

          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground" dir="ltr">
            <Link2 className="size-3.5 shrink-0" />
            {pageUrlBase}
            {handle}
          </p>

          <Button onClick={save} disabled={saving || locked || handle === username}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            {isAr ? 'غيّر الرابط' : 'Change handle'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {listed ? <Eye className="size-4 text-success" /> : <EyeOff className="size-4 text-muted-foreground" />}
              <h2 className="font-display font-semibold">
                {isAr ? 'الظهور في دليل المدربين' : 'Appear in the coach directory'}
              </h2>
            </div>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              {isAr
                ? 'لما يكون مفعّل، الزوار يقدروا يلاقوك في الدليل ويشتركوا معاك مباشرة. إطفاؤه بيخلي صفحتك تشتغل بالرابط بس.'
                : 'When on, visitors can find you in the directory and subscribe directly. Off, your page still works by link.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={listed ? 'success' : 'muted'}>
              {listed ? (isAr ? 'ظاهر' : 'Listed') : isAr ? 'مخفي' : 'Hidden'}
            </Badge>
            <Switch checked={listed} onCheckedChange={toggle} disabled={toggling} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityTab({ isAr, email }: { isAr: boolean; email: string }) {
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await changePassword({
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      if (!result.ok) {
        setError(result.error ?? 'خطأ');
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      toast({ title: isAr ? 'اتغيّرت كلمة السر' : 'Password changed', variant: 'success' });
    });
  }

  return (
    <Card>
      <CardContent className="max-w-md space-y-4 p-6">
        <div>
          <h2 className="font-display font-semibold">{isAr ? 'كلمة السر' : 'Password'}</h2>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {email}
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Field label={isAr ? 'كلمة السر الحالية' : 'Current password'} htmlFor="s-current" required>
          <Input
            id="s-current"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>

        <Field
          label={isAr ? 'كلمة السر الجديدة' : 'New password'}
          htmlFor="s-new"
          required
          hint={isAr ? '8 أحرف على الأقل' : 'At least 8 characters'}
        >
          <Input
            id="s-new"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>

        <Field label={isAr ? 'تأكيد كلمة السر' : 'Confirm password'} htmlFor="s-confirm" required>
          <Input
            id="s-confirm"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        <Button onClick={save} disabled={saving || !current || !next}>
          {saving ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {isAr ? 'غيّر كلمة السر' : 'Change password'}
        </Button>
      </CardContent>
    </Card>
  );
}
