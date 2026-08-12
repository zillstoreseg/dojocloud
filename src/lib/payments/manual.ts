import { getSettings } from '@/lib/settings';
import type { CheckoutResult, PaymentInstructions, PaymentProvider } from './provider';

/**
 * Manual bank/wallet transfer — the flow the platform launches with.
 *
 * There is no gateway call: checkout renders the admin's own transfer details,
 * the trainer uploads a receipt, and an admin activates the subscription from
 * the activations centre.
 */

export async function transferInstructions(): Promise<PaymentInstructions> {
  const settings = await getSettings('payment');

  const accounts = [
    {
      labelAr: 'تحويل بنكي',
      labelEn: 'Bank transfer',
      value: [settings['payment.bank_name'], settings['payment.bank_account']]
        .filter(Boolean)
        .join(' — '),
    },
    { labelAr: 'إنستاباي', labelEn: 'InstaPay', value: settings['payment.instapay'] ?? '' },
    {
      labelAr: 'فودافون كاش',
      labelEn: 'Vodafone Cash',
      value: settings['payment.vodafone_cash'] ?? '',
    },
  ].filter((account) => account.value.trim().length > 0);

  return {
    textAr: settings['payment.instructions_ar'] ?? '',
    textEn: settings['payment.instructions_en'] ?? '',
    accounts,
  };
}

export const manualProvider: PaymentProvider = {
  key: 'manual',
  async createCheckout(): Promise<CheckoutResult> {
    return { kind: 'instructions', instructions: await transferInstructions() };
  },
};
