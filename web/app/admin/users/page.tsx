'use client';

import { useState } from 'react';

import { AccountDetail } from '@/components/account-detail';
import { Badge, Empty, Identifier, Timestamp } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import { useStaff } from '@/components/staff-gate';
import { appCopy, type AppWords } from '@/lib/app-copy';
import { overviewKindFor } from '@/lib/console-accounts';
import {
  parseSafeSearch,
  type SafeSearchKind,
  type SafeSearchResult,
} from '@/lib/console-payloads';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/console-table.module.css';

/**
 * Record lookup.
 *
 * Named for what `staff_safe_search` actually is. Reading the function settles
 * it: a query must be an exact UUID, or — only for a role holding
 * `view_contact_details` — an exact verified email or phone. Wildcards raise.
 * Short queries raise. There is no prefix match, no name search, no offset, and
 * each result is filtered again by the caller's other capabilities.
 *
 * So this page performs a *lookup*. Calling it a directory, giving it a page
 * control, or implying that browsing accounts is possible would all be lies
 * about a boundary that was put there on purpose. Downloading the user table
 * into a browser is the failure mode a console makes easy, and this one cannot.
 *
 * The `kind` filter is real: `p_kind` is a genuine parameter, validated
 * server-side against the same twelve kinds listed here.
 */

const KINDS: readonly SafeSearchKind[] = [
  'account', 'worker', 'booking', 'marketplace_request', 'dispute', 'review',
  'trust_report', 'payment', 'withdrawal', 'reconciliation_exception',
  'support_case', 'incident',
];

/** Refusals `staff_safe_search` raises, mapped to something an operator can act on. */
function refusalCopy(message: string, words: AppWords): string {
  if (/too short/i.test(message)) return words.usersTooShort;
  if (/wildcard/i.test(message)) return words.usersWildcard;
  if (/rate limit/i.test(message)) return words.usersRateLimited;
  if (/exact identifier/i.test(message)) return words.usersExactOnly;
  return words.usersRefused;
}

export default function UsersPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'safe_search');
  const mayUseContact = hasCapability(session, 'view_contact_details');

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<SafeSearchKind | ''>('');
  const [results, setResults] = useState<SafeSearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Which result is open, if any. Opening one calls an RPC that logs the
  // access, so nothing is fetched until an operator actually asks.
  const [open, setOpen] = useState<{ kind: 'customer' | 'worker'; id: string } | null>(null);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!allowed || !query.trim() || busy) return;
    setBusy(true);
    setRefusal(null);
    setOpen(null);
    const { data, error } = await supabase().rpc('staff_safe_search', {
      p_query: query.trim(),
      p_kind: kind || null,
    });
    if (error) {
      setRefusal(refusalCopy(error.message ?? '', words));
      setResults(null);
    } else {
      setResults(parseSafeSearch(data).results);
    }
    setBusy(false);
  };

  return (
    <ConsoleShell title={words.usersTitle}>
      <p className={styles.lead}>{words.usersLead}</p>
      <p className={styles.notice}>{words.usersNotDirectory}</p>

      <div className={styles.panel}>
        <form className={styles.form} onSubmit={run}>
          <label className={styles.field}>
            <span className={styles.label}>{words.usersSearchLabel}</span>
            <input
              className={styles.input}
              type="search"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={!allowed || busy}
            />
          </label>

          <label className={styles.field} style={{ flex: '0 1 200px' }}>
            <span className={styles.label}>{words.usersKindLabel}</span>
            <select
              className={styles.select}
              value={kind}
              onChange={(event) => setKind(event.target.value as SafeSearchKind | '')}
              disabled={!allowed || busy}
            >
              <option value="">{words.usersKindAll}</option>
              {KINDS.map((candidate) => (
                <option key={candidate} value={candidate}>{candidate}</option>
              ))}
            </select>
          </label>

          <button
            className={styles.submit}
            type="submit"
            disabled={!allowed || busy || !query.trim()}
          >
            {busy ? words.loading : words.usersSearchAction}
          </button>
        </form>

        {/* What this role can actually look up by, stated before they try. */}
        {allowed ? (
          <p className={styles.notice}>
            {mayUseContact ? words.usersContactHint : words.usersNoContactHint}
          </p>
        ) : null}

        {!allowed ? (
          <p className={styles.error}>{words.usersRefused}</p>
        ) : refusal ? (
          <p className={styles.error} role="alert">{refusal}</p>
        ) : results === null ? (
          <Empty>{words.usersNoQuery}</Empty>
        ) : results.length === 0 ? (
          <Empty>{words.usersNoResults}</Empty>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{words.colKind}</th>
                  <th>{words.colStatus}</th>
                  <th>{words.colCreated}</th>
                  <th>{words.colIdentifier}</th>
                  <th>{words.colOpen}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => {
                  // Only two of the twelve kinds have an overview behind them.
                  // The rest get no control rather than a control that refuses.
                  const overviewKind = overviewKindFor(row.kind);
                  return (
                    <tr key={`${row.kind}:${row.id}`}>
                      <td><Badge>{row.kind}</Badge></td>
                      <td><Badge tone="quiet">{row.status}</Badge></td>
                      <td>
                        <Timestamp
                          value={row.createdAt}
                          locale={locale}
                          timeZone={session.displayTimezone}
                        />
                      </td>
                      <td><Identifier value={row.id} /></td>
                      <td>
                        {overviewKind ? (
                          <button
                            type="button"
                            className={styles.rowLink}
                            onClick={() => setOpen({ kind: overviewKind, id: row.id })}
                          >
                            {words.colOpen}
                          </button>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {open ? (
          <AccountDetail
            key={`${open.kind}:${open.id}`}
            kind={open.kind}
            id={open.id}
            locale={locale}
            session={session}
            onClose={() => setOpen(null)}
            onOpenAudit={(subjectId) => {
              // A full navigation rather than a router push: the audit page
              // reads its subject from the address on mount, and this is the
              // one hand-off between two console pages.
              window.location.href = `/audit?entity=${encodeURIComponent(subjectId)}`;
            }}
          />
        ) : null}
      </div>
    </ConsoleShell>
  );
}
