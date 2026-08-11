import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from './prisma';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'ADMIN' | 'TRAINER' | 'TRAINEE';
      locale: string;
      status: string;
      /** null for a super-admin (all permissions). */
      permissions: string[] | null;
      trainerId: string | null;
      traineeId: string | null;
      username: string | null;
      approvalStatus: string | null;
      /** Set while an admin is impersonating this user. */
      impersonatorId: string | null;
    } & DefaultSession['user'];
  }
}

export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/** Loads the identity fields the session needs for a given user id. */
export async function loadSessionUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      locale: true,
      adminRole: { select: { permissions: true } },
      trainerProfile: { select: { id: true, username: true, fullName: true, approvalStatus: true, avatarUrl: true } },
      traineeProfile: { select: { id: true, fullName: true } },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.trainerProfile?.fullName ?? user.traineeProfile?.fullName ?? user.email,
    image: user.trainerProfile?.avatarUrl ?? null,
    role: user.role,
    status: user.status,
    locale: user.locale,
    permissions: user.role === 'ADMIN' ? (user.adminRole?.permissions ?? null) : [],
    trainerId: user.trainerProfile?.id ?? null,
    traineeId: user.traineeProfile?.id ?? null,
    username: user.trainerProfile?.username ?? null,
    approvalStatus: user.trainerProfile?.approvalStatus ?? null,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/login', error: '/login' },
  trustHost: true,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase().trim() },
          select: { id: true, passwordHash: true, status: true },
        });
        // Constant-ish work either way, so a missing account and a wrong
        // password take a similar amount of time.
        const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
        const ok = await bcrypt.compare(parsed.data.password, hash);
        if (!user || !ok) return null;
        if (user.status === 'SUSPENDED') throw new Error('ACCOUNT_SUSPENDED');

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        const sessionUser = await loadSessionUser(user.id);
        return sessionUser as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        Object.assign(token, {
          id: (user as { id: string }).id,
          role: (user as { role: string }).role,
          status: (user as { status: string }).status,
          locale: (user as { locale: string }).locale,
          permissions: (user as { permissions: string[] | null }).permissions,
          trainerId: (user as { trainerId: string | null }).trainerId,
          traineeId: (user as { traineeId: string | null }).traineeId,
          username: (user as { username: string | null }).username,
          approvalStatus: (user as { approvalStatus: string | null }).approvalStatus,
        });
      }

      // Refresh claims after approval, plan activation, or a role change, and
      // carry the impersonation marker set by the admin support tool.
      if (trigger === 'update' && session) {
        const s = session as Record<string, unknown>;
        if (s.impersonateUserId) {
          const target = await loadSessionUser(s.impersonateUserId as string);
          if (target) {
            token.impersonatorId = token.impersonatorId ?? token.id;
            Object.assign(token, {
              id: target.id,
              role: target.role,
              status: target.status,
              locale: target.locale,
              permissions: target.permissions,
              trainerId: target.trainerId,
              traineeId: target.traineeId,
              username: target.username,
              approvalStatus: target.approvalStatus,
            });
          }
        } else if (s.stopImpersonation && token.impersonatorId) {
          const original = await loadSessionUser(token.impersonatorId as string);
          if (original) {
            token.impersonatorId = null;
            Object.assign(token, original);
          }
        } else {
          const fresh = await loadSessionUser(token.id as string);
          if (fresh) Object.assign(token, fresh);
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.id as string,
        role: token.role as 'ADMIN' | 'TRAINER' | 'TRAINEE',
        status: token.status as string,
        locale: (token.locale as string) ?? 'ar',
        permissions: (token.permissions as string[] | null) ?? null,
        trainerId: (token.trainerId as string | null) ?? null,
        traineeId: (token.traineeId as string | null) ?? null,
        username: (token.username as string | null) ?? null,
        approvalStatus: (token.approvalStatus as string | null) ?? null,
        impersonatorId: (token.impersonatorId as string | null) ?? null,
      };
      return session;
    },
  },
});

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}
