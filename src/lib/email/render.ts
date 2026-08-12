import { publicEnv } from '@/lib/env';

/**
 * Email markup.
 *
 * Written by hand against 2003-era HTML — tables, inline styles, no flexbox,
 * no custom fonts — because that is still what mail clients render. The design
 * system does not reach in here; what carries over is the palette and the
 * voice, which is as much identity as email can hold.
 *
 * Arabic mail needs `dir="rtl"` on the element, not just the document: Gmail
 * strips `<html>` attributes, so every block sets its own direction.
 */

const BRAND = '#0F7A5E';
const ACCENT = '#E8913A';
const INK = '#0B1F1A';
const MUTED = '#5C6B66';
const BG = '#F8F6F1';

export interface EmailContent {
  /** Short line at the very top, shown in the inbox preview. */
  preheader: string;
  heading: string;
  /** Paragraphs, in order. */
  body: string[];
  cta?: { label: string; href: string };
  /** Small print under the button. */
  footnote?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Absolute URL for a path, since a mail client has no origin to resolve against. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${publicEnv.appUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

export function renderEmail(
  content: EmailContent,
  options: { locale: string; brandName: string },
): { html: string; text: string } {
  const isAr = options.locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const align = isAr ? 'right' : 'left';

  const paragraphs = content.body
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.8;color:${INK};" dir="${dir}" align="${align}">${escapeHtml(line)}</p>`,
    )
    .join('');

  const button = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
         <tr><td style="border-radius:10px;background:${BRAND};">
           <a href="${escapeHtml(absoluteUrl(content.cta.href))}"
              style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
             ${escapeHtml(content.cta.label)}
           </a>
         </td></tr>
       </table>`
    : '';

  const footnote = content.footnote
    ? `<p style="margin:0;font-size:13px;line-height:1.7;color:${MUTED};" dir="${dir}" align="${align}">${escapeHtml(content.footnote)}</p>`
    : '';

  const html = `<!doctype html>
<html dir="${dir}" lang="${options.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="height:4px;background:${BRAND};"></td></tr>
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND};" dir="ltr" align="${align}">${escapeHtml(options.brandName)}</p>
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <h1 style="margin:8px 0 16px;font-size:22px;line-height:1.4;color:${INK};" dir="${dir}" align="${align}">${escapeHtml(content.heading)}</h1>
          ${paragraphs}
          ${button}
          ${footnote}
        </td></tr>
        <tr><td style="padding:18px 32px;background:${BG};">
          <p style="margin:0;font-size:12px;color:${MUTED};" dir="${dir}" align="${align}">
            ${escapeHtml(isAr ? `وصلتك الرسالة دي من ${options.brandName}.` : `Sent by ${options.brandName}.`)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    content.heading,
    '',
    ...content.body,
    content.cta ? `\n${content.cta.label}: ${absoluteUrl(content.cta.href)}` : '',
    content.footnote ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

/** The accent colour, exported so a future template can use it without re-deriving it. */
export const EMAIL_ACCENT = ACCENT;
