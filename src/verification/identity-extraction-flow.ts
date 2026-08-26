/**
 * Turning the extraction backend into something a worker can see.
 *
 * ## What already existed, and what did not
 *
 * Warsha's document-extraction *backend* was complete before this file: the
 * `vision-extract` Edge Function, the `OcrProvider` interface, the Google Cloud
 * Vision implementation, the Egyptian National ID parser, the audit trail in
 * `private.ocr_requests`, the candidate store in
 * `private.worker_identity_extractions`, the confirmed store in
 * `private.provider_verification_identities`, the provider registry, the
 * governed activation flow, the health telemetry and the published OCR Usage
 * Policy.
 *
 * What did not exist was a **caller**. `providerClients.extractIdentityFields`
 * was written and invoked by nothing, so no candidate was ever produced, so
 * `get_my_identity_candidates` always returned an empty list, so the prefill
 * effect in the verification screen was unreachable code. The feature was
 * implemented and unreachable at the same time — which is why human QA had
 * never seen it.
 *
 * This module is the missing half: the rules that decide *when* to ask, what
 * the worker is told while it happens, and what must remain true whatever the
 * answer is. Import-free, so the Node regression suite runs these rules rather
 * than a restatement of them, and so Android, iOS and any future surface share
 * one definition of the flow.
 *
 * ## The rule that outranks every other rule here
 *
 * **Extraction is assistive. It never decides anything.** It cannot approve a
 * worker, judge a document genuine, validate a certificate or fail a
 * verification. `extractionMayDecide()` returns `false` and is exported so a
 * test can assert the property directly rather than infer it from an absence.
 *
 * A failure to read a photograph is therefore *never* reported as a
 * verification failure. Manual entry is available in every phase, including
 * while a read is in flight.
 */

/** Every document Warsha asks a worker for. Extraction covers a subset. */
export const verificationDocumentTypes = [
  'national_id_front',
  'national_id_back',
  'selfie',
  'criminal_record',
  'skill_certificate',
] as const;
export type VerificationDocumentType = (typeof verificationDocumentTypes)[number];

/**
 * The documents extraction is offered for, and only these.
 *
 * The two sides of the National ID, because that is what the parser
 * (`ocr-identity-fields.ts`) understands and what the Edge Function's own
 * `DOCUMENT_TYPES` allows. A selfie has no text. The criminal-record extract
 * and the skill certificate are read by a human reviewer; Warsha asks for no
 * structured field from either, and inventing one because OCR *could* read it
 * would be collecting personal data the product does not use.
 */
export const extractableDocumentTypes = [
  'national_id_front',
  'national_id_back',
] as const;
export type ExtractableDocumentType = (typeof extractableDocumentTypes)[number];

export function isExtractableDocument(value: unknown): value is ExtractableDocumentType {
  return value === 'national_id_front' || value === 'national_id_back';
}

/**
 * The outcomes the Edge Function can return, verbatim.
 *
 * Restating them here would be a second vocabulary that drifts from the
 * server's the first time one is added, so this list is asserted against the
 * function's own source by the regression suite.
 */
export const extractionOutcomes = [
  'succeeded',
  'unreadable',
  'no_text_found',
  'provider_error',
  'timed_out',
  'refused_disabled',
  'refused_no_credential',
  'refused_rate_limited',
] as const;
export type ExtractionOutcome = (typeof extractionOutcomes)[number];

/**
 * What the worker is shown. Fewer states than the server has, on purpose.
 *
 * A worker can act on three facts: it is working, it worked, it did not work.
 * *Why* it did not work splits into two only where the two lead to different
 * actions — retaking the photograph (`unreadable`) versus not waiting for
 * something that is switched off (`unavailable`). "The provider returned 503"
 * and "no credential is configured" are operations facts; surfacing them
 * teaches a worker nothing they can use and invites them to think the problem
 * is theirs.
 */
export const extractionPhases = ['idle', 'reading', 'complete', 'unreadable', 'unavailable'] as const;
export type ExtractionPhase = (typeof extractionPhases)[number];

export function extractionPhaseFor(outcome: ExtractionOutcome | null | undefined): ExtractionPhase {
  switch (outcome) {
    case 'succeeded':
      return 'complete';
    // Both mean "this photograph did not yield the details". Retaking it is a
    // real thing to try, so they share the phase that says so.
    case 'unreadable':
    case 'no_text_found':
      return 'unreadable';
    // Nothing the worker did, and nothing retaking will change.
    case 'provider_error':
    case 'timed_out':
    case 'refused_disabled':
    case 'refused_no_credential':
    // A ceiling Warsha imposed to keep a paid API from being run up by a retry
    // button. The worker is told the same thing as for any other unavailable
    // state, because which internal limit they met is not something they can
    // act on and "you tried too many times" reads as an accusation.
    case 'refused_rate_limited':
      return 'unavailable';
    default:
      return 'idle';
  }
}

/** Translation keys, so no surface writes its own sentence for a phase. */
export const extractionPhaseCopyKey: Record<ExtractionPhase, string | null> = {
  idle: null,
  reading: 'identityExtractionReading',
  complete: 'identityExtractionComplete',
  unreadable: 'identityExtractionUnreadable',
  unavailable: 'identityExtractionUnavailable',
};

/**
 * Whether retaking the photograph is worth offering.
 *
 * Only where the photograph is plausibly the problem. Offering "try another
 * photo" when the provider is switched off asks somebody to keep photographing
 * their identity card against a wall.
 */
export function offersRetake(phase: ExtractionPhase): boolean {
  return phase === 'unreadable';
}

/** Manual entry is available in every phase, including while reading. */
export function manualEntryAvailable(_phase: ExtractionPhase): true {
  return true;
}

/**
 * Extraction never decides anything.
 *
 * Exported as a function rather than left implicit so the regression suite can
 * assert it, and so a future change that wanted extraction to gate progress
 * would have to delete this and explain why.
 */
export function extractionMayDecide(): false {
  return false;
}

/**
 * Client-side idempotency.
 *
 * OCR is a paid external call, and the two ways to make many of them are a
 * worker tapping a retry button and a screen re-running an effect. Both are
 * stopped here, by the content hash of the exact bytes that were uploaded:
 *
 *   * the same document version is never sent twice while it already has a
 *     result, however many times the screen mounts;
 *   * a read that is in flight is never started a second time;
 *   * an explicit retake produces new bytes and therefore a new hash, which is
 *     the one case where asking again is what the worker meant.
 *
 * The server has the same hash and the same audit row, so this is the cheap
 * outer guard rather than the authority.
 */
export type ExtractionAttempt = {
  documentType: ExtractableDocumentType;
  /** SHA-256 of the uploaded bytes, or the storage path when no hash is known. */
  documentKey: string;
  phase: ExtractionPhase;
};

export function shouldRequestExtraction(input: {
  documentType: unknown;
  documentKey: string | null | undefined;
  /** Whether the account's provider is switched on at all. */
  capabilityAvailable: boolean;
  /** Attempts already made in this session, newest first or any order. */
  attempts: readonly ExtractionAttempt[];
  /** Set when the worker explicitly asked to read the document again. */
  requestedByWorker?: boolean;
}): boolean {
  if (!isExtractableDocument(input.documentType)) return false;
  if (!input.documentKey) return false;
  // Not "the provider is broken" — "the provider is not switched on". Asking
  // anyway would spend a request to be told no.
  if (!input.capabilityAvailable) return false;

  const previous = input.attempts.find(
    (attempt) => attempt.documentType === input.documentType
      && attempt.documentKey === input.documentKey,
  );
  if (!previous) return true;
  // In flight: never two at once for one document version.
  if (previous.phase === 'reading') return false;
  // A worker who presses "read it again" on the same bytes gets one more go —
  // a transient provider fault is a real reason to retry the same photograph.
  // A success is not re-read, because the result is already on screen and
  // re-reading it would only spend money to produce the same candidates.
  if (previous.phase === 'complete') return false;
  return Boolean(input.requestedByWorker);
}

/** Record an attempt, replacing any earlier one for the same document version. */
export function withAttempt(
  attempts: readonly ExtractionAttempt[],
  attempt: ExtractionAttempt,
): ExtractionAttempt[] {
  return [
    attempt,
    ...attempts.filter((entry) => entry.documentType !== attempt.documentType
      || entry.documentKey !== attempt.documentKey),
  ].slice(0, 8);
}

/**
 * What a candidate is allowed to do to a form field.
 *
 * A candidate **suggests**; the worker confirms or corrects. So a candidate
 * never overwrites something the worker has already typed, and a candidate the
 * server marked as needing manual entry is not offered at all — a pre-filled
 * wrong identity number that somebody taps past is worse than an empty box that
 * makes them look at their card.
 *
 * The masked National ID is never a suggestion either: the server sends it
 * masked for display, and filling a form field with `••••••••••1234` would be
 * filling it with a mask.
 */
export function candidateFillsField(input: {
  candidateValue: string | null | undefined;
  masked: boolean;
  requiresManualEntry: boolean;
  currentValue: string;
}): boolean {
  if (!input.candidateValue) return false;
  if (input.masked) return false;
  if (input.requiresManualEntry) return false;
  return input.currentValue.trim().length === 0;
}

/**
 * The phase a screen should show, given what it knows.
 *
 * Kept as a function so "reading" cannot be left on screen by a component that
 * forgot to clear it, and so the mapping is testable without a renderer.
 */
export function visibleExtractionPhase(input: {
  inFlight: boolean;
  lastOutcome: ExtractionOutcome | null;
  capabilityAvailable: boolean;
}): ExtractionPhase {
  if (input.inFlight) return 'reading';
  if (!input.capabilityAvailable && input.lastOutcome === null) return 'idle';
  return extractionPhaseFor(input.lastOutcome);
}
