'use client';

import { createBrowserClient, createRecoveryClient } from './supabase-browser.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser's Supabase client.
 *
 * The same project, the same `auth.users`, the same RLS as Android and iOS.
 * An account created on a phone signs in here and an account created here
 * signs in on a phone, because there is nothing to synchronise: there is one
 * database and this is a second client of it.
 *
 * Only the publishable key is ever present. A service-role key in browser
 * JavaScript would hand every visitor the ability to read every row, and
 * `scripts/web-platform.test.mts` fails the build if the string ever appears
 * in web source.
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  client = createBrowserClient();
  return client;
}

/**
 * A throwaway client for one password recovery.
 *
 * Deliberately NOT memoised. The shared client above is a singleton because
 * every surface wants the same session; this one exists so that a recovery
 * credential has somewhere to live that is not shared with anything, and
 * caching it would slowly turn it into a second application session.
 *
 * It persists nothing, so when the page goes, the grant goes with it.
 */
export function recoverySupabase(): SupabaseClient {
  return createRecoveryClient();
}
