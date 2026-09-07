'use client';

import {
  callbackFailureFromParameters,
  readAuthCallbackParameters,
  safeAuthCallbackDiagnostic,
  type AuthCallbackFailure,
  type AuthCallbackKind,
} from '../../src/auth/email-confirmation.ts';

export type { AuthCallbackKind };

/**
 * What arrived in the address bar, captured before anything can erase it.
 *
 * Supabase Auth returns a confirmation or recovery link's credentials in the
 * URL — `#access_token=…` for the implicit flow, `?code=…` for PKCE — and
 * `detectSessionInUrl` consumes them and then calls `history.replaceState` to
 * take them back out. That is the right thing to do with a token in an address
 * bar, and it means anything that reads `window.location` from an effect reads
 * a URL with the evidence already removed.
 *
 * So the URL is snapshotted at module evaluation, which happens while the route
 * bundle loads: before hydration, before any effect, and before
 * `createClient()` is ever called. A page can then ask what kind of link
 * brought somebody here even though the link no longer exists.
 *
 * `readAuthCallbackParameters` is the mobile client's parser, imported rather
 * than reimplemented. It already handles both flows and both parameter
 * positions, and it is pinned by `scripts/password-recovery.test.mts`.
 *
 * Nothing here is logged. The snapshot is kept in module scope, is never put in
 * storage, and only its *classification* — a kind, and whether there was an
 * error — is exposed. The tokens themselves stay where supabase-js can find
 * them and nowhere else.
 */
const snapshot = typeof window === 'undefined' ? null : window.location.href;

export type ArrivedBy = {
  /** `recovery`, `signup`, or null when this was ordinary navigation. */
  kind: AuthCallbackKind | null;
  /** The shared product failure, or null while a supplied credential is exchanged. */
  failure: AuthCallbackFailure | null;
  /** Safe diagnostics: provider code only, never tokens or descriptions. */
  diagnostic?: ReturnType<typeof safeAuthCallbackDiagnostic>;
};

/**
 * How this page was reached.
 *
 * A fresh page load carrying a recovery link answers `recovery`; a client-side
 * navigation to the same route answers `null`, which is correct — somebody who
 * types `/reset-password` into the address bar has no recovery grant and must
 * not be shown a password form as though they did.
 */
/**
 * The credential the link carried, for the route that owns it to exchange.
 *
 * This exists because `detectSessionInUrl` is off. It used to be Auth's job to
 * consume the address bar during client initialisation, and the problem with
 * that was WHICH client it consumed into: the shared, persisted one, on every
 * route, including a recovery link that must never become an application
 * session.
 *
 * So the credential is read here and handed to a caller that has already
 * decided where it belongs. Nothing is logged, nothing is stored, and the
 * snapshot it comes from is the same module-scope one `arrivedBy` classifies.
 * A caller that does not ask never sees it.
 */
export function callbackCredential(): { accessToken: string; refreshToken: string } | null {
  if (!snapshot) return null;
  const parameters = readAuthCallbackParameters(snapshot);
  if (!parameters.accessToken || !parameters.refreshToken) return null;
  return { accessToken: parameters.accessToken, refreshToken: parameters.refreshToken };
}

export function arrivedBy(): ArrivedBy {
  if (!snapshot) return { kind: null, failure: null };
  const parameters = readAuthCallbackParameters(snapshot);
  if (!parameters.kind) return { kind: null, failure: null };

  const failure = callbackFailureFromParameters(parameters);
  const outcome = failure
    ? { status: 'failed' as const, failure }
    : { status: 'processing' as const };

  return {
    kind: parameters.kind,
    failure,
    diagnostic: safeAuthCallbackDiagnostic(parameters.kind, outcome, parameters),
  };
}
