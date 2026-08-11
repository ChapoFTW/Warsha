import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { localeHref } from '@/lib/routes';

import styles from './page.module.css';

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: copy[locale].signInTitle,
    description: copy[locale].signInLead,
    alternates: {
      canonical: localeHref(locale, '/sign-in'),
      languages: { en: '/en/sign-in', ar: '/ar/sign-in' },
    },
    robots: { index: false, follow: true },
  };
}

/**
 * The audience chooser.
 *
 * Customers hold an email identity and workers hold a phone identity, and that
 * difference is an implementation detail of how Warsha stores credentials —
 * not something a person should have to know before signing in. "Which are
 * you" is a question anybody can answer; "which identifier does your account
 * use" is not.
 *
 * The synthetic address behind a worker account is never shown, here or
 * anywhere else on the web.
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
          <p className={styles.lead}>{words.signInLead}</p>
        </header>

        <div className={styles.choices}>
          <div className={styles.choice}>
            <h2 className={styles.choiceTitle}>{words.signInCustomer}</h2>
            <p className={styles.choiceBody}>{words.signInCustomerBody}</p>
            <span className={styles.pending}>{words.signInCustomerPending}</span>
          </div>

          <div className={styles.choice}>
            <h2 className={styles.choiceTitle}>{words.signInWorker}</h2>
            <p className={styles.choiceBody}>{words.signInWorkerBody}</p>
            <span className={styles.pending}>{words.signInWorkerPending}</span>
          </div>
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
