import { setRequestLocale } from 'next-intl/server';
import { requireAdminPage } from '@/lib/authz';
import { getSettings } from '@/lib/settings';
import { AdminPage } from '@/components/admin/page-shell';
import { SettingsForm, type SettingGroup } from './settings-form';

export default async function AdminSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdminPage('settings.write', locale);

  const isAr = locale === 'ar';
  const values = await getSettings();

  // Secrets are never sent to the client — only whether one is stored.
  const secretKeys = ['ai.api_key', 'payment.kashier_api_key', 'payment.ziina_api_key'];
  const secretsPresent = secretKeys.filter((key) => Boolean(values[key]));
  const safeValues: Record<string, string> = { ...values };
  for (const key of secretKeys) safeValues[key] = '';

  const groups: SettingGroup[] = [
    {
      id: 'brand',
      title: isAr ? 'الهوية' : 'Brand',
      description: isAr
        ? 'اسم المنصة وشعارها وألوانها — تتغير فورًا في كل الواجهات.'
        : 'Platform name, logo and colours — applied instantly across the app.',
      fields: [
        { key: 'brand.name', label: isAr ? 'اسم المنصة' : 'Platform name', type: 'text' },
        { key: 'brand.logo_url', label: isAr ? 'رابط الشعار' : 'Logo URL', type: 'text', dir: 'ltr' },
        { key: 'brand.tagline_ar', label: isAr ? 'الشعار النصي (عربي)' : 'Tagline (Arabic)', type: 'text' },
        { key: 'brand.tagline_en', label: isAr ? 'الشعار النصي (إنجليزي)' : 'Tagline (English)', type: 'text', dir: 'ltr' },
        {
          key: 'brand.primary_color',
          label: isAr ? 'اللون الأساسي' : 'Primary colour',
          type: 'text',
          dir: 'ltr',
          hint: isAr ? 'بصيغة HSL بدون hsl()، مثال: 158 64% 40%' : 'HSL without hsl(), e.g. 158 64% 40%',
        },
        { key: 'brand.support_email', label: isAr ? 'بريد الدعم' : 'Support email', type: 'text', dir: 'ltr' },
        { key: 'brand.support_phone', label: isAr ? 'هاتف الدعم' : 'Support phone', type: 'text', dir: 'ltr' },
      ],
    },
    {
      id: 'app',
      title: isAr ? 'المنصة' : 'Platform',
      description: isAr ? 'اللغة والعملة وحالة التشغيل.' : 'Language, currency and operating state.',
      fields: [
        { key: 'app.default_locale', label: isAr ? 'اللغة الافتراضية' : 'Default locale', type: 'text', dir: 'ltr' },
        { key: 'app.default_currency', label: isAr ? 'العملة الافتراضية' : 'Default currency', type: 'text', dir: 'ltr' },
        {
          key: 'app.currencies',
          label: isAr ? 'العملات المدعومة' : 'Supported currencies',
          type: 'text',
          dir: 'ltr',
          hint: isAr ? 'مفصولة بفاصلة' : 'Comma separated',
        },
        {
          key: 'app.allow_trainer_signup',
          label: isAr ? 'السماح بتسجيل مدربين جدد' : 'Allow new trainer signups',
          type: 'boolean',
          hint: isAr ? 'أغلقه مؤقتًا عند الضغط على فريق المراجعة' : 'Turn off temporarily when the review queue is backed up',
        },
        {
          key: 'app.maintenance_mode',
          label: isAr ? 'وضع الصيانة' : 'Maintenance mode',
          type: 'boolean',
          hint: isAr ? 'يوقف الواجهات العامة ويبقي لوحة الإدارة تعمل' : 'Blocks public surfaces; the admin panel keeps working',
        },
      ],
    },
    {
      id: 'payment',
      title: isAr ? 'الدفع' : 'Payments',
      description: isAr
        ? 'تعليمات التحويل التي يراها المدرب عند الاشتراك، ومفاتيح البوابات عند تفعيلها.'
        : 'Transfer instructions shown at checkout, and gateway keys when you enable them.',
      fields: [
        {
          key: 'payment.instructions_ar',
          label: isAr ? 'تعليمات الدفع (عربي)' : 'Payment instructions (Arabic)',
          type: 'textarea',
        },
        {
          key: 'payment.instructions_en',
          label: isAr ? 'تعليمات الدفع (إنجليزي)' : 'Payment instructions (English)',
          type: 'textarea',
          dir: 'ltr',
        },
        { key: 'payment.instapay', label: 'InstaPay', type: 'text', dir: 'ltr' },
        { key: 'payment.vodafone_cash', label: isAr ? 'فودافون كاش' : 'Vodafone Cash', type: 'text', dir: 'ltr' },
        { key: 'payment.bank_name', label: isAr ? 'اسم البنك' : 'Bank name', type: 'text' },
        { key: 'payment.bank_account', label: isAr ? 'رقم الحساب / IBAN' : 'Account / IBAN', type: 'text', dir: 'ltr' },
        {
          key: 'payment.kashier_api_key',
          label: isAr ? 'مفتاح Kashier (مصر)' : 'Kashier API key (Egypt)',
          type: 'password',
          hint: isAr ? 'اتركه فارغًا ما دام الدفع يدويًا' : 'Leave blank while payments are manual',
        },
        {
          key: 'payment.ziina_api_key',
          label: isAr ? 'مفتاح Ziina (الخليج)' : 'Ziina API key (Gulf)',
          type: 'password',
          hint: isAr ? 'اتركه فارغًا ما دام الدفع يدويًا' : 'Leave blank while payments are manual',
        },
      ],
    },
    {
      id: 'ai',
      title: isAr ? 'الذكاء الاصطناعي' : 'AI',
      description: isAr
        ? 'بدون مفتاح تُعطَّل ميزات الـ AI تلقائيًا. الأسعار تُستخدم لحساب التكلفة في تقرير الأرباح.'
        : 'Without a key, AI features switch off automatically. The prices drive cost in the profit report.',
      fields: [
        {
          key: 'ai.api_key',
          label: isAr ? 'مفتاح Claude API' : 'Claude API key',
          type: 'password',
          placeholder: 'sk-ant-...',
        },
        { key: 'ai.model', label: isAr ? 'الموديل' : 'Model', type: 'text', dir: 'ltr' },
        {
          key: 'ai.effort',
          label: isAr ? 'مستوى الجهد' : 'Effort level',
          type: 'text',
          dir: 'ltr',
          hint: 'low | medium | high | xhigh | max',
        },
        {
          key: 'ai.input_price_per_mtok',
          label: isAr ? 'سعر مليون توكن دخل ($)' : 'Input $/MTok',
          type: 'number',
          dir: 'ltr',
        },
        {
          key: 'ai.output_price_per_mtok',
          label: isAr ? 'سعر مليون توكن خرج ($)' : 'Output $/MTok',
          type: 'number',
          dir: 'ltr',
        },
      ],
    },
    {
      id: 'seo',
      title: 'SEO',
      description: isAr
        ? 'العناوين والأوصاف الافتراضية للصفحات العامة ودليل المدربين.'
        : 'Default titles and descriptions for public pages and the coach directory.',
      fields: [
        { key: 'seo.title_ar', label: isAr ? 'العنوان (عربي)' : 'Title (Arabic)', type: 'text' },
        { key: 'seo.title_en', label: isAr ? 'العنوان (إنجليزي)' : 'Title (English)', type: 'text', dir: 'ltr' },
        { key: 'seo.description_ar', label: isAr ? 'الوصف (عربي)' : 'Description (Arabic)', type: 'textarea' },
        { key: 'seo.description_en', label: isAr ? 'الوصف (إنجليزي)' : 'Description (English)', type: 'textarea', dir: 'ltr' },
        { key: 'seo.og_image', label: isAr ? 'صورة المشاركة الافتراضية' : 'Default OG image', type: 'text', dir: 'ltr' },
      ],
    },
  ];

  return (
    <AdminPage
      title={isAr ? 'إعدادات المنصة' : 'Platform settings'}
      description={
        isAr
          ? 'كل ما يتحكم في سلوك المنصة وهويتها — لا حاجة لتعديل الكود.'
          : 'Everything that controls the platform’s behaviour and identity — no code changes needed.'
      }
    >
      <SettingsForm groups={groups} values={safeValues} secretsPresent={secretsPresent} />
    </AdminPage>
  );
}
