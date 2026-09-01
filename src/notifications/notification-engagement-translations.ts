import { useLocalization } from '@/src/i18n/localization';
import type { SupportedLanguage } from '@/src/i18n/language-preference';
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
    inApp: 'In-app notifications', inAppAlways: 'Always available for required and critical updates', push: 'Push notifications', pushUnavailable: 'Prepared, but unavailable until a trusted provider is activated.', pushAvailableBody: 'Alerts on your lock screen say only which part of Warsha changed — never a message, an amount or an address.',
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
    inApp: 'إشعارات داخل التطبيق', inAppAlways: 'متاحة دايمًا للتحديثات المهمة والإجراءات المطلوبة', push: 'إشعارات الموبايل', pushUnavailable: 'مجهزة، لكن مش متاحة لحد ما يتم تفعيل مزوّد موثوق.', pushAvailableBody: 'التنبيه على شاشة القفل بيقول بس أنهي جزء في ورشة اتغير — من غير أي رسالة أو مبلغ أو عنوان.',
    quietHours: 'ساعات الهدوء', quietHoursBody: 'الإشعارات غير الحرجة هتستنى في الفترة دي لو المزوّد اتفعّل. إشعارات التطبيق بتوصل فورًا.', start: 'البداية', end: 'النهاية', timezone: 'المنطقة الزمنية',
    genericPreviews: 'معاينات خاصة على شاشة القفل', genericPreviewsBody: 'استخدم كلام عام من غير تفاصيل رسائل أو دفع أو عنوان أو نزاع.', save: 'احفظ الإعدادات', saved: 'اتحفظت الإعدادات', saving: 'جاري الحفظ…',
  },
  fr: {
    notifications:'Notifications',notificationBell:'Ouvrir les notifications',markAllRead:'Tout marquer comme lu',markRead:'Marquer comme lu',close:'Fermer la bannière',archive:'Archiver la notification',archiveBlocked:'Terminez l’action obligatoire avant d’archiver cette notification.',empty:'Aucune notification',emptyBody:'Les mises à jour importantes du service et du compte apparaîtront ici.',archivedEmpty:'Aucune notification archivée.',loadError:'Impossible de charger les notifications.',retry:'Réessayer',loadMore:'Afficher plus',newUpdate:'nouveau',justNow:'À l’instant',current:'Actuelles',archived:'Archivées',all:'Toutes',preferences:'Préférences de notification',preferencesAction:'Ouvrir les préférences',grouped:'mises à jour',unread:'Non lue',read:'Lue',actionRequired:'Action requise',critical:'Critique',important:'Important',informational:'Information',noAction:'Cette mise à jour n’a aucune action à ouvrir.',inaccessible:'Cette mise à jour n’est plus disponible pour ce compte.',stale:'Cette mise à jour n’est plus disponible.',preferencesIntro:'Choisissez des catégories simples dans l’application. Les alertes critiques et les actions obligatoires restent disponibles.',inApp:'Notifications dans l’application',inAppAlways:'Toujours disponibles pour les mises à jour critiques et les actions obligatoires',push:'Notifications push',pushUnavailable:'Préparées, mais indisponibles tant qu’un prestataire de confiance n’est pas activé.',pushAvailableBody:'Une alerte sur votre écran verrouillé indique seulement quelle partie de Warsha a changé — jamais un message, un montant ni une adresse.',quietHours:'Heures calmes',quietHoursBody:'Les notifications push non critiques attendraient pendant cette période. Les mises à jour dans l’application restent immédiates.',start:'Début',end:'Fin',timezone:'Fuseau horaire',genericPreviews:'Aperçus privés sur l’écran verrouillé',genericPreviewsBody:'Utilisez un texte général qui ne révèle aucun message, paiement, adresse ni litige.',save:'Enregistrer les préférences',saved:'Préférences enregistrées',saving:'Enregistrement…'
  },
} as const;

const categories: Record<SupportedLanguage, Record<NotificationCategory, string>> = {
  en: { marketplace: 'Marketplace', bookings: 'Bookings', messages: 'Messages', payments: 'Payments', worker_account: 'Worker account', reviews: 'Reviews', disputes: 'Disputes', security: 'Security', system: 'System', support: 'Support' },
  ar: { marketplace: 'السوق والعروض', bookings: 'الحجوزات', messages: 'الرسائل', payments: 'المدفوعات', worker_account: 'حساب الصنايعي', reviews: 'التقييمات', disputes: 'النزاعات', security: 'الأمان', system: 'النظام', support: 'الدعم' },
  fr: { marketplace:'Demandes et devis',bookings:'Travaux',messages:'Messages',payments:'Paiements',worker_account:'Compte professionnel',reviews:'Avis',disputes:'Litiges',security:'Sécurité',system:'Système',support:'Assistance' },
};

/**
 * What the card offers to open, in every language.
 *
 * This used to live inside `eventCopy`, which also restated the title and body
 * of every event. Those restatements diverged from the shared table for
 * twenty-seven events, so the same notification read differently on a phone
 * and in a browser, and French — which never consulted `eventCopy` at all —
 * got no action label on any card.
 *
 * Title and body now come from `notification-copy.ts` for both platforms, and
 * this table carries only the thing that was genuinely native: the action.
 */
const actionLabels = {
  en: {
    addEvidence: 'Add evidence',
    approvePrice: 'Approve price',
    completeVerification: 'Complete verification',
    confirmJob: 'Confirm job',
    inspectWork: 'Inspect work',
    openChat: 'Open chat',
    openPreferences: 'Open preferences',
    viewBooking: 'View booking',
    viewDispute: 'View dispute',
    viewEarnings: 'View earnings',
    viewOpportunity: 'View opportunity',
    viewPayment: 'View payment',
    viewProfile: 'View profile',
    viewQuotes: 'View quotes',
    viewReply: 'View reply',
    viewRequest: 'View request',
    viewResolution: 'View resolution',
    viewReview: 'View review',
    viewVerification: 'View verification',
    writeReview: 'Write review',
  },
  ar: {
    addEvidence: 'ضيف أدلة',
    approvePrice: 'وافق على السعر',
    completeVerification: 'كمّل التوثيق',
    confirmJob: 'أكد الشغل',
    inspectWork: 'عاين الشغل',
    openChat: 'افتح الشات',
    openPreferences: 'افتح الإعدادات',
    viewBooking: 'شوف الحجز',
    viewDispute: 'شوف النزاع',
    viewEarnings: 'شوف الأرباح',
    viewOpportunity: 'شوف الفرصة',
    viewPayment: 'شوف الدفع',
    viewProfile: 'شوف الحساب',
    viewQuotes: 'شوف العروض',
    viewReply: 'شوف الرد',
    viewRequest: 'شوف الطلب',
    viewResolution: 'شوف القرار',
    viewReview: 'شوف التقييم',
    viewVerification: 'شوف التوثيق',
    writeReview: 'اكتب تقييم',
  },
  fr: {
    addEvidence: 'Ajouter une preuve',
    approvePrice: 'Approuver le prix',
    completeVerification: 'Terminer la vérification',
    confirmJob: 'Confirmer le travail',
    inspectWork: 'Contrôler le travail',
    openChat: 'Ouvrir la discussion',
    openPreferences: 'Ouvrir les préférences',
    viewBooking: 'Voir le travail',
    viewDispute: 'Voir le litige',
    viewEarnings: 'Voir les revenus',
    viewOpportunity: 'Voir l\'opportunité',
    viewPayment: 'Voir le paiement',
    viewProfile: 'Voir le profil',
    viewQuotes: 'Voir les devis',
    viewReply: 'Voir la réponse',
    viewRequest: 'Voir la demande',
    viewResolution: 'Voir la décision',
    viewReview: 'Voir l\'avis',
    viewVerification: 'Voir la vérification',
    writeReview: 'Écrire un avis',
  },
} as const;

type NotificationActionKey = keyof typeof actionLabels.en;

/** Which action each event offers. Events absent here open nothing. */
const eventAction: Record<string, NotificationActionKey> = {
  booking_attachment: 'openChat',
  booking_cancelled: 'viewBooking',
  booking_message: 'openChat',
  cash_debt_threshold_warning: 'viewEarnings',
  certificate_approved: 'viewProfile',
  certificate_rejected: 'viewProfile',
  conversation_read_only: 'openChat',
  dispute_closed: 'viewResolution',
  dispute_evidence_requested: 'addEvidence',
  dispute_opened: 'viewDispute',
  dispute_resolved: 'viewResolution',
  dispute_response_required: 'viewDispute',
  emergency_request: 'viewOpportunity',
  marketplace_booking_confirmed: 'viewBooking',
  marketplace_no_providers: 'viewRequest',
  marketplace_rematching: 'viewRequest',
  marketplace_request_expired: 'viewRequest',
  new_booking_request: 'viewBooking',
  new_review: 'viewReview',
  operation_additional_work_approved: 'viewBooking',
  operation_additional_work_needs_clarification: 'viewBooking',
  operation_additional_work_rejected: 'viewBooking',
  operation_additional_work_requested: 'approvePrice',
  operation_inspection: 'inspectWork',
  operation_ready_for_inspection: 'inspectWork',
  operation_return_visit_accepted: 'viewBooking',
  operation_return_visit_declined: 'viewBooking',
  operation_return_visit_requested: 'viewBooking',
  operation_waiting_for_approval: 'viewBooking',
  payment_failed: 'viewPayment',
  payment_required: 'viewPayment',
  phone_verification_required: 'openPreferences',
  quote_confirmation_expired: 'viewRequest',
  quote_invitation: 'viewOpportunity',
  quote_received: 'viewQuotes',
  quote_revised: 'viewQuotes',
  quote_selected: 'confirmJob',
  refund_failed: 'viewPayment',
  request_edited: 'viewOpportunity',
  review_moderation_outcome: 'viewReview',
  review_publication_held: 'viewDispute',
  review_publication_restored: 'viewReview',
  review_reply: 'viewReply',
  review_reported: 'viewReview',
  review_unlocked: 'writeReview',
  verification_approved: 'viewVerification',
  verification_expired: 'completeVerification',
  verification_rejected: 'completeVerification',
  verification_resubmission_requested: 'completeVerification',
  verification_submitted: 'viewVerification',
  worker_profile_discoverable: 'viewProfile',
  worker_profile_unavailable: 'completeVerification',
};

const generic: Record<SupportedLanguage, Record<NotificationCategory, { title: string; body: string }>> = {
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
  fr: {
    marketplace:{title:'Mise à jour de la demande',body:'Votre demande de service a été mise à jour.'},bookings:{title:'Mise à jour du travail',body:'Votre travail a été mis à jour.'},messages:{title:'Nouveau message',body:'Vous avez un nouveau message dans Warsha.'},payments:{title:'Mise à jour du paiement',body:'Le statut de votre paiement a changé.'},worker_account:{title:'Mise à jour du compte professionnel',body:'Votre compte professionnel a été mis à jour.'},reviews:{title:'Mise à jour d’un avis',body:'Un avis a été mis à jour.'},disputes:{title:'Mise à jour du litige',body:'Votre litige a été mis à jour.'},security:{title:'Mise à jour de sécurité',body:'La sécurité de votre compte Warsha a changé.'},system:{title:'Mise à jour Warsha',body:'Vous avez une nouvelle mise à jour dans Warsha.'},support:{title:'Mise à jour de l’assistance',body:'Votre demande d’assistance a été mise à jour.'}
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
  fr: {
    worker_confirmation:'Confirmez le travail choisi avant la fin du délai de réponse.',booking_approaching:'L’heure de votre travail confirmé approche.',inspection_pending:'Le travail terminé attend encore votre contrôle.',payment_pending:'Un paiement lié au travail exige encore une action.',review_opportunity:'Vous pouvez encore évaluer le travail terminé.',dispute_deadline:'Une échéance de réponse ou de preuve demande votre attention.',verification_correction:'La correction de votre vérification est incomplète.',worker_profile_incomplete:'Une exigence bloque encore votre profil professionnel.'
  },
} as const;

export type ReminderPolicyKey = keyof typeof reminderCopy.en;
export function notificationReminderCopy(language: SupportedLanguage, policy: ReminderPolicyKey) { return reminderCopy[language][policy]; }

export type EngagementTextKey = keyof typeof ui.en;
type NotificationEventText = { title: string; body: string; action?: string };
/**
 * One source of words, one source of actions.
 *
 * Title and body come from `notification-copy.ts` — the table the browser also
 * reads — so the same notification cannot say two different things on two
 * platforms. That was not true until 2026-08-29: `eventCopy` restated both, and
 * twenty-seven events had drifted apart.
 *
 * French needs its own guard. `copy.fr` spreads the English table, so an
 * untranslated French key silently returns English; accepting that would show a
 * French reader English text and call it localised. An entry is taken only when
 * it differs from English in BOTH title and body, exactly as before.
 */
export function notificationEventCopy(
  language: SupportedLanguage,
  eventKey: string,
  category: NotificationCategory,
): NotificationEventText {
  const shared = legacyNotificationEventCopy(language, eventKey);
  let usable = shared;
  if (language === 'fr' && shared) {
    const english = legacyNotificationEventCopy('en', eventKey);
    usable = !english || (shared.title !== english.title && shared.body !== english.body)
      ? shared : undefined;
  }
  const base = usable ?? generic[language][category];
  const action = eventAction[eventKey];
  return action ? { ...base, action: actionLabels[language][action] } : base;
}

export function notificationCategoryLabel(language: SupportedLanguage, category: NotificationCategory) { return categories[language][category]; }
export function notificationPriorityLabel(language: SupportedLanguage, priority: NotificationPriority) {
  const key = priority === 'action_required' ? 'actionRequired' : priority;
  return ui[language][key];
}
export function useEngagementText() {
  const { language } = useLocalization();
  return { language, text: (key: EngagementTextKey) => ui[language][key], event: (eventKey: string, category: NotificationCategory) => notificationEventCopy(language, eventKey, category), category: (value: NotificationCategory) => notificationCategoryLabel(language, value), priority: (value: NotificationPriority) => notificationPriorityLabel(language, value) };
}
