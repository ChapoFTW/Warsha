import Link from 'next/link';

import styles from './site-chrome.module.css';

/**
 * Public site header and footer.
 *
 * Deliberately not a tab bar. The mobile client's bottom tabs are the right
 * answer for a thumb and the wrong answer for a pointer and a 1440px viewport,
 * and reproducing them here is the single clearest sign of an app that was
 * stretched into a browser rather than built for one.
 */

const PRIMARY = [
  { href: '/services', label: 'Find a professional' },
  { href: '/how-it-works', label: 'How Warsha works' },
  { href: '/become-a-worker', label: 'Work with Warsha' },
  { href: '/trust-and-safety', label: 'Trust & safety' },
  { href: '/help', label: 'Help' },
] as const;

const FOOTER_GROUPS = [
  {
    heading: 'Warsha',
    links: [
      { href: '/about', label: 'About' },
      { href: '/how-it-works', label: 'How it works' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    heading: 'Services',
    links: [
      { href: '/services', label: 'All services' },
      { href: '/categories', label: 'Categories' },
      { href: '/become-a-worker', label: 'Become a worker' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/legal', label: 'Legal centre' },
      { href: '/legal/privacy-policy', label: 'Privacy Policy' },
      { href: '/legal/customer-terms', label: 'Terms of Service' },
      { href: '/legal/location-data-policy', label: 'Location Data Policy' },
    ],
  },
] as const;

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="Warsha home">
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandName}>Warsha</span>
        </Link>

        <nav className={styles.nav} aria-label="Primary">
          {PRIMARY.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <Link href="/sign-in" className={styles.signIn}>Sign in</Link>
          <Link href="/create-account" className={styles.cta}>Create account</Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <span className={styles.brandName}>Warsha</span>
          <p className={styles.footerBlurb}>
            Home repairs and maintenance in Egypt, with the price agreed before the work starts.
          </p>
        </div>

        {FOOTER_GROUPS.map((group) => (
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
        <p>© {new Date().getFullYear()} Warsha</p>
      </div>
    </footer>
  );
}
