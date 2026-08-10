import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '@/components/page-shell';
import { signupLegalDocuments } from '@/lib/warsha';

import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Create an account',
  description:
    'Create a Warsha account as a customer or apply as a professional. Read every '
    + 'required agreement in full first.',
  alternates: { canonical: '/create-account' },
  robots: { index: true, follow: true },
};

/**
 * Role selection, and the required reading that goes with it.
 *
 * The two audiences accept different documents, and the difference is shown
 * before anybody starts typing rather than discovered at the end of a form.
 * The lists come from `acceptanceRequiredFor` — the same function the mobile
 * signup screen uses to build the manifest it sends — so this page cannot
 * drift from what is actually required.
 */
export default function CreateAccountPage() {
  const customerDocuments = signupLegalDocuments('customer');
  const workerDocuments = signupLegalDocuments('worker');

  const required = (documents: readonly { key: string; en: { title: string } }[]) => (
    <ul className={styles.required}>
      {documents.map((document) => (
        <li key={document.key}>
          <Link
            href={`/legal/${document.key.replace(/_/g, '-')}`}
            className={styles.requiredLink}
          >
            {document.en.title}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <PageShell
      eyebrow="Create an account"
      title="How do you want to use Warsha?"
      lead="Pick the one that describes you. You can read every required agreement in full before you agree to anything."
    >
      <div className={styles.choices}>
        <div className={styles.choice}>
          <h2 className={styles.choiceTitle}>I need work done</h2>
          <p className={styles.choiceBody}>
            Describe a job, receive quotes, and agree a price before the work starts. You
            register with an email address and confirm it before signing in.
          </p>
          <h3 className={styles.requiredHeading}>You will be asked to accept</h3>
          {required(customerDocuments)}
          <span className={styles.pending}>Customer signup — coming to the web</span>
        </div>

        <div className={styles.choice}>
          <h2 className={styles.choiceTitle}>I do the work</h2>
          <p className={styles.choiceBody}>
            Register your trades, complete verification, and quote the jobs you want. You
            register with a phone number and password — no email is needed.
          </p>
          <h3 className={styles.requiredHeading}>You will be asked to accept</h3>
          {required(workerDocuments)}
          <span className={styles.pending}>Professional application — coming to the web</span>
        </div>
      </div>

      <p className={styles.footNote}>
        Applying as a professional starts a verification process. It does not make you a
        worker on Warsha, and approval is not automatic. Already have an account?{' '}
        <Link href="/sign-in" className={styles.link}>Sign in</Link>.
      </p>
    </PageShell>
  );
}
