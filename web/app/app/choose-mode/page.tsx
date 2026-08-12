'use client';

import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import { BrandLockup } from '@/components/brand-mark';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { useAppLocale } from '@/lib/use-app-locale';
import type { ProductMode } from '@/lib/account';

import styles from './page.module.css';

/**
 * The dual-role chooser — shown **after** authentication, never before.
 *
 * Only an account the server says is genuinely dual-capable reaches this page.
 * Asking before sign-in was the
 * old mistake: it required somebody to classify an account Warsha had already
 * classified, and rejected them when they guessed differently from the record.
 *
 * The choice lasts for this browser session. A fresh launch returns an active
 * worker to the canonical worker home, matching the mobile experience policy.
 */
export default function ChooseModePage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { chooseMode } = useSession();
  const router = useRouter();

  const pick = (mode: ProductMode) => {
    chooseMode(mode);
    router.replace((mode === 'worker' ? '/worker' : '/') as Route);
  };

  return (
    <div className={styles.page}>
      <main id="main" className={styles.panel}>
        <BrandLockup locale={locale} size={30} />
        <h1 className={styles.title}>{words.chooseModeTitle}</h1>
        <p className={styles.lead}>{words.chooseModeLead}</p>

        <div className={styles.choices}>
          <button type="button" className={styles.choice} onClick={() => pick('customer')}>
            <span className={styles.choiceTitle}>{words.chooseCustomer}</span>
            <span className={styles.choiceBody}>{words.chooseCustomerBody}</span>
          </button>

          <button type="button" className={styles.choice} onClick={() => pick('worker')}>
            <span className={styles.choiceTitle}>{words.chooseWorker}</span>
            <span className={styles.choiceBody}>{words.chooseWorkerBody}</span>
          </button>
        </div>
      </main>
    </div>
  );
}
