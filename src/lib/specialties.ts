import type { Specialty } from '@prisma/client';

/**
 * Display labels for the `Specialty` enum.
 *
 * Kept in one place because the same list drives the sign-up form, the public
 * coaches directory filter, and every coach card — three screens that must
 * never disagree about what a specialty is called.
 */
export const SPECIALTY_LABELS: Record<Specialty, { ar: string; en: string }> = {
  GENERAL_FITNESS: { ar: 'لياقة عامة', en: 'General fitness' },
  WEIGHT_LOSS: { ar: 'خسارة وزن', en: 'Weight loss' },
  MUSCLE_GAIN: { ar: 'زيادة عضلية', en: 'Muscle gain' },
  BODYBUILDING: { ar: 'كمال أجسام', en: 'Bodybuilding' },
  POWERLIFTING: { ar: 'رفع أثقال', en: 'Powerlifting' },
  CROSSFIT: { ar: 'كروسفيت', en: 'CrossFit' },
  CALISTHENICS: { ar: 'كاليسثنكس', en: 'Calisthenics' },
  ENDURANCE: { ar: 'تحمّل', en: 'Endurance' },
  REHAB: { ar: 'إعادة تأهيل', en: 'Rehabilitation' },
  POSTURE: { ar: 'تصحيح قوام', en: 'Posture' },
  PRE_POSTNATAL: { ar: 'ما قبل وبعد الولادة', en: 'Pre & postnatal' },
  KIDS: { ar: 'أطفال', en: 'Kids' },
  SENIORS: { ar: 'كبار السن', en: 'Seniors' },
  NUTRITION: { ar: 'تغذية', en: 'Nutrition' },
  YOGA: { ar: 'يوجا', en: 'Yoga' },
  PILATES: { ar: 'بيلاتس', en: 'Pilates' },
  MARTIAL_ARTS: { ar: 'فنون قتالية', en: 'Martial arts' },
  SPORTS_PERFORMANCE: { ar: 'أداء رياضي', en: 'Sports performance' },
};

export const SPECIALTY_KEYS = Object.keys(SPECIALTY_LABELS) as Specialty[];

export function specialtyLabel(value: Specialty | string, locale: string): string {
  const entry = SPECIALTY_LABELS[value as Specialty];
  if (!entry) return String(value);
  return locale === 'ar' ? entry.ar : entry.en;
}
