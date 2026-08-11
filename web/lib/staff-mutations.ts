/**
 * Privileged staff mutations, on the authority WPS-017 already built.
 *
 * The audit that produced this file matters more than the file: **there is no
 * missing authority here, and no second role system was written.** The complete
 * governed surface already exists —
 *
 *   staff_grant_role(userId, roleKey, reason, idempotencyKey, expiresAt)
 *   staff_revoke_role(grantId, reason)
 *   get_staff_role_directory()
 *   get_staff_customer_overview(userId) / get_staff_worker_overview(providerId)
 *   staff_worker_vetting_detail(subjectRef) / staff_worker_vetting_decision(...)
 *   staff_record_enforcement_action(...)
 *   staff_request_dual_control(...) / staff_approve_dual_control(...)
 *
 * — all granted to `authenticated` and all gated by
 * `private.require_staff_capability`, which checks the capability, the platform
 * readiness, session revocation, and freshness in one place.
 *
 * Every guard below is *also* enforced server-side. Nothing here is the
 * security boundary; it exists so an operator is told before they compose an
 * action that the server would refuse, rather than after.
 */

/** `staff_grant_role` and `staff_revoke_role` both demand at least 3 characters. */
export const REASON_MIN = 3;

export function reasonValid(reason: string): boolean {
  return reason.trim().length >= REASON_MIN;
}

/** `p_idempotency_key` must be 8..200 characters. */
export const IDEMPOTENCY_MIN = 8;
export const IDEMPOTENCY_MAX = 200;

export function newIdempotencyKey(): string {
  const key = globalThis.crypto?.randomUUID?.()
    ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return key.slice(0, IDEMPOTENCY_MAX);
}

export function idempotencyValid(key: string): boolean {
  return key.length >= IDEMPOTENCY_MIN && key.length <= IDEMPOTENCY_MAX;
}

/**
 * Self-escalation, refused before it is attempted.
 *
 * `staff_grant_role` raises 42501 on `p_user_id = v_actor`, and the header
 * comment in the migration calls this the dual control for roles: never grant a
 * role to yourself. There is no approval queue for role grants and this file
 * does not invent one — the second person *is* the rule that somebody else must
 * do it.
 */
export function isSelfGrant(actorId: string | undefined, subjectId: string): boolean {
  return Boolean(actorId) && actorId === subjectId.trim();
}

/** A UUID, because every subject parameter here is one and a typo is a refusal. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value.trim());
}

export type GrantOutcome =
  | { kind: 'granted'; id: string }
  /** The idempotency key was seen before; the server did not act twice. */
  | { kind: 'duplicate'; id: string }
  | { kind: 'refused'; reason: GrantRefusal };

export type GrantRefusal =
  | 'self'
  | 'already-active'
  | 'unknown-role'
  | 'unknown-account'
  | 'reason-required'
  | 'reauth'
  | 'capability'
  | 'unknown';

/**
 * The server's refusal, named.
 *
 * These strings come from the `raise exception` lines in the migration. Mapping
 * them is what lets the console say "that role is already active" instead of
 * showing a Postgres message, and — more importantly — lets it tell a freshness
 * refusal apart from a capability refusal, because only one of those is worth
 * offering a re-authentication dialog for.
 */
export function classifyRefusal(message: string | undefined): GrantRefusal {
  const text = message ?? '';
  if (/cannot grant a role to their own account/i.test(text)) return 'self';
  if (/already active for this account/i.test(text)) return 'already-active';
  if (/unknown staff role/i.test(text)) return 'unknown-role';
  if (/reason is required/i.test(text)) return 'reason-required';
  if (/re-?authentication required/i.test(text)) return 'reauth';
  if (/staff capability required|staff access required/i.test(text)) return 'capability';
  if (/not found|violates foreign key/i.test(text)) return 'unknown-account';
  return 'unknown';
}

export function parseGrantResult(value: unknown): { id: string; duplicate: boolean } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string') return null;
  return { id: raw.id, duplicate: raw.duplicate === true };
}
