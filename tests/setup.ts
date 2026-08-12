import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Loads `.env` before any module that validates it at import time.
 *
 * `src/lib/env.ts` parses `process.env` on import and throws on a missing key,
 * which is what makes a misconfigured deployment fail fast rather than at the
 * first request. Vitest does not load `.env` on its own, so any test that
 * reaches that module transitively — anything touching crypto or storage —
 * would fail on configuration rather than on the thing it is testing.
 *
 * Existing variables win: a CI job that sets `DATABASE_URL` in its environment
 * should not have it overwritten by a developer's local file.
 */
const envPath = path.join(process.cwd(), '.env');

try {
  const contents = readFileSync(envPath, 'utf8');

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Strip one matching pair of surrounding quotes, which is how a URL with a
    // query string is usually written in these files.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // No .env — fine when the environment is already populated, and the module
  // that needs a value will say which one is missing.
}
