/**
 * How many open offers a worker may hold, as the clients see it.
 *
 * THE NUMBER IS NOT HERE. It lives in `app_settings` under
 * `marketplace.worker_open_offer_limit`, is read by
 * `private.worker_open_offer_limit()`, and reaches a client only as part of the
 * answer to `get_worker_open_offer_capacity`. That is the whole point of the
 * arrangement: raising the limit from ten to fifteen is a settings change, not
 * a release of two applications, and no client can be shipped believing a
 * different number from the one the database enforces.
 *
 * What lives here is the *shape* of that answer, the error code the database
 * raises when the limit is reached, and the parser that turns an untyped RPC
 * response into either. Both platforms import this, so the worker's screen on
 * Android and the worker's screen in a browser cannot disagree about what
 * "9 of 10" means.
 *
 * THE CLIENT IS NOT THE AUTHORITY. Everything here is display and courtesy.
 * `submit_worker_quote` counts open offers inside the transaction that inserts
 * the new one, under an advisory lock keyed on the worker, and refuses at the
 * limit whatever the screen happens to be showing. A stale count in a client
 * causes a worker to be told "no" one submission later than they expected; it
 * cannot cause an eleventh offer to exist.
 */

/**
 * The SQLSTATE `submit_worker_quote` raises at the limit.
 *
 * Matched on the code rather than the message. The message is a stable token
 * too, but a message is a sentence somebody will eventually improve, and a
 * client that pattern-matches prose breaks silently when they do.
 */
export const WORKER_OPEN_OFFER_LIMIT_CODE = 'WQ001';

/** The same fact as a token, for transports that lose the SQLSTATE. */
export const WORKER_OPEN_OFFER_LIMIT_TOKEN = 'worker_open_offer_limit_reached';

export type WorkerOfferCapacity = {
  /**
   * False for an account with no provider profile. Not an error — a customer
   * who lands on a worker surface should see nothing about capacity rather
   * than a failure.
   */
  applies: boolean;
  /**
   * The caller's own provider id, present only when `applies`. Used to filter a
   * realtime channel to this worker rather than binding an unfiltered table.
   */
  providerId: string | null;
  used: number;
  limit: number | null;
  remaining: number | null;
};

type ErrorLike = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };

/** Whether this failure is the offer limit, whatever transport it arrived over. */
export function isWorkerOpenOfferLimitError(reason: unknown): boolean {
  const error = reason as ErrorLike | null | undefined;
  if (!error || typeof error !== 'object') return false;
  if (error.code === WORKER_OPEN_OFFER_LIMIT_CODE) return true;
  // PostgREST puts the SQLSTATE in `code` and the raised message in `message`,
  // but an Edge Function or a retry wrapper may only forward one of them.
  return typeof error.message === 'string' && error.message.includes(WORKER_OPEN_OFFER_LIMIT_TOKEN);
}

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

/**
 * `get_worker_open_offer_capacity`'s answer, or `null` if it was not one.
 *
 * Returning `null` rather than a zeroed object is deliberate: "the server did
 * not tell us" and "you have used none of your ten" are different facts, and a
 * screen that renders the second when it means the first tells a worker at
 * capacity that they have room.
 */
export function parseWorkerOfferCapacity(value: unknown): WorkerOfferCapacity | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.applies !== true) {
    return raw.applies === false
      ? { applies: false, providerId: null, used: 0, limit: null, remaining: null }
      : null;
  }
  const used = finiteInteger(raw.used);
  const limit = finiteInteger(raw.limit);
  if (used === null || limit === null) return null;
  return {
    applies: true,
    providerId: typeof raw.providerId === 'string' ? raw.providerId : null,
    used,
    limit,
    // Recomputed rather than trusted, so a client can never render a negative
    // remainder if the server's shape changes.
    remaining: Math.max(0, limit - used),
  };
}

/** Whether the worker has no room for another offer right now. */
export function workerIsAtOfferCapacity(capacity: WorkerOfferCapacity | null): boolean {
  return capacity !== null && capacity.applies && capacity.remaining === 0;
}
