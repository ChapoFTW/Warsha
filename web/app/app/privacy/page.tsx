'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { customerNavigation } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from '@/components/product-surface.module.css';

/**
 * The privacy centre, on the web.
 *
 * Native has had `app/privacy.tsx` and `app/privacy-delete.tsx` since WPS-022.
 * The browser had nothing at all, so a customer who signed up on the web could
 * not see what they had consented to, could not ask for their data, could not
 * clear their history, and could not deactivate or delete their account without
 * installing the application. Data rights that depend on which device somebody
 * owns are not data rights.
 *
 * Every action here calls the same RPC the native screen calls. There is no
 * web-only business logic: the server decides whether the surface is open
 * (`get_my_privacy_overview` returns `available`, `exportAvailable` and
 * `deletionAvailable`), and this renders what the server says is possible.
 * When the surface is closed, that is what the page says -- it does not offer
 * a control that would fail.
 */

type ConsentEntry = {
  purposeKey: string;
  granted: boolean;
  title?: string;
  description?: string;
};

type ExportEntry = {
  id: string;
  status: string;
  requestedAt: string;
  expiresAt: string;
};

type Overview = {
  available: boolean;
  exportAvailable: boolean;
  deletionAvailable: boolean;
  deactivated: boolean;
  deletionRequest: { status?: string } | null;
};

const EMPTY: Overview = {
  available: false,
  exportAvailable: false,
  deletionAvailable: false,
  deactivated: false,
  deletionRequest: null,
};

export default function PrivacyPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const { session } = useSession();

  const [overview, setOverview] = useState<Overview>(EMPTY);
  const [consents, setConsents] = useState<ConsentEntry[]>([]);
  const [exports, setExports] = useState<ExportEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const client = supabase();
    const [overviewResult, consentResult, exportResult] = await Promise.all([
      client.rpc('get_my_privacy_overview'),
      client.rpc('get_my_consents'),
      client.rpc('get_my_data_exports', { p_limit: 10 }),
    ]);
    if (!overviewResult.error && overviewResult.data) {
      setOverview({ ...EMPTY, ...(overviewResult.data as Overview) });
    }
    if (!consentResult.error && Array.isArray(consentResult.data)) {
      setConsents(consentResult.data as ConsentEntry[]);
    }
    if (!exportResult.error && Array.isArray(exportResult.data)) {
      setExports(exportResult.data as ExportEntry[]);
    }
    setReady(true);
  }, [session?.user.id]);

  useEffect(() => { void load(); }, [load]);

  /** Every action is the same shape: run it, say what happened, reload. */
  const act = useCallback(async (run: () => PromiseLike<{ error: unknown }>, done = '') => {
    setBusy(true);
    setNotice('');
    const { error } = await run();
    setBusy(false);
    if (error) { setNotice(words.privacyFailed); return; }
    if (done) setNotice(done);
    await load();
  }, [load, words.privacyFailed]);

  const setConsent = (purposeKey: string, granted: boolean) => act(() =>
    supabase().rpc('record_my_consent', {
      p_purpose_key: purposeKey, p_granted: granted, p_source_surface: 'privacy_center',
    }));

  const clearHistory = (scope: 'all' | 'searches' | 'views') => act(() =>
    supabase().rpc('clear_my_privacy_history', { p_scope: scope }), words.privacyHistoryCleared);

  const setDeactivated = (deactivated: boolean) => act(() =>
    supabase().rpc('set_my_account_deactivated', { p_deactivated: deactivated }));

  const requestExport = () => act(() =>
    supabase().rpc('request_my_data_export', { p_idempotency_key: null }),
  words.privacyExportPending);

  const requestDeletion = () => act(() =>
    supabase().rpc('request_account_deletion', {
      p_reason_code: 'user_request', p_idempotency_key: null,
    }));

  const cancelDeletion = () => act(() => supabase().rpc('cancel_account_deletion'));

  /**
   * A ready export is fetched through the storage policy, not through this
   * page: `claim_my_data_export` says where the file is and counts the
   * download, and the bucket only answers to the owner.
   */
  const download = useCallback(async (id: string) => {
    setBusy(true);
    setNotice('');
    const client = supabase();
    const { data, error } = await client.rpc('claim_my_data_export', { p_request_id: id });
    if (error || !data) { setBusy(false); setNotice(words.privacyFailed); return; }
    const claim = data as { bucket: string; path: string };
    const file = await client.storage.from(claim.bucket).download(claim.path);
    setBusy(false);
    if (file.error || !file.data) { setNotice(words.privacyFailed); return; }
    const href = URL.createObjectURL(file.data);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `warsha-data-export-${id}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    await load();
  }, [load, words.privacyFailed]);

  const exportStatusLabel = (status: string) => ({
    manifest_ready: words.privacyExportPreparing,
    requested: words.privacyExportPreparing,
    ready: words.privacyExportReady,
    expired: words.privacyExportExpired,
    failed: words.privacyExportFailed,
  }[status] ?? status);

  const deletionPending = Boolean(overview.deletionRequest?.status);

  return (
    <AppShell navigation={customerNavigation(words)} mode={words.modeCustomer}>
      <div className={styles.head}><h1 className={styles.title}>{words.privacyTitle}</h1></div>
      <p className={styles.lead}>{words.privacyLead}</p>

      {notice ? <p className={styles.muted} role="status">{notice}</p> : null}
      {!ready ? <p className={styles.muted}>{words.loading}</p> : null}

      {ready && !overview.available ? (
        <section className={styles.panel}>
          <p className={styles.muted}>{words.privacyUnavailable}</p>
        </section>
      ) : null}

      {ready && overview.available ? (
        <>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>{words.privacyConsentsTitle}</h2>
            <p className={styles.muted}>{words.privacyConsentsLead}</p>
            {consents.map((consent) => (
              <div key={consent.purposeKey} className={styles.row}>
                <span>{consent.title ?? consent.purposeKey}</span>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  aria-pressed={consent.granted}
                  onClick={() => setConsent(consent.purposeKey, !consent.granted)}
                >
                  {consent.granted ? words.privacyConsentOn : words.privacyConsentOff}
                </button>
              </div>
            ))}
          </section>

          {overview.exportAvailable ? (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>{words.privacyExportTitle}</h2>
              <p className={styles.muted}>{words.privacyExportLead}</p>
              <button
                type="button"
                className={styles.action}
                disabled={busy}
                onClick={requestExport}
              >
                {busy ? words.privacyBusy : words.privacyExportRequest}
              </button>
              {exports.map((entry) => (
                <div key={entry.id} className={styles.row}>
                  <span>
                    {exportStatusLabel(entry.status)}
                    {' · '}
                    {words.privacyExportAvailableFor}
                    {' '}
                    {new Date(entry.expiresAt).toLocaleDateString(locale)}
                  </span>
                  {entry.status === 'ready' ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => download(entry.id)}
                    >
                      {words.privacyExportDownload}
                    </button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>{words.privacyHistoryTitle}</h2>
            <p className={styles.muted}>{words.privacyHistoryLead}</p>
            <div className={styles.row}>
              <button type="button" className={styles.secondary} disabled={busy}
                onClick={() => clearHistory('searches')}>{words.privacyHistorySearches}</button>
              <button type="button" className={styles.secondary} disabled={busy}
                onClick={() => clearHistory('views')}>{words.privacyHistoryViews}</button>
              <button type="button" className={styles.secondary} disabled={busy}
                onClick={() => clearHistory('all')}>{words.privacyHistoryAll}</button>
            </div>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>{words.privacyAccountTitle}</h2>
            {overview.deactivated
              ? <p className={styles.muted}>{words.privacyDeactivatedNote}</p>
              : null}
            <button
              type="button"
              className={styles.secondary}
              disabled={busy}
              onClick={() => setDeactivated(!overview.deactivated)}
            >
              {overview.deactivated ? words.privacyReactivate : words.privacyDeactivate}
            </button>
          </section>

          {overview.deletionAvailable ? (
            <section className={styles.panel}>
              <h2 className={styles.sectionTitle}>{words.privacyDeleteTitle}</h2>
              <p className={styles.muted}>
                {deletionPending ? words.privacyDeletePending : words.privacyDeleteLead}
              </p>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={deletionPending ? cancelDeletion : requestDeletion}
              >
                {deletionPending ? words.privacyDeleteCancel : words.privacyDeleteAction}
              </button>
            </section>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
