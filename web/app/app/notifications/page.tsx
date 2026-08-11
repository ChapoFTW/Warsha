'use client';

import { useCallback, useEffect, useState } from 'react';

import { AppShell, useAccount } from '@/components/app-shell';
import { appCopy } from '@/lib/app-copy';
import {
  cursorFrom,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PAGE_SIZE,
  notificationChrome,
  notificationText,
  parseNotifications,
  type NotificationCursor,
  type WebNotification,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { useAppLocale } from '@/lib/use-app-locale';

import styles from './notifications.module.css';

/**
 * The notification list.
 *
 * Backed by `get_my_notifications`, which the app already uses. Three details
 * of that function shape this page and are easy to get wrong:
 *
 * `p_mode` is required and has no default. It is also enforced —
 * `private.notification_mode_allowed` refuses a mode the account does not hold
 * — so a customer cannot read a worker's notifications by passing 'worker'.
 *
 * Paging is a keyset on `(last_event_at, id)`, not an offset. Sending only the
 * timestamp would drop or repeat rows whenever two notifications share one,
 * which happens on every batched write.
 *
 * Titles come from the shared copy table the app reads. They are not restated
 * here; a second copy of forty event strings would diverge on the first new
 * event, and only one side would be right.
 */
export default function NotificationsPage() {
  const locale = useAppLocale();
  const words = appCopy[locale];
  const account = useAccount();
  const chrome = notificationChrome(locale);

  // The mode this account may actually read. A worker-only account has no
  // customer notifications, and asking for them is refused server-side.
  const mode = account?.roles.worker && !account?.roles.customer ? 'worker' : 'customer';

  const [items, setItems] = useState<WebNotification[] | null>(null);
  const [cursor, setCursor] = useState<NotificationCursor>(null);
  const [exhausted, setExhausted] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (append: NotificationCursor) => {
    setBusy(true);
    setFailed(false);
    const { data, error } = await supabase().rpc('get_my_notifications', {
      p_mode: mode,
      p_before: append?.before ?? null,
      p_before_id: append?.beforeId ?? null,
      p_limit: NOTIFICATION_PAGE_SIZE,
      p_archived: false,
      p_category: category || null,
    });
    if (error) {
      setFailed(true);
    } else {
      const page = parseNotifications(data);
      setItems((current) => (append && current ? [...current, ...page] : page));
      setCursor(cursorFrom(page));
      setExhausted(page.length < NOTIFICATION_PAGE_SIZE);
    }
    setBusy(false);
  }, [mode, category]);

  useEffect(() => { void load(null); }, [load]);

  const markRead = async (id: string) => {
    // Optimistic: the row is already read from the reader's point of view the
    // moment they act on it, and a failed write is recoverable by reloading.
    setItems((current) => current?.map((row) =>
      row.id === id ? { ...row, readAt: new Date().toISOString() } : row) ?? null);
    await supabase().rpc('mark_notification_read', { p_notification_id: id, p_mode: mode });
  };

  const markAllRead = async () => {
    const now = new Date().toISOString();
    setItems((current) => current?.map((row) => row.readAt ? row : { ...row, readAt: now }) ?? null);
    await supabase().rpc('mark_all_notifications_read', { p_mode: mode });
  };

  const archive = async (id: string) => {
    setItems((current) => current?.filter((row) => row.id !== id) ?? null);
    await supabase().rpc('archive_notification', { p_notification_id: id, p_mode: mode });
  };

  const unread = items?.filter((row) => !row.readAt).length ?? 0;

  return (
    <AppShell nav={navFor(mode, words)} mode={mode === 'worker' ? words.modeWorker : words.modeCustomer}>
      <div className={styles.head}>
        <h1 className={styles.title}>{chrome.title}</h1>
        {unread > 0 ? (
          <button type="button" className={styles.textAction} onClick={() => void markAllRead()}>
            {chrome.markAllRead}
          </button>
        ) : null}
      </div>

      <div className={styles.filters}>
        <label className={styles.field}>
          <span className={styles.label}>{words.notificationCategory}</span>
          <select
            className={styles.select}
            value={category}
            onChange={(event) => { setCategory(event.target.value); setItems(null); }}
            disabled={busy}
          >
            <option value="">{words.notificationAllCategories}</option>
            {NOTIFICATION_CATEGORIES.map((key) => (
              <option key={key} value={key}>
                {(words as Record<string, string>)[`category_${key}`] ?? key}
              </option>
            ))}
          </select>
        </label>
      </div>

      {failed ? (
        <div className={styles.state}>
          <p>{chrome.loadError}</p>
          <button type="button" className={styles.action} onClick={() => void load(null)}>
            {chrome.retry}
          </button>
        </div>
      ) : items === null ? (
        <p className={styles.muted}>{words.loading}</p>
      ) : items.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.emptyTitle}>{chrome.empty}</p>
          <p className={styles.muted}>{chrome.emptyBody}</p>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((row) => {
              const text = notificationText(locale, row.eventKey);
              return (
                <li
                  key={row.id}
                  className={`${styles.item} ${row.readAt ? '' : styles.itemUnread}`}
                >
                  <div className={styles.itemBody}>
                    <p className={styles.itemTitle}>
                      {text.title}
                      {row.groupCount && row.groupCount > 1 ? (
                        <span className={styles.count}>{row.groupCount}</span>
                      ) : null}
                    </p>
                    <p className={styles.itemText}>{text.body}</p>
                    <time className={styles.when} dateTime={row.lastEventAt}>
                      {relative(row.lastEventAt, locale)}
                    </time>
                  </div>
                  <div className={styles.itemActions}>
                    {row.readAt ? null : (
                      <button
                        type="button"
                        className={styles.textAction}
                        onClick={() => void markRead(row.id)}
                      >
                        {chrome.markRead}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.textAction}
                      onClick={() => void archive(row.id)}
                    >
                      {chrome.dismiss}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {!exhausted ? (
            <button
              type="button"
              className={styles.action}
              onClick={() => void load(cursor)}
              disabled={busy}
            >
              {busy ? words.loading : chrome.loadMore}
            </button>
          ) : null}
        </>
      )}
    </AppShell>
  );
}

function navFor(mode: 'customer' | 'worker', words: Record<string, string>) {
  return mode === 'worker'
    ? [
      { href: '/worker', label: words.navHome },
      { href: '/worker/verification', label: words.navVerification },
      { href: '/notifications', label: words.navNotifications },
      { href: '/support', label: words.navSupport },
    ]
    : [
      { href: '/', label: words.navHome },
      { href: '/notifications', label: words.navNotifications },
      { href: '/support', label: words.navSupport },
    ];
}

function relative(at: string, locale: 'en' | 'ar'): string {
  const seconds = (Date.now() - new Date(at).getTime()) / 1000;
  const format = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    numeric: 'auto',
  });
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    seconds >= 86400 ? [-Math.floor(seconds / 86400), 'day']
      : seconds >= 3600 ? [-Math.floor(seconds / 3600), 'hour']
        : [-Math.max(1, Math.floor(seconds / 60)), 'minute'];
  return format.format(amount, unit);
}
