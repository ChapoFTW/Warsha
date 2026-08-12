'use client';

import { useEffect, useState } from 'react';

import {
  directionOf,
  isSupportedLanguage,
  languageStorageKey,
  type Locale,
} from './preferences.ts';

/** Fired when the language changes in this tab, where no storage event fires. */
export const languageChangeEvent = 'warsha:language-change';

/**
 * The application's language.
 *
 * The public site puts the language in the URL, because a marketing page has
 * to be indexable in both. The application does not: these pages are nobody's
 * search result, and a signed-in person's language is a property of them, not
 * of the address. So it is read from the same key the mobile client writes,
 * which is what makes a phone set to Arabic and a browser set to Arabic agree.
 *
 * The inline script in the layout has already applied `lang` and `dir` to the
 * document before first paint; this hook only tells React what was applied, so
 * there is no Arabic-after-English flash.
 */
export function useAppLocale(): Locale {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const read = (): Locale => {
      try {
        const stored = window.localStorage.getItem(languageStorageKey);
        if (isSupportedLanguage(stored)) return stored;
      } catch {
        // Storage refused; fall through to the document.
      }
      return document.documentElement.getAttribute('dir') === 'rtl' ? 'ar' : 'en';
    };

    const current = read();
    setLocale(current);
    document.documentElement.setAttribute('lang', current);
    document.documentElement.setAttribute('dir', directionOf(current));

    // Another tab changing the language should not leave this one stale.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== languageStorageKey) return;
      const next = read();
      setLocale(next);
      document.documentElement.setAttribute('lang', next);
      document.documentElement.setAttribute('dir', directionOf(next));
    };
    // Same tab: the unprefixed surfaces switch language without navigating, so
    // there is no storage event and no route change to react to. The switcher
    // announces the change instead.
    const onLocal = () => {
      const next = read();
      setLocale(next);
      document.documentElement.setAttribute('lang', next);
      document.documentElement.setAttribute('dir', directionOf(next));
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(languageChangeEvent, onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(languageChangeEvent, onLocal);
    };
  }, []);

  return locale;
}
