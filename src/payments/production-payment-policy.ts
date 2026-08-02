import type { PaymentEnvironment, PaymentMethodKey } from './production-payment-types';

/**
 * Pure WPS-015 policy helpers.
 *
 * This module deliberately has no runtime dependency on Expo, Supabase, or
 * React so that it can be exercised directly by the regression suite. It holds
 * the fail-closed rules that must never drift.
 */

/** Cash is the only method authoritative in Mock mode. */
const MOCK_ONLY_METHODS: PaymentMethodKey[] = ['cash'];

/**
 * A surface that is not fully configured always degrades to disabled. Mock and
 * disabled never depend on provider configuration.
 */
export function effectiveEnvironment(
  requested: PaymentEnvironment,
  fullyConfigured: boolean,
): PaymentEnvironment {
  if (requested === 'disabled' || requested === 'mock') return requested;
  return fullyConfigured ? requested : 'disabled';
}

/**
 * Guards the client bundle against carrying a payment secret. An Expo bundle is
 * publicly readable, so any secret placed there is permanently compromised.
 */
export function assertNoClientPaymentSecrets(env: Record<string, string | undefined>): void {
  const forbidden = Object.keys(env).filter(key =>
    key.startsWith('EXPO_PUBLIC_')
    && /(secret|private_key|api_key|webhook|hmac|payout_key|password)/i.test(key),
  );
  if (forbidden.length > 0) {
    throw new Error(
      `Payment secrets must never be exposed to the client bundle: ${forbidden.join(', ')}`,
    );
  }
}

/** Mock mode must never present a licensed provider surface. */
export function mockOnlyMethods(): PaymentMethodKey[] {
  return [...MOCK_ONLY_METHODS];
}
