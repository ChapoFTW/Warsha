/**
 * Notification titles and bodies, in both languages.
 *
 * Split out of the translations module so it can be imported without
 * pulling in React Native. The web notification list needs exactly these
 * strings, and the parity rule is explicit that a second implementation of a
 * shared authority is a defect even when it looks correct — so the browser
 * reads this table rather than restating it.
 *
 * Nothing here imports anything. That is the point.
 */
const rawCopy = {
  en: {
    notifications:'Notifications',notificationBell:'Open notifications',markAllRead:'Mark all as read',markRead:'Mark as read',dismiss:'Dismiss notification',empty:'No notifications yet',emptyBody:'Booking updates and important account activity will appear here.',loadError:'Couldn’t load notifications.',retry:'Try again',loadMore:'Load more',newUpdate:'New update',justNow:'Just now',
    new_booking_request:'New booking request',booking_message:'New message',booking_pending_provider_approval:'Booking request sent',booking_accepted:'Booking accepted',booking_rejected:'Booking rejected',booking_rescheduling_requested:'New schedule proposed',booking_reschedule_accepted:'Proposed schedule accepted',booking_reschedule_rejected:'Proposed schedule declined',booking_confirmed:'Booking confirmed',booking_provider_on_the_way:'Provider on the way',booking_provider_arrived:'Provider arrived',booking_job_started:'Work started',booking_work_in_progress:'Work in progress',booking_completed:'Work completed',booking_cancelled:'Booking cancelled',booking_no_show:'Customer no-show',booking_disputed:'Problem reported',booking_refunded:'Booking refunded',operation_traveling:'Worker traveling',operation_arrived:'Worker arrived',operation_started:'Work started',operation_paused:'Work paused',operation_resumed:'Work resumed',operation_waiting_for_approval:'Approval needed',operation_additional_work:'Additional work update',operation_delay:'Delay update',operation_finished:'Work finished',operation_inspection:'Inspection ready',operation_completed:'Work completed',operation_return_visit:'Return visit update',review_unlocked:'Review available',verification_submitted:'Verification sent',verification_approved:'Identity verified',verification_rejected:'Verification needs attention',verification_resubmission_requested:'New verification photos needed',verification_expired:'Verification expired',
    new_booking_requestBody:'A customer sent you a new booking request.',booking_messageBody:'You have a new message about your booking.',booking_pending_provider_approvalBody:'Your booking request was sent.',booking_acceptedBody:'The provider accepted your booking.',booking_rejectedBody:'The provider could not accept this booking.',booking_rescheduling_requestedBody:'The provider proposed another date and time.',booking_reschedule_acceptedBody:'The customer accepted your proposed schedule.',booking_reschedule_rejectedBody:'The customer declined your proposed schedule.',booking_confirmedBody:'The proposed schedule or booking was confirmed.',booking_provider_on_the_wayBody:'Your provider is on the way.',booking_provider_arrivedBody:'Your provider has arrived.',booking_job_startedBody:'Work on your booking has started.',booking_work_in_progressBody:'Your booking is now in progress.',booking_completedBody:'The provider marked the work as completed.',booking_cancelledBody:'This booking was cancelled.',booking_no_showBody:'Customer no-show.',booking_disputedBody:'A problem was reported for this booking.',booking_refundedBody:'This booking was marked as refunded.',operation_travelingBody:'The worker is on the way.',operation_arrivedBody:'The worker arrived.',operation_startedBody:'Work on this booking started.',operation_pausedBody:'Work was paused with an auditable update.',operation_resumedBody:'Work resumed.',operation_waiting_for_approvalBody:'A customer decision is needed before work continues.',operation_additional_workBody:'There is an additional-work decision on this booking.',operation_delayBody:'The worker shared a delay update.',operation_finishedBody:'The work is ready for inspection.',operation_inspectionBody:'Review the finished work before closing the booking.',operation_completedBody:'The customer approved completion.',operation_return_visitBody:'There is a return-visit update on the same booking.',review_unlockedBody:'You can now review this completed booking.',verification_submittedBody:'Your photos were sent for review.',verification_approvedBody:'Customers can now see your verified identity.',verification_rejectedBody:'Open verification to see what needs changing.',verification_resubmission_requestedBody:'Please add the requested new photos.',verification_expiredBody:'Take new photos to restore your verified status.',genericBody:'There is a new update for your booking.',
  },
  ar: {
    notifications:'الإشعارات',notificationBell:'فتح الإشعارات',markAllRead:'تحديد الكل كمقروء',markRead:'تحديد كمقروء',dismiss:'حذف الإشعار',empty:'لا توجد إشعارات حتى الآن',emptyBody:'ستظهر هنا تحديثات الحجوزات والأنشطة المهمة في حسابك.',loadError:'تعذر تحميل الإشعارات.',retry:'حاول مرة أخرى',loadMore:'عرض المزيد',newUpdate:'تحديث جديد',justNow:'الآن',
    new_booking_request:'طلب حجز جديد',booking_pending_provider_approval:'تم إرسال طلب الحجز',booking_accepted:'تم قبول الحجز',booking_rejected:'تم رفض الحجز',booking_rescheduling_requested:'اقتراح موعد جديد',booking_reschedule_accepted:'وافق العميل على الموعد',booking_reschedule_rejected:'رفض العميل الموعد',booking_confirmed:'تم تأكيد الحجز',booking_provider_on_the_way:'الفني في الطريق',booking_provider_arrived:'وصل الفني',booking_job_started:'بدأ تنفيذ العمل',booking_work_in_progress:'العمل جارٍ',booking_completed:'اكتمل العمل',booking_cancelled:'تم إلغاء الحجز',booking_no_show:'العميل لم يحضر',booking_disputed:'تم الإبلاغ عن مشكلة',booking_refunded:'تم رد المبلغ',operation_traveling:'الصنايعي في الطريق',operation_arrived:'الصنايعي وصل',operation_started:'الشغل بدأ',operation_paused:'الشغل اتوقف مؤقتًا',operation_resumed:'الشغل اتكمل',operation_waiting_for_approval:'مطلوب موافقة',operation_additional_work:'تحديث شغل إضافي',operation_delay:'تحديث تأخير',operation_finished:'الشغل خلص',operation_inspection:'الشغل جاهز للمعاينة',operation_completed:'الشغل اكتمل',operation_return_visit:'تحديث زيارة الرجوع',review_unlocked:'المراجعة متاحة',verification_submitted:'تم إرسال التوثيق',verification_approved:'تم التحقق من الهوية',verification_rejected:'التوثيق يحتاج تعديل',verification_resubmission_requested:'مطلوب صور توثيق جديدة',verification_expired:'انتهى التوثيق',
    new_booking_requestBody:'أرسل عميل طلب حجز جديد.',booking_pending_provider_approvalBody:'تم إرسال طلب حجزك إلى الفني.',booking_acceptedBody:'وافق الفني على حجزك.',booking_rejectedBody:'تعذر على الفني قبول هذا الحجز.',booking_rescheduling_requestedBody:'اقترح الفني تاريخًا ووقتًا آخرين.',booking_reschedule_acceptedBody:'وافق العميل على الموعد الذي اقترحته.',booking_reschedule_rejectedBody:'رفض العميل الموعد الذي اقترحته.',booking_confirmedBody:'تم تأكيد الحجز أو الموعد المقترح.',booking_provider_on_the_wayBody:'الفني في الطريق إليك.',booking_provider_arrivedBody:'وصل الفني إلى موقع الخدمة.',booking_job_startedBody:'بدأ الفني تنفيذ العمل.',booking_work_in_progressBody:'العمل في حجزك جارٍ الآن.',booking_completedBody:'حدد الفني العمل كمكتمل.',booking_cancelledBody:'تم إلغاء هذا الحجز.',booking_no_showBody:'تم تسجيل عدم الحضور لهذا الحجز.',booking_disputedBody:'تم الإبلاغ عن مشكلة في هذا الحجز.',booking_refundedBody:'تم تسجيل رد المبلغ لهذا الحجز.',operation_travelingBody:'الصنايعي في الطريق.',operation_arrivedBody:'الصنايعي وصل.',operation_startedBody:'الشغل على الحجز بدأ.',operation_pausedBody:'الشغل اتوقف مؤقتًا بتحديث محفوظ في السجل.',operation_resumedBody:'الشغل اتكمل.',operation_waiting_for_approvalBody:'مطلوب قرار من العميل قبل ما الشغل يكمل.',operation_additional_workBody:'فيه قرار بخصوص شغل إضافي على الحجز.',operation_delayBody:'الصنايعي شارك تحديث تأخير.',operation_finishedBody:'الشغل جاهز للمعاينة.',operation_inspectionBody:'عاين الشغل قبل ما تقفل الحجز.',operation_completedBody:'العميل وافق على إكمال الشغل.',operation_return_visitBody:'فيه تحديث زيارة رجوع على نفس الحجز.',review_unlockedBody:'تقدر دلوقتي تراجع الحجز المكتمل.',verification_submittedBody:'تم إرسال صورك للمراجعة.',verification_approvedBody:'العملاء يقدروا يشوفوا إن هويتك موثقة.',verification_rejectedBody:'افتح التوثيق واعرف المطلوب تغييره.',verification_resubmission_requestedBody:'أضف الصور الجديدة المطلوبة.',verification_expiredBody:'صوّر صور جديدة علشان ترجع علامة التوثيق.',genericBody:'يوجد تحديث جديد في حجزك.',
  },
} as const;

/**
 * The financial events, in all three languages.
 *
 * Warsha's payment system emits fifteen notification types directly
 * (`202607300001_payments_earnings_ledger.sql`) and WPS-014's event catalogue
 * adds `payment_required` and `cash_debt_threshold_warning`. None of the
 * seventeen had an entry in this table, so every one of them resolved to the
 * generic "Payment update / Your payment status changed" — in English, Arabic
 * and French, on the web and on both native platforms. A worker was told their
 * earnings had "an update" rather than that they were available to withdraw.
 *
 * The copy existed. It sat in `payment-notification-translations.ts`, complete
 * in three languages, imported by nothing, for as long as the events have been
 * firing. It is here now because this table is the one both platforms read:
 * `web/lib/notifications.ts` calls `legacyNotificationEventCopy` directly and
 * `notification-engagement-translations.ts` falls through to it for every key
 * its own `eventCopy` does not define. A second table would have been a parity
 * defect the moment one side gained an event the other did not.
 *
 * Four of the seventeen — `payment_required`, `payment_failed`, `refund_failed`
 * and `cash_debt_threshold_warning` — are governed by WPS-014, which chose
 * deliberately non-specific wording for them. That wording is reproduced here
 * exactly rather than improved on, so the two tables cannot disagree;
 * `wps014-notifications-engagement.test.mts` asserts they still match.
 *
 * There is no amount, no balance and no payment method in any of these
 * strings. What a reader needs is which of their things changed and whether
 * they must act; the numbers live behind the route the notification opens, and
 * lock-screen previews are category-generic anyway
 * (`notification-push-adapter.ts`).
 */
const financial = {
  en: {
    payment_confirmed: 'Payment confirmed', payment_confirmedBody: 'Your payment has been confirmed.',
    payment_failed: 'Payment needs attention', payment_failedBody: 'Your payment status changed.',
    payment_required: 'Payment required', payment_requiredBody: 'Action is required on your payment.',
    refund_initiated: 'Refund started', refund_initiatedBody: 'Your refund request is being processed.',
    refund_completed: 'Refund completed', refund_completedBody: 'Your refund has been recorded.',
    refund_failed: 'Refund needs attention', refund_failedBody: 'The refund status requires attention.',
    earnings_pending: 'Earnings pending', earnings_pendingBody: 'Job earnings were recorded and are not available yet.',
    earnings_available: 'Earnings available', earnings_availableBody: 'Earnings from a completed job are available to withdraw.',
    earnings_held: 'Earnings temporarily held', earnings_heldBody: 'An amount is held while an issue is reviewed.',
    earnings_released: 'Earnings available again', earnings_releasedBody: 'The review is complete and the amount is available again.',
    withdrawal_requested: 'Withdrawal requested', withdrawal_requestedBody: 'Your withdrawal request is being reviewed.',
    withdrawal_paid: 'Withdrawal completed', withdrawal_paidBody: 'Your withdrawal has been completed.',
    withdrawal_failed: 'Withdrawal update', withdrawal_failedBody: 'The withdrawal could not be completed and the amount is available again.',
    cash_collection_reported: 'Confirm cash payment', cash_collection_reportedBody: 'The provider reported collecting cash. Please confirm what happened.',
    cash_collection_confirmed: 'Cash payment confirmed', cash_collection_confirmedBody: 'The customer confirmed the cash payment.',
    cash_collection_disputed: 'Cash payment needs review', cash_collection_disputedBody: 'The customer did not confirm the reported cash payment.',
    cash_debt_threshold_warning: 'Account action required', cash_debt_threshold_warningBody: 'Your worker financial account requires attention.',
  },
  ar: {
    payment_confirmed: 'تم تأكيد الدفع', payment_confirmedBody: 'تم تأكيد دفع الحجز.',
    payment_failed: 'الدفع محتاج اهتمام', payment_failedBody: 'حالة الدفع اتغيّرت.',
    payment_required: 'مطلوب دفع', payment_requiredBody: 'فيه إجراء مطلوب على الدفع.',
    refund_initiated: 'بدأ استرداد المبلغ', refund_initiatedBody: 'طلب استرداد المبلغ قيد التنفيذ.',
    refund_completed: 'تم استرداد المبلغ', refund_completedBody: 'تم تسجيل استرداد المبلغ.',
    refund_failed: 'الاسترداد محتاج اهتمام', refund_failedBody: 'حالة استرداد المبلغ محتاجة اهتمام.',
    earnings_pending: 'أرباح معلّقة', earnings_pendingBody: 'اتسجلت أرباح الشغل ولسه مش متاحة للسحب.',
    earnings_available: 'أرباحك متاحة', earnings_availableBody: 'أرباح شغل مكتمل بقت متاحة للسحب.',
    earnings_held: 'مبلغ متوقف للمراجعة', earnings_heldBody: 'المبلغ متوقف مؤقتًا لمراجعة مشكلة.',
    earnings_released: 'المبلغ متاح تاني', earnings_releasedBody: 'تم إنهاء المراجعة والمبلغ متاح تاني.',
    withdrawal_requested: 'تم طلب السحب', withdrawal_requestedBody: 'طلب السحب بيتراجع دلوقتي.',
    withdrawal_paid: 'تم صرف الأرباح', withdrawal_paidBody: 'تم إكمال طلب السحب.',
    withdrawal_failed: 'تحديث طلب السحب', withdrawal_failedBody: 'تعذّر إكمال السحب والمبلغ بقى متاح تاني.',
    cash_collection_reported: 'أكد الدفع الكاش', cash_collection_reportedBody: 'الفني سجّل إنه استلم الدفع كاش. أكد لنا اللي حصل.',
    cash_collection_confirmed: 'تم تأكيد الدفع الكاش', cash_collection_confirmedBody: 'العميل أكد الدفع الكاش.',
    cash_collection_disputed: 'الدفع الكاش محتاج مراجعة', cash_collection_disputedBody: 'العميل ما أكدش الدفع الكاش المسجّل.',
    cash_debt_threshold_warning: 'مطلوب إجراء على الحساب', cash_debt_threshold_warningBody: 'حسابك المالي كصنايعي محتاج اهتمام.',
  },
  fr: {
    payment_confirmed: 'Paiement confirmé', payment_confirmedBody: 'Votre paiement a été confirmé.',
    payment_failed: 'Paiement à vérifier', payment_failedBody: 'Le statut de votre paiement a changé.',
    payment_required: 'Paiement requis', payment_requiredBody: 'Une action est requise sur votre paiement.',
    refund_initiated: 'Remboursement commencé', refund_initiatedBody: 'Votre demande de remboursement est en cours.',
    refund_completed: 'Remboursement terminé', refund_completedBody: 'Votre remboursement a été enregistré.',
    refund_failed: 'Remboursement à vérifier', refund_failedBody: 'Le statut du remboursement demande votre attention.',
    earnings_pending: 'Revenus en attente', earnings_pendingBody: 'Les revenus du travail sont enregistrés mais pas encore disponibles.',
    earnings_available: 'Revenus disponibles', earnings_availableBody: 'Les revenus d’un travail terminé peuvent être retirés.',
    earnings_held: 'Revenus temporairement retenus', earnings_heldBody: 'Un montant est retenu pendant l’examen d’un problème.',
    earnings_released: 'Revenus de nouveau disponibles', earnings_releasedBody: 'L’examen est terminé et le montant est de nouveau disponible.',
    withdrawal_requested: 'Retrait demandé', withdrawal_requestedBody: 'Votre demande de retrait est en cours d’examen.',
    withdrawal_paid: 'Retrait terminé', withdrawal_paidBody: 'Votre retrait a été effectué.',
    withdrawal_failed: 'Mise à jour du retrait', withdrawal_failedBody: 'Le retrait n’a pas abouti et le montant est de nouveau disponible.',
    cash_collection_reported: 'Confirmer le paiement en espèces', cash_collection_reportedBody: 'Le professionnel a déclaré avoir reçu les espèces. Confirmez ce qui s’est passé.',
    cash_collection_confirmed: 'Paiement en espèces confirmé', cash_collection_confirmedBody: 'Le client a confirmé le paiement en espèces.',
    cash_collection_disputed: 'Paiement en espèces à examiner', cash_collection_disputedBody: 'Le client n’a pas confirmé le paiement en espèces déclaré.',
    cash_debt_threshold_warning: 'Action requise sur le compte', cash_debt_threshold_warningBody: 'Votre compte financier professionnel demande votre attention.',
  },
} as const;

/** The event keys Warsha's financial system emits. Exported for the tests. */
export const FINANCIAL_NOTIFICATION_EVENT_KEYS = [
  'payment_confirmed', 'payment_failed', 'payment_required',
  'refund_initiated', 'refund_completed', 'refund_failed',
  'earnings_pending', 'earnings_available', 'earnings_held', 'earnings_released',
  'withdrawal_requested', 'withdrawal_paid', 'withdrawal_failed',
  'cash_collection_reported', 'cash_collection_confirmed', 'cash_collection_disputed',
  'cash_debt_threshold_warning',
] as const;

export const copy = {
  en: {
    ...rawCopy.en,
    ...financial.en,
    dispute_opened: 'Dispute opened', dispute_evidence_requested: 'Evidence requested', dispute_evidence_submitted: 'Evidence added', dispute_under_review: 'Dispute under review', dispute_resolved: 'Dispute resolved', dispute_closed: 'Dispute closed', dispute_cancelled: 'Dispute withdrawn',
    dispute_openedBody: 'A dispute was opened for this booking.', dispute_evidence_requestedBody: 'Warsha support requested more evidence.', dispute_evidence_submittedBody: 'New evidence was added to the dispute.', dispute_under_reviewBody: 'Warsha support is reviewing the dispute.', dispute_resolvedBody: 'A resolution is available for the dispute.', dispute_closedBody: 'The dispute was closed.', dispute_cancelledBody: 'The customer withdrew the dispute.',
  },
  ar: {
    ...rawCopy.ar,
    ...financial.ar,
    booking_message: 'رسالة جديدة', booking_messageBody: 'لديك رسالة جديدة بشأن حجزك.',
    dispute_opened: 'تم فتح نزاع', dispute_evidence_requested: 'مطلوب أدلة', dispute_evidence_submitted: 'اتضاف دليل', dispute_under_review: 'النزاع تحت المراجعة', dispute_resolved: 'النزاع اتحل', dispute_closed: 'النزاع اتقفل', dispute_cancelled: 'النزاع اتسحب',
    dispute_openedBody: 'اتفتح نزاع على الحجز ده.', dispute_evidence_requestedBody: 'فريق دعم ورشة طلب أدلة زيادة.', dispute_evidence_submittedBody: 'اتضاف دليل جديد للنزاع.', dispute_under_reviewBody: 'فريق دعم ورشة بيراجع النزاع.', dispute_resolvedBody: 'قرار النزاع بقى متاح.', dispute_closedBody: 'النزاع اتقفل.', dispute_cancelledBody: 'العميل سحب النزاع.',
  },
  fr: {
    ...rawCopy.en,
    ...financial.fr,
    notifications: 'Notifications', notificationBell: 'Ouvrir les notifications', markAllRead: 'Tout marquer comme lu', markRead: 'Marquer comme lu', dismiss: 'Masquer la notification', empty: 'Aucune notification', emptyBody: 'Les mises à jour de vos travaux et les activités importantes du compte apparaîtront ici.', loadError: 'Impossible de charger les notifications.', retry: 'Réessayer', loadMore: 'Afficher plus', newUpdate: 'Nouvelle mise à jour', justNow: "À l'instant",
    new_booking_request: 'Nouvelle demande de réservation', booking_message: 'Nouveau message', booking_pending_provider_approval: 'Demande de réservation envoyée', booking_accepted: 'Réservation acceptée', booking_rejected: 'Réservation refusée', booking_rescheduling_requested: 'Nouveau créneau proposé', booking_reschedule_accepted: 'Nouveau créneau accepté', booking_reschedule_rejected: 'Nouveau créneau refusé', booking_confirmed: 'Réservation confirmée', booking_provider_on_the_way: 'Le professionnel est en route', booking_provider_arrived: 'Le professionnel est arrivé', booking_job_started: 'Travail commencé', booking_work_in_progress: 'Travail en cours', booking_completed: 'Travail terminé', booking_cancelled: 'Réservation annulée', booking_no_show: 'Client absent', booking_disputed: 'Problème signalé', booking_refunded: 'Réservation remboursée', verification_submitted: 'Vérification envoyée', verification_approved: 'Identité vérifiée', verification_rejected: 'Vérification à corriger', verification_resubmission_requested: 'Nouvelles photos requises', verification_expired: 'Vérification expirée',
    operation_traveling: 'Professionnel en route', operation_arrived: 'Professionnel arrivé', operation_started: 'Travail commencé', operation_paused: 'Travail interrompu', operation_resumed: 'Travail repris', operation_waiting_for_approval: 'Accord requis', operation_additional_work: 'Mise à jour du travail supplémentaire', operation_delay: 'Mise à jour du retard', operation_finished: 'Travail prêt', operation_inspection: 'Contrôle requis', operation_completed: 'Travail terminé', operation_return_visit: 'Mise à jour de la visite de retour', review_unlocked: 'Avis disponible',
    new_booking_requestBody: 'Un client vous a envoyé une nouvelle demande.', booking_messageBody: 'Vous avez un nouveau message concernant votre réservation.', booking_pending_provider_approvalBody: 'Votre demande de réservation a été envoyée.', booking_acceptedBody: 'Le professionnel a accepté votre réservation.', booking_rejectedBody: "Le professionnel n'a pas pu accepter cette réservation.", booking_rescheduling_requestedBody: 'Le professionnel a proposé une autre date et heure.', booking_reschedule_acceptedBody: 'Le client a accepté le créneau proposé.', booking_reschedule_rejectedBody: 'Le client a refusé le créneau proposé.', booking_confirmedBody: 'La réservation ou le créneau proposé a été confirmé.', booking_provider_on_the_wayBody: 'Votre professionnel est en route.', booking_provider_arrivedBody: 'Votre professionnel est arrivé.', booking_job_startedBody: 'Le travail a commencé.', booking_work_in_progressBody: 'Votre réservation est en cours.', booking_completedBody: 'Le professionnel a marqué le travail comme terminé.', booking_cancelledBody: 'Cette réservation a été annulée.', booking_no_showBody: "L'absence du client a été enregistrée.", booking_disputedBody: 'Un problème a été signalé pour cette réservation.', booking_refundedBody: 'Cette réservation a été marquée comme remboursée.', verification_submittedBody: 'Vos photos ont été envoyées pour examen.', verification_approvedBody: 'Les clients peuvent voir que votre identité est vérifiée.', verification_rejectedBody: 'Ouvrez la vérification pour voir les corrections demandées.', verification_resubmission_requestedBody: 'Ajoutez les nouvelles photos demandées.', verification_expiredBody: 'Prenez de nouvelles photos pour restaurer votre statut.', genericBody: 'Une nouvelle mise à jour est disponible.',
    operation_travelingBody: 'Le professionnel est en route.', operation_arrivedBody: 'Le professionnel est arrivé.', operation_startedBody: 'Le travail a commencé.', operation_pausedBody: 'Le travail a été interrompu avec une mise à jour enregistrée.', operation_resumedBody: 'Le travail a repris.', operation_waiting_for_approvalBody: 'Votre décision est nécessaire avant la poursuite du travail.', operation_additional_workBody: 'Une décision concernant un travail supplémentaire est disponible.', operation_delayBody: 'Le professionnel a signalé un retard.', operation_finishedBody: 'Le travail est prêt à être contrôlé.', operation_inspectionBody: 'Vérifiez le travail terminé avant de clôturer la réservation.', operation_completedBody: 'Le client a approuvé la fin du travail.', operation_return_visitBody: 'Une visite de retour a été mise à jour pour cette réservation.', review_unlockedBody: 'Vous pouvez maintenant évaluer ce travail terminé.',
    dispute_opened: 'Litige ouvert', dispute_evidence_requested: 'Justificatifs demandés', dispute_evidence_submitted: 'Justificatif ajouté', dispute_under_review: 'Litige en cours d’examen', dispute_resolved: 'Litige résolu', dispute_closed: 'Litige fermé', dispute_cancelled: 'Litige retiré', dispute_openedBody: 'Un litige a été ouvert pour cette réservation.', dispute_evidence_requestedBody: "L'assistance Warsha a demandé des justificatifs supplémentaires.", dispute_evidence_submittedBody: 'Un nouveau justificatif a été ajouté.', dispute_under_reviewBody: "L'assistance Warsha examine le litige.", dispute_resolvedBody: 'Une résolution est disponible.', dispute_closedBody: 'Le litige a été fermé.', dispute_cancelledBody: 'Le client a retiré le litige.',
  },
} as const;

export type NotificationCopyKey = keyof typeof copy.en;
export function notificationCopyKey(type: string): NotificationCopyKey {
  return type in copy.en ? type as NotificationCopyKey : 'newUpdate';
}
export function notificationBodyKey(type: string): NotificationCopyKey {
  const key = `${type}Body`;
  return key in copy.en ? key as NotificationCopyKey : 'genericBody';
}
export function legacyNotificationEventCopy(language: 'en' | 'ar' | 'fr', type: string) {
  const values = copy[language] as Record<string, string>;
  if (!(type in values)) return undefined;
  return { title: values[type], body: values[`${type}Body`] ?? values.genericBody };
}
