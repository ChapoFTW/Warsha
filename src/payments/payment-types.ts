export type CurrencyCode = 'EGP';
export type MinorAmount = string;
export type PaymentMethod = 'online' | 'cash';
export type PaymentStatus =
  | 'not_required'
  | 'awaiting_payment'
  | 'payment_initiated'
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'partially_refunded'
  | 'refunded'
  | 'disputed'
  | 'chargeback'
  | 'expired';

export type PriceSnapshot = {
  serviceSubtotalMinor: MinorAmount;
  calloutFeeMinor: MinorAmount;
  emergencyFeeMinor: MinorAmount;
  discountMinor: MinorAmount;
  promotionMinor: MinorAmount;
  taxMinor: MinorAmount;
  approvedJobPriceMinor: MinorAmount;
  customerTotalMinor: MinorAmount;
  currency: CurrencyCode;
  version: number;
};

export type BookingPayment = {
  paymentId: string;
  attemptId?: string;
  bookingId: string;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  amountMinor: MinorAmount;
  refundedMinor: MinorAmount;
  currency: CurrencyCode;
  reference: string;
  paidAt?: string;
  createdAt: string;
  refundStatus?: string;
  snapshot: PriceSnapshot;
};

export type ProviderBookingPayment = Pick<
  BookingPayment,
  'paymentId' | 'bookingId' | 'status' | 'paymentMethod' | 'amountMinor' | 'currency' | 'reference' | 'createdAt'
> & {
  approvedJobPriceMinor: MinorAmount;
  commissionMinor: MinorAmount;
};

export type PaymentReceipt = {
  transactionReference: string;
  bookingReference: string;
  serviceId?: string | null;
  serviceTranslationKey?: string | null;
  service: string;
  providerName: string;
  timestamp: string;
  approvedJobPriceMinor: MinorAmount;
  promotionMinor: MinorAmount;
  amountMinor: MinorAmount;
  currency: CurrencyCode;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  refundedMinor: MinorAmount;
};

export type EarningStatus =
  | 'pending_job_completion'
  | 'pending_release'
  | 'available'
  | 'withdrawal_requested'
  | 'paid_out'
  | 'reversed'
  | 'held_for_dispute';

export type ProviderEarning = {
  id: string;
  bookingId: string;
  serviceId?: string | null;
  serviceTranslationKey?: string | null;
  service: string;
  date: string;
  grossMinor: MinorAmount;
  commissionMinor: MinorAmount;
  netMinor: MinorAmount;
  debtOffsetMinor: MinorAmount;
  heldMinor: MinorAmount;
  currency: CurrencyCode;
  status: EarningStatus;
  releaseEligibleAt?: string;
  customerConfirmedAt?: string;
};

export type EarningsSummary = {
  providerId: string;
  currency: CurrencyCode;
  availableMinor: MinorAmount;
  pendingMinor: MinorAmount;
  paidOutMinor: MinorAmount;
  heldMinor: MinorAmount;
  cashCommissionDueMinor: MinorAmount;
  recoverableAdjustmentMinor: MinorAmount;
  cashDebtRestrictionThresholdMinor: MinorAmount;
  cashPaymentsRestricted: boolean;
  minimumWithdrawalMinor: MinorAmount;
  withdrawalFeeMinor: MinorAmount;
  withdrawalsEnabled: boolean;
  releaseDelaySeconds: string;
  automaticReleaseSchedulerEnabled: boolean;
  transactions: ProviderEarning[];
};

export type PayoutDestinationType =
  | 'mobile_wallet'
  | 'bank_account';

export type PayoutDestination = {
  id: string;
  type: PayoutDestinationType;
  label: string;
  maskedValue: string;
  isPreferred: boolean;
  status: 'active' | 'disabled';
};

export type WithdrawalStatus =
  | 'requested'
  | 'under_review'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'reversed';

export type WithdrawalRequest = {
  id: string;
  amountMinor: MinorAmount;
  currency: CurrencyCode;
  status: WithdrawalStatus;
  reference: string;
  destinationMasked: string;
  requestedAt?: string;
};

export type PriceAdjustment = {
  id: string;
  bookingId: string;
  proposedTotalMinor: MinorAmount;
  currency: CurrencyCode;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  proposedAt: string;
};

export type CheckoutInput = {
  bookingId: string;
  providerId: string;
  serviceId?: string | null;
  serviceTranslationKey?: string | null;
  service: string;
  providerName: string;
  totalMinor: MinorAmount;
  method: PaymentMethod;
  idempotencyKey: string;
};

export type BookingPaymentOptions = {
  currency: CurrencyCode;
  cashEnabled: boolean;
  onlineEnabled: boolean;
  onlineDevelopmentOnly: boolean;
  cashRestrictionReason?: string;
};

export type FinancialCapabilities = {
  currency: CurrencyCode;
  onlinePaymentsEnabled: boolean;
  onlinePaymentsDevelopmentOnly: boolean;
  cashPaymentsEnabled: boolean;
  withdrawalsEnabled: boolean;
  withdrawalsDevelopmentOnly: boolean;
  minimumWithdrawalMinor: MinorAmount;
  releaseDelaySeconds: string;
  automaticReleaseSchedulerEnabled: boolean;
};
