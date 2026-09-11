import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { APP_SIGN_IN, localeHref } from '@/lib/routes';

import styles from './page.module.css';

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: copy[locale].signInTitle,
    description: copy[locale].signInOneAccountBody,
    alternates: {
      canonical: localeHref(locale, '/sign-in'),
      languages: { en: '/en/sign-in', ar: '/ar/sign-in', fr: '/fr/sign-in' },
    },
    robots: { index: false, follow: true },
  };
}

/**
 * Sign-in asks for an identifier, not a category.
 *
 * The previous version of this page asked people to pick "I need work done" or
 * "I do the work" before authenticating, which is the same mistake the mobile
 * screen made: it required somebody to classify their own account before
 * Warsha would look at it, and got the classification wrong whenever they
 * guessed differently from the record.
 *
 * Whether an account can hire, work, or both is a property of the account, and
 * the only honest place to read it is after authentication, from the server.
 * The identifier's shape — an address or a number — selects the credential
 * path, which is an implementation detail nobody is asked to understand. The
 * synthetic address behind a worker account is never shown.
 */
export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;
  const words = copy[typed];

  return (
    <>
      <SiteHeader locale={typed} />
      <main id="main" className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{words.signInEyebrow}</p>
          <h1 className={styles.title}>{words.signInTitle}</h1>
          <p className={styles.lead}>{words.signInIdentityHint}</p>
        </header>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>{words.signInOneAccount}</h2>
          <p className={styles.panelBody}>{words.signInOneAccountBody}</p>
          {/* No orphan field label above the action. `signInIdentity` labelled an
              identifier box this page has never had and must never have -- there
              is one sign-in and it is on the application origin. As a caption
              over a link it read as though the button were a field. What it used
              to say, the lead above already says in a sentence. */}
          {/* The page said "Customer sign-in — coming to the web" long after it
              had arrived: app.usewarsha.com/sign-in takes an address or a phone
              number and serves customers and professionals alike. Somebody who
              searched for Warsha sign-in, landed here and believed it went away
              without an account. A page about signing in ends in the thing it is
              about. */}
          <a href={APP_SIGN_IN} className={styles.action}>
            {words.signIn}
          </a>
        </div>

        <p className={styles.footNote}>
          {words.signInFootNote}{' '}
          <Link href={localeHref(typed, '/create-account')} className={styles.link}>
            {words.signInFootLink}
          </Link>
          . {words.signInFootTail}
        </p>
      </main>
      <SiteFooter locale={typed} />
    </>
  );
}
