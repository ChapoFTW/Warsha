import Link from 'next/link';

import { BrandLockup } from '@/components/brand-mark';
import { PreferenceFooter } from '@/components/preference-controls';
import { SiteNav } from '@/components/site-nav';
import { copy } from '@/lib/copy';
import type { Locale } from '@/lib/preferences';
import { APP_CREATE_ACCOUNT, APP_SIGN_IN, localeHref } from '@/lib/routes';

import styles from './site-chrome.module.css';

/**
 * Public site header and footer.
 *
 * Deliberately not a tab bar. The mobile client's bottom tabs are the right
 * answer for a thumb and the wrong answer for a pointer and a 1440px viewport.
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
    { href: localeHref(locale, '/services'), label: words.navServices },
    { href: localeHref(locale, '/become-a-worker'), label: words.navWorker },
  ];

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={localeHref(locale)} className={styles.brand} aria-label={words.homeAria}>
          <BrandLockup locale={locale} />
        </Link>

        <SiteNav locale={locale} links={primary} />

        <div className={styles.actions}>
          {/* Straight into the real application. The marketing site explains
              sign-in at /sign-in but must never implement it: there is one
              identity-driven form, it lives at the application origin, and a
              second copy here would be a second authentication implementation
              that drifts from the first. */}
          <a href={APP_SIGN_IN} className={styles.signIn}>
            {words.signIn}
          </a>
          {/* The real signup, on the application origin. The public
              /create-account page stays as the explainer that links here. */}
          <a href={APP_CREATE_ACCOUNT} className={styles.cta}>
            {words.createAccount}
          </a>
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
        { href: localeHref(locale, '/trust-and-safety'), label: words.navTrust },
        { href: localeHref(locale, '/help'), label: words.navHelp },
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
          <BrandLockup locale={locale} />
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
        {/* The only place on the public site these exist. The header carries
            brand, navigation and auth actions and nothing else, so the foot of
            the page — where a reader looking for them already looks — is where
            they live. */}
        <PreferenceFooter locale={locale} mode="path" />
      </div>
    </footer>
  );
}
