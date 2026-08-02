/**
 * WPS-015 production payment copy data.
 *
 * Wording rules carried from WPS-007 and the Warsha Constitution:
 * - no wallet-balance or bank-balance language;
 * - no escrow guarantees;
 * - no instant-refund promises;
 * - no gateway or provider API terminology exposed to customers or workers;
 * - no raw provider error text;
 * - no employment language.
 *
 * This module holds data only so it can be validated directly by the
 * regression suite without pulling in React or Expo.
 */
export const productionPaymentCopy = {
  en: {
    // Checkout phases
    checkoutPreparing: 'Preparing your payment…',
    checkoutAwaitingCustomer: 'Finish the payment to continue.',
    checkoutProcessing: 'Confirming your payment…',
    checkoutSucceeded: 'Payment confirmed',
    checkoutFailed: 'The payment did not go through.',
    checkoutCancelled: 'You cancelled this payment.',
    checkoutExpired: 'This payment session expired.',
    checkoutRequiresReview: 'We are checking this payment.',
    checkoutRequiresReviewDetail: 'Our team is reviewing it. You do not need to pay again yet.',
    awaitingConfirmationNote: 'We confirm every payment with the payment company before marking it complete.',
    doNotClose: 'Please keep this screen open.',

    // Method labels
    methodCard: 'Bank card',
    methodMeezaCard: 'Meeza card',
    methodMobileWallet: 'Mobile wallet',
    methodHostedCheckout: 'Secure payment page',
    methodCash: 'Cash',

    // Method unavailability
    methodUnavailable: 'Not available right now',
    reasonProviderNotSelected: 'Online payment is not switched on yet.',
    reasonProviderUnsupported: 'This method is not available for your booking.',
    reasonCommerciallyUnapproved: 'This method is not switched on yet.',
    reasonMaintenance: 'Payments are briefly paused for maintenance.',
    reasonCashDebtRestricted: 'Cash is not available for this worker right now.',
    cashAlwaysAvailable: 'You pay the worker directly in cash.',

    // Retry and errors
    retryPayment: 'Try again',
    retryAvailableAfterFailure: 'You can try again with a new payment.',
    genericPaymentProblem: 'Something went wrong with the payment. Please try again.',
    paymentsPausedTitle: 'Payments are paused',

    // Refunds
    refundInitiated: 'Refund started',
    refundPending: 'Refund in progress',
    refundCompleted: 'Refund completed',
    refundFailed: 'Refund needs review',
    refundNoTimingPromise: 'The time it takes depends on your bank or wallet provider.',
    refundPartial: 'Partial refund',

    // Worker-facing
    availableToWithdraw: 'Available to withdraw',
    pendingEarnings: 'Pending earnings',
    paidOutEarnings: 'Paid-out earnings',
    cashCommissionDue: 'Commission due on cash work',
    payoutDestination: 'Where you get paid',
    payoutDestinationNeedsAttention: 'Your payout details need attention',
    payoutDestinationNotVerified: 'This destination is not confirmed yet.',
    withdrawalRequested: 'Withdrawal requested',
    withdrawalProcessing: 'Withdrawal in progress',
    withdrawalSucceeded: 'Withdrawal sent',
    withdrawalFailed: 'Withdrawal needs review',
    withdrawalOnHold: 'On hold for review',
    withdrawalsPaused: 'Withdrawals are not switched on yet.',
    minimumWithdrawalNote: 'Minimum withdrawal is EGP 200. Warsha takes no withdrawal fee.',
    noSettlementPromise: 'Timing depends on your bank or wallet provider.',

    // Chargebacks
    chargebackUnderReview: 'A payment case is under review',
    chargebackNoBlame: 'Nothing is taken from you while this is reviewed.',

    // Staff-safe wording
    reconciliationException: 'Reconciliation difference',
    reconciliationOpen: 'Open',
    reconciliationInvestigating: 'Investigating',
    reconciliationResolved: 'Resolved',
    reconciliationAcceptedDifference: 'Accepted difference',
    maintenanceModeActive: 'Maintenance mode is active',
  },
  ar: {
    // Checkout phases
    checkoutPreparing: 'بنجهّز عملية الدفع…',
    checkoutAwaitingCustomer: 'كمّل الدفع علشان نكمّل.',
    checkoutProcessing: 'بنأكّد الدفع…',
    checkoutSucceeded: 'تم تأكيد الدفع',
    checkoutFailed: 'الدفع ما تمّش.',
    checkoutCancelled: 'انت لغيت عملية الدفع دي.',
    checkoutExpired: 'وقت عملية الدفع دي خلص.',
    checkoutRequiresReview: 'بنراجع عملية الدفع دي.',
    checkoutRequiresReviewDetail: 'الفريق بيراجعها. مش محتاج تدفع تاني دلوقتي.',
    awaitingConfirmationNote: 'بنأكّد كل عملية دفع مع شركة الدفع قبل ما نعتبرها تمّت.',
    doNotClose: 'من فضلك سيب الشاشة دي مفتوحة.',

    // Method labels
    methodCard: 'كارت بنكي',
    methodMeezaCard: 'كارت ميزة',
    methodMobileWallet: 'محفظة موبايل',
    methodHostedCheckout: 'صفحة دفع آمنة',
    methodCash: 'كاش',

    // Method unavailability
    methodUnavailable: 'مش متاحة دلوقتي',
    reasonProviderNotSelected: 'الدفع أونلاين لسه مش مفعّل.',
    reasonProviderUnsupported: 'الطريقة دي مش متاحة للحجز ده.',
    reasonCommerciallyUnapproved: 'الطريقة دي لسه مش مفعّلة.',
    reasonMaintenance: 'الدفع متوقف شوية للصيانة.',
    reasonCashDebtRestricted: 'الكاش مش متاح مع الصنايعي ده دلوقتي.',
    cashAlwaysAvailable: 'هتدفع للصنايعي كاش على طول.',

    // Retry and errors
    retryPayment: 'حاول تاني',
    retryAvailableAfterFailure: 'تقدر تحاول تاني بعملية دفع جديدة.',
    genericPaymentProblem: 'حصلت مشكلة في الدفع. من فضلك حاول تاني.',
    paymentsPausedTitle: 'الدفع متوقف مؤقتًا',

    // Refunds
    refundInitiated: 'بدأ استرداد المبلغ',
    refundPending: 'الاسترداد بيتنفّذ',
    refundCompleted: 'تم استرداد المبلغ',
    refundFailed: 'الاسترداد محتاج مراجعة',
    refundNoTimingPromise: 'المدة بتعتمد على البنك أو المحفظة بتاعتك.',
    refundPartial: 'استرداد جزئي',

    // Worker-facing
    availableToWithdraw: 'متاح للسحب',
    pendingEarnings: 'أرباح قيد الانتظار',
    paidOutEarnings: 'أرباح تم صرفها',
    cashCommissionDue: 'عمولة مستحقة على شغل الكاش',
    payoutDestination: 'مكان استلام فلوسك',
    payoutDestinationNeedsAttention: 'بيانات استلام فلوسك محتاجة مراجعة',
    payoutDestinationNotVerified: 'الوجهة دي لسه ما اتأكدتش.',
    withdrawalRequested: 'تم طلب السحب',
    withdrawalProcessing: 'السحب بيتنفّذ',
    withdrawalSucceeded: 'تم إرسال السحب',
    withdrawalFailed: 'السحب محتاج مراجعة',
    withdrawalOnHold: 'موقوف للمراجعة',
    withdrawalsPaused: 'السحب لسه مش مفعّل.',
    minimumWithdrawalNote: 'أقل مبلغ للسحب 200 ج.م. وارشة مش بتاخد أي رسوم على السحب.',
    noSettlementPromise: 'المدة بتعتمد على البنك أو المحفظة بتاعتك.',

    // Chargebacks
    chargebackUnderReview: 'في حالة دفع تحت المراجعة',
    chargebackNoBlame: 'مش هيتخصم منك حاجة وإحنا بنراجع.',

    // Staff-safe wording
    reconciliationException: 'فرق في المطابقة',
    reconciliationOpen: 'مفتوح',
    reconciliationInvestigating: 'بيتفحص',
    reconciliationResolved: 'تم الحل',
    reconciliationAcceptedDifference: 'فرق مقبول',
    maintenanceModeActive: 'وضع الصيانة شغّال',
  },
} as const;

export type ProductionPaymentCopyKey = keyof typeof productionPaymentCopy.en;
