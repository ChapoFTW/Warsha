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


/**
 * The rest of the notification catalogue.
 *
 * The event catalogue holds 108 events. Nineteen of them resolved to copy on
 * both platforms in every language; the other eighty-nine fell through to the
 * generic category line — "Your worker account has an update" — which meant an
 * approved worker and a REJECTED worker were shown the same sentence. Forty of
 * those had English and Arabic in the native `eventCopy` and nothing on the
 * web, because the browser reads only this table; forty-nine had no copy at all.
 *
 * The English and Arabic for the forty are lifted verbatim from `eventCopy` so
 * the two tables cannot disagree; `notification-catalogue.test.mts` asserts they
 * still match, and that every catalogued event resolves here in all three
 * languages.
 */
const catalogue = {
  en: {
    account_created: 'Welcome to Warsha', account_createdBody: 'Your account was created.',
    booking_attachment: 'New attachment', booking_attachmentBody: 'You have a new message in Warsha.',
    certificate_approved: 'Certificate approved', certificate_approvedBody: 'A certificate is now verified on your profile.',
    certificate_rejected: 'Certificate needs attention', certificate_rejectedBody: 'A certificate submission needs correction.',
    communication_report_received: 'Report received', communication_report_receivedBody: 'Your safety report was received.',
    conversation_read_only: 'Conversation update', conversation_read_onlyBody: 'A booking conversation is now read-only.',
    criminal_record_correction_required: 'Criminal record needs attention', criminal_record_correction_requiredBody: 'Something needs correcting on your criminal record.',
    criminal_record_received: 'Criminal record received', criminal_record_receivedBody: 'Your criminal record was received and is being reviewed.',
    criminal_record_required: 'Criminal record required', criminal_record_requiredBody: 'Your application needs a criminal record.',
    customer_onboarding_incomplete: 'Finish setting up', customer_onboarding_incompleteBody: 'Your account still needs a few details.',
    dispute_response_required: 'Response required', dispute_response_requiredBody: 'A dispute requires your response.',
    email_changed: 'Email changed', email_changedBody: 'Your Warsha account security changed.',
    emergency_request: 'Urgent opportunity', emergency_requestBody: 'An urgent service opportunity requires your attention.',
    identity_approved: 'Identity verified', identity_approvedBody: 'Your identity has been verified.',
    identity_correction_required: 'Identity photos need attention', identity_correction_requiredBody: 'Something needs correcting before your identity can be verified.',
    identity_upload_received: 'Photos received', identity_upload_receivedBody: 'Your identity photos were received and are being reviewed.',
    legal_acceptance_recorded: 'Acceptance recorded', legal_acceptance_recordedBody: 'Your acceptance was recorded.',
    legal_acceptance_required: 'Action needed on our terms', legal_acceptance_requiredBody: 'Please review and accept the updated terms.',
    legal_update_available: 'Our terms have been updated', legal_update_availableBody: 'You can read what changed.',
    marketplace_booking_confirmed: 'Worker confirmed', marketplace_booking_confirmedBody: 'Your service request is now a confirmed booking.',
    marketplace_no_providers: 'No workers found', marketplace_no_providersBody: 'No eligible worker was found yet.',
    marketplace_rematching: 'Matching restarted', marketplace_rematchingBody: 'Warsha is looking for another eligible worker.',
    marketplace_request_expired: 'Request expired', marketplace_request_expiredBody: 'Your service request expired.',
    new_review: 'New review', new_reviewBody: 'A completed booking has a review update.',
    operation_additional_work_approved: 'Additional work approved', operation_additional_work_approvedBody: 'An additional-work decision is available.',
    operation_additional_work_needs_clarification: 'Clarification required', operation_additional_work_needs_clarificationBody: 'Additional work requires clarification.',
    operation_additional_work_rejected: 'Additional work declined', operation_additional_work_rejectedBody: 'An additional-work decision is available.',
    operation_additional_work_requested: 'Additional work approval', operation_additional_work_requestedBody: 'Additional work requires your decision.',
    operation_ready_for_inspection: 'Inspection required', operation_ready_for_inspectionBody: 'Work is ready for your inspection.',
    operation_return_visit_accepted: 'Return visit accepted', operation_return_visit_acceptedBody: 'The return visit request was accepted.',
    operation_return_visit_declined: 'Return visit declined', operation_return_visit_declinedBody: 'The return visit request was declined.',
    operation_return_visit_requested: 'Return visit request', operation_return_visit_requestedBody: 'A return visit requires your response.',
    password_changed: 'Password changed', password_changedBody: 'Your Warsha account security changed.',
    phone_changed: 'Phone changed', phone_changedBody: 'Your Warsha account security changed.',
    phone_verification_required: 'Phone verification required', phone_verification_requiredBody: 'Your account needs a verified phone number.',
    privacy_deletion_blocked: 'Deletion needs attention', privacy_deletion_blockedBody: 'Something must be settled before your account can be deleted.',
    privacy_deletion_cancelled: 'Deletion cancelled', privacy_deletion_cancelledBody: 'Your account deletion request was cancelled.',
    privacy_deletion_completed: 'Deletion complete', privacy_deletion_completedBody: 'Your account deletion has been completed.',
    privacy_deletion_requested: 'Deletion requested', privacy_deletion_requestedBody: 'Your account deletion request was received.',
    privacy_export_expired: 'Data export expired', privacy_export_expiredBody: 'Your data export link has expired. You can request a new one.',
    privacy_export_ready: 'Your data is ready', privacy_export_readyBody: 'Your data export is ready to download.',
    promotion_available: 'A promotion is available', promotion_availableBody: 'There is a promotion you can use.',
    promotion_expiring: 'Promotion ending soon', promotion_expiringBody: 'A promotion you can use is ending soon.',
    promotion_redeemed: 'Promotion applied', promotion_redeemedBody: 'Your promotion was applied.',
    quote_confirmation_expired: 'Confirmation expired', quote_confirmation_expiredBody: 'The selected worker did not confirm in time.',
    quote_expired: 'Quote expired', quote_expiredBody: 'Your quote is no longer active.',
    quote_invitation: 'New opportunity', quote_invitationBody: 'A service opportunity requires your attention.',
    quote_received: 'New quote', quote_receivedBody: 'Your service request has a quote update.',
    quote_revised: 'Quote updated', quote_revisedBody: 'Your service request has a quote update.',
    quote_selected: 'Confirmation required', quote_selectedBody: 'A customer selected your quote.',
    referral_pending: 'Referral in progress', referral_pendingBody: 'Your referral is being confirmed.',
    referral_qualified: 'Referral confirmed', referral_qualifiedBody: 'Your referral qualified.',
    request_awarded_elsewhere: 'Request closed', request_awarded_elsewhereBody: 'This request was awarded to another worker.',
    request_cancelled: 'Request cancelled', request_cancelledBody: 'The customer cancelled this service request.',
    request_edited: 'Request updated', request_editedBody: 'A service request you were invited to has changed.',
    review_moderation_outcome: 'Review update', review_moderation_outcomeBody: 'A moderation decision is available.',
    review_publication_held: 'Review publication held', review_publication_heldBody: 'Review publication changed because of a dispute.',
    review_publication_restored: 'Review restored', review_publication_restoredBody: 'Review publication is available again.',
    review_reply: 'Review reply', review_replyBody: 'A provider replied to a review.',
    review_reported: 'Report received', review_reportedBody: 'Your review report was received.',
    staff_appeal_submitted: 'Appeal submitted', staff_appeal_submittedBody: 'An appeal needs review.',
    staff_case_assigned: 'Case assigned', staff_case_assignedBody: 'A case was assigned to you.',
    staff_case_escalated: 'Case escalated', staff_case_escalatedBody: 'A case was escalated.',
    staff_configuration_awaiting_approval: 'Approval needed', staff_configuration_awaiting_approvalBody: 'A configuration change is waiting for approval.',
    staff_evidence_deadline: 'Evidence deadline', staff_evidence_deadlineBody: 'An evidence deadline needs attention.',
    staff_high_priority_report: 'High priority report', staff_high_priority_reportBody: 'A report needs immediate review.',
    staff_incident_escalation: 'Incident escalated', staff_incident_escalationBody: 'An incident was escalated.',
    staff_payout_failure: 'Payout failure', staff_payout_failureBody: 'A payout requires attention.',
    staff_reconciliation_exception: 'Reconciliation exception', staff_reconciliation_exceptionBody: 'A financial reconciliation needs review.',
    staff_security_incident: 'Security incident', staff_security_incidentBody: 'A security incident needs review.',
    staff_support_case_assigned: 'Support case assigned', staff_support_case_assignedBody: 'A support case was assigned to you.',
    staff_support_customer_reply: 'Customer replied', staff_support_customer_replyBody: 'A customer replied on a support case.',
    staff_support_sla_breach: 'Response overdue', staff_support_sla_breachBody: 'A support case has passed its response time.',
    staff_support_worker_reply: 'Worker replied', staff_support_worker_replyBody: 'A worker replied on a support case.',
    support_case_assigned: 'Support case assigned', support_case_assignedBody: 'Someone is looking at your support request.',
    support_case_opened: 'Support case opened', support_case_openedBody: 'We received your support request.',
    support_case_reopened: 'Support case reopened', support_case_reopenedBody: 'Your support case was reopened.',
    support_case_replied: 'Support replied', support_case_repliedBody: 'There is a new reply on your support case.',
    support_case_resolved: 'Support case resolved', support_case_resolvedBody: 'Your support case was resolved.',
    support_survey_available: 'Tell us how we did', support_survey_availableBody: 'You can rate your support experience.',
    vetting_appeal_submitted: 'Appeal received', vetting_appeal_submittedBody: 'Your appeal was received.',
    vetting_appeal_updated: 'Appeal update', vetting_appeal_updatedBody: 'There is a decision on your appeal.',
    worker_approved: 'You are approved to work', worker_approvedBody: 'Your worker account is approved. You can start receiving jobs.',
    worker_manual_review: 'Under review', worker_manual_reviewBody: 'A person is reviewing your application.',
    worker_onboarding_incomplete: 'Finish your setup', worker_onboarding_incompleteBody: 'Your worker profile still needs a few details.',
    worker_profile_discoverable: 'Profile available', worker_profile_discoverableBody: 'Your worker profile is visible in the marketplace.',
    worker_profile_unavailable: 'Profile unavailable', worker_profile_unavailableBody: 'A blocking requirement is hiding your worker profile.',
    worker_provisionally_active: 'Provisionally active', worker_provisionally_activeBody: 'You can start working while the final checks finish.',
    worker_rejected: 'Application not approved', worker_rejectedBody: 'Your worker application was not approved. Open your account to see what to do next.',
  },
  ar: {
    account_created: 'أهلاً بك في ورشة', account_createdBody: 'تم إنشاء حسابك.',
    booking_attachment: 'مرفق جديد', booking_attachmentBody: 'عندك رسالة جديدة على ورشة.',
    certificate_approved: 'الشهادة اتوافقت', certificate_approvedBody: 'الشهادة بقت موثقة على حسابك.',
    certificate_rejected: 'الشهادة محتاجة تعديل', certificate_rejectedBody: 'بيانات الشهادة محتاجة تصحيح.',
    communication_report_received: 'البلاغ اتسجل', communication_report_receivedBody: 'استلمنا بلاغ الأمان بتاعك.',
    conversation_read_only: 'تحديث المحادثة', conversation_read_onlyBody: 'محادثة الحجز بقت للقراءة بس.',
    criminal_record_correction_required: 'الصحيفة محتاجة تعديل', criminal_record_correction_requiredBody: 'فيه حاجة محتاجة تتعدل في الصحيفة.',
    criminal_record_received: 'استلمنا الصحيفة', criminal_record_receivedBody: 'استلمنا الصحيفة وجاري مراجعتها.',
    criminal_record_required: 'مطلوب صحيفة الحالة الجنائية', criminal_record_requiredBody: 'طلبك محتاج صحيفة الحالة الجنائية.',
    customer_onboarding_incomplete: 'كمّل بياناتك', customer_onboarding_incompleteBody: 'حسابك لسه ناقصه شوية بيانات.',
    dispute_response_required: 'مطلوب رد', dispute_response_requiredBody: 'النزاع محتاج ردك.',
    email_changed: 'الإيميل اتغيّر', email_changedBody: 'أمان حسابك على ورشة اتغيّر.',
    emergency_request: 'فرصة عاجلة', emergency_requestBody: 'فيه فرصة خدمة عاجلة محتاجة اهتمامك.',
    identity_approved: 'تم التحقق من الهوية', identity_approvedBody: 'تم التحقق من هويتك.',
    identity_correction_required: 'صور الهوية محتاجة تعديل', identity_correction_requiredBody: 'فيه حاجة محتاجة تتعدل قبل ما نتحقق من هويتك.',
    identity_upload_received: 'استلمنا الصور', identity_upload_receivedBody: 'استلمنا صور الهوية وجاري مراجعتها.',
    legal_acceptance_recorded: 'اتسجلت الموافقة', legal_acceptance_recordedBody: 'اتسجلت موافقتك.',
    legal_acceptance_required: 'مطلوب موافقة على الشروط', legal_acceptance_requiredBody: 'راجع الشروط المحدثة ووافق عليها.',
    legal_update_available: 'الشروط اتحدثت', legal_update_availableBody: 'تقدر تقرأ اللي اتغير.',
    marketplace_booking_confirmed: 'الصنايعي أكد', marketplace_booking_confirmedBody: 'طلب الخدمة بقى حجز مؤكد.',
    marketplace_no_providers: 'ملقيناش صنايعي مناسب', marketplace_no_providersBody: 'ملقيناش صنايعي مؤهل لحد دلوقتي.',
    marketplace_rematching: 'البحث بدأ تاني', marketplace_rematchingBody: 'ورشة بتدور على صنايعي مؤهل تاني.',
    marketplace_request_expired: 'وقت الطلب انتهى', marketplace_request_expiredBody: 'وقت طلب الخدمة انتهى.',
    new_review: 'تقييم جديد', new_reviewBody: 'فيه تحديث تقييم على حجز مكتمل.',
    operation_additional_work_approved: 'الشغل الإضافي اتوافق عليه', operation_additional_work_approvedBody: 'قرار الشغل الإضافي بقى متاح.',
    operation_additional_work_needs_clarification: 'مطلوب توضيح', operation_additional_work_needs_clarificationBody: 'الشغل الإضافي محتاج توضيح.',
    operation_additional_work_rejected: 'الشغل الإضافي اترفض', operation_additional_work_rejectedBody: 'قرار الشغل الإضافي بقى متاح.',
    operation_additional_work_requested: 'موافقة على شغل إضافي', operation_additional_work_requestedBody: 'الشغل الإضافي محتاج قرارك.',
    operation_ready_for_inspection: 'مطلوب معاينة', operation_ready_for_inspectionBody: 'الشغل جاهز لمعاينتك.',
    operation_return_visit_accepted: 'زيارة الرجوع اتقبلت', operation_return_visit_acceptedBody: 'طلب زيارة الرجوع اتقبل.',
    operation_return_visit_declined: 'زيارة الرجوع اترفضت', operation_return_visit_declinedBody: 'طلب زيارة الرجوع اترفض.',
    operation_return_visit_requested: 'طلب زيارة رجوع', operation_return_visit_requestedBody: 'زيارة الرجوع محتاجة ردك.',
    password_changed: 'كلمة السر اتغيّرت', password_changedBody: 'أمان حسابك على ورشة اتغيّر.',
    phone_changed: 'رقم الموبايل اتغيّر', phone_changedBody: 'أمان حسابك على ورشة اتغيّر.',
    phone_verification_required: 'مطلوب تأكيد الموبايل', phone_verification_requiredBody: 'حسابك محتاج رقم موبايل متأكد.',
    privacy_deletion_blocked: 'الحذف محتاج مراجعة', privacy_deletion_blockedBody: 'فيه حاجة لازم تتقفل قبل ما الحساب يتحذف.',
    privacy_deletion_cancelled: 'اتلغى طلب الحذف', privacy_deletion_cancelledBody: 'طلب حذف حسابك اتلغى.',
    privacy_deletion_completed: 'تم حذف الحساب', privacy_deletion_completedBody: 'تم إكمال حذف حسابك.',
    privacy_deletion_requested: 'طلب حذف الحساب', privacy_deletion_requestedBody: 'استلمنا طلب حذف حسابك.',
    privacy_export_expired: 'انتهت صلاحية النسخة', privacy_export_expiredBody: 'رابط نسخة بياناتك انتهت صلاحيته. تقدر تطلب واحد جديد.',
    privacy_export_ready: 'بياناتك جاهزة', privacy_export_readyBody: 'نسخة بياناتك جاهزة للتحميل.',
    promotion_available: 'فيه عرض متاح', promotion_availableBody: 'فيه عرض تقدر تستخدمه.',
    promotion_expiring: 'العرض قرب يخلص', promotion_expiringBody: 'فيه عرض تقدر تستخدمه قرب ينتهي.',
    promotion_redeemed: 'اتطبق العرض', promotion_redeemedBody: 'العرض بتاعك اتطبق.',
    quote_confirmation_expired: 'مهلة التأكيد انتهت', quote_confirmation_expiredBody: 'الصنايعي المختار مأكّدش في الوقت.',
    quote_expired: 'عرض السعر انتهى', quote_expiredBody: 'عرض السعر بتاعك مبقاش متاح.',
    quote_invitation: 'فرصة شغل جديدة', quote_invitationBody: 'فيه فرصة خدمة محتاجة اهتمامك.',
    quote_received: 'عرض سعر جديد', quote_receivedBody: 'فيه تحديث عروض على طلب الخدمة.',
    quote_revised: 'عرض السعر اتحدّث', quote_revisedBody: 'فيه تحديث عروض على طلب الخدمة.',
    quote_selected: 'مطلوب تأكيد', quote_selectedBody: 'عميل اختار عرض السعر بتاعك.',
    referral_pending: 'الدعوة قيد التأكيد', referral_pendingBody: 'الدعوة بتاعتك بيتم تأكيدها.',
    referral_qualified: 'اتأكدت الدعوة', referral_qualifiedBody: 'الدعوة بتاعتك اتأهلت.',
    request_awarded_elsewhere: 'الطلب اتقفل', request_awarded_elsewhereBody: 'الطلب اتسند لصنايعي تاني.',
    request_cancelled: 'الطلب اتلغى', request_cancelledBody: 'العميل لغى طلب الخدمة.',
    request_edited: 'الطلب اتحدّث', request_editedBody: 'طلب خدمة اتعزمت عليه اتغيّر.',
    review_moderation_outcome: 'تحديث تقييم', review_moderation_outcomeBody: 'قرار مراجعة التقييم بقى متاح.',
    review_publication_held: 'نشر التقييم اتوقف', review_publication_heldBody: 'نشر التقييم اتغيّر بسبب نزاع.',
    review_publication_restored: 'التقييم رجع', review_publication_restoredBody: 'نشر التقييم بقى متاح تاني.',
    review_reply: 'رد على التقييم', review_replyBody: 'الصنايعي رد على تقييم.',
    review_reported: 'البلاغ اتسجل', review_reportedBody: 'استلمنا بلاغك عن التقييم.',
    staff_appeal_submitted: 'اتقدم تظلم', staff_appeal_submittedBody: 'فيه تظلم محتاج مراجعة.',
    staff_case_assigned: 'اتخصصت حالة', staff_case_assignedBody: 'فيه حالة اتخصصت ليك.',
    staff_case_escalated: 'حالة اتصعّدت', staff_case_escalatedBody: 'فيه حالة اتصعّدت.',
    staff_configuration_awaiting_approval: 'مطلوب موافقة', staff_configuration_awaiting_approvalBody: 'فيه تغيير إعدادات مستني موافقة.',
    staff_evidence_deadline: 'ميعاد الأدلة', staff_evidence_deadlineBody: 'فيه ميعاد أدلة محتاج اهتمام.',
    staff_high_priority_report: 'بلاغ عاجل', staff_high_priority_reportBody: 'فيه بلاغ محتاج مراجعة فورية.',
    staff_incident_escalation: 'حادث اتصعّد', staff_incident_escalationBody: 'فيه حادث اتصعّد.',
    staff_payout_failure: 'فشل في الصرف', staff_payout_failureBody: 'فيه صرف محتاج اهتمام.',
    staff_reconciliation_exception: 'استثناء في التسوية', staff_reconciliation_exceptionBody: 'فيه تسوية مالية محتاجة مراجعة.',
    staff_security_incident: 'حادث أمني', staff_security_incidentBody: 'فيه حادث أمني محتاج مراجعة.',
    staff_support_case_assigned: 'اتخصصت حالة دعم', staff_support_case_assignedBody: 'فيه حالة دعم اتخصصت ليك.',
    staff_support_customer_reply: 'العميل رد', staff_support_customer_replyBody: 'عميل رد على حالة دعم.',
    staff_support_sla_breach: 'الرد متأخر', staff_support_sla_breachBody: 'فيه حالة دعم عدت وقت الرد.',
    staff_support_worker_reply: 'الصنايعي رد', staff_support_worker_replyBody: 'صنايعي رد على حالة دعم.',
    support_case_assigned: 'اتخصصت حالة الدعم', support_case_assignedBody: 'فيه حد بيشوف طلب الدعم بتاعك.',
    support_case_opened: 'اتفتحت حالة دعم', support_case_openedBody: 'استلمنا طلب الدعم بتاعك.',
    support_case_reopened: 'اتفتحت تاني', support_case_reopenedBody: 'حالة الدعم بتاعتك اتفتحت تاني.',
    support_case_replied: 'رد من الدعم', support_case_repliedBody: 'فيه رد جديد على حالة الدعم بتاعتك.',
    support_case_resolved: 'اتقفلت حالة الدعم', support_case_resolvedBody: 'حالة الدعم بتاعتك اتحلت.',
    support_survey_available: 'قيّم تجربتك', support_survey_availableBody: 'تقدر تقيّم تجربتك مع الدعم.',
    vetting_appeal_submitted: 'استلمنا التظلم', vetting_appeal_submittedBody: 'استلمنا التظلم بتاعك.',
    vetting_appeal_updated: 'تحديث التظلم', vetting_appeal_updatedBody: 'فيه قرار في التظلم بتاعك.',
    worker_approved: 'تم اعتماد حسابك', worker_approvedBody: 'حساب الصنايعي بتاعك اتعتمد. تقدر تبدأ تستقبل شغل.',
    worker_manual_review: 'تحت المراجعة', worker_manual_reviewBody: 'فيه حد بيراجع طلبك.',
    worker_onboarding_incomplete: 'كمّل بياناتك', worker_onboarding_incompleteBody: 'حساب الصنايعي بتاعك لسه ناقصه شوية بيانات.',
    worker_profile_discoverable: 'حسابك بقى متاح', worker_profile_discoverableBody: 'حساب الصنايعي ظاهر دلوقتي في السوق.',
    worker_profile_unavailable: 'حسابك مش متاح', worker_profile_unavailableBody: 'فيه متطلب مانع حساب الصنايعي من الظهور.',
    worker_provisionally_active: 'نشط مؤقتًا', worker_provisionally_activeBody: 'تقدر تبدأ شغل لحد ما الفحوصات الأخيرة تخلص.',
    worker_rejected: 'الطلب مترفضش يتقبل', worker_rejectedBody: 'طلب الصنايعي بتاعك ما اتقبلش. افتح حسابك تشوف الخطوة الجاية.',
  },
  fr: {
    account_created: 'Bienvenue sur Warsha', account_createdBody: 'Votre compte a été créé.',
    booking_attachment: 'Nouvelle pièce jointe', booking_attachmentBody: 'Vous avez un nouveau message dans Warsha.',
    certificate_approved: 'Certificat validé', certificate_approvedBody: 'Un certificat est vérifié sur votre profil.',
    certificate_rejected: 'Certificat à corriger', certificate_rejectedBody: 'Un certificat envoyé demande une correction.',
    communication_report_received: 'Signalement enregistré', communication_report_receivedBody: 'Nous avons reçu votre signalement de sécurité.',
    conversation_read_only: 'Conversation en lecture seule', conversation_read_onlyBody: 'La conversation du travail est passée en lecture seule.',
    criminal_record_correction_required: 'Extrait à corriger', criminal_record_correction_requiredBody: 'Un élément doit être corrigé sur votre extrait.',
    criminal_record_received: 'Extrait reçu', criminal_record_receivedBody: 'Votre extrait a été reçu et est en cours d’examen.',
    criminal_record_required: 'Extrait de casier judiciaire requis', criminal_record_requiredBody: 'Votre dossier nécessite un extrait de casier judiciaire.',
    customer_onboarding_incomplete: 'Terminez votre inscription', customer_onboarding_incompleteBody: 'Votre compte demande encore quelques informations.',
    dispute_response_required: 'Réponse requise', dispute_response_requiredBody: 'Un litige demande votre réponse.',
    email_changed: 'E-mail modifié', email_changedBody: 'La sécurité de votre compte Warsha a changé.',
    emergency_request: 'Opportunité urgente', emergency_requestBody: 'Une opportunité urgente demande votre attention.',
    identity_approved: 'Identité vérifiée', identity_approvedBody: 'Votre identité a été vérifiée.',
    identity_correction_required: 'Photos d’identité à corriger', identity_correction_requiredBody: 'Un élément doit être corrigé avant la vérification de votre identité.',
    identity_upload_received: 'Photos reçues', identity_upload_receivedBody: 'Vos photos d’identité ont été reçues et sont en cours d’examen.',
    legal_acceptance_recorded: 'Acceptation enregistrée', legal_acceptance_recordedBody: 'Votre acceptation a été enregistrée.',
    legal_acceptance_required: 'Action requise sur nos conditions', legal_acceptance_requiredBody: 'Veuillez lire et accepter les conditions mises à jour.',
    legal_update_available: 'Nos conditions ont changé', legal_update_availableBody: 'Vous pouvez lire les modifications.',
    marketplace_booking_confirmed: 'Professionnel confirmé', marketplace_booking_confirmedBody: 'Votre demande est maintenant un travail confirmé.',
    marketplace_no_providers: 'Aucun professionnel trouvé', marketplace_no_providersBody: 'Aucun professionnel éligible n\'a encore été trouvé.',
    marketplace_rematching: 'Recherche relancée', marketplace_rematchingBody: 'Warsha cherche un autre professionnel éligible.',
    marketplace_request_expired: 'Demande expirée', marketplace_request_expiredBody: 'Votre demande de service a expiré.',
    new_review: 'Nouvel avis', new_reviewBody: 'Un travail terminé a une mise à jour d’avis.',
    operation_additional_work_approved: 'Travail supplémentaire accepté', operation_additional_work_approvedBody: 'Une décision sur le travail supplémentaire est disponible.',
    operation_additional_work_needs_clarification: 'Clarification requise', operation_additional_work_needs_clarificationBody: 'Un travail supplémentaire demande une clarification.',
    operation_additional_work_rejected: 'Travail supplémentaire refusé', operation_additional_work_rejectedBody: 'Une décision sur le travail supplémentaire est disponible.',
    operation_additional_work_requested: 'Travail supplémentaire', operation_additional_work_requestedBody: 'Un travail supplémentaire demande votre décision.',
    operation_ready_for_inspection: 'Contrôle requis', operation_ready_for_inspectionBody: 'Le travail est prêt pour votre contrôle.',
    operation_return_visit_accepted: 'Visite de retour acceptée', operation_return_visit_acceptedBody: 'La visite de retour a été acceptée.',
    operation_return_visit_declined: 'Visite de retour refusée', operation_return_visit_declinedBody: 'La visite de retour a été refusée.',
    operation_return_visit_requested: 'Visite de retour demandée', operation_return_visit_requestedBody: 'Une visite de retour demande votre réponse.',
    password_changed: 'Mot de passe modifié', password_changedBody: 'La sécurité de votre compte Warsha a changé.',
    phone_changed: 'Téléphone modifié', phone_changedBody: 'La sécurité de votre compte Warsha a changé.',
    phone_verification_required: 'Vérification du téléphone requise', phone_verification_requiredBody: 'Votre compte a besoin d’un numéro vérifié.',
    privacy_deletion_blocked: 'Suppression à vérifier', privacy_deletion_blockedBody: 'Un point doit être réglé avant la suppression de votre compte.',
    privacy_deletion_cancelled: 'Suppression annulée', privacy_deletion_cancelledBody: 'Votre demande de suppression a été annulée.',
    privacy_deletion_completed: 'Suppression terminée', privacy_deletion_completedBody: 'La suppression de votre compte est terminée.',
    privacy_deletion_requested: 'Suppression demandée', privacy_deletion_requestedBody: 'Votre demande de suppression a été reçue.',
    privacy_export_expired: 'Export expiré', privacy_export_expiredBody: 'Le lien de votre export a expiré. Vous pouvez en demander un nouveau.',
    privacy_export_ready: 'Vos données sont prêtes', privacy_export_readyBody: 'Votre export de données est prêt à télécharger.',
    promotion_available: 'Une promotion est disponible', promotion_availableBody: 'Une promotion est utilisable.',
    promotion_expiring: 'Promotion bientôt terminée', promotion_expiringBody: 'Une promotion utilisable se termine bientôt.',
    promotion_redeemed: 'Promotion appliquée', promotion_redeemedBody: 'Votre promotion a été appliquée.',
    quote_confirmation_expired: 'Confirmation expirée', quote_confirmation_expiredBody: 'Le professionnel retenu n\'a pas confirmé à temps.',
    quote_expired: 'Devis expiré', quote_expiredBody: 'Votre devis n\'est plus actif.',
    quote_invitation: 'Nouvelle opportunité', quote_invitationBody: 'Une opportunité demande votre attention.',
    quote_received: 'Nouveau devis', quote_receivedBody: 'Votre demande de service a une mise à jour de devis.',
    quote_revised: 'Devis mis à jour', quote_revisedBody: 'Votre demande de service a une mise à jour de devis.',
    quote_selected: 'Confirmation requise', quote_selectedBody: 'Un client a retenu votre devis.',
    referral_pending: 'Parrainage en cours', referral_pendingBody: 'Votre parrainage est en cours de confirmation.',
    referral_qualified: 'Parrainage confirmé', referral_qualifiedBody: 'Votre parrainage est validé.',
    request_awarded_elsewhere: 'Demande clôturée', request_awarded_elsewhereBody: 'Cette demande a été attribuée à un autre professionnel.',
    request_cancelled: 'Demande annulée', request_cancelledBody: 'Le client a annulé cette demande de service.',
    request_edited: 'Demande modifiée', request_editedBody: 'Une demande à laquelle vous êtes invité a changé.',
    review_moderation_outcome: 'Décision sur un avis', review_moderation_outcomeBody: 'La décision de modération est disponible.',
    review_publication_held: 'Publication suspendue', review_publication_heldBody: 'La publication d’un avis a changé en raison d’un litige.',
    review_publication_restored: 'Avis rétabli', review_publication_restoredBody: 'La publication de l’avis est de nouveau disponible.',
    review_reply: 'Réponse à un avis', review_replyBody: 'Un professionnel a répondu à un avis.',
    review_reported: 'Signalement enregistré', review_reportedBody: 'Nous avons reçu votre signalement.',
    staff_appeal_submitted: 'Recours déposé', staff_appeal_submittedBody: 'Un recours demande un examen.',
    staff_case_assigned: 'Dossier attribué', staff_case_assignedBody: 'Un dossier vous a été attribué.',
    staff_case_escalated: 'Dossier escaladé', staff_case_escalatedBody: 'Un dossier a été escaladé.',
    staff_configuration_awaiting_approval: 'Approbation requise', staff_configuration_awaiting_approvalBody: 'Un changement de configuration attend une approbation.',
    staff_evidence_deadline: 'Échéance de preuve', staff_evidence_deadlineBody: 'Une échéance de preuve demande votre attention.',
    staff_high_priority_report: 'Signalement prioritaire', staff_high_priority_reportBody: 'Un signalement demande un examen immédiat.',
    staff_incident_escalation: 'Incident escaladé', staff_incident_escalationBody: 'Un incident a été escaladé.',
    staff_payout_failure: 'Échec de versement', staff_payout_failureBody: 'Un versement demande votre attention.',
    staff_reconciliation_exception: 'Écart de rapprochement', staff_reconciliation_exceptionBody: 'Un rapprochement financier demande un examen.',
    staff_security_incident: 'Incident de sécurité', staff_security_incidentBody: 'Un incident de sécurité demande un examen.',
    staff_support_case_assigned: 'Demande d’assistance attribuée', staff_support_case_assignedBody: 'Une demande d’assistance vous a été attribuée.',
    staff_support_customer_reply: 'Réponse du client', staff_support_customer_replyBody: 'Un client a répondu sur une demande.',
    staff_support_sla_breach: 'Réponse en retard', staff_support_sla_breachBody: 'Une demande a dépassé son délai de réponse.',
    staff_support_worker_reply: 'Réponse du professionnel', staff_support_worker_replyBody: 'Un professionnel a répondu sur une demande.',
    support_case_assigned: 'Demande attribuée', support_case_assignedBody: 'Quelqu’un examine votre demande.',
    support_case_opened: 'Demande d’assistance ouverte', support_case_openedBody: 'Nous avons reçu votre demande.',
    support_case_reopened: 'Demande rouverte', support_case_reopenedBody: 'Votre demande d’assistance a été rouverte.',
    support_case_replied: 'Réponse de l’assistance', support_case_repliedBody: 'Une nouvelle réponse est disponible.',
    support_case_resolved: 'Demande résolue', support_case_resolvedBody: 'Votre demande d’assistance a été résolue.',
    support_survey_available: 'Donnez votre avis', support_survey_availableBody: 'Vous pouvez évaluer votre expérience d’assistance.',
    vetting_appeal_submitted: 'Recours reçu', vetting_appeal_submittedBody: 'Votre recours a été reçu.',
    vetting_appeal_updated: 'Mise à jour du recours', vetting_appeal_updatedBody: 'Une décision est disponible sur votre recours.',
    worker_approved: 'Votre compte est approuvé', worker_approvedBody: 'Votre compte professionnel est approuvé. Vous pouvez recevoir des travaux.',
    worker_manual_review: 'En cours d’examen', worker_manual_reviewBody: 'Une personne examine votre dossier.',
    worker_onboarding_incomplete: 'Terminez votre inscription', worker_onboarding_incompleteBody: 'Votre profil professionnel demande encore quelques informations.',
    worker_profile_discoverable: 'Profil visible', worker_profile_discoverableBody: 'Votre profil professionnel est visible dans Warsha.',
    worker_profile_unavailable: 'Profil masqué', worker_profile_unavailableBody: 'Une exigence bloque votre profil professionnel.',
    worker_provisionally_active: 'Actif à titre provisoire', worker_provisionally_activeBody: 'Vous pouvez travailler pendant la fin des vérifications.',
    worker_rejected: 'Dossier non approuvé', worker_rejectedBody: 'Votre dossier professionnel n’a pas été approuvé. Ouvrez votre compte pour la suite.',
  },
} as const;

export const copy = {
  en: {
    ...rawCopy.en,
    ...financial.en,
    ...catalogue.en,
    dispute_opened: 'Dispute opened', dispute_evidence_requested: 'Evidence requested', dispute_evidence_submitted: 'Evidence added', dispute_under_review: 'Dispute under review', dispute_resolved: 'Dispute resolved', dispute_closed: 'Dispute closed', dispute_cancelled: 'Dispute withdrawn',
    dispute_openedBody: 'A dispute was opened for this booking.', dispute_evidence_requestedBody: 'Warsha support requested more evidence.', dispute_evidence_submittedBody: 'New evidence was added to the dispute.', dispute_under_reviewBody: 'Warsha support is reviewing the dispute.', dispute_resolvedBody: 'A resolution is available for the dispute.', dispute_closedBody: 'The dispute was closed.', dispute_cancelledBody: 'The customer withdrew the dispute.',
  },
  ar: {
    ...rawCopy.ar,
    ...financial.ar,
    ...catalogue.ar,
    booking_message: 'رسالة جديدة', booking_messageBody: 'لديك رسالة جديدة بشأن حجزك.',
    dispute_opened: 'تم فتح نزاع', dispute_evidence_requested: 'مطلوب أدلة', dispute_evidence_submitted: 'اتضاف دليل', dispute_under_review: 'النزاع تحت المراجعة', dispute_resolved: 'النزاع اتحل', dispute_closed: 'النزاع اتقفل', dispute_cancelled: 'النزاع اتسحب',
    dispute_openedBody: 'اتفتح نزاع على الحجز ده.', dispute_evidence_requestedBody: 'فريق دعم ورشة طلب أدلة زيادة.', dispute_evidence_submittedBody: 'اتضاف دليل جديد للنزاع.', dispute_under_reviewBody: 'فريق دعم ورشة بيراجع النزاع.', dispute_resolvedBody: 'قرار النزاع بقى متاح.', dispute_closedBody: 'النزاع اتقفل.', dispute_cancelledBody: 'العميل سحب النزاع.',
  },
  fr: {
    ...rawCopy.en,
    ...financial.fr,
    ...catalogue.fr,
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
