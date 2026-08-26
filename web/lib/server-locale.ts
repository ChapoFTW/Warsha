import { cookies, headers } from 'next/headers';

import {
  localeCookieName,
  preferredListFromAcceptLanguage,
  resolveEffectiveLocale,
  type Locale,
} from './preferences';

/**
 * The language an unprefixed surface renders in, decided on the server.
 *
 * The application and the console have no locale in their address - a
 * signed-in person's language is a property of them, not of the URL - so the
 * only way to render the first byte in the right language is to decide it here,
 * from what a server can actually see:
 *
 *   1. `warsha-locale`, which is written **only** by the language control and
 *      is therefore exactly the "somebody chose this" input;
 *   2. the browser's own `Accept-Language`;
 *   3. English.
 *
 * That is the same precedence `resolveEffectiveLocale` applies everywhere else,
 * with the two inputs a server has. It is also what removes the flash: the
 * server-rendered markup, the first client render and the reconciled client
 * render are now all the same language, so there is no frame of English to see
 * and no hydration mismatch to warn about.
 *
 * Reading a cookie opts these trees out of static rendering. That is correct
 * and costs nothing: they are authenticated, `robots: noindex`, and must never
 * be cached at the edge anyway.
 */
export async function serverLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return resolveEffectiveLocale({
    storedLocale: cookieStore.get(localeCookieName)?.value,
    storedExplicit: Boolean(cookieStore.get(localeCookieName)?.value),
    platformLocales: preferredListFromAcceptLanguage(headerStore.get('accept-language')),
  }).locale;
}
