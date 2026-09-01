/**
 * How long Warsha waits, and when it is safe to ask again.
 *
 * ## The defect this closes
 *
 * Neither Supabase client set a timeout. `fetch` has no default one, so a
 * connection that opened and then stalled — a phone that walked into a lift, a
 * captive portal that accepts the TCP handshake and answers nothing, a carrier
 * that black-holes the flow — left a promise pending for as long as the app
 * stayed open. Every screen that awaited it kept its spinner, and there was no
 * event that could ever end it. Not an error, not a retry, not a message: a
 * spinner, forever.
 *
 * That is a worse failure than an error. An error can say "try again"; an
 * infinite wait teaches somebody the app is broken and gives them nothing to
 * do about it.
 *
 * ## Why one global timeout would have been the wrong fix
 *
 * The obvious repair — a single number on both clients — breaks the two things
 * that legitimately take a long time. An identity photograph on a slow uplink
 * is a minute of real work, and the OCR Edge Function is allowed twenty seconds
 * per provider attempt and two attempts. A global fifteen-second bound would
 * cancel worker verification and photo attachment on exactly the connections
 * they most need to survive, and it would do it silently, and the worker would
 * conclude their documents were rejected.
 *
 * So requests are classified, and each class gets a bound that follows from
 * something real.
 *
 * ## Where the numbers come from
 *
 * They are conservative and each one is anchored to a fact, not chosen:
 *
 *   READ — bounded above by what the SERVER will do. PostgREST runs Warsha's
 *   reads under the `authenticated` role's `statement_timeout`; a query the
 *   database will itself abandon has no business being awaited far past that.
 *   The bound is that plus room for a slow last mile to deliver a response the
 *   server has already produced.
 *
 *   MUTATION — the same, with more headroom, because a write that is abandoned
 *   client-side may still have happened and the cost of giving up early is
 *   worse than the cost of waiting.
 *
 *   AUTH — the slow step is not Warsha. Sign-up and password recovery send an
 *   email inline, so the bound has to cover an SMTP round trip at the provider.
 *
 *   OCR — derived rather than picked: `OCR_TIMEOUT_MS` (20s) times
 *   `OCR_MAX_ATTEMPTS` (2) is what the Edge Function may spend before it gives
 *   up, so the client must not give up first. Anything shorter cancels a call
 *   Warsha has already paid for.
 *
 *   UPLOAD and PRIVACY EXPORT — minutes, because they legitimately are. An
 *   export assembles ten sections and writes a file; a photograph is megabytes
 *   over an uplink measured in tens of kilobits.
 *
 *   REALTIME — no bound at all. It is a WebSocket with its own heartbeat, and
 *   applying a request timeout to it would tear down a working subscription.
 *
 * Every one of them is overridable by environment variable, because the honest
 * position is that these are defensible starting points and the only way to
 * know the right values is a real degraded mobile network. Tuning them later is
 * a configuration change, not a code change.
 *
 * ## Retrying
 *
 * Only GET and HEAD are ever retried. Not "mostly", not "unless it looks
 * dangerous" — only those two.
 *
 * A timeout does not mean the request failed. It means Warsha stopped waiting,
 * and the server may have done the work anyway. Retrying a POST after a timeout
 * is how one tap becomes two bookings, two quotes, or two payment attempts.
 * Warsha has idempotency keys on some of those paths and not on all of them,
 * and a retry policy that is only safe where somebody remembered a key is not a
 * safe retry policy.
 *
 * A GET has no such problem: asking twice for the same rows costs a request.
 */

export type RequestClass =
  | 'read'
  | 'mutation'
  | 'auth'
  | 'upload'
  | 'ocr'
  | 'privacy_export'
  | 'server_operation'
  | 'realtime';

/** No bound. Only realtime gets this, and only because it is a socket. */
export const UNBOUNDED = 0;

/**
 * The defaults, in milliseconds.
 *
 * Read the module header before changing one: each is anchored to a server-side
 * limit or a physical constraint rather than to a feeling about what is fast.
 */
export const defaultRequestTimeouts: Record<RequestClass, number> = {
  // `statement_timeout` for `authenticated` on Supabase is 8s; 15s leaves seven
  // seconds for a slow last mile to deliver a response the server finished.
  read: 15_000,
  // A write may already have landed, so giving up early is the expensive
  // mistake. Still bounded, because "forever" is what this module exists to
  // remove.
  mutation: 25_000,
  // Sign-up and recovery send mail inline. The bound covers an SMTP round trip
  // at the provider, not Warsha's own work.
  auth: 30_000,
  // Megabytes over an Egyptian mobile uplink. Photographs are compressed before
  // they get here, which is what keeps this at two minutes rather than five.
  upload: 120_000,
  // OCR_TIMEOUT_MS (20s) x OCR_MAX_ATTEMPTS (2), plus the Edge Function's own
  // overhead. Cancelling before this throws away a call Warsha has paid for.
  ocr: 60_000,
  // Ten sections assembled, serialised and written to storage.
  privacy_export: 120_000,
  // Anything else behind an Edge Function.
  server_operation: 60_000,
  // A WebSocket with its own heartbeat. A request timeout would tear down a
  // working subscription.
  realtime: UNBOUNDED,
};

/**
 * Environment names, one per class, on both surfaces.
 *
 * Present so degraded-network QA can move a threshold on a real connection
 * without a build. Both prefixes are read because the same module is imported
 * by the Expo client and by Next.js, and each inlines only its own prefix.
 */
export const requestTimeoutEnvNames: Record<RequestClass, string> = {
  read: 'WARSHA_TIMEOUT_READ_MS',
  mutation: 'WARSHA_TIMEOUT_MUTATION_MS',
  auth: 'WARSHA_TIMEOUT_AUTH_MS',
  upload: 'WARSHA_TIMEOUT_UPLOAD_MS',
  ocr: 'WARSHA_TIMEOUT_OCR_MS',
  privacy_export: 'WARSHA_TIMEOUT_PRIVACY_EXPORT_MS',
  server_operation: 'WARSHA_TIMEOUT_SERVER_MS',
  realtime: 'WARSHA_TIMEOUT_REALTIME_MS',
};

/** A bound that is not a positive number, or is absurd, is ignored. */
function readOverride(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1_000 || value > 600_000) return null;
  return Math.trunc(value);
}

export function resolveRequestTimeouts(
  env: Record<string, string | undefined> = {},
): Record<RequestClass, number> {
  const resolved = { ...defaultRequestTimeouts };
  for (const [key, name] of Object.entries(requestTimeoutEnvNames) as [RequestClass, string][]) {
    const override = readOverride(env[`EXPO_PUBLIC_${name}`] ?? env[`NEXT_PUBLIC_${name}`]);
    if (override !== null) resolved[key] = override;
  }
  return resolved;
}

/**
 * Which class a request belongs to, from its URL and method alone.
 *
 * Classifying centrally rather than at every call site is the point: there are
 * several hundred queries in Warsha and none of them should have to remember a
 * timeout. The paths below are Supabase's own API surface, which is stable, and
 * the two Edge Functions that are genuinely slow are named explicitly.
 *
 * Anything unrecognised is a `read`, which is the tightest bound. An operation
 * that is wrongly bounded too tightly fails visibly and gets fixed; one bounded
 * too loosely goes back to spinning forever.
 */
export function classifyRequest(url: string, method: string = 'GET'): RequestClass {
  let path = url;
  try {
    path = new URL(url, 'http://warsha.invalid').pathname;
  } catch {
    // A relative or malformed URL is classified on its raw text, which is
    // enough for the prefixes below.
  }
  const verb = method.toUpperCase();

  if (path.includes('/realtime/v1')) return 'realtime';
  if (path.includes('/auth/v1')) return 'auth';

  if (path.includes('/functions/v1/')) {
    if (path.includes('/vision-extract')) return 'ocr';
    if (path.includes('/privacy-export')) return 'privacy_export';
    return 'server_operation';
  }

  if (path.includes('/storage/v1/')) {
    return verb === 'GET' || verb === 'HEAD' ? 'read' : 'upload';
  }

  if (path.includes('/rest/v1/')) {
    return verb === 'GET' || verb === 'HEAD' ? 'read' : 'mutation';
  }

  return 'read';
}

/**
 * How many times a request of this class may be attempted in total.
 *
 * One for everything that is not a plain read. See the header: a retried
 * mutation is a duplicated booking.
 */
export const maxAttempts = (requestClass: RequestClass, method: string): number =>
  (method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD')
    && (requestClass === 'read' || requestClass === 'server_operation')
    ? 2 : 1;

export type RequestOutcome =
  | { kind: 'response'; status: number }
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'aborted' };

/**
 * Whether to try again.
 *
 * `aborted` is never retryable and the distinction matters: it means the CALLER
 * cancelled — a screen was closed, a search box got another keystroke — and
 * retrying would resurrect work somebody has already moved on from.
 *
 * 408, 429 and 5xx are the server saying "not now". 4xx otherwise is the server
 * saying "not like that", and repeating it produces the same answer.
 */
export function shouldRetry(input: {
  requestClass: RequestClass;
  method: string;
  attempt: number;
  outcome: RequestOutcome;
}): boolean {
  if (input.attempt >= maxAttempts(input.requestClass, input.method)) return false;
  if (input.outcome.kind === 'aborted') return false;
  if (input.outcome.kind === 'timeout' || input.outcome.kind === 'network') return true;
  const { status } = input.outcome;
  return status === 408 || status === 429 || status >= 500;
}

/** A short, fixed backoff. Long enough to outlast a handover, short enough
 * that somebody watching a list does not think it has stopped. */
export function retryDelayMs(attempt: number): number {
  return Math.min(400 * 2 ** (attempt - 1), 2_000);
}

/**
 * The error a bounded request fails with.
 *
 * A distinct class rather than a generic `Error`, because "we stopped waiting"
 * and "the server said no" call for different words on screen and the caller
 * has to be able to tell them apart. `dataErrorKey` maps it to the offline copy
 * Warsha already has.
 */
export class RequestTimeoutError extends Error {
  readonly name = 'RequestTimeoutError';
  readonly requestClass: RequestClass;
  readonly timeoutMs: number;
  constructor(requestClass: RequestClass, timeoutMs: number) {
    // No URL in the message. It carries record identifiers, and this string
    // reaches logs and error reporters.
    super(`Warsha stopped waiting for a ${requestClass} request after ${timeoutMs}ms.`);
    this.requestClass = requestClass;
    this.timeoutMs = timeoutMs;
  }
}

export function isRequestTimeout(error: unknown): error is RequestTimeoutError {
  return error instanceof RequestTimeoutError
    || (typeof error === 'object' && error !== null
      && (error as { name?: unknown }).name === 'RequestTimeoutError');
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Wraps a `fetch` so every request through it is bounded and, where safe,
 * retried once.
 *
 * Given to `createClient` as `global.fetch`, which is why no call site changes:
 * every PostgREST query, every RPC, every storage operation and every Edge
 * Function call the Supabase client makes goes through here.
 *
 * A caller's own `AbortSignal` is honoured alongside the timeout. That is what
 * keeps a search-as-you-type box able to cancel its previous request: the two
 * signals are combined rather than one replacing the other, and a cancellation
 * is reported as a cancellation rather than as a timeout.
 */
export function createBoundedFetch(options: {
  fetch?: FetchLike;
  timeouts?: Record<RequestClass, number>;
  /** Injected in tests. Real code has no reason to pass this. */
  sleep?: (ms: number) => Promise<void>;
} = {}): FetchLike {
  const baseFetch: FetchLike = options.fetch
    ?? ((input, init) => globalThis.fetch(input as RequestInfo, init));
  const timeouts = options.timeouts ?? defaultRequestTimeouts;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async function boundedFetch(input, init) {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
        : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const requestClass = classifyRequest(url, method);
    const timeout = timeouts[requestClass];

    let attempt = 0;
    // Loops at most `maxAttempts`, which is 2 for reads and 1 for everything
    // else, so this cannot spin.
    for (;;) {
      attempt += 1;
      const controller = new AbortController();
      const callerSignal = init?.signal ?? null;
      const onCallerAbort = () => controller.abort(callerSignal?.reason);
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

      let timedOut = false;
      const timer = timeout > 0
        ? setTimeout(() => { timedOut = true; controller.abort(); }, timeout)
        : null;

      let outcome: RequestOutcome;
      try {
        const response = await baseFetch(input, { ...init, signal: controller.signal });
        outcome = { kind: 'response', status: response.status };
        if (!shouldRetry({ requestClass, method, attempt, outcome })) return response;
      } catch (error) {
        if (timedOut) outcome = { kind: 'timeout' };
        else if (callerSignal?.aborted) outcome = { kind: 'aborted' };
        else outcome = { kind: 'network' };

        if (!shouldRetry({ requestClass, method, attempt, outcome })) {
          if (outcome.kind === 'timeout') throw new RequestTimeoutError(requestClass, timeout);
          throw error;
        }
      } finally {
        if (timer) clearTimeout(timer);
        callerSignal?.removeEventListener('abort', onCallerAbort);
      }

      await sleep(retryDelayMs(attempt));
    }
  };
}
