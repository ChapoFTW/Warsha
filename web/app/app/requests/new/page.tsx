'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';

import { AppShell } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import {
  classifyCustomerError,
  issueValid,
  newRequestKey,
  parseAddresses,
  parseCategories,
  parseServices,
  ISSUE_MAX,
  NOTES_MAX,
  SCHEDULE_KINDS,
  type Address,
  type CustomerFailure,
  type ScheduleKind,
  type Service,
  type ServiceCategory,
} from '@/lib/customer';
import {
  catalogueServiceLabel, orderedCatalogueServices,
} from '@/src/services/specific-services';
import { customerNavigation } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { WarshaIcon } from '@/components/warsha-icon';
import { categoryIconName } from '@/src/brand/warsha-icons';
import { serviceCategoryLabel } from '@/src/i18n/service-labels';

import type { Route } from 'next';
import styles from '@/components/product-surface.module.css';

/**
 * Describing a job.
 *
 * One call — `create_marketplace_request(request, idempotencyKey)` — with the
 * same argument shape the app sends. Every rule enforced below is transcribed
 * from that function, so the form refuses what the server would refuse and for
 * the same reason:
 *
 *   - the description is between 8 and 2000 characters after trimming;
 *   - notes are at most 2000;
 *   - a scheduled or flexible request needs a start time in the future, and a
 *     flexible one needs an end after the start;
 *   - the idempotency key is at least sixteen characters, which is longer than
 *     every other Warsha RPC demands.
 *
 * The key is minted once per composed request and not per press, because
 * `create_marketplace_request` takes an advisory lock on it and returns the
 * existing request rather than opening a second one. A double-click is
 * therefore free.
 *
 * `flowKind` is `get_quotes`: this form asks the marketplace. Booking a
 * specific worker is `browse_worker` and needs a provider chosen first, which
 * is a different journey starting from discovery — offering it here without one
 * would build a form that cannot submit.
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

function initialQuery(): { categoryId: string; providerId: string } {
  if (typeof window === 'undefined') return { categoryId: '', providerId: '' };
  const query = new URLSearchParams(window.location.search);
  return {
    categoryId: query.get('category') ?? '',
    providerId: query.get('provider') ?? '',
  };
}

export default function NewRequestPage() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;

  const [categories, setCategories] = useState<ServiceCategory[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [query] = useState(initialQuery);
  const [categoryId, setCategoryId] = useState(query.categoryId);
  const [targetedProviderId] = useState(query.providerId);
  const [serviceId, setServiceId] = useState('');

  // Scoped to the chosen category and ordered by the shared catalogue, so the
  // dropdown reads the same way on every platform rather than in whatever order
  // the server happened to return.
  //
  // The derivation itself is shared. It used to live here, inline, and native
  // grew the same control -- two copies of one product rule is how a fallback
  // gets fixed on one surface and not the other.
  const orderedServices = useMemo(
    () => orderedCatalogueServices(services, categoryId), [services, categoryId]);
  const [addressId, setAddressId] = useState('');
  const [issue, setIssue] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('asap');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CustomerFailure | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // One key per composed request, not per press.
  const [idempotencyKey] = useState(newRequestKey);

  const load = useCallback(async () => {
    setLoadFailed(false);
    const client = supabase();
    const [catalog, addressRows] = await Promise.all([
      client.rpc('get_marketplace_catalog_v2'),
      client.from('addresses').select('id,label,address_line,governorate,district,is_default,latitude,longitude')
        .is('deleted_at', null)
        .order('is_default', { ascending: false }),
    ]);
    if (!catalog.error) {
      setCategories(parseCategories(catalog.data));
      setServices(parseServices(catalog.data));
    }
    if (!addressRows.error) {
      const parsed = parseAddresses(addressRows.data)
        .filter((entry) => entry.latitude !== null && entry.longitude !== null);
      setAddresses(parsed);
      const preferred = parsed.find((entry) => entry.isDefault) ?? parsed[0];
      if (preferred) setAddressId((current) => current || preferred.id);
    }
    if (catalog.error || addressRows.error) setLoadFailed(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const needsStart = scheduleKind === 'scheduled' || scheduleKind === 'flexible';
  const needsEnd = scheduleKind === 'flexible';
  const startInFuture = !needsStart || (Boolean(startAt) && new Date(startAt).getTime() > Date.now());
  const endAfterStart = !needsEnd || (Boolean(endAt) && new Date(endAt).getTime() > new Date(startAt).getTime());

  const complete = Boolean(categoryId)
    && Boolean(addressId)
    && issueValid(issue)
    && notes.length <= NOTES_MAX
    && startInFuture
    && endAfterStart;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    setFailure(null);
    const { data, error } = await supabase().rpc('create_marketplace_request', {
      p_request: {
        flowKind: targetedProviderId ? 'browse_worker' : 'get_quotes',
        categoryId,
        ...(serviceId ? { serviceId } : {}),
        ...(targetedProviderId ? { targetedProviderId } : {}),
        // Empty strings are dropped rather than sent: the function casts these
        // with `nullif(..., '')::uuid`, and an absent key is the clearer signal.
        ...(addressId ? { addressId } : {}),
        issueDescription: issue.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        scheduleKind,
        paymentCompatibility: 'either',
        ...(needsStart && startAt ? { requestedStartAt: new Date(startAt).toISOString() } : {}),
        ...(needsEnd && endAt ? { requestedEndAt: new Date(endAt).toISOString() } : {}),
      },
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      setFailure(classifyCustomerError(error.message));
      setBusy(false);
      return;
    }
    setCreatedId(typeof data === 'string' ? data : null);
    setBusy(false);
  };

  if (createdId) {
    return (
      <AppShell navigation={customerNavigation(words)} mode={words.modeCustomer}>
        <div className={styles.head}>
          <h1 className={styles.title}>{words.requestSentTitle}</h1>
        </div>
        <section className={styles.panel}>
          <p className={styles.lead}>{words.requestSentBody}</p>
          <div className={styles.actions}>
            <a className={styles.action} href={'/requests' as Route}>{words.requestsSeeAll}</a>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell navigation={customerNavigation(words)} mode={words.modeCustomer}>
      <div className={styles.head}>
        <h1 className={styles.title}>{words.requestNewTitle}</h1>
      </div>
      <p className={styles.lead}>{words.requestNewLead}</p>

      {loadFailed ? (
        <div className={styles.panel}>
          <p className={styles.error} role="alert">{words.loadFailed}</p>
          <button type="button" className={styles.secondary} onClick={() => void load()}>
            {words.retry}
          </button>
        </div>
      ) : null}

      {targetedProviderId ? (
        <p className={styles.note}>{words.requestTargetedWorker}</p>
      ) : null}

      <form className={styles.panel} onSubmit={submit}>
        <label className={styles.field}>
          {/* An <option> cannot contain an SVG, so the chosen category's mark
              sits beside the control rather than inside the list. It confirms
              the choice at a glance; it is not a second way to make one. */}
          <span className={styles.labelRow}>
            <span className={styles.label}>{words.requestCategory}</span>
            {categoryId ? (
              <span className={styles.inlineIcon}>
                <WarshaIcon name={categoryIconName(categoryId)} size="md" />
              </span>
            ) : null}
          </span>
          <select
            className={styles.select}
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
              setServiceId('');
            }}
            disabled={busy || categories === null}
          >
            <option value="">{words.requestChooseCategory}</option>
            {(categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {serviceCategoryLabel(category.translationKey, locale, category.id)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{words.requestService}</span>
          <select
            className={styles.select}
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            disabled={busy || !categoryId}
          >
            <option value="">{words.requestAnyService}</option>
            {/* Ordered by the shared catalogue, and named in the reader's own
                language. The row's English `name` is the fallback for anything
                written before keys existed -- it is what an Arabic customer was
                being shown for every service, which is the defect this fixes. */}
            {orderedServices.map((service) => (
              <option key={service.id} value={service.id}>
                {catalogueServiceLabel(service, locale)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{words.requestIssue}</span>
          <textarea
            className={styles.textarea}
            rows={5}
            maxLength={ISSUE_MAX}
            value={issue}
            onChange={(event) => setIssue(event.target.value)}
            disabled={busy}
          />
          <span className={styles.hint}>{words.requestIssueHint}</span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{words.requestNotes}</span>
          <textarea
            className={styles.textarea}
            rows={3}
            maxLength={NOTES_MAX}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={busy}
          />
          <span className={styles.hint}>{words.requestNotesHint}</span>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{words.requestAddress}</span>
          <select
            className={styles.select}
            value={addressId}
            onChange={(event) => setAddressId(event.target.value)}
            disabled={busy || addresses === null || addresses.length === 0}
          >
            <option value="">{words.requestChooseAddress}</option>
            {(addresses ?? []).map((address) => (
              <option key={address.id} value={address.id}>
                {address.label} — {address.governorate}
              </option>
            ))}
          </select>
          {/* Only the coarse area reaches a worker before a job is agreed. The
              request stores an approximate governorate and district; the exact
              address is not part of what quoting workers are shown. */}
          <span className={styles.hint}>{words.requestAddressHint}</span>
          {addresses?.length === 0 ? (
            <a className={styles.inlineLink} href={'/addresses' as Route}>
              {words.requestAddVerifiedAddress}
            </a>
          ) : null}
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{words.requestWhen}</span>
          <select
            className={styles.select}
            value={scheduleKind}
            onChange={(event) => setScheduleKind(event.target.value as ScheduleKind)}
            disabled={busy}
          >
            {SCHEDULE_KINDS.map((kind) => (
              <option key={kind} value={kind}>{words[`schedule_${kind}`] ?? kind}</option>
            ))}
          </select>
        </label>

        {needsStart ? (
          <label className={styles.field}>
            <span className={styles.label}>{words.requestStart}</span>
            <input
              className={styles.input}
              type="datetime-local"
              dir="ltr"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
              disabled={busy}
            />
            {startAt && !startInFuture ? (
              <span className={styles.hint}>{words.requestFutureTime}</span>
            ) : null}
          </label>
        ) : null}

        {needsEnd ? (
          <label className={styles.field}>
            <span className={styles.label}>{words.requestEnd}</span>
            <input
              className={styles.input}
              type="datetime-local"
              dir="ltr"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
              disabled={busy}
            />
            {endAt && !endAfterStart ? (
              <span className={styles.hint}>{words.requestEndAfterStart}</span>
            ) : null}
          </label>
        ) : null}

        {failure ? (
          <p className={styles.error} role="alert">{words[FAILURE_COPY[failure]]}</p>
        ) : null}

        <div className={styles.actions}>
          <a className={styles.secondary} href={'/requests' as Route}>{words.cancel}</a>
          <button type="submit" className={styles.action} disabled={!complete || busy}>
            {busy ? words.loading : words.requestSend}
          </button>
        </div>
      </form>
    </AppShell>
  );
}
