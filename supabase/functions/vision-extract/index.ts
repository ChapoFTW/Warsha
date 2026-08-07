/**
 * WPS-024 — vision-extract.
 *
 * The only path by which a Warsha identity document reaches an OCR provider.
 *
 * This function names no vendor. It asks the database which provider fills the
 * `identity_ocr` role, resolves that key against the provider registry, and
 * calls the `OcrProvider` interface. Swapping vendor is a registry update and a
 * new implementation file; nothing here changes. The function name is
 * historical and kept because renaming a deployed Edge Function breaks every
 * client that has not shipped yet.
 *
 * The shape of the flow, and why it is this shape:
 *
 *   1. The caller's JWT is verified and the caller is resolved to an account.
 *      The client never says who it is; the token does.
 *   2. The storage path is checked against that account. A worker can only
 *      extract from their own document, and the check is on the path prefix
 *      the storage policy already enforces — belt and braces, because this
 *      function holds the service role and the storage policy does not apply
 *      to it.
 *   3. The role is resolved to a provider, and the provider is checked for
 *      being enabled. Registry, feature flag and kill switch, all read from the
 *      database, none decided here.
 *   4. An audit row is opened BEFORE the provider is called, so a request that
 *      crashes mid-flight still leaves a trace.
 *   5. The document is fetched with the service role and sent.
 *   6. The audit row is closed with the outcome, latency, mean confidence and
 *      field count, and a health sample is recorded whatever happened.
 *   7. Candidates are written to `private.worker_identity_extractions`, and
 *      MASKED candidates are returned. Confidence never crosses the wire.
 *
 * A failure at any step returns a reason the worker can act on and leaves
 * manual entry available. Extraction is a convenience; onboarding never
 * depends on it.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { readSecret } from '../_shared/provider-secrets.ts';
import { resolveOcrProvider } from '../_shared/ocr-providers.ts';
import type { IdentityCandidate, OcrRequest } from '../_shared/ocr-provider.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** The capability, not the vendor. */
const OCR_ROLE = 'identity_ocr';
const OCR_OPERATION = 'extract_identity';

const DOCUMENT_TYPES = new Set(['national_id_front', 'national_id_back']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/**
 * What a client is allowed to see.
 *
 * The National ID is masked to its last four everywhere it is shown, following
 * WPS-023. Confidence is dropped entirely: it is internal, it is never a
 * reason for a decision, and a number on screen invites somebody to treat it
 * as one.
 */
function toClientCandidate(candidate: IdentityCandidate) {
  const masked = candidate.fieldKey === 'national_id_number'
    ? `••••••••••${candidate.value.slice(-4)}`
    : candidate.value;
  return {
    fieldKey: candidate.fieldKey,
    value: masked,
    // The worker needs the full value to confirm it, and it is their own
    // document. What they do not get is a score to defer to.
    editableValue: candidate.value,
    requiresManualEntry: candidate.confidence < 0.55,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = readSecret('supabaseUrl');
  const serviceRole = readSecret('supabaseServiceRole');
  if (!url || !serviceRole) {
    return json({ available: false, reason: 'unavailable' }, 503);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return json({ error: 'Authentication required' }, 401);
  }

  // Two clients on purpose. The caller-scoped one resolves identity under the
  // caller's own token and RLS; the service-role one does the privileged work
  // after that identity is established. Using the service role to answer "who
  // is this" would answer "whoever you say".
  const asCaller = createClient(url, serviceRole, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const asService = createClient(url, serviceRole, { auth: { persistSession: false } });

  const { data: userData, error: userError } = await asCaller.auth.getUser();
  const userId = userData?.user?.id;
  if (userError || !userId) return json({ error: 'Authentication required' }, 401);

  let body: { storagePath?: string; documentType?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  const storagePath = typeof body.storagePath === 'string' ? body.storagePath : '';
  const documentType = typeof body.documentType === 'string' ? body.documentType : '';

  if (!DOCUMENT_TYPES.has(documentType)) {
    return json({ error: 'Unsupported document type' }, 400);
  }
  // The ownership check. The storage policy enforces this for a normal client;
  // this function holds the service role, so the policy does not apply to it
  // and the check has to be made explicitly.
  if (!storagePath.startsWith(`${userId}/`)) {
    return json({ error: 'A document must be stored under your own account path' }, 403);
  }

  // Which provider fills the role, and may it be called. Two separate answers:
  // a refusal still has to record WHICH provider was refused, or the audit
  // trail says a document was processed by nobody.
  const { data: providerKey } = await asService
    .schema('private').rpc('provider_for_role', { p_role: OCR_ROLE })
    .then((r) => ({ data: r.data as string | null }))
    .catch(() => ({ data: null }));
  const { data: enabled } = await asService
    .schema('private').rpc('provider_enabled_for_role', { p_role: OCR_ROLE })
    .then((r) => ({ data: r.data as boolean | null }))
    .catch(() => ({ data: null }));

  const provider = resolveOcrProvider(providerKey);
  if (!provider) {
    // The registry names a provider with no implementation, or none at all.
    // An operations fault; the worker gets the manual path and no blame.
    return json({
      available: false,
      outcome: 'refused_disabled',
      reason: 'Automatic reading is not available. Please enter the details yourself.',
    }, 200);
  }

  const { data: workerProfile } = await asService
    .from('provider_profiles').select('id').eq('user_id', userId).is('deleted_at', null)
    .maybeSingle();
  if (!workerProfile?.id) return json({ error: 'Worker profile not found' }, 403);

  const { data: file, error: downloadError } = await asService
    .storage.from('verification-documents').download(storagePath);
  if (downloadError || !file) {
    return json({ available: true, outcome: 'unreadable',
      reason: 'We could not open that file. Please capture it again.' }, 200);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentHash = await sha256Hex(bytes);

  const ocrRequest: OcrRequest = {
    bytes,
    documentType: documentType as OcrRequest['documentType'],
    documentHash,
  };

  // Opened before the call, so a crash still leaves a trace.
  const { data: requestId } = await asService.schema('private').rpc('open_ocr_request', {
    p_provider_id: workerProfile.id,
    p_document_type: documentType,
    p_document_hash: documentHash,
    p_provider_key: provider.providerKey,
    p_provider_version: provider.providerVersion,
  });

  const recordHealth = (
    outcomeKind: string,
    latencyMs: number | null,
    attempts: number,
    timedOut: boolean,
  ) => asService.schema('private').rpc('record_provider_health', {
    p_provider_key: provider.providerKey,
    p_operation: OCR_OPERATION,
    p_provider_version: provider.providerVersion,
    p_outcome: outcomeKind,
    p_latency_ms: latencyMs,
    p_attempts: attempts,
    p_timed_out: timedOut,
  }).then(() => undefined).catch(() => undefined);

  if (enabled !== true) {
    // Left as a refusal: the constraint on `ocr_requests` requires
    // `completed_at` to be null for a refusal, so this cannot be recorded as
    // a provider call that happened.
    await recordHealth('refused_disabled', null, 0, false);
    return json({
      available: false,
      outcome: 'refused_disabled',
      reason: 'Automatic reading is not available. Please enter the details yourself.',
    }, 200);
  }

  const outcome = await provider.extractIdentity(ocrRequest);
  const metadata = provider.extractMetadata(ocrRequest, outcome);

  if (outcome.kind === 'refused_no_credential') {
    await recordHealth('refused_no_credential', null, 0, false);
    return json({
      available: false,
      outcome: 'refused_no_credential',
      reason: 'Automatic reading is not available. Please enter the details yourself.',
    }, 200);
  }

  await recordHealth(outcome.kind, outcome.latencyMs, outcome.attempts, metadata.timedOut);

  const candidates: IdentityCandidate[] = outcome.kind === 'succeeded' ? outcome.value : [];
  const confidence = provider.extractConfidence(candidates);
  const safeReason = outcome.kind === 'unreadable' || outcome.kind === 'provider_error'
    || outcome.kind === 'timed_out'
    ? outcome.safeReason
    : null;

  await asService.schema('private').rpc('complete_ocr_request', {
    p_request_id: requestId,
    // `timed_out` is not a value `private.ocr_requests.outcome` accepts, and
    // should not be: from the audit's point of view a timeout is the provider
    // failing to answer. Health keeps the distinction; the audit keeps the fact.
    p_outcome: outcome.kind === 'timed_out' ? 'provider_error' : outcome.kind,
    p_latency_ms: outcome.latencyMs,
    p_mean_confidence: confidence.mean,
    p_fields_extracted: candidates.length,
    p_safe_failure_reason: safeReason,
  });

  if (outcome.kind !== 'succeeded') {
    return json({
      available: true,
      outcome: outcome.kind,
      reason: safeReason
        ?? 'We could not read the details. Please enter them yourself.',
    }, 200);
  }

  // Candidates are superseded rather than accumulated: a retake replaces the
  // previous attempt, so a worker cannot confirm a field extracted from a
  // photograph they already discarded.
  await asService.schema('private').from('worker_identity_extractions')
    .update({ is_current: false })
    .eq('provider_id', workerProfile.id)
    .eq('document_type', documentType);

  await asService.schema('private').from('worker_identity_extractions').insert(
    candidates.map((candidate) => ({
      provider_id: workerProfile.id,
      document_type: documentType,
      field_key: candidate.fieldKey,
      candidate_value: candidate.value,
      confidence: candidate.confidence,
      // WPS-024 requires every result to record the provider version, the
      // extraction timestamp, the confidence and the document hash. All four
      // come from `extractMetadata`, so no call site has to remember them.
      provider_key: metadata.providerKey,
      provider_version: metadata.providerVersion,
      extracted_at: metadata.extractedAt,
      document_hash: metadata.documentHash,
      ocr_request_id: requestId,
      is_current: true,
    })),
  );

  return json({
    available: true,
    outcome: 'succeeded',
    // The worker confirms every one of these before anything is submitted.
    candidates: candidates.map(toClientCandidate),
    confirmationRequired: true,
  });
});
