import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { I18nManager } from 'react-native';
import { Language, TranslationKey, translations } from './translations';

type LocalizationValue = { language: Language; isRTL: boolean; t: (key: TranslationKey) => string; toggleLanguage: () => void };
const LocalizationContext = createContext<LocalizationValue | null>(null);

export function LocalizationProvider({ children }: PropsWithChildren) {
  const deviceLanguage = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  const [language, setLanguage] = useState<Language>(deviceLanguage);
  const value = useMemo(() => ({
    language,
    isRTL: language === 'ar',
    t: (key: TranslationKey) => translations[language][key],
    toggleLanguage: () => setLanguage((current) => current === 'en' ? 'ar' : 'en'),
  }), [language]);

  I18nManager.allowRTL(true);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization must be used inside LocalizationProvider');
  return context;
}
