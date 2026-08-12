import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { localeHref } from '@/lib/routes';
import { signupLegalDocuments } from '@/lib/warsha';

import styles from './page.module.css';

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: copy[locale].createTitle,
    description: copy[locale].createLead,
    alternates: {
      canonical: localeHref(locale, '/create-account'),
      languages: { en: '/en/create-account', ar: '/ar/create-account' },
    },
  };
}

/**
 * Role selection, and the required reading that goes with it.
 *
 * The two audiences accept different documents, and the difference is shown
 * before anybody starts typing rather than discovered at the end of a form.
 * The lists come from `acceptanceRequiredFor` — the same function the mobile
 * signup screen uses to build the manifest it sends — so this page cannot
 * drift from what is actually required.
 */
export default async function CreateAccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;
  const words = copy[typed];

  const required = (documents: ReturnType<typeof signupLegalDocuments>) => (
    <ul className={styles.required}>
      {documents.map((document) => (
        <li key={document.key}>
          <Link
            href={localeHref(typed, `/legal/${document.key.replace(/_/g, '-')}`)}
            className={styles.requiredLink}
          >
            {document[typed].title}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <SiteHeader locale={typed} />
      <main id="main" className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{words.createEyebrow}</p>
          <h1 className={styles.title}>{words.createTitle}</h1>
          <p className={styles.lead}>{words.createLead}</p>
          {/* The closed-testing disclosure lives here rather than in the homepage
              hero. It is a real disclosure — accounts created now are real
              accounts on the live service — and it belongs at the point where
              somebody is about to create one, not in the marketing headline. */}
          <p className={styles.notice}>{words.heroNote}</p>
        </header>

        <div className={styles.choices}>
          <div className={styles.choice}>
            <h2 className={styles.choiceTitle}>{words.signInCustomer}</h2>
            <p className={styles.choiceBody}>{words.createCustomerBody}</p>
            <h3 className={styles.requiredHeading}>{words.createRequiredHeading}</h3>
            {required(signupLegalDocuments('customer'))}
            <span className={styles.pending}>{words.createCustomerPending}</span>
          </div>

          <div className={styles.choice}>
            <h2 className={styles.choiceTitle}>{words.signInWorker}</h2>
            <p className={styles.choiceBody}>{words.createWorkerBody}</p>
            <h3 className={styles.requiredHeading}>{words.createRequiredHeading}</h3>
            {required(signupLegalDocuments('worker'))}
            <span className={styles.pending}>{words.createWorkerPending}</span>
          </div>
        </div>

        <p className={styles.footNote}>
          {words.createFootNote}{' '}
          <Link href={localeHref(typed, '/sign-in')} className={styles.link}>{words.signIn}</Link>.
        </p>
      </main>
      <SiteFooter locale={typed} />
    </>
  );
}
