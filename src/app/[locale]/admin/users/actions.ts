'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAdmin, toActionError } from '@/lib/authz';
import { audit } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import type { ActionResult } from '../activations/actions';

export type { ActionResult };

const idSchema = z.object({ id: z.string().min(1) });

export async function setUserStatus(input: {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED';
  reason?: string;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('users.write');
    const { id } = idSchema.parse(input);

    if (id === admin.id) return { ok: false, error: 'لا يمكنك تعليق حسابك أنت' };

    const user = await prisma.user.findUnique({ where: { id }, select: { status: true, email: true, role: true } });
    if (!user) return { ok: false, error: 'المستخدم غير موجود' };
    // Guard against locking every admin out of the panel.
    if (user.role === 'ADMIN' && input.status === 'SUSPENDED') {
      const others = await prisma.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE', id: { not: id } },
      });
      if (others === 0) return { ok: false, error: 'لا يمكن تعليق آخر حساب إداري نشط' };
    }

    await prisma.user.update({ where: { id }, data: { status: input.status } });
    await audit({
      actorId: admin.id,
      action: input.status === 'SUSPENDED' ? 'user.suspend' : 'user.activate',
      entity: 'User',
      entityId: id,
      before: { status: user.status },
      after: { status: input.status, reason: input.reason },
    });

    revalidatePath('/[locale]/admin/users', 'page');
    revalidatePath('/[locale]/admin/trainers', 'page');
    return { ok: true, message: input.status === 'SUSPENDED' ? 'تم تعليق الحساب' : 'تم تفعيل الحساب' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetUserPassword(input: { id: string; password: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('users.write');
    const { id } = idSchema.parse(input);
    const password = z.string().min(8, 'كلمة المرور 8 أحرف على الأقل').parse(input.password);

    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
    // The new password itself is never written to the audit trail.
    await audit({ actorId: admin.id, action: 'user.reset_password', entity: 'User', entityId: id });

    return { ok: true, message: 'تم تغيير كلمة المرور' };
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignAdminRole(input: { id: string; roleId: string | null }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('roles.write');
    const { id } = idSchema.parse(input);

    await prisma.user.update({
      where: { id },
      data: { role: 'ADMIN', adminRoleId: input.roleId },
    });
    await audit({
      actorId: admin.id,
      action: 'user.assign_role',
      entity: 'User',
      entityId: id,
      after: { roleId: input.roleId },
    });

    revalidatePath('/[locale]/admin/users', 'page');
    return { ok: true, message: 'تم تحديث الصلاحيات' };
  } catch (error) {
    return toActionError(error);
  }
}

/**
 * Records the start of a support impersonation. The session switch itself
 * happens client-side via `useSession().update()`; this call is what makes the
 * action auditable and permission-checked.
 */
export async function beginImpersonation(input: { id: string }): Promise<ActionResult> {
  try {
    const admin = await requireAdmin('users.impersonate');
    const { id } = idSchema.parse(input);

    const target = await prisma.user.findUnique({ where: { id }, select: { email: true, role: true } });
    if (!target) return { ok: false, error: 'المستخدم غير موجود' };
    if (target.role === 'ADMIN') return { ok: false, error: 'لا يمكن انتحال شخصية حساب إداري' };

    await audit({
      actorId: admin.id,
      action: 'user.impersonate.start',
      entity: 'User',
      entityId: id,
      after: { email: target.email },
      impersonatedUserId: id,
    });

    return { ok: true, message: `دخول كـ ${target.email}` };
  } catch (error) {
    return toActionError(error);
  }
}
