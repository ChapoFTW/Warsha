'use client';

import { useEffect } from 'react';

/**
 * "Something on the server changed; anyone showing it should look again."
 *
 * ## What this is not
 *
 * It is not a cache, and it does not hold server data. Warsha's rule is that a
 * saved address is the database's, read through RLS, and never copied into a
 * device store - so the fix for "my new address is not in the picker" can never
 * be to write the address into `localStorage` as well. The fix is for the
 * surfaces that read addresses to know that the answer changed.
 *
 * ## Why it is needed at all
 *
 * Within one tab, a client-side navigation remounts the destination and its
 * load effect runs, so most of this is already correct once the in-app links
 * are real `<Link>`s. Two cases are not:
 *
 * - **Two tabs.** Saving an address in one leaves the other's picker listing
 *   the old set until it is reloaded by hand.
 * - **Two surfaces in one tree.** The account menu's unread count and the page
 *   below it read different queries and are mounted at the same time.
 *
 * A `storage` write is the browser's own cross-tab channel and needs no
 * infrastructure; the same-tab event covers listeners inside this document,
 * which `storage` deliberately does not notify.
 */

export const dataChangeEvent = 'warsha:data-change';

/** The server-owned collections a screen can be showing. */
export type DataTopic =
  | 'addresses'
  | 'requests'
  | 'worker_profile'
  | 'notifications';

const STORAGE_KEY = 'warsha:data-change:v1';

/** Say that a topic changed, after a mutation the server accepted. */
export function announceDataChange(topic: DataTopic): void {
  try {
    // The value only has to differ from the last one; nothing reads it back.
    window.localStorage.setItem(STORAGE_KEY, `${topic}:${Date.now()}`);
  } catch {
    // Cross-tab notification is a convenience, not a correctness requirement.
  }
  try {
    window.dispatchEvent(new CustomEvent(dataChangeEvent, { detail: topic }));
  } catch {
    // Same.
  }
}

/**
 * Re-read when a topic changes.
 *
 * `onChange` is invoked for a change announced by this tab or by another one.
 * It is never invoked on mount: the caller's own load effect already did that,
 * and firing here as well would double every screen's first request.
 */
export function useDataChange(topic: DataTopic, onChange: () => void): void {
  useEffect(() => {
    const onLocal = (event: Event) => {
      if ((event as CustomEvent<DataTopic>).detail === topic) onChange();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      if (event.newValue.split(':')[0] === topic) onChange();
    };
    window.addEventListener(dataChangeEvent, onLocal);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(dataChangeEvent, onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, [onChange, topic]);
}
