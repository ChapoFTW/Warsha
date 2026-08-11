import { NextResponse, type NextRequest } from 'next/server';

import { localeFromAcceptLanguage } from './lib/preferences.ts';

/** The canonical host. Everything else redirects here. */
const CANONICAL_HOST = 'usewarsha.com';

/**
 * Two decisions, both made before a response is written.
 *
 * **Host.** `www.usewarsha.com` is the same site reachable at a second
 * address, which search engines treat as duplicate content and which splits
 * whatever reputation the domain earns. A permanent redirect to the apex makes
 * one of the two addresses the answer. It is 308 rather than 307 because the
 * canonical host genuinely is a permanent property of the site — unlike the
 * language below.
 *
 * **Language.** `/` has no language of its own, so one is chosen using the
 * mobile client's precedence, applied to what a server can see:
 *
 *   1. an explicit choice this visitor made before (the `warsha-locale` cookie);
 *   2. otherwise the browser's own preference (`Accept-Language`);
 *   3. otherwise English.
 *
 * Doing this on the server is the only way to honour "no English flash before
 * Arabic". A client-side redirect necessarily paints one language and then
 * replaces it, which is the flash rather than a fix for it.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0].toLowerCase() ?? '';

  // The host redirect runs first and preserves the whole path and query, so a
  // shared link to www.usewarsha.com/ar/legal/privacy-policy still arrives at
  // the document somebody was sent, not at the homepage.
  if (host === `www.${CANONICAL_HOST}`) {
    const canonical = request.nextUrl.clone();
    canonical.host = CANONICAL_HOST;
    canonical.port = '';
    canonical.protocol = 'https';
    return NextResponse.redirect(canonical, 308);
  }

  const { pathname } = request.nextUrl;

  // Already addressed in a language: nothing left to decide. The matcher lets
  // these through so the host redirect above can see them, so the guard has to
  // be here rather than in the matcher — without it `/en` would be rewritten
  // to `/en/en`, forever.
  if (/^\/(en|ar)(\/|$)/.test(pathname)) return NextResponse.next();

  const explicit = request.cookies.get('warsha-locale')?.value;
  const locale = explicit === 'ar' || explicit === 'en'
    ? explicit
    : localeFromAcceptLanguage(request.headers.get('accept-language'));

  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;

  // 307 rather than 308: which language `/` serves depends on who is asking,
  // so it must not be cached as a permanent property of the URL.
  return NextResponse.redirect(url, 307);
}

export const config = {
  /*
   * Application routes, plus everything on the wrong host.
   *
   * The locale-prefixed paths are excluded from the language rewrite but must
   * still be reachable by the host redirect, so `/en` and `/ar` are matched
   * here and returned unchanged by the language branch below — a request that
   * already carries a locale and the right host falls through to the redirect
   * it would have received anyway, which is why the matcher may be broad.
   */
  matcher: ['/((?!_next|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.).*)'],
};
