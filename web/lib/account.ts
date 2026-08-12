import {
  emptyOnboardingState,
  routeFor,
  type OnboardingState,
  type RouteTarget,
} from '../../src/onboarding/onboarding-types.ts';

export { routeFor, emptyOnboardingState };
export type { OnboardingState, RouteTarget };

/**
 * What the web knows about the signed-in account.
 *
 * `routeFor` and `OnboardingState` are imported, not restated. They are the
 * same pure functions and the same shape the Android and iOS clients use to
 * decide where an account belongs, so a customer who is mid-onboarding on
 * their phone is mid-onboarding here too — not because the two agree, but
 * because there is one rule.
 */

export type ProductMode = 'customer' | 'worker';

export type AccountResolution =
  /** Auth or account state has not settled. Nothing may render yet. */
  | { status: 'loading' }
  | { status: 'signed_out' }
  /** Signed in, product surface known. */
  | { status: 'resolved'; target: RouteTarget; state: OnboardingState; roles: ProductRoles }
  /** Compatibility shape for an explicit chooser during hydration. */
  | { status: 'choose_mode'; state: OnboardingState; roles: ProductRoles };

export type ProductRoles = {
  customer: boolean;
  /** True only when the server says the worker capability is active. */
  worker: boolean;
  both: boolean;
};

/**
 * Which products the account may actually use.
 *
 * `workerCapabilityActive` is the only permission fact in the onboarding
 * payload and it is server-computed; nothing here infers a capability from an
 * intention. Somebody who applied to be a worker but has not been approved is
 * not a worker, and this says so.
 */
export function productRolesFor(state: OnboardingState): ProductRoles {
  const worker = state.workerCapabilityActive === true;
  // Every account can act as a customer: the customer surface is the default
  // product, and a worker booking their own repair is an ordinary customer.
  const customer = true;
  return { customer, worker, both: customer && worker };
}

/**
 * Resolve where a signed-in account belongs.
 *
 * A worker starts in the canonical worker experience. Customer mode is an
 * explicit, session-scoped choice; the absence of a choice is never permission
 * to route a worker into customer Home or interrupt every cold start.
 */
export function resolveAccount(input: {
  authSettled: boolean;
  signedIn: boolean;
  state: OnboardingState | null;
  preferredMode: ProductMode | null;
}): AccountResolution {
  if (!input.authSettled) return { status: 'loading' };
  if (!input.signedIn) return { status: 'signed_out' };
  if (!input.state) return { status: 'loading' };

  const roles = productRolesFor(input.state);
  const target = routeFor(input.state, true);

  // A worker still in onboarding has one obvious next step. An active worker
  // also has a canonical home; customer mode exists only when explicitly
  // selected for this browser session.
  const dualCapable = roles.both && target === 'worker_home';
  if (dualCapable && input.preferredMode === 'customer') {
    return { status: 'resolved', target: 'customer_home', state: input.state, roles };
  }

  return { status: 'resolved', target, state: input.state, roles };
}

/** Where a resolved target lives in the web application. */
export function webHomeFor(target: RouteTarget): string {
  switch (target) {
    case 'worker_home':
      return '/worker';
    case 'worker_onboarding':
      return '/worker/onboarding';
    case 'customer_address':
      return '/onboarding/address';
    case 'role_choice':
      return '/onboarding/role';
    case 'account_blocked':
      return '/account/unavailable';
    case 'customer_home':
      return '/';
    case 'gateway':
    default:
      return '/sign-in';
  }
}

export const PREFERRED_MODE_KEY = 'warsha:web-product-mode:v1';

export function isProductMode(value: unknown): value is ProductMode {
  return value === 'customer' || value === 'worker';
}
