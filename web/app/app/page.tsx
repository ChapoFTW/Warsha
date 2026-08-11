'use client';

import { useEffect, useState } from 'react';

import { AppShell, useAccount } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import { parseCounts, type NotificationCounts } from '@/lib/notifications';
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

export default function CustomerHome() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const account = useAccount();
  const [counts, setCounts] = useState<NotificationCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      // `p_mode` is required and has no default, so calling this with no
      // arguments cannot resolve server-side — which is what used to happen,
      // and why this card only ever showed its failure state.
      const { data, error } = await supabase()
        .rpc('get_my_notification_counts', { p_mode: 'customer' });
      if (!active) return;
      if (error) setFailed(true);
      else setCounts(parseCounts(data));
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
          ) : counts && counts.globalUnread > 0 ? (
            <p className={styles.metric}>
              {counts.globalUnread} <span className={styles.metricLabel}>{words.unreadCount}</span>
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
