import { getLocales } from 'expo-localization';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, I18nManager, Platform } from 'react-native';

import {
  documentMetadataFor,
  languageFromPreferredLocales,
  resolveLanguage,
  supportedLanguages,
} from './language-preference';
import { accountLocalePrecedence } from '../preferences/preference-authority';
import { languageRepository } from './language-repository';
import { readLocalLanguage, writeLocalLanguage } from './language-storage';
import { Language, TranslationKey, translations } from './translations';
import { useAuth } from '../auth/auth-context';

type LocalizationValue = {
  language: Language;
  isRTL: boolean;
  explicit: boolean;
  t: (key: TranslationKey) => string;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  /** Called by `LanguageAccountSync`; not part of the public surface. */
  attachAccount: (mode: 'mock' | 'supabase', accountKey: string | null) => void;
};
const LocalizationContext = createContext<LocalizationValue | null>(null);

export function LocalizationProvider({ children }: PropsWithChildren) {
  const [{ language, explicit }, setPreference] = useState(() => {
    const stored = readLocalLanguage();
    return resolveLanguage({
      savedLanguage: stored.language,
      savedExplicitly: stored.explicit,
      preferredLocales: getLocales(),
    });
  });
  const explicitRef = useRef(explicit);
  explicitRef.current = explicit;
  const languageRef = useRef(language);
  languageRef.current = language;
  const [account, setAccount] = useState<{ mode: 'mock' | 'supabase'; key: string | null }>(
    { mode: 'mock', key: null },
  );
  const accountRef = useRef(account);
  accountRef.current = account;

  useEffect(() => {
    I18nManager.allowRTL(true);
  }, []);

  // Android can change its preferred language without restarting the app.
  // Re-read on foreground only while Warsha is following the platform; a
  // manual Warsha choice always wins.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' || explicitRef.current) return;
      const detected = languageFromPreferredLocales(getLocales());
      setPreference(current => current.language === detected
        ? current
        : { language: detected, explicit: false });
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const metadata = documentMetadataFor(language);
    document.documentElement.lang = metadata.language;
    document.documentElement.dir = metadata.direction;
    document.title = metadata.title;
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', metadata.manifest);
  }, [language]);

  const attachAccount = useCallback((mode: 'mock' | 'supabase', key: string | null) => {
    setAccount(current => (current.mode === mode && current.key === key ? current : { mode, key }));
  }, []);

  /*
   * One reconciliation per account.
   *
   * `profiles.preferred_language` was being written by the profile screen and
   * read by nobody, so an account that had chosen Arabic on a phone opened in
   * English on a second device. The rule is `accountLocalePrecedence` and it is
   * shared with the browser: an explicit choice on this device wins and is
   * pushed up; otherwise the account's language is adopted.
   */
  useEffect(() => {
    if (!account.key || account.mode === 'mock') return undefined;
    const target = account.key;
    let active = true;
    void languageRepository.get().then(accountLanguage => {
      if (!active || accountRef.current.key !== target) return;
      const outcome = accountLocalePrecedence({
        localLocale: languageRef.current,
        localIsExplicit: explicitRef.current,
        accountLocale: accountLanguage,
      });
      if (outcome.locale && outcome.locale !== languageRef.current) {
        setPreference({ language: outcome.locale, explicit: true });
        writeLocalLanguage(outcome.locale, true);
      }
      if (outcome.pushToAccount && outcome.locale) void languageRepository.set(outcome.locale);
    });
    return () => { active = false; };
  }, [account.key, account.mode]);

  const selectLanguage = useCallback((next: Language) => {
    // Device first and synchronously: the interface changes on this frame, and
    // the account is told afterwards rather than being waited for.
    setPreference({ language: next, explicit: true });
    writeLocalLanguage(next, true);
    void languageRepository.set(next);
  }, []);

  const value = useMemo(() => ({
    language,
    isRTL: language === 'ar',
    explicit,
    t: (key: TranslationKey) => translations[language][key],
    setLanguage: selectLanguage,
    toggleLanguage: () => selectLanguage(
      supportedLanguages[(supportedLanguages.indexOf(language) + 1) % supportedLanguages.length],
    ),
    attachAccount,
  }), [attachAccount, explicit, language, selectLanguage]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

/**
 * Pushes the active account down to the localization provider.
 *
 * Same shape as `AppearanceAccountSync`, and for the same reason: the
 * localization provider sits above `AuthProvider` so the first frame is in the
 * right language long before there is a session, which means it cannot call
 * `useAuth` from where it stands.
 */
export function LanguageAccountSync() {
  const { mode, user } = useAuth();
  const { attachAccount } = useLocalization();
  useEffect(() => {
    attachAccount(mode, user?.id ?? null);
  }, [attachAccount, mode, user?.id]);
  return null;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization must be used inside LocalizationProvider');
  return context;
}
