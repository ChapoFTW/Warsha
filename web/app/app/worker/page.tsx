'use client';

import { AppShell, useAccount } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import { useAppLocale } from '@/lib/use-app-locale';

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
  const words = appCopy[locale];
  const account = useAccount();

  const state = account?.state;
  const nextStep = !state
    ? words.loading
    : state.workerCapabilityActive
      ? words.workerActive
      : state.outstandingGates.length > 0
        ? words.workerOnboardingIncomplete
        : words.workerVerificationPending;

  const nav = [
    { href: '/worker', label: words.navHome },
    { href: '/worker/verification', label: words.navVerification },
    { href: '/support', label: words.navSupport },
  ];

  return (
    <AppShell nav={nav} mode={words.modeWorker}>
      <h1 className={styles.title}>{words.dashboardGreeting}</h1>

      <section className={styles.next} aria-labelledby="next">
        <h2 id="next" className={styles.cardTitle}>{words.workerNextStep}</h2>
        <p className={styles.status}>{nextStep}</p>
      </section>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="verification">
          <h2 id="verification" className={styles.cardTitle}>{words.navVerification}</h2>
          <p className={styles.muted}>
            {state?.workerCapabilityActive ? words.workerActive : words.workerVerificationPending}
          </p>
        </section>

        <section className={styles.card} aria-labelledby="legal-worker">
          <h2 id="legal-worker" className={styles.cardTitle}>{words.legalCentre}</h2>
          <a className={styles.link} href="https://usewarsha.com/legal">{words.viewAll}</a>
        </section>
      </div>
    </AppShell>
  );
}
