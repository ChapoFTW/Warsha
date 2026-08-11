'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge, Empty, Identifier, Waiting } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import { useStaff } from '@/components/staff-gate';
import { appCopy, type AppCopyKey } from '@/lib/app-copy';
import { parseVettingQueue, type VettingCase } from '@/lib/console-payloads';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/console-table.module.css';

/**
 * The worker vetting queue.
 *
 * `staff_worker_vetting_queue` returns cases keyed by `subjectRef` — a SHA-256
 * of the user id, not the id itself. The comment in the migration says why:
 * "A queue is not a place to browse people." A reviewer sees the state, how
 * long it has waited and whether a certificate is on file, and learns who it is
 * only by opening the case under a capability that logs the access.
 *
 * That constraint shapes this page. There is no name column because there is no
 * name, and the reference is shown short with the full value on hover rather
 * than dressed up as something it is not.
 *
 * The queue is ordered oldest-first by the server. It is not re-sorted here:
 * the order *is* the triage, and letting an operator sort by priority would
 * quietly bury the case that has waited longest.
 */

const LIMITS = [25, 50, 100, 200] as const;

export default function VerificationPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'review_worker_vetting');

  const [cases, setCases] = useState<VettingCase[] | null>(null);
  const [limit, setLimit] = useState<number>(50);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    setBusy(true);
    setRefused(false);
    const { data, error } = await supabase()
      .rpc('staff_worker_vetting_queue', { p_limit: limit });
    if (error) {
      setRefused(true);
      setCases(null);
    } else {
      setCases(parseVettingQueue(data).cases);
    }
    setBusy(false);
  }, [allowed, limit]);

  useEffect(() => { void load(); }, [load]);

  const stateLabel = (state: string): string => {
    const key = `state_${state}` as AppCopyKey;
    return (words as Record<string, string>)[key] ?? state;
  };

  return (
    <ConsoleShell title={words.verificationTitle}>
      <p className={styles.lead}>{words.verificationLead}</p>
      <p className={styles.notice}>{words.verificationPseudonymous}</p>

      <div className={styles.panel}>
        <div className={styles.filters}>
          <label className={styles.field} style={{ flex: '0 1 180px' }}>
            <span className={styles.label}>{words.colWaiting}</span>
            <select
              className={styles.select}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              disabled={!allowed || busy}
            >
              {LIMITS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>

        {!allowed ? (
          <p className={styles.error}>{words.verificationRefused}</p>
        ) : refused ? (
          <p className={styles.error} role="alert">{words.verificationRefused}</p>
        ) : cases === null ? (
          <Empty>{words.loading}</Empty>
        ) : cases.length === 0 ? (
          <Empty>{words.verificationEmpty}</Empty>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{words.colPriority}</th>
                  <th>{words.colWorkerState}</th>
                  <th>{words.colWaiting}</th>
                  <th>{words.colCertificate}</th>
                  <th>{words.colSubject}</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr key={item.subjectRef}>
                    <td>
                      <Badge tone={item.priority === 'high' ? 'strong' : 'plain'}>
                        {item.priority === 'high' ? words.priorityHigh : words.priorityNormal}
                      </Badge>
                    </td>
                    <td>{stateLabel(item.workerState)}</td>
                    <td><Waiting since={item.waitingSince} locale={locale} /></td>
                    <td>
                      <Badge tone={item.hasCertificate ? 'plain' : 'quiet'}>
                        {item.hasCertificate ? words.certificateOnFile : words.certificateMissing}
                      </Badge>
                    </td>
                    <td><Identifier value={item.subjectRef} short /></td>
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
