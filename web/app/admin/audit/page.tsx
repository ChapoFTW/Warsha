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
 * The audit view.
 *
 * `staff_audit_search` requires `view_audit_logs` and is `stable` — it reads.
 * There is deliberately no write path on this page: an audit trail a console
 * can edit is not an audit trail. The window defaults to the last seven days
 * because an unbounded query over an append-only log is a way to time out
 * rather than a way to find something.
 */
type AuditRow = Record<string, unknown>;

const DAY = 24 * 60 * 60 * 1000;

export default function AuditPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'view_audit_logs');

  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void (async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * DAY);
      const { data, error } = await supabase().rpc('staff_audit_search', {
        p_source: 'staff',
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_limit: 50,
      });
      if (!active) return;
      if (error) { setFailed(true); return; }
      const payload = data as { entries?: AuditRow[]; rows?: AuditRow[] } | AuditRow[] | null;
      setRows(Array.isArray(payload) ? payload : payload?.entries ?? payload?.rows ?? []);
    })();
    return () => { active = false; };
  }, [allowed]);

  return (
    <ConsoleShell title={words.auditTitle}>
      <p className={styles.lead}>{words.auditLead}</p>

      <div className={styles.panel}>
        {!allowed ? (
          <p className={styles.error}>{words.usersRefused}</p>
        ) : failed ? (
          <p className={styles.error}>{words.loadFailed}</p>
        ) : rows === null ? (
          <p className={styles.muted}>{words.loading}</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>{words.auditEmpty}</p>
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
