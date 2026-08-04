import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import { isAppearancePreference, type AppearancePreference } from './appearance-types';

/**
 * WPS-020 appearance preference synchronization.
 *
 * Mock mode has no server preference at all. That is not a stub — Mock is a
 * single device with no account to follow, so the local store IS the complete
 * answer, and returning `null` here makes the precedence rule pick it.
 *
 * A Supabase failure returns `null` (read) or resolves quietly (write). It
 * never writes into the Mock store, and it never reverts a choice already on
 * screen: the person tapped "Light", the app is light, and a server round trip
 * is not allowed to argue.
 */
export const appearanceRepository = {
  async get(): Promise<AppearancePreference | null> {
    if (environment.dataMode === 'mock') return null;
    try {
      const { data, error } = await getSupabaseClient().rpc('get_my_appearance_preference');
      if (error) return null;
      return isAppearancePreference(data) ? data : null;
    } catch {
      return null;
    }
  },

  async set(preference: AppearancePreference): Promise<void> {
    if (environment.dataMode === 'mock') return;
    try {
      await getSupabaseClient().rpc('set_my_appearance_preference', { p_appearance: preference });
    } catch {
      // Intentionally silent. The local write already succeeded and is the
      // authority for this device; cross-device sync is best effort.
    }
  },
};
