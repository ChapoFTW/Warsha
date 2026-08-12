import type { Route } from 'next';

import type { Locale } from './preferences.ts';

/**
 * Build a locale-prefixed href.
 *
 * `typedRoutes` verifies that every literal href names a route that exists —
 * it already caught a link to a page that had never been built, which is worth
 * keeping. It cannot see through a template literal, so a locale-prefixed path
 * arrives as plain `string` and has to be asserted.
 *
 * The assertion is concentrated here, once, rather than spread across every
 * call site. `[locale]` is generated for both languages by
 * `generateStaticParams`, so `/en/services` and `/ar/services` are as real as
 * any literal route — the type system simply cannot prove it through the
 * interpolation.
 */
export function localeHref(locale: Locale, path = ''): Route {
  return `/${locale}${path}` as Route;
}

/**
 * The origin the authenticated application is served from.
 *
 * The marketing site and the application are deliberately different origins,
 * so a link between them is absolute and crosses a browser security boundary —
 * which is the point: a flaw in a marketing page cannot reach a signed-in
 * session, and vice versa.
 *
 * In development the application is the same host, so a relative path is
 * correct there and an absolute one would send somebody to production.
 */
const APP_ORIGIN = 'https://app.usewarsha.com';

/**
 * A link into the real authenticated application.
 *
 * Public pages must not implement authentication. There is one sign-in, it
 * lives at the application origin, and it is identity-driven — an address goes
 * to password auth and a phone number to the worker broker, decided after the
 * identifier is typed rather than by asking somebody to classify themselves
 * first. Duplicating any of that on the marketing site would create a second
 * implementation that drifts, and the drift would be in authentication.
 */
export function appHref(path: string): string {
  return `${APP_ORIGIN}${path}`;
}

/** Where a public "Sign in" control sends somebody. */
export const APP_SIGN_IN = appHref('/sign-in');
