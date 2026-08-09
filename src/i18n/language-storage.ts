import Storage from 'expo-sqlite/kv-store';

import {
  isSupportedLanguage,
  languageExplicitKey,
  languageStorageKey,
  type SupportedLanguage,
} from './language-preference';

export function readLocalLanguage(): { language: SupportedLanguage | null; explicit: boolean } {
  try {
    const stored = Storage.getItemSync(languageStorageKey);
    const explicit = Storage.getItemSync(languageExplicitKey) === 'true';
    return { language: isSupportedLanguage(stored) ? stored : null, explicit };
  } catch {
    return { language: null, explicit: false };
  }
}

export function writeLocalLanguage(language: SupportedLanguage, explicit: boolean): void {
  try {
    Storage.setItemSync(languageStorageKey, language);
    Storage.setItemSync(languageExplicitKey, explicit ? 'true' : 'false');
  } catch {
    // The active choice still applies. A storage failure only loses restart
    // persistence and must not block the language control.
  }
}
