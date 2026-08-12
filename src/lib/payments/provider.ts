import { getSetting } from '@/lib/settings';

/**
 * Payment provider abstraction.
 *
 * Only the manual flow ships today — the trainer uploads a transfer receipt
 * and an admin approves it. Kashier (Egypt) and Ziina (Gulf) come later, and
 * the interface exists now so adding them touches this folder and nothing
 * else: no screen or server action talks to a gateway directly.
 */

export type ProviderKey = 'manual' | 'kashier' | 'ziina';

export interface CheckoutInput {
  subscriptionId: string;
  amount: number;
  currency: string;
  trainerId: string;
  locale: string;
}

export type CheckoutResult =
  /** Manual: the app collects a receipt itself; there is nowhere to send the user. */
  | { kind: 'instructions'; instructions: PaymentInstructions }
  /** Gateways: hand the user off and wait for a webhook. */
  | { kind: 'redirect'; url: string };

export interface PaymentInstructions {
  textAr: string;
  textEn: string;
  /** Account details, each rendered with a copy button. */
  accounts: { labelAr: string; labelEn: string; value: string }[];
}

export interface PaymentEvent {
  providerRef: string;
  subscriptionId: string;
  status: 'APPROVED' | 'REJECTED';
  raw: unknown;
}

export interface PaymentProvider {
  key: ProviderKey;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  handleWebhook?(request: Request): Promise<PaymentEvent>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(readonly provider: ProviderKey) {
    super(`Payment provider "${provider}" is not configured yet`);
    this.name = 'ProviderNotConfiguredError';
  }
}

/**
 * Resolves the provider the admin has switched on.
 *
 * Unknown or not-yet-implemented values fall back to manual rather than
 * throwing: a misconfigured setting should not take checkout offline.
 */
export async function activeProvider(): Promise<PaymentProvider> {
  const key = ((await getSetting('payment.active_provider')) || 'manual') as ProviderKey;
  const { manualProvider } = await import('./manual');

  switch (key) {
    case 'manual':
      return manualProvider;
    default:
      // Gateway support is stubbed; see ./kashier.ts and ./ziina.ts.
      return manualProvider;
  }
}
