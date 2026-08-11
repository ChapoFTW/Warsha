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
