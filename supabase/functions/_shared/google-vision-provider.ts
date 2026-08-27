/**
 * WPS-024 — Google Cloud Vision as ONE implementation of `OcrProvider`.
 *
 * Everything in Warsha that knows Google Cloud Vision exists is in this file.
 * Nothing imports it directly except the composition root in
 * `ocr-providers.ts`; business logic resolves a provider by the key the
 * database holds and never learns the vendor's name. Replacing Vision means
 * adding a sibling file and updating one registry row — no call site changes.
 *
 * What this module is NOT allowed to do, and does not:
 *
 *   * decide whether a document is genuine, altered, or belongs to the person;
 *   * decide criminal eligibility or worker approval;
 *   * return a confidence score to any caller outside the server;
 *   * extract or infer a gender or sex marker;
 *   * treat the governorate encoded in a National ID as an address;
 *   * retain the raw provider response.
 *
 * The last one is why `extractDocument` returns a narrow shape rather than the
 * provider payload: no object in this process holds the full response after the
 * function returns, so there is nothing for a later change to persist by
 * accident.
 */

import { readSecret, redact } from './provider-secrets.ts';
import { parseIdentityCandidates } from './ocr-identity-fields.ts';
import {
  clampProbability,
  describeExtraction,
  OCR_MAX_ATTEMPTS,
  OCR_TIMEOUT_MS,
  summariseConfidence,
  withTimeout,
  type IdentityCandidate,
  type OcrConfidence,
  type OcrDocumentText,
  type OcrMetadata,
  type OcrOutcome,
  type OcrProvider,
  type OcrRequest,
  type CredentialCheck,
} from './ocr-provider.ts';

export const VISION_PROVIDER_KEY = 'google_cloud_vision';
export const VISION_PROVIDER_VERSION = 'images:annotate/v1';

/** A JWT for the Vision API, signed with the service-account key. */
/**
 * What happened when we tried to get an access token.
 *
 * This used to be `string | null`, and null meant all of: no secret, malformed
 * secret, and Google refusing the assertion. Those are three different faults
 * with three different fixes, and collapsing them sent every one of them to an
 * operator as "no credential is configured" — including the case where a
 * perfectly good credential belonged to a project with the Vision API switched
 * off. Every caller still takes the manual path; only the diagnosis changes.
 */
type TokenAttempt =
  | { token: string; failure: null }
  | { token: null; failure: { reason: 'absent' | 'malformed' | 'rejected' | 'unreachable';
      status: number | null; code: string | null } };

/**
 * Which fields a service-account JSON actually has.
 *
 * Key NAMES only. "the secret is not JSON" and "the JSON has no private_key"
 * are different faults with different fixes, and an operator told only
 * "malformed" has to start printing the secret to find out which — which is
 * precisely the thing this file exists to make unnecessary.
 */
function credentialShape(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return 'not_an_object';
    const present = ['type', 'client_email', 'private_key', 'project_id', 'token_uri']
      .filter((key) => typeof parsed[key] === 'string' && (parsed[key] as string).length > 0);
    return present.length ? `missing_fields:has=${present.join('+')}` : 'missing_fields:has=none';
  } catch {
    return 'not_json';
  }
}

async function accessToken(signal: AbortSignal): Promise<TokenAttempt> {
  const raw = readSecret('visionServiceAccount');
  if (!raw) {
    return { token: null, failure: { reason: 'absent', status: null, code: null } };
  }

  let account: { client_email?: string; private_key?: string; token_uri?: string };
  try {
    account = JSON.parse(raw);
  } catch {
    // A malformed credential is an operations fault, not a worker's problem.
    return {
      token: null,
      failure: { reason: 'malformed', status: null, code: credentialShape(raw) },
    };
  }
  if (!account.client_email || !account.private_key) {
    return {
      token: null,
      failure: { reason: 'malformed', status: null, code: credentialShape(raw) },
    };
  }

  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };

  const b64url = (input: string) =>
    btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;

  const pem = account.private_key.replace(/\\n/g, '\n');
  const body = pem
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    'pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  );
  const assertion = `${unsigned}.${base64(signature).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

  const response = await fetch(tokenUri, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) {
    // Google's short error code only. `error_description` can quote parts of
    // the assertion, and this value reaches a console.
    let code: string | null = null;
    try {
      code = ((await response.json()) as { error?: string }).error ?? null;
    } catch { code = null; }
    return {
      token: null,
      failure: { reason: 'rejected', status: response.status, code },
    };
  }
  const json = await response.json() as { access_token?: string };
  const token = json.access_token ?? null;
  return token
    ? { token, failure: null }
    : { token: null, failure: { reason: 'rejected', status: response.status, code: 'no_access_token' } };
}

/**
 * Base64 in chunks.
 *
 * `String.fromCharCode(...bytes)` spreads every byte as an argument, and V8
 * throws `RangeError: Maximum call stack size exceeded` somewhere above about
 * 100,000 of them. The reduced review copy of an identity card is comfortably
 * larger than that, so the spread form would have failed on every real
 * photograph while passing every small test fixture.
 */
function base64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/** Whether a second attempt could plausibly succeed where the first did not. */
function worthRetrying(status: number | null): boolean {
  if (status === null) return true;              // transport failure
  if (status === 429) return true;               // rate limited
  return status >= 500 && status < 600;          // provider fault
}

type AnnotateResponse = {
  responses?: {
    fullTextAnnotation?: {
      text?: string;
      pages?: { confidence?: number; blocks?: { confidence?: number }[] }[];
    };
    error?: { message?: string };
  }[];
};

async function annotateOnce(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<{ status: number | null; payload: AnnotateResponse | null; safeReason: string | null }> {
  const attempt = await accessToken(signal);
  if (attempt.failure !== null) {
    // Absent or malformed is genuinely "no credential". Rejected is not: the
    // credential exists and the provider will not take it, which is an
    // operations fault with a different fix and a different place to look.
    const reason = attempt.failure.reason;
    return {
      status: attempt.failure.status,
      payload: null,
      safeReason: reason === 'absent' || reason === 'malformed'
        ? 'no_credential'
        : `credential_rejected:${attempt.failure.code ?? attempt.failure.status ?? 'unknown'}`,
    };
  }
  const token = attempt.token;

  let response: Response;
  try {
    response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image: { content: base64(bytes) },
          // DOCUMENT_TEXT_DETECTION rather than TEXT_DETECTION: an identity
          // card is a dense document, and the document model returns per-block
          // confidence, which the accuracy baseline needs.
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ar', 'en'] },
        }],
      }),
    });
  } catch (error) {
    return { status: null, payload: null, safeReason: redact(error).slice(0, 200) };
  }

  if (!response.ok) {
    return {
      status: response.status,
      payload: null,
      safeReason: `Provider returned ${response.status}`,
    };
  }
  return { status: response.status, payload: await response.json() as AnnotateResponse, safeReason: null };
}

export const googleVisionProvider: OcrProvider = {
  providerKey: VISION_PROVIDER_KEY,
  providerVersion: VISION_PROVIDER_VERSION,

  isConfigured(): boolean {
    return readSecret('visionServiceAccount') !== null;
  },

  /**
   * Exchange an auth token and nothing else.
   *
   * No image is submitted, so nothing is billed. This is the check that tells
   * an operator whether the key in the secret store is one Google will accept,
   * which is the question "is a secret present" never answered.
   */
  async verifyCredential(): Promise<CredentialCheck> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
    try {
      const attempt = await accessToken(controller.signal);
      if (attempt.failure === null) {
        return { usable: true, reason: 'ok', status: 200, code: null };
      }
      return {
        usable: false,
        reason: attempt.failure.reason,
        status: attempt.failure.status,
        code: attempt.failure.code,
      };
    } catch {
      return { usable: false, reason: 'unreachable', status: null, code: null };
    } finally {
      clearTimeout(timer);
    }
  },

  async extractDocument(request: OcrRequest): Promise<OcrOutcome<OcrDocumentText>> {
    if (!this.isConfigured()) return { kind: 'refused_no_credential' };

    const started = Date.now();
    let attempts = 0;
    let lastReason = 'The reading service did not respond.';

    while (attempts < OCR_MAX_ATTEMPTS) {
      attempts += 1;
      const attempt = await withTimeout(
        (signal) => annotateOnce(request.bytes, signal),
        OCR_TIMEOUT_MS,
      );

      if (attempt.kind === 'timed_out') {
        if (attempts < OCR_MAX_ATTEMPTS) continue;
        return {
          kind: 'timed_out',
          latencyMs: Date.now() - started,
          attempts,
          safeReason: 'The reading service took too long. Please enter the details yourself.',
        };
      }

      const { status, payload, safeReason } = attempt.value;

      if (safeReason === 'no_credential') return { kind: 'refused_no_credential' };
      // A credential the provider refuses is a provider error, and is retried
      // like one: a token endpoint can fail transiently, and a worker should
      // not be told the service is unconfigured because of a blip.
      if (safeReason?.startsWith('credential_rejected')) {
        lastReason = safeReason;
        if (attempts < OCR_MAX_ATTEMPTS) continue;
        return {
          kind: 'provider_error',
          latencyMs: Date.now() - started,
          attempts,
          safeReason: lastReason,
        };
      }

      if (payload === null) {
        lastReason = safeReason ?? lastReason;
        if (attempts < OCR_MAX_ATTEMPTS && worthRetrying(status)) continue;
        return { kind: 'provider_error', latencyMs: Date.now() - started, attempts, safeReason: lastReason };
      }

      const first = payload.responses?.[0];
      if (first?.error?.message) {
        // A per-image error is about these bytes. Retrying sends the same bytes
        // and gets the same answer, so it is reported rather than repeated.
        return {
          kind: 'provider_error',
          latencyMs: Date.now() - started,
          attempts,
          safeReason: redact(first.error.message).slice(0, 200),
        };
      }

      const text = first?.fullTextAnnotation?.text ?? '';
      const latencyMs = Date.now() - started;
      if (text.trim().length === 0) return { kind: 'no_text_found', latencyMs, attempts };

      const page = first?.fullTextAnnotation?.pages?.[0];
      return {
        kind: 'succeeded',
        latencyMs,
        attempts,
        value: {
          text,
          blocks: (page?.blocks ?? []).map((block) => ({
            text: '',
            confidence: clampProbability(block.confidence ?? 0.5),
          })),
          pageConfidence: clampProbability(page?.confidence ?? 0.5),
        },
      };
    }

    return {
      kind: 'provider_error',
      latencyMs: Date.now() - started,
      attempts,
      safeReason: lastReason,
    };
  },

  async extractIdentity(request: OcrRequest): Promise<OcrOutcome<IdentityCandidate[]>> {
    const document = await this.extractDocument(request);
    if (document.kind !== 'succeeded') return document;

    const candidates = parseIdentityCandidates(document.value.text, document.value.pageConfidence);
    if (candidates.length === 0) {
      return {
        kind: 'unreadable',
        latencyMs: document.latencyMs,
        attempts: document.attempts,
        // Actionable, and about the photograph rather than about the person.
        safeReason: 'We could not read the details. Try again in better light, filling the frame.',
      };
    }
    // The raw payload went out of scope in `extractDocument` and is never
    // persisted. That is the commitment in the OCR Usage Policy, and the shape
    // of these two functions is what keeps it.
    return {
      kind: 'succeeded',
      value: candidates,
      latencyMs: document.latencyMs,
      attempts: document.attempts,
    };
  },

  extractConfidence(candidates: IdentityCandidate[]): OcrConfidence {
    return summariseConfidence(candidates);
  },

  extractMetadata(request: OcrRequest, outcome: OcrOutcome<unknown>): OcrMetadata {
    const candidates = outcome.kind === 'succeeded' && Array.isArray(outcome.value)
      ? outcome.value as IdentityCandidate[]
      : [];
    return describeExtraction(this, request, outcome, summariseConfidence(candidates).mean);
  },
};
