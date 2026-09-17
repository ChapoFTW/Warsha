/**
 * The short wait before a Customer can choose a quote, as both platforms read it.
 *
 * `create_marketplace_request` sets `collection_not_before` two minutes after
 * the request, and `select_worker_quote` refuses before it. Since
 * 202609170002 the server moves it to "now" once everybody invited has
 * answered, so the wait is about two minutes, and often shorter. Native and
 * web both explain the wait while it lasts; this is the one rule for when that
 * is, so the two cannot disagree. It is plain TypeScript so the browser can
 * import it too.
 */
export type QuoteWindowRequest = {
  status: string;
  collectionNotBefore: string | null | undefined;
  expiresAt: string | null | undefined;
  selectedQuoteId?: string | null;
};

const COLLECTING = ['matching', 'collecting_quotes', 'customer_reviewing'];

/** True while the request is collecting quotes and choosing has not opened yet. */
export function quoteWindowStillClosed(request: QuoteWindowRequest, now = Date.now()): boolean {
  if (request.selectedQuoteId) return false;
  if (!COLLECTING.includes(request.status)) return false;
  const opens = Date.parse(request.collectionNotBefore ?? '');
  const expires = Date.parse(request.expiresAt ?? '');
  if (!Number.isFinite(opens) || !Number.isFinite(expires)) return false;
  return now < opens && now < expires;
}

/** Milliseconds until choosing opens, or null when it is not waiting to. */
export function quoteWindowOpensInMs(request: QuoteWindowRequest, now = Date.now()): number | null {
  if (!quoteWindowStillClosed(request, now)) return null;
  return Date.parse(request.collectionNotBefore ?? '') - now;
}
