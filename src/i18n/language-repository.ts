import { environment } from '@/src/config/environment';
import { getSupabaseClient } from '@/src/lib/supabase';

import { isSupportedLanguage, type SupportedLanguage } from './language-preference';

/**
 * The account's language, as opposed to the device's.
 *
 * `profiles.preferred_language` has existed since the first migration and
 * `202608220002_french_preferred_language` widened it to all three languages.
 * It is granted directly to the row's owner - `grant update (display_name,
 * preferred_language) on public.profiles to authenticated` - so this needs no
 * RPC and no new schema.
 *
 * What it needed was a reader. Until now the only code that touched the column
 * was the mobile profile screen, which loaded it into a text field and saved it
 * back; the actual language control wrote to the device and told the account
 * nothing. This is the missing half.
 *
 * Deliberately modelled on `appearanceRepository`, down to the failure
 * behaviour: Mock mode has no account to follow, a failed read returns `null`
 * so the precedence rule falls through to the device, and a failed write is
 * silent because the local choice already applied and is what the person is
 * looking at.
 */
export const languageRepository = {
  async get(): Promise<SupportedLanguage | null> {
    if (environment.dataMode === 'mock') return null;
    try {
      const client = getSupabaseClient();
      const { data: auth } = await client.auth.getUser();
      const id = auth.user?.id;
      if (!id) return null;
      const { data, error } = await client
        .from('profiles')
        .select('preferred_language')
        .eq('id', id)
        .maybeSingle();
      if (error) return null;
      const stored = (data as { preferred_language?: unknown } | null)?.preferred_language;
      return isSupportedLanguage(stored) ? stored : null;
    } catch {
      return null;
    }
  },

  async set(language: SupportedLanguage): Promise<void> {
    if (environment.dataMode === 'mock') return;
    try {
      const client = getSupabaseClient();
      const { data: auth } = await client.auth.getUser();
      const id = auth.user?.id;
      if (!id) return;
      await client.from('profiles').update({ preferred_language: language }).eq('id', id);
    } catch {
      // Intentionally silent. The device write already succeeded and is the
      // authority for this device; carrying it to other devices is best effort.
    }
  },
};
