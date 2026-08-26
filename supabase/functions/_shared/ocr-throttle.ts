/**
 * Whether to spend a paid OCR request at all.
 *
 * ## The gap this closes
 *
 * `private.ocr_requests` has accepted the outcome `refused_rate_limited` since
 * the table was created, and nothing ever produced one. `open_ocr_request`
 * inserted unconditionally, so every tap of a retry button was a fresh billed
 * call to the provider, and a retried network timeout charged twice for the
 * same photograph. The schema anticipated this; the request path did not
 * implement it. This module is that implementation, and it needs no migration
 * because the column already permits the outcome.
 *
 * ## The three rules
 *
 * 1. **Reuse before recall.** The document hash identifies the exact bytes. If
 *    those bytes have already been read successfully, the candidates in
 *    `private.worker_identity_extractions` are still the answer, and reading
 *    them again would spend money to produce the same values. A *retake*
 *    produces different bytes and therefore a different hash, which is the one
 *    case where asking again is what the worker meant.
 * 2. **A bounded number of attempts per document version.** A photograph the
 *    provider cannot read is not going to become readable on the fifth try of
 *    the identical file. Retrying is allowed — transient provider faults are
 *    real — but not indefinitely.
 * 3. **An hourly ceiling per worker.** The backstop for anything the first two
 *    rules do not anticipate, including a client bug looping.
 *
 * A refusal is never a verification outcome and never blocks onboarding: the
 * caller reports it as "automatic reading is not available", and the worker
 * types their details in. That is the same path a worker takes when the
 * provider is switched off, which it is by default.
 *
 * Import-free and pure, so the Node regression suite runs these rules directly
 * — the Edge Function itself cannot be executed there.
 */

/** Attempts against one exact document version before Warsha stops trying. */
export const OCR_ATTEMPTS_PER_DOCUMENT = 4;

/** Provider calls per worker per hour, across every document. */
export const OCR_CALLS_PER_HOUR = 12;

export const OCR_RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Outcomes that mean the provider was never contacted.
 *
 * They must not count towards either limit: refusing somebody and then holding
 * the refusal against them would turn a switched-off provider into an
 * exhausted quota.
 */
export const OCR_NON_CALL_OUTCOMES = [
  'refused_no_credential',
  'refused_disabled',
  'refused_rate_limited',
] as const;

export function ocrOutcomeWasACall(outcome: string): boolean {
  return !(OCR_NON_CALL_OUTCOMES as readonly string[]).includes(outcome);
}

/** One prior row of `private.ocr_requests`, in the shape the function reads. */
export type OcrRequestRecord = {
  documentType: string;
  documentHash: string;
  outcome: string;
  /** ISO-8601, as PostgREST returns a `timestamptz`. */
  requestedAt: string;
};

export type OcrThrottleDecision =
  | { kind: 'call' }
  /** The identical bytes already produced candidates; serve those. */
  | { kind: 'reuse' }
  | { kind: 'refuse'; reason: 'attempts_exhausted' | 'rate_limited' };

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  // An unparseable timestamp is treated as "just now" rather than ignored: the
  // conservative reading is the one that counts it towards the limit.
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export function decideOcrRequest(input: {
  documentType: string;
  documentHash: string;
  /** Recent rows for this worker. Order does not matter. */
  recent: readonly OcrRequestRecord[];
  now: number;
}): OcrThrottleDecision {
  const sameDocument = input.recent.filter(
    (row) => row.documentType === input.documentType && row.documentHash === input.documentHash,
  );

  // 1. Reuse. Checked first and unconditionally: a successful read of these
  //    exact bytes is the answer whatever the limits say, and refusing it for
  //    rate would hide a result Warsha already holds.
  if (sameDocument.some((row) => row.outcome === 'succeeded')) return { kind: 'reuse' };

  // 2. Attempts against this document version.
  const attempts = sameDocument.filter((row) => ocrOutcomeWasACall(row.outcome)).length;
  if (attempts >= OCR_ATTEMPTS_PER_DOCUMENT) {
    return { kind: 'refuse', reason: 'attempts_exhausted' };
  }

  // 3. The hourly ceiling, across every document this worker has sent.
  const windowStart = input.now - OCR_RATE_WINDOW_MS;
  const recentCalls = input.recent.filter(
    (row) => ocrOutcomeWasACall(row.outcome) && timestamp(row.requestedAt) >= windowStart,
  ).length;
  if (recentCalls >= OCR_CALLS_PER_HOUR) {
    return { kind: 'refuse', reason: 'rate_limited' };
  }

  return { kind: 'call' };
}

/**
 * How far back the function needs to read.
 *
 * The hourly window plus a margin, so a clock difference between the database
 * and the function cannot let a call slip past the ceiling. Attempts against
 * one document are counted from the same rows; a document older than this is
 * one nobody is still retrying.
 */
export const OCR_HISTORY_WINDOW_MS = OCR_RATE_WINDOW_MS * 25;
