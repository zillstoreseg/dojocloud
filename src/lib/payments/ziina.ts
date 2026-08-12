import { getSetting } from '@/lib/settings';
import { ProviderNotConfiguredError, type PaymentProvider } from './provider';

/**
 * Ziina (Gulf) — not wired up yet. See the note in ./kashier.ts.
 */
export const ziinaProvider: PaymentProvider = {
  key: 'ziina',
  async createCheckout() {
    const apiKey = await getSetting('payment.ziina_api_key');
    if (!apiKey) throw new ProviderNotConfiguredError('ziina');
    throw new ProviderNotConfiguredError('ziina');
  },
};
