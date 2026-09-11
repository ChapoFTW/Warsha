import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { APP_SIGN_IN, localeHref } from '@/lib/routes';

import surface from '@/components/product-surface.module.css';

import styles from './page.module.css';

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: copy[locale].signInTitle,
    description: copy[locale].signInIdentityHint,
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

        {/* The task, then the action, and nothing between them.

            This page used to answer a question nobody asked. It carried a card
            headed "One sign-in for everyone" explaining that Warsha works out
            what an account can do after authentication and that nobody declares
            a role first -- a true and accurate description of how the product is
            built, in front of somebody who came here to sign in. A reader who
            did not know there were two kinds of account learnt that there were,
            and was then reassured about a problem they had not had.

            Before that it ended in "Customer sign-in -- coming to the web",
            which had stopped being true. It ends in the sign-in now. */}
        <a href={APP_SIGN_IN} className={styles.action}>
          {words.signIn}
        </a>

        {/* The mirror of `/create-account`'s foot, and deliberately identical to
            it. These two pages sit either side of the same question — do you
            have an account or not — and each ends by offering the other. Giving
            one a compact control and the other an underlined word inside a
            sentence would be two answers to one question. */}
        <div className={styles.haveAccount}>
          <span>{words.signInFootNote}</span>
          <Link href={localeHref(typed, '/create-account')} className={surface.compact}>
            {words.signInFootLink}
          </Link>
        </div>
      </main>
      <SiteFooter locale={typed} />
    </>
  );
}
