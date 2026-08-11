import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/color';

/**
 * Contrast audit of the shipped design tokens.
 *
 * The values are read out of `globals.css` rather than duplicated here, so the
 * test can never pass against a copy that has drifted from what ships. Any
 * future palette change has to clear these ratios before it lands.
 */

const CSS = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

function tokensFor(selector: ':root' | '.dark'): Record<string, string> {
  // Grab the first block for the selector, then every `--name: value;` in it.
  const block = CSS.split(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{`))[1];
  if (!block) throw new Error(`No ${selector} block in globals.css`);
  const body = block.split('}')[0];
  const out: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/**
 * [label, foreground token, background token, minimum ratio].
 *
 * 4.5:1 is the AA floor for body text. 3:1 applies to non-text boundaries of
 * interactive controls (WCAG 1.4.11) — that is why `input` is checked but the
 * decorative `border` is not.
 */
const PAIRS: [string, string, string, number][] = [
  ['body text on the page', 'foreground', 'background', 4.5],
  ['body text on a card', 'foreground', 'card', 4.5],
  ['muted text on the page', 'muted-foreground', 'background', 4.5],
  ['muted text on a card', 'muted-foreground', 'card', 4.5],
  ['muted text on a muted surface', 'muted-foreground', 'muted', 4.5],
  ['brand colour used as text', 'primary', 'background', 4.5],
  ['text on a primary button', 'primary-foreground', 'primary', 4.5],
  ['text on an accent button', 'brand-accent-foreground', 'brand-accent', 4.5],
  ['text on a success surface', 'success-foreground', 'success', 4.5],
  ['text on a warning surface', 'warning-foreground', 'warning', 4.5],
  ['text on a destructive surface', 'destructive-foreground', 'destructive', 4.5],
  ['text on an info surface', 'info-foreground', 'info', 4.5],
  ['accent text on the accent tint', 'accent-foreground', 'accent', 4.5],
  ['success used as text', 'success', 'background', 4.5],
  ['warning used as text', 'warning', 'background', 4.5],
  ['destructive used as text', 'destructive', 'background', 4.5],
  ['input boundary against the page', 'input', 'background', 3],
  ['input boundary against a card', 'input', 'card', 3],
  ['focus ring against the page', 'ring', 'background', 3],
];

describe.each([
  ['light', ':root' as const],
  ['dark', '.dark' as const],
])('%s theme contrast', (_name, selector) => {
  const tokens = tokensFor(selector);

  it.each(PAIRS)('%s clears %s on %s at %s:1', (_label, fg, bg, min) => {
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    expect(
      ratio,
      `--${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`,
    ).toBeGreaterThanOrEqual(min);
  });
});

describe('token completeness', () => {
  it('defines every token in both themes', () => {
    const light = Object.keys(tokensFor(':root'));
    const dark = Object.keys(tokensFor('.dark'));
    // Shadows and the easing curve are light-mode-only by design; colour
    // tokens must exist in both or the dark theme falls back silently.
    const colourOnly = (keys: string[]) =>
      keys.filter((k) => !k.startsWith('shadow-') && !k.startsWith('ease-') && k !== 'radius');
    expect(colourOnly(dark).sort()).toEqual(colourOnly(light).sort());
  });
});
