/**
 * The one rule that decides Warsha's effective language, on every surface.
 *
 * ## Why this file exists
 *
 * Warsha had a language *value* in four places and a language *decision* in
 * none. The mobile client resolved it in `LocalizationProvider`; the public
 * website read it out of the URL segment; the authenticated web read it out of
 * `localStorage` inside a per-component hook that started at English and
 * corrected itself after mount; and the middleware read it out of a cookie.
 * Four readers with four defaults is exactly how a person ends up believing
 * language is a property of the page they happen to be looking at - because
 * with four independent defaults, it effectively was.
 *
 * So the *rule* moves here, once, import-free, and every surface applies it
 * rather than restating it. What differs between platforms is only where the
 * inputs come from, never what they mean.
 *
 * ## The precedence
 *
 * 1. **An explicit choice.** Somebody opened the control and picked a
 *    language. That is a statement about themselves, not about a page, and it
 *    outranks everything below including the address they arrived at.
 * 2. **The route locale**, where the surface has one. The public site is
 *    genuinely locale-addressed: `/ar/services` is a real, crawlable,
 *    shareable document, and a link somebody was *sent* must open in the
 *    language it was sent in. It ranks below an explicit choice because a
 *    stale bookmark is not a preference.
 * 3. **A remembered non-explicit value** - the last effective language,
 *    carried in the cross-origin cookie. This is what keeps the three web
 *    origins agreeing before any of them has been given an explicit choice.
 * 4. **The browser or device language**, mapped through the same
 *    first-preferred-supported-language rule the mobile client already used.
 * 5. **English.**
 *
 * Direction is never a separate decision. It is derived, here, from the
 * effective language - which is the invariant that makes an English page in
 * RTL impossible to express in Warsha's own state. (Browser auto-translation
 * can still produce that *visually*; that is the browser rewriting the
 * document after Warsha has finished with it, and is deliberately out of
 * scope.)
 */

export const supportedLocales = ['en', 'ar', 'fr'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export type LocaleDirection = 'ltr' | 'rtl';

/** Where an effective locale came from. Carried so surfaces can be tested and audited. */
export type LocaleSource =
  | 'explicit'
  | 'route'
  | 'remembered'
  | 'platform'
  | 'default';

export type EffectiveLocale = {
  locale: SupportedLocale;
  direction: LocaleDirection;
  source: LocaleSource;
  /** True only for (1): a person opened the control and chose this. */
  explicit: boolean;
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return value === 'en' || value === 'ar' || value === 'fr';
}

/**
 * Direction is a function of language and of nothing else.
 *
 * There is no code path in Warsha that sets one without the other, and
 * `localeDirectionAgrees` exists so a test can assert that for every locale at
 * once rather than trusting each caller.
 */
export function directionFor(locale: SupportedLocale): LocaleDirection {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** The invariant, stated as a predicate so tests and runtime can share it. */
export function localeDirectionAgrees(locale: unknown, direction: unknown): boolean {
  return isSupportedLocale(locale) && direction === directionFor(locale);
}

/** BCP-47 tag Warsha formats numbers, dates and money with for a locale. */
export function intlTagFor(locale: SupportedLocale): 'en-EG' | 'ar-EG' | 'fr-EG' {
  return locale === 'ar' ? 'ar-EG' : locale === 'fr' ? 'fr-EG' : 'en-EG';
}

/**
 * The first *preferred supported* language wins.
 *
 * Deliberately identical in behaviour to the rule the mobile client has always
 * applied to `expo-localization`'s `getLocales()`: Arabic wins only when it is
 * genuinely the reader's first supported preference, never because it appears
 * somewhere further down a long list.
 */
export function localeFromPreferredList(
  preferred: readonly (string | { languageCode?: string | null; languageTag?: string | null } | null | undefined)[]
    | null | undefined,
): SupportedLocale | null {
  if (!preferred || preferred.length === 0) return null;
  const first = preferred.find((entry) => entry !== null && entry !== undefined);
  if (first === undefined) return null;
  const raw = typeof first === 'string'
    ? first
    : first.languageCode ?? first.languageTag ?? '';
  const language = String(raw).toLowerCase().split(/[-_]/, 1)[0];
  return isSupportedLocale(language) ? language : null;
}

/** Parse an `Accept-Language` header into the same preference-list shape. */
export function preferredListFromAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(';');
      const quality = parameters
        .map((parameter) => /^q=([0-9.]+)$/.exec(parameter.trim()))
        .find(Boolean);
      return { tag: tag.trim(), quality: quality ? Number(quality[1]) : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}

/** Read a locale out of a leading `/en`, `/ar` or `/fr` path segment. */
export function localeFromPath(pathname: string | null | undefined): SupportedLocale | null {
  if (!pathname) return null;
  const match = /^\/(en|ar|fr)(?:\/|$)/.exec(pathname);
  return match ? (match[1] as SupportedLocale) : null;
}

/** The path with its locale segment removed, so a switch can rebuild it. */
export function pathWithoutLocale(pathname: string | null | undefined): string {
  if (!pathname) return '';
  return pathname.replace(/^\/(en|ar|fr)(?=\/|$)/, '');
}

/**
 * Swap the locale segment of a locale-addressed path, preserving everything
 * else about it.
 *
 * This is what makes "switch language while filling in a form" keep the person
 * on that form. Sending somebody Home to change language is the behaviour this
 * replaces.
 */
export function pathWithLocale(pathname: string | null | undefined, locale: SupportedLocale): string {
  const rest = pathWithoutLocale(pathname);
  return `/${locale}${rest}`;
}

export type LocaleInputs = {
  /** The value stored by the language control, whatever the platform's store is. */
  storedLocale?: unknown;
  /** Whether that stored value was chosen by a person rather than defaulted in. */
  storedExplicit?: boolean;
  /** The `/en|/ar|/fr` segment, on surfaces that have one. */
  routeLocale?: unknown;
  /** The last effective locale, carried across origins by cookie. */
  rememberedLocale?: unknown;
  /** Browser or device preference list, most-preferred first. */
  platformLocales?: readonly (string | { languageCode?: string | null; languageTag?: string | null } | null | undefined)[] | null;
};

/**
 * Apply the precedence. This is the only function allowed to decide a locale.
 *
 * Note what it does *not* do: it never consults React state, the document, or
 * its own previous return value. Given the same inputs it returns the same
 * answer on the server, in the browser, on Android and on iOS - which is what
 * makes the server-rendered language and the hydrated language the same
 * language, and therefore what removes the flash of English.
 */
export function resolveEffectiveLocale(inputs: LocaleInputs): EffectiveLocale {
  const decide = (locale: SupportedLocale, source: LocaleSource, explicit: boolean): EffectiveLocale =>
    ({ locale, direction: directionFor(locale), source, explicit });

  if (inputs.storedExplicit && isSupportedLocale(inputs.storedLocale)) {
    return decide(inputs.storedLocale, 'explicit', true);
  }
  if (isSupportedLocale(inputs.routeLocale)) {
    return decide(inputs.routeLocale, 'route', false);
  }
  if (isSupportedLocale(inputs.rememberedLocale)) {
    return decide(inputs.rememberedLocale, 'remembered', false);
  }
  const platform = localeFromPreferredList(inputs.platformLocales);
  if (platform) return decide(platform, 'platform', false);
  return decide('en', 'default', false);
}

/**
 * Reconciling the device's language with the account's.
 *
 * `profiles.preferred_language` has existed since the first migration, accepts
 * all three languages, and is granted directly to the account that owns the
 * row. It was also, until now, **write-only from one screen**: the mobile
 * profile page loaded it into a local field and saved it back, while the actual
 * language control wrote only to the device and never told the account. So a
 * person who chose Arabic on their phone and then signed in on a laptop was
 * greeted in English by a product that already knew better.
 *
 * The rule is deliberately the same shape as `precedence` in
 * `src/appearance/appearance-types.ts`, because it is the same problem:
 *
 * 1. **An explicit choice on this device wins.** It is the most recent thing
 *    the person told this device, and it is already on screen. A server round
 *    trip does not get to argue with it - it gets told about it.
 * 2. **Otherwise the account's preference is adopted**, which is what makes a
 *    new device open in the language somebody already chose elsewhere.
 * 3. **Otherwise a non-explicit local value is pushed up**, so an account that
 *    has never recorded one starts from what the device is actually using.
 * 4. Otherwise nothing is known and nothing changes.
 */
export function accountLocalePrecedence(input: {
  localLocale: SupportedLocale | null;
  localIsExplicit: boolean;
  accountLocale: SupportedLocale | null;
}): { locale: SupportedLocale | null; pushToAccount: boolean } {
  if (input.localIsExplicit && input.localLocale) {
    return {
      locale: input.localLocale,
      pushToAccount: input.accountLocale !== input.localLocale,
    };
  }
  if (input.accountLocale) return { locale: input.accountLocale, pushToAccount: false };
  if (input.localLocale) return { locale: input.localLocale, pushToAccount: true };
  return { locale: null, pushToAccount: false };
}

/**
 * The cookie carrying the language between Warsha's three web origins.
 *
 * `usewarsha.com`, `app.usewarsha.com` and `admin.usewarsha.com` are separate
 * origins on purpose, and a browser isolates `localStorage` per origin. So the
 * device store alone can never make a language chosen on the marketing site the
 * language the application opens in. A cookie scoped to the registrable domain
 * can, and this one carries exactly three possible values - `en`, `ar`, `fr` -
 * which is why widening its scope is safe in a way that widening a session
 * cookie would not be.
 */
export const localeCookieName = 'warsha-locale';

/** One year. A language preference is not a credential and does not expire with a session. */
export const localeCookieMaxAgeSeconds = 31536000;

/**
 * The cookie domain for a host.
 *
 * `null` means host-only, which is correct for `localhost` and for preview
 * deployments where there are no sibling origins to agree with.
 */
export function localeCookieDomain(host: string | null | undefined): string | null {
  if (!host) return null;
  const name = host.split(':')[0].toLowerCase();
  if (name === 'usewarsha.com' || name.endsWith('.usewarsha.com')) return '.usewarsha.com';
  return null;
}

/** The exact `document.cookie` value, built in one place. */
export function localeCookieValue(locale: SupportedLocale, host?: string | null): string {
  const domain = localeCookieDomain(host);
  return [
    `${localeCookieName}=${locale}`,
    'path=/',
    `max-age=${localeCookieMaxAgeSeconds}`,
    'samesite=lax',
    ...(domain ? [`domain=${domain}`] : []),
  ].join(';');
}

/** Read the locale cookie out of a raw `Cookie` header or `document.cookie`. */
export function localeFromCookieHeader(header: string | null | undefined): SupportedLocale | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name.trim() !== localeCookieName) continue;
    const value = rest.join('=').trim();
    if (isSupportedLocale(value)) return value;
  }
  return null;
}
