import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { environment, assertSupabaseConfiguration } from '@/src/config/environment';

let client: SupabaseClient | null = null;
export function getSupabaseClient() {
  if (client) return client;
  assertSupabaseConfiguration();
  client = createClient(environment.supabaseUrl!, environment.supabasePublishableKey!, {
    auth: { storage: globalThis.localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, lock: processLock },
  });
  return client;
}
