'use client';

import { BrandLockup } from '@/components/brand-mark';
import { appCopy } from '@/lib/app-copy';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './page.module.css';

/**
 * Shown when the server says the account is blocked.
 *
 * It explains the state and points at support rather than dropping somebody
 * onto a sign-in form that will succeed and bounce them straight back here.
 */
export default function AccountUnavailablePage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  return (
    <div className={styles.page}>
      <main id="main" className={styles.panel}>
        <BrandLockup locale={locale} size={28} />
        <h1 className={styles.title}>{words.accountUnavailableTitle}</h1>
        <p className={styles.lead}>{words.accountUnavailableBody}</p>
      </main>
    </div>
  );
}
