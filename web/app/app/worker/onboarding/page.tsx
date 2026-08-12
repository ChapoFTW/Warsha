'use client';

import { useEffect, useState } from 'react';

import { AppShell, useAccount } from '@/components/app-shell';
import { WorkerLocation } from '@/components/worker-location';
import { WorkerProfileEditor } from '@/components/worker-profile-editor';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { workerCopy } from '@/lib/worker-copy';
import { workerJourneyProgress } from '@/src/worker/worker-onboarding-policy.ts';

import styles from '@/components/product-surface.module.css';

/** The browser continuation of the same seven-step worker journey as mobile. */
export default function WorkerOnboardingPage() {
  const locale = useAppLocale();
  const appWords = appCopy[locale];
  const words = workerCopy[locale];
  const account = useAccount();
  const { refresh } = useSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const state = account?.state;

  if (!state) {
    return <AppShell nav={[]} mode={appWords.modeWorker}><p className={styles.muted}>{appWords.loading}</p></AppShell>;
  }
  const progress = workerJourneyProgress(state);
  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase().rpc('accept_my_worker_agreements', {
      p_worker_agreement: true,
      p_document_processing: true,
    });
    if (error) setFailed(true);
    else await refresh();
    setBusy(false);
  };

  return (
    <AppShell nav={[
      { href: '/worker/onboarding', label: words.onboardingTitle },
      { href: '/worker/verification', label: appWords.navVerification },
      { href: '/notifications', label: appWords.navNotifications },
      { href: '/support', label: appWords.navSupport },
    ]} mode={appWords.modeWorker}>
      <div className={styles.head}><h1 className={styles.title}>{words.onboardingTitle}</h1></div>
      <p className={styles.lead}>{words.onboardingLead}</p>
      <p className={styles.note} role="progressbar" aria-valuemin={1} aria-valuemax={progress.total} aria-valuenow={progress.current}>
        {words.onboardingStep.replace('{current}', String(progress.current)).replace('{total}', String(progress.total))}
      </p>

      {progress.step === 'welcome' ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>{words.onboardingAgreementTitle}</h2>
          <p className={styles.muted}>{words.onboardingAgreementBody}</p>
          {failed ? <p className={styles.error} role="alert">{appWords.loadFailed}</p> : null}
          <button type="button" className={styles.action} onClick={() => void accept()} disabled={busy}>
            {busy ? appWords.loading : words.onboardingAccept}
          </button>
        </section>
      ) : null}

      {progress.step === 'basic_information' ? (
        <>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>{words.onboardingProfileTitle}</h2>
            <p className={styles.muted}>{words.onboardingProfileBody}</p>
          </section>
          <WorkerProfileEditor section="basic" onSaved={refresh} />
        </>
      ) : null}

      {progress.step === 'trade' ? (
        <>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>{words.onboardingTradesTitle}</h2>
            <p className={styles.muted}>{words.onboardingTradesBody}</p>
          </section>
          <WorkerProfileEditor section="trade" onSaved={refresh} />
        </>
      ) : null}

      {progress.step === 'service_area' ? (
        <>
          <section className={styles.panel}>
            <h2 className={styles.sectionTitle}>{words.onboardingAreaTitle}</h2>
            <p className={styles.muted}>{words.onboardingAreaBody}</p>
          </section>
          {!state.gates.service_area_configured ? <WorkerProfileEditor section="area" onSaved={refresh} /> : null}
          {state.gates.service_area_configured && !state.gates.current_address_provided ? (
            <OnboardingLocation onSaved={refresh} />
          ) : null}
        </>
      ) : null}

      {progress.step === 'identity' || progress.step === 'criminal_record' ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>{words.onboardingIdentityTitle}</h2>
          <p className={styles.muted}>{words.onboardingIdentityBody}</p>
          <a className={styles.action} href="/worker/verification">{appWords.navVerification}</a>
        </section>
      ) : null}

      {progress.step === 'review' ? (
        <section className={styles.panel}>
          <h2 className={styles.sectionTitle}>{words.onboardingReviewTitle}</h2>
          <p className={styles.muted}>{state.latestSafeReason || words.onboardingReviewBody}</p>
          <button type="button" className={styles.secondary} onClick={() => void refresh()}>{appWords.retry}</button>
        </section>
      ) : null}
    </AppShell>
  );
}

function OnboardingLocation({ onSaved }: { onSaved: () => Promise<void> }) {
  const locale = useAppLocale();
  const words = workerCopy[locale];
  const [area, setArea] = useState<import('@/lib/worker').WorkerArea | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase().rpc('get_my_worker_profile').then(({ data, error }) => {
      if (!active) return;
      if (error) setFailed(true);
      else setArea((data as { areas?: import('@/lib/worker').WorkerArea[] } | null)?.areas?.[0] ?? null);
    });
    return () => { active = false; };
  }, []);
  if (failed) return <p className={styles.error} role="alert">{words.workLocationAreaFailed}</p>;
  return area ? <WorkerLocation area={area} onSaved={onSaved} /> : <p className={styles.muted}>{words.loading}</p>;
}
