import { useLocalization } from '@/src/i18n/localization';
import { legacyNotificationEventCopy } from './notification-translations';
import type { NotificationCategory, NotificationPriority } from './notification-types';

const ui = {
  en: {
    notifications: 'Notifications', notificationBell: 'Open notifications', markAllRead: 'Mark all as read', markRead: 'Mark as read', close: 'Close notification banner',
    archive: 'Archive notification', archiveBlocked: 'Complete the required action before archiving this notification.',
    empty: 'No notifications yet', emptyBody: 'Important service and account updates will appear here.', archivedEmpty: 'No archived notifications.',
    loadError: 'Couldn’t load notifications.', retry: 'Try again', loadMore: 'Load more', newUpdate: 'new', justNow: 'Just now',
    current: 'Current', archived: 'Archived', all: 'All', preferences: 'Notification preferences', preferencesAction: 'Open notification preferences',
    grouped: 'updates', unread: 'Unread', read: 'Read', actionRequired: 'Action required', critical: 'Critical', important: 'Important', informational: 'Informational',
    noAction: 'This update has no action to open.', inaccessible: 'This update is no longer available for this account.', stale: 'This update is no longer available.',
    preferencesIntro: 'Choose simple in-app categories. Safety-critical and required-action notices remain available.',
    inApp: 'In-app notifications', inAppAlways: 'Always available for required and critical updates', push: 'Push notifications', pushUnavailable: 'Prepared, but unavailable until a trusted provider is activated.',
    quietHours: 'Quiet hours', quietHoursBody: 'Non-critical push would wait during this window. In-app updates still arrive immediately.', start: 'Start', end: 'End', timezone: 'Timezone',
    genericPreviews: 'Private lock-screen previews', genericPreviewsBody: 'Use generic text that does not expose message, payment, address, or dispute details.', save: 'Save preferences', saved: 'Preferences saved', saving: 'Saving…',
  },
  ar: {
    notifications: 'الإشعارات', notificationBell: 'افتح الإشعارات', markAllRead: 'علّم الكل كمقروء', markRead: 'علّم كمقروء', close: 'اقفل تنبيه الإشعار',
    archive: 'أرشف الإشعار', archiveBlocked: 'كمّل الإجراء المطلوب قبل ما تأرشف الإشعار.',
    empty: 'مفيش إشعارات لسه', emptyBody: 'تحديثات الخدمة والحساب المهمة هتظهر هنا.', archivedEmpty: 'مفيش إشعارات مؤرشفة.',
    loadError: 'مقدرناش نحمّل الإشعارات.', retry: 'حاول تاني', loadMore: 'عرض المزيد', newUpdate: 'جديد', justNow: 'دلوقتي',
    current: 'الحالية', archived: 'المؤرشفة', all: 'الكل', preferences: 'إعدادات الإشعارات', preferencesAction: 'افتح إعدادات الإشعارات',
    grouped: 'تحديثات', unread: 'غير مقروء', read: 'مقروء', actionRequired: 'مطلوب إجراء', critical: 'مهم جدًا', important: 'مهم', informational: 'للعلم',
    noAction: 'التحديث ده ملوش إجراء تفتحه.', inaccessible: 'التحديث ده مبقاش متاح للحساب ده.', stale: 'التحديث ده مبقاش متاح.',
    preferencesIntro: 'اختار مجموعات بسيطة للإشعارات داخل التطبيق. إشعارات الأمان والإجراءات المطلوبة هتفضل متاحة.',
    inApp: 'إشعارات داخل التطبيق', inAppAlways: 'متاحة دايمًا للتحديثات المهمة والإجراءات المطلوبة', push: 'إشعارات الموبايل', pushUnavailable: 'مجهزة، لكن مش متاحة لحد ما يتم تفعيل مزوّد موثوق.',
    quietHours: 'ساعات الهدوء', quietHoursBody: 'الإشعارات غير الحرجة هتستنى في الفترة دي لو المزوّد اتفعّل. إشعارات التطبيق بتوصل فورًا.', start: 'البداية', end: 'النهاية', timezone: 'المنطقة الزمنية',
    genericPreviews: 'معاينات خاصة على شاشة القفل', genericPreviewsBody: 'استخدم كلام عام من غير تفاصيل رسائل أو دفع أو عنوان أو نزاع.', save: 'احفظ الإعدادات', saved: 'اتحفظت الإعدادات', saving: 'جاري الحفظ…',
  },
} as const;

const categories: Record<'en' | 'ar', Record<NotificationCategory, string>> = {
  en: { marketplace: 'Marketplace', bookings: 'Bookings', messages: 'Messages', payments: 'Payments', worker_account: 'Worker account', reviews: 'Reviews', disputes: 'Disputes', security: 'Security', system: 'System', support: 'Support' },
  ar: { marketplace: 'السوق والعروض', bookings: 'الحجوزات', messages: 'الرسائل', payments: 'المدفوعات', worker_account: 'حساب الصنايعي', reviews: 'التقييمات', disputes: 'النزاعات', security: 'الأمان', system: 'النظام', support: 'الدعم' },
};

const eventCopy: Record<'en' | 'ar', Record<string, { title: string; body: string; action?: string }>> = {
  en: {
    new_booking_request: { title: 'New booking request', body: 'A booking requires your attention.', action: 'View booking' },
    booking_message: { title: 'New message', body: 'You have a new message in Warsha.', action: 'Open chat' },
    booking_attachment: { title: 'New attachment', body: 'You have a new message in Warsha.', action: 'Open chat' },
    quote_received: { title: 'New quote', body: 'Your service request has a quote update.', action: 'View quotes' },
    quote_revised: { title: 'Quote updated', body: 'Your service request has a quote update.', action: 'View quotes' },
    quote_invitation: { title: 'New opportunity', body: 'A service opportunity requires your attention.', action: 'View opportunity' },
    emergency_request: { title: 'Urgent opportunity', body: 'An urgent service opportunity requires your attention.', action: 'View opportunity' },
    request_edited: { title: 'Request updated', body: 'A service request you were invited to has changed.', action: 'View opportunity' },
    quote_selected: { title: 'Confirmation required', body: 'A customer selected your quote.', action: 'Confirm job' },
    marketplace_booking_confirmed: { title: 'Worker confirmed', body: 'Your service request is now a confirmed booking.', action: 'View booking' },
    marketplace_no_providers: { title: 'No workers found', body: 'No eligible worker was found yet.', action: 'View request' },
    marketplace_rematching: { title: 'Matching restarted', body: 'Warsha is looking for another eligible worker.', action: 'View request' },
    marketplace_request_expired: { title: 'Request expired', body: 'Your service request expired.', action: 'View request' },
    quote_confirmation_expired: { title: 'Confirmation expired', body: 'The selected worker did not confirm in time.', action: 'View request' },
    request_awarded_elsewhere: { title: 'Request closed', body: 'This request was awarded to another worker.' },
    request_cancelled: { title: 'Request cancelled', body: 'The customer cancelled this service request.' },
    quote_expired: { title: 'Quote expired', body: 'Your quote is no longer active.' },
    booking_cancelled: { title: 'Booking cancelled', body: 'This booking was cancelled.', action: 'View booking' },
    payment_required: { title: 'Payment required', body: 'Action is required on your payment.', action: 'View payment' },
    payment_failed: { title: 'Payment needs attention', body: 'Your payment status changed.', action: 'View payment' },
    refund_failed: { title: 'Refund needs attention', body: 'The refund status requires attention.', action: 'View payment' },
    cash_debt_threshold_warning: { title: 'Account action required', body: 'Your worker financial account requires attention.', action: 'View earnings' },
    operation_waiting_for_approval: { title: 'Approval required', body: 'Your booking requires a decision.', action: 'View booking' },
    operation_additional_work_requested: { title: 'Additional work approval', body: 'Additional work requires your decision.', action: 'Approve price' },
    operation_additional_work_needs_clarification: { title: 'Clarification required', body: 'Additional work requires clarification.', action: 'View booking' },
    operation_additional_work_approved: { title: 'Additional work approved', body: 'An additional-work decision is available.', action: 'View booking' },
    operation_additional_work_rejected: { title: 'Additional work declined', body: 'An additional-work decision is available.', action: 'View booking' },
    operation_ready_for_inspection: { title: 'Inspection required', body: 'Work is ready for your inspection.', action: 'Inspect work' },
    operation_inspection: { title: 'Inspection required', body: 'Work is ready for your inspection.', action: 'Inspect work' },
    operation_return_visit_requested: { title: 'Return visit request', body: 'A return visit requires your response.', action: 'View booking' },
    operation_return_visit_accepted: { title: 'Return visit accepted', body: 'The return visit request was accepted.', action: 'View booking' },
    operation_return_visit_declined: { title: 'Return visit declined', body: 'The return visit request was declined.', action: 'View booking' },
    verification_submitted: { title: 'Verification submitted', body: 'Your verification was sent for review.', action: 'View verification' },
    verification_approved: { title: 'Verification approved', body: 'Your verification status changed.', action: 'View verification' },
    verification_rejected: { title: 'Verification correction required', body: 'Your verification requires attention.', action: 'Complete verification' },
    verification_resubmission_requested: { title: 'New verification photos required', body: 'Your verification requires attention.', action: 'Complete verification' },
    verification_expired: { title: 'Verification expired', body: 'New verification photos are required.', action: 'Complete verification' },
    certificate_approved: { title: 'Certificate approved', body: 'A certificate is now verified on your profile.', action: 'View profile' },
    certificate_rejected: { title: 'Certificate needs attention', body: 'A certificate submission needs correction.', action: 'View profile' },
    worker_profile_discoverable: { title: 'Profile available', body: 'Your worker profile is visible in the marketplace.', action: 'View profile' },
    worker_profile_unavailable: { title: 'Profile unavailable', body: 'A blocking requirement is hiding your worker profile.', action: 'Complete verification' },
    phone_verification_required: { title: 'Phone verification required', body: 'Your account needs a verified phone number.', action: 'Open preferences' },
    new_review: { title: 'New review', body: 'A completed booking has a review update.', action: 'View review' },
    review_unlocked: { title: 'Review available', body: 'You can now review your completed booking.', action: 'Write review' },
    review_reply: { title: 'Review reply', body: 'A provider replied to a review.', action: 'View reply' },
    review_reported: { title: 'Report received', body: 'Your review report was received.', action: 'View review' },
    review_moderation_outcome: { title: 'Review update', body: 'A moderation decision is available.', action: 'View review' },
    review_publication_held: { title: 'Review publication held', body: 'Review publication changed because of a dispute.', action: 'View dispute' },
    review_publication_restored: { title: 'Review restored', body: 'Review publication is available again.', action: 'View review' },
    dispute_opened: { title: 'Dispute opened', body: 'A booking dispute requires attention.', action: 'View dispute' },
    dispute_evidence_requested: { title: 'Evidence required', body: 'A dispute requires evidence.', action: 'Add evidence' },
    dispute_response_required: { title: 'Response required', body: 'A dispute requires your response.', action: 'View dispute' },
    dispute_resolved: { title: 'Dispute resolved', body: 'A dispute decision is available.', action: 'View resolution' },
    dispute_closed: { title: 'Dispute closed', body: 'The dispute has been closed.', action: 'View resolution' },
    communication_report_received: { title: 'Report received', body: 'Your safety report was received.' },
    conversation_read_only: { title: 'Conversation update', body: 'A booking conversation is now read-only.', action: 'Open chat' },
    password_changed: { title: 'Password changed', body: 'Your Warsha account security changed.' },
    email_changed: { title: 'Email changed', body: 'Your Warsha account security changed.' },
    phone_changed: { title: 'Phone changed', body: 'Your Warsha account security changed.' },
  },
  ar: {
    new_booking_request: { title: 'طلب حجز جديد', body: 'فيه حجز محتاج اهتمامك.', action: 'شوف الحجز' },
    booking_message: { title: 'رسالة جديدة', body: 'عندك رسالة جديدة على ورشة.', action: 'افتح الشات' },
    booking_attachment: { title: 'مرفق جديد', body: 'عندك رسالة جديدة على ورشة.', action: 'افتح الشات' },
    quote_received: { title: 'عرض سعر جديد', body: 'فيه تحديث عروض على طلب الخدمة.', action: 'شوف العروض' },
    quote_revised: { title: 'عرض السعر اتحدّث', body: 'فيه تحديث عروض على طلب الخدمة.', action: 'شوف العروض' },
    quote_invitation: { title: 'فرصة شغل جديدة', body: 'فيه فرصة خدمة محتاجة اهتمامك.', action: 'شوف الفرصة' },
    emergency_request: { title: 'فرصة عاجلة', body: 'فيه فرصة خدمة عاجلة محتاجة اهتمامك.', action: 'شوف الفرصة' },
    request_edited: { title: 'الطلب اتحدّث', body: 'طلب خدمة اتعزمت عليه اتغيّر.', action: 'شوف الفرصة' },
    quote_selected: { title: 'مطلوب تأكيد', body: 'عميل اختار عرض السعر بتاعك.', action: 'أكد الشغل' },
    marketplace_booking_confirmed: { title: 'الصنايعي أكد', body: 'طلب الخدمة بقى حجز مؤكد.', action: 'شوف الحجز' },
    marketplace_no_providers: { title: 'ملقيناش صنايعي مناسب', body: 'ملقيناش صنايعي مؤهل لحد دلوقتي.', action: 'شوف الطلب' },
    marketplace_rematching: { title: 'البحث بدأ تاني', body: 'ورشة بتدور على صنايعي مؤهل تاني.', action: 'شوف الطلب' },
    marketplace_request_expired: { title: 'وقت الطلب انتهى', body: 'وقت طلب الخدمة انتهى.', action: 'شوف الطلب' },
    quote_confirmation_expired: { title: 'مهلة التأكيد انتهت', body: 'الصنايعي المختار مأكّدش في الوقت.', action: 'شوف الطلب' },
    request_awarded_elsewhere: { title: 'الطلب اتقفل', body: 'الطلب اتسند لصنايعي تاني.' },
    request_cancelled: { title: 'الطلب اتلغى', body: 'العميل لغى طلب الخدمة.' },
    quote_expired: { title: 'عرض السعر انتهى', body: 'عرض السعر بتاعك مبقاش متاح.' },
    booking_cancelled: { title: 'الحجز اتلغى', body: 'الحجز ده اتلغى.', action: 'شوف الحجز' },
    payment_required: { title: 'مطلوب دفع', body: 'فيه إجراء مطلوب على الدفع.', action: 'شوف الدفع' },
    payment_failed: { title: 'الدفع محتاج اهتمام', body: 'حالة الدفع اتغيّرت.', action: 'شوف الدفع' },
    refund_failed: { title: 'الاسترداد محتاج اهتمام', body: 'حالة استرداد المبلغ محتاجة اهتمام.', action: 'شوف الدفع' },
    cash_debt_threshold_warning: { title: 'مطلوب إجراء على الحساب', body: 'حسابك المالي كصنايعي محتاج اهتمام.', action: 'شوف الأرباح' },
    operation_waiting_for_approval: { title: 'مطلوب موافقة', body: 'الحجز محتاج قرار.', action: 'شوف الحجز' },
    operation_additional_work_requested: { title: 'موافقة على شغل إضافي', body: 'الشغل الإضافي محتاج قرارك.', action: 'وافق على السعر' },
    operation_additional_work_needs_clarification: { title: 'مطلوب توضيح', body: 'الشغل الإضافي محتاج توضيح.', action: 'شوف الحجز' },
    operation_additional_work_approved: { title: 'الشغل الإضافي اتوافق عليه', body: 'قرار الشغل الإضافي بقى متاح.', action: 'شوف الحجز' },
    operation_additional_work_rejected: { title: 'الشغل الإضافي اترفض', body: 'قرار الشغل الإضافي بقى متاح.', action: 'شوف الحجز' },
    operation_ready_for_inspection: { title: 'مطلوب معاينة', body: 'الشغل جاهز لمعاينتك.', action: 'عاين الشغل' },
    operation_inspection: { title: 'مطلوب معاينة', body: 'الشغل جاهز لمعاينتك.', action: 'عاين الشغل' },
    operation_return_visit_requested: { title: 'طلب زيارة رجوع', body: 'زيارة الرجوع محتاجة ردك.', action: 'شوف الحجز' },
    operation_return_visit_accepted: { title: 'زيارة الرجوع اتقبلت', body: 'طلب زيارة الرجوع اتقبل.', action: 'شوف الحجز' },
    operation_return_visit_declined: { title: 'زيارة الرجوع اترفضت', body: 'طلب زيارة الرجوع اترفض.', action: 'شوف الحجز' },
    verification_submitted: { title: 'التوثيق اتبعت', body: 'التوثيق اتبعت للمراجعة.', action: 'شوف التوثيق' },
    verification_approved: { title: 'التوثيق اتوافق عليه', body: 'حالة التوثيق اتغيّرت.', action: 'شوف التوثيق' },
    verification_rejected: { title: 'التوثيق محتاج تعديل', body: 'التوثيق محتاج اهتمامك.', action: 'كمّل التوثيق' },
    verification_resubmission_requested: { title: 'مطلوب صور توثيق جديدة', body: 'التوثيق محتاج اهتمامك.', action: 'كمّل التوثيق' },
    verification_expired: { title: 'التوثيق انتهى', body: 'مطلوب صور توثيق جديدة.', action: 'كمّل التوثيق' },
    certificate_approved: { title: 'الشهادة اتوافقت', body: 'الشهادة بقت موثقة على حسابك.', action: 'شوف الحساب' },
    certificate_rejected: { title: 'الشهادة محتاجة تعديل', body: 'بيانات الشهادة محتاجة تصحيح.', action: 'شوف الحساب' },
    worker_profile_discoverable: { title: 'حسابك بقى متاح', body: 'حساب الصنايعي ظاهر دلوقتي في السوق.', action: 'شوف الحساب' },
    worker_profile_unavailable: { title: 'حسابك مش متاح', body: 'فيه متطلب مانع حساب الصنايعي من الظهور.', action: 'كمّل التوثيق' },
    phone_verification_required: { title: 'مطلوب تأكيد الموبايل', body: 'حسابك محتاج رقم موبايل متأكد.', action: 'افتح الإعدادات' },
    new_review: { title: 'تقييم جديد', body: 'فيه تحديث تقييم على حجز مكتمل.', action: 'شوف التقييم' },
    review_unlocked: { title: 'التقييم متاح', body: 'تقدر دلوقتي تقيّم الحجز المكتمل.', action: 'اكتب تقييم' },
    review_reply: { title: 'رد على التقييم', body: 'الصنايعي رد على تقييم.', action: 'شوف الرد' },
    review_reported: { title: 'البلاغ اتسجل', body: 'استلمنا بلاغك عن التقييم.', action: 'شوف التقييم' },
    review_moderation_outcome: { title: 'تحديث تقييم', body: 'قرار مراجعة التقييم بقى متاح.', action: 'شوف التقييم' },
    review_publication_held: { title: 'نشر التقييم اتوقف', body: 'نشر التقييم اتغيّر بسبب نزاع.', action: 'شوف النزاع' },
    review_publication_restored: { title: 'التقييم رجع', body: 'نشر التقييم بقى متاح تاني.', action: 'شوف التقييم' },
    dispute_opened: { title: 'اتفتح نزاع', body: 'نزاع على حجز محتاج اهتمامك.', action: 'شوف النزاع' },
    dispute_evidence_requested: { title: 'مطلوب أدلة', body: 'النزاع محتاج أدلة.', action: 'ضيف أدلة' },
    dispute_response_required: { title: 'مطلوب رد', body: 'النزاع محتاج ردك.', action: 'شوف النزاع' },
    dispute_resolved: { title: 'النزاع اتحل', body: 'قرار النزاع بقى متاح.', action: 'شوف القرار' },
    dispute_closed: { title: 'النزاع اتقفل', body: 'النزاع اتقفل.', action: 'شوف القرار' },
    communication_report_received: { title: 'البلاغ اتسجل', body: 'استلمنا بلاغ الأمان بتاعك.' },
    conversation_read_only: { title: 'تحديث المحادثة', body: 'محادثة الحجز بقت للقراءة بس.', action: 'افتح الشات' },
    password_changed: { title: 'كلمة السر اتغيّرت', body: 'أمان حسابك على ورشة اتغيّر.' },
    email_changed: { title: 'الإيميل اتغيّر', body: 'أمان حسابك على ورشة اتغيّر.' },
    phone_changed: { title: 'رقم الموبايل اتغيّر', body: 'أمان حسابك على ورشة اتغيّر.' },
  },
};

const generic: Record<'en' | 'ar', Record<NotificationCategory, { title: string; body: string }>> = {
  en: {
    marketplace: { title: 'Marketplace update', body: 'Your service request has an update.' }, bookings: { title: 'Booking update', body: 'Your booking has an update.' },
    messages: { title: 'New message', body: 'You have a new message in Warsha.' }, payments: { title: 'Payment update', body: 'Your payment status changed.' },
    worker_account: { title: 'Worker account update', body: 'Your worker account has an update.' }, reviews: { title: 'Review update', body: 'A review has an update.' },
    disputes: { title: 'Dispute update', body: 'Your dispute has an update.' }, security: { title: 'Account security update', body: 'Your Warsha account security changed.' }, system: { title: 'Warsha update', body: 'You have an update in Warsha.' },
    support: { title: 'Support update', body: 'Your support case has an update.' },
  },
  ar: {
    marketplace: { title: 'تحديث في السوق', body: 'طلب الخدمة عليه تحديث.' }, bookings: { title: 'تحديث حجز', body: 'الحجز عليه تحديث.' },
    messages: { title: 'رسالة جديدة', body: 'عندك رسالة جديدة على ورشة.' }, payments: { title: 'تحديث دفع', body: 'حالة الدفع اتغيّرت.' },
    worker_account: { title: 'تحديث حساب الصنايعي', body: 'حساب الصنايعي عليه تحديث.' }, reviews: { title: 'تحديث تقييم', body: 'فيه تقييم عليه تحديث.' },
    disputes: { title: 'تحديث نزاع', body: 'النزاع عليه تحديث.' }, security: { title: 'تحديث أمان الحساب', body: 'أمان حسابك على ورشة اتغيّر.' }, system: { title: 'تحديث من ورشة', body: 'عندك تحديث جديد على ورشة.' },
    support: { title: 'تحديث من الدعم', body: 'حالة الدعم بتاعتك عليها تحديث.' },
  },
};

const reminderCopy = {
  en: {
    worker_confirmation: 'Confirm the selected job before the response window closes.', booking_approaching: 'Your confirmed booking is approaching.',
    inspection_pending: 'The completed work is still waiting for inspection.', payment_pending: 'A booking payment still requires action.',
    review_opportunity: 'You can still review your completed booking.', dispute_deadline: 'A dispute response or evidence deadline needs attention.',
    verification_correction: 'Your verification correction is still incomplete.', worker_profile_incomplete: 'Your worker profile still has a blocking requirement.',
  },
  ar: {
    worker_confirmation: 'أكد الشغل المختار قبل ما مهلة الرد تخلص.', booking_approaching: 'ميعاد الحجز المؤكد قرب.',
    inspection_pending: 'الشغل المكتمل لسه مستني المعاينة.', payment_pending: 'لسه فيه إجراء مطلوب على دفع الحجز.',
    review_opportunity: 'لسه تقدر تقيّم الحجز المكتمل.', dispute_deadline: 'ميعاد رد أو دليل في النزاع محتاج اهتمام.',
    verification_correction: 'تعديل التوثيق لسه مش مكتمل.', worker_profile_incomplete: 'لسه فيه متطلب مانع في حساب الصنايعي.',
  },
} as const;

export type ReminderPolicyKey = keyof typeof reminderCopy.en;
export function notificationReminderCopy(language: 'en' | 'ar', policy: ReminderPolicyKey) { return reminderCopy[language][policy]; }

export type EngagementTextKey = keyof typeof ui.en;
export function notificationEventCopy(language: 'en' | 'ar', eventKey: string, category: NotificationCategory) { return eventCopy[language][eventKey] ?? legacyNotificationEventCopy(language, eventKey) ?? generic[language][category]; }
export function notificationCategoryLabel(language: 'en' | 'ar', category: NotificationCategory) { return categories[language][category]; }
export function notificationPriorityLabel(language: 'en' | 'ar', priority: NotificationPriority) {
  const key = priority === 'action_required' ? 'actionRequired' : priority;
  return ui[language][key];
}
export function useEngagementText() {
  const { language } = useLocalization();
  return { language, text: (key: EngagementTextKey) => ui[language][key], event: (eventKey: string, category: NotificationCategory) => notificationEventCopy(language, eventKey, category), category: (value: NotificationCategory) => notificationCategoryLabel(language, value), priority: (value: NotificationPriority) => notificationPriorityLabel(language, value) };
}
