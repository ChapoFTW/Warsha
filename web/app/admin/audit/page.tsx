'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge, Empty, Identifier, Timestamp } from '@/components/console-bits';
import { ConsoleShell } from '@/components/console-shell';
import { useStaff } from '@/components/staff-gate';
import { appCopy, type AppCopyKey } from '@/lib/app-copy';
import {
  auditDetail,
  AUDIT_MAX_RANGE_DAYS,
  AUDIT_SOURCES,
  parseAuditPayload,
  type AuditEntry,
  type AuditSource,
} from '@/lib/console-payloads';
import { hasCapability } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/console-table.module.css';

/**
 * The audit explorer.
 *
 * Read-only by construction, not by convention: there is no write path in this
 * file and there must never be one. An audit trail an operator can edit is not
 * an audit trail.
 *
 * Nine append-only sources share five fields and each adds its own. None of
 * them has an `outcome` column, and the page does not invent one — every row is
 * something that happened. What varies is the detail each source kept, which is
 * what the Detail column carries.
 *
 * The range is bounded because the database bounds it: `staff_audit_search`
 * refuses anything wider than 366 days, and defaults to the last 30. Offering
 * an unbounded query over an append-only log would only produce a refusal
 * further down.
 */

const PAGE_SIZE = 50;

function isoDaysAgo(days: number): string {
  const at = new Date(Date.now() - days * 86400_000);
  return at.toISOString().slice(0, 10);
}

export default function AuditPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const { session } = useStaff();
  const allowed = hasCapability(session, 'view_audit_logs');

  const [source, setSource] = useState<AuditSource>('staff_audit');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!allowed) return;
    const fromAt = new Date(`${from}T00:00:00Z`);
    const toAt = new Date(`${to}T23:59:59Z`);
    if (Number.isNaN(fromAt.getTime()) || Number.isNaN(toAt.getTime())) return;
    // Refuse the too-wide range here as well, so the operator is told by the
    // control they just moved rather than by a round trip.
    if (toAt.getTime() - fromAt.getTime() > AUDIT_MAX_RANGE_DAYS * 86400_000) {
      setRefusal(words.auditRangeTooWide);
      setRows(null);
      return;
    }
    setBusy(true);
    setRefusal(null);
    const { data, error } = await supabase().rpc('staff_audit_search', {
      p_source: source,
      p_from: fromAt.toISOString(),
      p_to: toAt.toISOString(),
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (error) {
      setRefusal(words.auditRefused);
      setRows(null);
    } else {
      setRows(parseAuditPayload(data).rows);
    }
    setBusy(false);
  }, [allowed, source, from, to, page, words]);

  useEffect(() => { void load(); }, [load]);

  const sourceLabel = (key: string): string => {
    const copyKey = `source_${key}` as AppCopyKey;
    return (words as Record<string, string>)[copyKey] ?? key;
  };

  // The RPC returns a page, not a total. "Is there a next page" is answered by
  // whether this one filled — which is honest, where a fabricated page count
  // would not be.
  const maybeMore = (rows?.length ?? 0) === PAGE_SIZE;
  const firstIndex = page * PAGE_SIZE + 1;

  return (
    <ConsoleShell title={words.auditTitle}>
      <p className={styles.lead}>{words.auditLead}</p>
      <p className={styles.notice}>{words.auditNoOutcome}</p>

      <div className={styles.panel}>
        <div className={styles.filters}>
          <label className={styles.field} style={{ flex: '0 1 220px' }}>
            <span className={styles.label}>{words.auditSource}</span>
            <select
              className={styles.select}
              value={source}
              onChange={(event) => { setSource(event.target.value as AuditSource); setPage(0); }}
              disabled={!allowed || busy}
            >
              {AUDIT_SOURCES.map((key) => (
                <option key={key} value={key}>{sourceLabel(key)}</option>
              ))}
            </select>
          </label>

          <label className={styles.field} style={{ flex: '0 1 170px' }}>
            <span className={styles.label}>{words.auditFrom}</span>
            <input
              className={styles.input}
              type="date"
              dir="ltr"
              value={from}
              max={to}
              onChange={(event) => { setFrom(event.target.value); setPage(0); }}
              disabled={!allowed || busy}
            />
          </label>

          <label className={styles.field} style={{ flex: '0 1 170px' }}>
            <span className={styles.label}>{words.auditTo}</span>
            <input
              className={styles.input}
              type="date"
              dir="ltr"
              value={to}
              min={from}
              onChange={(event) => { setTo(event.target.value); setPage(0); }}
              disabled={!allowed || busy}
            />
          </label>
        </div>

        {!allowed ? (
          <p className={styles.error}>{words.auditRefused}</p>
        ) : refusal ? (
          <p className={styles.error} role="alert">{refusal}</p>
        ) : rows === null ? (
          <Empty>{words.loading}</Empty>
        ) : rows.length === 0 ? (
          <Empty>{words.auditEmpty}</Empty>
        ) : (
          <>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{words.colTime}</th>
                    <th>{words.colActor}</th>
                    <th>{words.colAction}</th>
                    <th>{words.colTarget}</th>
                    <th>{words.colDetail}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const detail = auditDetail(entry);
                    return (
                      <tr key={entry.id}>
                        <td>
                          <Timestamp
                            value={entry.at}
                            locale={locale}
                            timeZone={session.displayTimezone}
                          />
                        </td>
                        <td><Identifier value={entry.actorId} short /></td>
                        <td>
                          <Badge tone={entry.breakGlass ? 'strong' : 'plain'}>
                            {entry.action}
                          </Badge>
                        </td>
                        <td>
                          {entry.entityType ? (
                            <>
                              <span className={styles.muted}>{entry.entityType}</span>
                              <br />
                              <Identifier value={entry.entityId} short />
                            </>
                          ) : (
                            <Identifier value={entry.entityId} short />
                          )}
                        </td>
                        <td>
                          {detail || <span className={styles.muted}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.pager}>
              <span className={styles.pagerPosition}>
                {words.pagerShowing
                  .replace('{from}', String(firstIndex))
                  .replace('{to}', String(firstIndex + rows.length - 1))}
              </span>
              <div className={styles.pagerButtons}>
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0 || busy}
                >
                  {words.pagerPrevious}
                </button>
                <button
                  type="button"
                  className={styles.pagerButton}
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!maybeMore || busy}
                >
                  {words.pagerNext}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </ConsoleShell>
  );
}
