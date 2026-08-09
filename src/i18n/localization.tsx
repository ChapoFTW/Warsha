import { getLocales } from 'expo-localization';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, I18nManager, Platform } from 'react-native';

import {
  documentMetadataFor,
  languageFromPreferredLocales,
  resolveLanguage,
} from './language-preference';
import { readLocalLanguage, writeLocalLanguage } from './language-storage';
import { Language, TranslationKey, translations } from './translations';

type LocalizationValue = {
  language: Language;
  isRTL: boolean;
  explicit: boolean;
  t: (key: TranslationKey) => string;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
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

  const selectLanguage = useCallback((next: Language) => {
    setPreference({ language: next, explicit: true });
    writeLocalLanguage(next, true);
  }, []);

  const value = useMemo(() => ({
    language,
    isRTL: language === 'ar',
    explicit,
    t: (key: TranslationKey) => translations[language][key],
    setLanguage: selectLanguage,
    toggleLanguage: () => selectLanguage(language === 'en' ? 'ar' : 'en'),
  }), [explicit, language, selectLanguage]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization must be used inside LocalizationProvider');
  return context;
}
