'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { LifecycleBadge } from '@/components/lifecycle-badge';
import { appCopy } from '@/lib/app-copy';
import {
  classifyCustomerError,
  newRequestKey,
  parseQuotes,
  parseRequestDetail,
  QUOTE_SORTS,
  type CustomerFailure,
  type MarketplaceRequestDetail,
  type Quote,
  type QuoteSort,
  parseServices,
  type Service,
} from '@/lib/customer';
import { realtimeChannels } from '@/src/realtime/realtime-channels';
import { useWarshaRealtime } from '@/lib/use-warsha-realtime';
import { useSession } from '@/components/session-provider';
import { RequestConversationPanel } from '@/components/request-conversation';
import { customerNavigation } from '@/lib/nav';
import { intlLocale, type Locale } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { formatMinor } from '@/src/payments/money';
import {
  marketplaceRequestAcceptsQuoteActions,
  marketplaceRequestIsTerminal,
  marketplaceRequestStatusText,
  requestLifecycleSemantic,
} from '@/src/lifecycle/lifecycle-presentation';
import { requestWorkLabel } from '@/src/marketplace-intelligence/request-work-label';

import type { Route } from 'next';
import styles from '@/components/product-surface.module.css';

/**
 * The requests this account has made, and the quotes that came back.
 *
 * The list reads `marketplace_requests` through its own row-level security —
 * `customer_id = auth.uid()` — because that is the governing authority, and one
 * opened request is read through `get_customer_marketplace_request`, which
 * additionally computes the deadlines and the live quote count.
 *
 * **Choosing a quote is two steps, and that is the server's design.**
 * `select_worker_quote` records the customer's choice against an expected
 * `selectionVersion`; the selected worker later confirms it into a booking. The
 * version is optimistic concurrency: if the request moved on — a quote was
 * withdrawn, a revision landed — the selection is refused rather than applied
 * to a picture that is no longer true. So a stale refusal reloads and asks
 * again instead of retrying blindly.
 *
 * **The sort is the server's.** `get_customer_quotes` implements six orderings
 * including a weighted "best value"; the client passes the choice through and
 * renders the order it gets back.
 *
 * **Recovery actions are only shown when the server sends them**, which it does
 * for an expired request and never otherwise. Offering "try again" on a live
 * request would be inventing a control.
 */

const FAILURE_COPY: Record<CustomerFailure, string> = {
  rate_limited: 'requestRateLimited',
  unavailable: 'requestUnavailable',
  invalid: 'requestInvalid',
  future_time: 'requestFutureTime',
  stale: 'requestStale',
  expired: 'requestExpired',
  not_found: 'requestNotFound',
  failed: 'requestFailed',
};

type Row = { id: string; status: string; category_id: string; service_id: string | null; issue_description: string; created_at: string };

export default function RequestsPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;

  const userId = useSession().session?.user.id ?? null;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const client = supabase();
    const [{ data, error }, { data: catalogData, error: catalogError }] = await Promise.all([
      client.from('marketplace_requests')
        .select('id,status,category_id,service_id,issue_description,created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      client.rpc('get_marketplace_catalog_v2'),
    ]);
    if (error || catalogError) { setFailed(true); return; }
    setRows((data ?? []) as Row[]);
    setServices(parseServices(catalogData));
  }, []);

  useEffect(() => { void load(); }, [load]);

  /* The list of a customer's own requests, and any quote on any of them. A
     worker submitting a quote changes the count this page shows without the
     customer doing anything. */
  useWarshaRealtime(
    userId ? realtimeChannels.customerMarketplaceRequests(userId) : null,
    () => { void load(); },
  );

  return (
    <AppShell navigation={customerNavigation(words)} mode={words.modeCustomer}>
      <div className={styles.head}>
        <h1 className={styles.title}>{words.requestsTitle}</h1>
        <Link className={styles.action} href={'/requests/new' as Route}>{words.requestsNew}</Link>
      </div>
      <p className={styles.lead}>{words.requestsLead}</p>

      {openId ? (
        <RequestDetail
          key={openId}
          requestId={openId}
          words={words}
          locale={locale}
          services={services}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      ) : null}

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{words.requestsYours}</h2>
        {failed ? (
          <>
            <p className={styles.error} role="alert">{words.loadFailed}</p>
            <button type="button" className={styles.secondary} onClick={() => void load()}>
              {words.retry}
            </button>
          </>
        ) : rows === null ? (
          <p className={styles.muted}>{words.loading}</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>{words.requestsNone}</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((row) => (
              <li key={row.id} className={styles.row}>
                <button type="button" className={styles.rowTitle} onClick={() => setOpenId(row.id)}>
                  {row.issue_description.slice(0, 90)}
                </button>
                <div className={styles.rowMeta}>
                  <LifecycleBadge
                    label={marketplaceRequestStatusText(locale, row.status)}
                    semantic={requestLifecycleSemantic(row.status)}
                  />
                  <span className={`${styles.badge} ${styles.workLabel}`}>
                    {requestWorkLabel(
                      { categoryId: row.category_id, serviceId: row.service_id }, services, locale)}
                  </span>
                  <time className={styles.when} dateTime={row.created_at}>
                    {formatDate(row.created_at, locale)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function RequestDetail({
  requestId,
  words,
  locale,
  services,
  onClose,
  onChanged,
}: {
  requestId: string;
  words: Record<string, string>;
  locale: Locale;
  services: Service[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [request, setRequest] = useState<MarketplaceRequestDetail | null>(null);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [sort, setSort] = useState<QuoteSort>('best_value');
  const detailUserId = useSession().session?.user.id ?? null;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CustomerFailure | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const client = supabase();
    const [detail, quoteList] = await Promise.all([
      client.rpc('get_customer_marketplace_request', { p_request_id: requestId }),
      client.rpc('get_customer_quotes', { p_request_id: requestId, p_sort: sort }),
    ]);
    const parsed = detail.error ? null : parseRequestDetail(detail.data);
    setRequest(parsed);
    setQuotes(quoteList.error ? null : parseQuotes(quoteList.data));
    if (!parsed || quoteList.error) setLoadFailed(true);
  }, [requestId, sort]);

  useEffect(() => { void load(); }, [load]);

  /* An open request re-reads itself, its quotes and its deadlines whenever any
     of them move. This is the case the review named: the customer has the page
     open, a worker submits a quote, and the quote appears. */
  useWarshaRealtime(
    detailUserId ? realtimeChannels.customerMarketplaceRequests(detailUserId) : null,
    () => { void load(); },
  );

  /**
   * Choose and wait for the worker to confirm.
   *
   * The selection version is sent with the choice so a request that moved on
   * refuses rather than applying a decision to a stale picture. A refusal for
   * that reason reloads: the right response is to look again, not to retry.
   * `confirm_selected_quote` is intentionally not called here; that authority
   * resolves the caller's provider profile and is the selected worker's step.
   */
  const choose = async (quote: Quote) => {
    if (!request || busy) return;
    setBusy(true);
    setFailure(null);
    const client = supabase();
    const selection = await client.rpc('select_worker_quote', {
      p_request_id: request.id,
      p_quote_id: quote.id,
      p_expected_selection_version: request.selectionVersion,
      p_idempotency_key: newRequestKey(),
    });
    if (selection.error) {
      const kind = classifyCustomerError(selection.error.message);
      setFailure(kind);
      if (kind === 'stale') await load();
      setBusy(false);
      return;
    }
    await load();
    await onChanged();
    setBusy(false);
  };

  const cancel = async () => {
    if (!request || busy) return;
    setBusy(true);
    setFailure(null);
    const { error } = await supabase().rpc('cancel_marketplace_request', {
      p_request_id: request.id,
      p_reason: 'customer_cancelled',
      p_idempotency_key: newRequestKey(),
    });
    if (error) setFailure(classifyCustomerError(error.message));
    await load();
    await onChanged();
    setBusy(false);
  };

  if (loadFailed) {
    return (
      <section className={styles.panel}>
        <p className={styles.error} role="alert">{words.requestNotFound}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>{words.close}</button>
          <button type="button" className={styles.secondary} onClick={() => void load()}>{words.retry}</button>
        </div>
      </section>
    );
  }

  if (!request) {
    return (
      <section className={styles.panel}>
        <p className={styles.muted}>{words.loading}</p>
      </section>
    );
  }

  const terminal = marketplaceRequestIsTerminal(request.status);
  const activeQuoteSurface = marketplaceRequestAcceptsQuoteActions(request.status);
  const live = !terminal;
  const selectionOpen = ['collecting_quotes', 'customer_reviewing'].includes(request.status)
    && Date.now() >= Date.parse(request.collectionNotBefore ?? '')
    && Date.now() < Date.parse(request.expiresAt ?? '');

  return (
    <section className={styles.panel} aria-label={request.issueDescription.slice(0, 60)}>
      <div className={styles.head}>
        <h2 className={styles.sectionTitle}>{words.requestDetail}</h2>
        <button type="button" className={styles.secondary} onClick={onClose}>{words.close}</button>
      </div>

      <div className={styles.rowMeta}>
        <LifecycleBadge
          label={marketplaceRequestStatusText(locale, request.status)}
          semantic={requestLifecycleSemantic(request.status)}
        />
        {/* A request stores `category_id`. The copy catalogue is not keyed by id,
            so every lookup missed and fell through to the id itself: an Arabic
            customer reading their own request list was shown
            `water-heater-repair`. Resolved through the shared authority, which
            humanizes rather than ever surfacing a slug. */}
        <span className={`${styles.badge} ${styles.workLabel}`}>
          {requestWorkLabel(request, services, locale)}
        </span>
        <span className={styles.badge}>
          {words[`schedule_${request.scheduleKind}`] ?? request.scheduleKind}
        </span>
        <span className={styles.badge}>{request.quoteCount} {words.requestQuoteCount}</span>
      </div>

      <p className={styles.factValue} style={{ marginTop: 12 }}>{request.issueDescription}</p>

      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.factLabel}>{words.requestArea}</span>
          <span className={styles.factValue}>
            {[request.area.governorate, request.area.district].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
        {!terminal ? <div className={styles.fact}>
          <span className={styles.factLabel}>{words.requestExpires}</span>
          <span className={styles.factValue}>{formatDate(request.expiresAt, locale, true)}</span>
        </div> : null}
        {!terminal && request.confirmationDeadlineAt ? (
          <div className={styles.fact}>
            <span className={styles.factLabel}>{words.requestConfirmBy}</span>
            <span className={styles.factValue}>
              {formatDate(request.confirmationDeadlineAt, locale, true)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Only ever what the server sent. It fills these for an expired request
          and for nothing else. */}
      {request.recoveryActions.length > 0 ? (
        <p className={styles.note} style={{ marginTop: 12 }}>
          {words.requestRecovery}{' '}
          {request.recoveryActions.map((action) => words[`recovery_${action}`] ?? action).join(' · ')}
        </p>
      ) : null}

      {failure ? (
        <p className={styles.error} role="alert" style={{ marginTop: 12 }}>
          {words[FAILURE_COPY[failure]]}
        </p>
      ) : null}

      {request.status === 'selection_pending_confirmation' ? (
        <p className={styles.note} role="status" style={{ marginTop: 12 }}>
          {words.quoteWaitingForWorker}
        </p>
      ) : null}

      {activeQuoteSurface ? <div className={styles.filters} style={{ marginTop: 18 }}>
        <label className={styles.field} style={{ flex: '0 1 240px', marginBottom: 0 }}>
          <span className={styles.label}>{words.requestSortBy}</span>
          <select
            className={styles.select}
            value={sort}
            onChange={(event) => setSort(event.target.value as QuoteSort)}
            disabled={busy}
          >
            {QUOTE_SORTS.map((key) => (
              <option key={key} value={key}>{words[`sort_${key}`] ?? key}</option>
            ))}
          </select>
        </label>
      </div> : quotes?.length ? (
        <h3 className={styles.sectionTitle} style={{ marginTop: 18 }}>{words.requestQuoteHistory}</h3>
      ) : null}

      {quotes === null ? (
        <p className={styles.muted}>{words.loading}</p>
      ) : quotes.length === 0 ? (
        <p className={styles.muted}>{terminal ? words.requestNoQuotesClosed : words.requestNoQuotes}</p>
      ) : (
        <ul className={styles.list}>
          {quotes.map((quote) => (
            <li
              key={quote.id}
              className={quote.id === request.selectedQuoteId
                ? `${styles.quote} ${styles.quoteChosen}`
                : styles.quote}
            >
              <div className={styles.quoteHead}>
                <span className={styles.cardName}>{quote.workerName}</span>
                <span className={styles.price}>{formatMinor(quote.priceMinor, locale)}</span>
              </div>

              <span className={styles.cardMeta}>
                {quote.workerRating !== null
                  ? `${quote.workerRating} · ${quote.workerReviewCount} ${words.discoverReviews} · `
                  : ''}
                {quote.completedJobs} {words.discoverJobsDone}
              </span>

              {quote.message ? <p className={styles.factValue}>{quote.message}</p> : null}

              <div className={styles.facts}>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{words.quoteMaterials}</span>
                  <span className={styles.factValue}>
                    {words[`materials_${quote.materialsInclusion}`] ?? quote.materialsInclusion}
                  </span>
                </div>
                <div className={styles.fact}>
                  <span className={styles.factLabel}>{words.quoteLabour}</span>
                  <span className={styles.factValue}>
                    {quote.laborIncluded ? words.consoleYes : words.consoleNo}
                  </span>
                </div>
                {quote.warrantyDays !== null ? (
                  <div className={styles.fact}>
                    <span className={styles.factLabel}>{words.quoteWarranty}</span>
                    <span className={styles.factValue}>{quote.warrantyDays} {words.quoteDays}</span>
                  </div>
                ) : null}
                {quote.etaMinutes !== null ? (
                  <div className={styles.fact}>
                    <span className={styles.factLabel}>{words.quoteEta}</span>
                    <span className={styles.factValue}>{quote.etaMinutes} {words.quoteMinutes}</span>
                  </div>
                ) : null}
              </div>

              {quote.supportedPaymentMethods.length > 0 ? (
                <ul className={styles.chips}>
                  {quote.supportedPaymentMethods.map((method) => (
                    <li key={method} className={styles.chip}>
                      {words[`payment_${method}`] ?? method}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* One conversation per quoting worker, opened on demand. The
                  customer can ask this worker about this offer before choosing,
                  and the same thread carries into the booking if they do. It is
                  collapsed by default because a request with five quotes would
                  otherwise be five open chats. */}
              <details className={styles.messageDisclosure}>
                <summary className={styles.messageSummary}>{words.messageWorker}</summary>
                <RequestConversationPanel
                  requestId={request.id}
                  providerId={quote.providerId}
                  words={words as unknown as Record<string, string>}
                />
              </details>

              {quote.id === request.selectedQuoteId ? (
                <p className={styles.note}>{words.quoteChosen}</p>
              ) : selectionOpen ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.action}
                    onClick={() => void choose(quote)}
                    disabled={busy}
                  >
                    {busy ? words.loading : words.quoteAccept}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {live ? (
        <div className={styles.actions} style={{ marginTop: 18 }}>
          <button type="button" className={styles.secondary} onClick={() => void cancel()} disabled={busy}>
            {words.requestCancel}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatDate(value: string | null, locale: Locale, withTime = false): string {
  if (!value) return '—';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '—';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(at);
}
