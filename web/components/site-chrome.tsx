import Link from 'next/link';

import { AppearanceSwitch, LanguageSwitch } from '@/components/preference-controls';
import { copy } from '@/lib/copy';
import type { Locale } from '@/lib/preferences';
import { localeHref } from '@/lib/routes';

import styles from './site-chrome.module.css';

/**
 * Public site header and footer.
 *
 * Deliberately not a tab bar. The mobile client's bottom tabs are the right
 * answer for a thumb and the wrong answer for a pointer and a 1440px viewport,
 * and reproducing them here is the clearest sign of an app stretched into a
 * browser rather than built for one.
 *
 * Every label comes from the dictionary and every href carries the locale, so
 * a reader never lands on the other language by following the site's own
 * navigation. RTL needs no mirrored stylesheet: the layout is built from
 * logical properties, so `dir="rtl"` on `<html>` reverses it.
 */

type Props = { locale: Locale };

export function SiteHeader({ locale }: Props) {
  const words = copy[locale];
  const primary = [
    { href: localeHref(locale, '/services'), label: words.navFind },
    { href: localeHref(locale, '/how-it-works'), label: words.navHow },
    { href: localeHref(locale, '/become-a-worker'), label: words.navWorker },
    { href: localeHref(locale, '/trust-and-safety'), label: words.navTrust },
    { href: localeHref(locale, '/help'), label: words.navHelp },
  ];

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={localeHref(locale)} className={styles.brand} aria-label={words.homeAria}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandName}>{words.brand}</span>
        </Link>

        <nav className={styles.nav} aria-label={words.navPrimary}>
          {primary.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <div className={styles.preferences}>
            <LanguageSwitch locale={locale} />
            <AppearanceSwitch locale={locale} />
          </div>
          <Link href={localeHref(locale, '/sign-in')} className={styles.signIn}>{words.signIn}</Link>
          <Link href={localeHref(locale, '/create-account')} className={styles.cta}>
            {words.createAccount}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ locale }: Props) {
  const words = copy[locale];
  const groups = [
    {
      heading: words.footerWarsha,
      links: [
        { href: localeHref(locale, '/about'), label: words.footerAbout },
        { href: localeHref(locale, '/how-it-works'), label: words.footerHowItWorks },
        { href: localeHref(locale, '/contact'), label: words.footerContact },
      ],
    },
    {
      heading: words.footerServices,
      links: [
        { href: localeHref(locale, '/services'), label: words.footerAllServices },
        { href: localeHref(locale, '/categories'), label: words.footerCategories },
        { href: localeHref(locale, '/become-a-worker'), label: words.footerBecomeWorker },
      ],
    },
    {
      heading: words.footerLegal,
      links: [
        { href: localeHref(locale, '/legal'), label: words.footerLegalCentre },
        { href: localeHref(locale, '/legal/privacy-policy'), label: words.footerPrivacy },
        { href: localeHref(locale, '/legal/customer-terms'), label: words.footerTerms },
        { href: localeHref(locale, '/legal/location-data-policy'), label: words.footerLocation },
      ],
    },
  ];

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <span className={styles.brandName}>{words.brand}</span>
          <p className={styles.footerBlurb}>{words.footerBlurb}</p>
        </div>

        {groups.map((group) => (
          <nav key={group.heading} aria-label={group.heading} className={styles.footerGroup}>
            <h2 className={styles.footerHeading}>{group.heading}</h2>
            {group.links.map((link) => (
              <Link key={link.href} href={link.href} className={styles.footerLink}>
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <div className={styles.footerBase}>
        <p>© {new Date().getFullYear()} {words.brand}</p>
      </div>
    </footer>
  );
}
