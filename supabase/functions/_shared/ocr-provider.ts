/**
 * WPS-024 OCR provider contract.
 *
 * Warsha's business logic depends on THIS FILE and never on a vendor. The rule
 * is literal: no module outside `google-vision-provider.ts` may name Google,
 * and the regression suite asserts it.
 *
 * Why the contract is shaped this way
 * ----------------------------------
 * The four operations are separated because they fail and change for different
 * reasons, and collapsing them would couple things that should move
 * independently:
 *
 *   extractDocument()   — bytes in, recognised text out. The generic capability
 *                         every OCR vendor sells. Nothing about Egypt, nothing
 *                         about identity documents.
 *
 *   extractIdentity()   — recognised text in, candidate identity FIELDS out.
 *                         Most vendors do not do this at all, so the default
 *                         implementation is Warsha's own parser running on top
 *                         of extractDocument(). A vendor that does offer native
 *                         identity parsing (AWS Textract AnalyzeID, for one)
 *                         overrides it and the callers do not change.
 *
 *   extractConfidence() — how sure the provider was, summarised the same way
 *                         across vendors. Vendors report confidence on wildly
 *                         different scales and shapes; normalising here is what
 *                         makes one accuracy baseline comparable with the next.
 *
 *   extractMetadata()   — provider version, extraction timestamp, confidence
 *                         and document hash. WPS-024 requires every OCR result
 *                         to record all four, so it is a method on the contract
 *                         rather than something each call site remembers.
 *
 * What a provider is never allowed to decide
 * ------------------------------------------
 * Whether a document is genuine. Whether it belongs to the person holding it.
 * Whether somebody may work. Those are human judgements, and there is no field
 * in any type below that could carry one — which is deliberate, because a type
 * that cannot express a verdict cannot accidentally ship one.
 */

export type OcrDocumentType = 'national_id_front' | 'national_id_back' | 'criminal_record';

/** The four fields Warsha extracts. Adding a fifth is a WPS-level decision. */
export type IdentityFieldKey =
  | 'national_id_number'
  | 'legal_name_ar'
  | 'date_of_birth'
  | 'id_expiry_date';

export type IdentityCandidate = {
  fieldKey: IdentityFieldKey;
  /** The value the worker will be shown and asked to confirm or correct. */
  value: string;
  /**
   * Internal only, on a 0–1 scale regardless of what the vendor reports.
   * Never serialised to a device: a number on screen invites somebody to
   * treat it as a verdict, and it is not one.
   */
  confidence: number;
};

export type OcrTextBlock = { text: string; confidence: number };

export type OcrDocumentText = {
  text: string;
  blocks: OcrTextBlock[];
  /** 0–1. A provider that reports nothing usable returns 0.5, not 1. */
  pageConfidence: number;
};

/**
 * Outcomes, closed.
 *
 * `unreadable` and `provider_error` are distinct on purpose. The first is about
 * the photograph and the worker can fix it by taking another; the second is
 * about Warsha or the vendor and the worker can fix nothing. Telling somebody
 * to retake a photograph when the fault is a expired service account wastes
 * their time and teaches them the feature is broken.
 */
export type OcrOutcome<T> =
  | { kind: 'succeeded'; value: T; latencyMs: number; attempts: number }
  | { kind: 'no_text_found'; latencyMs: number; attempts: number }
  | { kind: 'unreadable'; latencyMs: number; attempts: number; safeReason: string }
  | { kind: 'provider_error'; latencyMs: number; attempts: number; safeReason: string }
  | { kind: 'timed_out'; latencyMs: number; attempts: number; safeReason: string }
  | { kind: 'refused_no_credential' };

/** The outcome kinds `private.ocr_requests.outcome` accepts. */
export type OcrOutcomeKind = OcrOutcome<unknown>['kind'];

export type OcrConfidence = {
  mean: number | null;
  min: number | null;
  max: number | null;
  perField: Partial<Record<IdentityFieldKey, number>>;
  /** Fixed buckets, so two runs months apart are directly comparable. */
  distribution: Record<'0.00-0.25' | '0.25-0.50' | '0.50-0.75' | '0.75-1.00', number>;
};

/** The four things WPS-024 requires every OCR result to record, plus timing. */
export type OcrMetadata = {
  providerKey: string;
  providerVersion: string;
  extractedAt: string;
  documentHash: string;
  meanConfidence: number | null;
  latencyMs: number | null;
  attempts: number;
  timedOut: boolean;
};

export type OcrRequest = {
  bytes: Uint8Array;
  documentType: OcrDocumentType;
  /** SHA-256 of the exact bytes, computed by the caller before any provider sees them. */
  documentHash: string;
};

export interface OcrProvider {
  readonly providerKey: string;
  readonly providerVersion: string;
  /** True when a credential is present. Never reveals what it is. */
  isConfigured(): boolean;
  extractDocument(request: OcrRequest): Promise<OcrOutcome<OcrDocumentText>>;
  extractIdentity(request: OcrRequest): Promise<OcrOutcome<IdentityCandidate[]>>;
  extractConfidence(candidates: IdentityCandidate[]): OcrConfidence;
  extractMetadata(request: OcrRequest, outcome: OcrOutcome<unknown>): OcrMetadata;
}

// ---------------------------------------------------------------------------
// Shared behaviour every implementation inherits
// ---------------------------------------------------------------------------

/**
 * How long an identity document may take before Warsha gives up.
 *
 * Twenty seconds. A worker is holding a phone waiting for this, and past about
 * that point they have concluded it is broken and started typing anyway — so
 * a longer timeout buys a result nobody is still looking at while holding a
 * connection open.
 */
export const OCR_TIMEOUT_MS = 20_000;

/**
 * One retry, and only for a fault that a retry can plausibly fix.
 *
 * A transport failure or a 5xx is worth a second attempt. A 4xx, a refusal and
 * an unreadable photograph are not: the same bytes will produce the same answer
 * and retrying only doubles the bill and the wait.
 */
export const OCR_MAX_ATTEMPTS = 2;

export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<{ kind: 'ok'; value: T } | { kind: 'timed_out' }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return { kind: 'ok', value: await work(controller.signal) };
  } catch (error) {
    if (controller.signal.aborted) return { kind: 'timed_out' };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Summarise confidence identically for every vendor.
 *
 * Shared rather than per-provider so that a change of vendor changes the
 * numbers because the OCR changed, not because the arithmetic did. A baseline
 * whose method moves with its subject measures nothing.
 */
export function summariseConfidence(candidates: IdentityCandidate[]): OcrConfidence {
  const distribution = {
    '0.00-0.25': 0,
    '0.25-0.50': 0,
    '0.50-0.75': 0,
    '0.75-1.00': 0,
  };
  if (candidates.length === 0) {
    return { mean: null, min: null, max: null, perField: {}, distribution };
  }

  const perField: Partial<Record<IdentityFieldKey, number>> = {};
  let total = 0;
  let min = 1;
  let max = 0;

  for (const candidate of candidates) {
    const value = clampProbability(candidate.confidence);
    perField[candidate.fieldKey] = value;
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;

    if (value < 0.25) distribution['0.00-0.25'] += 1;
    else if (value < 0.5) distribution['0.25-0.50'] += 1;
    else if (value < 0.75) distribution['0.50-0.75'] += 1;
    else distribution['0.75-1.00'] += 1;
  }

  return { mean: total / candidates.length, min, max, perField, distribution };
}

/**
 * A confidence is a probability or it is not a confidence.
 *
 * Vendors return -1 for "unknown", percentages, and occasionally values just
 * over 1 from floating-point drift. All three would corrupt a distribution
 * silently, so they are clamped at the boundary rather than downstream.
 */
export function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** The metadata WPS-024 requires, assembled the same way for every provider. */
export function describeExtraction(
  provider: Pick<OcrProvider, 'providerKey' | 'providerVersion'>,
  request: OcrRequest,
  outcome: OcrOutcome<unknown>,
  meanConfidence: number | null,
): OcrMetadata {
  const timing = outcome.kind === 'refused_no_credential'
    ? { latencyMs: null, attempts: 0 }
    : { latencyMs: outcome.latencyMs, attempts: outcome.attempts };
  return {
    providerKey: provider.providerKey,
    providerVersion: provider.providerVersion,
    extractedAt: new Date().toISOString(),
    documentHash: request.documentHash,
    meanConfidence,
    latencyMs: timing.latencyMs,
    attempts: timing.attempts,
    timedOut: outcome.kind === 'timed_out',
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const providers = new Map<string, OcrProvider>();

/**
 * Register an implementation under the key the database knows it by.
 *
 * The key MUST match `private.external_providers.provider_key`. That is what
 * makes a provider swap a database change plus a new file: the Edge Function
 * asks the registry which provider fills the `identity_ocr` role, resolves it
 * here, and never learns the vendor's name.
 */
export function registerOcrProvider(provider: OcrProvider): void {
  providers.set(provider.providerKey, provider);
}

export function resolveOcrProvider(providerKey: string | null | undefined): OcrProvider | null {
  if (!providerKey) return null;
  return providers.get(providerKey) ?? null;
}

export function registeredOcrProviderKeys(): string[] {
  return [...providers.keys()].sort();
}
