'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import { saveSettings, clearSecret } from './actions';

export interface SettingFieldDef {
  key: string;
  label: string;
  hint?: string;
  type: 'text' | 'textarea' | 'password' | 'boolean' | 'number' | 'color';
  dir?: 'ltr' | 'rtl';
  placeholder?: string;
}

export interface SettingGroup {
  id: string;
  title: string;
  description: string;
  fields: SettingFieldDef[];
}

export function SettingsForm({
  groups,
  values,
  /** Keys whose secret is already stored — shown as "set" without revealing it. */
  secretsPresent,
}: {
  groups: SettingGroup[];
  values: Record<string, string>;
  secretsPresent: string[];
}) {
  const router = useRouter();
  const locale = useLocale();
  const isAr = locale === 'ar';
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>(values);
  const [pending, startTransition] = useTransition();

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  function submit() {
    startTransition(async () => {
      const result = await saveSettings(form);
      toast({
        title: result.ok ? (result.message ?? '') : (result.error ?? ''),
        variant: result.ok ? 'success' : 'error',
      });
      if (result.ok) router.refresh();
    });
  }

  function removeSecret(key: string) {
    startTransition(async () => {
      const result = await clearSecret({ key });
      toast({
        title: result.ok ? (result.message ?? '') : (result.error ?? ''),
        variant: result.ok ? 'success' : 'error',
      });
      if (result.ok) {
        set(key, '');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue={groups[0]?.id}>
        <TabsList className="h-auto flex-wrap">
          {groups.map((group) => (
            <TabsTrigger key={group.id} value={group.id}>
              {group.title}
            </TabsTrigger>
          ))}
        </TabsList>

        {groups.map((group) => (
          <TabsContent key={group.id} value={group.id}>
            <Card>
              <CardHeader>
                <CardTitle>{group.title}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {group.fields.map((field) => {
                  const value = form[field.key] ?? '';
                  const isSecretSet = secretsPresent.includes(field.key);

                  if (field.type === 'boolean') {
                    return (
                      <label
                        key={field.key}
                        className="flex items-center justify-between gap-3 rounded-md border p-3 sm:col-span-2"
                      >
                        <span>
                          <span className="block text-sm font-medium">{field.label}</span>
                          {field.hint ? (
                            <span className="block text-xs text-muted-foreground">{field.hint}</span>
                          ) : null}
                        </span>
                        <Switch
                          checked={value === 'true'}
                          onCheckedChange={(v) => set(field.key, v ? 'true' : 'false')}
                        />
                      </label>
                    );
                  }

                  if (field.type === 'textarea') {
                    return (
                      <Field
                        key={field.key}
                        label={field.label}
                        hint={field.hint}
                        className="sm:col-span-2"
                      >
                        <Textarea
                          rows={4}
                          value={value}
                          dir={field.dir}
                          placeholder={field.placeholder}
                          onChange={(e) => set(field.key, e.target.value)}
                        />
                      </Field>
                    );
                  }

                  if (field.type === 'password') {
                    return (
                      <Field
                        key={field.key}
                        label={field.label}
                        hint={
                          isSecretSet
                            ? isAr
                              ? 'محفوظ ومشفّر — اترك الحقل فارغًا للإبقاء عليه'
                              : 'Stored and encrypted — leave blank to keep it'
                            : field.hint
                        }
                        className="sm:col-span-2"
                      >
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            dir="ltr"
                            autoComplete="off"
                            value={value}
                            placeholder={isSecretSet ? '••••••••••••' : field.placeholder}
                            onChange={(e) => set(field.key, e.target.value)}
                          />
                          {isSecretSet ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => removeSecret(field.key)}
                              aria-label={isAr ? 'مسح' : 'Clear'}
                            >
                              <Trash2 />
                            </Button>
                          ) : null}
                        </div>
                        {isSecretSet ? (
                          <Badge variant="success" className="mt-1">
                            {isAr ? 'مضبوط' : 'Set'}
                          </Badge>
                        ) : null}
                      </Field>
                    );
                  }

                  return (
                    <Field key={field.key} label={field.label} hint={field.hint}>
                      <Input
                        type={field.type === 'number' ? 'number' : 'text'}
                        dir={field.dir}
                        value={value}
                        placeholder={field.placeholder}
                        onChange={(e) => set(field.key, e.target.value)}
                      />
                    </Field>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={submit} loading={pending}>
          <Save />
          {isAr ? 'حفظ الإعدادات' : 'Save settings'}
        </Button>
      </div>
    </div>
  );
}
