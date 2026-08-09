import {
  isSupportedLanguage,
  languageExplicitKey,
  languageStorageKey,
  type SupportedLanguage,
} from './language-preference';

export function readLocalLanguage(): { language: SupportedLanguage | null; explicit: boolean } {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { language: null, explicit: false };
    const stored = window.localStorage.getItem(languageStorageKey);
    const explicit = window.localStorage.getItem(languageExplicitKey) === 'true';
    return { language: isSupportedLanguage(stored) ? stored : null, explicit };
  } catch {
    return { language: null, explicit: false };
  }
}

export function writeLocalLanguage(language: SupportedLanguage, explicit: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(languageStorageKey, language);
    window.localStorage.setItem(languageExplicitKey, explicit ? 'true' : 'false');
  } catch {
    // Private-mode storage can fail. The in-memory preference remains valid.
  }
}
