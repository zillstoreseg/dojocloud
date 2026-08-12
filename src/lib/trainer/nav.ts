import { FLAG_KEYS } from '@/lib/flags';
import type { NavSection } from '@/lib/nav';

/**
 * The trainer dashboard's information architecture.
 *
 * `flag` marks an item that a lower plan does not include. Locked items stay
 * visible and route to billing — hiding them would remove the only place a
 * trainer learns what an upgrade buys.
 *
 * `comingSoon` marks a screen that has not shipped yet. It stays visible too,
 * but inert: a nav link that 404s reads as a broken product, which is a worse
 * impression than an unfinished one.
 */
interface TrainerNavItem {
  href: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  flag?: string;
  comingSoon?: boolean;
}

const TRAINER_NAV: { labelAr: string; labelEn: string; items: TrainerNavItem[] }[] = [
  {
    labelAr: 'الرئيسية',
    labelEn: 'Home',
    items: [{ href: '/dash', labelAr: 'نظرة عامة', labelEn: 'Overview', icon: 'LayoutDashboard' }],
  },
  {
    labelAr: 'التدريب',
    labelEn: 'Coaching',
    items: [
      { href: '/dash/trainees', labelAr: 'المتدربون', labelEn: 'Trainees', icon: 'Users' },
      { href: '/dash/exercises', labelAr: 'التمارين', labelEn: 'Exercises', icon: 'Dumbbell' },
      { href: '/dash/programs', labelAr: 'البرامج', labelEn: 'Programs', icon: 'ClipboardList' },
      { href: '/dash/nutrition', labelAr: 'أنظمة التغذية', labelEn: 'Nutrition', icon: 'Apple' },
      {
        href: '/dash/messages',
        labelAr: 'الرسائل',
        labelEn: 'Messages',
        icon: 'MessageSquare',
        flag: FLAG_KEYS.MESSAGING,
        comingSoon: true,
      },
    ],
  },
  {
    labelAr: 'النمو',
    labelEn: 'Growth',
    items: [
      {
        href: '/dash/page',
        labelAr: 'صفحتي',
        labelEn: 'My page',
        icon: 'Globe',
        flag: FLAG_KEYS.BUILDER,
      },
      {
        href: '/dash/leads',
        labelAr: 'العملاء المحتملون',
        labelEn: 'Leads',
        icon: 'UserPlus',
        flag: FLAG_KEYS.LEADS_CRM,
      },
      { href: '/dash/packages', labelAr: 'باقاتي', labelEn: 'My packages', icon: 'Package' },
    ],
  },
  {
    labelAr: 'الحساب',
    labelEn: 'Account',
    items: [
      { href: '/dash/wallet', labelAr: 'المحفظة', labelEn: 'Wallet', icon: 'Wallet' },
      { href: '/dash/billing', labelAr: 'الاشتراك والفوترة', labelEn: 'Plan & billing', icon: 'CreditCard' },
      { href: '/dash/settings', labelAr: 'الإعدادات', labelEn: 'Settings', icon: 'Settings', comingSoon: true },
    ],
  },
];

/**
 * Applies the resolved feature flags to the nav.
 *
 * Takes the already-resolved flag map rather than a user id so the caller
 * controls when the (cached) resolution happens.
 */
export function trainerNav(flags: Map<string, { enabled: boolean }>): NavSection[] {
  return TRAINER_NAV.map((section) => ({
    labelAr: section.labelAr,
    labelEn: section.labelEn,
    items: section.items.map((item) => ({
      href: item.href,
      labelAr: item.labelAr,
      labelEn: item.labelEn,
      icon: item.icon,
      comingSoon: item.comingSoon,
      // An unbuilt screen has no upgrade story yet, so the lock is suppressed
      // until it ships — two badges on one row says nothing clearly.
      locked: item.comingSoon ? false : item.flag ? !(flags.get(item.flag)?.enabled ?? false) : false,
    })),
  }));
}
