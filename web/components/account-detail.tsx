'use client';

import { useCallback, useEffect, useState } from 'react';

import { Badge, Identifier, Timestamp } from '@/components/console-bits';
import { appCopy } from '@/lib/app-copy';
import {
  classifyOverviewError,
  parseCustomerOverview,
  parseWorkerOverview,
  type AccountOverview,
  type OverviewFailure,
} from '@/lib/console-accounts';
import type { Locale } from '@/lib/preferences';
import type { StaffSession } from '@/lib/staff';
import { supabase } from '@/lib/supabase';
import { formatMinor } from '@/src/payments/money';

import styles from './account-detail.module.css';
import table from './console-table.module.css';

/**
 * One account or one worker, opened from a lookup result.
 *
 * **It has no URL of its own, on purpose.** A linkable `/users/<uuid>` is the
 * first step towards a directory, and `staff_safe_search` was written so that
 * browsing accounts is impossible — exact identifiers only, wildcards refused,
 * every query logged. A detail panel that opens in place preserves that; a
 * route would quietly undo it.
 *
 * **It is fetched on demand and never prefetched.** Both overview RPCs call
 * `private.staff_log_access` before returning, so opening one *is* an
 * auditable act. Loading overviews eagerly to make the console feel responsive
 * would write access records for people no operator ever looked at.
 *
 * **Withheld is not the same as empty.** Contact details need
 * `view_contact_details` and money needs `view_financial_ledger`; when either
 * is absent the server says so in `contactVisible` / `financialVisible`. This
 * panel renders that as a sentence rather than as an empty field, because an
 * investigator who reads a blank phone number as "no phone on file" has been
 * misled by the interface.
 *
 * Everything shown is server-computed. Nothing here decides whether an account
 * is restricted, verified or in good standing.
 */

export function AccountDetail({
  kind,
  id,
  locale,
  session,
  onClose,
  onOpenAudit,
  renderActions,
}: {
  kind: 'customer' | 'worker';
  id: string;
  locale: Locale;
  session: StaffSession;
  onClose: () => void;
  /** Hand the subject id to the audit explorer. */
  onOpenAudit?: (subjectId: string) => void;
  /** Governed actions are injected by the page, so this stays a reader. */
  renderActions?: (overview: AccountOverview, reload: () => Promise<void>) => React.ReactNode;
}) {
  const words = appCopy[locale] as Record<string, string>;
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [failure, setFailure] = useState<OverviewFailure | null>(null);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setFailure(null);
    const client = supabase();
    const { data, error } = kind === 'customer'
      ? await client.rpc('get_staff_customer_overview', { p_user_id: id })
      : await client.rpc('get_staff_worker_overview', { p_provider_id: id });
    if (error) {
      setFailure(classifyOverviewError(error.message));
      setOverview(null);
      setBusy(false);
      return;
    }
    const parsed = kind === 'customer' ? parseCustomerOverview(data) : parseWorkerOverview(data);
    if (!parsed) setFailure('failed');
    setOverview(parsed);
    setBusy(false);
  }, [kind, id]);

  useEffect(() => { void load(); }, [load]);

  const label = (key: string, fallback: string) => words[key] ?? fallback;

  if (busy) {
    return (
      <section className={styles.detail}>
        <p className={table.muted}>{words.loading}</p>
      </section>
    );
  }

  if (failure || !overview) {
    return (
      <section className={styles.detail}>
        <div className={styles.head}>
          <p className={table.error} role="alert">
            {failure === 'refused' ? words.detailRefused
              : failure === 'not_found' ? words.detailNotFound
                : words.detailFailed}
          </p>
          <button type="button" className={styles.close} onClick={onClose}>{words.close}</button>
        </div>
      </section>
    );
  }

  const subjectId = overview.kind === 'customer' ? overview.userId : (overview.userId ?? overview.providerId);

  return (
    <section className={styles.detail} aria-label={overview.displayName ?? subjectId}>
      <div className={styles.head}>
        <h2 className={styles.name}>{overview.displayName ?? words.detailNoName}</h2>
        <button type="button" className={styles.close} onClick={onClose}>{words.close}</button>
      </div>

      <div className={styles.subject}>
        <Badge>{overview.kind === 'customer' ? words.detailCustomer : words.detailWorker}</Badge>
        <Badge tone={overview.accountStatus === 'active' ? 'quiet' : 'strong'}>
          {label(`accountStatus_${overview.accountStatus}`, overview.accountStatus)}
        </Badge>
        <Badge tone={overview.trustLevel === 'good_standing' ? 'quiet' : 'strong'}>
          {label(`trust_${overview.trustLevel}`, overview.trustLevel)}
        </Badge>
        <Identifier value={overview.kind === 'customer' ? overview.userId : overview.providerId} />
      </div>

      {overview.kind === 'customer'
        ? <CustomerBody overview={overview} words={words} locale={locale} session={session} />
        : <WorkerBody overview={overview} words={words} locale={locale} session={session} />}

      {/* Governed actions belong to the page that knows the operator's
          capabilities and can run the reauthentication dialogue. */}
      {renderActions ? renderActions(overview, load) : null}

      {onOpenAudit ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.close}
            onClick={() => onOpenAudit(subjectId)}
          >
            {words.detailOpenAudit}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{children}</span>
    </div>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.counter}>
      <span className={styles.counterValue}>{value}</span>
      <span className={styles.counterLabel}>{label}</span>
    </div>
  );
}

function Restrictions({
  restrictions,
  words,
}: {
  restrictions: { marketplaceRemoved: boolean; communicationRestricted: boolean;
    reviewRestricted: boolean; paymentHold: boolean };
  words: Record<string, string>;
}) {
  const active = ([
    ['marketplaceRemoved', restrictions.marketplaceRemoved],
    ['communicationRestricted', restrictions.communicationRestricted],
    ['reviewRestricted', restrictions.reviewRestricted],
    ['paymentHold', restrictions.paymentHold],
  ] as const).filter(([, on]) => on);

  if (active.length === 0) return <p className={table.muted}>{words.detailNoRestrictions}</p>;

  return (
    <ul className={styles.chips}>
      {active.map(([key]) => (
        <li key={key}><Badge tone="strong">{words[`restriction_${key}`] ?? key}</Badge></li>
      ))}
    </ul>
  );
}

function CustomerBody({
  overview,
  words,
  locale,
  session,
}: {
  overview: Extract<AccountOverview, { kind: 'customer' }>;
  words: Record<string, string>;
  locale: Locale;
  session: StaffSession;
}) {
  return (
    <>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailAccount}</h3>
        <div className={styles.facts}>
          <Fact label={words.detailCreated}>
            <Timestamp value={overview.createdAt} locale={locale} timeZone={session.displayTimezone} />
          </Fact>
          <Fact label={words.detailLanguage}>
            {overview.preferredLanguage === 'ar' ? words.languageArabic
              : overview.preferredLanguage === 'en' ? words.languageEnglish
                : '—'}
          </Fact>
          {/* Product access. Every account can act as a customer; the worker
              capability is a separate, server-held fact and is not implied
              here — a customer overview says nothing about it either way. */}
          <Fact label={words.detailProductAccess}>{words.detailCustomerAccess}</Fact>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailContact}</h3>
        {overview.contactVisible ? (
          <div className={styles.facts}>
            <Fact label={words.detailEmail}>
              <Identifier value={overview.contact.email ?? null} />
            </Fact>
            <Fact label={words.detailPhone}>
              <Identifier value={overview.contact.phone ?? null} />
            </Fact>
          </div>
        ) : (
          <p className={styles.withheld}>{words.detailContactWithheld}</p>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailEnforcement}</h3>
        <Restrictions restrictions={overview.restrictions} words={words} />
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailActivity}</h3>
        <div className={styles.counters}>
          <Counter value={overview.bookings.total} label={words.detailBookings} />
          <Counter value={overview.bookings.completed} label={words.detailCompleted} />
          <Counter value={overview.bookings.active ?? 0} label={words.detailActive} />
          <Counter value={overview.bookings.cancelled} label={words.detailCancelled} />
          <Counter value={overview.disputesOpened} label={words.detailDisputes} />
          <Counter value={overview.reportsFiled} label={words.detailReportsFiled} />
          <Counter value={overview.reportsAgainst} label={words.detailReportsAgainst} />
          <Counter value={overview.supportCases} label={words.detailSupportCases} />
        </div>
      </div>
    </>
  );
}

function WorkerBody({
  overview,
  words,
  locale,
  session,
}: {
  overview: Extract<AccountOverview, { kind: 'worker' }>;
  words: Record<string, string>;
  locale: Locale;
  session: StaffSession;
}) {
  return (
    <>
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailAccount}</h3>
        <div className={styles.facts}>
          <Fact label={words.detailTrade}>{overview.professionKey ?? '—'}</Fact>
          <Fact label={words.detailOnboarding}>
            {words[`onboarding_${overview.onboardingStatus}`] ?? overview.onboardingStatus ?? '—'}
          </Fact>
          <Fact label={words.detailPublished}>
            {overview.isPublished ? words.consoleYes : words.consoleNo}
          </Fact>
          <Fact label={words.detailAvailable}>
            {overview.isAvailable ? words.consoleYes : words.consoleNo}
          </Fact>
          <Fact label={words.detailRating}>
            {overview.ratingAverage === null ? '—' : `${overview.ratingAverage} (${overview.reviewCount})`}
          </Fact>
          <Fact label={words.detailUserId}><Identifier value={overview.userId} short /></Fact>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailVerification}</h3>
        <div className={styles.facts}>
          <Fact label={words.colStatus}>
            <Badge tone={overview.isVerified ? 'quiet' : 'strong'}>
              {words[`verification_${overview.verification?.status}`]
                ?? overview.verification?.status
                ?? words.detailNotSubmitted}
            </Badge>
          </Fact>
          <Fact label={words.detailSubmitted}>
            <Timestamp value={overview.verification?.submittedAt} locale={locale}
              timeZone={session.displayTimezone} />
          </Fact>
          <Fact label={words.detailReviewed}>
            <Timestamp value={overview.verification?.reviewedAt} locale={locale}
              timeZone={session.displayTimezone} />
          </Fact>
          <Fact label={words.detailExpires}>
            <Timestamp value={overview.verification?.expiresAt} locale={locale}
              timeZone={session.displayTimezone} />
          </Fact>
        </div>

        {overview.certificates.length > 0 ? (
          <div className={table.scroll} style={{ marginTop: 12 }}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th>{words.detailCertificateType}</th>
                  <th>{words.colStatus}</th>
                  <th>{words.detailExpires}</th>
                </tr>
              </thead>
              <tbody>
                {overview.certificates.map((certificate) => (
                  <tr key={certificate.id}>
                    <td>{words[`certificate_${certificate.type}`] ?? certificate.type}</td>
                    <td><Badge tone="quiet">{certificate.status}</Badge></td>
                    <td>
                      <Timestamp value={certificate.expiresAt} locale={locale}
                        timeZone={session.displayTimezone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={table.muted} style={{ marginTop: 10 }}>{words.detailNoCertificates}</p>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailContact}</h3>
        {overview.contactVisible ? (
          <div className={styles.facts}>
            <Fact label={words.detailPhone}><Identifier value={overview.contact.phone ?? null} /></Fact>
          </div>
        ) : (
          <p className={styles.withheld}>{words.detailContactWithheld}</p>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailEarnings}</h3>
        {overview.financial ? (
          <div className={styles.facts}>
            {/* Minor units, formatted by the shared money module. The strings
                are never parsed into numbers on the way here. */}
            <Fact label={words.detailAvailable2}>
              {formatMinor(overview.financial.availableMinor, locale)}
            </Fact>
            <Fact label={words.detailPending}>
              {formatMinor(overview.financial.pendingMinor, locale)}
            </Fact>
            <Fact label={words.detailHeld}>
              {formatMinor(overview.financial.heldMinor, locale)}
            </Fact>
            <Fact label={words.detailPaidOut}>
              {formatMinor(overview.financial.paidOutMinor, locale)}
            </Fact>
            <Fact label={words.detailOpenWithdrawals}>{overview.financial.openWithdrawals}</Fact>
            <Fact label={words.detailActiveHolds}>{overview.financial.activeHolds}</Fact>
          </div>
        ) : (
          <p className={styles.withheld}>{words.detailFinancialWithheld}</p>
        )}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{words.detailActivity}</h3>
        <div className={styles.counters}>
          <Counter value={overview.bookings.total} label={words.detailBookings} />
          <Counter value={overview.bookings.completed} label={words.detailCompleted} />
          <Counter value={overview.bookings.cancelled} label={words.detailCancelled} />
          <Counter value={overview.completedJobs} label={words.detailCompletedJobs} />
          <Counter value={overview.reportsAgainst} label={words.detailReportsAgainst} />
        </div>
      </div>
    </>
  );
}
