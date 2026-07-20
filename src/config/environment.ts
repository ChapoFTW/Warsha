export type DataMode = 'mock' | 'supabase';
const requestedMode = process.env.EXPO_PUBLIC_DATA_MODE;
export const environment = {
  dataMode: requestedMode === 'supabase' ? 'supabase' : 'mock' as DataMode,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};
export const supabaseConfigurationMissing=environment.dataMode==='supabase'&&(!environment.supabaseUrl||!environment.supabaseAnonKey);
export function assertSupabaseConfiguration() {
  if (supabaseConfigurationMissing) throw new Error('Supabase mode requires EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
}
