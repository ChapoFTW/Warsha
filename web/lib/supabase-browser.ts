import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { createBoundedFetch, resolveRequestTimeouts } from '../../src/data/request-policy.ts';

/**
 * Configuration is read once, loudly.
 *
 * A missing URL or key produces a thrown error naming which variable is
 * absent, rather than a client that silently fails every request and a sign-in
 * screen that says "something went wrong". The mobile client makes the same
 * choice in `assertSupabaseConfiguration`.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not configured. The web client cannot reach Warsha without it.`,
    );
  }
  return value;
}

export function createBrowserClient(): SupabaseClient {
  const url = required(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const key = required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return createClient(url, key, {
    // The same bounded fetch the mobile client uses, from the same module. A
    // browser tab that stalls mid-request has exactly the mobile problem: a
    // promise that never settles and a control that never stops spinning.
    global: {
      fetch: createBoundedFetch({
        timeouts: resolveRequestTimeouts(process.env as Record<string, string | undefined>),
      }),
    },
    auth: {
      // The session lives in this tab's storage and is refreshed in the
      // background, which is what makes a reload land on the same account
      // rather than the sign-in page.
      persistSession: true,
      autoRefreshToken: true,
      // Warsha's customer confirmation links are PKCE; the mobile client uses
      // the same flow, so one Supabase Auth configuration serves both.
      flowType: 'pkce',
      /*
       * OFF, and this is a security boundary rather than a preference.
       *
       * `detectSessionInUrl` consumes ANY credential in the address bar during
       * client initialisation and writes it to this origin's storage. A
       * password-recovery link carries exactly such a credential, so with this
       * on, clicking a reset link silently created a full application session:
       * a normal `authenticated` JWT that could read the account's own
       * profile, addresses, bookings and notifications through PostgREST
       * BEFORE any new password had been set. Reproduced against a live stack;
       * `scripts/password-recovery.test.mts` pins the finding.
       *
       * Routing did not contain it either. `/reset-password` was exempted from
       * `StartupGate`, which meant that route tolerated the session — every
       * OTHER route simply treated it as an ordinary signed-in visitor.
       *
       * So callbacks are now exchanged EXPLICITLY, by the route that owns them,
       * onto the client that route chooses:
       *
       *   /auth/confirm     the shared client. Confirming an address is meant
       *                     to sign you in, and it always did.
       *   /reset-password   `createRecoveryClient()` below, which persists
       *                     nothing. The credential lives in one closure, is
       *                     never written to storage, and no other route or tab
       *                     can reach it.
       */
      detectSessionInUrl: false,
    },
  });
}

/**
 * A client for one password recovery, and nothing else.
 *
 * The invariant this exists to hold: A PASSWORD-RECOVERY CREDENTIAL MAY BE USED
 * TO CHANGE THE PASSWORD. IT MUST NOT BECOME A GENERAL APPLICATION SESSION
 * BEFORE RECOVERY COMPLETES.
 *
 * `persistSession: false` is the whole mechanism, and it is authoritative
 * rather than advisory: there is no flag for client code to clear and no
 * storage entry to tamper with, because the credential is never written down.
 * A refresh loses it and lands on the invalid-link card, which is correct — the
 * link was single-use and has already been spent.
 *
 * `autoRefreshToken: false` keeps the grant as short-lived as it was issued.
 * Recovery is one form submission, not a session.
 */
export function createRecoveryClient(): SupabaseClient {
  const url = required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = required(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return createClient(url, key, {
    global: {
      fetch: createBoundedFetch({
        timeouts: resolveRequestTimeouts(process.env as Record<string, string | undefined>),
      }),
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}
