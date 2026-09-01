/**
 * The rules push delivery follows, with nothing that can send one.
 *
 * This file is pure by design and the regression suite asserts it: no `fetch`,
 * no vendor SDK, no `expo-notifications` import. Two different things live
 * behind that rule.
 *
 *   * The DEVICE half — asking for permission, getting a token, handling a tap
 *     — is in `push-registration.ts`, which imports `expo-notifications` and
 *     therefore only runs on a phone.
 *   * The SENDING half is in the `push-dispatch` Edge Function. A client that
 *     could send a push could send one to somebody else, so no client can.
 *
 * What is left here is the policy both halves and the tests agree on, in a
 * module Node can import directly.
 *
 * ## The lock-screen vocabulary
 *
 * Ten categories, three languages, and nothing else is ever sent. Not the
 * event, not a name, not an amount, not a booking reference.
 *
 * That is stricter than the in-app inbox and deliberately so. WPS-014 gave
 * every event a deliberately vague `generic_title`/`generic_body` pair and gave
 * people a `genericPreviews` preference to control in-app copy. Neither applies
 * to a lock screen, because a lock screen is the one Warsha surface a stranger
 * reads: somebody glancing at a phone on a table learns whatever it says. A
 * setting that CAN make it say more is a setting somebody switches on once and
 * forgets, and the failure mode is their dispute or their payment being legible
 * to whoever is nearby.
 *
 * So there is no such setting. "Your dispute has an update" tells the owner
 * exactly what they need — which part of Warsha wants them — and tells a
 * stranger nothing they did not already know by seeing the app installed.
 *
 * `private.notification_push_copy` holds the same thirty strings, because the
 * server is what renders a queued push. `notification-catalogue.test.mts`
 * asserts the two are identical, so they cannot drift.
 */

import type { NotificationCategory, NotificationPriority } from './notification-types';

export type PushLanguage = 'en' | 'ar' | 'fr';
export type PushPlatform = 'android' | 'ios' | 'web';

/** Expo Push Service. See the migration header for why, and why not APNs+FCM. */
export type PushProvider = 'disabled' | 'expo';

/**
 * What the server says this deployment can do.
 *
 * This used to be a hard-coded object with five `false` values. It is now
 * whatever `get_my_push_state` returned, because whether push works is a
 * property of the deployment and not of the bundle — the same build runs
 * against a project with delivery on and a project with it off.
 */
export type PushCapability = {
  provider: PushProvider;
  registrationAvailable: boolean;
  deliveryAvailable: boolean;
  pushEnabled: boolean;
  deviceCount: number;
};

/** What a client assumes before it has asked. Nothing. */
export const unknownPushCapability: PushCapability = {
  provider: 'disabled',
  registrationAvailable: false,
  deliveryAvailable: false,
  pushEnabled: false,
  deviceCount: 0,
};

export function readPushCapability(value: unknown): PushCapability {
  const raw = (value ?? {}) as Record<string, unknown>;
  const provider = raw.provider === 'expo' ? 'expo' : 'disabled';
  return {
    provider,
    registrationAvailable: provider !== 'disabled' && raw.registrationAvailable === true,
    deliveryAvailable: provider !== 'disabled' && raw.deliveryAvailable === true,
    pushEnabled: raw.pushEnabled === true,
    deviceCount: typeof raw.deviceCount === 'number' && raw.deviceCount >= 0
      ? Math.floor(raw.deviceCount) : 0,
  };
}

type Preview = { title: string; body: string };

/**
 * The only text that ever reaches a lock screen.
 *
 * Identical, string for string, to `private.notification_push_copy`.
 */
export const pushPreviewCopy: Record<PushLanguage, Record<NotificationCategory, Preview>> = {
  en: {
    marketplace: { title: 'Marketplace update', body: 'Your service request has an update.' },
    bookings: { title: 'Booking update', body: 'Your booking has an update.' },
    messages: { title: 'New message', body: 'You have a new message in Warsha.' },
    payments: { title: 'Payment update', body: 'Your payment status changed.' },
    worker_account: { title: 'Worker account update', body: 'Your worker account has an update.' },
    reviews: { title: 'Review update', body: 'A review has an update.' },
    disputes: { title: 'Dispute update', body: 'Your dispute has an update.' },
    security: { title: 'Account security update', body: 'Your Warsha account security changed.' },
    system: { title: 'Warsha update', body: 'You have an update in Warsha.' },
    support: { title: 'Support update', body: 'Your support case has an update.' },
  },
  ar: {
    marketplace: { title: 'تحديث في السوق', body: 'فيه تحديث على طلب الخدمة بتاعك.' },
    bookings: { title: 'تحديث في الحجز', body: 'فيه تحديث على حجزك.' },
    messages: { title: 'رسالة جديدة', body: 'عندك رسالة جديدة في ورشة.' },
    payments: { title: 'تحديث في الدفع', body: 'حالة الدفع بتاعتك اتغيرت.' },
    worker_account: { title: 'تحديث في حساب الصنايعي', body: 'فيه تحديث على حساب الصنايعي بتاعك.' },
    reviews: { title: 'تحديث في التقييم', body: 'فيه تحديث على تقييم.' },
    disputes: { title: 'تحديث في الشكوى', body: 'فيه تحديث على الشكوى بتاعتك.' },
    security: { title: 'تحديث في أمان الحساب', body: 'فيه تغيير في أمان حسابك في ورشة.' },
    system: { title: 'تحديث من ورشة', body: 'عندك تحديث في ورشة.' },
    support: { title: 'تحديث في الدعم', body: 'فيه تحديث على طلب الدعم بتاعك.' },
  },
  fr: {
    marketplace: { title: 'Mise à jour de la demande', body: 'Votre demande de service a une mise à jour.' },
    bookings: { title: 'Mise à jour de la réservation', body: 'Votre réservation a une mise à jour.' },
    messages: { title: 'Nouveau message', body: 'Vous avez un nouveau message dans Warsha.' },
    payments: { title: 'Mise à jour du paiement', body: 'Le statut de votre paiement a changé.' },
    worker_account: { title: 'Mise à jour du compte artisan', body: 'Votre compte artisan a une mise à jour.' },
    reviews: { title: 'Mise à jour d’un avis', body: 'Un avis a une mise à jour.' },
    disputes: { title: 'Mise à jour du litige', body: 'Votre litige a une mise à jour.' },
    security: { title: 'Sécurité du compte', body: 'La sécurité de votre compte Warsha a changé.' },
    system: { title: 'Mise à jour Warsha', body: 'Vous avez une mise à jour dans Warsha.' },
    support: { title: 'Mise à jour du support', body: 'Votre demande d’assistance a une mise à jour.' },
  },
};

export function pushPreview(category: NotificationCategory, language: PushLanguage = 'en'): Preview {
  return pushPreviewCopy[language]?.[category] ?? pushPreviewCopy.en[category];
}

/** The WPS-014 name, kept so its callers and its test keep working. */
export function externalNotificationPreview(category: NotificationCategory): string {
  return pushPreview(category, 'en').body;
}

/**
 * Whether this notification should reach this person's lock screen now.
 *
 * The server applies the same rules in `private.enqueue_push_delivery`; this is
 * here so they can be stated once in a language a test can read, and so the
 * client can explain itself ("quiet hours, we will tell you at 07:00") without
 * asking the server.
 *
 * `delayed` rather than `suppressed` for quiet hours is the substantive choice:
 * a notification silenced at 23:00 is still worth having at 07:00, and dropping
 * it would mean quiet hours quietly cost people bookings.
 */
export function pushDeliveryPolicy(input: {
  priority: NotificationPriority;
  quietHoursActive: boolean;
  pushPreference: boolean;
  capability?: PushCapability;
}) {
  const capability = input.capability ?? unknownPushCapability;
  if (capability.provider === 'disabled' || !capability.deliveryAvailable) {
    return { state: 'disabled' as const };
  }
  if (!input.pushPreference) return { state: 'suppressed' as const };
  if (input.quietHoursActive && !bypassesQuietHours(input.priority)) {
    return { state: 'delayed' as const };
  }
  return { state: 'eligible' as const };
}

/**
 * The two priorities that wake somebody up.
 *
 * Matches `notification_event_catalog.quiet_hours_bypass` and the same
 * expression in `enqueue_push_delivery`. A booking that needs confirming
 * tonight cannot wait until morning; a review notification can.
 */
export function bypassesQuietHours(priority: NotificationPriority): boolean {
  return priority === 'critical' || priority === 'action_required';
}

/**
 * Whether a string is an Expo push token.
 *
 * Expo issues `ExponentPushToken[...]` and, for some configurations,
 * `ExpoPushToken[...]`. Checking the shape client-side is not a security
 * control — the server re-validates length and the provider rejects nonsense —
 * it is how a device that produced something unexpected declines to register it
 * rather than storing a value nothing can ever deliver to.
 */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && /^Expo(nent)?PushToken\[[^\]]{1,200}\]$/.test(value);
}

/**
 * What the app should do about registration, given what it knows.
 *
 * Extracted from the wiring so the decision can be tested without a device.
 * The one that matters is `revoke`: signing out has to take the token with it,
 * or the next person to use the phone receives the last person's notifications.
 */
export type PushRegistrationDecision =
  | { action: 'skip'; reason: 'unsupported_platform' | 'unavailable' | 'signed_out' | 'preference_off' }
  | { action: 'request_permission' }
  | { action: 'register' }
  | { action: 'revoke'; reason: 'signed_out' | 'preference_off' | 'permission_lost' };

export function pushRegistrationDecision(input: {
  platform: PushPlatform | 'unsupported';
  signedIn: boolean;
  capability: PushCapability;
  permission: 'granted' | 'denied' | 'undetermined';
  hasRegisteredToken: boolean;
}): PushRegistrationDecision {
  // Signing out revokes before anything else is considered. A token that
  // outlives a session is the whole cross-account failure.
  if (!input.signedIn) {
    return input.hasRegisteredToken
      ? { action: 'revoke', reason: 'signed_out' }
      : { action: 'skip', reason: 'signed_out' };
  }
  if (input.platform === 'unsupported') return { action: 'skip', reason: 'unsupported_platform' };
  if (!input.capability.registrationAvailable) {
    return input.hasRegisteredToken
      ? { action: 'revoke', reason: 'preference_off' }
      : { action: 'skip', reason: 'unavailable' };
  }
  if (!input.capability.pushEnabled) {
    return input.hasRegisteredToken
      ? { action: 'revoke', reason: 'preference_off' }
      : { action: 'skip', reason: 'preference_off' };
  }
  // Somebody who turned the OS permission off after granting it has said no in
  // the clearest way available. The stored token stops being deliverable, so it
  // stops being stored.
  if (input.permission === 'denied') {
    return input.hasRegisteredToken
      ? { action: 'revoke', reason: 'permission_lost' }
      : { action: 'skip', reason: 'preference_off' };
  }
  if (input.permission === 'undetermined') return { action: 'request_permission' };
  return { action: 'register' };
}

/**
 * The payload a queued push carries, as the device receives it.
 *
 * Ids and a route type. Nothing legible, nothing personal — the words are the
 * category preview above, and everything else is looked up after the tap by a
 * signed-in client that is allowed to see it.
 */
export type PushPayload = {
  notificationId?: string;
  category?: NotificationCategory;
  routeType?: string;
  resourceId?: string;
  audience?: 'customer' | 'worker' | 'all';
  requiredAction?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads a payload from whatever arrived, keeping only what is recognised.
 *
 * A push payload is untrusted input in the same sense a deep link is: it
 * arrives through the operating system and the app cannot prove who composed
 * it. So identifiers are shape-checked before they are ever put in a route, and
 * anything unrecognised is dropped rather than passed along. The server checks
 * again — `resolve_notification_route` decides what this account may open — so
 * this is the first of two gates, not the only one.
 */
export function readPushPayload(raw: unknown): PushPayload {
  const data = (raw ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : undefined);
  const uuid = (key: string) => {
    const value = text(key);
    return value && UUID.test(value) ? value : undefined;
  };
  const audience = text('audience');
  return {
    notificationId: uuid('notificationId'),
    category: text('category') as NotificationCategory | undefined,
    routeType: text('routeType'),
    resourceId: uuid('resourceId'),
    audience: audience === 'customer' || audience === 'worker' || audience === 'all'
      ? audience : undefined,
    requiredAction: data.requiredAction === true,
  };
}
