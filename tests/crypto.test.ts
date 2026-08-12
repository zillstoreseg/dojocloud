import { describe, expect, it } from 'vitest';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/crypto';

/**
 * Secret storage.
 *
 * The empty-string case has its own block because it is not a hypothetical: an
 * admin clearing an API key from the settings screen produces exactly that
 * value, and an earlier version of `decryptSecret` rejected it — which took
 * down every screen that read the category, including the one where they would
 * have gone to put the key back.
 */

describe('round trip', () => {
  it('returns what it was given', () => {
    const secret = 'sk-ant-api03-abcdefghijklmnop';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('handles an empty value, which is what "clear this key" means', () => {
    const payload = encryptSecret('');
    expect(decryptSecret(payload)).toBe('');
  });

  it('handles Arabic, which some settings legitimately contain', () => {
    const secret = 'حوّل على رقم 01001234567 وارفع الوصل';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('handles a long value', () => {
    const secret = 'x'.repeat(5000);
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });
});

describe('the stored shape', () => {
  it('is three colon-separated hex fields', () => {
    const parts = encryptSecret('hello').split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM tag
    expect(parts[2]).toMatch(/^[0-9a-f]*$/); // ciphertext, possibly empty
  });

  it('never repeats a ciphertext for the same plaintext', () => {
    // A fresh IV each time, so identical keys stored twice do not look
    // identical at rest.
    const payloads = new Set(Array.from({ length: 50 }, () => encryptSecret('same')));
    expect(payloads.size).toBe(50);
  });
});

describe('rejection', () => {
  it('rejects a value with the wrong number of fields', () => {
    expect(() => decryptSecret('nope')).toThrow(/Malformed/);
    expect(() => decryptSecret('aa:bb')).toThrow(/Malformed/);
    expect(() => decryptSecret('aa:bb:cc:dd')).toThrow(/Malformed/);
    expect(() => decryptSecret('')).toThrow(/Malformed/);
  });

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    // GCM authenticates as well as encrypts: a flipped byte must fail, not
    // decrypt to nonsense that the app would then treat as a real key.
    const payload = encryptSecret('sk-ant-real-key');
    const [iv, tag, data] = payload.split(':');
    const flipped = data!.slice(0, -2) + (data!.slice(-2) === 'ff' ? '00' : 'ff');
    expect(() => decryptSecret([iv, tag, flipped].join(':'))).toThrow();
  });

  it('rejects a forged auth tag', () => {
    const [iv, , data] = encryptSecret('sk-ant-real-key').split(':');
    expect(() => decryptSecret([iv, '0'.repeat(32), data].join(':'))).toThrow();
  });
});

describe('maskSecret', () => {
  it('shows only the last four characters', () => {
    expect(maskSecret('sk-ant-api03-abcd1234')).toMatch(/1234$/);
    expect(maskSecret('sk-ant-api03-abcd1234')).not.toContain('api03');
  });

  it('reveals nothing at all about a short value', () => {
    expect(maskSecret('abcd')).toBe('••••');
    expect(maskSecret('')).toBe('••••');
  });
});
