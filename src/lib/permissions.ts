/**
 * Fine-grained permissions for staff accounts. A user with role ADMIN and no
 * `adminRole` is a super-admin and implicitly holds every permission.
 */
export const PERMISSIONS = {
  // Approvals / activations centre
  'approvals.trainers': 'اعتماد حسابات المدربين',
  'approvals.certificates': 'مراجعة الشهادات',
  'approvals.payments': 'تفعيل المدفوعات',
  'approvals.pages': 'مراجعة صفحات الهبوط',

  // Entities
  'users.read': 'عرض المستخدمين',
  'users.write': 'تعديل المستخدمين',
  'users.impersonate': 'انتحال شخصية مستخدم',
  'trainers.read': 'عرض المدربين',
  'trainers.write': 'تعديل المدربين',
  'trainees.read': 'عرض المتدربين',
  'trainees.write': 'تعديل المتدربين',
  'plans.read': 'عرض الخطط',
  'plans.write': 'تعديل الخطط والأسعار',
  'subscriptions.read': 'عرض الاشتراكات',
  'subscriptions.write': 'تعديل الاشتراكات',
  'payments.read': 'عرض المدفوعات',
  'payments.write': 'تعديل المدفوعات',
  'coupons.write': 'إدارة الكوبونات',
  'library.write': 'إدارة مكتبة التمارين والأطعمة',
  'payouts.read': 'عرض المحافظ وطلبات السحب',
  'payouts.write': 'اعتماد وتحويل طلبات السحب',
  'pages.read': 'عرض صفحات الهبوط',
  'pages.write': 'تعديل صفحات الهبوط',
  'leads.read': 'عرض الـ Leads',
  'flags.write': 'إدارة الـ Feature Flags',
  'content.write': 'إدارة الصفحات الثابتة والإعلانات',

  // Analytics
  'analytics.overview': 'نظرة عامة',
  'analytics.revenue': 'الإيرادات',
  'analytics.profit': 'الأرباح والهوامش',
  'analytics.traffic': 'الزوار',
  'analytics.ai': 'استهلاك الذكاء الاصطناعي',

  // Operations
  'settings.write': 'إعدادات المنصة',
  'audit.read': 'سجل التدقيق',
  'roles.write': 'إدارة الأدوار والصلاحيات',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Built-in staff roles seeded on first run; the admin can add more. */
export const SYSTEM_ROLES: Record<string, { description: string; permissions: Permission[] }> = {
  'مدير عام': {
    description: 'صلاحيات كاملة على المنصة',
    permissions: ALL_PERMISSIONS,
  },
  'موظف دعم': {
    description: 'يطّلع ويساعد المستخدمين دون تعديل مالي',
    permissions: [
      'users.read',
      'users.impersonate',
      'trainers.read',
      'trainees.read',
      'subscriptions.read',
      'payments.read',
      'payouts.read',
      'pages.read',
      'leads.read',
      'analytics.overview',
    ],
  },
  'مسؤول مالي': {
    description: 'يراجع المدفوعات والاشتراكات والتقارير المالية',
    permissions: [
      'approvals.payments',
      'payments.read',
      'payments.write',
      'subscriptions.read',
      'subscriptions.write',
      'plans.read',
      'coupons.write',
      'analytics.overview',
      'analytics.revenue',
      'analytics.profit',
      'payouts.read',
      'payouts.write',
    ],
  },
  'مشرف محتوى': {
    description: 'يراجع الشهادات وصفحات الهبوط والمكتبة',
    permissions: [
      'approvals.trainers',
      'approvals.certificates',
      'approvals.pages',
      'trainers.read',
      'pages.read',
      'pages.write',
      'library.write',
      'content.write',
    ],
  },
};

export function hasPermission(
  user: { role: string; permissions?: string[] | null } | null | undefined,
  permission: Permission,
): boolean {
  if (!user || user.role !== 'ADMIN') return false;
  // Super-admin: ADMIN with no restricted role.
  if (!user.permissions) return true;
  return user.permissions.includes(permission);
}
