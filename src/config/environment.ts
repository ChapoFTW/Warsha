export type DataMode = 'mock' | 'supabase';
const requestedMode = process.env.EXPO_PUBLIC_DATA_MODE;
export const environment = {
  dataMode: requestedMode === 'supabase' ? 'supabase' : 'mock' as DataMode,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};
export function assertSupabaseConfiguration() {
  if (!environment.supabaseUrl || !environment.supabasePublishableKey) throw new Error('Supabase mode requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
}
