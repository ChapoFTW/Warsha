/**
 * Warsha's password policy, for the one place that cannot import it.
 *
 * ## Why this is duplicated, and how the duplication is kept honest
 *
 * `src/auth/password-policy.ts` is the authority. Every Warsha client reads it,
 * and `app/auth` shows its five requirements as a live checklist. An Edge
 * Function runs in Deno from `supabase/functions/`, does not share the app's
 * module graph, and no function in this repository imports from `src/` — so the
 * rule has to exist here too.
 *
 * A second copy of a rule is a rule that will drift, so it is not left to good
 * intentions: `scripts/worker-auth-password-contract.test.mts` runs both
 * implementations over the same corpus and fails if they ever disagree.
 *
 * ## What this fixes
 *
 * `worker-auth` accepted any password of six characters or more. It creates the
 * account with `admin.createUser`, which bypasses GoTrue's own
 * `password_min_length` entirely, so neither the platform setting nor the app's
 * checklist was actually enforcing anything on this path. Measured against
 * hosted Development: the app refuses `abc123`, and worker registration created
 * a real account with it and returned a session.
 *
 * ## Registration only
 *
 * This is deliberately NOT applied to sign-in. Accounts registered before this
 * existed may hold passwords that no longer satisfy the policy, and refusing
 * their sign-in would lock out real workers to enforce a rule retroactively.
 * Sign-in keeps the loose length bound it always had; registration is where a
 * new password is chosen and therefore where the policy belongs.
 */

/** Mirrors `PASSWORD_MIN_LENGTH` in src/auth/password-policy.ts. */
export const WORKER_PASSWORD_MIN_LENGTH = 8;

/**
 * Mirrors `PASSWORD_MAX_BYTES`. bcrypt, which GoTrue uses, silently truncates at
 * 72 bytes: a longer passphrase and its first 72 bytes are the same password.
 */
export const WORKER_PASSWORD_MAX_BYTES = 72;

/** Mirrors `SPECIAL_CHARACTER`: any non-alphanumeric, including non-Latin. */
const SPECIAL_CHARACTER = /[^A-Za-z0-9]/;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Whether a password satisfies Warsha's policy.
 *
 * The same five rules the app shows as a checklist, in the same order: length,
 * uppercase, lowercase, digit, symbol — plus the byte ceiling.
 */
export function workerPasswordMeetsPolicy(password: string): boolean {
  return byteLength(password) <= WORKER_PASSWORD_MAX_BYTES
    && password.length >= WORKER_PASSWORD_MIN_LENGTH
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && SPECIAL_CHARACTER.test(password);
}
