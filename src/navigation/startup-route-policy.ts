import { isPublicAuthRoute, signedOutRedirect } from './auth-route-policy.ts';
import {
  homeRouteFor,
  isWorkerOnboardingContinuation,
  routeSurface,
  type ExperienceMode,
} from './worker-route-policy.ts';
import type { RouteTarget } from '../onboarding/onboarding-types.ts';

export type StartupRouteInput = {
  ready: boolean;
  pathname: string;
  target: RouteTarget;
  mode: ExperienceMode;
  workerCapabilityActive: boolean;
  legalAcceptanceRequired: boolean;
};

export type StartupRouteDecision =
  | { status: 'loading'; redirect: null }
  | { status: 'redirecting'; redirect: string }
  | { status: 'render'; redirect: null };

const LEGAL_ACCESS_ROUTES = [
  '/legal',
  '/privacy',
  '/privacy-delete',
  '/support',
  '/help',
] as const;

function canonicalPathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';
  const segments = path.split('/').filter(Boolean).filter(segment => !/^\(.+\)$/.test(segment));
  return segments.length ? `/${segments.join('/')}` : '/';
}

function moveTo(pathname: string, destination: string): StartupRouteDecision {
  return canonicalPathname(pathname) === canonicalPathname(destination)
    ? { status: 'render', redirect: null }
    : { status: 'redirecting', redirect: destination };
}

/** Privacy, support, appeals and account closure remain reachable even when a
 * material legal update is awaiting a decision. */
export function isLegalAccessRoute(pathname: string): boolean {
  const path = canonicalPathname(pathname);
  return LEGAL_ACCESS_ROUTES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Decide whether the current route may mount.
 *
 * A redirect is not permission to render the route being replaced. React
 * effects run after paint, so `redirecting` deliberately renders the same
 * neutral startup surface as `loading` until Expo Router reports the new
 * pathname. This is the first-paint authority used by native, Preview and web.
 */
export function startupRouteDecision(input: StartupRouteInput): StartupRouteDecision {
  if (!input.ready) return { status: 'loading', redirect: null };

  if (input.target === 'gateway') {
    const redirect = signedOutRedirect(input.pathname);
    return redirect
      ? { status: 'redirecting', redirect }
      : { status: 'render', redirect: null };
  }

  if (input.legalAcceptanceRequired && !isLegalAccessRoute(input.pathname)) {
    return { status: 'redirecting', redirect: '/legal/consent' };
  }

  // Legal/privacy documents are public so they can be read before signup,
  // but they are also valid shared surfaces for an authenticated account.
  // Only the account-entry routes should eject a signed-in user.
  if (isPublicAuthRoute(input.pathname) && !isLegalAccessRoute(input.pathname)) {
    return moveTo(input.pathname, homeRouteFor(input.target));
  }

  const surface = routeSurface(input.pathname);

  if (input.target === 'account_blocked' || input.target === 'role_choice') {
    return moveTo(input.pathname, homeRouteFor(input.target));
  }

  if (
    input.target === 'worker_onboarding'
    && surface !== 'shared'
    && !isWorkerOnboardingContinuation(input.pathname)
  ) {
    return { status: 'redirecting', redirect: homeRouteFor(input.target) };
  }

  if (input.target === 'worker_home') {
    if (
      surface === 'worker'
      && (canonicalPathname(input.pathname) === '/worker-home'
        || canonicalPathname(input.pathname) === '/provider-mode')
    ) {
      return { status: 'redirecting', redirect: homeRouteFor(input.target) };
    }
    if (surface === 'customer' && input.mode !== 'customer') {
      return { status: 'redirecting', redirect: homeRouteFor(input.target) };
    }
    return { status: 'render', redirect: null };
  }

  if (
    (input.target === 'customer_home' || input.target === 'customer_address')
    && surface === 'worker'
    && !input.workerCapabilityActive
  ) {
    return { status: 'redirecting', redirect: homeRouteFor(input.target) };
  }

  if (input.target === 'customer_address' && canonicalPathname(input.pathname) === '/') {
    return { status: 'redirecting', redirect: homeRouteFor(input.target) };
  }

  return { status: 'render', redirect: null };
}
