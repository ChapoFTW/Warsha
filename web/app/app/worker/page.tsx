'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import { AppShell, useAccount } from '@/components/app-shell';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { workerNavigation } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { parseInvitations, parseWorkerBookings, parseWorkerProfile } from '@/lib/worker';
import { workerCopy } from '@/lib/worker-copy';

import styles from '../dashboard.module.css';

/**
 * The worker home.
 *
 * WPS-025's rule holds here: a worker should always be able to answer "what do
 * I need to do next?" So the first thing on the page is that answer, in one
 * sentence, derived from the same server state the phone reads — not a grid of
 * metrics that requires interpretation before it means anything.
 *
 * This is deliberately not an enterprise dashboard. The admin console can be
 * dense; a person standing on a job site with one hand free cannot be.
 */
export default function WorkerHome() {
  const locale = useAppLocale();
  const words = appCopy[locale] as Record<string, string>;
  const workerWords = workerCopy[locale];
  const account = useAccount();
  const { chooseMode } = useSession();
  const router = useRouter();
  const [availability, setAvailability] = useState<boolean | null>(null);
  const [opportunityCount, setOpportunityCount] = useState<number | null>(null);
  const [activeJobCount, setActiveJobCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const client = supabase();
    const [{ data: profileData, error: profileError }, { data: invitationData, error: invitationError }] = await Promise.all([
      client.rpc('get_my_worker_profile'),
      client.rpc('get_worker_quote_invitations', { p_cursor: null, p_limit: 50 }),
    ]);
    const profile = parseWorkerProfile(profileData);
    if (profileError || invitationError || !profile) {
      setFailed(true);
      return;
    }
    setAvailability(profile.isAvailable);
    setOpportunityCount(parseInvitations(invitationData).filter((item) => ['invited', 'viewed'].includes(item.status)).length);
    const { data, error } = await client.from('bookings')
      .select('id,status,customer_name_snapshot,service_id,service_name_snapshot,issue_description,notes,scheduled_date,scheduled_time,address_snapshot,estimated_price_egp,final_price_egp,proposed_scheduled_date,proposed_scheduled_time,provider_reschedule_note,services(translation_key),booking_status_history(status,created_at,metadata)')
      .eq('provider_id', profile.id)
      .is('deleted_at', null);
    if (error) setFailed(true);
    else setActiveJobCount(parseWorkerBookings(data).filter((item) => !['completed', 'cancelled', 'rejected', 'refunded', 'no_show'].includes(item.status)).length);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const state = account?.state;
  const nextStep = !state
    ? words.loading
    : state.workerCapabilityActive
      ? words.workerActive
      : state.outstandingGates.length > 0
        ? words.workerOnboardingIncomplete
        : words.workerVerificationPending;

  const setWorkerAvailability = async () => {
    if (busy || availability === null) return;
    setBusy(true);
    const { error } = await supabase().rpc('mark_worker_available', { p_available: !availability });
    if (error) setFailed(true);
    else await load();
    setBusy(false);
  };

  return (
    <AppShell navigation={workerNavigation(words)} mode={words.modeWorker}>
      <h1 className={styles.title}>{words.dashboardGreeting}</h1>

      <section className={styles.next} aria-labelledby="next">
        <h2 id="next" className={styles.cardTitle}>{words.workerNextStep}</h2>
        <p className={styles.status}>{nextStep}</p>
        {state?.workerCapabilityActive && availability !== null ? (
          <button type="button" className={styles.link} onClick={() => void setWorkerAvailability()} disabled={busy}>
            {availability ? workerWords.workerGoUnavailable : workerWords.workerGoAvailable}
          </button>
        ) : null}
      </section>

      {failed ? <section className={styles.card}><p className={styles.muted}>{words.loadFailed}</p>
        <button type="button" className={styles.link} onClick={() => void load()}>{words.retry}</button></section> : null}

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="verification">
          <h2 id="verification" className={styles.cardTitle}>{words.navOpportunities}</h2>
          <p className={styles.muted}>{opportunityCount === null ? words.loading : workerWords.opportunitiesCount.replace('{count}', String(opportunityCount))}</p>
          <a className={styles.link} href="/worker/opportunities">{words.viewAll}</a>
        </section>

        <section className={styles.card} aria-labelledby="jobs-worker">
          <h2 id="jobs-worker" className={styles.cardTitle}>{words.navJobs}</h2>
          <p className={styles.muted}>{activeJobCount === null ? words.loading : workerWords.workerJobsCount.replace('{count}', String(activeJobCount))}</p>
          <a className={styles.link} href="/worker/jobs">{words.viewAll}</a>
        </section>

        <section className={styles.card} aria-labelledby="customer-worker">
          <h2 id="customer-worker" className={styles.cardTitle}>{words.chooseCustomer}</h2>
          <p className={styles.muted}>{words.chooseCustomerBody}</p>
          <button type="button" className={styles.link} onClick={() => {
            chooseMode('customer');
            router.replace('/' as Route);
          }}>{words.chooseCustomer}</button>
        </section>
      </div>
    </AppShell>
  );
}
