/**
 * Where a notification goes when somebody taps it.
 *
 * This used to be a `switch` inside `notification-context.tsx`, reachable only
 * from the notification list. That was fine while the list was the only way in.
 * A push notification is a second way in — the app may not even be running when
 * it is tapped — and a second `switch` would be a second answer to "what does
 * `booking_dispute` open", which is exactly the kind of quiet divergence the
 * parity rule exists to stop.
 *
 * So the mapping is here, as data, and both callers read it. It is deliberately
 * free of `expo-router`, React and every Warsha module: it takes a route type
 * and returns a description of a destination, which makes it directly testable
 * and keeps it importable from anywhere.
 *
 * ## The mode argument
 *
 * `booking` is the one route type that resolves differently for the two sides
 * of the same job — a customer opens `/booking/[id]`, a worker opens
 * `/worker/jobs/[id]` — because they are genuinely different screens showing
 * the same booking. Everything else is the same screen for whoever may see it,
 * and access is decided by `resolve_notification_route` on the server before
 * this is ever called.
 */

import type { NotificationMode, NotificationRouteType } from './notification-types';

export type NotificationDestination = {
  pathname: string;
  params?: Record<string, string>;
};

/**
 * The destination, or null when the route type names no screen.
 *
 * Null is a real answer rather than a failure: `resolve_notification_route`
 * can return `ok` for a notification whose resource has gone, and a caller
 * that treats null as "stay where you are" behaves correctly. A caller that
 * treated it as an error would show somebody an alert for a notification that
 * simply has nowhere to go.
 */
export function notificationDestination(input: {
  routeType: NotificationRouteType | null | undefined;
  resourceId?: string | null;
  mode: NotificationMode;
}): NotificationDestination | null {
  const id = input.resourceId ?? undefined;
  switch (input.routeType) {
    case 'marketplace_request':
      return id ? { pathname: '/marketplace-request/[id]', params: { id } } : null;
    case 'worker_opportunities':
      return { pathname: '/worker/requests' };
    case 'worker_quote':
      return id ? { pathname: '/worker/requests/[id]', params: { id } } : null;
    case 'booking':
      if (!id) return null;
      return input.mode === 'worker'
        ? { pathname: '/worker/jobs/[id]', params: { id } }
        : { pathname: '/booking/[id]', params: { id } };
    case 'conversation':
      return id ? { pathname: '/conversation/[bookingId]', params: { bookingId: id } } : null;
    case 'provider_profile':
      return id ? { pathname: '/provider/[id]', params: { id } } : null;
    case 'booking_payment':
      return id ? { pathname: '/booking/[id]', params: { id, focusPayment: '1' } } : null;
    case 'worker_earnings':
      return { pathname: '/provider-earnings' };
    case 'verification':
      return { pathname: '/worker/verification' };
    case 'booking_review':
      return id ? { pathname: '/booking/[id]', params: { id, focusReview: '1' } } : null;
    case 'booking_dispute':
      return id ? { pathname: '/booking/[id]', params: { id, focusDispute: '1' } } : null;
    case 'preferences':
      return { pathname: '/notification-preferences' };
    case 'support_case':
      return id ? { pathname: '/support/case/[id]', params: { id } } : null;
    default:
      return null;
  }
}

/**
 * The route types that need a resource id to mean anything.
 *
 * A push payload carrying `booking` and no id is a defect on the server side,
 * and naming the set here lets a test say so rather than each call site
 * rediscovering it.
 */
export const routeTypesRequiringResource: readonly NotificationRouteType[] = [
  'marketplace_request', 'worker_quote', 'booking', 'conversation',
  'provider_profile', 'booking_payment', 'booking_review', 'booking_dispute',
  'support_case',
];

/**
 * The mode a notification should be read in.
 *
 * A worker-audience notification opens the worker side of the app even if the
 * person was last looking at the customer side, because the thing they tapped
 * only exists there. `all` keeps whatever mode they are already in.
 */
export function notificationModeFor(
  audience: 'customer' | 'worker' | 'all' | null | undefined,
  currentMode: NotificationMode,
): NotificationMode {
  if (audience === 'customer' || audience === 'worker') return audience;
  return currentMode;
}
