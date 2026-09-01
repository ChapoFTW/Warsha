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
      detectSessionInUrl: true,
    },
  });
}
