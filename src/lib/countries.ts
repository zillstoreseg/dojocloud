/** Countries the platform targets first, with dial codes for phone hints. */
export const COUNTRIES = [
  { code: 'EG', ar: 'مصر', en: 'Egypt', dial: '+20', currency: 'EGP' },
  { code: 'SA', ar: 'السعودية', en: 'Saudi Arabia', dial: '+966', currency: 'SAR' },
  { code: 'AE', ar: 'الإمارات', en: 'United Arab Emirates', dial: '+971', currency: 'AED' },
  { code: 'KW', ar: 'الكويت', en: 'Kuwait', dial: '+965', currency: 'USD' },
  { code: 'QA', ar: 'قطر', en: 'Qatar', dial: '+974', currency: 'USD' },
  { code: 'BH', ar: 'البحرين', en: 'Bahrain', dial: '+973', currency: 'USD' },
  { code: 'OM', ar: 'عُمان', en: 'Oman', dial: '+968', currency: 'USD' },
  { code: 'JO', ar: 'الأردن', en: 'Jordan', dial: '+962', currency: 'USD' },
  { code: 'LB', ar: 'لبنان', en: 'Lebanon', dial: '+961', currency: 'USD' },
  { code: 'IQ', ar: 'العراق', en: 'Iraq', dial: '+964', currency: 'USD' },
  { code: 'MA', ar: 'المغرب', en: 'Morocco', dial: '+212', currency: 'USD' },
  { code: 'DZ', ar: 'الجزائر', en: 'Algeria', dial: '+213', currency: 'USD' },
  { code: 'TN', ar: 'تونس', en: 'Tunisia', dial: '+216', currency: 'USD' },
  { code: 'LY', ar: 'ليبيا', en: 'Libya', dial: '+218', currency: 'USD' },
  { code: 'SD', ar: 'السودان', en: 'Sudan', dial: '+249', currency: 'USD' },
  { code: 'YE', ar: 'اليمن', en: 'Yemen', dial: '+967', currency: 'USD' },
  { code: 'PS', ar: 'فلسطين', en: 'Palestine', dial: '+970', currency: 'USD' },
  { code: 'SY', ar: 'سوريا', en: 'Syria', dial: '+963', currency: 'USD' },
  { code: 'OTHER', ar: 'دولة أخرى', en: 'Other', dial: '+', currency: 'USD' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];

export function countryLabel(code: string, locale: string): string {
  const country = COUNTRIES.find((c) => c.code === code || c.ar === code || c.en === code);
  if (!country) return code;
  return locale === 'ar' ? country.ar : country.en;
}

/** Default billing currency for a country, used to preselect plan pricing. */
export function currencyForCountry(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.currency ?? 'USD';
}
