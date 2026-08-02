import type { CurrencyCode, MinorAmount } from './payment-types';

/**
 * WPS-015 production payment surface types.
 *
 * These extend the WPS-007 financial contracts. They never introduce a second
 * ledger, a second payment state machine, or a client-side money calculation.
 * Every value here is projected from a server-authoritative RPC.
 */

/** Environment a payment surface is authoritatively operating in. */
export type PaymentEnvironment = 'disabled' | 'mock' | 'sandbox' | 'live';

/** Server-configured launch methods. Cash is governed by WPS-007. */
export type PaymentMethodKey =
  | 'card'
  | 'meeza_card'
  | 'mobile_wallet'
  | 'hosted_checkout'
  | 'cash';

/**
 * Why a method is not offered. The client renders a localized explanation and
 * never invents availability of its own.
 */
export type PaymentMethodUnavailableReason =
  | 'provider_not_selected'
  | 'provider_unsupported'
  | 'commercially_unapproved'
  | 'maintenance'
  | 'cash_debt_restricted';

export type PaymentMethodAvailability = {
  methodKey: PaymentMethodKey;
  enabled: boolean;
  unavailableReasonCode: PaymentMethodUnavailableReason | null;
};

/**
 * Authoritative checkout lifecycle. `succeeded` is only ever reached through a
 * verified provider webhook — a client return from hosted checkout can never
 * produce it.
 */
export type PaymentAttemptStatus =
  | 'created'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'requires_review';

/**
 * The distinct states the app must be able to show while a payment is in
 * flight. `awaitingCustomer` and `processing` are deliberately separate so the
 * customer is never told the payment finished before the provider confirms it.
 */
export type CheckoutPhase =
  | 'preparing'
  | 'awaitingCustomer'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'requiresReview';

export type CheckoutReturnResult = {
  attemptId: string;
  attemptStatus: PaymentAttemptStatus;
  paymentStatus: string;
  awaitingProviderConfirmation: boolean;
  canRetry: boolean;
  requiresReview: boolean;
};

export type ProductionPaymentCapabilities = {
  currency: CurrencyCode;
  gatewayEnvironment: PaymentEnvironment;
  payoutEnvironment: PaymentEnvironment;
  onlinePaymentsEnabled: boolean;
  onlinePaymentsDevelopmentOnly: boolean;
  payoutsEnabled: boolean;
  payoutsDevelopmentOnly: boolean;
  maintenanceMode: boolean;
  reconciliationEnabled: boolean;
  chargebackHandlingEnabled: boolean;
  automaticReleaseSchedulerEnabled: boolean;
  minimumWithdrawalMinor: MinorAmount;
  withdrawalFeeMinor: MinorAmount;
  releaseDelaySeconds: string;
};

/** Payout destination categories confirmed for the Egyptian launch scope. */
export type PayoutDestinationCategory = 'bank_account' | 'mobile_wallet';

/**
 * Tokenization state of a payout destination. Warsha never stores raw bank
 * credentials or wallet PINs; a destination is only usable once the provider
 * has tokenized it, and fails closed otherwise.
 */
export type PayoutTokenizationStatus =
  | 'unavailable'
  | 'pending'
  | 'tokenized'
  | 'failed';

export type ChargebackStatus =
  | 'opened'
  | 'evidence_required'
  | 'under_review'
  | 'won'
  | 'lost'
  | 'reversed'
  | 'cancelled';

export type ReconciliationExceptionType =
  | 'unmatched_provider_record'
  | 'unmatched_warsha_record'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'duplicate_record'
  | 'missing_webhook'
  | 'late_webhook'
  | 'orphan_provider_event'
  | 'ledger_imbalance'
  | 'payout_mismatch';

export type StaffPaymentOperationsSummary = {
  gatewayEnvironment: PaymentEnvironment;
  payoutEnvironment: PaymentEnvironment;
  openReconciliationExceptions: number;
  unreviewedQuarantine: number;
  attemptsRequiringReview: number;
  openChargebacks: number;
  withdrawalsUnderReview: number;
};

/** Maps an authoritative attempt status onto the UX phase. */
export function checkoutPhaseFor(
  status: PaymentAttemptStatus,
  awaitingProviderConfirmation: boolean,
): CheckoutPhase {
  switch (status) {
    case 'created':
      return awaitingProviderConfirmation ? 'awaitingCustomer' : 'preparing';
    case 'pending':
      return 'processing';
    case 'succeeded':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'requires_review':
      return 'requiresReview';
    default:
      return 'preparing';
  }
}

/**
 * A retry may only create a new attempt after a valid terminal failure. This
 * keeps duplicate taps from opening parallel checkouts.
 */
export function canCreateRetryAttempt(status: PaymentAttemptStatus): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'expired';
}

/** No online method may be offered while the gateway surface is disabled. */
export function onlineMethodsSelectable(
  capabilities: Pick<ProductionPaymentCapabilities, 'gatewayEnvironment' | 'maintenanceMode'>,
): boolean {
  return capabilities.gatewayEnvironment !== 'disabled' && !capabilities.maintenanceMode;
}
