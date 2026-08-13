import bcrypt from 'bcryptjs';

/**
 * Password hashing, on its own.
 *
 * Split out of `auth.ts` for the same reason `ownership.ts` was split out of
 * `authz.ts`: importing that module pulls in next-auth, which reaches for
 * `next/server` and cannot be loaded outside a Next runtime. Anything that
 * needs to hash a password — the reset flow, the registration action, a test —
 * should be able to do so without dragging the whole auth stack in behind it.
 *
 * Cost 12 is a deliberate choice: roughly a quarter-second per hash on typical
 * hardware, which is slow enough to make offline cracking expensive and fast
 * enough that a sign-in does not feel delayed.
 */
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A hash that never matches, for comparing against when no account was found.
 *
 * Running a real comparison against this keeps the "no such email" path taking
 * about as long as the "wrong password" path, so response time does not reveal
 * which addresses are registered.
 */
export const DUMMY_HASH = '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu';
