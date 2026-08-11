import { NextResponse, type NextRequest } from 'next/server';

import { localeFromAcceptLanguage } from './lib/preferences.ts';

/**
 * Decide the language of `/` before the response is written.
 *
 * The precedence is the mobile client's, applied to what a server can see:
 *
 *   1. an explicit choice this visitor made before (the `warsha-locale` cookie);
 *   2. otherwise the browser's own preference (`Accept-Language`);
 *   3. otherwise English.
 *
 * Doing this on the server is the only way to honour "no English flash before
 * Arabic". A client-side redirect necessarily paints one language first and
 * then replaces it, which is the flash rather than a fix for it. The cookie is
 * written alongside `localStorage` when somebody picks a language, because
 * `localStorage` is invisible here.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
  // Only unprefixed application routes. Static assets, the Next internals and
  // anything already carrying a locale are left alone.
  matcher: ['/((?!en|ar|_next|favicon.ico|robots.txt|sitemap.xml|.*\\.).*)'],
};
