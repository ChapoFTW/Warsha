'use client';

import { useEffect, useRef } from 'react';

import { supabase } from './supabase';
import type { RealtimeChannelSpec } from '@/src/realtime/realtime-channels';

/**
 * Keeps a web surface current without anybody pressing reload.
 *
 * ## What this fixes
 *
 * The web had no realtime at all. A customer with a request open watched a page
 * that would not change until they refreshed, while the same customer on a
 * phone saw the quote arrive — same product, same database, two different
 * answers to "is this current?".
 *
 * ## The shape
 *
 *     DATABASE CHANGE
 *       -> authorized realtime event (RLS applies; the payload carries only id)
 *       -> a signal, not data
 *       -> the caller refetches its authoritative query
 *       -> UI updates
 *
 * The event is a doorbell, never a delivery. A `postgres_changes` payload is one
 * row from one table at one moment; a Warsha request is a request, its quotes,
 * its deadlines and a computed count. Reconstructing that from a row diff would
 * be a second implementation of every RPC, and would be wrong in exactly the
 * conditions realtime is worst at — reconnects, out-of-order delivery, and
 * events for rows the reader is only partly entitled to. Refetching costs one
 * round trip and cannot disagree with the database.
 *
 * That also settles duplication and ordering without a sequence number: there is
 * nothing to append and nothing to merge, so a duplicate event causes one extra
 * refetch and an out-of-order event cannot regress a lifecycle state, because
 * the state always comes from the current query rather than from the event.
 *
 * ## Four ways to find out, not one
 *
 * A websocket is the fast path and never the only one. Events are missed while a
 * tab is discarded, while a laptop sleeps, and in the window between a socket
 * dropping and reconnecting. So the caller is also asked to refetch when:
 *
 *   - the channel (re)subscribes, which covers everything missed while it was down
 *   - the tab becomes visible again
 *   - the browser comes back online
 *
 * The backend stays the source of truth in all four cases, and a browser with no
 * websocket at all still works — it simply revalidates on focus instead.
 *
 * ## Failure is quiet
 *
 * A realtime failure is never shown to a reader. "Realtime websocket
 * disconnected" is not a sentence any customer can act on, and the product works
 * without the socket: every mutation still goes over HTTP and every screen still
 * loads. The connection state is reported to the caller for logging, and no
 * further.
 */
export function useWarshaRealtime(
  spec: RealtimeChannelSpec | null,
  onChange: () => void,
) {
  // The callback is almost always an inline arrow, so depending on it would
  // resubscribe on every render — a new socket several times a second.
  const handler = useRef(onChange);
  handler.current = onChange;

  useEffect(() => {
    if (!spec) return;

    // Bursts are collapsed. Accepting a quote writes the quote, the request and
    // a notification; three events arriving in the same tick must produce one
    // refetch, not three. A microtask is enough — it is the same turn of the
    // event loop, so nothing is delayed by it.
    let queued = false;
    const reconcile = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; handler.current(); });
    };

    const client = supabase();
    let channel = client.channel(spec.name);
    for (const binding of spec.bindings) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: binding.table,
          ...(binding.filter ? { filter: binding.filter } : {}),
        },
        reconcile,
      );
    }
    // A fresh subscription means the socket has just come up, which means
    // anything that changed while it was down was never delivered. Reconciling
    // here is what turns a reconnect into a catch-up.
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') reconcile(); });

    const onVisible = () => { if (document.visibilityState === 'visible') reconcile(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', reconcile);
    window.addEventListener('focus', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', reconcile);
      window.removeEventListener('focus', onVisible);
      // Removing the channel is not optional housekeeping. A channel left open
      // after a sign-out is a socket still delivering the previous account's
      // rows, and one left open on navigation is a leak that compounds with
      // every page visit.
      void client.removeChannel(channel);
    };
    // `spec.name` rather than `spec`: callers build the spec inline, so a new
    // object arrives every render while the subscription it describes is
    // identical. The name encodes the identity and the filters, which is
    // precisely what would need a new channel if it changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec?.name]);
}
