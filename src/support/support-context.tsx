import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/src/auth/auth-context';
import { environment } from '@/src/config/environment';
import { useLocalization } from '@/src/i18n/localization';
import { supportRepository } from './support-repository';
import type {
  HelpCenter,
  HelpSearchResult,
  HelpSearchSuggestions,
  OpenSupportCaseInput,
  SupportCaseSummary,
  SupportLocale,
  SupportSurface,
} from './support-types';

/**
 * WPS-019 support context.
 *
 * Account isolation follows the same pattern every other Warsha context uses:
 * a result that arrives after the account changed is discarded rather than
 * rendered, so a case list can never appear under the wrong account.
 */

type Value = {
  accountKey: string | null;
  locale: SupportLocale;
  helpCenter: HelpCenter | null;
  cases: SupportCaseSummary[];
  suggestions: HelpSearchSuggestions | null;
  loading: boolean;
  error: string | null;
  loadHelpCenter: (surface?: SupportSurface) => Promise<void>;
  reloadCases: () => Promise<void>;
  search: (query: string, surface?: SupportSurface) => Promise<HelpSearchResult>;
  openCase: (input: OpenSupportCaseInput) => Promise<{ caseId: string; duplicate: boolean }>;
  unresolvedCount: number;
};

const SupportContext = createContext<Value | null>(null);

export function SupportProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { language } = useLocalization();
  const locale: SupportLocale = language === 'ar' ? 'ar' : 'en';
  const accountKey = environment.dataMode === 'mock' ? 'mock-customer' : user?.id ?? null;

  const [helpCenter, setHelpCenter] = useState<HelpCenter | null>(null);
  const [cases, setCases] = useState<SupportCaseSummary[]>([]);
  const [suggestions, setSuggestions] = useState<HelpSearchSuggestions | null>(null);
  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const loadHelpCenter = useCallback(async (surface?: SupportSurface) => {
    if (!accountKey) { setHelpCenter(null); return; }
    const target = accountKey;
    const request = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const [center, hints] = await Promise.all([
        supportRepository.getHelpCenter(target, locale, surface),
        supportRepository.getSearchSuggestions(target, locale),
      ]);
      if (request !== generation.current || target !== accountKey) return;
      setHelpCenter(center);
      setSuggestions(hints);
    } catch (loadError) {
      if (request !== generation.current) return;
      setError(loadError instanceof Error ? loadError.message : 'load-failed');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [accountKey, locale]);

  const reloadCases = useCallback(async () => {
    if (!accountKey) { setCases([]); setLoadedAccount(null); return; }
    const target = accountKey;
    const request = ++generation.current;
    try {
      const list = await supportRepository.listMyCases(target);
      if (request !== generation.current || target !== accountKey) return;
      setCases(list);
      setLoadedAccount(target);
    } catch (loadError) {
      if (request !== generation.current) return;
      setError(loadError instanceof Error ? loadError.message : 'load-failed');
    }
  }, [accountKey]);

  // A change of account clears everything before anything is fetched, so no
  // frame ever renders one account's cases under another's session.
  useEffect(() => {
    generation.current += 1;
    setHelpCenter(null);
    setCases([]);
    setSuggestions(null);
    setLoadedAccount(null);
    setError(null);
    if (accountKey) void reloadCases();
  }, [accountKey, reloadCases]);

  const visibleCases = useMemo(
    () => (loadedAccount === accountKey ? cases : []),
    [accountKey, cases, loadedAccount],
  );

  const value = useMemo<Value>(() => ({
    accountKey,
    locale,
    helpCenter,
    cases: visibleCases,
    suggestions,
    loading,
    error,
    loadHelpCenter,
    reloadCases,
    unresolvedCount: visibleCases.filter(
      item => !['resolved', 'closed'].includes(item.status),
    ).length,
    search: async (query, surface) => {
      if (!accountKey) throw new Error('Authentication required');
      const result = await supportRepository.searchHelpArticles(accountKey, query, locale, surface);
      const hints = await supportRepository.getSearchSuggestions(accountKey, locale);
      setSuggestions(hints);
      return result;
    },
    openCase: async input => {
      if (!accountKey) throw new Error('Authentication required');
      const result = await supportRepository.openCase(accountKey, input);
      await reloadCases();
      return result;
    },
  }), [accountKey, error, helpCenter, loadHelpCenter, loading, locale, reloadCases, suggestions, visibleCases]);

  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

export function useSupport() {
  const context = useContext(SupportContext);
  if (!context) throw new Error('useSupport must be used inside SupportProvider');
  return context;
}
