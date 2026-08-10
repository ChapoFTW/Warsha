import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '@/components/page-shell';
import { legalCorpus } from '@/lib/warsha';

import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Legal centre',
  description:
    'Every Warsha agreement and policy, readable in full in English and Arabic before '
    + 'you create an account.',
  alternates: { canonical: '/legal' },
};

/**
 * The whole corpus, listed from the same module the mobile client reads.
 *
 * Grouped by whether acceptance is required, because that is the distinction a
 * reader actually needs: these are the documents you will be asked to agree to,
 * and those are the ones that describe how Warsha behaves.
 */
export default function LegalIndexPage() {
  const mandatory = legalCorpus.filter((document) => document.requiresAcceptance);
  const reference = legalCorpus.filter((document) => !document.requiresAcceptance);

  const list = (documents: typeof legalCorpus) => (
    <ul className={styles.list}>
      {documents.map((document) => (
        <li key={document.key}>
          <Link href={`/legal/${document.key.replace(/_/g, '-')}`} className={styles.item}>
            <span className={styles.itemTitle}>{document.en.title}</span>
            <span className={styles.itemSummary}>{document.en.summary}</span>
            <span className={styles.itemMeta}>
              Version {document.version} · {document.audience === 'all' ? 'everyone' : document.audience}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <PageShell
      title="Legal centre"
      lead="Every agreement and policy, in full, in both languages. Nothing here is behind a sign-in."
    >
      <section className={styles.group}>
        <h2 className={styles.groupHeading}>Agreements you accept</h2>
        <p className={styles.groupNote}>
          Warsha records the exact version and the hash of the text shown when you accept
          one of these. Acceptance records are append-only and are never edited.
        </p>
        {list(mandatory)}
      </section>

      <section className={styles.group}>
        <h2 className={styles.groupHeading}>Policies and registers</h2>
        <p className={styles.groupNote}>
          These describe how Warsha operates. They do not require acceptance.
        </p>
        {list(reference)}
      </section>
    </PageShell>
  );
}
