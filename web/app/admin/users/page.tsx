'use client';

import { useState } from 'react';

import { ConsoleShell } from '@/components/console-shell';
import { useStaff } from '@/components/staff-gate';
import { appCopy } from '@/lib/app-copy';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/console-table.module.css';

/**
 * The user directory.
 *
 * Backed by `staff_safe_search`, which is where the privacy work already
 * lives: it requires the `safe_search` capability, redacts each result to what
 * the caller's role may see, and records the search itself. That is why this
 * page performs a *search* rather than listing users — there is no governed
 * "give me every account" call, and there should not be. Downloading the user
 * table into a browser is the failure mode a console makes easy.
 */
type SearchRow = Record<string, unknown>;

export default function UsersPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'safe_search');

  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setRefused(false);
    const { data, error } = await supabase().rpc('staff_safe_search', { p_query: query.trim() });
    if (error) {
      setRefused(true);
      setRows(null);
    } else {
      const payload = data as { results?: SearchRow[] } | SearchRow[] | null;
      setRows(Array.isArray(payload) ? payload : payload?.results ?? []);
    }
    setBusy(false);
  };

  return (
    <ConsoleShell title={words.usersTitle}>
      <p className={styles.lead}>{words.usersLead}</p>

      <div className={styles.panel}>
        <form className={styles.form} onSubmit={run}>
          <label className={styles.field}>
            <span className={styles.label}>{words.usersSearchLabel}</span>
            <input
              className={styles.input}
              type="search"
              dir="ltr"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={!allowed || busy}
            />
          </label>
          <button className={styles.submit} type="submit" disabled={!allowed || busy || !query.trim()}>
            {busy ? words.loading : words.usersSearchAction}
          </button>
        </form>

        {!allowed ? (
          <p className={styles.error}>{words.usersRefused}</p>
        ) : refused ? (
          <p className={styles.error}>{words.usersRefused}</p>
        ) : rows === null ? (
          <p className={styles.muted}>{words.usersNoQuery}</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>{words.usersNoResults}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{words.resultKind}</th>
                  <th>{words.resultLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td className={styles.mono}>{String(row.kind ?? row.type ?? '—')}</td>
                    <td>
                      <span className={styles.mono}>
                        {JSON.stringify(row).slice(0, 220)}
                      </span>
                    </td>
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
