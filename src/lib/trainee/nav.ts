import type { NavSection } from '@/lib/nav';

/**
 * The trainee portal's navigation.
 *
 * Shorter than the coach's on purpose. A trainee opens this on a phone,
 * usually between sets or in front of a plate, and every extra row is one more
 * thing to read before doing the one thing they came for.
 */
export function traineeNav(options: { canScan: boolean; canMessage: boolean }): NavSection[] {
  return [
    {
      labelAr: 'يومي',
      labelEn: 'Today',
      items: [
        { href: '/my', labelAr: 'اليوم', labelEn: 'Today', icon: 'Home' },
        { href: '/my/program', labelAr: 'برنامجي', labelEn: 'My program', icon: 'ClipboardList' },
        { href: '/my/nutrition', labelAr: 'تغذيتي', labelEn: 'My nutrition', icon: 'Apple' },
        ...(options.canScan
          ? [{ href: '/my/scan', labelAr: 'صوّر وجبتك', labelEn: 'Scan a meal', icon: 'Camera' }]
          : []),
        ...(options.canMessage
          ? [
              {
                href: '/my/messages',
                labelAr: 'مدربك',
                labelEn: 'Your coach',
                icon: 'MessageSquare',
              },
            ]
          : []),
      ],
    },
    {
      labelAr: 'تقدمي',
      labelEn: 'Progress',
      items: [
        { href: '/my/measurements', labelAr: 'قياساتي', labelEn: 'Measurements', icon: 'Ruler' },
      ],
    },
    {
      labelAr: 'حسابي',
      labelEn: 'Account',
      items: [
        {
          href: '/my/subscription',
          labelAr: 'اشتراكي',
          labelEn: 'Subscription',
          icon: 'CreditCard',
        },
        {
          href: '/my/notifications',
          labelAr: 'الإشعارات',
          labelEn: 'Notifications',
          icon: 'Bell',
        },
      ],
    },
  ];
}
