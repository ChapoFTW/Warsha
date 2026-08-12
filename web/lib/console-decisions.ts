/**
 * The two governed decisions an operator can actually make about a person:
 * a vetting decision, and an enforcement action.
 *
 * ---------------------------------------------------------------------------
 * There is no "product role" to grant or revoke, and this is the finding
 * ---------------------------------------------------------------------------
 *
 * A search of every migration for a staff RPC that adds or removes Customer or
 * Worker product access returns nothing, and that is not an omission — it is
 * the design. Product access is *derived*, never stored as a grant:
 *
 *   Customer  every account is one. `select_my_account_role` calls
 *             `ensure_customer_profile()`, and `productRolesFor` in the client
 *             hard-codes `customer: true` for the same reason. There is no
 *             "remove customer" because the inverse of being a customer is not
 *             having an account.
 *
 *   Worker    `private.worker_capability_active(user)` is computed from
 *             `account_onboarding.worker_state` plus every activation gate. It
 *             is a verdict, not a column somebody sets.
 *
 * So the governed way to give a worker product access is `activate`, a *vetting
 * decision*; and the governed way to take it away is `suspend` or `reject`, or
 * an enforcement action. Both are here. Writing a `staff_grant_product_role`
 * would not be filling a gap — it would be adding a second, contradictory
 * source of truth beside a computed one, and the first disagreement would be a
 * worker who is authorised by one path and not the other.
 *
 * ---------------------------------------------------------------------------
 * What the decision RPC enforces
 * ---------------------------------------------------------------------------
 *
 * `staff_worker_vetting_decision(userId, decision, reasonCode, safeReason,
 * privateNote)`:
 *
 *   - **Capability follows the weight of the decision, not the shape of the
 *     call.** Approving and rejecting are different authorities. The map below
 *     is copied from the `case p_decision` in the migration.
 *   - A safe reason of 3..400 characters is always required. It is shown to the
 *     worker, which is why it is called *safe*.
 *   - `reject` and `suspend` additionally require a private note of at least
 *     ten characters — "a rejection with an empty note is a rejection nobody
 *     can review later".
 *   - `activate` and `reinstate` are refused unless every activation gate
 *     independently passes, and only they change discoverability.
 *   - The transition itself must be legal from the current state.
 *
 * Every one of those is re-checked server-side. The value of restating them
 * here is that an operator composes a decision the server will accept, and is
 * told which ones are unavailable *before* writing a reason.
 */

/** Decision → the capability the database demands for it. */
export const VETTING_DECISION_CAPABILITY: Readonly<Record<string, string>> = {
  start_identity_review: 'review_identity_verification',
  start_certificate_review: 'review_criminal_records',
  request_correction: 'review_worker_vetting',
  escalate_manual_review: 'review_worker_vetting',
  approve: 'review_criminal_records',
  activate: 'activate_worker',
  reject: 'reject_worker_application',
  suspend: 'reject_worker_application',
  reinstate: 'activate_worker',
};

export type VettingDecision = keyof typeof VETTING_DECISION_CAPABILITY;

/** Decision → the state it moves the account to. Copied from the same `case`. */
export const VETTING_DECISION_TARGET: Readonly<Record<string, string>> = {
  start_identity_review: 'identity_under_review',
  start_certificate_review: 'criminal_record_under_review',
  request_correction: 'correction_required',
  escalate_manual_review: 'manual_review',
  approve: 'approved',
  activate: 'active',
  reject: 'rejected',
  suspend: 'suspended',
  reinstate: 'active',
};

/**
 * Which target states a staff actor may reach from a given state.
 *
 * Transcribed from `private.worker_transition_allowed`, the `p_actor_kind =
 * 'staff'` branch. Offering a decision the state machine will refuse produces a
 * form somebody fills in and then loses, so the console offers only the moves
 * that exist.
 */
const STAFF_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  identity_submitted: ['identity_under_review', 'correction_required', 'manual_review'],
  identity_under_review: ['criminal_record_required', 'correction_required', 'manual_review', 'rejected'],
  criminal_record_submitted: ['criminal_record_under_review', 'correction_required', 'manual_review'],
  criminal_record_under_review: ['approved', 'correction_required', 'manual_review', 'rejected'],
  manual_review: ['approved', 'correction_required', 'rejected'],
  appeal_pending: ['approved', 'rejected', 'correction_required', 'manual_review'],
  approved: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['active', 'rejected'],
};

/**
 * The decisions that are legal from this state.
 *
 * `start_certificate_review` is the one that does not map cleanly: it targets
 * `criminal_record_under_review`, reachable only from
 * `criminal_record_submitted`. The table above is the authority, so it falls
 * out correctly rather than needing a special case.
 */
export function decisionsFrom(state: string | null | undefined): VettingDecision[] {
  const reachable = STAFF_TRANSITIONS[state ?? ''] ?? [];
  return (Object.keys(VETTING_DECISION_TARGET) as VettingDecision[])
    .filter((decision) => reachable.includes(VETTING_DECISION_TARGET[decision]));
}

/** `reject` and `suspend` require recorded evidence; nothing else does. */
export const ADVERSE_DECISIONS: ReadonlySet<string> = new Set(['reject', 'suspend']);

export function isAdverse(decision: string): boolean {
  return ADVERSE_DECISIONS.has(decision);
}

/** `p_safe_reason`: btrim 3..400. Shown to the worker. */
export const SAFE_REASON_MIN = 3;
export const SAFE_REASON_MAX = 400;

/** `p_private_note` for an adverse decision: at least 10 characters. */
export const EVIDENCE_MIN = 10;

export function safeReasonValid(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= SAFE_REASON_MIN && trimmed.length <= SAFE_REASON_MAX;
}

export function evidenceValid(note: string): boolean {
  return note.trim().length >= EVIDENCE_MIN;
}

/** `worker_onboarding_events.reason_code`: `^[a-z][a-z0-9_]{2,60}$`. */
const REASON_CODE = /^[a-z][a-z0-9_]{2,60}$/;

export function reasonCodeValid(code: string): boolean {
  return REASON_CODE.test(code.trim());
}

/**
 * Reason codes the console offers for a vetting decision.
 *
 * The column is a pattern check rather than an enumeration, so these are a
 * curated vocabulary rather than the server's list — chosen so two reviewers
 * describe the same situation the same way, which is what makes the events
 * table searchable later. A free-form code is still accepted, and validated
 * against the same pattern the column enforces.
 */
export const VETTING_REASON_CODES: readonly string[] = [
  'documents_complete', 'documents_unreadable', 'documents_incomplete',
  'identity_mismatch', 'certificate_valid', 'certificate_expired',
  'certificate_unverifiable', 'duplicate_account', 'policy_violation',
  'manual_review_required', 'appeal_upheld', 'appeal_rejected',
];

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

/**
 * `trust_enforcement_actions_type_check`, exactly.
 *
 * `restoration` is in the list because the table allows it, and it is the
 * backend's own inverse action. Nothing here invents an "unban" that the
 * schema does not model.
 */
export const ENFORCEMENT_ACTIONS: readonly string[] = [
  'warning', 'temporary_restriction', 'investigation', 'suspension',
  'permanent_ban', 'marketplace_removal', 'profile_hidden', 'payment_hold',
  'withdrawal_hold', 'communication_restriction', 'review_restriction',
  'restoration',
];

/** `trust_enforcement_actions_reason_check`, exactly. */
export const ENFORCEMENT_REASON_CODES: readonly string[] = [
  'fraud', 'impersonation', 'abusive_language', 'harassment', 'discrimination',
  'fake_profile', 'fake_documents', 'fake_certificates', 'spam', 'scam',
  'dangerous_behavior', 'off_platform_payment', 'off_platform_contact',
  'illegal_activity', 'inappropriate_content', 'copyright', 'privacy',
  'repeated_violations', 'appeal_upheld', 'appeal_overturned',
  'investigation_closed',
];

/**
 * A permanent ban is a different authority from every other action.
 *
 * `staff_record_enforcement_action` picks `approve_permanent_ban` for it and
 * `issue_temporary_restriction` for everything else, and a permanent ban
 * additionally consumes dual control.
 */
export function enforcementCapability(action: string): string {
  return action === 'permanent_ban' ? 'approve_permanent_ban' : 'issue_temporary_restriction';
}

/**
 * Two constraints a permanent ban carries that nothing else does:
 * it must cite an investigated report, and it may never expire.
 */
export function permanentBanRequiresReport(action: string): boolean {
  return action === 'permanent_ban';
}

export function mayCarryExpiry(action: string): boolean {
  return action !== 'permanent_ban';
}

/** `public_reason`: btrim 3..300. Shown to the person it is about. */
export const PUBLIC_REASON_MIN = 3;
export const PUBLIC_REASON_MAX = 300;

/** `evidence_summary`: btrim 3..2000. Never shown to them. */
export const EVIDENCE_SUMMARY_MIN = 3;
export const EVIDENCE_SUMMARY_MAX = 2000;

export function publicReasonValid(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length >= PUBLIC_REASON_MIN && trimmed.length <= PUBLIC_REASON_MAX;
}

export function evidenceSummaryValid(summary: string): boolean {
  const trimmed = summary.trim();
  return trimmed.length >= EVIDENCE_SUMMARY_MIN && trimmed.length <= EVIDENCE_SUMMARY_MAX;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type DecisionRefusal =
  | 'reauth'
  | 'dual-control'
  | 'capability'
  | 'gates-unsatisfied'
  | 'invalid-transition'
  | 'reason-required'
  | 'evidence-required'
  | 'report-required'
  | 'duplicate'
  | 'not-found'
  | 'unknown';

/**
 * Named from the `raise exception` lines themselves.
 *
 * The distinction that matters most is freshness versus capability: only one of
 * those is worth offering a re-authentication dialog for, and telling an
 * operator to re-authenticate when their role simply lacks the capability sends
 * them round a loop that cannot end.
 */
export function classifyDecisionError(message: string | undefined): DecisionRefusal {
  const text = message ?? '';
  if (/re-?authentication required/i.test(text)) return 'reauth';
  if (/second (person|approval)|dual control/i.test(text)) return 'dual-control';
  if (/activation gates are not satisfied/i.test(text)) return 'gates-unsatisfied';
  if (/invalid worker onboarding transition|unknown vetting decision/i.test(text)) {
    return 'invalid-transition';
  }
  if (/adverse decision requires recorded evidence/i.test(text)) return 'evidence-required';
  if (/a reason is required/i.test(text)) return 'reason-required';
  if (/report_id|no_automatic_ban/i.test(text)) return 'report-required';
  if (/idempotency_key|duplicate key/i.test(text)) return 'duplicate';
  if (/staff capability required|staff access required|permission denied/i.test(text)) {
    return 'capability';
  }
  if (/not found|unknown case|no onboarding record/i.test(text)) return 'not-found';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// The vetting case payload
// ---------------------------------------------------------------------------

/**
 * The pseudonymous reference the vetting surfaces are keyed by.
 *
 * The server computes it as
 * `encode(sha256(convert_to(user_id::text, 'UTF8')), 'hex')`, and this is the
 * same computation in the browser.
 *
 * It is a one-way function, which is the point: the *queue* hands out
 * references so a reviewer working through it cannot see who they are looking
 * at, and no amount of client code turns a reference back into a person. What
 * this does is the other direction — an operator who already holds a user id,
 * because they looked that account up by its exact identifier, can address the
 * vetting case belonging to it.
 *
 * That is not a way around the pseudonymity. `staff_worker_vetting_detail`
 * still demands `review_worker_vetting` and still writes an access record
 * naming the case that was opened.
 */
export async function subjectRefFor(userId: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export type VettingGate = { key: string; passed: boolean };

export type VettingDocument = {
  documentType: string;
  status: string;
  captureSource: string | null;
  pageSide: string | null;
};

export type VettingCaseDetail = {
  subjectRef: string;
  workerState: string | null;
  capabilityTier: string;
  gates: VettingGate[];
  provisionalGates: VettingGate[];
  documents: VettingDocument[];
  certificate: { status: string; issueDate: string | null } | null;
  extractionRuns: {
    documentType: string; outcome: string; providerVersion: string | null;
    fieldsExtracted: number | null; requestedAt: string | null;
  }[];
  fieldsConfirmedByWorker: boolean;
};

function gatesOf(value: unknown): VettingGate[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([key, passed]) => ({ key, passed: passed === true }));
}

export function parseVettingDetail(value: unknown): VettingCaseDetail | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.subjectRef !== 'string') return null;
  const certificate = raw.certificate && typeof raw.certificate === 'object'
    ? raw.certificate as Record<string, unknown>
    : null;
  return {
    subjectRef: raw.subjectRef,
    workerState: typeof raw.workerState === 'string' ? raw.workerState : null,
    capabilityTier: typeof raw.capabilityTier === 'string' ? raw.capabilityTier : 'none',
    gates: gatesOf(raw.gates),
    provisionalGates: gatesOf(raw.provisionalGates),
    documents: Array.isArray(raw.documents)
      ? raw.documents.flatMap((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        if (typeof row.documentType !== 'string') return [];
        return [{
          documentType: row.documentType,
          status: typeof row.status === 'string' ? row.status : '',
          captureSource: typeof row.captureSource === 'string' ? row.captureSource : null,
          pageSide: typeof row.pageSide === 'string' ? row.pageSide : null,
        }];
      })
      : [],
    certificate: certificate && typeof certificate.status === 'string'
      ? {
        status: certificate.status,
        issueDate: typeof certificate.issueDate === 'string' ? certificate.issueDate : null,
      }
      : null,
    // No confidence value and no extracted value: the function deliberately
    // returns neither, so a reviewer cannot defer to a machine's certainty.
    extractionRuns: Array.isArray(raw.extractionRuns)
      ? raw.extractionRuns.flatMap((entry) => {
        const row = (entry ?? {}) as Record<string, unknown>;
        if (typeof row.documentType !== 'string') return [];
        return [{
          documentType: row.documentType,
          outcome: typeof row.outcome === 'string' ? row.outcome : '',
          providerVersion: typeof row.providerVersion === 'string' ? row.providerVersion : null,
          fieldsExtracted: typeof row.fieldsExtracted === 'number' ? row.fieldsExtracted : null,
          requestedAt: typeof row.requestedAt === 'string' ? row.requestedAt : null,
        }];
      })
      : [],
    fieldsConfirmedByWorker: raw.fieldsConfirmedByWorker === true,
  };
}
