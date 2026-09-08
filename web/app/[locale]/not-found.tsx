import Link from 'next/link';
import { headers } from 'next/headers';

import { copy } from '@/lib/copy';
import { directionOf, isLocale, LOCALE_HEADER, type Locale } from '@/lib/preferences';
import { localeHref } from '@/lib/routes';

import styles from '@/components/product-surface.module.css';

/**
 * What a person sees when a Warsha address does not exist.
 *
 * Until this file existed there was no such page, so Next.js served its own
 * built-in default: an `<html>` element carrying no `lang` and no `dir`, the
 * title "404: This page could not be found." in English, no Warsha anywhere on
 * it, and no link back to anything.
 *
 * That is wrong in every language and worse in Arabic. An Arabic reader
 * following a stale link landed on a left-to-right English page, which is the
 * exact failure `[locale]/layout.tsx` goes to some trouble to prevent
 * everywhere else, where `lang` and `dir` are baked into the server-rendered
 * markup so nobody sees a frame of the wrong language. The web visual gate
 * measured it on both public hosts, at every viewport, in light and dark: ten
 * blocking findings, all of them this one missing file.
 *
 * Three things here are decided by how Next renders a 404 rather than by
 * preference, and each was established by testing rather than assumption:
 *
 * 1. It is a SERVER component. As a client component it silently did not
 *    render at all and Next fell back to its own default page: no error, no
 *    warning, just the bug still present. That is worth knowing before
 *    somebody reaches for a hook here.
 *
 * 2. The language comes from a request header, not from route params, because
 *    a not-found boundary is given none. The middleware sets it from the
 *    address on every locale-prefixed request.
 *
 * 3. `lang` and `dir` are applied by the script below rather than written on
 *    `<html>`, because on this path Next supplies its own root `<html>` and
 *    discards the one `[locale]/layout.tsx` renders. Warsha has no root
 *    layout - `[locale]`, `app` and `admin` each render their own - so there
 *    is no element above this one to put them on. The script runs before
 *    paint, which is the same technique, for the same reason, that the layout
 *    already uses for the appearance preference.
 *
 * The wrapper carries `lang` and `dir` as well, so the page is still correct
 * with no JavaScript: assistive technology reads them from the nearest
 * ancestor, and the layout is built from logical properties, so `dir` on a
 * container mirrors it exactly as `dir` on `<html>` would.
 *
 * The shape follows `RouteErrorView` rather than the marketing chrome: someone
 * at a dead end gets the same panel Warsha uses for any other failure, and a
 * way out. Two ways out, because "this page is gone" and "I cannot find what I
 * came for" are different problems and the homepage only solves the first.
 */
export default async function LocaleNotFound() {
  const requested = (await headers()).get(LOCALE_HEADER);
  // Falls back to English rather than throwing: a 404 is already a failure,
  // and failing to render one is a worse failure than rendering it in the
  // wrong language.
  const locale: Locale = isLocale(requested) ? requested : 'en';
  const dir = directionOf(locale);
  const words = copy[locale];

  const applyDocumentLanguage = `document.documentElement.lang=${JSON.stringify(locale)};`
    + `document.documentElement.dir=${JSON.stringify(dir)};`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: applyDocumentLanguage }} />
      <main id="main" lang={locale} dir={dir} className={styles.panel}>
        <h1 className={styles.title}>{words.notFoundTitle}</h1>
        <p className={styles.lead}>{words.notFoundBody}</p>
        <div className={styles.actions}>
          <Link className={styles.action} href={localeHref(locale, '')}>
            {words.notFoundHome}
          </Link>
          <Link className={styles.action} href={localeHref(locale, '/services')}>
            {words.notFoundServices}
          </Link>
        </div>
      </main>
    </>
  );
}
