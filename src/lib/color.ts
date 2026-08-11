/**
 * Colour maths used by the design-token contrast test.
 *
 * Kept in `lib` rather than in the test file so the same functions can later
 * back an admin-facing warning when someone picks a brand colour that fails
 * contrast against the surfaces it will sit on.
 */

/** Parses a `"164 78% 27%"` token value into sRGB channels in 0–1. */
export function hslTokenToRgb(token: string): [number, number, number] {
  const match = token.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) throw new Error(`Not an HSL token: "${token}"`);
  const h = Number(match[1]);
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

/** WCAG relative luminance. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two colours, always ≥ 1. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [
    relativeLuminance(hslTokenToRgb(a)),
    relativeLuminance(hslTokenToRgb(b)),
  ].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}
