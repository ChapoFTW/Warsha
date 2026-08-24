import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, type Locale } from '@/lib/preferences';
import { localeHref } from '@/lib/routes';
import { catalogueFor, legalCorpus } from '@/lib/warsha';

import styles from './page.module.css';

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    title: copy[locale].legalCentreTitle,
    description: copy[locale].legalCentreLead,
    alternates: {
      canonical: localeHref(locale, '/legal'),
      languages: { en: '/en/legal', ar: '/ar/legal', fr: '/fr/legal' },
    },
  };
}

/**
 * The whole corpus, listed from the same module the mobile client reads.
 *
 * Grouped by whether acceptance is required, because that is the distinction a
 * reader needs: these are the documents you will be asked to agree to, and
 * those describe how Warsha behaves.
 */
export default async function LegalIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;
  const words = copy[typed];

  const mandatory = legalCorpus.filter((document) => document.requiresAcceptance);
  const reference = legalCorpus.filter((document) => !document.requiresAcceptance);

  const list = (documents: typeof legalCorpus) => (
    <ul className={styles.list}>
      {documents.map((document) => (
        <li key={document.key}>
          <Link
            href={localeHref(typed, `/legal/${document.key.replace(/_/g, '-')}`)}
            className={styles.item}
          >
            <span className={styles.itemTitle}>{catalogueFor(document, typed).title}</span>
            <span className={styles.itemSummary}>
              {catalogueFor(document, typed).summary}
            </span>
            <span className={styles.itemMeta}>
              {words.legalVersion} {document.version} ·{' '}
              {document.audience === 'all' ? words.legalAudienceEveryone : document.audience}
            </span>
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
          <h1 className={styles.title}>{words.legalCentreTitle}</h1>
          <p className={styles.lead}>{words.legalCentreLead}</p>
        </header>

        <section className={styles.group}>
          <h2 className={styles.groupHeading}>{words.legalMandatoryHeading}</h2>
          <p className={styles.groupNote}>{words.legalMandatoryNote}</p>
          {list(mandatory)}
        </section>

        <section className={styles.group}>
          <h2 className={styles.groupHeading}>{words.legalReferenceHeading}</h2>
          <p className={styles.groupNote}>{words.legalReferenceNote}</p>
          {list(reference)}
        </section>
      </main>
      <SiteFooter locale={typed} />
    </>
  );
}
