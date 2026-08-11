'use client';

import { useEffect, useState } from 'react';

import { AppShell, useAccount } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './dashboard.module.css';

/**
 * The customer home.
 *
 * Everything shown here comes from an RPC the mobile client already calls, so
 * the two agree by construction. Nothing is invented: where Warsha has no
 * authority for a number, no number appears — the section says so instead,
 * which is more useful than a zero that might mean "none" or might mean
 * "we could not load it".
 */

type Counts = { unread: number } | null;

export default function CustomerHome() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const account = useAccount();
  const [counts, setCounts] = useState<Counts>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase().rpc('get_my_notification_counts');
      if (!active) return;
      if (error) {
        setFailed(true);
      } else {
        const payload = data as { unread?: number } | null;
        setCounts({ unread: Number(payload?.unread ?? 0) });
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const nav = [
    { href: '/', label: words.navHome },
    { href: '/notifications', label: words.navNotifications },
    { href: '/support', label: words.navSupport },
  ];

  return (
    <AppShell nav={nav} mode={words.modeCustomer}>
      <h1 className={styles.title}>{words.dashboardGreeting}</h1>

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="notifications">
          <h2 id="notifications" className={styles.cardTitle}>{words.notifications}</h2>
          {loading ? (
            <p className={styles.muted}>{words.loading}</p>
          ) : failed ? (
            <p className={styles.muted}>{words.loadFailed}</p>
          ) : counts && counts.unread > 0 ? (
            <p className={styles.metric}>
              {counts.unread} <span className={styles.metricLabel}>{words.unreadCount}</span>
            </p>
          ) : (
            <p className={styles.muted}>{words.noNotifications}</p>
          )}
        </section>

        <section className={styles.card} aria-labelledby="account">
          <h2 id="account" className={styles.cardTitle}>{words.navAccount}</h2>
          <p className={styles.muted}>
            {account?.roles.both ? `${words.modeCustomer} · ${words.modeWorker}` : words.modeCustomer}
          </p>
        </section>

        <section className={styles.card} aria-labelledby="legal">
          <h2 id="legal" className={styles.cardTitle}>{words.legalCentre}</h2>
          <a className={styles.link} href="https://usewarsha.com/legal">{words.viewAll}</a>
        </section>
      </div>
    </AppShell>
  );
}
