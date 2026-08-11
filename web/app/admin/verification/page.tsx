'use client';

import { useEffect, useState } from 'react';

import { ConsoleShell } from '@/components/console-shell';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/console-table.module.css';

/**
 * The worker verification queue.
 *
 * `staff_worker_vetting_queue` requires `review_worker_vetting` and returns
 * only what a reviewer may see. This page reads it; it does not decide
 * anything. Decisions go through `staff_worker_vetting_decision`, which
 * records the actor and the reason — see the honest note in the report about
 * what is and is not wired here yet.
 */
type QueueRow = Record<string, unknown>;

export default function VerificationPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'review_worker_vetting');

  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void (async () => {
      const { data, error } = await supabase().rpc('staff_worker_vetting_queue', { p_limit: 50 });
      if (!active) return;
      if (error) { setFailed(true); return; }
      const payload = data as { queue?: QueueRow[] } | QueueRow[] | null;
      setRows(Array.isArray(payload) ? payload : payload?.queue ?? []);
    })();
    return () => { active = false; };
  }, [allowed]);

  return (
    <ConsoleShell title={words.verificationTitle}>
      <p className={styles.lead}>{words.verificationLead}</p>

      <div className={styles.panel}>
        {!allowed ? (
          <p className={styles.error}>{words.usersRefused}</p>
        ) : failed ? (
          <p className={styles.error}>{words.loadFailed}</p>
        ) : rows === null ? (
          <p className={styles.muted}>{words.loading}</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>{words.verificationEmpty}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead><tr><th>{words.resultLabel}</th></tr></thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td className={styles.mono}>{JSON.stringify(row).slice(0, 260)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
