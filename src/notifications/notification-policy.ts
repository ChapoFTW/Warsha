import type {
  NotificationAudience,
  NotificationCategory,
  NotificationPriority,
  NotificationRouteType,
} from './notification-types';

export type NotificationDefinition = {
  category: NotificationCategory;
  priority: NotificationPriority;
  audience: NotificationAudience;
  actionType?: string;
  routeType?: NotificationRouteType;
  requiredAction: boolean;
  mandatoryInApp: boolean;
  groupFamily?: 'conversation' | 'marketplace_quotes';
};

const exact: Record<string, Partial<NotificationDefinition>> = {
  booking_message: { category: 'messages', priority: 'informational', routeType: 'conversation', actionType: 'open_chat', groupFamily: 'conversation' },
  booking_attachment: { category: 'messages', priority: 'informational', routeType: 'conversation', actionType: 'open_chat', groupFamily: 'conversation' },
  conversation_read_only: { category: 'messages', priority: 'important', routeType: 'conversation', actionType: 'open_chat', mandatoryInApp: true },
  quote_received: { category: 'marketplace', priority: 'important', routeType: 'marketplace_request', actionType: 'view_quote', groupFamily: 'marketplace_quotes' },
  quote_revised: { category: 'marketplace', priority: 'important', routeType: 'marketplace_request', actionType: 'view_quote', groupFamily: 'marketplace_quotes' },
  quote_invitation: { category: 'marketplace', priority: 'action_required', audience: 'worker', routeType: 'worker_opportunities', actionType: 'view_opportunity', requiredAction: true, mandatoryInApp: true },
  emergency_request: { category: 'marketplace', priority: 'critical', audience: 'worker', routeType: 'worker_opportunities', actionType: 'view_opportunity', requiredAction: true, mandatoryInApp: true },
  request_edited: { category: 'marketplace', audience: 'worker', routeType: 'worker_opportunities', actionType: 'view_opportunity' },
  quote_selected: { category: 'marketplace', priority: 'action_required', audience: 'worker', routeType: 'worker_quote', actionType: 'confirm_job', requiredAction: true, mandatoryInApp: true },
  marketplace_booking_confirmed: { category: 'marketplace', priority: 'important', audience: 'customer', routeType: 'booking', actionType: 'view_booking', mandatoryInApp: true },
  new_booking_request: { category: 'bookings', priority: 'action_required', audience: 'worker', routeType: 'booking', actionType: 'view_booking', requiredAction: true, mandatoryInApp: true },
  payment_required: { category: 'payments', priority: 'action_required', routeType: 'booking_payment', actionType: 'view_payment', requiredAction: true, mandatoryInApp: true },
  operation_waiting_for_approval: { category: 'bookings', priority: 'action_required', routeType: 'booking', actionType: 'approve_price', requiredAction: true, mandatoryInApp: true },
  operation_additional_work_requested: { category: 'bookings', priority: 'action_required', routeType: 'booking', actionType: 'approve_price', requiredAction: true, mandatoryInApp: true },
  operation_additional_work_needs_clarification: { category: 'bookings', priority: 'action_required', routeType: 'booking', actionType: 'view_booking', requiredAction: true, mandatoryInApp: true },
  operation_ready_for_inspection: { category: 'bookings', priority: 'action_required', routeType: 'booking', actionType: 'inspect_work', requiredAction: true, mandatoryInApp: true },
  operation_inspection: { category: 'bookings', priority: 'action_required', routeType: 'booking', actionType: 'inspect_work', requiredAction: true, mandatoryInApp: true },
  operation_return_visit_requested: { category: 'bookings', priority: 'action_required', routeType: 'booking', actionType: 'view_booking', requiredAction: true, mandatoryInApp: true },
  verification_rejected: { category: 'worker_account', priority: 'action_required', audience: 'worker', routeType: 'verification', actionType: 'view_verification', requiredAction: true, mandatoryInApp: true },
  verification_resubmission_requested: { category: 'worker_account', priority: 'action_required', audience: 'worker', routeType: 'verification', actionType: 'view_verification', requiredAction: true, mandatoryInApp: true },
  verification_expired: { category: 'worker_account', priority: 'action_required', audience: 'worker', routeType: 'verification', actionType: 'view_verification', requiredAction: true, mandatoryInApp: true },
  new_review: { category: 'reviews', priority: 'important', audience: 'worker', routeType: 'booking_review', actionType: 'view_review' },
  review_unlocked: { category: 'reviews', priority: 'important', audience: 'customer', routeType: 'booking_review', actionType: 'write_review' },
  review_reply: { category: 'reviews', priority: 'informational', audience: 'customer', routeType: 'booking_review', actionType: 'view_review' },
  dispute_opened: { category: 'disputes', priority: 'critical', audience: 'worker', routeType: 'booking_dispute', actionType: 'view_dispute', requiredAction: true, mandatoryInApp: true },
  dispute_evidence_requested: { category: 'disputes', priority: 'action_required', routeType: 'booking_dispute', actionType: 'add_evidence', requiredAction: true, mandatoryInApp: true },
};

function categoryFor(eventKey: string): NotificationCategory {
  if (eventKey.startsWith('dispute_')) return 'disputes';
  if (/^(payment_|refund_|earnings_|withdrawal_|cash_)/.test(eventKey)) return 'payments';
  if (/^(verification_|certificate_|worker_profile_)/.test(eventKey)) return 'worker_account';
  if (eventKey.startsWith('review_') || eventKey === 'new_review') return 'reviews';
  if (['booking_message', 'booking_attachment', 'conversation_read_only'].includes(eventKey)) return 'messages';
  if (/^(quote_|request_|marketplace_)/.test(eventKey) || ['emergency_request', 'rescue_started'].includes(eventKey)) return 'marketplace';
  if (/^(booking_|operation_|return_visit_)/.test(eventKey) || eventKey === 'new_booking_request') return 'bookings';
  if (/(password|email|phone)/.test(eventKey) || eventKey.startsWith('security_')) return 'security';
  return 'system';
}

function priorityFor(eventKey: string, category: NotificationCategory): NotificationPriority {
  if (/(cancelled|failed)$/.test(eventKey) || ['emergency_request', 'dispute_opened', 'quote_confirmation_expired', 'password_changed', 'email_changed', 'phone_changed'].includes(eventKey)) return 'critical';
  if (/(requested|required|pending_approval|resubmission)/.test(eventKey) || ['quote_selected', 'new_booking_request', 'operation_inspection'].includes(eventKey)) return 'action_required';
  return category === 'messages' || category === 'system' ? 'informational' : 'important';
}

function routeFor(eventKey: string, category: NotificationCategory): NotificationRouteType | undefined {
  if (['booking_message', 'booking_attachment', 'conversation_read_only'].includes(eventKey)) return 'conversation';
  if (['quote_invitation', 'emergency_request', 'request_edited', 'request_awarded_elsewhere', 'request_cancelled', 'quote_expired'].includes(eventKey)) return 'worker_opportunities';
  if (eventKey === 'quote_selected') return 'worker_quote';
  if (category === 'marketplace') return 'marketplace_request';
  if (category === 'payments') return /^(earnings_|withdrawal_|cash_)/.test(eventKey) ? 'worker_earnings' : 'booking_payment';
  if (category === 'worker_account') return eventKey.startsWith('verification_') ? 'verification' : 'provider_profile';
  if (category === 'reviews') return 'booking_review';
  if (category === 'disputes') return 'booking_dispute';
  if (category === 'bookings') return 'booking';
}

function audienceFor(eventKey: string, category: NotificationCategory): NotificationAudience {
  if (['new_booking_request', 'new_review', 'quote_invitation', 'quote_selected', 'emergency_request', 'request_edited', 'request_awarded_elsewhere', 'request_cancelled', 'quote_expired'].includes(eventKey)) return 'worker';
  if (category === 'worker_account' || /^(earnings_|withdrawal_|cash_)/.test(eventKey)) return 'worker';
  if (eventKey === 'review_reply') return 'customer';
  return 'customer';
}

export function notificationDefinition(type: string): NotificationDefinition {
  const eventKey = type.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'system_update';
  const category = exact[eventKey]?.category ?? categoryFor(eventKey);
  const priority = exact[eventKey]?.priority ?? priorityFor(eventKey, category);
  const requiredAction = exact[eventKey]?.requiredAction ?? priority === 'action_required';
  return {
    category,
    priority,
    audience: exact[eventKey]?.audience ?? audienceFor(eventKey, category),
    actionType: exact[eventKey]?.actionType,
    routeType: exact[eventKey]?.routeType ?? routeFor(eventKey, category),
    requiredAction,
    mandatoryInApp: exact[eventKey]?.mandatoryInApp ?? (requiredAction || priority === 'critical' || ['payments', 'disputes', 'security'].includes(category)),
    groupFamily: exact[eventKey]?.groupFamily,
  };
}

export function notificationAccountId(dataMode: 'mock' | 'supabase', authenticatedId: string | undefined, mode: 'customer' | 'provider') {
  if (dataMode === 'mock') return mode === 'provider' ? 'mock-user' : 'mock-customer';
  return authenticatedId ?? '';
}

export function isQuietTime(now: Date, start: string | undefined, end: string | undefined) {
  if (!start || !end || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start === end) return false;
  const minute = now.getHours() * 60 + now.getMinutes();
  const toMinute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const from = toMinute(start); const to = toMinute(end);
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}
