import { useLocalization } from '@/src/i18n/localization';

const copy: Record<'en' | 'ar', Record<string, { title: string; body: string }>> = {
  en: {
    payment_confirmed: { title: 'Payment confirmed', body: 'Your payment has been confirmed.' },
    payment_failed: { title: 'Payment failed', body: 'Your payment was not completed. You can try again.' },
    payment_pending: { title: 'Payment pending', body: 'Your payment is still being confirmed.' },
    refund_initiated: { title: 'Refund started', body: 'Your refund request is being processed.' },
    refund_completed: { title: 'Refund completed', body: 'Your refund has been recorded.' },
    refund_failed: { title: 'Refund update', body: 'The refund could not be completed. Contact support for help.' },
    earnings_pending: { title: 'Earnings pending', body: 'Job earnings were recorded and are not available yet.' },
    earnings_available: { title: 'Earnings available', body: 'Earnings from a completed job are available to withdraw.' },
    earnings_held: { title: 'Earnings temporarily held', body: 'An amount is held while an issue is reviewed.' },
    earnings_released: { title: 'Earnings available again', body: 'The review is complete and the amount is available again.' },
    withdrawal_requested: { title: 'Withdrawal requested', body: 'Your withdrawal request is being reviewed.' },
    withdrawal_paid: { title: 'Withdrawal completed', body: 'Your withdrawal has been completed.' },
    withdrawal_failed: { title: 'Withdrawal update', body: 'The withdrawal could not be completed and the amount is available again.' },
    cash_collection_reported: { title: 'Confirm cash payment', body: 'The provider reported collecting cash. Please confirm what happened.' },
    cash_collection_confirmed: { title: 'Cash payment confirmed', body: 'The customer confirmed the cash payment.' },
    cash_collection_disputed: { title: 'Cash payment needs review', body: 'The customer did not confirm the reported cash payment.' },
  },
  ar: {
    payment_confirmed: { title: 'تم تأكيد الدفع', body: 'تم تأكيد دفع الحجز.' },
    payment_failed: { title: 'الدفع ما تمّش', body: 'الدفع ما تمّش. تقدر تحاول تاني.' },
    payment_pending: { title: 'الدفع لسه بيتأكد', body: 'لسه بنتأكد من حالة الدفع.' },
    refund_initiated: { title: 'بدأ استرداد المبلغ', body: 'طلب استرداد المبلغ قيد التنفيذ.' },
    refund_completed: { title: 'تم استرداد المبلغ', body: 'تم تسجيل استرداد المبلغ.' },
    refund_failed: { title: 'تحديث استرداد المبلغ', body: 'تعذّر استرداد المبلغ. كلم الدعم للمساعدة.' },
    earnings_pending: { title: 'أرباح معلّقة', body: 'اتسجلت أرباح الشغل ولسه مش متاحة للسحب.' },
    earnings_available: { title: 'أرباحك متاحة', body: 'أرباح شغل مكتمل بقت متاحة للسحب.' },
    earnings_held: { title: 'مبلغ متوقف للمراجعة', body: 'المبلغ متوقف مؤقتًا لمراجعة مشكلة.' },
    earnings_released: { title: 'المبلغ متاح تاني', body: 'تم إنهاء المراجعة والمبلغ متاح تاني.' },
    withdrawal_requested: { title: 'تم طلب السحب', body: 'طلب السحب بيتراجع دلوقتي.' },
    withdrawal_paid: { title: 'تم صرف الأرباح', body: 'تم إكمال طلب السحب.' },
    withdrawal_failed: { title: 'تحديث طلب السحب', body: 'تعذّر إكمال السحب والمبلغ بقى متاح تاني.' },
    cash_collection_reported: { title: 'أكد الدفع الكاش', body: 'الفني سجّل إنه استلم الدفع كاش. أكد لنا اللي حصل.' },
    cash_collection_confirmed: { title: 'تم تأكيد الدفع الكاش', body: 'العميل أكد الدفع الكاش.' },
    cash_collection_disputed: { title: 'الدفع الكاش محتاج مراجعة', body: 'العميل ما أكدش الدفع الكاش المسجّل.' },
  },
};

export function usePaymentNotificationCopy() {
  const { language } = useLocalization();
  return (type: string) => copy[language][type] ?? null;
}
