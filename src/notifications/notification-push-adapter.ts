import type { NotificationCategory, NotificationPriority } from './notification-types';

export const pushCapability = {
  available: false,
  provider: 'disabled' as const,
  tokenRegistration: false,
  delivery: false,
  scheduler: false,
};

const genericPreview: Record<NotificationCategory, string> = {
  marketplace: 'Your service request has an update.',
  bookings: 'Your booking has an update.',
  messages: 'You have a new message in Warsha.',
  payments: 'Your payment status changed.',
  worker_account: 'Your worker account has an update.',
  reviews: 'A review has an update.',
  disputes: 'Your dispute has an update.',
  security: 'Your Warsha account security changed.',
  system: 'You have an update in Warsha.',
  support: 'Your support case has an update.',
};

export function externalNotificationPreview(category: NotificationCategory) { return genericPreview[category]; }

export function pushDeliveryPolicy(input: {
  priority: NotificationPriority;
  quietHoursActive: boolean;
  pushPreference: boolean;
}) {
  if (!pushCapability.available || !pushCapability.delivery) return { state: 'disabled' as const };
  if (!input.pushPreference) return { state: 'suppressed' as const };
  if (input.quietHoursActive && !['critical', 'action_required'].includes(input.priority)) return { state: 'delayed' as const };
  return { state: 'eligible' as const };
}

export function simulateMockPush(category: NotificationCategory) {
  return {
    state: 'simulation_only' as const,
    provider: 'none' as const,
    delivered: false as const,
    preview: externalNotificationPreview(category),
  };
}

export async function deliverPushFailClosed(): Promise<never> {
  throw new Error('Production push delivery is disabled.');
}
