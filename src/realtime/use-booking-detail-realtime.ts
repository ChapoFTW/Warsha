import { useEffect, useRef } from 'react';

import { realtimeService } from './realtime-service';

export function useBookingDetailRealtime(bookingId: string | undefined, refresh: () => Promise<unknown>) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!bookingId) return;
    let pending = false;
    const reconcile = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => { pending = false; void refreshRef.current(); });
    };
    return realtimeService.bookingDetail(bookingId, reconcile, (status) => {
      if (status === 'connected') reconcile();
    });
  }, [bookingId]);
}
