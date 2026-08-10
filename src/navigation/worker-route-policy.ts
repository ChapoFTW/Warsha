import type { RouteTarget } from '@/src/onboarding/onboarding-types';

export type ExperienceMode = 'customer' | 'provider';
export type RouteSurface = 'customer' | 'worker' | 'shared';

export type AccountHydration = {
  activeAccountKey: string | null;
  loadedAccountKey: string | null;
  settled: boolean;
};

export type RouteHydration = {
  authLoading: boolean;
  onboardingReady: boolean;
  providerLoading: boolean;
  target: RouteTarget;
};

const WORKER_PREFIXES = [
  '/worker',
  '/worker-home',
  '/worker-quotes',
  '/worker-quote',
  '/provider-mode',
  '/provider-job',
  '/provider-earnings',
  '/provider-portfolio',
  '/provider-certificates',
  '/provider-verification',
];

const CUSTOMER_PREFIXES = [
  '/orders',
  '/profile',
  '/search',
  '/categories',
  '/provider',
  '/marketplace-request',
  '/booking',
  '/favourites',
  '/recently-viewed',
  '/referrals',
];

const WORKER_ONBOARDING_CONTINUATIONS = [
  '/onboarding/worker',
  '/onboarding/address',
  '/worker/verification',
];

function matches(pathname: string, prefix: string): boolean {
  const canonical = pathname.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  return canonical === prefix || canonical.startsWith(`${prefix}/`);
}

/**
 * A settled flag belongs to the account that produced it. React effects run
 * after render, so an account change can otherwise expose the previous
 * account's `true` flag for one render before that effect resets it.
 */
export function accountHydrationReady(input: AccountHydration): boolean {
  return input.settled && input.loadedAccountKey === input.activeAccountKey;
}

/** A settled state for this same account may be refreshed behind its mounted
 * shell. Account changes and first hydration must still use the neutral gate. */
export function canRefreshAccountInline(input: Pick<AccountHydration, 'activeAccountKey' | 'loadedAccountKey'>): boolean {
  return input.activeAccountKey !== null && input.loadedAccountKey === input.activeAccountKey;
}

/**
 * The router receives no destination until every account-scoped authority has
 * settled for the current Auth session. `null` means render the neutral gate;
 * it never means customer mode or the signed-out gateway.
 */
export function routeAfterHydration(input: RouteHydration): RouteTarget | null {
  if (input.authLoading || !input.onboardingReady || input.providerLoading) return null;
  return input.target;
}

/**
 * Product-surface classification only. This is deliberately not an
 * authorization decision: worker verbs remain protected by their existing
 * RPC capability checks and RLS.
 */
export function routeSurface(pathname: string): RouteSurface {
  if (WORKER_PREFIXES.some(prefix => matches(pathname, prefix))) return 'worker';
  if (pathname === '/' || CUSTOMER_PREFIXES.some(prefix => matches(pathname, prefix))) {
    return 'customer';
  }
  return 'shared';
}

/**
 * Incomplete workers may enter only the screens that can satisfy their next
 * onboarding gate. Verification is mounted under the permanent worker tree so
 * completed workers can revisit it, but it is also an onboarding continuation.
 * Keeping that exception here prevents AuthGate from treating the verification
 * CTA as an attempt to escape into the operational worker shell.
 */
export function isWorkerOnboardingContinuation(pathname: string): boolean {
  return WORKER_ONBOARDING_CONTINUATIONS.some(prefix => matches(pathname, prefix));
}

export function defaultModeFor(target: RouteTarget): ExperienceMode {
  return target === 'worker_home' || target === 'worker_onboarding'
    ? 'provider'
    : 'customer';
}

export function homeRouteFor(target: RouteTarget): string {
  switch (target) {
    case 'gateway': return '/welcome';
    case 'role_choice': return '/create-account';
    case 'customer_address': return '/onboarding/address';
    case 'customer_home': return '/';
    case 'worker_onboarding': return '/onboarding/worker';
    case 'worker_home': return '/worker';
    case 'account_blocked': return '/welcome';
  }
}
