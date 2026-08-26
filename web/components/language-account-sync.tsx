'use client';

import { useEffect, useRef } from 'react';

import { useSession } from '@/components/session-provider';
import { useWarshaPreferences } from '@/lib/preferences-context';
import {
  accountLocalePrecedence,
  isLocale,
  languageExplicitKey,
  languageStorageKey,
  type Locale,
} from '@/lib/preferences';
import { supabase } from '@/lib/supabase';

/**
 * The account's language, applied to this browser.
 *
 * `profiles.preferred_language` has existed since the first migration, accepts
 * all three languages, and is directly updatable by the account that owns the
 * row. Nothing read it. A person who chose Arabic on their phone opened the
 * website in English, and the website never told the account anything either -
 * so the column was a preference the product stored and then ignored.
 *
 * The rule is `accountLocalePrecedence`, shared verbatim with the mobile
 * client: an explicit choice made in *this* browser wins and is pushed up;
 * otherwise the account's language is adopted. It runs once per account, after
 * the session resolves, and never fights a choice already on screen.
 *
 * It renders nothing. It sits inside `SessionProvider` because it needs the
 * session, and inside `WarshaPreferencesProvider` because it needs the store -
 * the same reason `LanguageAccountSync` on native lives where it does.
 */
export function LanguageAccountSync() {
  const { session } = useSession();
  const { locale, setLocale } = useWarshaPreferences();
  const localeRef = useRef<Locale>(locale);
  localeRef.current = locale;
  const reconciled = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId || reconciled.current === userId) return;
    reconciled.current = userId;
    let active = true;

    void (async () => {
      let accountLocale: Locale | null = null;
      try {
        const { data, error } = await supabase()
          .from('profiles')
          .select('preferred_language')
          .eq('id', userId)
          .maybeSingle();
        if (!error) {
          const stored = (data as { preferred_language?: unknown } | null)?.preferred_language;
          accountLocale = isLocale(stored) ? stored : null;
        }
      } catch {
        // An unreadable account preference is not an error worth showing. The
        // device's own value stands, which is what is already on screen.
      }
      if (!active) return;

      let explicit = false;
      try {
        explicit = window.localStorage.getItem(languageExplicitKey) === 'true'
          && isLocale(window.localStorage.getItem(languageStorageKey));
      } catch {
        explicit = false;
      }

      const outcome = accountLocalePrecedence({
        localLocale: localeRef.current,
        localIsExplicit: explicit,
        accountLocale,
      });
      if (outcome.locale && outcome.locale !== localeRef.current) {
        setLocale(outcome.locale);
      }
      if (outcome.pushToAccount && outcome.locale) {
        try {
          await supabase().from('profiles')
            .update({ preferred_language: outcome.locale })
            .eq('id', userId);
        } catch {
          // Best effort, exactly as on native: the device write already applied.
        }
      }
    })();

    return () => { active = false; };
  }, [session?.user.id, setLocale]);

  return null;
}
