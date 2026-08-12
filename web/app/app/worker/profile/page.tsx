'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import { AppShell } from '@/components/app-shell';
import { WorkerProfileEditor } from '@/components/worker-profile-editor';
import { useSession } from '@/components/session-provider';
import { appCopy } from '@/lib/app-copy';
import { workerNav } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';
import { parseWorkerProfile, type WorkerProfile } from '@/lib/worker';
import { workerCopy } from '@/lib/worker-copy';

import styles from '@/components/product-surface.module.css';

export default function WorkerProfilePage() {
  const locale = useAppLocale();
  const appWords = appCopy[locale] as Record<string, string>;
  const words = workerCopy[locale];
  const { chooseMode } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc('get_my_worker_profile');
    if (error) setFailed(true);
    else setProfile(parseWorkerProfile(data));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const availability = async (available: boolean) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase().rpc('mark_worker_available', { p_available: available });
    if (error) setFailed(true);
    else await load();
    setBusy(false);
  };

  return (
    <AppShell nav={workerNav(appWords)} mode={appWords.modeWorker}>
      <div className={styles.head}><h1 className={styles.title}>{words.workerProfileTitle}</h1></div>
      <p className={styles.lead}>{words.workerProfileLead}</p>

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{words.workerAvailability}</h2>
        {profile ? (
          <>
            <p className={styles.cardName}>{profile.isAvailable ? words.workerAvailable : words.workerUnavailable}</p>
            <p className={styles.note}>{words.workerAvailabilityHelp}</p>
            <button type="button" className={profile.isAvailable ? styles.secondary : styles.action}
              onClick={() => void availability(!profile.isAvailable)} disabled={busy}>
              {busy ? appWords.loading : profile.isAvailable ? words.workerGoUnavailable : words.workerGoAvailable}
            </button>
          </>
        ) : failed ? null : <p className={styles.muted}>{appWords.loading}</p>}
        {failed ? <p className={styles.error} role="alert">{words.workerProfileFailed}</p> : null}
      </section>

      <WorkerProfileEditor section="all" onSaved={(next) => setProfile(next)} />

      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{appWords.accountPreferences}</h2>
        <p className={styles.muted}>{appWords.accountPreferencesBody}</p>
      </section>
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{appWords.legalCentre}</h2>
        <p className={styles.muted}>{appWords.accountLegalBody}</p>
        <div className={styles.actions}>
          <a className={styles.secondary} href={`https://usewarsha.com/${locale}/legal`}>{appWords.viewAll}</a>
          <a className={styles.secondary} href="/support">{appWords.navSupport}</a>
          <a className={styles.secondary} href="/notifications">{appWords.navNotifications}</a>
        </div>
      </section>
      <section className={styles.panel}>
        <h2 className={styles.sectionTitle}>{appWords.accountWorkMode}</h2>
        <p className={styles.muted}>{appWords.accountWorkModeBody}</p>
        <button type="button" className={styles.secondary} onClick={() => {
          chooseMode('customer');
          router.replace('/' as Route);
        }}>{appWords.chooseCustomer}</button>
      </section>
      <p className={styles.note}>{words.workerPortfolioMobile}</p>
    </AppShell>
  );
}
