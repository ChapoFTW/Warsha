import type { StaffSession } from './staff.ts';

/**
 * Fresh re-authentication for privileged staff actions.
 *
 * The design is worth stating plainly, because it is not the usual one and
 * getting it wrong produces a console that looks fine and refuses everything.
 *
 * Freshness is **not** server state that a call can set. `staff_recent_reauth`
 * reads `max(amr[].timestamp)` out of the signed access token and compares it
 * to `reauth_window_seconds` (900 by default). The `amr` array is written by
 * the identity provider when an authentication actually happens. A token
 * *refresh* carries the old timestamps forward; only a real sign-in or an MFA
 * verification writes a new one.
 *
 * So `public.staff_reauthenticate()` does not re-authenticate anybody. It
 * *verifies* that the token in hand is already fresh and MFA-satisfied, and
 * registers a session attestation. Called with a stale token it raises
 * `Re-authentication required` rather than offering a challenge.
 *
 * That makes the client sequence:
 *
 *   1. Perform a genuine authentication — `mfa.challengeAndVerify` where a
 *      factor is enrolled, otherwise `signInWithPassword` with the operator's
 *      own credential. Either returns a new access token with a new `amr`.
 *   2. Call `staff_reauthenticate()` to register the attestation.
 *   3. Retry the privileged call.
 *
 * Step 1 is the part that cannot be skipped, and the reason a "re-authenticate"
 * button that only calls the RPC would fail forever.
 */

/**
 * Capabilities whose `requires_reauth` column is true in the database.
 *
 * A hint for the interface, so an operator is asked to confirm who they are
 * *before* filling in a form rather than after submitting it. The database
 * checks the same flag on every call regardless of what this list says; a
 * capability wrongly missing here costs a worse moment, not access.
 */
export const REAUTH_CAPABILITIES: ReadonlySet<string> = new Set([
  'activate_worker', 'approve_configuration', 'approve_growth_campaign',
  'approve_permanent_ban', 'approve_referral_program', 'export_operational_report',
  'initiate_refund', 'manage_feature_flags', 'manage_kill_switches',
  'manage_legal_holds', 'manage_staff_roles', 'manage_subprocessors',
  'manage_vetting_policy', 'publish_legal_version', 'reject_worker_application',
  'review_criminal_records', 'view_contact_details',
]);

/**
 * Capabilities whose `dual_control` column is true.
 *
 * These need a second person. The console says so up front instead of letting
 * somebody compose a decision that cannot complete alone.
 */
export const DUAL_CONTROL_CAPABILITIES: ReadonlySet<string> = new Set([
  'approve_configuration', 'approve_growth_campaign', 'approve_permanent_ban',
  'approve_referral_program', 'initiate_refund', 'manage_legal_holds',
  'manage_staff_roles', 'manage_subprocessors', 'manage_vetting_policy',
  'publish_legal_version', 'reject_worker_application',
]);

export function needsReauth(capability: string): boolean {
  return REAUTH_CAPABILITIES.has(capability);
}

export function needsSecondPerson(capability: string): boolean {
  return DUAL_CONTROL_CAPABILITIES.has(capability);
}

export const DEFAULT_REAUTH_WINDOW_SECONDS = 900;

export function reauthWindow(session: StaffSession): number {
  return session.reauthWindowSeconds ?? DEFAULT_REAUTH_WINDOW_SECONDS;
}

/** Seconds of freshness left, or 0 once the window has closed. */
export function freshnessRemaining(session: StaffSession): number {
  const age = session.sessionFreshnessSeconds;
  if (typeof age !== 'number') return 0;
  return Math.max(0, reauthWindow(session) - age);
}

export type ReauthNeed =
  /** Nothing to do; the action may proceed. */
  | { kind: 'ready' }
  /** The account lacks the capability outright. Re-authenticating changes nothing. */
  | { kind: 'missing-capability'; capability: string }
  /** The session was revoked server-side. Only a new sign-in helps. */
  | { kind: 'revoked' }
  /** A second factor is required and this session does not have one. */
  | { kind: 'mfa'; provider: string | null }
  /** Authentication is genuine but stale. Re-entering the credential is enough. */
  | { kind: 'stale'; ageSeconds: number | null; windowSeconds: number };

/**
 * What stands between this session and this capability, named precisely.
 *
 * The order matters. A revoked session that is also stale must be told it was
 * revoked, because re-entering a password in place would not fix it.
 */
export function reauthNeedFor(session: StaffSession, capability: string): ReauthNeed {
  if (!session.isStaff || !session.capabilities.includes(capability)) {
    return { kind: 'missing-capability', capability };
  }
  if (session.sessionRevoked) return { kind: 'revoked' };
  if (!needsReauth(capability)) return { kind: 'ready' };
  if (session.mfaRequired && !session.mfaSatisfied) {
    return { kind: 'mfa', provider: session.mfaProvider ?? null };
  }
  if (session.reauthValid) return { kind: 'ready' };
  return {
    kind: 'stale',
    ageSeconds: session.sessionFreshnessSeconds ?? null,
    windowSeconds: reauthWindow(session),
  };
}

/**
 * Whether the server's own refusal was a freshness refusal.
 *
 * `require_staff_capability` raises 42501 for four different reasons with four
 * different messages. Only one of them is worth offering a re-authentication
 * dialog for; the others would send an operator round a loop that cannot end.
 */
export function isReauthRefusal(error: { message?: string } | null): boolean {
  return /re-?authentication required/i.test(error?.message ?? '');
}

export function isMfaRefusal(error: { message?: string } | null): boolean {
  return /multi-factor authentication is required/i.test(error?.message ?? '');
}
