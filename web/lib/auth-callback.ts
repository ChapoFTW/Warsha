'use client';

import { readAuthCallbackParameters, type AuthCallbackKind } from '../../src/auth/email-confirmation.ts';

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
  /** True when Auth itself refused the link — expired, used, malformed. */
  refused: boolean;
};

/**
 * How this page was reached.
 *
 * A fresh page load carrying a recovery link answers `recovery`; a client-side
 * navigation to the same route answers `null`, which is correct — somebody who
 * types `/reset-password` into the address bar has no recovery grant and must
 * not be shown a password form as though they did.
 */
export function arrivedBy(): ArrivedBy {
  if (!snapshot) return { kind: null, refused: false };
  const parameters = readAuthCallbackParameters(snapshot);
  if (!parameters.kind) return { kind: null, refused: false };

  // Two ways a link is unusable, and they have to be treated alike: Auth said
  // no outright, or it said nothing at all and left no credential to exchange.
  const refused = Boolean(parameters.error)
    || (!parameters.code && (!parameters.accessToken || !parameters.refreshToken));

  return { kind: parameters.kind, refused };
}
