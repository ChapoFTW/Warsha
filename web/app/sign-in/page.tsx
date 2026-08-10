import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '@/components/page-shell';

import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Warsha as a customer or as a professional.',
  alternates: { canonical: '/sign-in' },
  robots: { index: false, follow: true },
};

/**
 * The audience chooser.
 *
 * Customers hold an email identity and workers hold a phone identity, and that
 * difference is an implementation detail of how Warsha stores credentials —
 * not something a person should have to know before they can sign in. Asking
 * "which are you" is a question anybody can answer; asking them to guess which
 * identifier their account uses is not.
 *
 * The synthetic address behind a worker account is never shown, here or
 * anywhere else on the web.
 */
export default function SignInPage() {
  return (
    <PageShell
      eyebrow="Welcome back"
      title="Sign in to Warsha"
      lead="Choose how you use Warsha. Your account works the same on the web and in the app."
    >
      <div className={styles.choices}>
        <div className={styles.choice}>
          <h2 className={styles.choiceTitle}>I need work done</h2>
          <p className={styles.choiceBody}>
            Sign in with the email address and password you registered with.
          </p>
          <span className={styles.pending}>Customer sign-in — coming to the web</span>
        </div>

        <div className={styles.choice}>
          <h2 className={styles.choiceTitle}>I do the work</h2>
          <p className={styles.choiceBody}>
            Sign in with the phone number and password you registered with. No email is
            involved.
          </p>
          <span className={styles.pending}>Professional sign-in — coming to the web</span>
        </div>
      </div>

      <p className={styles.footNote}>
        Do not have an account yet? <Link href="/create-account" className={styles.link}>Create one</Link>.
        Accounts created in the Warsha app work here, and accounts created here work in the app.
      </p>
    </PageShell>
  );
}
