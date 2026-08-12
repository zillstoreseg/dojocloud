import { getSetting } from '@/lib/settings';
import { ProviderNotConfiguredError, type PaymentProvider } from './provider';

/**
 * Kashier (Egypt) — not wired up yet.
 *
 * The shape is committed now so that turning it on later is a change inside
 * this file plus a webhook route, rather than a change to every screen that
 * takes money. `createCheckout` refuses loudly instead of silently falling
 * back, so a half-configured gateway can never quietly swallow a payment.
 */
export const kashierProvider: PaymentProvider = {
  key: 'kashier',
  async createCheckout() {
    const apiKey = await getSetting('payment.kashier_api_key');
    if (!apiKey) throw new ProviderNotConfiguredError('kashier');
    throw new ProviderNotConfiguredError('kashier');
  },
};
