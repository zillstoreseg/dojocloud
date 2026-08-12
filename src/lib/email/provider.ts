import { getSettings } from '@/lib/settings';

/**
 * Sending mail.
 *
 * Abstracted the same way payments are, and for the same reason: the platform
 * owner picks a provider from the admin panel, and swapping Resend for SMTP
 * later must not touch a single call site. The default is `none`, which logs
 * the message and reports success — a development machine with no mail account
 * should not fail a payment approval because it could not send a receipt.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Template identifier, recorded on the log row for debugging. */
  template?: string;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  /** True when the provider is deliberately a no-op, not when it failed. */
  skipped?: boolean;
}

export interface EmailProvider {
  key: 'none' | 'resend' | 'smtp';
  send(message: EmailMessage, config: Record<string, string>): Promise<SendResult>;
}

/** Development default: writes to the console and to `EmailLog`, sends nothing. */
const noneProvider: EmailProvider = {
  key: 'none',
  async send(message) {
    console.info(`[email:none] would send "${message.subject}" to ${message.to}`);
    return { ok: true, skipped: true };
  },
};

const resendProvider: EmailProvider = {
  key: 'resend',
  async send(message, config) {
    const apiKey = config['email.resend_api_key'];
    const from = config['email.from'];
    if (!apiKey || !from) return { ok: false, error: 'Resend is selected but not configured' };

    // Plain fetch rather than the SDK: one endpoint, one shape, and one fewer
    // dependency to keep current.
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `Resend ${response.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  },
};

/** The slice of nodemailer's surface this file uses, so it needs no @types. */
interface NodemailerLike {
  createTransport(options: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
  }): {
    sendMail(message: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<unknown>;
  };
}

const smtpProvider: EmailProvider = {
  key: 'smtp',
  async send(message, config) {
    const { host, port, user, pass, from } = {
      host: config['email.smtp_host'],
      port: config['email.smtp_port'],
      user: config['email.smtp_user'],
      pass: config['email.smtp_password'],
      from: config['email.from'],
    };
    if (!host || !from) return { ok: false, error: 'SMTP is selected but not configured' };

    // nodemailer is an optional dependency: a deployment that uses Resend
    // should not have to install an SMTP client it will never call. The
    // specifier is built at runtime so the bundler does not try to resolve a
    // package that is legitimately absent.
    const nodemailer = await (import(/* webpackIgnore: true */ 'nodemailer' as string).catch(
      () => null,
    ) as Promise<null | { default: NodemailerLike }>);
    if (!nodemailer) {
      return { ok: false, error: 'Install nodemailer to use the smtp email provider' };
    }

    const transport = nodemailer.default.createTransport({
      host,
      port: Number(port) || 587,
      secure: Number(port) === 465,
      auth: user ? { user, pass } : undefined,
    });

    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { ok: true };
  },
};

const PROVIDERS: Record<string, EmailProvider> = {
  none: noneProvider,
  resend: resendProvider,
  smtp: smtpProvider,
};

/** The provider the admin has selected, with its configuration. */
export async function activeEmailProvider(): Promise<{
  provider: EmailProvider;
  config: Record<string, string>;
}> {
  const config = await getSettings('email');
  const key = config['email.provider'] ?? 'none';
  return { provider: PROVIDERS[key] ?? noneProvider, config };
}
