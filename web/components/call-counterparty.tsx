'use client';

import { useCallback, useEffect, useState } from 'react';

import { appCopy } from '@/lib/app-copy';
import type { Locale } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import {
  isBookingContactUnavailable,
  parseBookingContact,
  telUri,
} from '@/src/bookings/booking-contact';

import styles from '@/components/product-surface.module.css';

/**
 * Call the other person on this job, from a browser.
 *
 * The same rule as the mobile control, from the same two RPCs, because the rule
 * is the product's and not the platform's: `booking_contact_is_available`
 * decides whether the action exists, and `get_booking_counterparty_contact`
 * produces the number only at the moment somebody presses it.
 *
 * The number is never held in React state. It is a local constant inside one
 * async function, used to build a `tel:` URI and then gone — nothing a render
 * can reach, nothing a devtools inspection of component state will show, and
 * nothing that can be accidentally serialised into a later feature.
 *
 * `tel:` on a desktop browser hands off to whatever the operating system has
 * registered, which may be nothing at all. That is the honest behaviour and the
 * reason the label says "Call" rather than promising a specific outcome; a
 * browser that cannot handle the scheme simply does nothing, which is the
 * platform's answer rather than a Warsha failure to report.
 */
export function CallCounterparty({
  bookingId,
  counterpartyRole,
  locale,
  bookingStatus,
}: {
  bookingId: string;
  /** Which side the OTHER person is on, so the label is theirs, not the caller's. */
  counterpartyRole: 'customer' | 'worker';
  locale: Locale;
  /** Re-asks when the job moves on, so the action keeps up with the lifecycle. */
  bookingStatus?: string;
}) {
  const words = appCopy[locale] as Record<string, string>;
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId) { setAvailable(false); return; }
    let active = true;
    void supabase()
      .rpc('booking_contact_is_available', { p_booking_id: bookingId })
      .then(({ data, error }) => {
        if (active) setAvailable(!error && data === true);
      });
    return () => { active = false; };
  }, [bookingId, bookingStatus]);

  const call = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const { data, error } = await supabase()
        .rpc('get_booking_counterparty_contact', { p_booking_id: bookingId });
      if (error) {
        // The relationship ended between drawing the button and pressing it.
        if (isBookingContactUnavailable(error)) {
          setAvailable(false);
          setFailure(words.callUnavailable);
        } else {
          setFailure(words.callFailed);
        }
        return;
      }
      const uri = telUri(parseBookingContact(data)?.phone);
      if (!uri) { setFailure(words.callNoNumber); return; }
      window.location.href = uri;
    } catch {
      setFailure(words.callFailed);
    } finally {
      setBusy(false);
    }
  }, [bookingId, busy, words]);

  if (!available) return null;

  const label = counterpartyRole === 'worker' ? words.callWorker : words.callCustomer;
  return (
    <>
      <button type="button" className={styles.secondary} disabled={busy}
        onClick={() => void call()}>
        {label}
      </button>
      {failure ? <p className={styles.error} role="alert">{failure}</p> : null}
    </>
  );
}
