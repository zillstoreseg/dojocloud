import type { Permission } from '@/lib/permissions';

export interface AdminNavItem {
  href: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  permission?: Permission;
  /** Key into the pending-counts map, rendered as a badge in the sidebar. */
  badgeKey?: 'trainers' | 'certificates' | 'payments' | 'pages' | 'traineePayments' | 'payouts';
  /**
   * The screen is not built yet. Kept in the tree so the panel's shape is
   * honest about what is planned, but rendered inert instead of as a link
   * that 404s. Remove the flag in the phase that builds the screen.
   */
  comingSoon?: boolean;
}

export interface AdminNavSection {
  labelAr: string;
  labelEn: string;
  items: AdminNavItem[];
}

/**
 * The admin panel's information architecture. Sections render only when the
 * signed-in staff member holds at least one permission inside them.
 */
export const ADMIN_NAV: AdminNavSection[] = [
  {
    labelAr: 'الرئيسية',
    labelEn: 'Home',
    items: [
      { href: '/admin', labelAr: 'نظرة عامة', labelEn: 'Overview', icon: 'LayoutDashboard', permission: 'analytics.overview' },
      { href: '/admin/activations', labelAr: 'مركز التفعيلات', labelEn: 'Activations', icon: 'BadgeCheck', permission: 'approvals.trainers', badgeKey: 'trainers' },
    ],
  },
  {
    labelAr: 'الإحصائيات',
    labelEn: 'Analytics',
    items: [
      { href: '/admin/analytics/revenue', labelAr: 'الإيرادات', labelEn: 'Revenue', icon: 'Banknote', permission: 'analytics.revenue' },
      { href: '/admin/analytics/profit', labelAr: 'الأرباح والهوامش', labelEn: 'Profit & margins', icon: 'TrendingUp', permission: 'analytics.profit' },
      { href: '/admin/analytics/subscriptions', labelAr: 'الاشتراكات', labelEn: 'Subscriptions', icon: 'Repeat', permission: 'analytics.revenue' },
      { href: '/admin/analytics/traffic', labelAr: 'الزوار', labelEn: 'Traffic', icon: 'MousePointerClick', permission: 'analytics.traffic' },
      { href: '/admin/analytics/ai', labelAr: 'استهلاك الذكاء الاصطناعي', labelEn: 'AI usage', icon: 'Bot', permission: 'analytics.ai' },
    ],
  },
  {
    labelAr: 'المستخدمون',
    labelEn: 'People',
    items: [
      { href: '/admin/trainers', labelAr: 'المدربون', labelEn: 'Trainers', icon: 'Dumbbell', permission: 'trainers.read' },
      { href: '/admin/trainees', labelAr: 'المتدربون', labelEn: 'Trainees', icon: 'Users', permission: 'trainees.read' },
      { href: '/admin/users', labelAr: 'كل الحسابات', labelEn: 'All accounts', icon: 'UserCog', permission: 'users.read', comingSoon: true },
      { href: '/admin/roles', labelAr: 'الأدوار والصلاحيات', labelEn: 'Roles', icon: 'ShieldCheck', permission: 'roles.write', comingSoon: true },
    ],
  },
  {
    labelAr: 'المال',
    labelEn: 'Money',
    items: [
      { href: '/admin/plans', labelAr: 'الخطط والأسعار', labelEn: 'Plans & pricing', icon: 'Layers', permission: 'plans.read' },
      { href: '/admin/subscriptions', labelAr: 'الاشتراكات', labelEn: 'Subscriptions', icon: 'CalendarClock', permission: 'subscriptions.read', comingSoon: true },
      { href: '/admin/payments', labelAr: 'المدفوعات', labelEn: 'Payments', icon: 'Receipt', permission: 'payments.read', badgeKey: 'payments' },
      { href: '/admin/payouts', labelAr: 'المحفظة والسحوبات', labelEn: 'Wallets & payouts', icon: 'Wallet', permission: 'payouts.read', badgeKey: 'payouts' },
      { href: '/admin/coupons', labelAr: 'الكوبونات', labelEn: 'Coupons', icon: 'Ticket', permission: 'coupons.write', comingSoon: true },
    ],
  },
  {
    labelAr: 'المحتوى',
    labelEn: 'Content',
    items: [
      { href: '/admin/library/exercises', labelAr: 'مكتبة التمارين', labelEn: 'Exercise library', icon: 'ListChecks', permission: 'library.write' },
      { href: '/admin/library/foods', labelAr: 'مكتبة الأطعمة', labelEn: 'Food library', icon: 'Apple', permission: 'library.write' },
      { href: '/admin/food-scans', labelAr: 'تحليلات صور الأكل', labelEn: 'Food scans', icon: 'Camera', permission: 'analytics.ai' },
      { href: '/admin/pages', labelAr: 'صفحات المدربين', labelEn: 'Trainer pages', icon: 'Globe', permission: 'pages.read', badgeKey: 'pages' },
      { href: '/admin/leads', labelAr: 'العملاء المحتملون', labelEn: 'Leads', icon: 'UserPlus', permission: 'leads.read', comingSoon: true },
      { href: '/admin/static-pages', labelAr: 'الصفحات الثابتة', labelEn: 'Static pages', icon: 'FileText', permission: 'content.write', comingSoon: true },
      { href: '/admin/announcements', labelAr: 'الإعلانات', labelEn: 'Announcements', icon: 'Megaphone', permission: 'content.write', comingSoon: true },
    ],
  },
  {
    labelAr: 'النظام',
    labelEn: 'System',
    items: [
      { href: '/admin/flags', labelAr: 'الميزات (Flags)', labelEn: 'Feature flags', icon: 'ToggleLeft', permission: 'flags.write' },
      { href: '/admin/design', labelAr: 'نظام التصميم', labelEn: 'Design system', icon: 'Palette', permission: 'settings.write' },
      { href: '/admin/settings', labelAr: 'الإعدادات', labelEn: 'Settings', icon: 'Settings', permission: 'settings.write' },
      { href: '/admin/audit', labelAr: 'سجل التدقيق', labelEn: 'Audit log', icon: 'ScrollText', permission: 'audit.read' },
    ],
  },
];

/** Filters the nav down to what this staff member may see. */
export function visibleNav(
  user: { role: string; permissions?: string[] | null },
  hasPermissionFn: (u: typeof user, p: Permission) => boolean,
): AdminNavSection[] {
  return ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.permission || hasPermissionFn(user, item.permission)),
  })).filter((section) => section.items.length > 0);
}
