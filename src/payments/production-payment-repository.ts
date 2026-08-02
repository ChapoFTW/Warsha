import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';
import type {
  CheckoutReturnResult,
  PaymentMethodAvailability,
  ProductionPaymentCapabilities,
  StaffPaymentOperationsSummary,
} from './production-payment-types';
import { assertNoClientPaymentSecrets, effectiveEnvironment, mockOnlyMethods } from './production-payment-policy';

export { assertNoClientPaymentSecrets, effectiveEnvironment, mockOnlyMethods };

/**
 * WPS-015 production payment repository.
 *
 * Mock and Supabase remain fully isolated. Mock performs no external call and
 * never claims a real provider. Supabase reads only server-authoritative
 * projections; no capability, method, or payment state is decided on device.
 */

/**
 * Mock capabilities deliberately describe a disabled production surface. Mock
 * mode is a development simulation and must never imply that a licensed
 * provider is connected.
 */
function mockCapabilities(): ProductionPaymentCapabilities {
  return {
    currency: 'EGP',
    gatewayEnvironment: 'mock',
    payoutEnvironment: 'mock',
    onlinePaymentsEnabled: true,
    onlinePaymentsDevelopmentOnly: true,
    payoutsEnabled: true,
    payoutsDevelopmentOnly: true,
    maintenanceMode: false,
    reconciliationEnabled: false,
    chargebackHandlingEnabled: false,
    automaticReleaseSchedulerEnabled: false,
    minimumWithdrawalMinor: '20000',
    withdrawalFeeMinor: '0',
    releaseDelaySeconds: '21600',
  };
}

function mockMethodAvailability(): PaymentMethodAvailability[] {
  return [
    { methodKey: 'card', enabled: false, unavailableReasonCode: 'provider_not_selected' },
    { methodKey: 'cash', enabled: true, unavailableReasonCode: null },
    { methodKey: 'hosted_checkout', enabled: false, unavailableReasonCode: 'provider_not_selected' },
    { methodKey: 'meeza_card', enabled: false, unavailableReasonCode: 'provider_not_selected' },
    { methodKey: 'mobile_wallet', enabled: false, unavailableReasonCode: 'provider_not_selected' },
  ];
}

export const productionPaymentRepository = {
  async getCapabilities(): Promise<ProductionPaymentCapabilities> {
    if (environment.dataMode === 'mock') return mockCapabilities();
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_production_payment_capabilities');
    if (error) throw error;
    return data as ProductionPaymentCapabilities;
  },

  async getMethodAvailability(): Promise<PaymentMethodAvailability[]> {
    if (environment.dataMode === 'mock') return mockMethodAvailability();
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_payment_method_availability');
    if (error) throw error;
    return (data ?? []) as PaymentMethodAvailability[];
  },

  /**
   * Resolves what actually happened after a hosted-checkout return. The client
   * passes no status of its own: the server is the only authority, and a
   * success redirect still waits for the verified provider webhook.
   */
  async resolveCheckoutReturn(attemptId: string): Promise<CheckoutReturnResult> {
    if (environment.dataMode === 'mock') {
      return {
        attemptId,
        attemptStatus: 'pending',
        paymentStatus: 'payment_initiated',
        awaitingProviderConfirmation: true,
        canRetry: false,
        requiresReview: false,
      };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('resolve_payment_checkout_return', {
      p_attempt_id: attemptId,
    });
    if (error) throw error;
    return data as CheckoutReturnResult;
  },

  async getStaffOperationsSummary(): Promise<StaffPaymentOperationsSummary> {
    if (environment.dataMode === 'mock') {
      return {
        gatewayEnvironment: 'mock',
        payoutEnvironment: 'mock',
        openReconciliationExceptions: 0,
        unreviewedQuarantine: 0,
        attemptsRequiringReview: 0,
        openChargebacks: 0,
        withdrawalsUnderReview: 0,
      };
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('get_staff_payment_operations_summary');
    if (error) throw error;
    return data as StaffPaymentOperationsSummary;
  },

  async reviewReconciliationException(
    exceptionId: string,
    status: 'investigating' | 'resolved' | 'accepted_difference',
    resolutionNote: string,
  ): Promise<{ id: string; status: string }> {
    if (environment.dataMode === 'mock') {
      throw new Error('Reconciliation review is not available in Mock mode.');
    }
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('review_reconciliation_exception', {
      p_exception_id: exceptionId,
      p_status: status,
      p_resolution_note: resolutionNote,
    });
    if (error) throw error;
    return data as { id: string; status: string };
  },
};

/**
 * The fail-closed policy helpers live in `production-payment-policy.ts` and are
 * re-exported above. There is deliberately no client-side provider credential:
 * a secret in the Expo bundle would be readable by anyone.
 */
