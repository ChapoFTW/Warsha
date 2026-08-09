export type DataMode = 'mock' | 'supabase';
export type SupabaseTarget = 'mock' | 'local' | 'hosted' | 'unconfigured';

const requestedMode = process.env.EXPO_PUBLIC_DATA_MODE;

export const environment = {
  dataMode: requestedMode === 'supabase' ? 'supabase' : 'mock' as DataMode,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

export const supabaseConfigurationMissing = environment.dataMode === 'supabase'
  && (!environment.supabaseUrl || !environment.supabaseAnonKey);

/**
 * WPS-017: the staff operations surface is inert unless a build explicitly asks
 * for it — the guard refuses to open it and the repository refuses every call.
 *
 * Be precise about what this does not do: Expo Router's file-based routing
 * bundles every route module regardless, so the operations code is still present
 * in a build that leaves this unset. It contains no secret and grants no access.
 *
 * This is defence in depth and never the authorization control: every
 * operational action is capability-checked on the server, whatever the client
 * believes.
 */
export const adminSurfaceEnabled = process.env.EXPO_PUBLIC_ADMIN_SURFACE === 'enabled';

export function classifySupabaseTarget(mode: DataMode, url?: string): SupabaseTarget {
  if (mode === 'mock') return 'mock';
  if (!url) return 'unconfigured';
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
    const privateIpv4 = Boolean(ipv4 && ipv4.every(part => part <= 255) && (
      ipv4[0] === 10
      || ipv4[0] === 127
      || ipv4[0] === 192 && ipv4[1] === 168
      || ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31
      || ipv4[0] === 169 && ipv4[1] === 254
    ));
    return host === 'localhost' || host === '::1' || host === 'host.docker.internal' || privateIpv4
      ? 'local'
      : 'hosted';
  } catch {
    return 'unconfigured';
  }
}

export const supabaseTarget = classifySupabaseTarget(environment.dataMode, environment.supabaseUrl);

export function assertSupabaseConfiguration() {
  if (supabaseConfigurationMissing) {
    throw new Error(
      'Supabase mode requires EXPO_PUBLIC_SUPABASE_URL and either '
      + 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
}
