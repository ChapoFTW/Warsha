'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import { parseServices, type Service } from '@/lib/customer';
import { workerNav } from '@/lib/nav';
import { intlLocale, type Locale } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import {
  egpFromMinor,
  newWorkerKey,
  parseDestinations,
  parseEarnings,
  parseWithdrawals,
  type EarningsSummary,
  type PayoutDestination,
  type Withdrawal,
} from '@/lib/worker';
import { workerCopy } from '@/lib/worker-copy';
import { cataloguedServiceReferenceLabel } from '@/src/services/specific-services';

import styles from '@/components/product-surface.module.css';

/** Owner-only earnings ledger and the existing development payout authority. */
export default function WorkerEarningsPage() {
  const locale = useAppLocale();
  const appWords = appCopy[locale] as Record<string, string>;
  const words = workerCopy[locale];
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [destinations, setDestinations] = useState<PayoutDestination[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [showDestination, setShowDestination] = useState(false);
  const [destinationType, setDestinationType] = useState<'mobile_wallet' | 'bank_account'>('mobile_wallet');
  const [destinationLabel, setDestinationLabel] = useState('');
  const [destinationValue, setDestinationValue] = useState('');
  const [ownership, setOwnership] = useState(false);
  const [destinationId, setDestinationId] = useState('');
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    setFailed(false);
    const client = supabase();
    const [earningsResult, catalogueResult] = await Promise.all([
      client.rpc('get_my_provider_earnings'),
      client.rpc('get_marketplace_catalog_v2'),
    ]);
    const { data: earningsData, error: earningsError } = earningsResult;
    const next = parseEarnings(earningsData);
    if (earningsError || catalogueResult.error || !next) {
      setFailed(true);
      return;
    }
    setSummary(next);
    setServices(parseServices(catalogueResult.data));
    if (next.withdrawalsEnabled) {
      const [{ data: destinationData, error: destinationError }, { data: withdrawalData, error: withdrawalError }] = await Promise.all([
        client.rpc('get_my_payout_destinations'),
        client.from('provider_withdrawal_requests')
          .select('id,amount_minor,currency,status,provider_reference,destination_masked_snapshot,requested_at')
          .order('requested_at', { ascending: false })
          .limit(50),
      ]);
      if (destinationError || withdrawalError) setFailed(true);
      else {
        const nextDestinations = parseDestinations(destinationData);
        setDestinations(nextDestinations);
        setDestinationId((current) => current || nextDestinations.find((item) => item.isPreferred)?.id || nextDestinations[0]?.id || '');
        setWithdrawals(parseWithdrawals(withdrawalData));
      }
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const saveDestination = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !ownership || destinationLabel.trim().length < 2 || destinationValue.replace(/\s/g, '').length < 6) return;
    setBusy(true);
    setFailed(false);
    setDone(false);
    const { error } = await supabase().rpc('save_my_payout_destination', {
      p_destination_type: destinationType,
      p_display_label: destinationLabel.trim(),
      p_destination_value: destinationValue.trim(),
      p_ownership_confirmed: true,
      p_make_preferred: true,
      p_idempotency_key: newWorkerKey('web-payout-destination'),
    });
    // The unmasked value is discarded regardless of outcome; it is never
    // rendered back or copied into application state after submission.
    setDestinationValue('');
    if (error) setFailed(true);
    else {
      setDestinationLabel('');
      setOwnership(false);
      setShowDestination(false);
      setDone(true);
      await load();
    }
    setBusy(false);
  };

  const withdraw = async (event: React.FormEvent) => {
    event.preventDefault();
    const minor = majorToMinor(amount);
    if (busy || !minor || !summary || !destinationId) return;
    setBusy(true);
    setFailed(false);
    setDone(false);
    const { error } = await supabase().rpc('request_provider_withdrawal', {
      p_amount_minor: minor,
      p_payout_destination_id: destinationId,
      p_idempotency_key: newWorkerKey('web-withdrawal'),
    });
    if (error) setFailed(true);
    else {
      setAmount('');
      setDone(true);
      await load();
    }
    setBusy(false);
  };

  return (
    <AppShell nav={workerNav(appWords)} mode={appWords.modeWorker}>
      <div className={styles.head}><h1 className={styles.title}>{words.earningsTitle}</h1></div>
      <p className={styles.lead}>{words.earningsLead}</p>

      {failed ? <section className={styles.panel}><p className={styles.error} role="alert">{words.earningsActionFailed}</p>
        <button type="button" className={styles.secondary} onClick={() => void load()}>{appWords.retry}</button></section> : null}
      {!summary && !failed ? <section className={styles.panel}><p className={styles.muted}>{appWords.loading}</p></section> : summary ? (
        <>
          <section className={styles.panel}>
            <div className={styles.grid}>
              <Balance label={words.earningsAvailable} value={egpFromMinor(summary.availableMinor, locale)} strong />
              <Balance label={words.earningsPending} value={egpFromMinor(summary.pendingMinor, locale)} />
              <Balance label={words.earningsPaid} value={egpFromMinor(summary.paidOutMinor, locale)} />
              <Balance label={words.earningsHeld} value={egpFromMinor(summary.heldMinor, locale)} />
              <Balance label={words.earningsCashDebt} value={egpFromMinor(summary.cashCommissionDueMinor, locale)} />
              <Balance label={words.earningsRecovery} value={egpFromMinor(summary.recoverableAdjustmentMinor, locale)} />
            </div>
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>{words.earningsTransactions}</h2>
            {summary.transactions.length === 0 ? <p className={styles.muted}>{words.earningsNone}</p> : (
              <ul className={styles.list}>{summary.transactions.map((item) => (
                <li key={item.id} className={styles.row}>
                  <span className={styles.cardName}>{cataloguedServiceReferenceLabel({
                    serviceId: item.serviceId,
                    serviceTranslationKey: item.serviceTranslationKey,
                    serviceName: item.service,
                  }, services, locale)}</span>
                  <div className={styles.rowMeta}><span className={styles.price}>{egpFromMinor(item.netMinor, locale)}</span>
                    <span className={styles.badge}>{words[`earningStatus_${item.status}` as keyof typeof words] ?? item.status}</span><time className={styles.when}>{formatMoment(item.date, locale)}</time></div>
                </li>
              ))}</ul>
            )}
          </section>

          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>{words.earningsWithdrawals}</h2>
            {!summary.withdrawalsEnabled ? <p className={styles.note}>{words.earningsWithdrawalUnavailable}</p> : (
              <>
                <div className={styles.actions}>
                  <button type="button" className={styles.secondary} onClick={() => setShowDestination((value) => !value)}>{words.earningsAddDestination}</button>
                </div>
                {showDestination ? (
                  <form className={styles.subpanel} onSubmit={saveDestination}>
                    <div className={styles.formGrid}>
                      <Field label={words.earningsDestinationType}><select className={styles.select} value={destinationType}
                        onChange={(event) => setDestinationType(event.target.value as typeof destinationType)} disabled={busy}>
                        <option value="mobile_wallet">{words.earningsMobileWallet}</option>
                        <option value="bank_account">{words.earningsBankAccount}</option>
                      </select></Field>
                      <Field label={words.earningsDestinationLabel}><input className={styles.input} maxLength={100} value={destinationLabel}
                        onChange={(event) => setDestinationLabel(event.target.value)} disabled={busy} /></Field>
                      <Field label={words.earningsDestinationValue}><input className={styles.input} autoComplete="off" value={destinationValue}
                        onChange={(event) => setDestinationValue(event.target.value)} disabled={busy} /></Field>
                    </div>
                    <label className={styles.card}><input type="checkbox" checked={ownership}
                      onChange={(event) => setOwnership(event.target.checked)} disabled={busy} /> {words.earningsOwnership}</label>
                    <button type="submit" className={styles.action} disabled={busy || !ownership || destinationLabel.trim().length < 2 || destinationValue.replace(/\s/g, '').length < 6}>
                      {words.earningsAddDestination}</button>
                  </form>
                ) : null}
                {destinations.length === 0 ? <p className={styles.muted}>{words.earningsNoDestination}</p> : (
                  <form className={styles.subpanel} onSubmit={withdraw}>
                    <div className={styles.formGrid}>
                      <Field label={words.earningsDestination}><select className={styles.select} value={destinationId}
                        onChange={(event) => setDestinationId(event.target.value)} disabled={busy}>
                        {destinations.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.maskedValue}</option>)}
                      </select></Field>
                      <Field label={words.earningsAmount}><input className={styles.input} inputMode="decimal" value={amount}
                        onChange={(event) => setAmount(event.target.value)} disabled={busy} /></Field>
                    </div>
                    <p className={styles.note}>{words.earningsAvailable}: {egpFromMinor(summary.availableMinor, locale)} · {words.earningsMinimum}: {egpFromMinor(summary.minimumWithdrawalMinor, locale)}</p>
                    <button type="submit" className={styles.action} disabled={busy || !majorToMinor(amount) || !destinationId}>{words.earningsRequestWithdrawal}</button>
                  </form>
                )}
                {withdrawals.length > 0 ? <div className={styles.subpanel}><h3 className={styles.sectionTitle}>{words.earningsWithdrawalsHistory}</h3>
                  <ul className={styles.list}>{withdrawals.map((item) => <li key={item.id} className={styles.row}>
                    <span className={styles.cardName}>{egpFromMinor(item.amountMinor, locale)} · {item.destinationMasked}</span>
                    <div className={styles.rowMeta}><span className={styles.badge}>{words[`withdrawalStatus_${item.status}` as keyof typeof words] ?? item.status}</span><span className={styles.cardMeta}>{item.reference}</span></div>
                  </li>)}</ul></div> : null}
              </>
            )}
            {done ? <p className={styles.ok} role="status">{words.earningsActionDone}</p> : null}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

function Balance({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={styles.card}><span className={styles.cardMeta}>{label}</span><span className={strong ? styles.price : styles.cardName}>{value}</span></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className={styles.field}><span className={styles.label}>{label}</span>{children}</label>; }
function majorToMinor(value: string): string | null { if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value.trim())) return null; const [major, fraction = ''] = value.trim().split('.'); return (BigInt(major) * 100n + BigInt(fraction.padEnd(2, '0'))).toString(); }
function formatMoment(value: string, locale: Locale) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
