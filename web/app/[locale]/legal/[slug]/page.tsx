import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { copy } from '@/lib/copy';
import { isLocale, LOCALES, otherLocale, type Locale } from '@/lib/preferences';
import { bodyFor, findDocument, hashesFor, legalCorpus } from '@/lib/warsha';
import type { LegalSection } from '@/lib/warsha';

import styles from './page.module.css';

/**
 * The legal reader.
 *
 * This renders the same corpus module the mobile client renders, so the text on
 * usewarsha.com and the text on the phone cannot drift. It is statically
 * generated in both languages: these documents change only when a version is
 * published, and somebody deciding whether to trust Warsha should not wait on
 * a database.
 *
 * The page shows the reader's own language, with the other available as a
 * link. Both remain legally operative, and the fingerprint published at the
 * bottom is what an acceptance actually records.
 */

type Params = { locale: string; slug: string };

function keyFromSlug(slug: string): string {
  return slug.replace(/-/g, '_');
}

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    legalCorpus.map((document) => ({
      locale,
      slug: document.key.replace(/_/g, '-'),
    })));
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const document = findDocument(keyFromSlug(slug));
  if (!document) return { title: 'Not found' };

  return {
    title: document[locale].title,
    description: document[locale].summary,
    alternates: {
      canonical: `/${locale}/legal/${slug}`,
      languages: { en: `/en/legal/${slug}`, ar: `/ar/legal/${slug}` },
    },
    openGraph: {
      title: `${document[locale].title} · ${locale === 'ar' ? 'ورشة' : 'Warsha'}`,
      url: `/${locale}/legal/${slug}`,
      type: 'article',
    },
  };
}

function Sections({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <>
      {sections.map((section, index) => (
        <section key={index} className={styles.section}>
          {section.heading ? <h2 className={styles.heading}>{section.heading}</h2> : null}
          {section.body.map((paragraph, paragraphIndex) => (
            <p key={paragraphIndex} className={styles.paragraph}>{paragraph}</p>
          ))}
          {section.bullets?.length ? (
            <ul className={styles.bullets}>
              {section.bullets.map((bullet, bulletIndex) => (
                <li key={bulletIndex}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </>
  );
}

export default async function LegalDocumentPage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const typed: Locale = locale;
  const document = findDocument(keyFromSlug(slug));
  if (!document) notFound();

  const words = copy[typed];
  const body = bodyFor(document, typed);
  const hashes = hashesFor(document);
  const other = otherLocale(typed);

  return (
    <>
      <SiteHeader locale={typed} />

      <main id="main" className={styles.page}>
        <article className={styles.document}>
          <header className={styles.documentHeader}>
            <h1 className={styles.title}>{body.title}</h1>
            <p className={styles.meta}>
              {words.legalVersion} {document.version}
              {document.effectiveAt ? ` · ${words.legalEffective} ${document.effectiveAt}` : ''}
              {document.requiresAcceptance ? ` · ${words.legalAcceptanceRequired}` : ''}
            </p>
            <p className={styles.summary}>{body.summary}</p>
            <a
              href={`/${other}/legal/${slug}`}
              hrefLang={other}
              lang={other}
              className={styles.otherLanguage}
            >
              {other === 'ar' ? words.languageArabic : words.languageEnglish}
            </a>
          </header>

          <div className={styles.body}>
            <Sections sections={body.sections} />
          </div>

          {/* The hash is what an acceptance records. Publishing it lets anybody
              check that the text they were shown is the text their acceptance
              refers to. */}
          <footer className={styles.fingerprint}>
            <h2 className={styles.fingerprintHeading}>{words.fingerprintHeading}</h2>
            <p className={styles.fingerprintNote}>
              {words.fingerprintNote} {document.version}.
            </p>
            <dl className={styles.hashes}>
              <div><dt>English</dt><dd><code>{hashes.en}</code></dd></div>
              <div><dt>العربية</dt><dd><code>{hashes.ar}</code></dd></div>
            </dl>
          </footer>
        </article>
      </main>

      <SiteFooter locale={typed} />
    </>
  );
}
