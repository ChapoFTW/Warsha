import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { SiteFooter, SiteHeader } from '@/components/site-chrome';
import { bodyFor, findDocument, hashesFor, legalCorpus } from '@/lib/warsha';
import type { LegalLanguage, LegalSection } from '@/lib/warsha';

import styles from './page.module.css';

/**
 * The legal reader.
 *
 * This renders the same corpus module the mobile client renders, so the text
 * on usewarsha.com and the text on the phone cannot drift. It is statically
 * generated: these documents change only when a version is published, and a
 * person deciding whether to trust Warsha should not wait on a database.
 *
 * Both languages are rendered on the page rather than behind a switch. The
 * documents are legally operative in both, and a reader who is more
 * comfortable in one should not have to discover a control to reach it.
 */

type Params = { slug: string };

function keyFromSlug(slug: string): string {
  return slug.replace(/-/g, '_');
}

export function generateStaticParams(): Params[] {
  return legalCorpus.map((document) => ({ slug: document.key.replace(/_/g, '-') }));
}

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { slug } = await params;
  const document = findDocument(keyFromSlug(slug));
  if (!document) return { title: 'Document not found' };

  const path = `/legal/${slug}`;
  return {
    title: document.en.title,
    description: `${document.en.title} — Warsha, version ${document.version}.`,
    alternates: { canonical: path },
    openGraph: { title: `${document.en.title} · Warsha`, url: path, type: 'article' },
  };
}

function Sections({ sections, language }: {
  sections: readonly LegalSection[];
  language: LegalLanguage;
}) {
  return (
    <>
      {sections.map((section, index) => (
        <section key={`${language}-${index}`} className={styles.section}>
          {section.heading ? <h3 className={styles.heading}>{section.heading}</h3> : null}
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
  const { slug } = await params;
  const document = findDocument(keyFromSlug(slug));
  if (!document) notFound();

  const english = bodyFor(document, 'en');
  const arabic = bodyFor(document, 'ar');
  const hashes = hashesFor(document);

  return (
    <>
      <SiteHeader />

      <main id="main" className={styles.page}>
        <article className={styles.document}>
          <header className={styles.documentHeader}>
            <h1 className={styles.title}>{english.title}</h1>
            <p className={styles.meta}>
              Version {document.version}
              {document.effectiveAt ? ` · effective ${document.effectiveAt}` : ''}
              {document.requiresAcceptance ? ' · acceptance required' : ''}
            </p>
          </header>

          <div className={styles.body} lang="en" dir="ltr">
            <Sections sections={english.sections} language="en" />
          </div>

          <hr className={styles.divider} />

          <div className={styles.body} lang="ar" dir="rtl">
            <h2 className={styles.title}>{arabic.title}</h2>
            <Sections sections={arabic.sections} language="ar" />
          </div>

          {/* The hash is what an acceptance actually records. Publishing it
              lets anybody check that the text they were shown is the text
              their acceptance refers to. */}
          <footer className={styles.fingerprint}>
            <h2 className={styles.fingerprintHeading}>Document fingerprint</h2>
            <p className={styles.fingerprintNote}>
              Warsha records the exact version and the hash of the text shown when an
              agreement is accepted. These are the hashes for version {document.version}.
            </p>
            <dl className={styles.hashes}>
              <div><dt>English</dt><dd><code>{hashes.en}</code></dd></div>
              <div><dt>العربية</dt><dd><code>{hashes.ar}</code></dd></div>
            </dl>
          </footer>
        </article>
      </main>

      <SiteFooter />
    </>
  );
}
