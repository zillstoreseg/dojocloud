import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env';

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(env.SETTINGS_ENCRYPTION_KEY, 'hex');

/**
 * Encrypts a secret for storage in `AppSetting` (Claude API key, gateway
 * credentials). Format: iv:authTag:ciphertext, all hex.
 */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  const [ivHex, tagHex, dataHex] = parts;

  // The ciphertext of an empty string is an empty hex string, so `dataHex` is
  // legitimately `''` for a cleared secret — checking it for truthiness would
  // reject the value an admin produces every time they empty a key field, and
  // take down every page that reads that setting.
  if (parts.length !== 3 || !ivHex || !tagHex || dataHex === undefined) {
    throw new Error('Malformed encrypted value');
  }

  const decipher = createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}

/** Shows only the last 4 characters — for rendering a stored key in the admin UI. */
export function maskSecret(plain: string): string {
  if (plain.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(plain.length - 4, 24))}${plain.slice(-4)}`;
}
